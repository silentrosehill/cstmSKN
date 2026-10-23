use crate::state::CustomEntry;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};


/// Read archive paths only; no extraction or modification of the mod.
fn archive_targets(path: &Path) -> Vec<String> {
    Command::new("/usr/bin/unzip").args(["-Z1"]).arg(path).output()
        .ok().filter(|out| out.status.success())
        .map(|out| targets_from_listing(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or_default()
}

fn targets_from_listing(listing: &str) -> Vec<String> {
    let mut targets = Vec::new();
    for line in listing.lines() {
        let normalized = line.replace('\\', "/").to_ascii_lowercase();
        let parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
        // Fantome supports both packed WAD files and loose files inside WAD-name folders.
        for (index, part) in parts.iter().enumerate() {
            if let Some(stem) = part.strip_suffix(".wad.client") {
                let champion = stem.split('.').next().unwrap_or_default();
                if !champion.is_empty() { targets.push(champion.to_string()); }
            }
            // Also recognize unpacked game asset layouts, including wrappers.
            if *part == "characters" && index > 0 && ["assets", "data"].contains(&parts[index - 1]) {
                if let Some(champion) = parts.get(index + 1) { targets.push(champion.to_string()); }
            }
        }
    }
    targets.sort(); targets.dedup(); targets
}

fn customs_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("customs");
    fs::create_dir_all(&dir).ok();
    dir
}

fn flatten<T>(res: Result<Result<T, String>, impl std::fmt::Display>) -> Result<T, String> {
    match res {
        Ok(inner) => inner,
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn import_custom(
    app: AppHandle,
    src_path: String,
    name: String,
) -> Result<CustomEntry, String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let src = PathBuf::from(&src_path);

            let ext = src
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase());
            let ext_str = match ext.as_deref() {
                Some("zip") => "zip",
                Some("fantome") => "fantome",
                _ => return Err("File must be a .zip or .fantome".to_string()),
            };

            if !src.exists() {
                return Err("File not found".to_string());
            }

            // Sanitize name
            let mut safe_name: String = name
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ' || *c == '.')
                .collect::<String>()
                .trim()
                .to_string();

            // Defense: strip a trailing archive extension so we never produce
            // "Name.fantome.fantome" if the display name still carries one.
            for suffix in [".fantome", ".zip"] {
                if safe_name.to_lowercase().ends_with(suffix) {
                    safe_name.truncate(safe_name.len() - suffix.len());
                    safe_name = safe_name.trim().to_string();
                    break;
                }
            }

            if safe_name.is_empty() {
                return Err("Invalid mod name".to_string());
            }

            let ext = ext_str;
            let dest = base.join(format!("{}.{}", safe_name, ext));
            fs::copy(&src, &dest).map_err(|e| format!("Failed to copy mod: {}", e))?;

            Ok(CustomEntry {
                champions: archive_targets(&dest),
                name: safe_name,
                file_path: dest.to_string_lossy().into_owned(),
            })
        })
        .await,
    )
}

#[tauri::command]
pub async fn list_customs(app: AppHandle) -> Result<Vec<CustomEntry>, String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let mut customs = Vec::new();

            let entries = match fs::read_dir(&base) {
                Ok(e) => e,
                Err(_) => return Ok(customs),
            };

            for entry in entries.flatten() {
                let path = entry.path();
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase());
                if ext == Some("zip".to_string()) || ext == Some("fantome".to_string()) {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        customs.push(CustomEntry {
                            champions: archive_targets(&path),
                            name: stem.to_string(),
                            file_path: path.to_string_lossy().into_owned(),
                        });
                    }
                }
            }

            customs.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(customs)
        })
        .await,
    )
}

#[tauri::command]
pub async fn remove_custom(app: AppHandle, name: String) -> Result<(), String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            for ext in &["zip", "fantome"] {
                let path = base.join(format!("{}.{}", name, ext));
                if path.exists() {
                    fs::remove_file(&path).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn clear_all_customs(app: AppHandle) -> Result<(), String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            if base.exists() {
                fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
                fs::create_dir_all(&base).ok();
            }
            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn get_customs_dir_size(app: AppHandle) -> Result<u64, String> {
    let base = customs_dir(&app);
    flatten(tauri::async_runtime::spawn_blocking(move || Ok(super::dir_size(&base))).await)
}

#[cfg(test)]
mod tests {
    use super::{targets_from_listing, archive_targets};
    #[test]
    fn champion_targets_deduplicate_localized_wads() {
        assert_eq!(targets_from_listing("META/info.json\nWAD/Ahri.wad.client\nWAD/Ahri.en_US.wad.client\nNested/WAD/Camille.wad.client\n"), vec!["ahri", "camille"]);
    }
    #[test]
    fn loose_wad_folders_identify_the_champion() {
        assert_eq!(targets_from_listing("WAD/Camille.wad.client/\nWAD/Camille.wad.client/123456.bin\nWrapper/WAD/Camille.en_US.wad.client/sound.wem\n"), vec!["camille"]);
    }
    #[test]
    fn handles_windows_paths_and_unpacked_assets() {
        assert_eq!(targets_from_listing("WAD\\Ahri.wad.client\\a.bin\nassets/characters/Camille/skins/skin0.bin\n"), vec!["ahri", "camille"]);
    }
    #[test]
    fn unrelated_files_do_not_become_champions() {
        assert!(targets_from_listing("META/info.json\nportrait.png\nWAD/\n").is_empty());
    }
    #[test]
    fn detects_loose_champion_files_inside_a_real_archive() {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("cstmskn-import-fixture-{}-{}", std::process::id(), stamp));
        let wad = root.join("WAD/Camille.wad.client");
        std::fs::create_dir_all(&wad).unwrap();
        std::fs::write(wad.join("aabbcc.bin"), b"fixture").unwrap();
        let archive = root.join("fixture.fantome");
        let status = std::process::Command::new("/usr/bin/zip").current_dir(&root).args(["-qr", "fixture.fantome", "WAD"]).status().unwrap();
        assert!(status.success());
        let targets = archive_targets(&archive);
        std::fs::remove_dir_all(root).unwrap();
        assert_eq!(targets, vec!["camille"]);
    }

}
