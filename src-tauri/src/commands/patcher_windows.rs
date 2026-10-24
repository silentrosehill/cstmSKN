//! Windows adapter: LeagueToolkit overlay builder + the separately licensed LTK host.
use crate::state::{AppState, PatcherStatus};
use camino::Utf8PathBuf;
use ltk_overlay::{EnabledMod, FantomeContent, OverlayBuilder};
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

struct Session {
    generation: u64,
    child: Child,
}
fn session() -> &'static Mutex<Option<Session>> {
    static SLOT: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}
fn setup() -> &'static Mutex<()> {
    static SETUP: Mutex<()> = Mutex::new(());
    &SETUP
}
fn base(app: &AppHandle) -> Result<PathBuf, String> {
    let p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn resources(app: &AppHandle) -> Result<PathBuf, String> {
    let packaged = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("ltk");
    if packaged.join("ltk_patcher_host.exe").is_file() {
        return Ok(packaged);
    }
    #[cfg(debug_assertions)]
    {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/windows"));
    }
    #[cfg(not(debug_assertions))]
    {
        Ok(packaged)
    }
}
fn log(path: &Path, message: &str) {
    static LOCK: Mutex<()> = Mutex::new(());
    let _lock = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}
fn update(state: &Arc<Mutex<AppState>>, generation: u64, status: PatcherStatus) {
    if let Ok(mut s) = state.lock() {
        if s.patcher_gen == generation
            && (!matches!(s.patcher_status, PatcherStatus::Error(_))
                || matches!(status, PatcherStatus::Error(_) | PatcherStatus::Idle))
        {
            s.patcher_status = status;
        }
    }
}
fn current(state: &Arc<Mutex<AppState>>, generation: u64) -> bool {
    state
        .lock()
        .map(|s| s.patcher_gen == generation)
        .unwrap_or(false)
}
fn stop_host() -> Result<(), String> {
    let mut slot = session().lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = slot.take() {
        if let Some(mut stdin) = session.child.stdin.take() {
            let _ = writeln!(stdin, "stop");
            let _ = stdin.flush();
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match session.child.try_wait() {
                Ok(Some(_)) => return Ok(()),
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                Ok(None) => {
                    session.child.kill().map_err(|e| e.to_string())?;
                    session.child.wait().map_err(|e| e.to_string())?;
                    return Ok(());
                }
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    Ok(())
}
fn utf8(path: &Path) -> Result<Utf8PathBuf, String> {
    Utf8PathBuf::from_path_buf(path.to_path_buf())
        .map_err(|_| "The installation path is not valid Unicode.".into())
}
fn package(path: &Path, staging: &Path, index: usize) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .ok_or("Invalid mod filename")?
        .to_string_lossy();
    if !name.to_lowercase().ends_with(".wad") && !name.to_lowercase().ends_with(".wad.client") {
        crate::archive::listing(path)?;
        return Ok(path.to_path_buf());
    }
    fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    let out = staging.join(format!("raw-{index}.fantome"));
    let mut zip = zip::ZipWriter::new(fs::File::create(&out).map_err(|e| e.to_string())?);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("META/info.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::json!({"Name": name, "Author": "Imported mod", "Version": "1.0"})
            .to_string()
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    zip.start_file(format!("WAD/{name}"), options)
        .map_err(|e| e.to_string())?;
    std::io::copy(
        &mut fs::File::open(path).map_err(|e| e.to_string())?,
        &mut zip,
    )
    .map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(out)
}
#[tauri::command]
pub fn apply_skin(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    zip_path: String,
) -> Result<String, String> {
    start(app, state.inner().clone(), vec![zip_path])
}
#[tauri::command]
pub fn apply_skins(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    zip_paths: Vec<String>,
) -> Result<String, String> {
    start(app, state.inner().clone(), zip_paths)
}
fn start(
    app: AppHandle,
    state: Arc<Mutex<AppState>>,
    paths: Vec<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No skins selected".into());
    }
    let resource = resources(&app)?;
    for name in ["ltk_patcher_host.exe", "ltk_patcher_dll.dll"] {
        if !resource.join(name).is_file() {
            return Err("LTK engine files are missing. Reinstall the Windows preview.".into());
        }
    }
    for path in &paths {
        if !Path::new(path).is_file() {
            return Err("A selected mod file is missing. Download or import it again.".into());
        }
    }
    let (game, generation) = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let game = s
            .game_path
            .clone()
            .ok_or("Choose your League installation first.")?;
        s.patcher_gen += 1;
        s.patcher_status = PatcherStatus::Importing;
        (game, s.patcher_gen)
    };
    let data = base(&app)?;
    let logfile = data.join("patcher.log");
    if fs::metadata(&logfile).is_ok_and(|m| m.len() > 512 * 1024) {
        let _ = fs::rename(&logfile, data.join("patcher.previous.log"));
    }
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let _setup = setup().lock().map_err(|e| e.to_string())?;
            if !current(&state, generation) {
                return Ok(());
            }
            stop_host()?;
            let overlay = data.join("overlay");
            let staging = data.join("installed");
            let mut mods = Vec::new();
            for (index, path) in paths.iter().enumerate() {
                if !current(&state, generation) {
                    return Ok(());
                }
                let path = package(Path::new(path), &staging, index)?;
                let provider =
                    FantomeContent::new(fs::File::open(&path).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?
                        .with_archive_path(utf8(&path)?);
                mods.push(EnabledMod {
                    id: format!(
                        "cstm-{index}-{}",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    content: Box::new(provider),
                    enabled_layers: None,
                });
            }
            update(&state, generation, PatcherStatus::BuildingOverlay);
            log(
                &logfile,
                "Building LeagueToolkit overlay. Game originals are read-only.",
            );
            let mut builder = OverlayBuilder::new(
                Utf8PathBuf::from(&game),
                utf8(&overlay)?,
                utf8(&data.join("ltk-state"))?,
            );
            builder.set_enabled_mods(mods);
            let built = builder.build().map_err(|e| format!("LTK overlay: {e}"))?;
            log(
                &logfile,
                &format!(
                    "Overlay ready: {} built, {} reused",
                    built.wads_built.len(),
                    built.wads_reused.len()
                ),
            );
            if !current(&state, generation) {
                return Ok(());
            }
            let config = crate::ltk_protocol::configure(built.overlay_root.as_str())?;
            let mut child = Command::new(resource.join("ltk_patcher_host.exe"))
                .current_dir(&resource)
                .creation_flags(0x08000000)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Could not start LTK: {e}"))?;
            if let Err(e) = child
                .stdin
                .as_mut()
                .ok_or("LTK input closed")
                .and_then(|input| {
                    input
                        .write_all(config.as_bytes())
                        .and_then(|_| input.flush())
                        .map_err(|_| "Could not configure LTK")
                })
            {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e.into());
            }
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            let pid = child.id();
            *session().lock().map_err(|e| e.to_string())? = Some(Session { generation, child });
            if let Ok(mut s) = state.lock() {
                s.patcher_pid = Some(pid);
            }
            update(&state, generation, PatcherStatus::WaitingForGame);
            drop(_setup);
            let output_state = state.clone();
            let output_log = logfile.clone();
            let output = std::thread::spawn(move || {
                if let Some(stdout) = stdout {
                    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                        log(&output_log, &line);
                        if let Some(next) = crate::ltk_protocol::status(&line) {
                            let exited = next == PatcherStatus::GameExited;
                            update(&output_state, generation, next);
                            if exited && current(&output_state, generation) {
                                if let Ok(mut slot) = session().lock() {
                                    if let Some(active) =
                                        slot.as_mut().filter(|s| s.generation == generation)
                                    {
                                        if let Some(input) = active.child.stdin.as_mut() {
                                            let _ = writeln!(input, "start scan");
                                            let _ = input.flush();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            let error_log = logfile.clone();
            let errors = std::thread::spawn(move || {
                if let Some(stderr) = stderr {
                    for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                        log(&error_log, &line);
                    }
                }
            });
            loop {
                if !current(&state, generation) {
                    break;
                }
                let mut slot = session().lock().map_err(|e| e.to_string())?;
                let Some(active) = slot.as_mut().filter(|s| s.generation == generation) else {
                    break;
                };
                if let Some(exit) = active.child.try_wait().map_err(|e| e.to_string())? {
                    slot.take();
                    let mut s = state.lock().map_err(|e| e.to_string())?;
                    if s.patcher_gen == generation {
                        s.patcher_pid = None;
                        if !matches!(s.patcher_status, PatcherStatus::Error(_)) {
                            s.patcher_status = if exit.success() {
                                PatcherStatus::Idle
                            } else {
                                PatcherStatus::Error(format!(
                                    "LTK host exited ({exit}). Check patcher diagnostics."
                                ))
                            };
                        }
                    }
                    break;
                }
                drop(slot);
                std::thread::sleep(Duration::from_millis(200));
            }
            let _ = output.join();
            let _ = errors.join();
            Ok(())
        })();
        if let Err(error) = result {
            log(&logfile, &error);
            update(&state, generation, PatcherStatus::Error(error));
        }
    });
    Ok("LTK patcher starting".into())
}
#[tauri::command]
pub async fn stop_patcher(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let shared = state.inner().clone();
    let generation = {
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        s.patcher_gen += 1;
        s.patcher_gen
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _setup = setup().lock().map_err(|e| e.to_string())?;
        if current(&shared, generation) {
            stop_host()?;
            let mut s = shared.lock().map_err(|e| e.to_string())?;
            s.patcher_pid = None;
            s.patcher_status = PatcherStatus::Idle;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn get_patcher_status(state: State<'_, Arc<Mutex<AppState>>>) -> Result<PatcherStatus, String> {
    Ok(state
        .lock()
        .map_err(|e| e.to_string())?
        .patcher_status
        .clone())
}
#[tauri::command]
pub fn get_patcher_log(app: AppHandle) -> Result<String, String> {
    let text = fs::read_to_string(base(&app)?.join("patcher.log"))
        .unwrap_or_else(|_| "No patcher attempts yet.".into());
    Ok(text
        .lines()
        .rev()
        .take(250)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n"))
}
#[tauri::command]
pub fn get_work_dir_size(app: AppHandle) -> Result<u64, String> {
    let data = base(&app)?;
    Ok(["overlay", "installed", "ltk-state"]
        .iter()
        .map(|n| super::dir_size(&data.join(n)))
        .sum())
}
#[tauri::command]
pub async fn clear_work_dir(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let shared = state.inner().clone();
    let data = base(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _setup = setup().lock().map_err(|e| e.to_string())?;
        if shared.lock().map_err(|e| e.to_string())?.patcher_status != PatcherStatus::Idle {
            return Err("Stop the patcher before rebuilding temporary data.".into());
        }
        for name in ["overlay", "installed", "ltk-state"] {
            if let Err(e) = fs::remove_dir_all(data.join(name)) {
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(e.to_string());
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(serde::Serialize)]
pub struct HealthCheck {
    id: &'static str,
    label: &'static str,
    state: &'static str,
    detail: String,
}
#[tauri::command]
pub async fn get_patcher_health(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    paths: Vec<String>,
) -> Result<Vec<HealthCheck>, String> {
    let (game, status) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        (s.game_path.clone(), s.patcher_status.clone())
    };
    let resources = resources(&app)?;
    let data = base(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let check = |id, label, ok, detail: &str| HealthCheck {
            id,
            label,
            state: if ok { "ok" } else { "error" },
            detail: detail.into(),
        };
        let engine = resources.join("ltk_patcher_host.exe").is_file()
            && resources.join("ltk_patcher_dll.dll").is_file();
        let probe = data.join(".write-check");
        let writable = fs::write(&probe, b"").is_ok();
        let _ = fs::remove_file(probe);
        let valid = game
            .as_deref()
            .is_some_and(super::game_path::is_valid_game_dir);
        let error = if let PatcherStatus::Error(e) = status {
            Some(e)
        } else {
            None
        };
        Ok(vec![
            check(
                "game",
                "League installation",
                valid,
                if valid {
                    "Game files found."
                } else {
                    "Choose your League installation in Settings."
                },
            ),
            check(
                "engine",
                "LTK engine",
                engine,
                if engine {
                    "LTK host and DLL are installed."
                } else {
                    "Reinstall the Windows preview."
                },
            ),
            check(
                "permissions",
                "Game access",
                true,
                "Runs as your Windows user; administrator mode is not required.",
            ),
            check(
                "storage",
                "Mod storage",
                writable,
                if writable {
                    "Storage is accessible."
                } else {
                    "Storage is not writable."
                },
            ),
            check(
                "selection",
                "Selected files",
                paths.iter().all(|p| Path::new(p).is_file()),
                "Re-import any selected files that were moved or deleted.",
            ),
            check(
                "session",
                "Patcher session",
                error.is_none(),
                error.as_deref().unwrap_or("No current patcher errors."),
            ),
        ])
    })
    .await
    .map_err(|e| e.to_string())?
}
