pub mod appearance;
pub mod client;
pub mod customs;
pub mod engine;
pub mod game_path;
#[cfg(not(target_os = "windows"))]
pub mod patcher;
#[cfg(target_os = "windows")]
#[path = "patcher_windows.rs"]
pub mod patcher;
pub mod releases;
pub mod skins;

use std::fs;
use std::process::Command;

/// Open a URL in the real (GUI) user's default browser, not root's.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    // This command opens web links only, never local files or URL handlers.
    if !url.starts_with("https://") || url.chars().any(char::is_control) {
        return Err("Only secure web links can be opened".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Fixed PowerShell code; the URL is supplied via an environment value.
        Command::new(powershell())
            .creation_flags(0x08000000)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Process -FilePath $env:CSTMSKN_OPEN_URL",
            ])
            .env("CSTMSKN_OPEN_URL", &url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // stat -f '%Su' /dev/console gives the user who owns the GUI session.
        let real_user = Command::new("/usr/bin/stat")
            .args(["-f", "%Su", "/dev/console"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        if !real_user.is_empty() && real_user != "root" {
            Command::new("/usr/bin/sudo")
                .args(["-u", &real_user, "/usr/bin/open", "--", &url])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("/usr/bin/open")
                .args(["--", &url])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Windows PowerShell from the system folder, never a same-named file next to the app.
#[cfg(target_os = "windows")]
pub(crate) fn powershell() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into()))
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe")
}

pub fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if ft.is_file() {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            } else if ft.is_dir() {
                total += dir_size(&entry.path());
            }
        }
    }
    total
}
