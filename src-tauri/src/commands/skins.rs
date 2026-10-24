use crate::state::DownloadedSkin;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub url: String,
    pub champion_name: String,
    pub skin_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    current: u32,
    total: u32,
    skin_name: String,
}

// Keep legacy slash encoding for existing libraries. Reject ambiguous or unsafe
// logical names before joining them to a privileged filesystem path.
fn encode_path(s: &str) -> Result<String, String> {
    if s.trim().is_empty()
        || s == "."
        || s == ".."
        || s.contains('%')
        || s.contains('\\')
        || s.chars().any(char::is_control)
        || s.len() > 220
    {
        return Err("Invalid skin or champion name".into());
    }
    Ok(s.replace('/', "%2F"))
}
fn decode_path(s: &str) -> String {
    s.replace("%2F", "/")
}

// Serialize library mutations, including clearing/deleting during a download.
static LIBRARY_LOCK: Mutex<()> = Mutex::new(());
const MAX_DOWNLOAD: u64 = 1024 * 1024 * 1024;
fn skin_folder(base: &std::path::Path, champion: &str, skin: &str) -> Result<PathBuf, String> {
    let mut folder = base.to_path_buf();
    for component in [encode_path(champion)?, encode_path(skin)?] {
        folder.push(component);
        if fs::symlink_metadata(&folder)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("Library folders must not be symbolic links".into());
        }
    }
    Ok(folder)
}
fn catalog_url(url: &str) -> Result<(), String> {
    const PREFIX: &str = "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/skins/";
    let path = url
        .strip_prefix(PREFIX)
        .ok_or("Only catalog skin downloads are allowed")?;
    if path.is_empty()
        || path.contains('?')
        || path.contains('#')
        || path.contains("..")
        || path.contains('%')
        || !path
            .bytes()
            .all(|c| c.is_ascii_digit() || c == b'/' || c == b'.' || c.is_ascii_alphabetic())
        || !(path.ends_with(".fantome") || path.ends_with(".zip"))
    {
        return Err("Invalid catalog download URL".into());
    }
    Ok(())
}
fn copy_package(mut reader: impl Read, path: &std::path::Path) -> Result<(), String> {
    let temp = path.with_extension("download");
    let result = (|| {
        // Never follow a preexisting symlink, even for a temporary download.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| format!("Cannot create download: {e}"))?;
        let size = std::io::copy(&mut reader.by_ref().take(MAX_DOWNLOAD + 1), &mut file)
            .map_err(|e| format!("Download interrupted: {e}"))?;
        if size > MAX_DOWNLOAD {
            return Err("Skin package exceeds 1 GB".into());
        }
        file.flush().map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        let mut header = [0u8; 4];
        fs::File::open(&temp)
            .and_then(|mut f| f.read_exact(&mut header))
            .map_err(|_| "Incomplete skin package".to_string())?;
        if header != [b'P', b'K', 3, 4] {
            return Err("Downloaded file is not a skin archive".into());
        }
        // Listing validates the central directory without extracting untrusted files.
        let check = std::process::Command::new("/usr/bin/unzip")
            .args(["-Z1"])
            .arg(&temp)
            .output()
            .map_err(|e| e.to_string())?;
        if !check.status.success() {
            return Err("Downloaded archive is incomplete".into());
        }
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    // Only remove temporary files created by this call.
    // The library lock prevents another download from owning this path.
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
fn download_to(
    base: &std::path::Path,
    url: &str,
    champion: &str,
    skin: &str,
) -> Result<String, String> {
    catalog_url(url)?;
    let folder = skin_folder(base, champion, skin)?;
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(format!("{}.zip", encode_path(skin)?));
    // A crashed earlier session may have left a temporary file. Removing it does
    // not follow symlinks; the mutation lock excludes concurrent downloads.
    let _ = fs::remove_file(path.with_extension("download"));
    // Limit how long connecting and each read may stall, not the whole transfer: a large
    // skin on a slow connection keeps going as long as data keeps arriving.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(60))
        .redirects(0)
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;
    if response.status() != 200 {
        return Err(format!("Download returned HTTP {}", response.status()));
    }
    if response
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .is_some_and(|v| v > MAX_DOWNLOAD)
    {
        return Err("Skin package exceeds 1 GB".into());
    }
    copy_package(response.into_reader(), &path)?;
    Ok(path.to_string_lossy().into_owned())
}

fn skins_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("skins");
    fs::create_dir_all(&dir).ok();
    dir
}

/// Flatten a spawn_blocking result into our String error type.
fn flatten<T>(res: Result<Result<T, String>, impl std::fmt::Display>) -> Result<T, String> {
    match res {
        Ok(inner) => inner,
        Err(e) => Err(e.to_string()),
    }
}

/// Download a single skin zip. Runs blocking I/O on a background thread.
#[tauri::command]
pub async fn download_skin(
    app: AppHandle,
    url: String,
    champion_name: String,
    skin_name: String,
) -> Result<String, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = LIBRARY_LOCK.lock().map_err(|e| e.to_string())?;
            download_to(&base, &url, &champion_name, &skin_name)
        })
        .await,
    )
}

/// Download multiple skins in one call. Runs entirely on a background thread,
/// emitting progress events so the UI stays responsive.
#[tauri::command]
pub async fn download_multiple_skins(
    app: AppHandle,
    items: Vec<DownloadItem>,
) -> Result<u32, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = LIBRARY_LOCK.lock().map_err(|e| e.to_string())?;
            let total = items.len() as u32;
            let mut success_count = 0u32;
            for (index, item) in items.iter().enumerate() {
                if download_to(&base, &item.url, &item.champion_name, &item.skin_name).is_ok() {
                    success_count += 1;
                }
                let _ = app.emit(
                    "download-progress",
                    DownloadProgress {
                        current: index as u32 + 1,
                        total,
                        skin_name: item.skin_name.clone(),
                    },
                );
            }
            Ok(success_count)
        })
        .await,
    )
}

#[tauri::command]
pub async fn list_downloaded_skins(app: AppHandle) -> Result<Vec<DownloadedSkin>, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let mut skins = Vec::new();

            let entries = match fs::read_dir(&base) {
                Ok(e) => e,
                Err(_) => return Ok(skins),
            };

            for champion_entry in entries.flatten() {
                if !champion_entry
                    .file_type()
                    .map(|t| t.is_dir())
                    .unwrap_or(false)
                {
                    continue;
                }
                let champion_dir_name = champion_entry.file_name().to_string_lossy().to_string();
                let champion_name = decode_path(&champion_dir_name);

                if let Ok(skin_entries) = fs::read_dir(champion_entry.path()) {
                    for skin_entry in skin_entries.flatten() {
                        if !skin_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            continue;
                        }
                        let skin_dir_name = skin_entry.file_name().to_string_lossy().to_string();
                        let zip_path = skin_entry.path().join(format!("{}.zip", &skin_dir_name));

                        if fs::symlink_metadata(&zip_path)
                            .map(|m| m.is_file() && m.len() > 0)
                            .unwrap_or(false)
                        {
                            skins.push(DownloadedSkin {
                                champion_name: champion_name.clone(),
                                skin_name: decode_path(&skin_dir_name),
                                zip_path: zip_path.to_string_lossy().into_owned(),
                            });
                        }
                    }
                }
            }

            skins.sort_by(|a, b| {
                (&a.champion_name, &a.skin_name).cmp(&(&b.champion_name, &b.skin_name))
            });
            Ok(skins)
        })
        .await,
    )
}

#[tauri::command]
pub async fn delete_downloaded_skin(
    app: AppHandle,
    champion_name: String,
    skin_name: String,
) -> Result<(), String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = LIBRARY_LOCK.lock().map_err(|e| e.to_string())?;
            let skin_dir = skin_folder(&base, &champion_name, &skin_name)?;
            if skin_dir.exists() {
                fs::remove_dir_all(&skin_dir).map_err(|e| e.to_string())?;
            }

            let champion_dir = base.join(encode_path(&champion_name)?);
            if champion_dir.exists() {
                if champion_dir
                    .read_dir()
                    .map(|mut d| d.next().is_none())
                    .unwrap_or(false)
                {
                    fs::remove_dir(&champion_dir).ok();
                }
            }

            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn get_skins_dir_size(app: AppHandle) -> Result<u64, String> {
    let base = skins_dir(&app);
    flatten(tauri::async_runtime::spawn_blocking(move || Ok(dir_size(&base))).await)
}

#[tauri::command]
pub async fn clear_all_skins(app: AppHandle) -> Result<(), String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = LIBRARY_LOCK.lock().map_err(|e| e.to_string())?;
            if base.exists() {
                fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
                fs::create_dir_all(&base).ok();
            }
            Ok(())
        })
        .await,
    )
}

use super::dir_size;

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "cstmskn-download-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn names_cannot_escape_or_collide_with_slash_encoding() {
        for name in ["", ".", "..", "%2F", "a\\b", "bad\nname"] {
            assert!(encode_path(name).is_err(), "{name:?}");
        }
        assert_eq!(encode_path("K/DA Kai'Sa").unwrap(), "K%2FDA Kai'Sa");
        assert_eq!(decode_path("K%2FDA Kai'Sa"), "K/DA Kai'Sa");
    }
    #[test]
    fn catalog_downloads_cannot_fetch_local_or_arbitrary_urls() {
        assert!(catalog_url("https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/skins/1/1001/1001.fantome").is_ok());
        for url in [
            "http://127.0.0.1/private",
            "file:///etc/passwd",
            "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/skins/../secret.zip",
            "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/skins/%2e%2e/x.zip",
        ] {
            assert!(catalog_url(url).is_err());
        }
    }
    #[test]
    fn failed_or_truncated_download_never_replaces_existing_skin() {
        let dir = temp();
        let path = dir.join("skin.zip");
        fs::write(&path, b"previous").unwrap();
        assert!(copy_package(&b"not a zip"[..], &path).is_err());
        assert!(copy_package(&b"PK\x03\x04truncated"[..], &path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"previous");
        assert!(!path.with_extension("download").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn valid_download_replaces_skin_atomically() {
        let dir = temp();
        let fixture = dir.join("fixture.txt");
        fs::write(&fixture, b"skin fixture").unwrap();
        let archive = dir.join("valid.zip");
        assert!(std::process::Command::new("/usr/bin/zip")
            .current_dir(&dir)
            .args(["-q", "valid.zip", "fixture.txt"])
            .status()
            .unwrap()
            .success());
        let destination = dir.join("installed.zip");
        fs::write(&destination, b"previous").unwrap();
        copy_package(fs::File::open(&archive).unwrap(), &destination).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), fs::read(&archive).unwrap());
        assert!(!destination.with_extension("download").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn library_does_not_follow_symlink_directories() {
        let dir = temp();
        let outside = temp();
        std::os::unix::fs::symlink(&outside, dir.join("Champion")).unwrap();
        assert!(skin_folder(&dir, "Champion", "Skin").is_err());
        fs::remove_dir_all(dir).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
