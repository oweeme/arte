mod motor_3d;
mod comunicacion;

use crate::comunicacion::comandos::{guardar_archivo_arte, cargar_archivo_arte, exportar_formato, guardar_imagen};
#[cfg(not(target_os = "android"))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            #[cfg(not(target_os = "android"))]
            {
                let window = _app.get_webview_window("main").unwrap();
                let _ = window.set_shadow(true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            guardar_archivo_arte,
            cargar_archivo_arte,
            exportar_formato,
            guardar_imagen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
