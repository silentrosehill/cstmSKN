use crate::state::CustomEntry;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static IMPORT_LOCK: Mutex<()> = Mutex::new(());
const KINDS: &[&str] = &["skin", "announcer", "voice", "map", "other"];

fn archive_listing(path: &Path) -> Result<String, String> {
    let listing = crate::archive::listing(path)?;
    validate_listing(&listing)?;
    Ok(listing)
}

fn validate_listing(listing: &str) -> Result<(), String> {
    for line in listing.lines() {
        let path = line.replace('\\', "/");
        if path.starts_with('/')
            || path
                .split('/')
                .any(|part| part == ".." || part.contains(':'))
        {
            return Err("The archive contains unsafe file paths.".into());
        }
    }
    // The existing engine imports ready-to-use Fantome packages. Loose audio
    // files are not a mod and cannot be installed by pretending they are one.
    let names: Vec<String> = listing
        .lines()
        .map(|line| line.replace('\\', "/").to_ascii_lowercase())
        .collect();
    if !names.iter().any(|p| p == "meta/info.json")
        || !names
            .iter()
            .any(|p| p.starts_with("wad/") && p.contains(".wad"))
    {
        return Err("Choose a ready-to-use mod with META/info.json and WAD assets, or a .wad / .wad.client file.".into());
    }
    Ok(())
}

#[cfg(test)]
fn archive_targets(path: &Path) -> Vec<String> {
    archive_listing(path)
        .map(|listing| targets_from_listing(&listing))
        .unwrap_or_default()
}

fn targets_from_listing(listing: &str) -> Vec<String> {
    let mut targets = Vec::new();
    for line in listing.lines() {
        let normalized = line.replace('\\', "/").to_ascii_lowercase();
        let parts: Vec<&str> = normalized
            .split('/')
            .filter(|part| !part.is_empty())
            .collect();
        // Fantome supports both packed WAD files and loose files inside WAD-name folders.
        for (index, part) in parts.iter().enumerate() {
            if let Some(stem) = part
                .strip_suffix(".wad.client")
                .or_else(|| part.strip_suffix(".wad"))
            {
                let champion = stem.split('.').next().unwrap_or_default();
                if !champion.is_empty() {
                    targets.push(champion.to_string());
                }
            }
            // Also recognize unpacked game asset layouts, including wrappers.
            if *part == "characters" && index > 0 && ["assets", "data"].contains(&parts[index - 1])
            {
                if let Some(champion) = parts.get(index + 1) {
                    targets.push(champion.to_string());
                }
            }
        }
    }
    targets.sort();
    targets.dedup();
    targets
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
    res.map_err(|e| e.to_string())?
}

fn safe_name(name: &str) -> Result<String, String> {
    let mut name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || ['-', '_', ' ', '.'].contains(c))
        .collect::<String>()
        .trim()
        .to_string();
    for suffix in [".wad.client", ".fantome", ".zip", ".wad"] {
        if name.to_ascii_lowercase().ends_with(suffix) {
            name.truncate(name.len() - suffix.len());
            break;
        }
    }
    name = name.trim().to_string();
    if name.is_empty() || name == "." || name == ".." {
        return Err("Invalid mod name".into());
    }
    #[cfg(target_os = "windows")]
    {
        name = name.trim_end_matches(['.', ' ']).to_owned();
        let stem = name.split('.').next().unwrap_or_default().to_ascii_uppercase();
        if ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&stem.as_str()) { name.insert(0, '_'); }
        if name.is_empty() { return Err("Invalid mod name".into()); }
    }
    Ok(name)
}

fn infer_kind(name: &str, listing: &str) -> &'static str {
    let text = format!("{} {}", name, listing).to_ascii_lowercase();
    if text.contains("announcer") {
        "announcer"
    } else if text.contains("map11.wad")
        || text.contains("map12.wad")
        || text.contains("map21.wad")
        || text.contains("maps/shipping/")
    {
        "map"
    } else if text.contains("voice") || text.contains("voiceover") {
        "voice"
    } else {
        "skin"
    }
}

fn entry(path: &Path) -> CustomEntry {
    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let name = safe_name(filename).unwrap_or_else(|_| filename.into());
    let listing = if filename.ends_with(".zip") || filename.ends_with(".fantome") {
        archive_listing(path).unwrap_or_default()
    } else {
        filename.into()
    };
    // Missing metadata means an existing custom skin; keep migration lossless.
    let kind = fs::read_to_string(path.with_file_name(format!("{}.category.json", filename)))
        .ok()
        .and_then(|data| serde_json::from_str::<String>(&data).ok())
        .filter(|kind| KINDS.contains(&kind.as_str()))
        .unwrap_or_else(|| "skin".into());
    CustomEntry {
        name,
        kind,
        champions: targets_from_listing(&listing),
        file_path: path.to_string_lossy().into_owned(),
    }
}

fn mod_extension(path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    ["wad.client", "fantome", "zip", "wad"]
        .into_iter()
        .find(|ext| name.ends_with(&format!(".{}", ext)))
}

fn import_into(
    base: &Path,
    src: &Path,
    name: &str,
    kind: Option<String>,
) -> Result<CustomEntry, String> {
    let ext = mod_extension(src).ok_or("Choose a .fantome, .zip, .wad or .wad.client file.")?;
    if !src.is_file() {
        return Err("File not found".into());
    }
    let listing = if ["zip", "fantome"].contains(&ext) {
        archive_listing(src)?
    } else {
        let mut header = [0u8; 2];
        fs::File::open(src)
            .and_then(|mut file| file.read_exact(&mut header))
            .map_err(|_| "Could not read WAD")?;
        if !header.starts_with(b"RW") {
            return Err("This file is not a League WAD archive.".into());
        }
        src.file_name().unwrap().to_string_lossy().into_owned()
    };
    let kind = kind.unwrap_or_else(|| infer_kind(&name, &listing).into());
    if !KINDS.contains(&kind.as_str()) {
        return Err("Unknown mod category".into());
    }
    let original = safe_name(name)?;
    let mut display = original.clone();
    let mut count = 2;
    // Never overwrite an existing import, including one using another extension.
    while ["zip", "fantome", "wad", "wad.client"]
        .iter()
        .any(|ext| base.join(format!("{}.{}", display, ext)).exists())
    {
        display = format!("{} {}", original, count);
        count += 1;
    }
    let dest = base.join(format!("{}.{}", display, ext));
    let category = dest.with_file_name(format!(
        "{}.category.json",
        dest.file_name().unwrap().to_string_lossy()
    ));
    // create_new plus the import lock also protects concurrent imports.
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&dest)
        .map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        std::io::copy(
            &mut fs::File::open(src).map_err(|e| e.to_string())?,
            &mut output,
        )
        .map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
        fs::write(&category, serde_json::to_string(&kind).unwrap()).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&dest);
        let _ = fs::remove_file(&category);
        return Err(error);
    }
    let mut imported = entry(&dest);
    imported.champions = targets_from_listing(&listing);
    Ok(imported)
}

#[tauri::command]
pub async fn import_custom(
    app: AppHandle,
    src_path: String,
    name: String,
    kind: Option<String>,
) -> Result<CustomEntry, String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = IMPORT_LOCK.lock().map_err(|_| "Import is unavailable")?;
            import_into(&base, Path::new(&src_path), &name, kind)
        })
        .await,
    )
}

#[tauri::command]
pub async fn list_customs(app: AppHandle) -> Result<Vec<CustomEntry>, String> {
    let base = customs_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let mut customs: Vec<_> = fs::read_dir(base)
                .map_err(|e| e.to_string())?
                .flatten()
                .map(|e| e.path())
                .filter(|path| path.is_file() && mod_extension(path).is_some())
                .map(|path| entry(&path))
                .collect();
            customs.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(customs)
        })
        .await,
    )
}

#[tauri::command]
pub async fn set_custom_kind(app: AppHandle, name: String, kind: String) -> Result<(), String> {
    if !KINDS.contains(&kind.as_str()) {
        return Err("Unknown mod category".into());
    }
    let base = customs_dir(&app);
    let name = safe_name(&name)?;
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = IMPORT_LOCK.lock().map_err(|_| "Import is unavailable")?;
            let path = ["zip", "fantome", "wad", "wad.client"]
                .iter()
                .map(|ext| base.join(format!("{}.{}", name, ext)))
                .find(|path| path.is_file())
                .ok_or("Mod not found")?;
            let category = path.with_file_name(format!(
                "{}.category.json",
                path.file_name().unwrap().to_string_lossy()
            ));
            fs::write(category, serde_json::to_string(&kind).unwrap()).map_err(|e| e.to_string())
        })
        .await,
    )
}

#[tauri::command]
pub async fn remove_custom(app: AppHandle, name: String) -> Result<(), String> {
    let base = customs_dir(&app);
    let name = safe_name(&name)?;
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = IMPORT_LOCK.lock().map_err(|_| "Import is unavailable")?;
            for ext in ["zip", "fantome", "wad", "wad.client"] {
                let path = base.join(format!("{}.{}", name, ext));
                if path.exists() {
                    fs::remove_file(&path).map_err(|e| e.to_string())?;
                    let _ = fs::remove_file(path.with_file_name(format!(
                        "{}.category.json",
                        path.file_name().unwrap().to_string_lossy()
                    )));
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
            let _guard = IMPORT_LOCK.lock().map_err(|_| "Import is unavailable")?;
            if base.exists() {
                fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
                fs::create_dir_all(&base).map_err(|e| e.to_string())?;
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
    use super::{
        archive_targets, entry, import_into, infer_kind, safe_name, targets_from_listing,
        validate_listing,
    };
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_import_names_cannot_be_device_names() {
        assert_eq!(safe_name("CON.fantome").unwrap(), "_CON");
        assert_eq!(safe_name("AUX.zip").unwrap(), "_AUX");
        assert_eq!(safe_name("My Custom Skin.fantome").unwrap(), "My Custom Skin");
    }
    #[test]
    fn imports_preserve_categories_and_never_overwrite_existing_archives() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "cstmskn-mod-persistence-{}-{}",
            std::process::id(),
            stamp
        ));
        std::fs::create_dir_all(root.join("META")).unwrap();
        std::fs::create_dir_all(root.join("WAD/Ahri.wad.client")).unwrap();
        std::fs::create_dir_all(root.join("imports")).unwrap();
        std::fs::write(root.join("META/info.json"), b"{}").unwrap();
        std::fs::write(root.join("WAD/Ahri.wad.client/a.bin"), b"fixture").unwrap();
        let source = root.join("voice.fantome");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&source).unwrap());
        for name in ["META/info.json", "WAD/Ahri.wad.client/a.bin"] {
            use std::io::Write;
            zip.start_file(name, zip::write::SimpleFileOptions::default()).unwrap(); zip.write_all(b"fixture").unwrap();
        }
        zip.finish().unwrap();
        let first =
            import_into(&root.join("imports"), &source, "Fox", Some("voice".into())).unwrap();
        assert_eq!(first.kind, "voice");
        assert_eq!(first.champions, vec!["ahri"]);
        let second =
            import_into(&root.join("imports"), &source, "Fox", Some("skin".into())).unwrap();
        assert_eq!(second.name, "Fox 2");
        assert_eq!(entry(std::path::Path::new(&first.file_path)).kind, "voice");
        assert_eq!(entry(std::path::Path::new(&second.file_path)).kind, "skin");
        assert_eq!(
            std::fs::read(&source).unwrap(),
            std::fs::read(&first.file_path).unwrap()
        );
        // Removing metadata models an existing pre-categories custom import.
        std::fs::remove_file(format!("{}.category.json", first.file_path)).unwrap();
        assert_eq!(entry(std::path::Path::new(&first.file_path)).kind, "skin");
        assert!(import_into(
            &root.join("imports"),
            &source,
            "Invalid",
            Some("bad-category".into())
        )
        .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_unsafe_and_non_mod_archives() {
        assert!(validate_listing("META/info.json\nWAD/Map11.wad.client\n../../evil").is_err());
        assert!(validate_listing("META/info.json\nWAD/Map11.wad.client\nC:/evil").is_err());
        assert!(validate_listing("voice.mp3").is_err());
        assert!(validate_listing("META/info.json\nWAD/Map11.wad.client").is_ok());
        assert!(safe_name("..").is_err());
    }
    #[test]
    fn recognizes_game_mod_categories() {
        assert_eq!(
            infer_kind("Announcer pack", "WAD/Map11.wad.client"),
            "announcer"
        );
        assert_eq!(infer_kind("Winter", "WAD/Map11.wad.client"), "map");
        assert_eq!(infer_kind("JP voice", "WAD/Ahri.ja_JP.wad.client"), "voice");
        assert_eq!(infer_kind("Fox", "WAD/Ahri.wad.client"), "skin");
    }
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
        assert_eq!(
            targets_from_listing(
                "WAD\\Ahri.wad.client\\a.bin\nassets/characters/Camille/skins/skin0.bin\n"
            ),
            vec!["ahri", "camille"]
        );
    }
    #[test]
    fn unrelated_files_do_not_become_champions() {
        assert!(targets_from_listing("META/info.json\nportrait.png\nWAD/\n").is_empty());
    }
    #[test]
    fn detects_loose_champion_files_inside_a_real_archive() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "cstmskn-import-fixture-{}-{}",
            std::process::id(),
            stamp
        ));
        let wad = root.join("WAD/Camille.wad.client");
        std::fs::create_dir_all(&wad).unwrap();
        std::fs::write(wad.join("aabbcc.bin"), b"fixture").unwrap();
        std::fs::create_dir_all(root.join("META")).unwrap();
        std::fs::write(root.join("META/info.json"), b"{}").unwrap();
        let archive = root.join("fixture.fantome");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
        for name in ["META/info.json", "WAD/Camille.wad.client/aabbcc.bin"] {
            use std::io::Write;
            zip.start_file(name, zip::write::SimpleFileOptions::default()).unwrap(); zip.write_all(b"fixture").unwrap();
        }
        zip.finish().unwrap();
        let targets = archive_targets(&archive);
        std::fs::remove_dir_all(root).unwrap();
        assert_eq!(targets, vec!["camille"]);
    }
}
