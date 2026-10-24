//! Read-only ZIP inspection shared by imports and downloads. Never extracts files.
use std::{fs::File, path::Path};
const MAX_FILES: usize = 100_000;
const MAX_UNCOMPRESSED: u64 = 4 * 1024 * 1024 * 1024;
pub fn listing(path: &Path) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(File::open(path).map_err(|e| e.to_string())?)
        .map_err(|_| "This file is not a valid mod archive.".to_string())?;
    if archive.len() > MAX_FILES {
        return Err("Archive contains too many files.".into());
    }
    let mut total = 0u64;
    let mut names = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().map_err(|e| e.to_string())?.replace('\\', "/");
        if name.starts_with('/')
            || name.split('/').any(|v| v == ".." || v.contains(':'))
            || name.chars().any(char::is_control)
            || file
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Archive contains unsafe file paths.".into());
        }
        total = total
            .checked_add(file.size())
            .ok_or("Archive is too large.")?;
        if total > MAX_UNCOMPRESSED {
            return Err("Archive expands beyond 4 GB.".into());
        }
        names.push(name);
    }
    Ok(names.join("\n"))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn archive_rejects_parent_paths_and_accepts_unicode_names() {
        for (name, valid) in [
            ("WAD/Ahri.wad.client", true),
            ("META/日本語.txt", true),
            ("../outside", false),
            ("/absolute", false),
            ("C:/outside", false),
            ("a\\..\\b", false),
        ] {
            let path = std::env::temp_dir().join(format!(
                "cstmskn-archive-{}-{}.zip",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let mut zip = zip::ZipWriter::new(File::create(&path).unwrap());
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"fixture").unwrap();
            zip.finish().unwrap();
            assert_eq!(listing(&path).is_ok(), valid, "{name}");
            std::fs::remove_file(path).unwrap();
        }
    }
}
