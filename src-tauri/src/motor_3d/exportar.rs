use super::trazos::{Lienzo3D, TrazoData};
use glam::Vec3;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;

pub struct Exportador;

// ─── Geometría de formas ──────────────────────────────────

fn rect_points(a: Vec3, b: Vec3, plane: &str) -> Vec<Vec3> {
    match plane {
        "xz" => vec![
            Vec3::new(a.x, a.y, a.z),
            Vec3::new(b.x, a.y, a.z),
            Vec3::new(b.x, b.y, b.z),
            Vec3::new(a.x, b.y, b.z),
            Vec3::new(a.x, a.y, a.z), // cerrar
        ],
        "yz" => vec![
            Vec3::new(a.x, a.y, a.z),
            Vec3::new(a.x, b.y, a.z),
            Vec3::new(b.x, b.y, b.z),
            Vec3::new(b.x, a.y, b.z),
            Vec3::new(a.x, a.y, a.z),
        ],
        _ => vec![ // xy por defecto
            Vec3::new(a.x, a.y, a.z),
            Vec3::new(b.x, a.y, a.z),
            Vec3::new(b.x, b.y, b.z),
            Vec3::new(a.x, b.y, b.z),
            Vec3::new(a.x, a.y, a.z),
        ],
    }
}

fn circle_points(center: Vec3, edge: Vec3, plane: &str, samples: usize) -> Vec<Vec3> {
    let mut pts = Vec::with_capacity(samples + 1);
    match plane {
        "xz" => {
            let r = ((edge.x - center.x).abs()).max((edge.z - center.z).abs()).max(0.001);
            for i in 0..=samples {
                let a = (i as f32 / samples as f32) * std::f32::consts::TAU;
                pts.push(Vec3::new(center.x + a.cos() * r, center.y, center.z + a.sin() * r));
            }
        }
        "yz" => {
            let r = ((edge.y - center.y).abs()).max((edge.z - center.z).abs()).max(0.001);
            for i in 0..=samples {
                let a = (i as f32 / samples as f32) * std::f32::consts::TAU;
                pts.push(Vec3::new(center.x, center.y + a.cos() * r, center.z + a.sin() * r));
            }
        }
        _ => { // xy
            let r = ((edge.x - center.x).abs()).max((edge.y - center.y).abs()).max(0.001);
            for i in 0..=samples {
                let a = (i as f32 / samples as f32) * std::f32::consts::TAU;
                pts.push(Vec3::new(center.x + a.cos() * r, center.y + a.sin() * r, center.z));
            }
        }
    }
    pts
}

impl Exportador {
    /// Exporta OBJ + MTL desde TrazoData directamente (preserva colores y formas)
    pub fn a_obj_completo<P: AsRef<Path>>(
        trazos: &[TrazoData],
        obj_path: P,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let obj_path = obj_path.as_ref();
        let mtl_name = obj_path
            .file_stem()
            .map(|s| format!("{}.mtl", s.to_string_lossy()))
            .unwrap_or_else(|| "materiales.mtl".into());
        let mtl_path = obj_path.with_file_name(&mtl_name);

        // ── Generar materiales únicos por color ───────────────
        let mut mat_map: HashMap<String, [f32; 4]> = HashMap::new();
        for t in trazos {
            if t.brush_type == "eraser" { continue; }
            let key = color_key(&t.color);
            mat_map.entry(key).or_insert(t.color);
        }

        // ── Escribir MTL ──────────────────────────────────────
        {
            let mut mtl = File::create(&mtl_path)?;
            writeln!(mtl, "# Arte 3D — materiales")?;
            for (key, col) in &mat_map {
                writeln!(mtl, "\nnewmtl {key}")?;
                writeln!(mtl, "Kd {:.4} {:.4} {:.4}", col[0], col[1], col[2])?;
                writeln!(mtl, "d  {:.4}", col[3])?; // transparencia
                writeln!(mtl, "illum 1")?;
            }
        }

        // ── Escribir OBJ ──────────────────────────────────────
        let mut obj = File::create(obj_path)?;
        writeln!(obj, "# Arte 3D — exportado")?;
        writeln!(obj, "mtllib {mtl_name}")?;

        let mut vertex_offset: usize = 1;

        for trazo in trazos {
            if trazo.brush_type == "eraser" { continue; }
            if trazo.puntos.is_empty() { continue; }

            // Calcular puntos según tipo
            let plane = trazo.shape_plane.as_deref().unwrap_or("xy");
            let pts: Vec<Vec3> = match trazo.brush_type.as_str() {
                "rect" if trazo.puntos.len() >= 2 => {
                    let a = Vec3::new(trazo.puntos[0].x, trazo.puntos[0].y, trazo.puntos[0].z);
                    let b = Vec3::new(trazo.puntos[1].x, trazo.puntos[1].y, trazo.puntos[1].z);
                    rect_points(a, b, plane)
                }
                "circle" if trazo.puntos.len() >= 2 => {
                    let c = Vec3::new(trazo.puntos[0].x, trazo.puntos[0].y, trazo.puntos[0].z);
                    let e = Vec3::new(trazo.puntos[1].x, trazo.puntos[1].y, trazo.puntos[1].z);
                    circle_points(c, e, plane, 48)
                }
                "text" => {
                    // Texto: solo un punto de anclaje, no exportar geometría
                    continue;
                }
                _ => {
                    trazo.puntos.iter()
                        .map(|p| Vec3::new(p.x, p.y, p.z))
                        .collect()
                }
            };

            if pts.len() < 2 { continue; }

            let mat_key = color_key(&trazo.color);
            writeln!(obj, "\no trazo_{}", trazo.id)?;
            writeln!(obj, "usemtl {mat_key}")?;

            for p in &pts {
                writeln!(obj, "v {:.6} {:.6} {:.6}", p.x, p.y, p.z)?;
            }
            write!(obj, "l")?;
            for i in 0..pts.len() {
                write!(obj, " {}", vertex_offset + i)?;
            }
            writeln!(obj)?;
            vertex_offset += pts.len();
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn a_obj<P: AsRef<Path>>(lienzo: &Lienzo3D, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let mut file = File::create(path)?;
        let mut vertex_offset = 1;
        writeln!(file, "# Arte 3D — trazos vectoriales")?;
        for trazo in &lienzo.trazos {
            writeln!(file, "o trazo_{}", trazo.id)?;
            for punto in &trazo.puntos {
                writeln!(file, "v {} {} {}", punto.position.x, punto.position.y, punto.position.z)?;
            }
            if trazo.puntos.len() >= 2 {
                write!(file, "l")?;
                for i in 0..trazo.puntos.len() { write!(file, " {}", vertex_offset + i)?; }
                writeln!(file)?;
            }
            vertex_offset += trazo.puntos.len();
        }
        Ok(())
    }

}

fn color_key(c: &[f32; 4]) -> String {
    format!(
        "mat_{:02x}{:02x}{:02x}",
        (c[0] * 255.0) as u8,
        (c[1] * 255.0) as u8,
        (c[2] * 255.0) as u8,
    )
}
