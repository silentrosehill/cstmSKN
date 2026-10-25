//! LTK's public host line protocol, also used by Alban1911/Rose.
use crate::state::PatcherStatus;
#[cfg(target_os = "windows")]
use std::{path::Path, process::Command};

#[cfg(target_os = "windows")]
pub fn host_command(folder: &Path) -> Command {
    Command::new(folder.join("ltk_patcher_host.exe"))
}
pub fn configure(prefix: &str) -> Result<String, String> {
    if prefix.is_empty() || prefix.chars().any(char::is_control) {
        return Err("Invalid overlay directory".into());
    }
    let prefix = if prefix.ends_with(['\\', '/']) {
        prefix.to_string()
    } else {
        format!("{prefix}\\")
    };
    // Same documented custom-skin option Rose uses. No DLL bytes or signatures change.
    Ok(format!(
        "config loglevel 16\nconfig flags 4\nconfig prefix {prefix}\nstart scan\n"
    ))
}
pub fn loader_error(code: u32) -> Option<String> {
    match code {
        0xC0E90002 | 0xC0000428 | 4551 | 577 | 1260 => Some(format!("Windows blocked the installed LTK runtime (0x{code:08X}). No skins were applied. Check Windows CodeIntegrity diagnostics and the official LTK installation.")),
        _ => None,
    }
}
#[cfg(target_os = "windows")]
pub fn host_exit_error(code: Option<i32>) -> String {
    code.and_then(|c| loader_error(c as u32))
        .unwrap_or_else(|| format!("LTK host exited ({code:?}). Check patcher diagnostics."))
}
#[cfg(target_os = "windows")]
pub fn hook_target_pid(line: &str) -> Option<u32> {
    if !line.contains("hook install failed") {
        return None;
    }
    line.split_whitespace()
        .find_map(|word| word.strip_prefix("pid=")?.parse().ok())
}
pub fn status(line: &str) -> Option<PatcherStatus> {
    let lower = line.to_ascii_lowercase();
    if lower.contains("host verification failed") {
        return Some(PatcherStatus::Error("The installed LTK patcher refused this launcher. Its files were not modified. Copy diagnostics to investigate.".into()));
    }
    if lower.contains("end of life reached") {
        return Some(PatcherStatus::Error("The installed LTK patcher has expired for this game build. Update official LTK Manager.".into()));
    }
    if lower.contains("joined too late") {
        return Some(PatcherStatus::Error(
            "Start Apply before a fresh match. LTK joined this game too late.".into(),
        ));
    }
    if lower.contains("overlay verification failed") || lower.contains("wad scan failed") {
        return Some(PatcherStatus::Error(format!(
            "LTK rejected an overlay: {line}"
        )));
    }
    for code in [0xC0E90002, 0xC0000428, 4551, 577, 1260] {
        if lower.contains(&format!("0x{code:08x}")) {
            return loader_error(code).map(PatcherStatus::Error);
        }
    }
    let mut parts = line.splitn(4, ' ');
    match parts.next()? {
        "status" => {
            let _time = parts.next()?;
            let state = parts.next()?;
            let message = parts.next().unwrap_or("No LTK diagnostic supplied");
            match state {
                "injecting" => Some(PatcherStatus::WaitingForGame),
                "injected" => Some(PatcherStatus::Patching),
                "waiting" => Some(PatcherStatus::InGame),
                "exited" => Some(PatcherStatus::GameExited),
                "failed" => Some(PatcherStatus::Error(format!("LTK: {message}"))),
                _ => None,
            }
        }
        "error" => Some(PatcherStatus::Error(
            line.splitn(3, ' ').nth(2).unwrap_or(line).into(),
        )),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_uses_the_ltk_protocol_and_rejects_injected_commands() {
        assert_eq!(
            configure(r"C:\Mods é\Overlay").unwrap(),
            "config loglevel 16\nconfig flags 4\nconfig prefix C:\\Mods é\\Overlay\\\nstart scan\n"
        );
        assert!(configure("a\nstop").is_err());
        assert!(configure("").is_err());
    }
    #[test]
    fn status_requires_real_host_acknowledgements_and_keeps_rejections_visible() {
        assert_eq!(status("ok 0.1 config prefix set"), None);
        assert_eq!(
            status("status 1 injecting scanning for game"),
            Some(PatcherStatus::WaitingForGame)
        );
        assert_eq!(
            status("status 2 injected dll attached"),
            Some(PatcherStatus::Patching)
        );
        assert_eq!(
            status("status 3 waiting game exit"),
            Some(PatcherStatus::InGame)
        );
        for line in [
            "error 0 failure",
            "dll 0 ERROR host verification failed",
            "dll 0 WARN joined too late, not overlaying",
            "dll 0 ERROR end of life reached, please update",
            "dll 0 ERROR overlay verification failed",
        ] {
            assert!(
                matches!(status(line), Some(PatcherStatus::Error(_))),
                "{line}"
            );
        }
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn production_commands_start_and_stop_the_actual_official_host_twice() {
        use std::os::windows::process::CommandExt;
        use std::{
            io::{BufRead, BufReader, Write},
            process::{Child, Stdio},
            sync::mpsc,
            time::{Duration, Instant},
        };
        let folder = std::path::PathBuf::from(std::env::var_os("ProgramFiles").unwrap())
            .join(format!("cstmSKN-LTK-protocol-test-{}", std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let fixture = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../native-build/ltk-official-fixture");
        for name in [
            "ltk-manager.exe",
            "ltk_patcher_host.exe",
            "ltk_patcher_dll.dll",
        ] {
            std::fs::copy(fixture.join(name), folder.join(name)).unwrap();
        }
        let overlay = folder.join("overlay");
        std::fs::create_dir(&overlay).unwrap();
        struct Owned(Child);
        impl Drop for Owned {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        for _ in 0..2 {
            let mut command = host_command(&folder);
            let mut child = Owned(
                command
                    .current_dir(&folder)
                    .creation_flags(0x08000000)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            );
            let output = child.0.stdout.take().unwrap();
            let (tx, rx) = mpsc::channel();
            let reader = std::thread::spawn(move || {
                for line in BufReader::new(output).lines().map_while(Result::ok) {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
            });
            let input = child.0.stdin.as_mut().unwrap();
            input
                .write_all(configure(overlay.to_str().unwrap()).unwrap().as_bytes())
                .unwrap();
            input.flush().unwrap();
            let deadline = Instant::now() + Duration::from_secs(12);
            loop {
                let line = rx
                    .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    .expect("Official host did not acknowledge scanning");
                match status(&line) {
                    Some(PatcherStatus::WaitingForGame) => break,
                    Some(PatcherStatus::Error(e)) => panic!("{e}"),
                    _ => {}
                }
            }
            let mut input = child.0.stdin.take().unwrap();
            writeln!(input, "stop").unwrap();
            drop(input);
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                if let Some(exit) = child.0.try_wait().unwrap() {
                    assert!(exit.success());
                    break;
                }
                assert!(Instant::now() < deadline, "Official host did not stop");
                std::thread::sleep(Duration::from_millis(20));
            }
            reader.join().unwrap();
        }
        std::fs::remove_dir_all(folder).unwrap();
    }
}
