¡Excelente trabajo! El Sprint 2 compila a la perfección y la estructura con AppState y Mutex es sumamente sólida. Ahora vamos a pasar al Sprint 3: "Optimización de Rendimiento, Control de Cámara 3D y Configuración para Android".

Necesito que completemos y pulamos los detalles críticos para que la aplicación se sienta verdaderamente profesional, fluida en hardware antiguo y esté lista para empaquetarse en Android y Linux.

Por favor, genera las modificaciones y mejoras para los siguientes puntos:

---

### 1. SISTEMA DE ÓRBITA Y CÁMARA 3D (src-tauri/src/motor_3d/pipeline.rs y src/main.js)
Para apreciar el diseño tridimensional al estilo Feather, el usuario necesita rotar, trasladar (pan) y hacer zoom en la escena.
- Backend (Rust): Añade comandos IPC `actualizar_camara` que reciban una matriz de transformación o valores de ángulo (pitch, yaw) y distancia de zoom. El pipeline de WGPU debe actualizar el Uniform Buffer de la cámara instantáneamente.
- Frontend (JS): Implementa la lógica en `main.js` para que, cuando el usuario use dos dedos (en Android) o mantenga presionada la barra espaciadora / clic derecho (en Linux), el movimiento del puntero cambie los ángulos de la cámara en lugar de dibujar un trazo.

---

### 2. FILTRADO DE PUNTOS REDUNDANTES (OPTIMIZACIÓN PLUMA)
Cuando el usuario dibuja rápido, el evento `pointermove` genera cientos de puntos por segundo. Si están muy cerca, saturan la GPU innecesariamente en PCs viejas.
- Implementa en JS o en el backend de Rust (antes de enviar a Lyon) un algoritmo de simplificación simple (como una distancia umbral mínima entre puntos o el algoritmo de Douglas-Peucker). Si un punto nuevo está a menos de 1 o 2 píxeles del anterior, se ignora o se fusiona para mantener la malla ultra ligera.

---

### 3. DIÁLOGOS NATIVOS DE ARCHIVO (src-tauri/src/comunicacion/comandos.rs)
Asegúrate de que los comandos `guardar_archivo_arte` y `cargar_archivo_arte` utilicen el plugin oficial de diálogos de Tauri v2 (`tauri-plugin-dialog`) para abrir la ventana nativa del sistema operativo (tanto en Linux como en Android) para guardar con la extensión `.arte` y filtrar los archivos correctamente.

---

### 4. CONFIGURACIÓN COMPLETA PARA ANDROID
Prepara el entorno de Tauri v2 para compilar hacia móviles de bajos recursos:
- Genera o indica las modificaciones necesarias en `src-tauri/tauri.conf.json` para dar los permisos nativos correctos en Android (almacenamiento para guardar los archivos .arte y las exportaciones .svg/.png).
- Optimiza los perfiles de compilación en el `Cargo.toml` añadiendo `panic = "abort"` y `opt-level = "z"` para el perfil de release, garantizando que el APK final pese lo mínimo posible.

Por favor, entrégame el código limpio para actualizar estas interacciones, asegurando que mantengamos el rendimiento al máximo sin tirones en la tasa de refresco de la pantalla.
