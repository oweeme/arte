# Arte — Compilar para Producción

> Linux · Windows · Android · macOS · iOS  
> Tauri v2 · Rust stable · @tauri-apps/cli 2.11.2

---

## Índice

1. [Requisitos base (todos los targets)](#1-requisitos-base-todos-los-targets)
2. [Preparar el proyecto antes de compilar](#2-preparar-el-proyecto-antes-de-compilar)
3. [Build para Linux](#3-build-para-linux)
4. [Build para Windows (cross-compile desde Linux)](#4-build-para-windows-cross-compile-desde-linux)
5. [Build para Android](#5-build-para-android)
6. [Build para macOS](#6-build-para-macos)
7. [Build para iOS](#7-build-para-ios)
8. [GitHub Actions — CI/CD automatizado](#8-github-actions--cicd-automatizado)
9. [Solución de problemas comunes](#9-solución-de-problemas-comunes)

---

## 1. Requisitos base (todos los targets)

### Rust y Tauri CLI

Ya los tienes instalados. Verifica versiones:

```bash
rustc --version          # rustc 1.78+ recomendado
cargo --version
npm run tauri -- --version   # debe mostrar 2.11.x
```

### Dependencias del sistema (Linux — ya instaladas si dev funciona)

```bash
# Ubuntu/Debian
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf

# Fedora/RHEL
sudo dnf install -y \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

---

## 2. Preparar el proyecto antes de compilar

### 2.1 Actualizar versión en los archivos de config

Edita **dos** archivos — deben tener la misma versión:

**`src-tauri/Cargo.toml`:**
```toml
[package]
name    = "arte"
version = "0.2.0"   # ← cambiar aquí
```

**`src-tauri/tauri.conf.json`:**
```json
{
  "productName": "arte",
  "version": "0.2.0"
}
```

### 2.2 Mejorar la configuración de la ventana para producción

En `src-tauri/tauri.conf.json`, la ventana actual es básica. Para producción:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Arte",
  "version": "0.2.0",
  "identifier": "com.oweeme.arte",
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "main",
        "title": "Arte",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "transparent": true,
        "decorations": true,
        "center": true,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "GraphicsDesign",
    "shortDescription": "Motor de dibujo vectorial 3D",
    "longDescription": "Arte es una aplicación de dibujo vectorial 3D para arquitectos, diseñadores y artistas. Permite dibujar en perspectiva 3D con herramientas profesionales.",
    "copyright": "© 2026 Hector Martinez Almanza",
    "license": "Proprietary"
  }
}
```

### 2.3 Verificar que los iconos existen

```bash
ls src-tauri/icons/
# Deben existir:
# 32x32.png  128x128.png  128x128@2x.png  icon.icns  icon.ico  icon.png
```

Si necesitas regenerar iconos desde una imagen de 1024x1024:
```bash
npm run tauri icon src-tauri/icons/icon.png
# Genera automáticamente todos los tamaños requeridos
```

---

## 3. Build para Linux

### 3.1 Comando de build

```bash
cd /home/oweeme/Dev/rust/arte/arte

npm run tauri build
```

Eso es todo. Tauri compila en release y genera los paquetes.

### 3.2 Output — dónde están los archivos

```
src-tauri/target/release/bundle/
├── deb/
│   └── arte_0.2.0_amd64.deb          ← Ubuntu/Debian/Mint
├── rpm/
│   └── arte-0.2.0-1.x86_64.rpm       ← Fedora/CentOS/RHEL
└── appimage/
    └── arte_0.2.0_amd64.AppImage     ← Funciona en cualquier distro
```

También se genera el binario en:
```
src-tauri/target/release/arte          ← binario suelto (sin instalador)
```

### 3.3 Instalación de cada formato

**AppImage** (recomendado para distribución — sin instalación):
```bash
chmod +x arte_0.2.0_amd64.AppImage
./arte_0.2.0_amd64.AppImage
```

**DEB** (Ubuntu/Debian):
```bash
sudo dpkg -i arte_0.2.0_amd64.deb
# Desinstalar:
sudo apt remove arte
```

**RPM** (Fedora):
```bash
sudo rpm -i arte-0.2.0-1.x86_64.rpm
# o con dnf:
sudo dnf install arte-0.2.0-1.x86_64.rpm
```

### 3.4 Perfil de release actual (ya optimizado)

Tu `Cargo.toml` ya tiene el perfil correcto:
```toml
[profile.release]
panic         = "abort"    # -15% tamaño
codegen-units = 1          # mejor inlining
lto           = true       # elimina código muerto
opt-level     = "z"        # optimiza tamaño
strip         = true       # elimina símbolos debug
```

### 3.5 Tamaño esperado del binario

Con estas optimizaciones:
- Binario: ~4–8 MB
- AppImage: ~15–25 MB (incluye WebKit runtime)
- DEB: ~5–10 MB

### 3.6 Probar el build de release antes de distribuir

```bash
# Ejecutar el binario release directamente (sin instalador)
./src-tauri/target/release/arte

# Si ves pantalla en blanco, verificar variables de entorno Linux:
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 ./src-tauri/target/release/arte
```

> Tu `lib.rs` ya setea estas variables automáticamente al iniciar,
> así que los usuarios no necesitan setearlas manualmente.

---

## 4. Build para Windows (cross-compile desde Linux)

Hay dos opciones:

| Opción | Ventajas | Desventajas |
|--------|---------|-------------|
| **Cross-compile desde Linux** | No necesitas Windows | Más complejo de configurar |
| **Build nativo en Windows** | Más simple, más confiable | Necesitas una VM o PC Windows |

### Opción A — Cross-compile desde Linux (recomendado si no tienes Windows)

#### 4.1 Instalar el target de Rust para Windows

```bash
rustup target add x86_64-pc-windows-gnu
```

#### 4.2 Instalar el linker MinGW

```bash
# Ubuntu/Debian
sudo apt install -y mingw-w64

# Fedora
sudo dnf install -y mingw64-gcc
```

#### 4.3 Configurar Cargo para usar el linker correcto

Crea o edita `~/.cargo/config.toml`:

```toml
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
ar     = "x86_64-w64-mingw32-ar"
```

#### 4.4 ⚠️ Limitación importante del cross-compile

Tauri usa WebView2 en Windows (el motor de Chromium de Microsoft). El instalador
de WebView2 solo se puede empaquetar correctamente compilando **en Windows**.

Cross-compilando desde Linux puedes generar el **binario `.exe`** pero **no el instalador `.msi` ni `.exe` de setup**.

Para el instalador final, usa GitHub Actions con un runner de Windows (ver sección 6).

#### 4.5 Compilar el binario .exe (sin instalador)

```bash
cargo build --release --target x86_64-pc-windows-gnu \
  --manifest-path src-tauri/Cargo.toml
```

El `.exe` queda en:
```
src-tauri/target/x86_64-pc-windows-gnu/release/arte.exe
```

---

### Opción B — Build nativo en una VM Windows (más confiable)

#### 4.6 Instalar requisitos en Windows

En una máquina Windows 10/11 o VM:

```powershell
# 1. Instalar Rust
winget install Rustlang.Rustup
# o desde: https://rustup.rs

# 2. Instalar Visual Studio Build Tools (C++ workload)
winget install Microsoft.VisualStudio.2022.BuildTools
# En el instalador seleccionar: "Desktop development with C++"

# 3. Instalar Node.js
winget install OpenJS.NodeJS

# 4. Instalar WebView2 Runtime (generalmente ya viene en Windows 11)
# Si no: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

#### 4.7 Clonar y compilar en Windows

```powershell
# Clonar el proyecto (o copiar los archivos)
git clone tu-repo arte
cd arte

# Instalar dependencias
npm install

# Build de producción
npm run tauri build
```

#### 4.8 Output en Windows

```
src-tauri\target\release\bundle\
├── msi\
│   └── arte_0.2.0_x64_en-US.msi     ← Instalador MSI (recomendado empresas)
├── nsis\
│   └── arte_0.2.0_x64-setup.exe     ← Instalador NSIS (recomendado usuarios)
└── arte.exe                          ← Binario suelto
```

#### 4.9 Firma de código en Windows (opcional pero recomendado)

Sin firma, Windows mostrará un aviso de "aplicación desconocida". Para eliminarlo:

```powershell
# Con un certificado .pfx de una CA (ej. DigiCert, Sectigo — ~$200/año)
# o un certificado auto-firmado (solo para testing):

# Crear certificado auto-firmado (solo testing):
$cert = New-SelfSignedCertificate `
  -Subject "CN=Hector Martinez, O=oweeme" `
  -Type CodeSigning `
  -CertStoreLocation Cert:\CurrentUser\My

# Exportar a .pfx:
Export-PfxCertificate -Cert $cert `
  -FilePath arte-cert.pfx `
  -Password (ConvertTo-SecureString "tu-password" -AsPlainText -Force)
```

Configurar en `tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": ""
    }
  }
}
```

---

## 5. Build para Android

### 5.1 Estado actual del proyecto

Ya tienes los targets de Rust instalados:
```
aarch64-linux-android    ✓ (ARM64 — la mayoría de Android modernos)
armv7-linux-androideabi  ✓ (ARM32 — Android < 5.0, rarísimo hoy)
i686-linux-android       ✓ (x86 32-bit — emuladores)
x86_64-linux-android     ✓ (x86 64-bit — emuladores y algunos Chromebooks)
```

Lo que falta configurar: Android SDK + NDK.

### 5.2 Instalar Android Studio y SDK

```bash
# Opción 1: Descargar Android Studio (recomendado — incluye todo)
# https://developer.android.com/studio
# Instalar en: /opt/android-studio

# Opción 2: Solo command-line tools (sin IDE)
cd ~
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip -d android-sdk
mkdir -p android-sdk/cmdline-tools/latest
mv android-sdk/cmdline-tools/{bin,lib,NOTICE.txt,source.properties} \
   android-sdk/cmdline-tools/latest/
```

### 5.3 Instalar SDK components

```bash
# Definir ANDROID_HOME (agregar al ~/.bashrc o ~/.zshrc)
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# Recargar el shell
source ~/.bashrc

# Instalar SDK platform y build tools
sdkmanager --install \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  "ndk;27.0.12077973"

# Aceptar licencias
sdkmanager --licenses
```

### 5.4 Configurar NDK

```bash
# El NDK queda en:
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"

# Agregar al ~/.bashrc:
echo 'export ANDROID_HOME="$HOME/android-sdk"' >> ~/.bashrc
echo 'export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"' >> ~/.bashrc
echo 'export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"' >> ~/.bashrc
source ~/.bashrc
```

### 5.5 Instalar cargo-ndk

```bash
cargo install cargo-ndk
```

### 5.6 Inicializar Android en el proyecto Tauri

```bash
cd /home/oweeme/Dev/rust/arte/arte

npm run tauri android init
```

Este comando:
- Crea la carpeta `src-tauri/gen/android/`
- Genera el proyecto Android (Kotlin/Gradle)
- Configura los manifests necesarios

### 5.7 Estructura generada

```
src-tauri/gen/android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/oweeme/arte/
│   │   │   └── MainActivity.kt
│   │   └── res/
│   │       ├── drawable/
│   │       ├── mipmap-*/      ← iconos en distintas densidades
│   │       └── values/
│   └── build.gradle
├── build.gradle
├── gradle/
└── settings.gradle
```

### 5.8 Configurar iconos para Android

Los iconos se generan automáticamente desde `src-tauri/icons/icon.png`:

```bash
npm run tauri icon src-tauri/icons/icon.png
# Genera los mipmap-* automáticamente
```

Si necesitas iconos adaptivos de Android 8+ (recomendado):
```bash
# Crear icon-foreground.png (512x512, con padding 25% para el safe zone)
# Crear icon-background.png (512x512, fondo sólido)
# Tauri los combina automáticamente
```

### 5.9 Build para Android — debug (pruebas en dispositivo/emulador)

```bash
# Con dispositivo Android conectado por USB (habilitar depuración USB):
npm run tauri android dev

# Con emulador (debe estar corriendo en Android Studio):
npm run tauri android dev
```

El APK se instala directamente en el dispositivo o emulador.

### 5.10 Build para Android — release (APK para distribución)

```bash
npm run tauri android build
```

Output:
```
src-tauri/gen/android/app/build/outputs/
├── apk/
│   └── universal/release/
│       └── app-universal-release-unsigned.apk    ← todos los ABIs
├── bundle/
│   └── universalRelease/
│       └── app-universal-release.aab             ← Google Play (preferido)
```

### 5.11 Firmar el APK/AAB para distribución

**Sin firma** el APK no se puede instalar en dispositivos con Play Protect, ni subir a Google Play.

#### Crear un keystore (una sola vez):

```bash
keytool -genkey -v \
  -keystore arte-release-key.jks \
  -alias arte \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass TU_PASSWORD_STORE \
  -keypass TU_PASSWORD_KEY \
  -dname "CN=Hector Martinez, O=oweeme, C=MX"
```

> ⚠️ Guarda `arte-release-key.jks` en un lugar SEGURO fuera del repositorio.
> Si pierdes el keystore, no podrás actualizar la app en Google Play.

#### Firmar el APK:

```bash
# Alinear:
zipalign -v 4 \
  app-universal-release-unsigned.apk \
  arte-release-aligned.apk

# Firmar:
apksigner sign \
  --ks arte-release-key.jks \
  --ks-alias arte \
  --ks-pass pass:TU_PASSWORD_STORE \
  --key-pass pass:TU_PASSWORD_KEY \
  --out arte-release-signed.apk \
  arte-release-aligned.apk

# Verificar:
apksigner verify arte-release-signed.apk
```

#### Configurar firma automática en Gradle

Edita `src-tauri/gen/android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile     file("../../../arte-release-key.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias      "arte"
            keyPassword   System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

Con esto, el build de Tauri firma automáticamente si las variables de entorno están definidas.

### 5.12 Distribución Android

| Canal | Comando/Archivo | Notas |
|-------|----------------|-------|
| Sideload (APK directo) | `arte-release-signed.apk` | El usuario habilita "instalar fuentes desconocidas" |
| Google Play | `.aab` (Android App Bundle) | Requiere cuenta de dev ($25 único) |
| F-Droid | Código fuente | Solo apps de código abierto |
| Amazon Appstore | `.apk` o `.aab` | Gratis, buena alternativa |

### 5.13 Adaptar la UI para pantallas táctiles

El canvas actual usa `PointerEvent` que funciona en Android, pero considera:

```js
// En main.js — ya implementado, verificar que funcione en Android:
canvas.addEventListener('touchmove', e => {
    // Pan con 2 dedos y pinch zoom ya implementados
});

// Agregar soporte para zoom con pinch en Android si falta:
canvas.style.touchAction = 'none'; // ya está en styles.css
```

Para Android es recomendable agregar una barra de herramientas táctil más grande
(botones mínimo 48dp ≈ 48px a densidad 1x).

---

## 6. Build para macOS

> ⚠️ **Requisito obligatorio:** Solo se puede compilar para macOS **en una Mac**.
> Apple no permite cross-compile desde Linux o Windows para ningún target de Apple.
> Si no tienes Mac, usa GitHub Actions con `macos-latest` (ver sección 8).

### 6.1 Requisitos en macOS

```bash
# 1. Xcode completo (no solo Command Line Tools) — desde la App Store
# Versión mínima: Xcode 14 (para macOS 12+)

# 2. Aceptar la licencia de Xcode (primera vez):
sudo xcodebuild -license accept

# 3. Command Line Tools (por si acaso):
xcode-select --install

# 4. Rust (si no está):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 5. Node.js (si no está):
brew install node   # o desde nodejs.org
```

### 6.2 Targets de Rust para Apple

```bash
# Mac Intel (x86_64)
rustup target add x86_64-apple-darwin

# Mac Apple Silicon / M1/M2/M3/M4 (ARM64)
rustup target add aarch64-apple-darwin

# Universal Binary (Intel + Apple Silicon en un solo archivo)
# No es un target de Rust — se genera combinando los dos anteriores
```

### 6.3 Build para macOS — Intel

```bash
cd /ruta/a/arte

npm run tauri build -- --target x86_64-apple-darwin
```

Output:
```
src-tauri/target/x86_64-apple-darwin/release/bundle/
├── dmg/
│   └── arte_0.2.0_x64.dmg          ← instalador para el usuario
└── macos/
    └── arte.app/                    ← bundle .app (arrastrar a /Applications)
```

### 6.4 Build para macOS — Apple Silicon (M1/M2/M3/M4)

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

Output:
```
src-tauri/target/aarch64-apple-darwin/release/bundle/
├── dmg/
│   └── arte_0.2.0_aarch64.dmg
└── macos/
    └── arte.app/
```

### 6.5 Universal Binary (Intel + Apple Silicon)

Un Universal Binary funciona de forma nativa en ambas arquitecturas.
Es el formato recomendado para distribución en la Mac App Store y GitHub Releases.

```bash
npm run tauri build -- --target universal-apple-darwin
```

Output:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── dmg/
│   └── arte_0.2.0_universal.dmg    ← ← recomendado para distribución
└── macos/
    └── arte.app/
```

### 6.6 Firma de código (Code Signing) — REQUERIDA para distribución

Sin firma, macOS Gatekeeper bloquea la app y el usuario ve:
> *"arte" no se puede abrir porque Apple no puede comprobar que no contiene malware.*

#### Opciones de firma

| Opción | Costo | Gatekeeper | Mac App Store |
|--------|-------|-----------|---------------|
| Sin firmar | Gratis | ❌ Bloqueada | ❌ |
| Auto-firmado (ad-hoc) | Gratis | ⚠️ Con advertencia | ❌ |
| Apple Developer ID | $99/año | ✅ Sin advertencia | ❌ |
| Mac App Store cert | $99/año | ✅ Sin advertencia | ✅ |

#### Firma ad-hoc (desarrollo / testing personal)

```bash
# Firma sin certificado de Apple — solo para uso propio, no distribuir:
codesign --force --deep --sign - \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/arte.app
```

#### Firma con Apple Developer ID ($99/año — distribución pública)

**Paso 1:** Inscribirse en [Apple Developer Program](https://developer.apple.com/programs/)

**Paso 2:** Crear certificado en Xcode:
```
Xcode → Settings → Accounts → tu Apple ID → Manage Certificates
→ + → "Developer ID Application"
```

**Paso 3:** Verificar que el certificado está instalado:
```bash
security find-identity -v -p codesigning | grep "Developer ID"
# Debe mostrar algo como:
# ABC123DEF456 "Developer ID Application: Hector Martinez (TEAMID)"
```

**Paso 4:** Configurar en `tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Hector Martinez (TEAMID)",
      "providerShortName": "TEAMID",
      "entitlements": "entitlements.plist",
      "exceptionDomain": "",
      "frameworks": [],
      "minimumSystemVersion": "10.15"
    }
  }
}
```

**Paso 5:** Crear `src-tauri/entitlements.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Necesario para Tauri/WebKit -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <!-- Para acceso a archivos del usuario (guardar/abrir) -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <!-- Para red (si usas validación de licencia por servidor) -->
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

**Paso 6:** Build con firma automática:
```bash
# Tauri detecta el certificado instalado automáticamente
npm run tauri build -- --target universal-apple-darwin
```

### 6.7 Notarización (requerida para distribución fuera de la App Store)

La notarización es un proceso donde Apple escanea tu app y certifica que no es malware.
Es **obligatoria** desde macOS 10.15 Catalina para apps distribuidas fuera de la App Store.

```bash
# Variables de entorno para notarizar:
export APPLE_ID="tu@email.com"           # tu Apple ID
export APPLE_PASSWORD="xxxx-xxxx-xxxx"  # App-specific password (ver abajo)
export APPLE_TEAM_ID="ABCDEFGHIJ"       # Team ID de tu cuenta de developer

# Build + firma + notarización automática en Tauri:
npm run tauri build -- --target universal-apple-darwin
```

Tauri v2 hace la notarización automáticamente si las variables están definidas.

**Crear App-Specific Password:**
1. Ve a [appleid.apple.com](https://appleid.apple.com)
2. Sign-In and Security → App-Specific Passwords
3. Genera una nueva → copia el formato `xxxx-xxxx-xxxx-xxxx`

### 6.8 Distribución macOS

| Canal | Archivo | Notas |
|-------|---------|-------|
| GitHub Releases | `.dmg` universal | El usuario descarga y arrastra a Applications |
| Sitio web propio | `.dmg` universal | Igual que arriba |
| Mac App Store | `.pkg` (via Xcode) | Requiere revisión de Apple, pago de $99/año |
| Homebrew Cask | Fórmula `.rb` | Gratis, usuarios técnicos |

**Publicar en Homebrew Cask** (sin costo, popular entre desarrolladores):
```ruby
# Formula: homebrew-cask/Casks/a/arte.rb
cask "arte" do
  version "0.2.0"
  sha256 "SHA256_DEL_DMG_AQUI"

  url "https://github.com/oweeme/arte/releases/download/v#{version}/arte_#{version}_universal.dmg"
  name "Arte"
  desc "Motor de dibujo vectorial 3D"
  homepage "https://oweeme.com"

  app "arte.app"
end
```

---

## 7. Build para iOS

> ⚠️ **Requisito obligatorio:** Igual que macOS, solo se puede compilar para iOS **en una Mac con Xcode**.

### 7.1 Requisitos adicionales a los de macOS

```bash
# Xcode con simuladores iOS instalados:
# Xcode → Settings → Platforms → iOS → Descargar simuladores

# Verificar que Xcode Command Line Tools apuntan al Xcode correcto:
xcode-select -p
# Debe mostrar: /Applications/Xcode.app/Contents/Developer
# Si no:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### 7.2 Targets de Rust para iOS

```bash
# Dispositivos reales — ARM64 (iPhone 5s en adelante, todos los iPad modernos)
rustup target add aarch64-apple-ios

# Simulador en Mac Apple Silicon (M1/M2/M3/M4)
rustup target add aarch64-apple-ios-sim

# Simulador en Mac Intel
rustup target add x86_64-apple-ios
```

### 7.3 Inicializar iOS en el proyecto Tauri

```bash
cd /ruta/a/arte

npm run tauri ios init
```

Genera:
```
src-tauri/gen/apple/
├── arte.xcodeproj/           ← proyecto Xcode
├── arte_iOS/
│   ├── Info.plist
│   ├── Assets.xcassets/      ← iconos y splash
│   └── ViewController.swift
└── Podfile                   ← dependencias CocoaPods si aplica
```

### 7.4 Build para iOS — simulador (desarrollo)

```bash
# Listar simuladores disponibles:
xcrun simctl list devices

# Correr en el simulador (abre automáticamente):
npm run tauri ios dev

# Especificar simulador:
npm run tauri ios dev -- --device "iPhone 15 Pro"
```

### 7.5 Build para iOS — dispositivo real

```bash
# Conectar iPhone/iPad por USB
# Confiar en la Mac desde el dispositivo (aparece un diálogo)

# Listar dispositivos conectados:
xcrun devicectl list devices

# Correr en el dispositivo:
npm run tauri ios dev -- --device "NOMBRE_DEL_DISPOSITIVO"
```

Para correr en dispositivo real necesitas:
- Apple Developer account (puede ser gratuita para desarrollo)
- El dispositivo registrado en tu Developer account
- Un Provisioning Profile válido

### 7.6 Build para iOS — release (App Store / TestFlight)

```bash
npm run tauri ios build
```

Output:
```
src-tauri/gen/apple/build/
└── arm64/
    └── arte.ipa           ← archivo para subir a App Store Connect
```

### 7.7 Firma y Provisioning para iOS

iOS requiere firma para **cualquier** instalación, incluyendo dispositivos de prueba.

#### Desarrollo (gratis, solo para tus dispositivos)

```bash
# En Xcode — abrir el proyecto:
open src-tauri/gen/apple/arte.xcodeproj

# En Xcode:
# Signing & Capabilities → Team → seleccionar tu Apple ID (cuenta gratuita)
# Xcode genera automáticamente el Development Certificate y Provisioning Profile
```

#### Distribución (App Store / TestFlight — $99/año)

En [App Store Connect](https://appstoreconnect.apple.com):

1. Crear nueva app: Apps → + → Nueva App → iOS
2. Bundle ID: `com.oweeme.arte` (debe coincidir con `tauri.conf.json`)
3. Nombre: Arte
4. Idioma principal: Español

En Xcode:
```
Product → Archive → Distribute App
→ App Store Connect → Upload
→ Seleccionar certificado Distribution
→ Subir
```

En App Store Connect después de subir:
- TestFlight: prueba interna (hasta 100 testers) e externa (hasta 10,000)
- Revisión de App Store: proceso de 1-3 días hábiles

### 7.8 Configurar iconos para iOS

Los iconos se generan automáticamente desde `src-tauri/icons/icon.png` (1024×1024):

```bash
npm run tauri icon src-tauri/icons/icon.png
```

Genera todos los tamaños requeridos por iOS:
- 20×20, 29×29, 40×40, 58×58, 60×60, 76×76, 80×80, 87×87
- 120×120, 152×152, 167×167, 180×180, 1024×1024

### 7.9 Adaptar la UI para iOS (pantallas táctiles)

iOS usa el motor WKWebView, compatible con el Canvas 2D actual. Sin embargo:

```js
// En main.js — asegurarse que touch-action está en el canvas:
// Ya está en styles.css: touch-action: none;

// Prevenir el "bounce" de scroll de iOS en el body:
document.body.style.overflow = 'hidden';
document.body.style.position = 'fixed';

// El menú contextual del clic derecho en iOS no existe
// (no hay botón derecho en pantalla táctil)
// El orbitar de cámara (clic derecho) necesita un botón alternativo en iOS
```

**Recomendación para iOS:** agregar un botón de órbita visible en la UI
cuando se detecta que es iOS:
```js
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
if (isIOS) {
    document.getElementById('orbit-btn')?.style.setProperty('display', 'flex');
}
```

### 7.10 Restricciones de iOS vs macOS/Desktop

| Característica | macOS/Desktop | iOS |
|---------------|--------------|-----|
| Diálogos de archivo nativos | ✅ tauri-plugin-dialog | ⚠️ Limitado — usa UIDocumentPicker |
| Acceso al sistema de archivos | ✅ Libre | ❌ Solo sandbox de la app |
| Guardar en Documentos del usuario | ✅ | ✅ via iCloud Drive / Archivos |
| Exportar a Fotos | N/A | ✅ via PHPhotoLibrary |
| Menú contextual | ✅ | ❌ |
| Múltiples ventanas | ✅ | ⚠️ iPadOS multitasking |

**Ajuste para guardar archivos en iOS:**

En iOS, `tauri-plugin-dialog` usa el picker de documentos de iOS automáticamente.
No necesitas cambios en Rust, pero el usuario verá la UI de Archivos de iOS
en lugar del diálogo de escritorio.

---

## 8. GitHub Actions — CI/CD automatizado

Automatiza los builds para los tres targets en cada push o release.

### Crear `.github/workflows/build.yml`

```yaml
name: Build Arte

on:
  push:
    tags:
      - 'v*'          # Solo en tags como v0.2.0, v1.0.0
  workflow_dispatch:  # Permite lanzar manualmente desde GitHub

jobs:

  # ── Linux ────────────────────────────────────────────────────
  build-linux:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Instalar dependencias del sistema
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            build-essential \
            libssl-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev

      - name: Instalar Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache de Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias npm
        run: npm ci

      - name: Build Tauri para Linux
        run: npm run tauri build

      - name: Subir artefactos Linux
        uses: actions/upload-artifact@v4
        with:
          name: arte-linux
          path: |
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/rpm/*.rpm
            src-tauri/target/release/bundle/appimage/*.AppImage

  # ── Windows ──────────────────────────────────────────────────
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Instalar Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache de Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias npm
        run: npm ci

      - name: Build Tauri para Windows
        run: npm run tauri build

      - name: Subir artefactos Windows
        uses: actions/upload-artifact@v4
        with:
          name: arte-windows
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe

  # ── Android ──────────────────────────────────────────────────
  build-android:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Instalar dependencias del sistema
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            build-essential \
            libssl-dev

      - name: Instalar Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Instalar targets Android
        run: |
          rustup target add \
            aarch64-linux-android \
            armv7-linux-androideabi \
            i686-linux-android \
            x86_64-linux-android

      - name: Cache de Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias npm
        run: npm ci

      - name: Instalar Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Configurar Android SDK
        uses: android-actions/setup-android@v3

      - name: Instalar NDK
        run: |
          sdkmanager "ndk;27.0.12077973"
          echo "NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973" >> $GITHUB_ENV

      - name: Instalar cargo-ndk
        run: cargo install cargo-ndk

      - name: Build Tauri para Android
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_PASSWORD:      ${{ secrets.KEY_PASSWORD }}
        run: npm run tauri android build

      - name: Subir artefactos Android
        uses: actions/upload-artifact@v4
        with:
          name: arte-android
          path: |
            src-tauri/gen/android/app/build/outputs/apk/**/*.apk
            src-tauri/gen/android/app/build/outputs/bundle/**/*.aab

  # ── macOS ────────────────────────────────────────────────────
  build-macos:
    runs-on: macos-14    # Apple Silicon (M1) — más rápido y barato que macos-13
    steps:
      - uses: actions/checkout@v4

      - name: Instalar Rust + targets Apple
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Cache de Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias npm
        run: npm ci

      - name: Importar certificado de firma
        env:
          MACOS_CERTIFICATE:          ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD:          ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          # Crear keychain temporal
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain

          # Importar certificado .p12 desde secret (base64)
          echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
          security import certificate.p12 \
            -k build.keychain \
            -P "$MACOS_CERTIFICATE_PASSWORD" \
            -T /usr/bin/codesign

          security set-key-partition-list \
            -S apple-tool:,apple: \
            -s -k "$KEYCHAIN_PASSWORD" build.keychain

      - name: Build Tauri para macOS (Universal)
        env:
          APPLE_ID:              ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD:        ${{ secrets.APPLE_APP_PASSWORD }}
          APPLE_TEAM_ID:         ${{ secrets.APPLE_TEAM_ID }}
        run: npm run tauri build -- --target universal-apple-darwin

      - name: Subir artefactos macOS
        uses: actions/upload-artifact@v4
        with:
          name: arte-macos
          path: |
            src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
            src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app

  # ── iOS ──────────────────────────────────────────────────────
  build-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Instalar Rust + targets iOS
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-ios,aarch64-apple-ios-sim

      - name: Cache de Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Instalar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependencias npm
        run: npm ci

      - name: Instalar certificados de distribución iOS
        env:
          IOS_DISTRIBUTION_CERT:     ${{ secrets.IOS_DISTRIBUTION_CERT }}
          IOS_DISTRIBUTION_PASSWORD: ${{ secrets.IOS_DISTRIBUTION_PASSWORD }}
          IOS_PROVISIONING_PROFILE:  ${{ secrets.IOS_PROVISIONING_PROFILE }}
          KEYCHAIN_PASSWORD:         ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          # Keychain
          security create-keychain -p "$KEYCHAIN_PASSWORD" ios.keychain
          security default-keychain -s ios.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" ios.keychain

          # Certificado de distribución
          echo "$IOS_DISTRIBUTION_CERT" | base64 --decode > ios_dist.p12
          security import ios_dist.p12 \
            -k ios.keychain \
            -P "$IOS_DISTRIBUTION_PASSWORD" \
            -T /usr/bin/codesign
          security set-key-partition-list \
            -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" ios.keychain

          # Provisioning Profile
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "$IOS_PROVISIONING_PROFILE" | base64 --decode \
            > ~/Library/MobileDevice/Provisioning\ Profiles/arte.mobileprovision

      - name: Inicializar iOS (si no existe gen/apple)
        run: |
          if [ ! -d "src-tauri/gen/apple" ]; then
            npm run tauri ios init
          fi

      - name: Build Tauri para iOS
        env:
          APPLE_DEVELOPMENT_TEAM: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run tauri ios build --release

      - name: Subir artefactos iOS
        uses: actions/upload-artifact@v4
        with:
          name: arte-ios
          path: src-tauri/gen/apple/build/**/*.ipa

  # ── Release automático en GitHub ─────────────────────────────
  release:
    needs: [build-linux, build-windows, build-android, build-macos, build-ios]
    runs-on: ubuntu-22.04
    if: startsWith(github.ref, 'refs/tags/')
    steps:
      - name: Descargar todos los artefactos
        uses: actions/download-artifact@v4

      - name: Crear Release en GitHub
        uses: softprops/action-gh-release@v2
        with:
          files: |
            arte-linux/**/*
            arte-windows/**/*
            arte-android/**/*
            arte-macos/**/*
            arte-ios/**/*
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Configurar secrets en GitHub

Ve a tu repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Cómo obtenerlo |
|--------|---------------|
| `KEYSTORE_PASSWORD` | Password del keystore Android que creaste |
| `KEY_PASSWORD` | Password de la clave dentro del keystore Android |
| `MACOS_CERTIFICATE` | Certificado `.p12` en base64: `base64 -i cert.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password del `.p12` de macOS |
| `KEYCHAIN_PASSWORD` | Cualquier string aleatorio seguro |
| `APPLE_ID` | Tu email de Apple Developer (ej: `tu@email.com`) |
| `APPLE_APP_PASSWORD` | App-specific password de appleid.apple.com |
| `APPLE_TEAM_ID` | Tu Team ID (en developer.apple.com → Membership) |
| `IOS_DISTRIBUTION_CERT` | Certificado iOS Distribution en base64 |
| `IOS_DISTRIBUTION_PASSWORD` | Password del certificado iOS |
| `IOS_PROVISIONING_PROFILE` | Provisioning Profile en base64 |

**Exportar certificado macOS a base64:**
```bash
# En tu Mac, exportar desde Keychain Access como .p12
# Luego:
base64 -i Developer_ID_Application.p12 | pbcopy
# Pegar en el secret MACOS_CERTIFICATE
```

### Disparar un build de release

```bash
# Crear un tag de versión:
git tag v0.2.0
git push origin v0.2.0

# GitHub Actions compila automáticamente para los 5 targets
# (Linux, Windows, Android, macOS, iOS)
# y crea el Release con todos los instaladores
```

---

## 9. Solución de problemas comunes

### Linux: pantalla en blanco al ejecutar el build release

```bash
# Verificar que las variables de entorno se aplican:
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 ./target/release/arte

# Si funciona así pero no de normal, verifica lib.rs:
# std::env::set_var("GDK_BACKEND", "x11");
# std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
# Deben estar al inicio de fn run(), ANTES de que Tauri inicialice.
```

### Linux: error "libwebkit2gtk-4.1-dev not found"

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev
# Si tu distro tiene webkit2gtk-4.0 (más antigua):
sudo apt-get install -y libwebkit2gtk-4.0-dev
# Y cambiar en tauri.conf.json:
# "targets": ["deb", "appimage"]  ← quitar rpm si no aplica
```

### Windows: error "VCRUNTIME140.dll not found"

El instalador NSIS de Tauri incluye los Visual C++ Redistributables automáticamente.
Si el usuario tiene este error con el binario suelto `.exe`, debe instalar:
[VC_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

### Android: error "SDK location not found"

```bash
# Verificar que ANDROID_HOME está definido:
echo $ANDROID_HOME

# Si está vacío:
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
source ~/.bashrc

# Verificar que el SDK existe:
ls $ANDROID_HOME/platforms/
```

### Android: error "NDK not found" o "cargo-ndk not found"

```bash
# Verificar NDK:
echo $NDK_HOME
ls $NDK_HOME

# Reinstalar cargo-ndk:
cargo install cargo-ndk --force

# Reinstalar targets:
rustup target add aarch64-linux-android armv7-linux-androideabi \
  i686-linux-android x86_64-linux-android
```

### Android: WebView en versiones antiguas de Android

Tauri v2 requiere **Android 7.0 (API 24)** mínimo. Para configurar esto:

```gradle
// src-tauri/gen/android/app/build.gradle
android {
    defaultConfig {
        minSdk 24    // Android 7.0
        targetSdk 34 // Android 14
    }
}
```

### Error "bundle identifier" inválido

El identifier en `tauri.conf.json` debe ser formato reverse-domain válido:
```json
"identifier": "com.oweeme.arte"
```
No usar guiones, espacios ni caracteres especiales.

### macOS: "arte.app is damaged and can't be opened"

```bash
# El usuario descargó la app y macOS puso en cuarentena el .dmg.
# Solución para el usuario (si la app no está notarizada):
xattr -cr /Applications/arte.app

# La solución correcta: notarizar la app (sección 6.7)
```

### macOS: "No signing certificate found"

```bash
# Verificar certificados instalados:
security find-identity -v -p codesigning

# Si no hay ninguno con "Developer ID Application":
# → Crear en Xcode o developer.apple.com → Certificates

# Para build sin firma (solo local/desarrollo):
# Comentar signingIdentity en tauri.conf.json y usar ad-hoc:
codesign --force --deep --sign - ./target/.../arte.app
```

### macOS: Notarización falla con "invalid entitlements"

```bash
# Ver el log completo de la notarización:
xcrun notarytool log JOB_ID \
  --apple-id tu@email.com \
  --password xxxx-xxxx-xxxx \
  --team-id TEAMID

# El error más común: falta com.apple.security.cs.allow-jit
# Verificar que entitlements.plist tiene todas las claves (ver sección 6.6)
```

### iOS: "Provisioning profile doesn't include signing certificate"

```
En Xcode:
→ Signing & Capabilities
→ Automatically manage signing: OFF
→ Provisioning Profile: seleccionar el correcto manualmente
```

O regenerar el profile en developer.apple.com con el certificado correcto.

### iOS: App rechazada en App Store Review

Razones comunes y soluciones:

| Rechazo | Solución |
|---------|---------|
| Metadata incompleta | Llenar descripción, screenshots de todos los tamaños |
| Screenshots no son de iOS | Usar simulador o dispositivo real para capturas |
| Crash al inicio | Probar en dispositivo físico, no solo simulador |
| Permisos sin justificación | Agregar NSUsageDescription en Info.plist por cada permiso |
| UI no adaptada a Dynamic Type | Usar unidades relativas, no px fijos |

### GitHub Actions: build macOS falla por keychain

```yaml
# Agregar timeout en el step de firma:
- name: Importar certificado
  timeout-minutes: 5
  run: |
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security set-keychain-settings -lut 21600 build.keychain  # no bloquear por 6 horas
    ...
```

---

## Resumen de comandos

```bash
# ── Linux ────────────────────────────────────────
npm run tauri build
# → src-tauri/target/release/bundle/{deb,rpm,appimage}/

# ── Windows (en máquina Windows) ─────────────────
npm run tauri build
# → src-tauri\target\release\bundle\{msi,nsis}\

# ── Android — primera vez ────────────────────────
npm run tauri android init    # solo la primera vez
npm run tauri android build
# → src-tauri/gen/android/app/build/outputs/{apk,bundle}/

# ── Android — desarrollo/pruebas ─────────────────
npm run tauri android dev     # instala en dispositivo/emulador

# ── macOS (en Mac) ───────────────────────────────
npm run tauri build -- --target universal-apple-darwin
# → src-tauri/target/universal-apple-darwin/release/bundle/dmg/

# ── macOS — Intel solamente ──────────────────────
npm run tauri build -- --target x86_64-apple-darwin

# ── macOS — Apple Silicon solamente ─────────────
npm run tauri build -- --target aarch64-apple-darwin

# ── iOS — primera vez ────────────────────────────
npm run tauri ios init        # solo la primera vez
npm run tauri ios build       # → .ipa para App Store
npm run tauri ios dev         # desarrollo en simulador o dispositivo
```

---

## Matriz de compatibilidad

| Target | OS donde se compila | Requiere cuenta de pago |
|--------|-------------------|------------------------|
| Linux (.deb/.rpm/.AppImage) | Linux | No |
| Windows (.msi/.exe) | Windows (o CI) | No |
| Android (.apk/.aab) | Linux / macOS / Windows | Google Play $25 (único) |
| macOS (.dmg/.app) | macOS únicamente | Apple Developer $99/año |
| iOS (.ipa) | macOS únicamente | Apple Developer $99/año |

> La cuenta de Apple Developer ($99/año) cubre **tanto macOS como iOS**.
> Una sola cuenta sirve para distribuir en ambas plataformas de Apple.

---

*Última actualización: 2026-06-08 | Tauri v2.11.2 | Rust stable*
