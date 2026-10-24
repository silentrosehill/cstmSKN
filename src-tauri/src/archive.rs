//! Read-only ZIP inspection shared by imports and downloads. Never extracts files.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
const MAX_FILES: usize = 100_000;
const MAX_CENTRAL_DIRECTORY: u64 = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED: u64 = 4 * 1024 * 1024 * 1024;
fn check_directory(file: &mut File) -> Result<(), String> {
    let directory = (|| {
        let len = file.metadata().ok()?.len();
        let mut tail = vec![0; len.min(65_557) as usize];
        let start = len - tail.len() as u64;
        file.seek(SeekFrom::Start(start)).ok()?;
        file.read_exact(&mut tail).ok()?;
        let pos = (0..tail.len().saturating_sub(21)).rev().find(|&i| {
            tail[i..i + 4] == [0x50, 0x4b, 0x05, 0x06]
                && i + 22 + u16::from_le_bytes([tail[i + 20], tail[i + 21]]) as usize == tail.len()
        })?;
        let mut entries = u16::from_le_bytes(tail[pos + 10..pos + 12].try_into().ok()?) as u64;
        let mut size = u32::from_le_bytes(tail[pos + 12..pos + 16].try_into().ok()?) as u64;
        if entries == u16::MAX as u64 || size == u32::MAX as u64 {
            let locator_pos = (start + pos as u64).checked_sub(20)?;
            let mut locator = [0; 20];
            file.seek(SeekFrom::Start(locator_pos)).ok()?;
            file.read_exact(&mut locator).ok()?;
            if locator[..4] != [0x50, 0x4b, 0x06, 0x07]
                || u32::from_le_bytes(locator[4..8].try_into().ok()?) != 0
                || u32::from_le_bytes(locator[16..20].try_into().ok()?) != 1
            {
                return None;
            }
            let offset = u64::from_le_bytes(locator[8..16].try_into().ok()?);
            if offset.checked_add(56)? > locator_pos {
                return None;
            }
            let mut record = [0; 56];
            file.seek(SeekFrom::Start(offset)).ok()?;
            file.read_exact(&mut record).ok()?;
            let record_size = u64::from_le_bytes(record[4..12].try_into().ok()?);
            if record[..4] != [0x50, 0x4b, 0x06, 0x06]
                || record_size < 44
                || offset.checked_add(12)?.checked_add(record_size)? != locator_pos
            {
                return None;
            }
            entries = u64::from_le_bytes(record[32..40].try_into().ok()?);
            size = u64::from_le_bytes(record[40..48].try_into().ok()?);
        }
        Some((entries, size, len))
    })();
    let (entries, size, len) = directory.ok_or("This file is not a valid mod archive.")?;
    if entries > MAX_FILES as u64 {
        return Err("Archive contains too many files.".into());
    }
    if size > MAX_CENTRAL_DIRECTORY || size > len {
        return Err("This file is not a valid mod archive.".into());
    }
    file.rewind().map_err(|e| e.to_string())?;
    Ok(())
}
pub fn listing(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    check_directory(&mut file)?;
    let mut archive = zip::ZipArchive::new(file)
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
    fn fixture_path() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        // Clock readings can repeat across tests running at the same time.
        std::env::temp_dir().join(format!(
            "cstmskn-archive-{}-{}-{}.zip",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn listing_bytes(bytes: &[u8]) -> Result<String, String> {
        let path = fixture_path();
        std::fs::write(&path, bytes).unwrap();
        let result = listing(&path);
        std::fs::remove_file(path).unwrap();
        result
    }
    fn zip64_directory(entries: u64, size: u64) -> Vec<u8> {
        let mut bytes = vec![0; 98];
        bytes[..4].copy_from_slice(&0x06064b50u32.to_le_bytes());
        bytes[4..12].copy_from_slice(&44u64.to_le_bytes());
        bytes[24..32].copy_from_slice(&entries.to_le_bytes());
        bytes[32..40].copy_from_slice(&entries.to_le_bytes());
        bytes[40..48].copy_from_slice(&size.to_le_bytes());
        bytes[56..60].copy_from_slice(&0x07064b50u32.to_le_bytes());
        bytes[72..76].copy_from_slice(&1u32.to_le_bytes());
        bytes[76..80].copy_from_slice(&0x06054b50u32.to_le_bytes());
        bytes[84..88].fill(0xff);
        bytes[88..92].fill(0xff);
        bytes
    }
    #[test]
    fn archive_rejects_excessive_entry_count() {
        let bytes = zip64_directory(MAX_FILES as u64 + 1, 0);
        assert_eq!(
            listing_bytes(&bytes).unwrap_err(),
            "Archive contains too many files."
        );
    }
    #[test]
    fn archive_accepts_small_zip() {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        zip.start_file("fixture.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"fixture").unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        assert_eq!(listing_bytes(&bytes).unwrap(), "fixture.txt");
    }
    #[test]
    fn archive_rejects_missing_eocd() {
        assert_eq!(
            listing_bytes(b"not a ZIP archive").unwrap_err(),
            "This file is not a valid mod archive."
        );
    }
    #[test]
    fn archive_rejects_invalid_directory_sizes_and_zip64_locators() {
        let mut eocd = vec![0; 22];
        eocd[..4].copy_from_slice(&0x06054b50u32.to_le_bytes());
        for size in [23, MAX_CENTRAL_DIRECTORY as u32 + 1, u32::MAX] {
            eocd[12..16].copy_from_slice(&size.to_le_bytes());
            assert_eq!(
                listing_bytes(&eocd).unwrap_err(),
                "This file is not a valid mod archive."
            );
        }
        for size in [99, MAX_CENTRAL_DIRECTORY + 1, u64::MAX] {
            assert_eq!(
                listing_bytes(&zip64_directory(0, size)).unwrap_err(),
                "This file is not a valid mod archive."
            );
        }
        let mut bytes = zip64_directory(0, 0);
        bytes[56] = 0;
        assert_eq!(
            listing_bytes(&bytes).unwrap_err(),
            "This file is not a valid mod archive."
        );
    }
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
            let path = fixture_path();
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
