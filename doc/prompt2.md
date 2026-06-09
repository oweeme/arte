¡Excelente trabajo con la base modular y el soporte .arte usando MessagePack! La compilación con cargo check es exitosa. Ahora vamos a pasar al Sprint 2 para conectar el motor de Rust con la interfaz gráfica.

Necesito que completes el resto de la aplicación implementando el Pipeline Gráfico con WGPU, los comandos IPC de Tauri v2 y el Frontend en JavaScript Vanilla. El objetivo es que el usuario ya pueda dibujar en la pantalla y ver las líneas vectoriales renderizadas en 3D por la GPU sin que la interfaz se trabe.

Por favor, genera el código completo sin placeholders para los siguientes componentes:

---

### 1. EL PIPELINE GRÁFICO (src-tauri/src/motor_3d/pipeline.rs y mod.rs)
Desarrolla la inicialización de WGPU vinculada a la ventana de Tauri v2. 
- Debe configurar el dispositivo (Device) y la cola (Queue) utilizando Vulkan por defecto (o WebGL2/OpenGL ES de respaldo para PCs antiguas).
- Implementa los Shaders básicos en WGSL (dentro del mismo archivo o en una cadena de texto de Rust) que reciban los vértices tridimensionales generados a partir de nuestros trazos y apliquen la matriz de View-Projection (`glam::Mat4`) calculada en la cámara.
- Integra la librería `lyon` para que, cada vez que se actualice el `Lienzo3D`, convierta las líneas en mallas de triángulos listas para el buffer de la GPU.

---

### 2. LOS COMANDOS IPC Y CANALES DE TAURI (src-tauri/src/comunicacion/comandos.rs y mod.rs)
Registra los comandos de Tauri v2 necesarios para que el frontend interactúe con el motor de Rust de forma asíncrona:
- `inicializar_lienzo`: Crea un lienzo en blanco en la memoria.
- `agregar_punto_a_trazo`: Un comando optimizado o un stream de canal (`tauri::ipc::Channel`) que reciba en tiempo real las coordenadas (x, y, pressure) enviadas continuamente por el lápiz o mouse.
- `guardar_archivo_arte` y `cargar_archivo_arte`: Invoca los métodos de MessagePack del sprint anterior mediante cuadros de diálogo nativos.
- `exportar_formato(formato: String)`: Ejecuta las funciones de exportación (.obj, .svg, .png) que creamos en el módulo `exportar.rs`.

---

### 3. EL FRONTEND PLUMA (src/index.html, src/styles.css, src/main.js)
Diseña una interfaz ultra limpia y ligera sin frameworks (Vanilla JS puro):
- `index.html`: Debe tener un elemento `<canvas>` que ocupe el 100% de la pantalla y una barra lateral flotante usando CSS Flexbox/Grid con estilo cyberpunk/minimalista (botones para Herramienta Lápiz, Borrar, Rotar Cámara, Selector de Color nativo, Guardar y Exportar).
- `main.js`: Configura los listeners de eventos utilizando `pointerdown`, `pointermove` y `pointerup` para capturar la presión real del lápiz óptico (`event.pressure`). Debe enviar de forma continua y fluida estos puntos hacia el comando de Tauri, y gestionar la interacción táctil para rotar la cámara 3D usando clics de arrastre alternativos.

Asegúrate de conectar todos estos módulos en el archivo principal `src-tauri/src/main.rs` (u orquestador de Tauri v2) para que el proyecto compile de forma nativa listo para usar con 'npm run tauri dev'.
