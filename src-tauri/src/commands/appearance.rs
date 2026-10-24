#[cfg(target_os = "macos")]
extern "C" {
    fn cstm_set_sidebar_glass(window: *mut std::ffi::c_void, width: f64) -> i32;
}

/// Place AppKit Liquid Glass below the web sidebar without moving the webview.
#[tauri::command]
pub async fn set_sidebar_glass(window: tauri::WebviewWindow, width: f64) -> Result<bool, String> {
    if !width.is_finite() {
        return Err("Invalid sidebar width".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                let result =
                    target
                        .ns_window()
                        .map_err(|error| error.to_string())
                        .map(|pointer| unsafe {
                            cstm_set_sidebar_glass(pointer, width.clamp(68.0, 340.0)) != 0
                        });
                let _ = sender.try_send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver
            .recv()
            .await
            .ok_or_else(|| "Window closed before its material updated".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(false)
    }
}
