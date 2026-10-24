//! Resolve an LTK installation in place. Official files are never copied or repackaged.
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
fn preference(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("windows-engine.json"))
}
fn paired(folder: &Path) -> bool {
    folder.join("ltk_patcher_host.exe").is_file() && folder.join("ltk_patcher_dll.dll").is_file()
}
fn normalize(folder: &Path) -> Option<PathBuf> {
    [
        folder.to_path_buf(),
        folder.join("resources"),
        folder.join("ltk"),
    ]
    .into_iter()
    .find(|p| paired(p))
}
#[cfg(target_os = "windows")]
fn installed() -> Option<PathBuf> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for uninstall in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            if let Ok(key) = RegKey::predef(root).open_subkey(uninstall) {
                for name in key.enum_keys().flatten() {
                    if let Ok(app) = key.open_subkey(name) {
                        let display: String = app.get_value("DisplayName").unwrap_or_default();
                        if display.eq_ignore_ascii_case("LTK Manager") {
                            if let Ok(path) = app.get_value::<String, _>("InstallLocation") {
                                if let Some(folder) = normalize(Path::new(&path)) {
                                    return Some(folder);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    for var in ["ProgramFiles", "LOCALAPPDATA"] {
        if let Some(root) = std::env::var_os(var) {
            for relative in ["LTK Manager", "Programs/LTK Manager"] {
                if let Some(path) = normalize(&PathBuf::from(&root).join(relative)) {
                    return Some(path);
                }
            }
        }
    }
    None
}
#[cfg(not(target_os = "windows"))]
fn installed() -> Option<PathBuf> {
    None
}
pub(super) fn resolve(app: &AppHandle) -> Result<EngineInfo, String> {
    if let Some(saved) = preference(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|v| serde_json::from_slice::<String>(&v).ok())
    {
        let folder = normalize(Path::new(&saved))
            .ok_or("The selected LTK folder is unavailable. Choose it again in Settings.")?;
        return Ok(EngineInfo {
            folder: super::game_path::plain_path(&folder.to_string_lossy()),
            source: "Selected LTK installation",
        });
    }
    if let Some(folder) = installed() {
        return Ok(EngineInfo {
            folder: super::game_path::plain_path(&folder.to_string_lossy()),
            source: "Installed LTK Manager",
        });
    }
    let folder = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("ltk");
    #[cfg(debug_assertions)]
    let folder = if !paired(&folder) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/windows")
    } else {
        folder
    };
    Ok(EngineInfo {
        folder: super::game_path::plain_path(&folder.to_string_lossy()),
        source: "Bundled unsigned preview engine",
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
    if let Some(path) = path {
        let folder = normalize(Path::new(&path)).ok_or(
            "Choose an LTK Manager folder containing ltk_patcher_host.exe and ltk_patcher_dll.dll.",
        )?;
        std::fs::create_dir_all(file.parent().ok_or("Invalid preferences folder")?)
            .map_err(|e| e.to_string())?;
        std::fs::write(
            file,
            serde_json::to_vec(&folder.to_string_lossy()).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
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
    #[test]
    fn engine_folder_requires_both_files_and_understands_resource_layouts() {
        let root = std::env::temp_dir().join(format!("cstm-engine-fixture-{}", std::process::id()));
        std::fs::create_dir_all(root.join("resources")).unwrap();
        std::fs::write(root.join("resources/ltk_patcher_host.exe"), b"fixture").unwrap();
        assert!(normalize(&root).is_none());
        std::fs::write(root.join("resources/ltk_patcher_dll.dll"), b"fixture").unwrap();
        assert_eq!(normalize(&root), Some(root.join("resources")));
        std::fs::remove_dir_all(root).unwrap();
    }
}
