# Arte — Documentación de Arquitectura

> Motor de dibujo vectorial 3D para arquitectos, diseñadores y pintores.
> Desarrollado por **Hector Martinez Almanza** · [oweeme.com](https://oweeme.com)

---

## Índice

1. [Visión general](#1-visión-general)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Motor de renderizado — Canvas 2D 3D](#4-motor-de-renderizado--canvas-2d-3d)
5. [Modelos matemáticos](#5-modelos-matemáticos)
6. [Sistema de capas](#6-sistema-de-capas)
7. [Formato de archivo .arte](#7-formato-de-archivo-arte)
8. [IPC Tauri (frontend ↔ backend)](#8-ipc-tauri-frontend--backend)
9. [Módulo Rust: motor_3d](#9-módulo-rust-motor_3d)
10. [Exportación](#10-exportación)
11. [Input — teclado, mouse, tablet/Wacom](#11-input--teclado-mouse-tabletwacom)
12. [UI — paneles arrastrables y persistencia](#12-ui--paneles-arrastrables-y-persistencia)
13. [Decisiones de arquitectura importantes](#13-decisiones-de-arquitectura-importantes)
14. [Preparación para producción](#14-preparación-para-producción)

---

## 1. Visión general

**Arte** es una aplicación de escritorio multiplataforma construida con **Tauri v2** (Rust) y un frontend HTML/CSS/JS puro. El objetivo es proporcionar un lienzo de dibujo 3D perspectivo — similar a Blender pero orientado a dibujo libre y bocetos arquitectónicos — sin depender de WebGL o WGPU en el proceso de render principal.

```
┌─────────────────────────────────────────────┐
│                  Arte App                   │
│                                             │
│  ┌──────────────┐     ┌──────────────────┐  │
│  │   Frontend   │ IPC │    Backend Rust   │  │
│  │  HTML/CSS/JS │────▶│  Tauri Commands  │  │
│  │  Canvas 2D   │     │  motor_3d/       │  │
│  │  3D renderer │     │  comunicacion/   │  │
│  └──────────────┘     └──────────────────┘  │
└─────────────────────────────────────────────┘
```

### Por qué Canvas 2D en lugar de WebGL / WGPU

En **Linux con X11**, WGPU y WebKit comparten la misma superficie nativa. WGPU limpia el framebuffer a 60 fps, destruyendo el renderizado HTML de WebKit → pantalla blanca total. La solución es usar **Canvas 2D** del browser con un renderizador 3D propio por software, sin conflicto con WebKit.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|-----------|
| Empaquetado | Tauri | 2.x | Shell nativo multiplataforma |
| Backend | Rust + Cargo | 2021 edition | Comandos IPC, I/O de archivos, exportación |
| Matemáticas 3D (Rust) | glam | 0.29 | Matrices, vectores (exportación SVG) |
| Paralelismo (Rust) | rayon | 1.10 | Proyección paralela en exportación SVG |
| Serialización binaria | rmp-serde | 1.3 | Formato .arte (MessagePack) |
| Serialización JSON | serde_json | 1.x | IPC con el frontend |
| Diálogos de archivo | tauri-plugin-dialog | 2.x | Guardar/abrir archivos |
| Frontend render | Canvas 2D API | — | Renderizador 3D propio por software |
| Frontend UI | HTML/CSS/JS (vanilla) | — | Sin framework; módulos ES |
| Estilos | CSS variables + glassmorphism | — | Diseño moderno y ligero |

---

## 3. Estructura de carpetas

```
arte/
├── src/                        ← Frontend (HTML/CSS/JS)
│   ├── index.html              ← Estructura DOM: canvas, paneles, modal
│   ├── styles.css              ← Estilos glassmorphism, variables CSS
│   └── main.js                 ← Toda la lógica del cliente (ES module)
│
├── src-tauri/                  ← Backend Rust
│   ├── Cargo.toml              ← Dependencias y perfil de release
│   ├── build.rs                ← Script de construcción de Tauri
│   ├── tauri.conf.json         ← Config de la ventana, menús, permisos
│   └── src/
│       ├── main.rs             ← Punto de entrada (llama lib::run)
│       ├── lib.rs              ← Registro de comandos Tauri, env vars Linux
│       ├── motor_3d/
│       │   ├── mod.rs          ← Re-exporta submódulos
│       │   ├── trazos.rs       ← Tipos de datos: Lienzo3D, TrazoVectorial,
│       │   │                     Punto3D, BrushType, TrazoData (IPC)
│       │   ├── exportar.rs     ← Exportación a OBJ y SVG
│       │   └── pipeline.rs     ← Stub vacío (era WGPU, eliminado)
│       └── comunicacion/
│           ├── mod.rs          ← Re-exporta comandos
│           └── comandos.rs     ← 4 comandos IPC: guardar, cargar,
│                                 exportar_formato, guardar_imagen
│
├── ARCHITECTURE.md             ← Este archivo
└── package.json / node_modules ← Tauri CLI y dependencias de build
```

### Archivos críticos y su responsabilidad

| Archivo | Qué hace | Cuándo editarlo |
|---------|----------|-----------------|
| `src/main.js` | Renderer 3D, input, capas, paleta, grid, snap | Cualquier cambio de lógica o UI |
| `src/styles.css` | Layout, glassmorphism, paneles arrastrables | Cambios visuales |
| `src/index.html` | DOM: botones, paneles, modal de ayuda | Agregar/quitar elementos UI |
| `src-tauri/src/motor_3d/trazos.rs` | Tipos de datos del lienzo y IPC | Cambiar la estructura del trazo |
| `src-tauri/src/comunicacion/comandos.rs` | Diálogos de archivo, I/O | Agregar comandos IPC |
| `src-tauri/src/motor_3d/exportar.rs` | OBJ, SVG | Agregar formatos de exportación |
| `src-tauri/Cargo.toml` | Dependencias Rust | Agregar crates |
| `src-tauri/tauri.conf.json` | Nombre, iconos, ventana, permisos | Config de app |

---

## 4. Motor de renderizado — Canvas 2D 3D

El renderizador vive íntegramente en `src/main.js`. Usa la **Canvas 2D API** del browser para dibujar geometría 3D proyectada por software. No usa WebGL.

### Loop de renderizado

```js
// Loop a 60 fps con renderizado diferido — solo redibuja si needsRender=true
(function loop() {
    if (needsRender) render();
    requestAnimationFrame(loop);
})();
```

### Función render()

```
render()
  │
  ├── fillRect(bgHex)                  ← limpiar fondo
  ├── drawPersistentGrid()             ← cuadrícula 3D suelo XZ
  ├── drawActivePlaneOverlay()         ← overlay semitransparente del plano activo
  │
  ├── por cada capa visible:
  │     OffscreenCanvas → drawStroke() x N  ← capas aisladas
  │     ctx.drawImage(offscreen)            ← composite al canvas principal
  │
  ├── drawAxisGizmo()                  ← gizmo XYZ siempre visible
  ├── drawGridLabels()                 ← etiquetas numéricas en ejes
  └── drawCursor3D()                   ← punto de intersección con plano activo
```

### Por qué OffscreenCanvas por capa

La herramienta **Borrador** usa `globalCompositeOperation = 'destination-out'`, que en el canvas principal borraría también el fondo. Al renderizar cada capa en un `OffscreenCanvas` transparente y luego hacer `drawImage()`, el `destination-out` solo afecta la capa, preservando el fondo.

---

## 5. Modelos matemáticos

### 5.1 Cámara — estado

```js
const cam = {
    yaw:       0,    // rotación alrededor del eje Y (radianes)
    pitch:     0,    // rotación alrededor del eje X (radianes)
    zoom:      2.5,  // distancia focal (afecta perspectiva, no escala en z=0)
    viewScale: 1.0,  // escala uniforme adicional (zoom real visible)
    panX:      0,    // traslación de pantalla en X (píxeles)
    panY:      0,    // traslación de pantalla en Y (píxeles)
};
```

### 5.2 Proyección 3D → pantalla (`project`)

Dado un punto world `(x, y, z)`, calcula su pixel en pantalla.

**Paso 1 — Rotación Yaw (Y-axis):**
```
rx  =  x·cos(yaw) + z·sin(yaw)
ry  =  y
rz  = -x·sin(yaw) + z·cos(yaw)
```

**Paso 2 — Rotación Pitch (X-axis):**
```
ry2 = ry·cos(pitch) - rz·sin(pitch)
rz2 = ry·sin(pitch) + rz·cos(pitch)
```

**Paso 3 — Proyección perspectiva:**
```
depth = rz2 + cam.zoom          // profundidad desde cámara
s     = (cam.zoom / depth) · cam.viewScale

hw    = canvas.width/2  + cam.panX   // centro horizontal + pan
hv    = canvas.height/2 + cam.panY   // centro vertical + pan
hh    = canvas.height/2              // escala base (igual en X e Y)

sx = hw + rx · s · hh
sy = hv - ry2 · s · hh              // negativo: Y mundo = arriba pantalla
```

> **Por qué `hh` (height) para ambos ejes:** usar `hh` para X e Y garantiza que un cuadrado world sea un cuadrado en pantalla independiente del aspect ratio. Si se usara `width/2` para X se generaría una distorsión proporcional al ratio `width/height`.

### 5.3 Unproyección pantalla → mundo (`unproject`)

Dado un pixel de pantalla `(sx, sy)`, halla el punto world en el plano de dibujo activo.

**Coordenadas NDC (normalizadas al plano de cámara):**
```
ndcX = (sx - hw) / (hh · viewScale)
ndcY = -(sy - hv) / (hh · viewScale)
```

Estos `ndcX, ndcY` equivalen a `rx2/s_persp, ry2/s_persp` donde `s_persp = zoom/depth`.

**Intersección rayo-plano:**

El rayo desde la cámara pasa por `(ndcX/s, ndcY/s)` en el espacio rotado. Buscamos `s` tal que la coordenada perpendicular al plano activo iguale `drawDepth`.

Para **plano XY** (Z = drawDepth):
```
wz = sy_·(ndcX/s) + (-cy·sp)·(ndcY/s) + cy·cp·(zoom·(1/s - 1)) = drawDepth

Despejando s:
  s = (sy_·ndcX - cy·sp·ndcY + cy·cp·zoom) / (drawDepth + cy·cp·zoom)
```

Para **plano XZ** (Y = drawDepth):
```
  s = (cp·ndcY + sp·zoom) / (drawDepth + sp·zoom)
```

Para **plano YZ** (X = drawDepth):
```
  s = (cy·ndcX + sy_·sp·ndcY - sy_·cp·zoom) / (drawDepth - sy_·cp·zoom)
```

**Rotación inversa M^T** (la matriz de rotación es ortogonal → inversa = transpuesta):
```
wx = cy·rx2  + sy_·sp·ry2 + (-sy_·cp)·rz2
wy = cp·ry2  + sp·rz2
wz = sy_·rx2 + (-cy·sp)·ry2 + cy·cp·rz2
```

donde `rx2 = ndcX/s, ry2 = ndcY/s, rz2 = zoom·(1/s - 1)`.

### 5.4 Snap a cuadrícula

```js
const SNAP_SIZE = 0.25;  // unidades mundo

function snapPoint(pt) {
    return {
        x: Math.round(pt.x / SNAP_SIZE) * SNAP_SIZE,
        y: Math.round(pt.y / SNAP_SIZE) * SNAP_SIZE,
        z: Math.round(pt.z / SNAP_SIZE) * SNAP_SIZE,
    };
}
```

Con `SNAP_SIZE = 0.25`, la cuadrícula minor tiene paso 0.25 y la major 1.0. Se puede cambiar para mayor o menor precisión.

### 5.5 Cuadrícula 3D geoespacial

La cuadrícula se dibuja sobre el plano suelo **XZ** (Y=0), que corresponde a la vista de planta en arquitectura:

- **Eje X** (rojo) = Este-Oeste
- **Eje Z** (azul) = Norte-Sur  
- **Eje Y** (verde) = Altura / Elevación

Las líneas se proyectan usando `project()` para que respeten la perspectiva de la cámara. Las etiquetas numéricas en los ejes permiten estimar escala (1 unidad = 1 metro en la escala por defecto del proyecto).

**Proyección de líneas de cuadrícula:**
```
Para una línea vertical (constante x=v) en el plano suelo:
  p1 = project(v, 0, -gridSize)
  p2 = project(v, 0, +gridSize)

Para una línea horizontal (constante z=v):
  p3 = project(-gridSize, 0, v)
  p4 = project(+gridSize, 0, v)
```

---

## 6. Sistema de capas

```js
layers = [
    { id: 1, name: 'Capa 1', visible: true, locked: false, strokes: [...] },
    { id: 2, name: 'Capa 2', visible: true, locked: false, strokes: [...] },
]
activeLayerIdx = 0;
```

- Las capas se renderizan de índice 0 (fondo) a N (frente).
- La UI muestra las capas **en orden invertido** (la última es la más alta visualmente).
- `locked: true` impide dibujar en esa capa pero sigue siendo visible.
- El **Borrador** opera con `destination-out` en el `OffscreenCanvas` de la capa activa, sin afectar capas inferiores.
- `Ctrl+Z` / Undo: solo afecta los strokes de la capa activa.
- Al guardar (`.arte`): todos los strokes de todas las capas se aplanan en una lista. Al cargar, se restauran en una capa única (sin información de capas — mejora futura).

---

## 7. Formato de archivo .arte

Serialización binaria usando **MessagePack** (via `rmp-serde`). Más compacto que JSON (~30-50% menos tamaño) y con soporte nativo para tipos flotantes de 32 bits.

**Estructura Rust:**

```rust
// En motor_3d/trazos.rs

#[derive(Serialize, Deserialize)]
pub struct Lienzo3D {
    pub trazos: Vec<TrazoVectorial>,
}

#[derive(Serialize, Deserialize)]
pub struct TrazoVectorial {
    pub id:        u64,
    pub puntos:    Vec<Punto3D>,
    pub color:     [f32; 4],    // RGBA normalizado 0.0–1.0
    pub thickness: f32,
    pub brush:     BrushType,
}

#[derive(Serialize, Deserialize)]
pub struct Punto3D {
    pub position: Vec3,         // glam::Vec3 (x, y, z)
    pub pressure: f32,          // presión del lápiz 0.0–1.0
}

#[derive(Serialize, Deserialize)]
pub enum BrushType { Round, Flat, Sketch, Text, Eraser }
```

**Tipo IPC** (enviado por JS vía `invoke()`):

```rust
#[serde(rename_all = "camelCase")]
pub struct TrazoData {
    pub id:         u64,
    pub puntos:     Vec<PuntoData>,
    pub color:      [f32; 4],
    pub thickness:  f32,
    pub brush_type: String,     // "round" | "flat" | "sketch" | "text" | "eraser"
}
```

> `rename_all = "camelCase"` es crítico: serde convierte los nombres Rust (`brush_type`) al camelCase que espera JS (`brushType`).

---

## 8. IPC Tauri (frontend ↔ backend)

Todos los comandos están en `src-tauri/src/comunicacion/comandos.rs` y registrados en `lib.rs`.

| Comando | Dirección | Descripción |
|---------|-----------|-------------|
| `guardar_archivo_arte` | JS → Rust | Abre diálogo guardar `.arte`, serializa a MessagePack |
| `cargar_archivo_arte` | JS → Rust → JS | Abre diálogo abrir `.arte`, deserializa y retorna `Vec<TrazoData>` |
| `exportar_formato` | JS → Rust | Exporta a `.obj` o `.svg` con diálogo de archivo |
| `guardar_imagen` | JS → Rust | Recibe bytes `Vec<u8>` del canvas JPEG y guarda con diálogo |

**Flujo de exportación de imagen (JPG):**

```
JS: canvas.toBlob(blob, 'image/jpeg', 0.95)
  → blob.arrayBuffer()
  → Array.from(new Uint8Array(buffer))   ← array de bytes
  → invoke('guardar_imagen', { data: bytes, extension: 'jpg' })
  → Rust: std::fs::write(path, &data)
```

No se procesa la imagen en Rust — el browser hace la compresión JPEG y Rust solo escribe los bytes al disco.

---

## 9. Módulo Rust: motor_3d

### trazos.rs

Contiene todos los tipos de datos del dominio. La separación entre `TrazoVectorial` (formato persistente) y `TrazoData` (formato IPC) permite cambiar la representación interna sin romper el protocolo con JS.

```
TrazoData (IPC / JSON)  ←→  TrazoVectorial (disco / MessagePack)
         ↕ to_trazo_vectorial() / from_trazo_vectorial()
```

### exportar.rs

**Exportación OBJ:** itera los trazos y escribe vértices (`v x y z`) y líneas (`l i0 i1 ... iN`). Los trazos son polilíneas, no mallas.

**Exportación SVG:** usa `rayon::par_iter()` para proyectar puntos 3D en paralelo con la `matriz_camara` (`glam::Mat4`). La proyección es:
```rust
let ndc = (matriz_camara * pos.extend(1.0)).truncate() / w;
let sx  = (ndc.x + 1.0) * 0.5 * ancho;
let sy  = (1.0 - ndc.y) * 0.5 * alto;
```
Actualmente se pasa `Mat4::IDENTITY` como cámara, lo que genera una proyección ortográfica simple. Para una vista perspectiva correcta en SVG hay que construir la matriz de proyección con los valores de `cam` del frontend.

### pipeline.rs

Stub vacío. Era el pipeline WGPU; fue eliminado al migrar a Canvas 2D. Se mantiene el archivo para evitar romper el `mod.rs`.

---

## 10. Exportación

| Formato | Backend | Notas |
|---------|---------|-------|
| `.arte` | Rust (MessagePack) | Formato nativo, preserva toda la información |
| `.jpg` | Browser Canvas API | El browser comprime; Rust solo escribe bytes |
| `.obj` | Rust | Polilíneas 3D, importable en Blender/Maya/FreeCAD |
| `.svg` | Rust | Vista plana proyectada; útil para planos en escala |

**Para agregar un nuevo formato** (ej: DXF para AutoCAD):

1. Agregar variante en `exportar.rs`:
```rust
pub fn a_dxf(lienzo: &Lienzo3D, path: impl AsRef<Path>) -> Result<(), Box<dyn Error>> { ... }
```
2. Agregar el `match` en `comandos.rs`:
```rust
"dxf" => Exportador::a_dxf(&lienzo, file_path.to_string())?,
```
3. Agregar botón en `index.html` e `invoke()` en `main.js`.

---

## 11. Input — teclado, mouse, tablet/Wacom

### Atajos completos

| Tecla | Acción |
|-------|--------|
| `1` | Herramienta Tubo (round) |
| `2` | Herramienta Plano (flat) |
| `3` | Herramienta Boceto (sketch) |
| `4` | Herramienta Texto (toggle) |
| `E` | Herramienta Borrador |
| `H` | Herramienta Mano / Pan mode |
| `G` | Toggle cuadrícula 3D |
| `S` | Toggle Snap a cuadrícula |
| `R` | Reset cámara (yaw=0, pitch=0, zoom=2.5, viewScale=1, pan=0) |
| `+` / `=` | Zoom in ×1.1 |
| `-` | Zoom out ÷1.1 |
| `Ctrl+Z` | Deshacer (último stroke de la capa activa) |
| `Ctrl+S` | Guardar .arte |
| `T` | Toggle modo texto |
| `Tab` | Toggle modo presentación |
| `Esc` | Salir del modo activo |

### Métodos de pan

El pan fue el input más problemático en Linux/Tauri. Solución final:

| Método | Implementación |
|--------|---------------|
| Botón central del mouse | `e.button === 1` en `pointerdown` |
| Alt + arrastrar | `altHeld` (capturado en fase `capture` de `window`) |
| Space + arrastrar | `spaceHeld` (capturado en fase `capture` de `window`) |
| Herramienta Mano | `isPanMode` activado por botón o tecla H |
| 2 dedos (touch) | `touchmove` con 2 touches → pan del centroide |

> El uso de `window.addEventListener(..., true)` (fase captura) para Space y Alt evita que el browser active botones enfocados con Space antes de que el flag se establezca.

### Soporte de presión (Wacom / stylus)

```js
const pressure = e.pressure || 0.5;  // e.pressure viene del PointerEvent API
```

La presión afecta el tamaño del cursor visual y se almacena en cada `Punto3D` para uso futuro (renderizado variable por presión).

### Pinch zoom (tablet multi-touch)

```js
// touchmove con 2 dedos:
const dist  = Math.hypot(t1.x - t0.x, t1.y - t0.y);
const scale = dist / touchState.lastDist;
cam.viewScale *= scale;                // zoom proporcional

cam.panX += midX - touchState.lastMidX;  // pan del centroide
cam.panY += midY - touchState.lastMidY;
```

---

## 12. UI — paneles arrastrables y persistencia

### Función `makeDraggable(el)`

Hace cualquier panel arrastrable con pointer events. Características:
- Respeta controles interactivos (`button`, `input`, `label`, `.palette-chip`) — no inicia arrastre sobre ellos.
- Limita la posición dentro de la ventana (`Math.max(0, Math.min(innerWidth - width, x))`).
- Persiste la posición en `localStorage` con clave `panel-pos-{id}`.
- Restaura posición al inicializar (sobrescribe el posicionado CSS).

Paneles arrastrables: `#color-dock`, `#layers-panel`, `#tool-panel`.

### Glassmorphism UI

Variables CSS en `:root`:
```css
--glass:       rgba(255,255,255,0.80)
--glass-border: rgba(255,255,255,0.95)
--shadow:      0 8px 32px rgba(0,0,0,0.11)
--accent:      #5c5ce0
--accent-light: rgba(92,92,224,0.12)
```

---

## 13. Decisiones de arquitectura importantes

### ¿Por qué no React/Vue/Svelte?

La app es lo suficientemente pequeña (~900 líneas de JS) para manejarse con vanilla JS. Agregar un framework introduciría overhead de bundle, complejidad de build, y posibles conflictos con el loop de render del canvas. El canvas 2D necesita acceso directo al DOM sin capas de abstracción.

### ¿Por qué MessagePack para .arte?

JSON no puede representar `f32` exactamente (usa f64), y los archivos de dibujo con miles de puntos pueden ser grandes. MessagePack preserva los tipos exactos y produce archivos ~40% más pequeños. `rmp-serde` integra transparentemente con los derives de `serde`.

### ¿Por qué glam para matemáticas en Rust?

Solo se usa en `exportar.rs` para la proyección SVG y en el tipo `Vec3` de `Punto3D`. `glam` está diseñado para game dev con SIMD y tiene tipos `Serialize`/`Deserialize` integrados con el feature `serde`. Alternativa: `nalgebra` (más completo pero más pesado).

### ¿Por qué rayon en el exportador SVG?

La proyección de cada punto 3D es independiente → paralelismo trivial (`par_iter()`). En dibujos grandes (decenas de miles de puntos) esto reduce el tiempo de exportación proporcionalmente al número de núcleos del CPU. No hay overhead en dibujos pequeños ya que rayon ajusta el tamaño del pool.

---

## 14. Preparación para producción

### Build release

```bash
# Compila en modo release con las optimizaciones del Cargo.toml:
# opt-level="z" (tamaño mínimo), lto=true, codegen-units=1, strip=true
npm run tauri build
```

El binario resultante estará en:
```
src-tauri/target/release/bundle/
  ├── deb/arte_0.1.0_amd64.deb      ← Linux (Debian/Ubuntu)
  ├── rpm/arte-0.1.0.x86_64.rpm     ← Linux (Fedora/RHEL)
  ├── appimage/arte_0.1.0_amd64.AppImage
  ├── dmg/arte_0.1.0_x64.dmg        ← macOS
  └── msi/arte_0.1.0_x64_en-US.msi  ← Windows
```

### Checklist antes de release

- [ ] Actualizar `version` en `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`
- [ ] Agregar iconos en `src-tauri/icons/` (png 32/128/256, icns, ico)
- [ ] Configurar `productName`, `identifier` en `tauri.conf.json`
- [ ] Revisar permisos en `tauri.conf.json` — solo los necesarios (`dialog`, `fs` para las rutas de exportación)
- [ ] Probar `tauri build` en Linux, macOS y Windows
- [ ] Verificar que `GDK_BACKEND=x11` y `WEBKIT_DISABLE_DMABUF_RENDERER=1` solo se aplican en Linux (`#[cfg(target_os = "linux")]`)
- [ ] Ejecutar `cargo clippy` y resolver warnings
- [ ] Ejecutar `cargo audit` para vulnerabilidades en dependencias

### Variables de entorno Linux (requeridas)

```rust
// src-tauri/src/lib.rs — solo en Linux
std::env::set_var("GDK_BACKEND", "x11");
std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
```

Sin estas variables, en Linux con Wayland/X11 la ventana puede quedarse en blanco o mostrar artefactos de renderizado por conflicto entre GTK/WebKit y los compositores modernos.

### Optimizaciones de release en Cargo.toml

```toml
[profile.release]
panic     = "abort"       # elimina el unwinder, -15% tamaño binario
codegen-units = 1         # una unidad → mejor inlining cross-crate
lto       = true          # Link-Time Optimization → elimina código muerto
opt-level = "z"           # optimizar para tamaño (vs "3" para velocidad)
strip     = true          # elimina símbolos de debug del binario
```

### Agregar una nueva funcionalidad — flujo recomendado

1. **UI solamente** (nuevo botón, panel): editar `index.html` + `styles.css` + event listener en `main.js`.
2. **Nueva herramienta de dibujo**: agregar `brushType` en `drawStroke()` con su lógica de renderizado Canvas 2D.
3. **Nueva operación con archivos**: agregar comando en `comandos.rs`, registrar en `lib.rs`, llamar con `invoke()` desde `main.js`.
4. **Nuevo formato de exportación**: implementar método en `exportar.rs`, agregar al `match` en `comandos.rs`.
5. **Cambio al modelo matemático 3D**: editar `project()` y `unproject()` en `main.js` y verificar consistencia.

---

*Última actualización: 2026-06-08*
