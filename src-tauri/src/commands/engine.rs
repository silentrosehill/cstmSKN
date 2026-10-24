//! Resolve the source-built native Windows engine and verify its build hashes.
use crate::state::{AppState, PatcherStatus};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    folder: String,
    source: &'static str,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationInfo {
    opt_in: bool,
    league_runs_as_admin: bool,
    app_is_elevated: bool,
    requested_at_launch: bool,
}
fn elevation_preference(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(preference(app)?.with_file_name("windows-engine-elevate.json"))
}
fn elevation_opt_in(app: &AppHandle) -> bool {
    elevation_preference(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|v| serde_json::from_slice::<bool>(&v).ok())
        .unwrap_or(false)
}
#[cfg(target_os = "windows")]
fn league_runs_as_admin() -> bool {
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(root)
            .open_subkey(r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers")
        {
            for (path, _) in key.enum_values().flatten() {
                let name = Path::new(&path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_ascii_lowercase();
                if name.ends_with(".exe")
                    && (name.starts_with("league") || name.starts_with("riot"))
                {
                    let layer: String = key.get_value(&path).unwrap_or_default();
                    if layer.to_ascii_uppercase().contains("RUNASADMIN") {
                        return true;
                    }
                }
            }
        }
    }
    false
}
#[cfg(not(target_os = "windows"))]
fn league_runs_as_admin() -> bool {
    false
}
#[cfg(target_os = "windows")]
pub(super) fn app_is_elevated() -> bool {
    crate::windows_shell::is_elevated()
}
#[cfg(not(target_os = "windows"))]
pub(super) fn app_is_elevated() -> bool {
    false
}
fn requested_at_launch() -> bool {
    #[cfg(target_os = "windows")]
    {
        crate::windows_shell::engine_elevation_requested()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
pub(super) fn should_elevate(app: &AppHandle) -> bool {
    !app_is_elevated() && (elevation_opt_in(app) || requested_at_launch() || league_runs_as_admin())
}
#[tauri::command]
pub fn get_windows_elevation(app: AppHandle) -> ElevationInfo {
    ElevationInfo {
        opt_in: elevation_opt_in(&app),
        league_runs_as_admin: league_runs_as_admin(),
        app_is_elevated: app_is_elevated(),
        requested_at_launch: requested_at_launch(),
    }
}
#[tauri::command]
pub fn set_windows_elevation(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    enabled: bool,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if state.patcher_status != PatcherStatus::Idle {
        return Err("Stop the patcher before changing engine elevation.".into());
    }
    let file = elevation_preference(&app)?;
    std::fs::create_dir_all(file.parent().ok_or("Invalid preferences folder")?)
        .map_err(|e| e.to_string())?;
    std::fs::write(
        file,
        serde_json::to_vec(&enabled).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    drop(state);
    Ok(())
}
fn preference(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("windows-engine.json"))
}
fn paired(folder: &Path) -> bool {
    folder.join("cstm-native-host.exe").is_file()
        && folder.join("cstm-native-overlay.dll").is_file()
}
#[cfg(target_os = "windows")]
fn verify_runtime(folder: &Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let manifest: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/windows/provenance.json"
    )))
    .map_err(|_| "Native engine build manifest is invalid")?;
    let files = manifest["files"]
        .as_object()
        .ok_or("Native engine manifest has no file hashes")?;
    if files.len() != 2 {
        return Err("Native engine manifest must contain exactly two runtime files".into());
    }
    for name in ["cstm-native-host.exe", "cstm-native-overlay.dll"] {
        let expected = files
            .get(name)
            .and_then(serde_json::Value::as_str)
            .ok_or("Native engine hash is missing")?;
        let mut file = std::fs::File::open(folder.join(name)).map_err(|e| e.to_string())?;
        if file.metadata().map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
            return Err("The native runtime was replaced. Reinstall this candidate.".into());
        }
        let mut hash = Sha256::new();
        let mut buffer = [0; 64 * 1024];
        loop {
            let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != expected {
            return Err("The native runtime does not match this build. Reinstall this candidate with its own ltk folder.".into());
        }
    }
    Ok(())
}
pub(super) fn resolve(app: &AppHandle) -> Result<EngineInfo, String> {
    let folder = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("native");
    #[cfg(debug_assertions)]
    let folder = if !paired(&folder) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/windows")
    } else {
        folder
    };
    if !paired(&folder) {
        return Err("The integrated Windows runtime is missing. Reinstall this preview.".into());
    }
    #[cfg(target_os = "windows")]
    verify_runtime(&folder)?;
    Ok(EngineInfo {
        folder: super::game_path::plain_path(&folder.to_string_lossy()),
        source: "cstmSKN native injector · experimental",
    })
}
pub(super) fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(resolve(app)?.folder))
}
#[tauri::command]
pub fn get_windows_engine(app: AppHandle) -> Result<EngineInfo, String> {
    resolve(&app)
}
#[tauri::command]
pub fn set_windows_engine(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    path: Option<String>,
) -> Result<EngineInfo, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if state.patcher_status != PatcherStatus::Idle {
        return Err("Stop the patcher before changing engines.".into());
    }
    let file = preference(&app)?;
    if path.is_some() {
        return Err("This preview uses its native runtime. External engine files are not supported in this build.".into());
    } else if let Err(e) = std::fs::remove_file(file) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.to_string());
        }
    }
    drop(state);
    resolve(&app)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    fn prepared_runtime_matches_this_build_and_replacement_is_rejected() {
        let prepared = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/windows");
        verify_runtime(&prepared).unwrap();
        let fake =
            std::env::temp_dir().join(format!("cstm-replaced-engine-{}", std::process::id()));
        std::fs::create_dir_all(&fake).unwrap();
        std::fs::write(
            fake.join("cstm-native-host.exe"),
            b"an unexpected executable",
        )
        .unwrap();
        assert!(verify_runtime(&fake).is_err());
        std::fs::remove_dir_all(fake).unwrap();
    }
    #[test]
    fn integrated_runtime_requires_both_files() {
        let root = std::env::temp_dir().join(format!("cstm-engine-fixture-{}", std::process::id()));
        std::fs::create_dir_all(root.join("resources")).unwrap();
        std::fs::write(root.join("resources/cstm-native-host.exe"), b"fixture").unwrap();
        assert!(!paired(&root.join("resources")));
        std::fs::write(root.join("resources/cstm-native-overlay.dll"), b"fixture").unwrap();
        assert!(paired(&root.join("resources")));
        std::fs::remove_dir_all(root).unwrap();
    }
}
