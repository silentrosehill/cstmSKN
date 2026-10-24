use crate::state::{AppState, AppStatus};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

pub(super) fn is_valid_game_dir(path: &str) -> bool {
    let path = Path::new(path);
    #[cfg(target_os = "windows")]
    {
        path.join("League of Legends.exe").is_file() && path.join("DATA/FINAL").is_dir()
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.join("LeagueofLegends.app").is_dir()
    }
}
/// Windows canonical paths start with `\\?\`; show and store the normal `C:\...` form.
pub(super) fn plain_path(path: &str) -> String {
    match path.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => rest.to_owned(),
        _ => path.to_owned(),
    }
}
fn resolve_game_path(raw: &str) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    let raw = Path::new(raw);
    let parent = if raw.is_file() || raw.extension().is_some_and(|v| v == "app") {
        raw.parent().unwrap_or(raw)
    } else {
        Path::new("")
    };
    for candidate in [
        raw.to_path_buf(),
        raw.join("Game"),
        raw.join("Contents/LoL/Game"),
        parent.to_path_buf(),
        parent.join("Game"),
    ] {
        if is_valid_game_dir(&candidate.to_string_lossy()) {
            return candidate
                .canonicalize()
                .ok()
                .map(|p| plain_path(&p.to_string_lossy()));
        }
    }
    None
}
fn preference(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("game-path.json"))
}
#[cfg(target_os = "windows")]
fn default_paths() -> Vec<String> {
    let mut paths = Vec::new();
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for key in [
            r"SOFTWARE\Riot Games\League of Legends",
            r"SOFTWARE\WOW6432Node\Riot Games\League of Legends",
        ] {
            if let Ok(key) = RegKey::predef(root).open_subkey(key) {
                for value in ["Path", "Location", "InstallLocation"] {
                    if let Ok(path) = key.get_value::<String, _>(value) {
                        paths.push(path);
                    }
                }
            }
        }
    }
    // Common installations, including secondary drives. No recursive drive scan.
    for drive in b'C'..=b'Z' {
        paths.push(format!("{}:/Riot Games/League of Legends", drive as char));
        paths.push(format!(
            "{}:/Program Files/Riot Games/League of Legends",
            drive as char
        ));
    }
    paths
}
#[cfg(not(target_os = "windows"))]
fn default_paths() -> Vec<String> {
    vec!["/Applications/League of Legends.app/Contents/LoL/Game".into()]
}
#[tauri::command]
pub fn detect_game_path(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Option<String>, String> {
    let saved = preference(&app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice::<String>(&b).ok());
    let found = saved
        .into_iter()
        .chain(default_paths())
        .find_map(|p| resolve_game_path(&p));
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.game_path = found.clone();
    s.status = if found.is_some() {
        AppStatus::GameDetected
    } else {
        AppStatus::GameNotFound
    };
    Ok(found)
}
#[tauri::command]
pub fn validate_game_path(path: String) -> Result<Option<String>, String> {
    Ok(resolve_game_path(&path))
}
#[tauri::command]
pub fn set_game_path(
    app: AppHandle,
    path: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let valid =
        resolve_game_path(&path).ok_or("Choose the League installation or its Game folder.")?;
    let file = preference(&app)?;
    std::fs::create_dir_all(file.parent().ok_or("Invalid preferences directory")?)
        .map_err(|e| e.to_string())?;
    std::fs::write(file, serde_json::to_vec(&valid).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.game_path = Some(valid);
    s.status = AppStatus::GameDetected;
    Ok(())
}
#[tauri::command]
pub fn get_game_path(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Option<String>, String> {
    Ok(state.lock().map_err(|e| e.to_string())?.game_path.clone())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_long_path_prefix_is_removed_for_drive_paths() {
        assert_eq!(
            plain_path(r"\\?\C:\Riot Games\League of Legends\Game"),
            r"C:\Riot Games\League of Legends\Game"
        );
        assert_eq!(plain_path(r"\\?\UNC\server\share"), r"\\?\UNC\server\share");
        assert_eq!(
            plain_path("/Applications/League of Legends.app"),
            "/Applications/League of Legends.app"
        );
    }
    #[test]
    fn accepts_root_game_folder_and_executable_and_rejects_random_folders() {
        let root = std::env::temp_dir().join(format!("cstm-path-{}", std::process::id()));
        let game = root.join("Game");
        std::fs::create_dir_all(game.join("DATA/FINAL")).unwrap();
        #[cfg(target_os = "windows")]
        let executable = {
            let exe = game.join("League of Legends.exe");
            std::fs::write(&exe, b"fixture").unwrap();
            exe
        };
        #[cfg(not(target_os = "windows"))]
        let executable = {
            let exe = game.join("LeagueofLegends.app");
            std::fs::create_dir_all(&exe).unwrap();
            exe
        };
        for path in [&root, &game, &executable] {
            assert!(resolve_game_path(&path.to_string_lossy()).is_some());
        }
        assert!(resolve_game_path(&game.join("missing").to_string_lossy()).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
