//! Locate the user's unmodified official LTK runtime in its installation.
#[cfg(target_os = "windows")]
use std::path::Path;
use std::path::PathBuf;
use tauri::AppHandle;

#[cfg(target_os = "windows")]
pub(super) fn folder_from_manager(manager: &Path) -> Result<PathBuf, String> {
    crate::windows_ltk::validate(manager)?;
    let folder = manager.parent().ok_or("Invalid LTK installation")?;
    for name in ["ltk_patcher_host.exe", "ltk_patcher_dll.dll"] {
        let path = folder.join(name);
        if !path.is_file() {
            return Err(format!(
                "LTK component {name} is missing. Install or repair official LTK Manager."
            ));
        }
        crate::windows_ltk::verify_signature(&path)?;
    }
    Ok(folder.to_path_buf())
}
#[cfg(target_os = "windows")]
pub(super) fn folder(_app: &AppHandle) -> Result<PathBuf, String> {
    let manager = crate::windows_ltk::locate()?
        .ok_or("Install LTK Manager using the setup prompt before applying skins.")?;
    folder_from_manager(&manager)
}
#[cfg(not(target_os = "windows"))]
pub(super) fn folder(_app: &AppHandle) -> Result<PathBuf, String> {
    Err("LTK is used on Windows only.".into())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    #[test]
    fn official_runtime_is_used_in_place_without_copying_or_modifying_it() {
        let manager = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../native-build/ltk-official-fixture/ltk-manager.exe");
        assert_eq!(
            folder_from_manager(&manager).unwrap(),
            manager.parent().unwrap()
        );
    }
}
