//! Minimal LTK host protocol adapter. Default host validation remains enabled.
use crate::state::PatcherStatus;

/// Windows loader failures are distinct from game attachment failures. Keep
/// these codes unsigned: process exit codes arrive as signed i32 values in Rust.
pub fn loader_error(code: u32) -> Option<String> {
    match code {
        0xC0E90002 | 0xC0000428 | 577 | 1260 => Some(format!(
            "Windows blocked the LTK engine under its code-integrity policy (0x{code:08X}). No skins were applied. This preview is unsigned; a trusted signed release is needed. Keep Windows protections enabled."
        )),
        _ => None,
    }
}

pub fn host_exit_error(code: Option<i32>) -> String {
    if let Some(message) = code.and_then(|code| loader_error(code as u32)) {
        return message;
    }
    match code {
        Some(code) => format!(
            "LTK host exited (0x{:08X}). Check patcher diagnostics.",
            code as u32
        ),
        None => "LTK host exited unexpectedly. Check patcher diagnostics.".into(),
    }
}
pub fn configure(prefix: &str) -> Result<String, String> {
    if prefix.is_empty() || prefix.chars().any(char::is_control) {
        return Err("Invalid overlay directory".into());
    }
    let prefix = if prefix.ends_with(['\\', '/']) {
        prefix.to_owned()
    } else {
        format!("{prefix}\\")
    };
    Ok(format!(
        "config loglevel 16\nconfig flags 0\nconfig prefix {prefix}\nstart scan\n"
    ))
}
pub fn status(line: &str) -> Option<PatcherStatus> {
    // DLL diagnostics can arrive on either output stream, including after the
    // host reports an attached game. Attachment does not prove mods applied.
    let diagnostic = line.to_ascii_lowercase();
    for code in [0xC0E90002, 0xC0000428] {
        if diagnostic.contains(&format!("0x{code:08x}")) {
            return loader_error(code).map(PatcherStatus::Error);
        }
    }
    if diagnostic.contains("failed to load hook dll") {
        return Some(PatcherStatus::Error(
            "Windows could not load the LTK engine DLL. No skins were applied. This preview is unsigned and may be blocked by Windows security. Check the CodeIntegrity event log for the reason; keep Windows protections enabled.".into(),
        ));
    }
    if diagnostic.contains("host verification failed") {
        return Some(PatcherStatus::Error(
            "The LTK engine refused this launcher. No skins were applied. Changing administrator settings will not resolve this refusal.".into(),
        ));
    }
    let mut parts = line.splitn(4, ' ');
    match parts.next()? {
        "status" => {
            let _timestamp = parts.next()?;
            let state = parts.next()?;
            let message = parts.next().unwrap_or("");
            match state {
                "injecting" => Some(PatcherStatus::WaitingForGame),
                "injected" => Some(PatcherStatus::Patching),
                "waiting" => Some(PatcherStatus::InGame),
                "exited" => Some(PatcherStatus::GameExited),
                "failed" if message.contains("SetWindowsHookEx") => Some(PatcherStatus::Error(
                    "League is running as administrator, so the engine must too. Turn on “Run engine as administrator” in Settings → Windows engine, or stop running League as administrator.".into(),
                )),
                "failed" => Some(PatcherStatus::Error(format!("LTK: {message}"))),
                _ => None,
            }
        }
        "error" => Some(PatcherStatus::Error(line.splitn(3, ' ').nth(2).unwrap_or("LTK host error").into())),
        "dll" if line.to_ascii_lowercase().contains("wad scan failed") => Some(PatcherStatus::Error("LTK rejected a mod archive. Disable the affected mod and retry; game integrity checks remain enabled.".into())),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn policy_failures_are_not_mistaken_for_missing_game_or_bad_archives() {
        let exit = host_exit_error(Some(0xC0E90002_u32 as i32));
        assert!(exit.contains("Windows blocked"));
        assert!(exit.contains("0xC0E90002"));
        assert!(exit.contains("No skins were applied"));
        for code in [0xC0000428, 577, 1260] {
            assert!(loader_error(code)
                .unwrap()
                .contains("code-integrity policy"));
        }
        assert!(loader_error(193).is_none()); // Bad executable format is not proof of policy blocking.
        assert!(!host_exit_error(Some(1)).contains("Windows blocked"));
        for line in [
            "error 0.1 failed to load hook dll",
            "error 0.1 LoadLibrary failed: 0xc0e90002",
            "status 0.1 failed 0xC0000428",
        ] {
            assert!(matches!(status(line), Some(PatcherStatus::Error(_))));
        }
    }
    #[test]
    fn spaced_prefix_is_unquoted_and_never_injects_protocol_commands() {
        assert_eq!(configure("C:\\Users\\Name With Spaces\\overlay").unwrap(), "config loglevel 16\nconfig flags 0\nconfig prefix C:\\Users\\Name With Spaces\\overlay\\\nstart scan\n");
        for path in ["", "overlay\nstart passive", "overlay\rstop", "bad\0path"] {
            assert!(configure(path).is_err());
        }
    }
    #[test]
    fn hook_failure_explains_required_elevation() {
        assert_eq!(
            status("status 1.0 failed SetWindowsHookEx failed: 0x00000000"),
            Some(PatcherStatus::Error("League is running as administrator, so the engine must too. Turn on “Run engine as administrator” in Settings → Windows engine, or stop running League as administrator.".into()))
        );
    }
    #[test]
    fn host_verification_refusal_is_an_error_after_attachment() {
        for line in [
            "dll 3.4 8892 1 ERROR ltk_patcher_dll::verify: host verification failed, refusing overlay: [VRF00000008] (8892,ltk-manager.exe)",
            "ERROR ltk_patcher_dll::verify: host verification failed, refusing overlay: [VRF00000008]",
        ] {
            let Some(PatcherStatus::Error(message)) = status(line) else {
                panic!("host refusal must not be ignored");
            };
            assert!(message.contains("No skins were applied"));
        }
        assert!(status("dll 2.0 8892 1 INFO host verification succeeded").is_none());
    }
    #[test]
    fn maps_real_host_lifecycle_and_preserves_rejections() {
        assert_eq!(
            status("status 0.001 injecting scanning for game"),
            Some(PatcherStatus::WaitingForGame)
        );
        assert_eq!(
            status("status 1.0 injected attached"),
            Some(PatcherStatus::Patching)
        );
        assert_eq!(
            status("status 2.0 waiting running"),
            Some(PatcherStatus::InGame)
        );
        assert_eq!(
            status("status 3.0 exited done"),
            Some(PatcherStatus::GameExited)
        );
        assert!(matches!(
            status("status 1.0 failed refused"),
            Some(PatcherStatus::Error(_))
        ));
        assert!(matches!(
            status("dll 1.0 1 2 ERROR WAD scan failed status"),
            Some(PatcherStatus::Error(_))
        ));
        assert!(status("ok 0.0 config prefix set").is_none());
    }
}
