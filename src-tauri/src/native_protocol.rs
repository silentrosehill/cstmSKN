//! Source-native Windows host protocol shared by Apply and runtime tests.
use crate::state::PatcherStatus;
use std::{path::Path, process::Command};

pub fn host_command(folder: &Path, fixture: bool) -> Command {
    let mut command = Command::new(folder.join("cstm-native-host.exe"));
    command
        .arg(if fixture {
            "--fixture-protocol-test"
        } else {
            "--run"
        })
        .current_dir(folder);
    command
}
pub fn configure(game: &str, overlay: &str) -> Result<String, String> {
    for path in [game, overlay] {
        if path.is_empty() || path.chars().any(char::is_control) {
            return Err("Invalid native engine directory".into());
        }
    }
    Ok(format!(
        "config game {game}\nconfig prefix {overlay}\nstart scan\n"
    ))
}
pub fn loader_error(code: u32) -> Option<String> {
    match code {
        0xC0E90002 | 0xC0000428 | 4551 | 577 | 1260 => Some(format!(
            "Windows blocked the native engine under its code-integrity policy (0x{code:08X}). This build is unsigned; trusted signing is still required on protected PCs."
        )),
        _ => None,
    }
}
pub fn host_exit_error(code: Option<i32>) -> String {
    if let Some(message) = code.and_then(|c| loader_error(c as u32)) {
        return message;
    }
    match code {
        Some(c) => format!(
            "Native engine exited (0x{:08X}). Check patcher diagnostics.",
            c as u32
        ),
        None => "Native engine exited unexpectedly. Check patcher diagnostics.".into(),
    }
}
pub fn hook_target_pid(line: &str) -> Option<u32> {
    if !line.contains("hook install failed") {
        return None;
    }
    line.split_whitespace()
        .find_map(|word| word.strip_prefix("pid=")?.parse().ok())
}
pub fn status(line: &str) -> Option<PatcherStatus> {
    let lower = line.to_ascii_lowercase();
    for code in [0xC0E90002, 0xC0000428, 4551, 577, 1260] {
        if lower.contains(&format!("0x{code:08x}")) {
            return loader_error(code).map(PatcherStatus::Error);
        }
    }
    let mut parts = line.splitn(4, ' ');
    if parts.next()? != "status" {
        return None;
    }
    let _time = parts.next()?;
    let state = parts.next()?;
    let message = parts.next().unwrap_or("No engine diagnostic supplied");
    match state {
        "injecting" => Some(PatcherStatus::WaitingForGame),
        "injected" => Some(PatcherStatus::Patching),
        "waiting" => Some(PatcherStatus::InGame),
        "exited" => Some(PatcherStatus::GameExited),
        "failed" => Some(PatcherStatus::Error(format!("Native engine: {message}"))),
        _ => None,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_with_spaces_use_one_command_each_and_cannot_inject_commands() {
        assert_eq!(
            configure(r"C:\League Game", r"C:\Mods é\Overlay").unwrap(),
            "config game C:\\League Game\nconfig prefix C:\\Mods é\\Overlay\nstart scan\n"
        );
        for bad in ["", "path\nstop", "path\rstart scan", "path\0x", "path\tx"] {
            assert!(configure(bad, "overlay").is_err());
            assert!(configure("game", bad).is_err());
        }
    }
    #[test]
    fn status_only_reports_activity_after_real_read_acknowledgement() {
        assert_eq!(
            status("status 0 injecting ready"),
            Some(PatcherStatus::WaitingForGame)
        );
        assert_eq!(
            status("status 0 injected checking reads"),
            Some(PatcherStatus::Patching)
        );
        assert_eq!(
            status("status 0 waiting native overlay reads observed"),
            Some(PatcherStatus::InGame)
        );
        let Some(PatcherStatus::Error(message)) =
            status("status 0 failed SetWindowsHookEx failed: 0x00000000")
        else {
            panic!("missing error")
        };
        assert!(message.contains("0x00000000") && !message.contains("administrator"));
        assert!(matches!(
            status("status 0 failed Attached, but no overlay reads were observed"),
            Some(PatcherStatus::Error(_))
        ));
        assert!(host_exit_error(Some(0xC0E90002_u32 as i32)).contains("Windows blocked"));
        assert!(loader_error(193).is_none());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn app_host_command_exercises_real_protocol_dll_reads_and_stop_twice() {
        use std::{
            fs,
            io::{BufRead, BufReader, Write},
            process::Stdio,
            sync::mpsc,
            time::{Duration, Instant, SystemTime, UNIX_EPOCH},
        };
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/windows");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../native-build/Release/cstm-injector-fixture.exe");
        for iteration in 0..2 {
            let root = std::env::temp_dir().join(format!(
                "cstmSKN-ipc-{}-{}-{iteration}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let engine = root.join("engine");
            fs::create_dir_all(&engine).unwrap();
            for name in ["cstm-native-host.exe", "cstm-native-overlay.dll"] {
                fs::copy(resources.join(name), engine.join(name)).unwrap();
            }
            fs::copy(&fixture, engine.join("cstm-injector-fixture.exe")).unwrap();
            let mut child = host_command(&engine, true)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            struct Cleanup(std::process::Child);
            impl Drop for Cleanup {
                fn drop(&mut self) {
                    let _ = self.0.kill();
                    let _ = self.0.wait();
                }
            }
            let stdout = child.stdout.take().unwrap();
            let (tx, rx) = mpsc::channel();
            let reader = std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
            });
            let config = configure(
                root.join("Game data").to_str().unwrap(),
                root.join("Overlay").to_str().unwrap(),
            )
            .unwrap();
            let mut child = Cleanup(child);
            child
                .0
                .stdin
                .as_mut()
                .unwrap()
                .write_all(config.as_bytes())
                .unwrap();
            child.0.stdin.as_mut().unwrap().flush().unwrap();
            let mut waiting = false;
            let mut attached = false;
            loop {
                let line = rx
                    .recv_timeout(Duration::from_secs(20))
                    .expect("native protocol did not respond");
                match status(&line) {
                    Some(PatcherStatus::WaitingForGame) => waiting = true,
                    Some(PatcherStatus::Patching) => {
                        assert!(waiting);
                        attached = true;
                    }
                    Some(PatcherStatus::InGame) => {
                        assert!(attached);
                        break;
                    }
                    Some(PatcherStatus::Error(e)) => panic!("{e}"),
                    _ => (),
                }
            }
            child
                .0
                .stdin
                .as_mut()
                .unwrap()
                .write_all(b"stop\n")
                .unwrap();
            child.0.stdin.take();
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                if let Some(exit) = child.0.try_wait().unwrap() {
                    assert!(exit.success());
                    break;
                }
                assert!(Instant::now() < deadline, "native host did not stop");
                std::thread::sleep(Duration::from_millis(20));
            }
            reader.join().unwrap();
            assert_eq!(
                fs::read(root.join("Game data/DATA/FINAL/fixture.wad.client")).unwrap(),
                b"original"
            );
            assert_eq!(
                fs::read(root.join("Overlay/DATA/FINAL/maximum.wad.client")).unwrap(),
                b"overlay-must-not-change"
            );
            fs::remove_dir_all(root).unwrap();
        }
    }
}
