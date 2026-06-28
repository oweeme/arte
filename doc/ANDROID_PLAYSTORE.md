# Arte — Android y publicación en Google Play Store

> Tauri v2 · KDE Neon 24.04 · NDK 30 · Android API 34

---

## Índice

1. [Entorno de desarrollo](#1-entorno-de-desarrollo)
2. [Compilar el APK](#2-compilar-el-apk)
3. [Firmar el APK para producción](#3-firmar-el-apk-para-producción)
4. [Compilar el AAB (Play Store)](#4-compilar-el-aab-play-store)
5. [Probar en dispositivo físico](#5-probar-en-dispositivo-físico)
6. [Crear cuenta de desarrollador en Play Store](#6-crear-cuenta-de-desarrollador-en-play-store)
7. [Preparar los assets de la ficha](#7-preparar-los-assets-de-la-ficha)
8. [Subir la primera versión](#8-subir-la-primera-versión)
9. [Proceso de revisión y publicación](#9-proceso-de-revisión-y-publicación)
10. [Actualizaciones futuras](#10-actualizaciones-futuras)
11. [CI con GitHub Actions](#11-ci-con-github-actions)
12. [Solución de problemas comunes](#12-solución-de-problemas-comunes)

---

## 1. Entorno de desarrollo

### Lo que ya tienes instalado

| Componente | Versión | Estado |
|-----------|---------|--------|
| Android Studio | Flamingo+ | ✅ instalado vía Flatpak |
| Android SDK Platform 34 | API 34 | ✅ |
| NDK | 30.0.14904198 | ✅ detectado por Tauri |
| Rust targets Android | aarch64, armv7, i686, x86_64 | ✅ instalados |
| Proyecto generado | src-tauri/gen/android/ | ✅ `tauri android init` ejecutado |

### Variables de entorno (agregar a ~/.bashrc)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | tail -1)"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"
```

Aplicar sin reiniciar:
```bash
source ~/.bashrc
```

---

## 2. Compilar el APK

### APK debug (para probar)

```bash
cd /home/oweeme/Dev/rust/arte/arte
npm run tauri android build
```

El APK queda en:
```
src-tauri/gen/android/app/build/outputs/apk/universal/debug/
app-universal-debug.apk
```

### APK release sin firmar

```bash
npm run tauri android build --release
```

El APK queda en:
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
app-universal-release-unsigned.apk
```

> **Nota:** Un APK release sin firmar no se puede subir a Play Store ni instalar
> en dispositivos con `adb install`. Hay que firmarlo primero (ver §3).

---

## 3. Firmar el APK para producción

Google Play **exige** que la app esté firmada con un keystore.
Este keystore es permanente — si lo pierdes, no puedes actualizar la app en Play Store.

### Crear el keystore (una sola vez)

```bash
keytool -genkey -v \
  -keystore ~/keystores/arte-release.jks \
  -alias arte \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Te pedirá:
- Contraseña del keystore (guárdala bien)
- Nombre, organización, ciudad, país
- Contraseña del key alias (puede ser la misma)

> **CRÍTICO:** Haz backup de `arte-release.jks` en un lugar seguro
> (USB, nube cifrada). Sin él no puedes publicar actualizaciones.

### Configurar la firma en Gradle

Editar `src-tauri/gen/android/app/build.gradle.kts`:

```kotlin
android {
    // ... configuración existente ...

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ARTE_KEYSTORE_PATH") ?: "")
            storePassword = System.getenv("ARTE_KEYSTORE_PASS") ?: ""
            keyAlias = System.getenv("ARTE_KEY_ALIAS") ?: "arte"
            keyPassword = System.getenv("ARTE_KEY_PASS") ?: ""
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}
```

### Compilar APK firmado

```bash
export ARTE_KEYSTORE_PATH="$HOME/keystores/arte-release.jks"
export ARTE_KEYSTORE_PASS="tu_contraseña_aqui"
export ARTE_KEY_ALIAS="arte"
export ARTE_KEY_PASS="tu_contraseña_aqui"

npm run tauri android build --release
```

El APK firmado queda en:
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
app-universal-release.apk   ← este es el firmado
```

### Copiar a dist/

```bash
cp src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk \
   dist/arte_0.1.0_android.apk
```

---

## 4. Compilar el AAB (Play Store)

Google Play prefiere el formato **AAB** (Android App Bundle) sobre APK.
El AAB permite que Play Store optimice el tamaño de la descarga para cada dispositivo.

```bash
# Desde el directorio del proyecto Android:
cd src-tauri/gen/android

./gradlew bundleRelease
```

El AAB queda en:
```
app/build/outputs/bundle/release/app-release.aab
```

Copiar a dist/:
```bash
cp src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab \
   dist/arte_0.1.0.aab
```

> Play Store requiere AAB desde agosto 2021 para nuevas apps.
> El APK sigue funcionando para distribución directa (fuera de Play Store).

---

## 5. Probar en dispositivo físico

### Habilitar depuración USB en el teléfono

1. Ir a **Ajustes → Acerca del teléfono**
2. Tocar **Número de compilación** 7 veces seguidas
3. Ir a **Ajustes → Opciones de desarrollador**
4. Activar **Depuración USB**

### Conectar y verificar

```bash
# Verificar que el dispositivo aparece:
adb devices

# Resultado esperado:
# List of devices attached
# R58M91XXXXX   device
```

### Instalar el APK debug directamente

```bash
adb install src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

### O lanzar directo desde Tauri (con recarga en vivo)

```bash
npm run tauri android dev
```

Esto abre el emulador o el dispositivo conectado con hot-reload.
Los cambios en HTML/CSS/JS se recargan al instante sin recompilar Rust.

---

## 6. Crear cuenta de desarrollador en Play Store

### Requisitos

- Cuenta de Google
- Pago único de **$25 USD** (tarjeta de crédito/débito)
- Datos personales o de empresa verificados
- Número de teléfono verificado

### Proceso

1. Ir a [play.google.com/console](https://play.google.com/console)
2. Hacer clic en **Comenzar** → **Crear cuenta de desarrollador**
3. Completar el formulario:
   - Nombre del desarrollador: `Hector Martinez` o `oweeme.com`
   - Email de contacto público: el que los usuarios verán
4. Pagar los $25 USD
5. Esperar la verificación (puede tardar hasta 48 horas)

> Una cuenta personal puede publicar hasta **20 apps gratis** antes de que
> Google pida verificación adicional.

---

## 7. Preparar los assets de la ficha

Play Store requiere assets específicos. Prepáralos antes de subir la app.

### Assets obligatorios

| Asset | Tamaño | Formato |
|-------|--------|---------|
| Ícono de la app | 512×512 px | PNG, sin transparencia |
| Captura de pantalla teléfono | mín. 320×568 px | JPG o PNG (mín. 2, máx. 8) |
| Descripción corta | máx. 80 caracteres | texto |
| Descripción larga | máx. 4000 caracteres | texto |

### Assets opcionales (recomendados)

| Asset | Tamaño | Formato |
|-------|--------|---------|
| Gráfico de función | 1024×500 px | JPG o PNG |
| Capturas tablet 7" | mín. 1200×600 | JPG o PNG |
| Capturas tablet 10" | mín. 1200×600 | JPG o PNG |
| Video de presentación | cualquier tamaño | URL de YouTube |

### Generar el ícono para Play Store desde logo.png

```bash
python3 -c "
from PIL import Image
img = Image.open('src-tauri/icons/logo.png').convert('RGB')  # sin transparencia
img.resize((512, 512), Image.LANCZOS).save('dist/arte_playstore_icon.png')
print('OK')
"
```

### Textos sugeridos para la ficha

**Nombre de la app:** `Arte - Dibujo 3D Vectorial`

**Descripción corta:**
```
Crea ilustraciones 3D vectoriales con perspectiva real. Exporta a SVG, JPG y OBJ.
```

**Descripción larga:**
```
Arte es una aplicación de dibujo vectorial 3D que te permite crear ilustraciones
con perspectiva tridimensional real.

✏️ Herramientas de dibujo
• Lápiz de línea libre
• Líneas rectas con snap a ángulos
• Rectángulos y elipses en 3D
• Control de profundidad (eje Z)

🎨 Estilos
• Color de relleno y contorno
• Grosor de línea ajustable
• Capas de objetos con orden Z

📤 Exportación
• SVG vectorial (requiere licencia)
• JPG de alta calidad (requiere licencia)
• OBJ 3D para usar en Blender / Unity (requiere licencia)
• Formato .arte para guardar y abrir proyectos

💾 Formato nativo
Arte guarda en formato .arte (MessagePack binario),
compacto y rápido de cargar.

🆓 Modo demo gratuito
Puedes crear y guardar proyectos ilimitados.
La exportación a SVG/JPG/OBJ requiere licencia.

Desarrollado por Hector Martinez — oweeme.com
```

---

## 8. Subir la primera versión

### En Google Play Console

1. Hacer clic en **Crear app**
2. Completar:
   - Nombre de la app: `Arte`
   - Idioma predeterminado: `Español (México)` o el de tu preferencia
   - Tipo: `App` (no Juego)
   - Gratis o de pago: `Gratis` (con compras in-app si agregas licencia)
3. Aceptar las políticas del desarrollador

### Completar la ficha de Play Store

Ir a **Presencia en Play Store → Ficha principal de Play Store**:
- Subir ícono 512×512
- Subir capturas de pantalla (mín. 2)
- Subir gráfico de función (opcional pero muy recomendado)
- Pegar descripción corta y larga

### Subir el AAB

1. Ir a **Lanzamiento → Producción** (o `Pruebas internas` para probar primero)
2. Hacer clic en **Crear nueva versión**
3. Subir el archivo `arte_0.1.0.aab`
4. Escribir las notas de la versión:
   ```
   • Primera versión de Arte
   • Dibujo vectorial 3D
   • Exportación a SVG, JPG y OBJ
   • Formato nativo .arte
   ```
5. Hacer clic en **Guardar** → **Revisar versión** → **Comenzar lanzamiento**

### Completar las secciones obligatorias antes de publicar

Play Store no te dejará publicar sin completar estas secciones:

| Sección | Dónde está |
|---------|-----------|
| Clasificación de contenido | Política → Clasificación de contenido → completar cuestionario |
| Audiencia objetivo | Política → Audiencia y contenido |
| Acceso a la app | Política → Acceso a la app (indicar si necesita login) |
| Anuncios | Política → Anuncios (indicar si tiene publicidad) |
| Protección de datos | Política → Seguridad de los datos |
| Categoría | Presencia en Play Store → Ficha → Categoría: `Productividad` o `Arte y diseño` |

### Sección "Seguridad de los datos" para Arte

Responder en el formulario de Play Store:

- **¿Recopila datos?** → Si solo guardas en localStorage: **No**
- **¿Comparte datos con terceros?** → **No**
- **¿Cifra los datos en tránsito?** → **Sí** (si usas HTTPS para validación de licencia)
- **¿El usuario puede solicitar borrar sus datos?** → **Sí** (borrar localStorage)

---

## 9. Proceso de revisión y publicación

### Tiempos estimados

| Tipo de lanzamiento | Tiempo de revisión |
|--------------------|--------------------|
| Primera publicación | 3 a 7 días hábiles |
| Actualizaciones posteriores | 1 a 3 días hábiles |
| Track de pruebas internas | Instantáneo (sin revisión) |

### Estrategia recomendada para la primera publicación

**Paso 1 — Pruebas internas** (instantáneo, sin revisión):
- Subir el AAB a "Pruebas internas"
- Agregar tu email como tester
- Probar la app completa en tu teléfono
- Identificar bugs antes de la revisión oficial

**Paso 2 — Pruebas abiertas / cerradas** (opcional):
- Abrir el track a un grupo pequeño de usuarios
- Recibir feedback antes del lanzamiento público

**Paso 3 — Producción**:
- Promover la versión de pruebas a producción
- O subir directamente a producción

### Si Play Store rechaza la app

Motivos comunes y soluciones:

| Rechazo | Solución |
|---------|----------|
| Política de metadatos | Revisar que la descripción no tenga spam ni keywords repetidas |
| Política de privacidad | Agregar URL de política de privacidad (puede ser una página simple en GitHub Pages) |
| Ícono no cumple requisitos | Asegurar 512×512 sin transparencia, sin bordes redondeados manuales |
| Permisos no justificados | Verificar que AndroidManifest.xml solo pida lo necesario |
| Clasificación incorrecta | Ajustar el cuestionario de clasificación de contenido |

### Política de privacidad (requerida)

Play Store exige una URL de política de privacidad. Puedes crear una página simple:

```html
<!-- https://oweeme.github.io/arte/privacy -->
<h1>Arte — Política de Privacidad</h1>
<p>Arte no recopila ni transmite datos personales a servidores externos.</p>
<p>Los proyectos se guardan localmente en el dispositivo del usuario.</p>
<p>Si el usuario activa una licencia, la clave se guarda localmente (localStorage).</p>
<p>No hay publicidad, rastreo ni analíticas de terceros.</p>
<p>Contacto: hector@oweeme.com</p>
```

Subir a GitHub Pages y usar esa URL en Play Console.

---

## 10. Actualizaciones futuras

### Proceso de actualización

```bash
# 1. Incrementar la versión en Cargo.toml y tauri.conf.json
#    version = "0.2.0"

# 2. Incrementar versionCode en build.gradle.kts
#    versionCode = 2   ← siempre incrementar, nunca repetir
#    versionName = "0.2.0"

# 3. Compilar y firmar
npm run tauri android build --release

# 4. Subir el nuevo AAB en Play Console
#    Lanzamiento → Producción → Crear nueva versión
```

### Reglas importantes de versiones en Play Store

- `versionCode` debe **siempre aumentar** (Play Store lo rechaza si repites)
- `versionName` es lo que ven los usuarios (puede ser lo que quieras)
- No puedes **bajar** de versión — si 0.2.0 tiene un bug crítico, debes publicar 0.2.1

### Dónde está versionCode en el proyecto Tauri

```
src-tauri/gen/android/app/build.gradle.kts
```

```kotlin
android {
    defaultConfig {
        versionCode = 1      // ← incrementar en cada release
        versionName = "0.1.0"
    }
}
```

---

## 11. CI con GitHub Actions

Automatiza la compilación y firma del AAB en cada tag de release:

```yaml
# .github/workflows/android.yml

name: Android Release

on:
  push:
    tags: ['v*']

jobs:
  build-android:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install NDK
        run: sdkmanager "ndk;26.1.10909125"

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

      - name: Install cargo-ndk
        run: cargo install cargo-ndk

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Decode keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > arte-release.jks

      - name: Build Android AAB
        env:
          NDK_HOME: ${{ env.ANDROID_NDK_ROOT }}
          ARTE_KEYSTORE_PATH: ${{ github.workspace }}/arte-release.jks
          ARTE_KEYSTORE_PASS: ${{ secrets.ARTE_KEYSTORE_PASS }}
          ARTE_KEY_ALIAS: arte
          ARTE_KEY_PASS: ${{ secrets.ARTE_KEY_PASS }}
        run: npm run tauri android build --release

      - name: Upload AAB
        uses: actions/upload-artifact@v4
        with:
          name: arte-android
          path: src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab
```

### Secrets de GitHub necesarios

En **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 ~/keystores/arte-release.jks` |
| `ARTE_KEYSTORE_PASS` | tu contraseña del keystore |
| `ARTE_KEY_PASS` | tu contraseña del key alias |

---

## 12. Solución de problemas comunes

### "set_shadow not found" al compilar para Android

`set_shadow` no existe en Android. Usar `#[cfg(not(target_os = "android"))]`:

```rust
.setup(|app| {
    #[cfg(not(target_os = "android"))]
    {
        let window = app.get_webview_window("main").unwrap();
        let _ = window.set_shadow(true);
    }
    Ok(())
})
```

Arte ya tiene esta corrección aplicada.

### "ANDROID_HOME not set"

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
# Tauri lo detecta automáticamente si está en la ruta estándar
```

### "NDK not found"

```bash
# Verificar qué versiones de NDK tienes:
ls $ANDROID_HOME/ndk/

# Instalar NDK desde Android Studio:
# SDK Manager → SDK Tools → NDK (Side by side) → versión más reciente
```

### La app se ve muy pequeña en el teléfono

El HTML tiene viewport fijo. Agregar en `src/index.html` dentro de `<head>`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
```

### El canvas no responde al toque

El canvas solo tiene eventos de mouse. Para agregar touch:

```javascript
// En src/main.js — adaptar los event listeners del canvas
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    handleMouseUp();
}, { passive: false });
```

### "Gradle build failed" — versión de Java incorrecta

```bash
# Verificar versión de Java:
java -version
# Debe ser Java 17

# Si tienes otra versión:
sudo apt install openjdk-17-jdk
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
```

### "minSdkVersion too low"

Tauri v2 requiere Android 5.0+ (API 21). Si Gradle falla por esto:

En `src-tauri/gen/android/app/build.gradle.kts`:
```kotlin
android {
    defaultConfig {
        minSdk = 21
        targetSdk = 34
    }
}
```

---

## Resumen de comandos rápidos

```bash
# Variables de entorno (una vez por terminal)
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | tail -1)"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"

# ── Desarrollo ──────────────────────────────────────────────────
npm run tauri android dev          # lanzar en dispositivo con hot-reload
adb devices                        # verificar dispositivo conectado

# ── Compilar APK debug ──────────────────────────────────────────
npm run tauri android build
# → src-tauri/gen/android/app/build/outputs/apk/universal/debug/

# ── Compilar AAB release (Play Store) ──────────────────────────
export ARTE_KEYSTORE_PATH="$HOME/keystores/arte-release.jks"
export ARTE_KEYSTORE_PASS="tu_contraseña"
export ARTE_KEY_ALIAS="arte"
export ARTE_KEY_PASS="tu_contraseña"

npm run tauri android build --release
cd src-tauri/gen/android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab

# ── Subir a Play Store ──────────────────────────────────────────
# play.google.com/console → Lanzamiento → Producción → Nueva versión
# Subir app-release.aab → Revisar → Publicar
```

---

*Última actualización: 2026-06-09 | Tauri v2 | Android NDK 30 | API 34*
