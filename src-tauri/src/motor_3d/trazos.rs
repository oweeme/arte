use glam::Vec3;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub enum BrushType { Flat, Round, Sketch }

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct Punto3D {
    pub position: Vec3,
    pub pressure: f32,
    pub timestamp: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TrazoVectorial {
    pub id: u64,
    pub puntos: Vec<Punto3D>,
    pub color: [f32; 4],
    pub thickness: f32,
    pub brush_type: BrushType,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Lienzo3D {
    pub trazos: Vec<TrazoVectorial>,
}

impl Default for Lienzo3D {
    fn default() -> Self { Self::new() }
}

impl Lienzo3D {
    pub fn new() -> Self { Self { trazos: Vec::new() } }

    pub fn guardar<P: AsRef<Path>>(&self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let mut file = File::create(path)?;
        file.write_all(&rmp_serde::to_vec(self)?)?;
        Ok(())
    }

    pub fn cargar<P: AsRef<Path>>(path: P) -> Result<Self, Box<dyn std::error::Error>> {
        let mut file = File::open(path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        Ok(rmp_serde::from_slice(&buf)?)
    }
}

// ─── Tipos IPC (JSON entre JS y Rust) ────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PuntoData {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    #[serde(default = "default_pressure")]
    pub pressure: f32,
}

fn default_pressure() -> f32 { 0.5 }

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrazoData {
    pub id: u64,
    pub puntos: Vec<PuntoData>,
    pub color: [f32; 4],
    pub thickness: f32,
    pub brush_type: String,
    // Campos opcionales que JS puede incluir — ignorados en Rust
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape_plane: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_content: Option<String>,
    #[serde(default)]
    pub fill: bool,
}

impl TrazoData {
    pub fn to_trazo_vectorial(&self) -> TrazoVectorial {
        TrazoVectorial {
            id: self.id,
            puntos: self.puntos.iter().map(|p| Punto3D {
                position: Vec3::new(p.x, p.y, p.z),
                pressure: p.pressure,
                timestamp: 0,
            }).collect(),
            color: self.color,
            thickness: self.thickness,
            brush_type: match self.brush_type.as_str() {
                "flat"   => BrushType::Flat,
                "sketch" => BrushType::Sketch,
                _        => BrushType::Round,
            },
        }
    }

    pub fn from_trazo_vectorial(t: &TrazoVectorial) -> Self {
        TrazoData {
            id: t.id,
            puntos: t.puntos.iter().map(|p| PuntoData {
                x: p.position.x, y: p.position.y, z: p.position.z,
                pressure: p.pressure,
            }).collect(),
            color: t.color,
            thickness: t.thickness,
            brush_type: match t.brush_type {
                BrushType::Flat   => "flat".into(),
                BrushType::Round  => "round".into(),
                BrushType::Sketch => "sketch".into(),
            },
            shape_plane: None,
            text_content: None,
            fill: false,
        }
    }
}
