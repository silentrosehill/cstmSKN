//! Minimal LTK host protocol adapter. Default host validation remains enabled.
use crate::state::PatcherStatus;
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
