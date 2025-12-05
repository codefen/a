use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, Position, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_window_state::StateFlags;
use tauri_plugin_devtools::init as devtools_init;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn create_main_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
    if app.get_webview_window("main").is_none() {
        let win_builder = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .title("Codefend Panel")
            .inner_size(800.0, 600.0)
            .resizable(true)
            .maximized(true);

        #[cfg(not(target_os = "macos"))]
        let win_builder = win_builder.decorations(false).transparent(true);

        let window = win_builder.build().unwrap();
        window.set_min_size(Some(LogicalSize::new(800.0, 600.0)))?;
        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitor_size = monitor.size();
            let window_size = window.outer_size()?;

            let center_x = (monitor_size.width as f64 - window_size.width as f64) / 2.0;
            let center_y = (monitor_size.height as f64 - window_size.height as f64) / 2.0;

            window.set_position(Position::Physical(PhysicalPosition::new(
                center_x as i32,
                center_y as i32,
            )))?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().pubkey("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDU1ODYxRUI4NTI0MUNEN0EKUldSNnpVRlN1QjZHVmJLL1l2QXUxdnJ5amUxUTJwd0VjR1FXVmU2YU8wZnFZcnVBOURmMGVjU2QK").build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .plugin(devtools_init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init());

    builder
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|#[allow(unused_variables)] app| {
            #[cfg(desktop)]
            {
                create_main_window(app.handle().clone())?;

                app.handle().emit("window-ready", ()).unwrap();
                Ok(())
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
