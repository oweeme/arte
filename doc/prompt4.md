Hemos logrado levantar el entorno de desarrollo y la comunicación nativa funciona de manera óptima. Ahora vamos a iterar sobre la interfaz gráfica y la experiencia de usuario (UX) para acercarla al diseño exacto de "Feather 3D Art", resolviendo dos problemas críticos: la selección del tipo de pincel y la falta de un indicador visual del pincel en el cursor.

Por favor, genera el código completo y las modificaciones necesarias para el frontend (HTML/JS/CSS) y los comandos de Rust bajo los siguientes requerimientos:

---

### 1. BARRA DE HERRAMIENTAS ESTILO "FEATHER 3D" (src/index.html y src/styles.css)
Rediseña la UI flotante para que se parezca a las capturas de referencia:
- Elimina la barra lateral oscura e implementa dos paneles flotantes limpios con CSS Glassmorphism (fondo blanco/transparente ultra ligero, bordes redondeados sutiles y sombras suaves).
- PANEL IZQUIERDO (Brocha y Parámetros): Un dock vertical estilizado que contenga:
  1. Icono selector de tipo de pincel (Menú desplegable pluma con 3 tipos: Pincel Plano/Cinta, Pincel Redondo/Tubo y Pincel de Boceto Fino).
  2. Un indicador numérico circular para el Grosor del trazo (Tamaño en px).
  3. Un slider vertical o botón de Opacidad (0% a 100%).
  4. El botón redondo para invocar el selector de color.
- PANEL SUPERIOR DERECHO (Controles de Escena): Un dock horizontal pequeño con botones minimalistas para: Deshacer/Rehacer, Limpiar Lienzo (Papelera), Guardar (.arte) y Exportar.

---

### 2. INDICADOR DE CURSOR DINÁMICO (src/main.js y src/styles.css)
Actualmente el cursor no muestra dónde ni de qué tamaño se va a pintar, lo cual rompe la UX en 3D.
- En `index.html`, añade un elemento HTML flotante absoluto (por ejemplo, `<div id="cursor-3d"></div>`) que estará oculto por defecto.
- En `main.js`, oculta el cursor nativo del sistema sobre el lienzo usando CSS (`cursor: none;`).
- Implementa un listener en el evento `pointermove` para que este elemento circular flote exactamente debajo de las coordenadas $(x, y)$ del lápiz o ratón.
- El tamaño (width/height) de este círculo debe cambiar dinámicamente en tiempo real según el tamaño del pincel seleccionado o la presión (`event.pressure`) ejercida por el lápiz, simulando un verdadero cursor 3D.

---

### 3. TIPOS DE PINCEL EN EL MOTOR (src-tauri/src/motor_3d/trazos.rs y pipeline.rs)
Para que la tarjeta gráfica dibuje pinceles distintos:
- Backend (Rust): Modifica la función de teselación con `lyon` para que lea el campo `tipo_pincel` (String o Enum) enviado desde el frontend.
- Si el pincel es "Redondo/Tubo", `lyon` debe generar una malla con volumen (triángulos que formen un cilindro alrededor de los puntos). Si es "Plano/Cinta", debe generar una franja plana bidimensional orientada hacia la cámara.
- Añade el comando IPC `cambiar_tipo_pincel(tipo: String)` para actualizar el estado global antes de iniciar un trazo.

Entrega los archivos modificados con código limpio, modular, sin placeholders, asegurando que la interfaz se mantenga responsiva, ligera como una pluma y con la estética limpia y fluida del software original.
