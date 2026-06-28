Actúa como un Arquitecto de Software Fullstack Senior especialista en Rust, Tauri v2 y Gráficos 3D de bajo nivel (WGPU). Vamos a desarrollar una aplicación de dibujo vectorial 3D interactiva inspirada en "Feather 3D Art". 

El enfoque principal del software es "ESTILO PLUMA": debe ser ultra ligero, consumir el mínimo de RAM posible, arrancar instantáneamente y ser altamente eficiente para correr tanto en PCs antiguas (Ubuntu 24 con OpenGL/Vulkan viejo) como en dispositivos Android modernos.

La interfaz de usuario (UI) se construirá con HTML5, CSS3 y JavaScript VANILLA (puro, sin frameworks como Vue o Quasar) dentro del entorno de Tauri v2. El lienzo de dibujo 3D se renderizará de forma nativa a través de WGPU mapeado sobre la ventana de Tauri, enviando los datos de la UI al backend mediante canales IPC asíncronos y sin bloqueo.

---

### ESTRUCTURA DE DATOS PRINCIPAL Y FORMATO PROPIETARIO

Necesito que diseñes e implementes la lógica en Rust para las estructuras de datos que representarán el lienzo en el espacio 3D. A diferencia de un software de mallas poligonales, este sistema guarda trazos (strokes) formados por puntos matemáticos espaciales.

1. Define una estructura llamada `Punto3D` que contenga:
   - Coordenadas espaciales (x, y, z) usando vectores `glam::Vec3`.
   - Presión del lápiz óptico o grosor (pressure: f32).
   - Marca de tiempo o índice del punto dentro del trazo.

2. Define una estructura llamada `TrazoVectorial` que contenga:
   - Un identificador único (id: u64).
   - Un vector de `Punto3D`.
   - El color del trazo (r, g, b, a: f32).
   - El tipo de brocha o estilo de renderizado.

3. Define una estructura llamada `Lienzo3D` que agrupe todos los `TrazoVectorial`.

Implementa para estas estructuras la serialización y deserialización usando `serde`. El formato propietario de guardado nativo de la aplicación debe ser un binario ultra optimizado (puedes estructurar la serialización hacia un formato JSON compacto o MessagePack usando serde) con la extensión `.arte`.

---

### MÓDULO DE EXPORTACIÓN MULTI-FORMATO

Para que los diseños vectoriales 3D creados puedan apreciarse fuera de la aplicación, implementa un módulo de exportación en Rust que tome el `Lienzo3D` y permita generar los siguientes archivos de salida:

1. Exportación a OBJ (.obj): Convierte los trazos tridimensionales en tubos poligonales de malla (mesh) simples o líneas tridimensionales nativas para que puedan abrirse en Blender, Maya o software CAD manteniendo la posición en el espacio 3D.
2. Exportación a SVG Proyectado (.svg): Toma la matriz de la cámara actual (glam::Mat4), proyecta los trazos 3D del lienzo en un plano 2D según la perspectiva matemática del usuario, y genera un archivo vectorial estándar imprimible o editable en Illustrator/Inkscape.
3. Exportación a PNG de Alta Resolución (.png): Configura un pipeline de WGPU en el fondo para renderizar la escena en un búfer de textura oculto (Offscreen Rendering) con el tamaño de resolución que el usuario pida, guardando la captura con transparencia.

---

### CÓDIGO REQUERIDO PARA ESTE SPRINT

Por favor, genérame el código completo y detallado para los siguientes archivos de la arquitectura:
1. `src-tauri/src/motor_3d/trazos.rs`: Donde residirán las estructuras `Punto3D`, `TrazoVectorial`, `Lienzo3D`, sus implementaciones de álgebra lineal con `glam` y sus métodos de guardar/cargar en archivos nativos `.arte`.
2. `src-tauri/src/motor_3d/exportar.rs`: La lógica matemática para procesar las exportaciones a .obj, .svg (proyección de cámara) y la infraestructura base para el renderizado oculto a imagen.

Asegúrate de que el código sea modular, esté exhaustivamente comentado, no use placeholders innecesarios, implemente un manejo de errores robusto con `Result` nativo de Rust y esté optimizado para paralelismo con `rayon`.
