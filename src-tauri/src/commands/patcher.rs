use crate::state::{AppState, PatcherStatus};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Manager, State};

/// Serializes patcher setup (kill-old → import → mkoverlay → spawn → record pid).
/// Two live mod-tools tracers on the same game task port make the kernel SIGSEGV
/// the new one, so only one apply may be in its setup phase at a time. Held until
/// just before the long monitoring wait, then released.
fn apply_setup_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn work_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    fs::create_dir_all(&dir).ok();
    dir
}

pub(super) fn sidecar_path(_app: &AppHandle) -> PathBuf {
    let triple = if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else {
        "x86_64-apple-darwin"
    };

    // Production: Tauri bundles the sidecar as "mod-tools" next to the app binary
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bin = dir.join("mod-tools");
            if bin.exists() {
                return bin;
            }
        }
    }

    #[cfg(debug_assertions)]
    {
    // Dev: binary lives in src-tauri/binaries/ with the target triple suffix
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("mod-tools-{}", triple))
    }
    #[cfg(not(debug_assertions))]
    { let _ = triple; PathBuf::from("mod-tools") }
}

fn append_patch_log(path: &Path, message: &str) {
    static LOG_LOCK: Mutex<()> = Mutex::new(());
    let _lock = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let seconds = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let _ = writeln!(file, "[{}] {}", seconds, message);
    }
}

fn game_patch_error(line: &str) -> Option<String> {
    if line.starts_with("[patcher] failed for pid=") {
        Some(format!("Game patch failed: {}", line.split_once(": ").map(|(_, detail)| detail).unwrap_or(line)))
    } else { None }
}

fn preserve_game_failure(current: &PatcherStatus, next: PatcherStatus) -> PatcherStatus {
    if matches!(current, PatcherStatus::Error(_)) && next == PatcherStatus::WaitingForGame {
        current.clone()
    } else { next }
}

#[tauri::command]
pub fn get_patcher_log(app: AppHandle) -> Result<String, String> {
    let path = work_dir(&app).join("patcher.log");
    if !path.exists() { return Ok("No patcher attempts recorded yet.".to_string()); }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines: Vec<&str> = content.lines().rev().take(250).collect();
    lines.reverse();
    Ok(lines.join("\n"))
}

fn run_mod_tools(binary: &PathBuf, args: &[String], log_path: &Path) -> Result<String, String> {
    append_patch_log(log_path, &format!("Command: {:?}", args));
    let output = Command::new(binary)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run mod-tools: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    append_patch_log(log_path, &format!("{}\n{}", stdout.trim(), stderr.trim()));
    if !output.status.success() {
        let detail = if stderr.is_empty() {
            stdout.trim().to_string()
        } else {
            format!("{}\n{}", stdout.trim(), stderr.trim())
        };
        return Err(format!(
            "mod-tools failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            detail
        ));
    }

    Ok(stdout)
}

#[tauri::command]
pub fn apply_skin(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    zip_path: String,
) -> Result<String, String> {
    start_apply(app, vec![zip_path], state.inner().clone())
}

#[tauri::command]
pub fn apply_skins(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    zip_paths: Vec<String>,
) -> Result<String, String> {
    start_apply(app, zip_paths, state.inner().clone())
}

/// Validates inputs, sets status to Importing, spawns a background thread
/// for the heavy work, and returns immediately so the UI stays responsive.
fn start_apply(
    app: AppHandle,
    zip_paths: Vec<String>,
    state: Arc<Mutex<AppState>>,
) -> Result<String, String> {
    if zip_paths.is_empty() {
        return Err("No skins selected".to_string());
    }

    let game_path = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.game_path
            .clone()
            .ok_or_else(|| "Game path not set".to_string())?
    };

    let binary = sidecar_path(&app);
    if !binary.exists() {
        return Err(format!("mod-tools not found at {:?}", binary));
    }

    // Bump the generation up front so any apply already waiting for the setup
    // lock knows it has been superseded and can bail without spawning a patcher.
    let gen = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.patcher_gen += 1;
        s.patcher_status = PatcherStatus::Importing;
        s.patcher_gen
    };

    let base = work_dir(&app);
    let log_path = base.join("patcher.log");
    if fs::metadata(&log_path).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let _ = fs::rename(&log_path, base.join("patcher.previous.log"));
    }
    append_patch_log(&log_path, &format!("Apply generation {}: {} files; game={}", gen, zip_paths.len(), game_path));

    std::thread::spawn(move || {
        // Serialize the whole setup so two patchers can never run at once. This
        // blocks until any in-flight apply has finished spawning and *recorded*
        // its pid — only then can we see and kill it. Released before monitoring.
        let setup_guard = apply_setup_lock().lock().unwrap_or_else(|e| e.into_inner());

        // A newer apply superseded us while we waited for the lock — let it win.
        if let Ok(s) = state.lock() {
            if s.patcher_gen != gen {
                return;
            }
        }

        // Stop the currently-tracked patcher: close its stdin (graceful abort),
        // then confirm it is fully dead before we touch the game. pid is read
        // here (under the setup lock) so it reflects the real running patcher.
        let old_pid = match state.lock() {
            Ok(mut s) => {
                if let Some(mut pipe) = s.patcher_stdin.take() {
                    pipe.write_all(b"\n").ok();
                    drop(pipe);
                }
                s.patcher_pid.take()
            }
            Err(_) => None,
        };
        if let Some(pid) = old_pid {
            let pid_i = pid as i32;
            // kill(pid, 0) probes existence: 0 while alive, -1 (ESRCH) once gone.
            let wait_gone = |timeout_ms: u64| -> bool {
                let deadline =
                    std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
                loop {
                    if unsafe { libc::kill(pid_i, 0) } != 0 {
                        return true;
                    }
                    if std::time::Instant::now() >= deadline {
                        return false;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            };
            if !wait_gone(3000) {
                unsafe { libc::kill(pid_i, libc::SIGTERM) };
                if !wait_gone(1500) {
                    unsafe { libc::kill(pid_i, libc::SIGKILL) };
                    wait_gone(2000);
                }
            }
        }

        if let Err(e) =
            do_apply_skins_bg(binary, base, game_path, zip_paths, state.clone(), gen, setup_guard)
        {
            append_patch_log(&log_path, &format!("Setup failed: {}", e));
            if let Ok(mut s) = state.lock() {
                if s.patcher_gen == gen {
                    s.patcher_status = PatcherStatus::Error(e);
                    s.patcher_stdin = None;
                    s.patcher_pid = None;
                }
            }
        }
    });

    Ok("Patcher starting".to_string())
}

fn do_apply_skins_bg(
    binary: PathBuf,
    base: PathBuf,
    game_path: String,
    zip_paths: Vec<String>,
    state: Arc<Mutex<AppState>>,
    gen: u64,
    setup_guard: MutexGuard<'static, ()>,
) -> Result<(), String> {
    let log_path = base.join("patcher.log");
    let installed_dir = base.join("installed");
    let overlay_dir = base.join("overlay");
    let config_file = base.join("config");

    let _ = fs::remove_dir_all(&installed_dir);
    let _ = fs::remove_dir_all(&overlay_dir);
    fs::create_dir_all(&installed_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&overlay_dir).map_err(|e| e.to_string())?;
    fs::write(&config_file, "").map_err(|e| e.to_string())?;

    // Step 1: Import all skins
    let mut mod_names = Vec::new();
    for (i, zip_path) in zip_paths.iter().enumerate() {
        if state.lock().map_err(|e| e.to_string())?.patcher_gen != gen { return Ok(()); }
        let mod_name = format!("mod_{}", i);
        let mod_dir = installed_dir.join(&mod_name);

        run_mod_tools(
            &binary,
            &[
                "import".into(),
                zip_path.clone(),
                mod_dir.to_string_lossy().to_string(),
                format!("--game:{}", game_path),
            ],
            &log_path,
        )?;

        mod_names.push(mod_name);
    }

    // Step 2: Build overlay with all mods
    {
        if let Ok(mut s) = state.lock() {
            if s.patcher_gen == gen {
                s.patcher_status = PatcherStatus::BuildingOverlay;
            }
        }
    }

    let mods_arg = format!("--mods:{}", mod_names.join("/"));
    let mkoverlay_args = vec![
        "mkoverlay".into(),
        installed_dir.to_string_lossy().to_string(),
        overlay_dir.to_string_lossy().to_string(),
        format!("--game:{}", game_path),
        mods_arg,
    ];

    run_mod_tools(&binary, &mkoverlay_args, &log_path).map_err(|e| {
        if e.to_lowercase().contains("conflict") {
            "Two enabled mods change the same game files. Disable one of the conflicting mods and apply again.".to_string()
        } else {
            e
        }
    })?;

    // Cancellation can arrive while import or overlay creation is in progress.
    if state.lock().map_err(|e| e.to_string())?.patcher_gen != gen { return Ok(()); }

    // Step 3: Run patcher
    {
        if let Ok(mut s) = state.lock() {
            if s.patcher_gen == gen {
                s.patcher_status = PatcherStatus::WaitingForGame;
            }
        }
    }

    let overlay_str = overlay_dir.to_string_lossy().to_string();
    let config_str = config_file.to_string_lossy().to_string();
    let game_arg = format!("--game:{}", game_path);

    append_patch_log(&log_path, "Starting native game watcher");
    let mut child = Command::new(&binary)
        .args([
            "runoverlay",
            &overlay_str,
            &config_str,
            &game_arg,
            "--opts:none",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start patcher: {}", e))?;

    // Record pid/stdin unconditionally (even if a newer apply just superseded us
    // while we held the setup lock): a superseding apply must be able to find and
    // kill this patcher. The generation guard elsewhere keeps stale status/cleanup
    // from clobbering the newer patcher.
    let child_pid = child.id();
    let stdin = child.stdin.take();
    if let Ok(mut s) = state.lock() {
        s.patcher_stdin = stdin;
        s.patcher_pid = Some(child_pid);
    }

    // Setup is done and the pid is recorded — release the lock so a queued apply
    // can now proceed (it will kill this patcher first). Everything below is just
    // long-running monitoring.
    drop(setup_guard);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let state_arc = state.clone();
    let stdout_log = log_path.clone();
    let stdout_thread = std::thread::spawn(move || {
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                append_patch_log(&stdout_log, &line);
                eprintln!("[zushi] mod-tools: {}", line);
                if let Some(status_msg) = line.strip_prefix("Status: ") {
                    let new_status = match status_msg {
                        "Waiting for league match to start" => Some(PatcherStatus::WaitingForGame),
                        "Found League" => Some(PatcherStatus::FoundGame),
                        "Scanning" | "Wait initialized" | "Saving" | "Wait patchable" => Some(PatcherStatus::Scanning),
                        "Patching" => Some(PatcherStatus::Patching),
                        "Waiting for exit" => Some(PatcherStatus::InGame),
                        "League exited" => Some(PatcherStatus::GameExited),
                        _ => None,
                    };
                    if let Some(status) = new_status {
                        if let Ok(mut s) = state_arc.lock() {
                            if s.patcher_gen == gen {
                                s.patcher_status = preserve_game_failure(&s.patcher_status, status);
                            }
                        }
                    }
                }
            }
        }
    });

    let stderr_state = state.clone();
    let stderr_log = log_path.clone();
    let stderr_thread = std::thread::spawn(move || {
        let mut tail = std::collections::VecDeque::new();
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines().map_while(Result::ok) {
                append_patch_log(&stderr_log, &line);
                if let Some(error) = game_patch_error(&line) {
                    if let Ok(mut s) = stderr_state.lock() {
                        if s.patcher_gen == gen { s.patcher_status = PatcherStatus::Error(error); }
                    }
                }
                if tail.len() >= 12 { tail.pop_front(); }
                tail.push_back(line.clone());
                eprintln!("[zushi] mod-tools err: {}", line);
            }
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });

    let exit_status = child
        .wait()
        .map_err(|e| format!("Failed to wait for patcher: {}", e))?;
    let _ = stdout_thread.join();
    let stderr_tail = stderr_thread.join().unwrap_or_default();
    append_patch_log(&log_path, &format!("Watcher exited: {}", exit_status));

    if let Ok(mut s) = state.lock() {
        if s.patcher_gen == gen {
            if !exit_status.success() {
                use std::os::unix::process::ExitStatusExt;
                let detail = if let Some(code) = exit_status.code() {
                    format!("exit code {}", code)
                } else if let Some(sig) = exit_status.signal() {
                    let name = match sig {
                        1 => "SIGHUP", 2 => "SIGINT", 3 => "SIGQUIT", 6 => "SIGABRT",
                        9 => "SIGKILL", 10 => "SIGBUS", 11 => "SIGSEGV", 13 => "SIGPIPE",
                        15 => "SIGTERM", _ => "?",
                    };
                    format!("killed by signal {} ({})", sig, name)
                } else {
                    "unknown".to_string()
                };
                eprintln!("[zushi] mod-tools runoverlay exited: {}", detail);
                s.patcher_status =
                    PatcherStatus::Error(format!("Patcher exited unexpectedly ({}). {}", detail, stderr_tail));
            } else {
                s.patcher_status = PatcherStatus::Idle;
            }
            s.patcher_stdin = None;
            s.patcher_pid = None;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_patcher(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let shared = state.inner().clone();
    // Invalidate pending setup before waiting on its lock.
    let stop_gen = {
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        s.patcher_gen += 1;
        s.patcher_gen
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = apply_setup_lock().lock().unwrap_or_else(|e| e.into_inner());
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        // A newer apply supersedes this stop; it owns the previous tracer now.
        if s.patcher_gen != stop_gen { return Ok(()); }
        if let Some(mut pipe) = s.patcher_stdin.take() { let _ = pipe.write_all(b"\n"); }
        let pid = s.patcher_pid;
        drop(s);
        if let Some(pid) = pid {
            let gone = |timeout: u64| {
                let end = std::time::Instant::now() + std::time::Duration::from_millis(timeout);
                while unsafe { libc::kill(pid as i32, 0) } == 0 {
                    if std::time::Instant::now() >= end { return false; }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                true
            };
            if !gone(3000) {
                unsafe { libc::kill(pid as i32, libc::SIGTERM); }
                if !gone(1500) {
                    unsafe { libc::kill(pid as i32, libc::SIGKILL); }
                    if !gone(2000) { return Err("Patcher did not stop. Try again before updating.".into()); }
                }
            }
        }
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        if s.patcher_gen == stop_gen {
            s.patcher_pid = None;
            s.patcher_status = PatcherStatus::Idle;
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_patcher_status(state: State<'_, Arc<Mutex<AppState>>>) -> Result<PatcherStatus, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.patcher_status.clone())
}

#[tauri::command]
pub fn get_work_dir_size(app: AppHandle) -> Result<u64, String> {
    let base = work_dir(&app);
    let installed = dir_size(&base.join("installed"));
    let overlay = dir_size(&base.join("overlay"));
    Ok(installed + overlay)
}

#[tauri::command]
pub fn clear_work_dir(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.patcher_stdin.is_some() {
            return Err("Cannot clear while patcher is running".to_string());
        }
    }
    let base = work_dir(&app);
    for name in ["installed", "overlay"] {
        if let Err(e) = fs::remove_dir_all(base.join(name)) {
            if e.kind() != std::io::ErrorKind::NotFound { return Err(e.to_string()); }
        }
    }
    if let Err(e) = fs::remove_file(base.join("config")) {
        if e.kind() != std::io::ErrorKind::NotFound { return Err(e.to_string()); }
    }
    Ok(())
}

use super::dir_size;

#[cfg(test)]
mod diagnostics_tests {
    use super::*;
    #[test]
    fn failure_remains_visible_when_engine_goes_back_to_waiting() {
        let failed = PatcherStatus::Error("task_for_pid".to_string());
        assert_eq!(preserve_game_failure(&failed, PatcherStatus::WaitingForGame), failed);
        assert_eq!(preserve_game_failure(&failed, PatcherStatus::FoundGame), PatcherStatus::FoundGame);
    }
    #[test]
    fn parses_real_engine_error_and_ignores_normal_progress() {
        assert_eq!(game_patch_error("[patcher] failed for pid=123: Failed to find wad_verify call"), Some("Game patch failed: Failed to find wad_verify call".into()));
        assert!(game_patch_error("[patcher] patched pid=123").is_none());
    }
}

#[derive(serde::Serialize)]
pub struct HealthCheck { id: &'static str, label: &'static str, state: &'static str, detail: String }

#[tauri::command]
pub async fn get_patcher_health(app: AppHandle, state: State<'_, Arc<Mutex<AppState>>>, paths: Vec<String>) -> Result<Vec<HealthCheck>, String> {
    let (game, status) = { let s = state.lock().map_err(|e| e.to_string())?; (s.game_path.clone(), s.patcher_status.clone()) };
    let binary = sidecar_path(&app);
    let base = work_dir(&app);
    tauri::async_runtime::spawn_blocking(move || {
        use std::os::unix::fs::PermissionsExt;
        let check = |id, label, ok, detail: String| HealthCheck { id, label, state: if ok { "ok" } else { "error" }, detail };
        let valid_game = game.as_deref().map(|p| Path::new(p).join("LeagueofLegends.app").is_dir() && Path::new(p).join("DATA/FINAL").is_dir()).unwrap_or(false);
        let executable = fs::metadata(&binary).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false);
        let writable = std::ffi::CString::new(base.to_string_lossy().as_bytes()).map(|path| unsafe { libc::access(path.as_ptr(), libc::W_OK) == 0 }).unwrap_or(false);
        let missing: Vec<_> = paths.iter().filter(|p| !Path::new(p).is_file()).filter_map(|p| Path::new(p).file_name()).map(|p| p.to_string_lossy().into_owned()).collect();
        let engine_error = match status { PatcherStatus::Error(error) => Some(error), _ => None };
        Ok(vec![
            check("game", "League installation", valid_game, if valid_game { "Game files found.".into() } else { "Choose your League installation in Settings.".into() }),
            check("engine", "Patcher engine", executable, if executable { "Engine is installed and executable.".into() } else { "Reinstall cstmSKN to restore its patcher engine.".into() }),
            check("permissions", "Game access", crate::running_as_root(), if crate::running_as_root() { "Administrator access is available.".into() } else { "Reopen cstmSKN and allow macOS administrator access.".into() }),
            check("storage", "Mod storage", writable, if writable { "Storage is accessible.".into() } else { "Reopen cstmSKN with administrator access.".into() }),
            check("selection", "Selected files", missing.is_empty(), if missing.is_empty() { "Selected mod files are available.".into() } else { format!("Download or import again: {}", missing.join(", ")) }),
            check("session", "Patcher session", engine_error.is_none(), engine_error.unwrap_or_else(|| "No current patcher errors.".into())),
        ])
    }).await.map_err(|e| e.to_string())?
}
