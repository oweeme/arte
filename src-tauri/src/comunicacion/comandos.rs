use tauri_plugin_dialog::DialogExt;
use crate::motor_3d::trazos::{Lienzo3D, TrazoData};
use crate::motor_3d::exportar::Exportador;
use std::path::PathBuf;

#[tauri::command]
pub async fn guardar_imagen(
    app: tauri::AppHandle,
    data: Vec<u8>,
    extension: String,
) -> Result<(), String> {
    let label = extension.to_uppercase();
    let path = app.dialog()
        .file()
        .add_filter(&label, &[&extension])
        .set_file_name(&format!("arte_export.{}", extension))
        .blocking_save_file();

    if let Some(file_path) = path {
        std::fs::write(file_path.to_string(), &data).map_err(|e| e.to_string())
    } else {
        Err("Exportación cancelada".into())
    }
}

#[tauri::command]
pub async fn guardar_archivo_arte(
    app: tauri::AppHandle,
    trazos: Vec<TrazoData>,
) -> Result<(), String> {
    let path = app.dialog()
        .file()
        .add_filter("Arte 3D", &["arte"])
        .set_file_name("mi_dibujo.arte")
        .blocking_save_file();

    if let Some(file_path) = path {
        let lienzo = Lienzo3D {
            trazos: trazos.iter().map(|t| t.to_trazo_vectorial()).collect(),
        };
        lienzo.guardar(file_path.to_string()).map_err(|e| e.to_string())
    } else {
        Err("Guardado cancelado".into())
    }
}

#[tauri::command]
pub async fn cargar_archivo_arte(
    app: tauri::AppHandle,
) -> Result<Vec<TrazoData>, String> {
    let path = app.dialog()
        .file()
        .add_filter("Arte 3D", &["arte"])
        .blocking_pick_file();

    if let Some(file_path) = path {
        let lienzo = Lienzo3D::cargar(file_path.to_string()).map_err(|e| e.to_string())?;
        Ok(lienzo.trazos.iter().map(TrazoData::from_trazo_vectorial).collect())
    } else {
        Err("Carga cancelada".into())
    }
}

#[tauri::command]
pub async fn exportar_formato(
    app: tauri::AppHandle,
    trazos: Vec<TrazoData>,
    formato: String,
) -> Result<(), String> {
    let path = app.dialog()
        .file()
        .add_filter(&formato.to_uppercase(), &[&formato])
        .set_file_name(&format!("exportado.{}", formato))
        .blocking_save_file();

    if let Some(file_path) = path {
        let path_str = file_path.to_string();
        match formato.as_str() {
            "obj" => {
                // Añadir extensión .obj si falta
                let obj_path: PathBuf = if path_str.to_lowercase().ends_with(".obj") {
                    PathBuf::from(&path_str)
                } else {
                    PathBuf::from(format!("{}.obj", path_str))
                };
                Exportador::a_obj_completo(&trazos, &obj_path)
                    .map_err(|e| e.to_string())?;
            }
            _ => return Err("Formato no soportado".into()),
        }
        Ok(())
    } else {
        Err("Exportación cancelada".into())
    }
}
