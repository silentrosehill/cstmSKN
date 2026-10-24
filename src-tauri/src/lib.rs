mod archive;
mod commands;
#[cfg(any(target_os = "windows", test))]
mod native_protocol;
mod state;
#[cfg(target_os = "windows")]
mod windows_shell;

use state::AppState;
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
extern "C" {
    fn geteuid() -> u32;
}

#[cfg(target_os = "macos")]
fn running_as_root() -> bool {
    unsafe { geteuid() == 0 }
}

#[cfg(target_os = "macos")]
mod mac_auth {
    use std::os::raw::{c_char, c_int, c_void};

    pub type AuthorizationRef = *mut c_void;
    pub type OSStatus = i32;
    pub const SUCCESS: OSStatus = 0;

    #[repr(C)]
    pub struct AuthorizationItem {
        pub name: *const c_char,
        pub value_length: usize,
        pub value: *mut c_void,
        pub flags: u32,
    }

    #[repr(C)]
    pub struct AuthorizationItemSet {
        pub count: u32,
        pub items: *mut AuthorizationItem,
    }

    pub const FLAGS_DEFAULTS: u32 = 0;
    pub const FLAGS_INTERACTION_ALLOWED: u32 = 1 << 0;
    pub const FLAGS_EXTEND_RIGHTS: u32 = 1 << 1;
    pub const FLAGS_DESTROY_RIGHTS: u32 = 1 << 3;

    #[link(name = "Security", kind = "framework")]
    extern "C" {
        pub fn AuthorizationCreate(
            rights: *const AuthorizationItemSet,
            environment: *const c_void,
            flags: u32,
            authorization: *mut AuthorizationRef,
        ) -> OSStatus;

        pub fn AuthorizationCopyRights(
            authorization: AuthorizationRef,
            rights: *const AuthorizationItemSet,
            environment: *const c_void,
            flags: u32,
            authorized_rights: *mut *mut AuthorizationItemSet,
        ) -> OSStatus;

        pub fn AuthorizationFree(authorization: AuthorizationRef, flags: u32) -> OSStatus;

    }

    /// AuthorizationExecuteWithPrivileges has been deprecated since macOS 10.7. It is
    /// looked up at runtime instead of linked, so a macOS that drops it still launches
    /// the app (and falls back to the system administrator prompt).
    pub type ExecuteWithPrivileges = unsafe extern "C" fn(
        authorization: AuthorizationRef,
        path_to_tool: *const c_char,
        options: u32,
        arguments: *const *const c_char,
        communications_pipe: *mut *mut c_void,
    ) -> OSStatus;

    pub fn execute_with_privileges() -> Option<ExecuteWithPrivileges> {
        let name = b"AuthorizationExecuteWithPrivileges\0";
        let symbol = unsafe { libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr() as *const c_char) };
        if symbol.is_null() {
            None
        } else {
            Some(unsafe { std::mem::transmute::<*mut c_void, ExecuteWithPrivileges>(symbol) })
        }
    }

    /// The user closed the password dialog.
    pub const CANCELED: OSStatus = -60006;

    extern "C" {
        pub fn fileno(stream: *mut c_void) -> c_int;
    }

    extern "C" {
        #[link_name = "read"]
        pub fn libc_read(fd: c_int, buf: *mut c_void, count: usize) -> isize;
    }
}

/// Relaunch the app as root via macOS Authorization Services.
/// The original process waits for the root process to exit.
#[cfg(target_os = "macos")]
fn relaunch_as_admin() {
    use std::ffi::CString;
    use std::os::raw::{c_char, c_void};
    use std::ptr;

    unsafe {
        // Create authorization reference
        let mut auth: mac_auth::AuthorizationRef = ptr::null_mut();
        let status = mac_auth::AuthorizationCreate(
            ptr::null(),
            ptr::null(),
            mac_auth::FLAGS_DEFAULTS,
            &mut auth,
        );
        if status != mac_auth::SUCCESS {
            eprintln!(
                "[cstmSKN] AuthorizationCreate failed ({}), falling back to osascript",
                status
            );
            relaunch_via_osascript();
            return;
        }

        // Request admin rights (shows the native password dialog)
        let right_name = b"system.privilege.admin\0";
        let mut right = mac_auth::AuthorizationItem {
            name: right_name.as_ptr() as *const c_char,
            value_length: 0,
            value: ptr::null_mut(),
            flags: 0,
        };
        let rights = mac_auth::AuthorizationItemSet {
            count: 1,
            items: &mut right,
        };
        let flags = mac_auth::FLAGS_DEFAULTS
            | mac_auth::FLAGS_INTERACTION_ALLOWED
            | mac_auth::FLAGS_EXTEND_RIGHTS;

        let status =
            mac_auth::AuthorizationCopyRights(auth, &rights, ptr::null(), flags, ptr::null_mut());
        if status != mac_auth::SUCCESS {
            eprintln!("[cstmSKN] Authorization denied or cancelled ({})", status);
            mac_auth::AuthorizationFree(auth, mac_auth::FLAGS_DESTROY_RIGHTS);
            std::process::exit(1);
        }

        // Relaunch ourselves with admin privileges
        let exe = std::env::current_exe().expect("failed to get executable path");
        let exe_cstr = CString::new(exe.to_string_lossy().as_bytes()).unwrap();

        // The root process may get HOME=/var/root, so hand it the user's home explicitly.
        let flag = CString::new(USER_HOME_ARG).unwrap();
        let home = CString::new(std::env::var("HOME").unwrap_or_default()).unwrap_or_default();
        let args: [*const c_char; 3] = [flag.as_ptr(), home.as_ptr(), ptr::null()];

        let mut pipe: *mut c_void = ptr::null_mut();

        let Some(execute) = mac_auth::execute_with_privileges() else {
            eprintln!("[cstmSKN] Privileged launch is unavailable on this macOS, falling back to osascript");
            mac_auth::AuthorizationFree(auth, mac_auth::FLAGS_DESTROY_RIGHTS);
            relaunch_via_osascript();
            return;
        };
        let status = execute(
            auth,
            exe_cstr.as_ptr(),
            mac_auth::FLAGS_DEFAULTS,
            args.as_ptr(),
            &mut pipe,
        );

        if status != mac_auth::SUCCESS {
            eprintln!(
                "[cstmSKN] Privileged launch failed ({}), falling back to osascript",
                status
            );
            mac_auth::AuthorizationFree(auth, mac_auth::FLAGS_DESTROY_RIGHTS);
            if status == mac_auth::CANCELED {
                std::process::exit(1);
            }
            relaunch_via_osascript();
            return;
        }

        eprintln!("[cstmSKN] Root process launched, waiting...");

        // Wait for the root process to exit by reading from the pipe until EOF
        if !pipe.is_null() {
            let fd = mac_auth::fileno(pipe);
            let mut buf = [0u8; 256];
            loop {
                let n = mac_auth::libc_read(fd, buf.as_mut_ptr() as *mut c_void, buf.len());
                if n <= 0 {
                    break;
                }
            }
        }

        mac_auth::AuthorizationFree(auth, mac_auth::FLAGS_DESTROY_RIGHTS);
        std::process::exit(0);
    }
}

/// Fallback: relaunch via osascript if Authorization Services fail.
#[cfg(target_os = "macos")]
fn relaunch_via_osascript() {
    let exe = std::env::current_exe().expect("failed to get executable path");
    let home = std::env::var("HOME").unwrap_or_default();
    let user = std::env::var("USER").unwrap_or_default();

    let quote = |value: &str| format!("'{}'", value.replace('\'', "'\\''"));
    let shell_cmd = format!(
        "cd / && HOME={} USER={} {} --user-home {}",
        quote(&home),
        quote(&user),
        quote(&exe.to_string_lossy()),
        quote(&home)
    );
    let osa_escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
    let applescript = format!(
        "do shell script \"{}\" with administrator privileges",
        osa_escaped
    );

    eprintln!("[cstmSKN] Falling back to osascript relaunch");

    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&applescript)
        .status()
        .expect("failed to run osascript");

    std::process::exit(if status.success() { 0 } else { 1 });
}

#[cfg(target_os = "macos")]
const USER_HOME_ARG: &str = "--user-home";
#[cfg(target_os = "macos")]
const ROOT_HOME: &str = "/var/root";
#[cfg(target_os = "macos")]
const APP_DATA_SUBDIR: &str = "Library/Application Support/com.silentrosehill.cstmskn";

#[cfg(target_os = "macos")]
fn is_user_home(home: &str) -> bool {
    !home.is_empty() && home != ROOT_HOME && std::path::Path::new(home).is_dir()
}

#[cfg(target_os = "macos")]
fn home_from_args() -> Option<String> {
    let mut args = std::env::args();
    args.find(|a| a == USER_HOME_ARG)?;
    args.next().filter(|h| is_user_home(h))
}

#[cfg(target_os = "macos")]
fn console_user_home() -> Option<String> {
    use std::process::Command;

    let out = |cmd: &str, args: &[&str]| -> String {
        Command::new(cmd)
            .args(args)
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_default()
    };

    let user = out("/usr/bin/stat", &["-f", "%Su", "/dev/console"])
        .trim()
        .to_string();
    if user.is_empty() || user == "root" {
        return None;
    }

    let home = out(
        "/usr/bin/dscl",
        &[
            ".",
            "-read",
            &format!("/Users/{}", user),
            "NFSHomeDirectory",
        ],
    )
    .split_whitespace()
    .last()
    .unwrap_or_default()
    .to_string();

    Some(home).filter(|h| is_user_home(h))
}

/// Point HOME at the real user's home so app_data_dir() lands somewhere the
/// game (running as that user) can read, instead of root's private /var/root.
#[cfg(target_os = "macos")]
fn adopt_user_home() {
    let home = home_from_args()
        .or_else(|| std::env::var("HOME").ok().filter(|h| is_user_home(h)))
        .or_else(console_user_home);

    match home {
        Some(home) => {
            eprintln!("[cstmSKN] App data dir: {}/{}", home, APP_DATA_SUBDIR);
            std::env::set_var("HOME", &home);
            migrate_root_app_data(&home);
        }
        None => eprintln!(
            "[cstmSKN] No user home found, app data stays under {}",
            ROOT_HOME
        ),
    }
}

/// Earlier versions could write everything under /var/root. Move it over once
/// so users don't have to re-download their skins.
#[cfg(target_os = "macos")]
fn migrate_root_app_data(home: &str) {
    use std::path::Path;

    let old = Path::new(ROOT_HOME).join(APP_DATA_SUBDIR);
    let new = Path::new(home).join(APP_DATA_SUBDIR);
    if !old.is_dir() || new.exists() {
        return;
    }

    if let Some(parent) = new.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    match std::fs::rename(&old, &new) {
        Ok(()) => eprintln!(
            "[cstmSKN] Moved app data from {} to {}",
            old.display(),
            new.display()
        ),
        Err(e) => eprintln!(
            "[cstmSKN] Failed to move app data from {}: {}",
            old.display(),
            e
        ),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    unsafe {
        // Set once, before worker threads/children are created. Children inherit
        // this reporting mode, so loader failures return to the host instead of
        // hanging behind a system modal. This does not change code-integrity
        // enforcement, trust, or Windows security settings.
        use windows_sys::Win32::System::Diagnostics::Debug::{
            GetErrorMode, SetErrorMode, SEM_FAILCRITICALERRORS,
        };
        SetErrorMode(GetErrorMode() | SEM_FAILCRITICALERRORS);
    }
    // The source-native engine uses the app's actual token. Preserve an
    // explicit administrator launch; it has no Explorer-parent requirement.
    #[cfg(target_os = "macos")]
    {
        // mod-tools needs root for task_for_pid on macOS.
        if !running_as_root() {
            relaunch_as_admin();
            return;
        }

        eprintln!("[cstmSKN] Running as root (euid=0)");

        adopt_user_home();
    }
    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // "Open at login" stores the executable's path. Rewrite it so it follows the
            // app across updates (the executable used to be named "zushi").
            use tauri_plugin_autostart::ManagerExt;
            let launcher = app.autolaunch();
            if launcher.is_enabled().unwrap_or(false) {
                if let Err(e) = launcher.disable().and_then(|_| launcher.enable()) {
                    eprintln!("[cstmSKN] Could not refresh the login item: {}", e);
                }
            }
            Ok(())
        })
        .manage(Arc::new(Mutex::new(AppState::default())))
        .invoke_handler(tauri::generate_handler![
            commands::appearance::set_sidebar_glass,
            commands::engine::get_windows_engine,
            commands::engine::set_windows_engine,
            commands::engine::get_windows_elevation,
            commands::engine::set_windows_elevation,
            commands::game_path::detect_game_path,
            commands::game_path::validate_game_path,
            commands::game_path::set_game_path,
            commands::game_path::get_game_path,
            commands::patcher::apply_skin,
            commands::patcher::apply_skins,
            commands::patcher::stop_patcher,
            commands::patcher::get_patcher_status,
            commands::patcher::get_patcher_log,
            commands::patcher::get_work_dir_size,
            commands::patcher::clear_work_dir,
            commands::skins::download_skin,
            commands::skins::download_multiple_skins,
            commands::skins::list_downloaded_skins,
            commands::skins::delete_downloaded_skin,
            commands::skins::get_skins_dir_size,
            commands::skins::clear_all_skins,
            commands::customs::import_custom,
            commands::customs::list_customs,
            commands::customs::set_custom_kind,
            commands::client::get_champ_select,
            commands::patcher::get_patcher_health,
            commands::customs::remove_custom,
            commands::customs::clear_all_customs,
            commands::customs::get_customs_dir_size,
            commands::open_url,
            commands::releases::list_releases,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_handle, event| {
            #[cfg(target_os = "windows")]
            if matches!(event, tauri::RunEvent::Exit) {
                commands::patcher::shutdown();
            }
            #[cfg(not(target_os = "windows"))]
            let _ = event;
        });
}
