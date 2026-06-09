# Arte — Historial de Cambios

> Desarrollado por **Hector Martinez Almanza** · [oweeme.com](https://oweeme.com)

---

## v0.2.0 — 2026-06-08

### Fix: Click en el centro de los botones no respondía

**Problema:** Al hacer clic en el centro de un botón de herramienta (donde está el ícono SVG),
el botón no se activaba. Solo respondía si se hacía clic en el borde del área del botón.

**Causa:** Los elementos `<svg>` dentro de los `<button>` absorbían los eventos de puntero.
Aunque los eventos hacen _bubbling_ normalmente, en algunos entornos WebKit/Tauri los SVG
con `fill="none"` o formas sin relleno crean áreas transparentes que no propagan el evento
correctamente al botón padre.

**Solución aplicada en `src/styles.css`:**
```css
.brush-btn svg, .brush-btn text { pointer-events: none; }
```
Con `pointer-events:none` en el SVG, cualquier clic en el ícono pasa directamente al
`<button>` padre, independiente de la geometría del SVG.

---

### Nuevo: Modal de Ayuda con scroll y secciones

**Cambios en `src/index.html` y `src/styles.css`:**

- El modal ahora tiene `max-height: 90vh` para no salirse de pantalla.
- Se agregó un `div.modal-scroll` con `overflow-y: auto` para hacer scrolleable el contenido.
- Scrollbar personalizado (delgado, color acento).
- Nuevas secciones dentro del modal:
  - **Licencia** (sección azul)
  - **Donaciones** (sección amarilla)
  - Atajos de teclado (existente, ahora dentro del scroll)

---

### Nuevo: Sistema de Licencia / Modo Demo

Los botones de exportación (JPG, SVG, OBJ) están bloqueados en modo demo.
Al activar una licencia válida, se habilitan sin reiniciar la app.

**Comportamiento en modo demo:**
- Botones `JPG`, `SVG`, `OBJ` con opacidad reducida y ícono 🔒.
- Al hacer clic en un botón bloqueado, se abre el modal de Ayuda con el campo de licencia.
- Las funciones de **guardar** y **abrir** `.arte` siempre funcionan (no requieren licencia).

**Activación:**
1. El usuario abre el modal de Ayuda (`?`).
2. Ingresa la clave en el campo de texto.
3. La validación es inmediata (sin recargar la app).
4. El estado se guarda en `localStorage` y persiste entre sesiones.

**Formato de clave actual:**
```
ARTE-XXXX-XXXX-XXXX
```
donde `XXXX` son exactamente 4 caracteres alfanuméricos (`A-Z`, `0-9`).

Ejemplo de clave válida: `ARTE-A1B2-C3D4-E5F6`

Ver archivo [LICENSE_SYSTEM.md](LICENSE_SYSTEM.md) para el sistema completo de generación
y validación de licencias, incluyendo validación por servidor.

---

### Nuevo: Sección de Donaciones en el modal

Se agregó una sección con links para apoyar el proyecto:
- Ko-fi: `https://ko-fi.com/oweeme`
- PayPal: `https://paypal.me/oweeme`

Para cambiar los links, editar `src/index.html` en la sección `div.modal-donate`.

---

### Limpieza: Función `a_svg` eliminada del backend Rust

La función `pub fn a_svg()` en `src-tauri/src/motor_3d/exportar.rs` (línea ~174)
fue eliminada porque:
- Nunca se llamaba desde ningún comando IPC.
- El comentario en el código decía explícitamente que SVG se genera en el frontend.
- Generaba un warning `dead_code` en cada compilación.

La exportación SVG sigue funcionando, generada completamente en `src/main.js` por la
función `exportarSVG()`.

---

## v0.1.0 — inicial

- Motor de renderizado Canvas 2D 3D
- Herramientas: Tubo, Plano, Boceto, Texto, Borrador, Mano, Mover
- Formas: Rectángulo, Círculo/Elipse
- Sistema de capas con visibilidad y bloqueo
- Paleta de color con recientes
- Cuadrícula 3D perspectiva en plano XZ
- Snap a cuadrícula (paso 0.25 unidades)
- Vistas rápidas: Perspectiva, Frente, Lateral, Superior, Isométrica
- Exportar: JPG, SVG, OBJ
- Guardar/abrir formato `.arte` (MessagePack binario)
- Paneles arrastrables con posición persistida en localStorage
- Soporte tablet/Wacom: presión, pinch zoom, pan 2 dedos
- Modo presentación (oculta UI)
- Deshacer por capa (Ctrl+Z)
- Profundidad de dibujo ajustable por plano (XY, XZ, YZ)
