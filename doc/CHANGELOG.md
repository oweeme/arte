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

---

## v0.1.1 — 2026-06-09

### Fix: Íconos corregidos

- `icon.ico` regenerado desde `logo.png` (1024×1024) con 7 tamaños: 16, 24, 32, 48, 64, 128, 256 px
- `icon.icns` regenerado para macOS con tamaños: 16, 32, 64, 128, 256, 512, 1024 px
- `128x128@2x.png` corregido de 128×128 → **256×256** (era el único tamaño incorrecto)
- `32x32.png` y `128x128.png` regenerados con filtro Lanczos para mayor calidad
- Título de ventana cambiado de `"arte"` a `"Arte"` en `tauri.conf.json`

### Nuevo: Metadatos del instalador .deb

- `productName` cambiado a `"Arte"` (con mayúscula)
- `publisher`: `"Hector Martinez"`
- `category`: `"Graphics and Design"`
- `shortDescription`: `"Dibujo vectorial 3D"`
- `longDescription` completa en `tauri.conf.json`
- Archivo AppStream metainfo (`flatpak/com.oweeme.arte.metainfo.xml`) incluido dentro del `.deb`
  → KDE Discover muestra **Arte** y **Hector Martinez** en lugar de `arte_0` y `Unknown author`

### Nuevo: Soporte Android mejorado para tablets

**`AndroidManifest.xml`:**
- `<supports-screens>` con `requiresSmallestWidthDp="600"` — solo tablets de 7"+
- `android:resizeableActivity="true"` — soporte multi-ventana
- `android:largeHeap="true"` — más memoria para el canvas 3D
- Permisos de almacenamiento externo para guardar/exportar archivos

**Touch events en `src/main.js`:**
- Un dedo → dibuja (simula `pointerdown/move/up`)
- Dos dedos → pinch zoom + pan (ya existía, mejorado)
- `touchend` → dispara `pointerup` para cerrar trazos correctamente

**CSS responsive para tablets (`src/styles.css`):**
- Media query `@media (min-width: 600px) and (pointer: coarse)`
- Botones de herramienta: 52×52 px (antes 40×40)
- Swatches de color más grandes
- Cursor ring desactivado en touch
- Modal más ancho (420px en tablet)

**`src/index.html`:**
- Viewport: `user-scalable=no` para evitar zoom accidental al dibujar
- `theme-color` para barra de estado de Android
- `mobile-web-app-capable`

### Nuevo: Keystore Android creado

- Archivo: `~/keystores/arte-release.jks`
- Alias: `arte`
- Algoritmo: RSA 2048 bits, validez 10000 días
- CN: `Hector Martinez`, O: `oweeme.com`, C: MX
- La contraseña y el archivo **no se suben al repo** (en `.gitignore`)
- El APK generado está **firmado con V2 signing** (requerido por Play Store)

### Nuevo: Build Android firmado

- APK release firmado: `Arte_0.1.0_android.apk` (18 MB)
- AAB release firmado: `Arte_0.1.0_android.aab` (9.4 MB) — para Play Store
- Verificado con `apksigner`: `CN=Hector Martinez, O=oweeme.com`

---

## v0.1.2 — 2026-06-09

### Nuevo: GitHub Actions — CI/CD para todas las plataformas

Archivo: `.github/workflows/build.yml`

Se activa automáticamente con `git tag vX.X.X && git push origin vX.X.X`.

**Jobs configurados:**

| Job | Runner | Genera |
|-----|--------|--------|
| `build-windows` | `windows-latest` | `.msi` + `.exe` NSIS con instalador |
| `build-linux` | `ubuntu-22.04` | `.deb`, `.rpm`, `.AppImage` |
| `build-android` | `ubuntu-22.04` | `.apk` + `.aab` firmados |
| `build-macos` | `macos-latest` | `.dmg` universal (Intel + M1/M2) |
| `build-ios` | `macos-latest` | `.ipa` (requiere Apple Developer $99/año) |
| `create-release` | `ubuntu-22.04` | GitHub Release con todos los archivos |

**Secrets configurados en el repo:**

| Secret | Uso |
|--------|-----|
| `ANDROID_KEYSTORE_BASE64` | Keystore en base64 para firmar APK/AAB |
| `ARTE_KEYSTORE_PASS` | Contraseña del keystore |
| `ARTE_KEY_PASS` | Contraseña del alias `arte` |

**Permisos del workflow:**
```yaml
permissions:
  contents: write   # necesario para crear GitHub Releases
```

**macOS Universal Binary:**
El job `build-macos` compila para `aarch64-apple-darwin` (M1/M2) y `x86_64-apple-darwin` (Intel)
por separado, luego los combina con `lipo -create` en un binario universal `.dmg`.

**iOS:**
El job `build-ios` tiene `continue-on-error: true` y no bloquea el Release.
Sin cuenta Apple Developer ($99/año) el `.ipa` no se puede instalar en dispositivos reales.

### Repo privado en GitHub

- URL: `https://github.com/oweeme/arte` (privado)
- Branch principal: `main`
- Para hacer los instaladores públicos: subir a Google Drive, o hacer el repo público

### Cómo lanzar un nuevo build

```bash
# En tu terminal, dentro del proyecto:
git add .
git commit -m "Arte v0.2.0 — descripción de cambios"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

GitHub Actions compila todo en ~20 minutos y crea el Release automáticamente en:
`https://github.com/oweeme/arte/releases`

---

## Configuración del entorno de desarrollo (KDE Neon 24.04)

### Variables de entorno necesarias para Android

Agregar a `~/.bashrc`:
```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | tail -1)"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
```

### Compilar localmente

```bash
# Linux (.deb .rpm .AppImage)
npm run tauri build

# Windows (.exe — binario sin instalador, para pruebas)
cargo build --release --target x86_64-pc-windows-gnu --manifest-path src-tauri/Cargo.toml

# Android (APK + AAB firmados)
export ARTE_KEYSTORE_PATH="$HOME/keystores/arte-release.jks"
export ARTE_KEYSTORE_PASS="Arte2024Secure!"
export ARTE_KEY_ALIAS="arte"
export ARTE_KEY_PASS="Arte2024Secure!"
./node_modules/.bin/tauri android build

# Solo un bundle específico
npm run tauri build -- --bundles deb
npm run tauri build -- --bundles rpm,appimage
```

### Archivos importantes que NO se suben al repo

```
~/keystores/arte-release.jks   ← keystore Android (HACER BACKUP)
dist/                           ← instaladores generados localmente
src-tauri/target/               ← compilados de Rust
node_modules/                   ← dependencias npm
```

### Backup del keystore (crítico)

Sin `arte-release.jks` no se pueden publicar actualizaciones en Play Store.
Hacer backup en al menos dos lugares:

```bash
# Copiar a USB:
cp ~/keystores/arte-release.jks /media/usb/arte-release.jks

# Ver fingerprint para verificar integridad:
keytool -list -keystore ~/keystores/arte-release.jks -alias arte
# Contraseña: Arte2024Secure!
# SHA-256: 5a:17:93:90:08:c0:d6:8c:a5:c3:3c:90:12:13:ed:cb:e4:9f:9d:1e:3e:33:30:cf:06:0c:61:db:33:b9:90:f7
```
