//! Start an installed, unchanged LTK Manager using its own tray preference.
use crate::state::{AppState, PatcherStatus};
use serde::Serialize;
use std::sync::Arc;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "windows")]
const INSTALLER_NAME: &str = "LTK.Manager_1.30.4_x64-setup.exe";
#[cfg(target_os = "windows")]
const INSTALLER_SHA256: &str = "0007230f8772c846d586f456aedee5846f7dbf4719715940e73bb073ae4eff23";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionInfo {
    enabled: bool,
    running: bool,
    message: String,
}
fn info() -> &'static Mutex<CompanionInfo> {
    static INFO: OnceLock<Mutex<CompanionInfo>> = OnceLock::new();
    INFO.get_or_init(|| {
        Mutex::new(CompanionInfo {
            enabled: true,
            running: false,
            message: "Checking LTK Manager…".into(),
        })
    })
}
pub(super) fn engine_gate() -> &'static Mutex<()> {
    static GATE: Mutex<()> = Mutex::new(());
    &GATE
}
fn preference(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ltk-companion.json"))
}
fn enabled(app: &AppHandle) -> Result<bool, String> {
    match std::fs::read(preference(app)?) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

/// Change only tray startup options. Do not complete setup or enable patching.
fn tray_settings(bytes: &[u8]) -> Result<Option<Vec<u8>>, String> {
    let mut settings: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| "LTK settings could not be read. Open LTK Manager to repair its setup.")?;
    let object = settings
        .as_object_mut()
        .ok_or("Invalid LTK settings document.")?;
    if object.get("firstRunComplete").and_then(|v| v.as_bool()) != Some(true)
        || object
            .get("leaguePath")
            .and_then(|v| v.as_str())
            .is_none_or(|v| v.is_empty())
    {
        return Err("Complete LTK Manager’s one-time setup, then quit it and retry here.".into());
    }
    if object.get("startInTray").and_then(|v| v.as_bool()) == Some(true)
        && object
            .get("startInTrayUnlessUpdate")
            .and_then(|v| v.as_bool())
            == Some(false)
    {
        return Ok(None);
    }
    object.insert("startInTray".into(), true.into());
    object.insert("startInTrayUnlessUpdate".into(), false.into());
    serde_json::to_vec_pretty(&settings)
        .map(Some)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::{
        fs,
        io::Write,
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };

    #[derive(serde::Deserialize)]
    pub(super) struct Installation {
        pub path: Option<String>,
        pub running: bool,
    }

    pub(super) fn verify_installer(path: &std::path::Path) -> Result<(), String> {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        let file = fs::File::open(path).map_err(|_| {
            "The included official installer is missing. Reinstall this cstmSKN build."
        })?;
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
                "The included LTK installer failed verification. Reinstall this cstmSKN build."
                    .into(),
            );
        }
        Ok(())
    }

    /// The script contains no interpolated user input and does not change files.
    pub(super) fn inspect(process_only: bool) -> Result<Installation, String> {
        let mut child = Command::new(super::super::powershell())
            .creation_flags(0x08000000)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                include_str!("ltk_companion_inspect.ps1"),
            ])
            .stdin(Stdio::null())
            .env(
                "CSTMSKN_LTK_PROCESS_ONLY",
                if process_only { "1" } else { "0" },
            )
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(20);
        while child.try_wait().map_err(|e| e.to_string())?.is_none() {
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err("LTK installation check timed out. Retry in Settings.".into());
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let result = child.wait_with_output().map_err(|e| e.to_string())?;
        if !result.status.success() {
            return Err("Could not verify the installed LTK Manager. Install the official signed release (1.30.4 or later).".into());
        }
        serde_json::from_slice(&result.stdout)
            .map_err(|_| "Invalid LTK installation check response.".into())
    }

    // A named lock also serializes startup across multiple cstmSKN processes.
    struct LaunchLock(windows_sys::Win32::Foundation::HANDLE);
    impl LaunchLock {
        fn acquire() -> Result<Self, String> {
            use windows_sys::Win32::System::Threading::{CreateMutexW, WaitForSingleObject};
            let name: Vec<u16> = "Local\\cstmSKN-LTK-companion-start"
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
            if handle.is_null() {
                return Err("Could not lock companion startup.".into());
            }
            let result = unsafe { WaitForSingleObject(handle, 30000) };
            if result == 0 || result == 0x80 {
                Ok(Self(handle))
            } else {
                unsafe {
                    windows_sys::Win32::Foundation::CloseHandle(handle);
                }
                Err("Another cstmSKN instance is starting LTK Manager. Retry shortly.".into())
            }
        }
    }
    impl Drop for LaunchLock {
        fn drop(&mut self) {
            unsafe {
                windows_sys::Win32::System::Threading::ReleaseMutex(self.0);
                windows_sys::Win32::Foundation::CloseHandle(self.0);
            }
        }
    }

    pub(super) fn launch() -> Result<CompanionInfo, String> {
        let _lock = LaunchLock::acquire()?;
        let found = inspect(false)?;
        if found.running {
            return Ok(CompanionInfo {
                enabled: true,
                running: true,
                message: "LTK Manager is already running. Its existing window state is preserved."
                    .into(),
            });
        }
        let exe = std::path::PathBuf::from(
            found
                .path
                .ok_or("Install official LTK Manager to use background startup.")?,
        );
        let settings = std::path::PathBuf::from(
            std::env::var_os("APPDATA").ok_or("Windows app data folder is unavailable.")?,
        )
        .join("dev.leaguetoolkit.manager/settings.json");
        let bytes = fs::read(&settings)
            .map_err(|_| "Complete LTK Manager’s one-time setup, then quit it and retry here.")?;
        if let Some(updated) = tray_settings(&bytes)? {
            // Never rewrite a running manager's settings or overwrite our original backup.
            if inspect(true)?.running {
                return Err("LTK Manager started during setup. Quit it and retry.".into());
            }
            let backup = settings.with_file_name("settings.before-cstmskn-tray.json");
            match fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&backup)
            {
                Ok(mut file) => file
                    .write_all(&bytes)
                    .and_then(|_| file.sync_all())
                    .map_err(|e| e.to_string())?,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e.to_string()),
            }
            // Replace atomically on the same volume; preserve the old file on write failure.
            let pending = settings.with_file_name("settings.cstmskn-tray.tmp");
            let mut created = false;
            let result = (|| -> Result<(), String> {
                let mut file = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&pending)
                    .map_err(|e| e.to_string())?;
                created = true;
                file.write_all(&updated)
                    .and_then(|_| file.sync_all())
                    .map_err(|e| e.to_string())?;
                drop(file);
                use std::os::windows::ffi::OsStrExt;
                let wide = |p: &std::path::Path| {
                    p.as_os_str()
                        .encode_wide()
                        .chain(Some(0))
                        .collect::<Vec<_>>()
                };
                let ok = unsafe {
                    windows_sys::Win32::Storage::FileSystem::MoveFileExW(
                        wide(&pending).as_ptr(),
                        wide(&settings).as_ptr(),
                        0x1 | 0x8,
                    )
                };
                if ok == 0 {
                    return Err(std::io::Error::last_os_error().to_string());
                }
                Ok(())
            })();
            if created {
                let _ = fs::remove_file(pending);
            }
            result?;
        }
        // Explorer launches under the interactive user's normal token. LTK owns
        // its window/tray and signed runtime; no binary flags or bytes change.
        crate::windows_shell::launch_companion(&exe).map_err(|e| e.to_string())?;
        // Hold the cross-process lock until the manager is visible to discovery.
        for _ in 0..5 {
            std::thread::sleep(Duration::from_millis(400));
            if inspect(true)?.running {
                return Ok(CompanionInfo {
                    enabled: true,
                    running: true,
                    message: "LTK Manager is running. New launches use its system tray.".into(),
                });
            }
        }
        Err(
            "LTK Manager did not stay running. Open it once to check its installation, then retry."
                .into(),
        )
    }
}

#[cfg(target_os = "windows")]
pub(super) fn running() -> Result<bool, String> {
    platform::inspect(true).map(|s| s.running)
}

fn refresh(app: &AppHandle) -> Result<CompanionInfo, String> {
    let _gate = engine_gate().lock().map_err(|e| e.to_string())?;
    let on = enabled(app)?;
    if on
        && !matches!(
            app.state::<Arc<Mutex<AppState>>>()
                .lock()
                .map_err(|e| e.to_string())?
                .patcher_status,
            PatcherStatus::Idle | PatcherStatus::Error(_)
        )
    {
        return Err("Stop the experimental engine before starting LTK Manager.".into());
    }
    #[cfg(target_os = "windows")]
    let result = if on {
        platform::launch()
    } else {
        Ok(CompanionInfo {
            enabled: false,
            running: platform::inspect(true).is_ok_and(|s| s.running),
            message: "Background startup is off. A running LTK Manager is left open.".into(),
        })
    };
    #[cfg(not(target_os = "windows"))]
    let result: Result<CompanionInfo, String> = Ok(CompanionInfo {
        enabled: on,
        running: false,
        message: "LTK companion is available on Windows.".into(),
    });
    let status = result.unwrap_or_else(|message| CompanionInfo {
        enabled: on,
        running: false,
        message,
    });
    *info().lock().map_err(|e| e.to_string())? = status.clone();
    Ok(status)
}
#[cfg(target_os = "windows")]
pub fn startup(app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(message) = refresh(&app) {
            if let Ok(mut status) = info().lock() {
                status.message = message;
            }
        }
    });
}
#[tauri::command]
pub fn get_ltk_companion() -> Result<CompanionInfo, String> {
    info().lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

/// Open the complete official installer. Do not suppress setup or UAC prompts.
#[tauri::command]
pub async fn install_ltk_companion(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
    if !matches!(
        state.lock().map_err(|e| e.to_string())?.patcher_status,
        PatcherStatus::Idle | PatcherStatus::Error(_)
    ) {
        return Err("Stop the experimental engine before installing LTK Manager.".into());
    }
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            use std::{os::windows::process::CommandExt, process::{Command, Stdio}};
            let path = app.path().resource_dir().map_err(|e| e.to_string())?.join("ltk-companion").join(INSTALLER_NAME);
            #[cfg(debug_assertions)]
            let path = if path.is_file() { path } else {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ltk-companion").join(INSTALLER_NAME)
            };
            platform::verify_installer(&path)?;
            // Fixed code; the path is data, never PowerShell source. Start-Process
            // retains Windows installer UI and ordinary UAC approval behavior.
            let mut child = Command::new(super::powershell()).creation_flags(0x08000000)
                .args(["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; if ((Get-AuthenticodeSignature -LiteralPath $env:CSTMSKN_LTK_INSTALLER).Status -ne 'Valid') { throw 'Official installer signature is invalid' }; Start-Process -FilePath $env:CSTMSKN_LTK_INSTALLER"])
                .env("CSTMSKN_LTK_INSTALLER", &path)
                .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn().map_err(|e| e.to_string())?;
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
            loop {
                if let Some(exit) = child.try_wait().map_err(|e| e.to_string())? {
                    if !exit.success() { return Err("Windows could not open the official installer or its signature check failed. Check Windows approval prompts before retrying.".into()); }
                    return Ok("Official LTK installer opened. Complete installation and initial setup, quit LTK, then choose Retry background launch.".into());
                }
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill(); let _ = child.wait();
                    return Err("Installer launch timed out. Check for a Windows approval prompt before trying again.".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("The LTK companion installer is available on Windows.".into())
    }
}

#[tauri::command]
pub async fn set_ltk_companion(
    app: AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
    enabled: bool,
) -> Result<CompanionInfo, String> {
    if !matches!(
        state.lock().map_err(|e| e.to_string())?.patcher_status,
        PatcherStatus::Idle | PatcherStatus::Error(_)
    ) {
        return Err("Stop the experimental engine before changing companion startup.".into());
    }
    let file = preference(&app)?;
    std::fs::create_dir_all(file.parent().ok_or("Invalid preference folder")?)
        .map_err(|e| e.to_string())?;
    std::fs::write(
        file,
        serde_json::to_vec(&enabled).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || refresh(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    fn included_installer_matches_original_official_artifact() {
        let root =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ltk-companion");
        platform::verify_installer(&root.join(INSTALLER_NAME)).unwrap();
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
        assert!(platform::verify_installer(&path)
            .unwrap_err()
            .contains("failed verification"));
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(33 * 1024 * 1024).unwrap();
        drop(file);
        assert!(platform::verify_installer(&path)
            .unwrap_err()
            .contains("does not match"));
        std::fs::remove_file(&path).unwrap();
        assert!(platform::verify_installer(&path)
            .unwrap_err()
            .contains("missing"));
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn tray_setup_preserves_selection_and_unknown_settings() {
        let old = br#"{"firstRunComplete":true,"leaguePath":"C:/League","startInTray":false,"startInTrayUnlessUpdate":true,"alwaysStartPatcher":false,"future":{"key":[1,2]}}"#;
        let updated = tray_settings(old).unwrap().unwrap();
        let mut expected: serde_json::Value = serde_json::from_slice(old).unwrap();
        expected["startInTray"] = true.into();
        expected["startInTrayUnlessUpdate"] = false.into();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&updated).unwrap(),
            expected
        );
        assert!(tray_settings(&updated).unwrap().is_none());
    }
    #[test]
    fn incomplete_or_invalid_settings_never_get_overwritten() {
        for settings in [
            b"null".as_slice(),
            b"{broken",
            b"{}",
            br#"{"firstRunComplete":false,"leaguePath":"C:/League"}"#,
            br#"{"firstRunComplete":true,"leaguePath":null}"#,
        ] {
            assert!(tray_settings(settings).is_err());
        }
    }
}
