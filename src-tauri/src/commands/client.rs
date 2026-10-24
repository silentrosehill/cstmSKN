use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampSelectState {
    state: &'static str,
    champion_id: Option<u64>,
    locked: bool,
}

struct Connection {
    port: u16,
    password: String,
}

fn valid_connection(port: &str, password: &str) -> Option<Connection> {
    // Values are only used with a fixed loopback URL; no URL or shell execution
    // comes from the lockfile. Credentials never leave this native module.
    let port = port.parse::<u16>().ok().filter(|p| *p > 0)?;
    if password.is_empty()
        || !password
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ['-', '_', '+', '/', '='].contains(&c))
    {
        return None;
    }
    Some(Connection {
        port,
        password: password.into(),
    })
}

fn from_lockfile(text: &str) -> Option<Connection> {
    let parts: Vec<_> = text.trim().split(':').collect();
    if parts.len() != 5 || parts[4] != "https" || !parts[0].starts_with("LeagueClient") {
        return None;
    }
    valid_connection(parts[2], parts[3])
}

fn from_processes(text: &str) -> Option<Connection> {
    for line in text
        .lines()
        .filter(|line| line.contains("LeagueClientUx") && !line.contains("LeagueClientUx Helper"))
    {
        let args: Vec<_> = line.split_whitespace().map(|arg| arg.trim_matches('"')).collect();
        let port = args.iter().find_map(|a| a.strip_prefix("--app-port="));
        let password = args
            .iter()
            .find_map(|a| a.strip_prefix("--remoting-auth-token="));
        if let (Some(port), Some(password)) = (port, password) {
            if let Some(connection) = valid_connection(port, password) {
                return Some(connection);
            }
        }
    }
    None
}

fn connection(game: Option<&str>) -> Option<Connection> {
    let mut candidates = vec![std::path::PathBuf::from(
        "/Applications/League of Legends.app/Contents/LoL/lockfile",
    )];
    if let Some(parent) = game.and_then(|game| Path::new(game).parent()) {
        candidates.insert(0, parent.join("lockfile"));
        candidates.push(parent.join("LeagueClient.app/Contents/LoL/lockfile"));
    }
    for path in candidates {
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Some(connection) = from_lockfile(&text) {
                return Some(connection);
            }
        }
    }
    // Some current macOS clients do not create a lockfile. Read the running
    // client's own launch flags without exposing them to the webview or logs.
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("/bin/ps")
        .args(["-ax", "-o", "command="])
        .output()
        .ok()?;
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        Command::new("powershell.exe").creation_flags(0x08000000)
            .args(["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"])
            .output().ok()?
    };
    from_processes(&String::from_utf8_lossy(&output.stdout))
}

fn session_state(session: &Value) -> ChampSelectState {
    let cell = session.get("localPlayerCellId").and_then(Value::as_i64);
    let champion = cell
        .and_then(|cell| {
            session
                .get("myTeam")?
                .as_array()?
                .iter()
                .find(|player| player.get("cellId").and_then(Value::as_i64) == Some(cell))
        })
        .and_then(|player| player.get("championId"))
        .and_then(Value::as_u64)
        .filter(|id| *id > 0);
    let own_pick_completed = cell
        .map(|cell| {
            session
                .get("actions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_array)
                .flatten()
                .any(|action| {
                    action["actorCellId"].as_i64() == Some(cell)
                        && action["type"] == "pick"
                        && action["completed"] == true
                })
        })
        .unwrap_or(false);
    let no_pick_actions = session
        .get("actions")
        .and_then(Value::as_array)
        .map(|groups| {
            groups
                .iter()
                .filter_map(Value::as_array)
                .flatten()
                .all(|a| a["type"] != "pick")
        })
        .unwrap_or(false);
    let locked = champion.is_some()
        && (own_pick_completed
            || session["benchEnabled"] == true
            || session["timer"]["phase"] == "FINALIZATION"
            || no_pick_actions);
    ChampSelectState {
        state: "selecting",
        champion_id: champion,
        locked,
    }
}

#[tauri::command]
pub async fn get_champ_select(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<ChampSelectState, String> {
    let game = state
        .lock()
        .map_err(|_| "Client connection unavailable")?
        .game_path
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let empty = |state| ChampSelectState {
            state,
            champion_id: None,
            locked: false,
        };
        let Some(connection) = connection(game.as_deref()) else {
            return Ok(empty("offline"));
        };
        // Self-signed TLS is allowed only for this fixed local League endpoint.
        // -q ignores user curl configuration, redirects/proxies are disabled,
        // and auth is supplied over stdin instead of command-line arguments.
        #[cfg(target_os = "windows")]
        let curl = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\Windows".into())).join("System32/curl.exe");
        #[cfg(not(target_os = "windows"))]
        let curl = std::path::PathBuf::from("/usr/bin/curl");
        let mut command = Command::new(curl);
        #[cfg(target_os = "windows")]
        { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let mut child = command
            .args([
                "-q",
                "--silent",
                "--insecure",
                "--max-time",
                "2",
                "--noproxy",
                "*",
                "--proxy",
                "",
                "--config",
                "-",
                "--write-out",
                "\n%{http_code}",
                "--url",
                &format!(
                    "https://127.0.0.1:{}/lol-champ-select/v1/session",
                    connection.port
                ),
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Could not connect to League")?;
        if let Some(mut input) = child.stdin.take() {
            input
                .write_all(format!("user = \"riot:{}\"\n", connection.password).as_bytes())
                .map_err(|_| "Could not connect to League")?;
        }
        let output = child
            .wait_with_output()
            .map_err(|_| "Could not connect to League")?;
        if !output.status.success() {
            return Ok(empty("unavailable"));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let (body, code) = text.rsplit_once('\n').unwrap_or(("", ""));
        if code == "404" {
            return Ok(empty("connected"));
        }
        if code != "200" {
            return Ok(empty("unavailable"));
        }
        match serde_json::from_str::<Value>(body) {
            Ok(session) => Ok(session_state(&session)),
            Err(_) => Ok(empty("unavailable")),
        }
    })
    .await
    .map_err(|_| "Could not check League client")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn credentials_are_strictly_local_and_validated() {
        assert_eq!(
            from_lockfile("LeagueClient:123:4567:test_token:https")
                .unwrap()
                .port,
            4567
        );
        assert!(from_lockfile("Riot Client:123:4567:test:https").is_none());
        assert!(from_lockfile("LeagueClient:123:99999:test:https").is_none());
        assert!(from_lockfile("LeagueClient:123:4567:test\"\nurl = evil:https").is_none());
        assert!(from_lockfile("LeagueClient:123:4567:test:http").is_none());
        assert_eq!(
            from_processes(
                "/Applications/LeagueClientUx --app-port=4567 --remoting-auth-token=test_token"
            )
            .unwrap()
            .port,
            4567
        );
    }
    #[test]
    fn only_local_completed_picks_open_the_champion_and_trades_use_current_team() {
        let mut session = json!({"localPlayerCellId":0,"myTeam":[{"cellId":0,"championId":103},{"cellId":1,"championId":164}],"actions":[[{"actorCellId":1,"type":"pick","completed":true}],[{"actorCellId":0,"type":"pick","championId":103,"completed":false}]]});
        assert!(!session_state(&session).locked);
        session["actions"][1][0]["completed"] = json!(true);
        assert!(session_state(&session).locked);
        session["myTeam"][0]["championId"] = json!(164);
        assert_eq!(session_state(&session).champion_id, Some(164));
        assert!(!session_state(&json!({})).locked);
    }
    #[test]
    fn aram_rerolls_and_finalized_practice_selections_work() {
        let session = json!({"localPlayerCellId":0,"myTeam":[{"cellId":0,"championId":103}],"actions":[],"benchEnabled":true});
        assert!(session_state(&session).locked);
        assert!(session_state(&json!({"localPlayerCellId":0,"myTeam":[{"cellId":0,"championId":103}],"actions":[],"timer":{"phase":"FINALIZATION"}})).locked);
    }
}
