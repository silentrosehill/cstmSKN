//! Official LTK installation and first-run setup; patching is owned by Apply/Stop.
use crate::state::{AppState, PatcherStatus};
use serde::Serialize;
use std::sync::{Arc, Mutex};
#[cfg(target_os = "windows")]
use tauri::Manager;
use tauri::{AppHandle, State};
#[cfg(target_os = "windows")]
const INSTALLER_NAME: &str = "LTK.Manager_1.30.4_x64-setup.exe";
#[cfg(target_os = "windows")]
const INSTALLER_SHA256: &str = "0007230f8772c846d586f456aedee5846f7dbf4719715940e73bb073ae4eff23";
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionInfo {
    installed: bool,
    message: String,
}
#[cfg(target_os = "windows")]
pub(super) fn engine_gate() -> &'static Mutex<()> {
    static GATE: Mutex<()> = Mutex::new(());
    &GATE
}

#[tauri::command]
pub async fn get_ltk_companion(app: AppHandle) -> Result<CompanionInfo, String> {
    tauri::async_runtime::spawn_blocking(move || match super::engine::folder(&app) {
        Ok(_) => CompanionInfo {
            installed: true,
            message: "LTK is installed. Apply selection will run its patcher in the background."
                .into(),
        },
        Err(message) => CompanionInfo {
            installed: false,
            message,
        },
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn verify_installer(path: &std::path::Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let file = std::fs::File::open(path)
        .map_err(|_| "The included official installer is missing. Reinstall this cstmSKN build.")?;
    if file.metadata().map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 {
        return Err("The included LTK installer does not match this release.".into());
    }
    let mut hash = Sha256::new();
    let mut reader = std::io::BufReader::new(file);
    let mut buffer = [0; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if format!("{:x}", hash.finalize()) != INSTALLER_SHA256 {
        return Err(
            "The included LTK installer failed verification. Reinstall this cstmSKN build.".into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn install_ltk_companion(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
    if !matches!(
        state.lock().map_err(|e| e.to_string())?.patcher_status,
        PatcherStatus::Idle | PatcherStatus::Error(_)
    ) {
        return Err("Stop patching before installing or repairing LTK.".into());
    }
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let path = app.path().resource_dir().map_err(|e| e.to_string())?.join("ltk-companion").join(INSTALLER_NAME);
            #[cfg(debug_assertions)]
            let path = if path.is_file() { path } else { std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ltk-companion").join(INSTALLER_NAME) };
            verify_installer(&path)?;
            crate::windows_ltk::verify_signature(&path)?;
            crate::windows_shell::open_installer(&path)?;
            Ok("Complete the official installer, then choose Check installation. You can select and apply skins in cstmSKN.".into())
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("LTK setup is available on Windows.".into())
    }
}
#[tauri::command]
pub async fn open_ltk_companion() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let exe = crate::windows_ltk::locate()?.ok_or("Install LTK Manager first.")?;
            crate::windows_shell::open_companion(&exe).map_err(|e| e.to_string())?;
            Ok("Opened LTK Manager.".into())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("LTK Manager is available on Windows.".into())
    }
}
#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    fn included_installer_matches_original_official_artifact() {
        let root =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ltk-companion");
        verify_installer(&root.join(INSTALLER_NAME)).unwrap();
        let manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("provenance.json")).unwrap()).unwrap();
        assert_eq!(manifest["sha256"], INSTALLER_SHA256);
        assert_eq!(manifest["artifact"], INSTALLER_NAME);
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn replaced_or_missing_installers_cannot_be_launched() {
        let root =
            std::env::temp_dir().join(format!("cstmskn-installer-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("replaced.exe");
        std::fs::write(&path, b"MZuntrusted replacement").unwrap();
        assert!(verify_installer(&path)
            .unwrap_err()
            .contains("failed verification"));
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(33 * 1024 * 1024).unwrap();
        drop(file);
        assert!(verify_installer(&path)
            .unwrap_err()
            .contains("does not match"));
        std::fs::remove_file(&path).unwrap();
        assert!(verify_installer(&path).unwrap_err().contains("missing"));
        std::fs::remove_dir(root).unwrap();
    }
}
