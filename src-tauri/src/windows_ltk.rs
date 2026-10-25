//! Discover LTK with Windows APIs; no script host or execution-policy changes.
use std::{
    collections::HashSet,
    mem::{size_of, zeroed},
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_NO_MORE_FILES, INVALID_HANDLE_VALUE},
    Security::WinTrust::*,
    Storage::FileSystem::*,
    System::{
        Diagnostics::ToolHelp::*, RemoteDesktop::ProcessIdToSessionId,
        Threading::GetCurrentProcessId,
    },
};
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey,
};

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}

pub fn running() -> Result<bool, String> {
    // Limit detection to this interactive session; another user's tray cannot be reused.
    unsafe {
        let mut session = 0;
        if ProcessIdToSessionId(GetCurrentProcessId(), &mut session) == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error().to_string());
        }
        struct Snapshot(windows_sys::Win32::Foundation::HANDLE);
        impl Drop for Snapshot {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let _snapshot = Snapshot(snapshot);
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snapshot, &mut entry);
        while ok != 0 {
            let length = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..length])
                .eq_ignore_ascii_case("ltk-manager.exe")
            {
                let mut other = 0;
                if ProcessIdToSessionId(entry.th32ProcessID, &mut other) != 0 && other == session {
                    return Ok(true);
                }
            }
            ok = Process32NextW(snapshot, &mut entry);
        }
        let error = GetLastError();
        if error != ERROR_NO_MORE_FILES {
            return Err(format!("Windows process check failed ({error})."));
        }
        Ok(false)
    }
}

pub fn verify_signature(path: &Path) -> Result<(), String> {
    let name = wide(path.as_os_str());
    unsafe {
        let mut file: WINTRUST_FILE_INFO = zeroed();
        file.cbStruct = size_of::<WINTRUST_FILE_INFO>() as u32;
        file.pcwszFilePath = name.as_ptr();
        let mut trust: WINTRUST_DATA = zeroed();
        trust.cbStruct = size_of::<WINTRUST_DATA>() as u32;
        trust.dwUIChoice = WTD_UI_NONE;
        trust.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN;
        trust.dwProvFlags = WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT;
        trust.dwUnionChoice = WTD_CHOICE_FILE;
        trust.Anonymous.pFile = &mut file;
        trust.dwStateAction = WTD_STATEACTION_VERIFY;
        let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
        let status = WinVerifyTrust(
            INVALID_HANDLE_VALUE,
            &mut action,
            (&mut trust as *mut WINTRUST_DATA).cast(),
        );
        trust.dwStateAction = WTD_STATEACTION_CLOSE;
        WinVerifyTrust(
            INVALID_HANDLE_VALUE,
            &mut action,
            (&mut trust as *mut WINTRUST_DATA).cast(),
        );
        if status == 0 {
            Ok(())
        } else {
            Err(format!("Windows could not verify {} (trust error 0x{:08X}). Check the file’s Digital Signatures tab and Windows certificate/network availability.", path.display(), status as u32))
        }
    }
}

fn product(path: &Path) -> Result<(String, [u16; 4]), String> {
    let name = wide(path.as_os_str());
    unsafe {
        let size = GetFileVersionInfoSizeW(name.as_ptr(), std::ptr::null_mut());
        if size == 0 || size > 1024 * 1024 {
            return Err("LTK executable has no readable version information.".into());
        }
        // Word storage keeps the fixed version structure aligned.
        let mut data = vec![0u64; (size as usize + 7) / 8];
        if GetFileVersionInfoW(name.as_ptr(), 0, size, data.as_mut_ptr().cast()) == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let mut pointer = std::ptr::null_mut();
        let mut length = 0;
        let root = wide(std::ffi::OsStr::new("\\"));
        if VerQueryValueW(
            data.as_ptr().cast(),
            root.as_ptr(),
            &mut pointer,
            &mut length,
        ) == 0
            || length < size_of::<VS_FIXEDFILEINFO>() as u32
            || pointer.is_null()
        {
            return Err("LTK executable version information is invalid.".into());
        }
        let fixed = std::ptr::read_unaligned(pointer.cast::<VS_FIXEDFILEINFO>());
        if fixed.dwSignature != 0xFEEF04BD {
            return Err("Invalid executable version signature.".into());
        }
        let version = [
            (fixed.dwProductVersionMS >> 16) as u16,
            fixed.dwProductVersionMS as u16,
            (fixed.dwProductVersionLS >> 16) as u16,
            fixed.dwProductVersionLS as u16,
        ];
        let translations = wide(std::ffi::OsStr::new("\\VarFileInfo\\Translation"));
        let mut languages = vec![(0x0409, 0x04b0), (0x0000, 0x04b0)];
        if VerQueryValueW(
            data.as_ptr().cast(),
            translations.as_ptr(),
            &mut pointer,
            &mut length,
        ) != 0
            && !pointer.is_null()
        {
            let entries = std::slice::from_raw_parts(pointer.cast::<u16>(), length as usize / 2);
            for pair in entries.chunks_exact(2) {
                languages.insert(0, (pair[0], pair[1]));
            }
        }
        for (language, codepage) in languages {
            let key = wide(std::ffi::OsStr::new(&format!(
                "\\StringFileInfo\\{language:04x}{codepage:04x}\\ProductName"
            )));
            if VerQueryValueW(
                data.as_ptr().cast(),
                key.as_ptr(),
                &mut pointer,
                &mut length,
            ) != 0
                && !pointer.is_null()
                && length > 0
            {
                let text = std::slice::from_raw_parts(pointer.cast::<u16>(), length as usize);
                return Ok((
                    String::from_utf16_lossy(text)
                        .trim_end_matches('\0')
                        .to_string(),
                    version,
                ));
            }
        }
        Err("LTK executable has no product name.".into())
    }
}

pub fn validate(path: &Path) -> Result<(), String> {
    if !path
        .file_name()
        .is_some_and(|v| v.to_string_lossy().eq_ignore_ascii_case("ltk-manager.exe"))
    {
        return Err("Choose the installed ltk-manager.exe.".into());
    }
    let (name, version) = product(path)?;
    if name != "LTK Manager" {
        return Err("The selected file is not LTK Manager.".into());
    }
    if version < [1, 30, 4, 0] {
        return Err("Install official LTK Manager 1.30.4 or later.".into());
    }
    verify_signature(path)
}

fn registered(root: &RegKey) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for name in root.enum_keys().flatten() {
        let Ok(key) = root.open_subkey(name) else {
            continue;
        };
        if key.get_value::<String, _>("DisplayName").ok().as_deref() != Some("LTK Manager") {
            continue;
        }
        if let Ok(folder) = key.get_value::<String, _>("InstallLocation") {
            if !folder.trim().is_empty() {
                paths.push(PathBuf::from(folder.trim_matches('"')).join("ltk-manager.exe"));
            }
        }
        if let Ok(icon) = key.get_value::<String, _>("DisplayIcon") {
            let exe = if let Some(quoted) = icon.strip_prefix('"') {
                quoted.split('"').next().unwrap_or("")
            } else {
                icon.rsplit_once(',').map_or(icon.as_str(), |(p, _)| p)
            };
            if !exe.is_empty() {
                paths.push(PathBuf::from(exe));
            }
        }
    }
    paths
}

pub fn locate() -> Result<Option<PathBuf>, String> {
    let mut paths = Vec::new();
    for (hive, key) in [
        (
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ] {
        if let Ok(root) = RegKey::predef(hive).open_subkey(key) {
            paths.extend(registered(&root));
        }
    }
    for name in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(root) = std::env::var_os(name) {
            paths.push(PathBuf::from(root).join("LTK Manager/ltk-manager.exe"));
        }
    }
    let mut seen = HashSet::new();
    let mut errors = Vec::new();
    for path in paths {
        if !seen.insert(path.to_string_lossy().to_lowercase()) || !path.is_file() {
            continue;
        }
        match validate(&path) {
            Ok(()) => return Ok(Some(path)),
            Err(error) => errors.push(error),
        }
    }
    if errors.is_empty() {
        Ok(None)
    } else {
        Err(errors.join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../native-build/ltk-official-fixture/ltk-manager.exe")
    }
    #[test]
    fn actual_official_executable_has_supported_metadata_and_trusted_signature() {
        let path = fixture();
        let (name, version) = product(&path).unwrap();
        assert_eq!(name, "LTK Manager");
        assert_eq!(version, [1, 30, 4, 0]);
        validate(&path).unwrap();
    }
    #[test]
    fn invalid_file_is_not_accepted_as_a_signed_manager() {
        let file =
            std::env::temp_dir().join(format!("cstmskn-untrusted-{}.exe", std::process::id()));
        std::fs::write(&file, b"MZnot signed").unwrap();
        let error = verify_signature(&file).unwrap_err();
        assert!(error.contains("trust error 0x"));
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    fn reads_real_registry_entries_without_requiring_install_location() {
        let folder =
            std::env::temp_dir().join(format!("cstmskn-LTK-é-测试-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let installed = folder.join("ltk-manager.exe");
        std::fs::copy(fixture(), &installed).unwrap();
        let hive = RegKey::predef(HKEY_CURRENT_USER);
        let key = format!(r"Software\cstmSKNTests\Discovery-{}", std::process::id());
        let (root, _) = hive.create_subkey(&key).unwrap();
        let (entry, _) = root.create_subkey("official").unwrap();
        entry.set_value("DisplayName", &"LTK Manager").unwrap();
        let icon = format!("\"{}\",0", installed.display());
        entry.set_value("DisplayIcon", &icon).unwrap();
        let paths = registered(&root);
        assert_eq!(paths, vec![installed.clone()]);
        validate(&paths[0]).unwrap();
        drop(entry);
        drop(root);
        hive.delete_subkey_all(key).unwrap();
        std::fs::remove_file(installed).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
    #[test]
    fn process_enumeration_does_not_require_powershell() {
        running().unwrap();
    }
}
