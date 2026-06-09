# Arte — Flatpak en KDE Neon

> Probado en: **KDE Neon User Edition 24.04** (Ubuntu 24.04 base)
> Un solo `.flatpak` funciona en Ubuntu, Fedora, Arch, Mint, KDE Neon,
> openSUSE, Pop!_OS y cualquier distro con Flatpak.

---

## Tu entorno actual

| Componente | Versión / Estado |
|-----------|-----------------|
| OS | KDE Neon User Edition (Ubuntu 24.04) |
| Flatpak | 1.14.6 ✅ instalado |
| Flathub | ✅ configurado como remote sistema |
| KDE Discover | ✅ soporta Flatpak nativamente |
| webkit2gtk-4.1 | 2.52.3 ✅ (Tauri puede compilar sin instalar nada extra) |
| flatpak-builder | ❌ falta instalar |
| SDK GNOME 46 | ❌ falta instalar |

---

## Índice

1. [Instalar herramientas faltantes](#1-instalar-herramientas-faltantes)
2. [Generar cache de dependencias](#2-generar-cache-de-dependencias)
3. [Compilar y probar localmente](#3-compilar-y-probar-localmente)
4. [Distribuir — bundle .flatpak](#4-distribuir--bundle-flatpak)
5. [Instalar en KDE Discover](#5-instalar-en-kde-discover)
6. [Publicar en Flathub](#6-publicar-en-flathub)
7. [CI con GitHub Actions](#7-ci-con-github-actions)
8. [Solución de problemas en KDE Neon](#8-solución-de-problemas-en-kde-neon)

---

## 1. Instalar herramientas faltantes

```bash
# flatpak-builder — herramienta de compilación
sudo apt install flatpak-builder python3-pip

# SDK de GNOME 46 con extensiones de Rust y Node
# (se instala a nivel sistema, igual que tus otras apps Flatpak)
sudo flatpak install flathub \
    org.gnome.Platform//46 \
    org.gnome.Sdk//46 \
    org.freedesktop.Sdk.Extension.rust-stable//24.08 \
    org.freedesktop.Sdk.Extension.node20//24.08
```

> **¿Por qué GNOME SDK en KDE?**
> El SDK es solo el entorno de compilación — no afecta cómo se ve
> la app. Arte usa WebKitGTK directamente, no widgets de GNOME.
> La app se ve igual en KDE Plasma que en cualquier otro entorno.

---

## 2. Generar cache de dependencias

Flatpak compila **sin acceso a internet** dentro de un sandbox.
Hay que pre-descargar todas las dependencias de Cargo:

```bash
cd /home/oweeme/Dev/rust/arte/arte

./flatpak/generar-cache.sh
```

Esto crea `flatpak/generated-sources.json` con todas las crates.
Tarda 1-2 minutos. Solo hay que repetirlo si cambias dependencias en `Cargo.toml`.

---

## 3. Compilar y probar localmente

```bash
./flatpak/build.sh
```

El script hace todo automáticamente:
- Verifica que `flatpak-builder` y los SDKs estén instalados
- Compila Arte en release dentro del sandbox
- Lo instala a nivel sistema (como tus otras apps Flatpak)

**Primera vez:** descarga el runtime de GNOME (~500 MB) y compila Rust desde cero.
Tarda entre 10 y 20 minutos.

**Veces siguientes:** usa cache — tarda ~2 minutos.

### Probar que funciona

```bash
# Desde terminal:
flatpak run com.oweeme.arte

# Desde KDE:
# Alt+F2 (krunner) → escribir "Arte" → Enter
# O en el menú de aplicaciones → Gráficos → Arte
```

Arte debe aparecer con su ícono en el menú de KDE Plasma
exactamente igual que las otras apps Flatpak que tienes
(Chrome, Android Studio, Postman, etc.).

---

## 4. Distribuir — bundle .flatpak

Exporta Arte como un archivo `.flatpak` que cualquier usuario
instala con doble clic en KDE Discover o con un comando:

```bash
# Primero compilar (si no lo has hecho):
./flatpak/build.sh

# Exportar el bundle:
./flatpak/exportar-bundle.sh 0.2.0
# → genera arte-0.2.0.flatpak en la raíz del proyecto
```

### Cómo lo instala el usuario

**Opción 1 — Doble clic en KDE Discover:**
El usuario descarga `arte-0.2.0.flatpak` y hace doble clic.
KDE Discover lo abre y muestra el instalador gráfico.

**Opción 2 — Terminal:**
```bash
sudo flatpak install arte-0.2.0.flatpak
```

**Opción 3 — Desde GitHub Releases:**
Subir el `.flatpak` a los releases de GitHub. El usuario
descarga y hace doble clic — KDE Discover abre automáticamente.

### Tamaño estimado del bundle

- El `.flatpak` incluye Arte + todas sus dependencias
- Tamaño aproximado: **15-30 MB**
- El runtime de GNOME (~500 MB) se comparte con otras apps Flatpak
  que el usuario ya tenga instaladas — no se descarga dos veces

---

## 5. Instalar en KDE Discover

KDE Discover es el gestor de software de KDE Plasma y tiene
soporte nativo para Flatpak. Tus apps ya instaladas
(Chrome, Android Studio, Postman...) aparecen ahí.

Cuando Arte esté en Flathub, el usuario lo encontrará directamente:
```
KDE Discover → buscar "Arte" → Instalar
```

Sin Flathub, el usuario instala el `.flatpak` local:
```
KDE Discover → Archivo → Instalar desde archivo local
→ seleccionar arte-0.2.0.flatpak
```

Las actualizaciones también aparecen en KDE Discover:
```
KDE Discover → Actualizaciones → Arte 0.3.0 disponible → Actualizar
```

---

## 6. Publicar en Flathub

Flathub es el repositorio oficial de Flatpak. Cuando Arte esté
publicado, aparecerá automáticamente en KDE Discover de todos
los usuarios de KDE Neon (y el resto de distros).

### Requisitos de Flathub

```bash
# Validar el metainfo antes de enviar:
sudo apt install appstream
appstreamcli validate flatpak/com.oweeme.arte.metainfo.xml
# Debe mostrar: OK — sin warnings ni errores
```

### Proceso de publicación

**1. Preparar el repositorio de Flathub:**

Crea un repo en GitHub: `github.com/oweeme/arte-flatpak`

Estructura:
```
arte-flatpak/
├── com.oweeme.arte.yml          ← igual que flatpak/ pero con URL de GitHub
├── com.oweeme.arte.desktop
├── com.oweeme.arte.metainfo.xml
└── generated-sources.json
```

El manifiesto para Flathub apunta al tarball de GitHub en vez del directorio local:

```yaml
# En com.oweeme.arte.yml — sección sources para Flathub:
    sources:
      - type: archive
        url: https://github.com/oweeme/arte/archive/refs/tags/v0.2.0.tar.gz
        sha256: PEGAR_SHA256_AQUI

      - generated-sources.json
```

Para obtener el SHA256 del tarball:
```bash
curl -sL https://github.com/oweeme/arte/archive/refs/tags/v0.2.0.tar.gz \
  | shasum -a 256
```

**2. Abrir un Pull Request en [github.com/flathub/flathub](https://github.com/flathub/flathub):**

- Fork de flathub/flathub
- Crear carpeta `com.oweeme.arte/` con el manifiesto
- Abrir PR — el equipo de Flathub revisa en 1-4 semanas

**3. Una vez aprobado, los usuarios instalan con:**
```bash
# Desde terminal:
flatpak install flathub com.oweeme.arte

# O desde KDE Discover → buscar "Arte" → Instalar
```

---

## 7. CI con GitHub Actions

Genera el `.flatpak` automáticamente en cada release:

```yaml
# .github/workflows/build.yml — agregar este job:

  build-flatpak:
    runs-on: ubuntu-22.04
    container:
      image: bilelmoussaoui/flatpak-github-actions:gnome-46
      options: --privileged

    steps:
      - uses: actions/checkout@v4

      - name: Generar cache de Cargo
        run: |
          pip3 install aiohttp toml
          curl -fsSL \
            "https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py" \
            -o flatpak-cargo-generator.py
          python3 flatpak-cargo-generator.py \
            src-tauri/Cargo.lock \
            -o flatpak/generated-sources.json

      - name: Build Flatpak
        uses: flatpak/flatpak-github-actions/flatpak-builder@v6
        with:
          bundle:        arte.flatpak
          manifest-path: flatpak/com.oweeme.arte.yml
          cache-key:     flatpak-builder-${{ github.sha }}

      - name: Subir artefacto
        uses: actions/upload-artifact@v4
        with:
          name: arte-flatpak
          path: arte.flatpak
```

Agrega también `arte-flatpak/**/*` al job `release` para que
el `.flatpak` aparezca automáticamente en los GitHub Releases.

---

## 8. Solución de problemas en KDE Neon

### La app abre con pantalla en blanco

El manifiesto ya incluye las variables correctas:
```yaml
- --env=GDK_BACKEND=x11
- --env=WEBKIT_DISABLE_DMABUF_RENDERER=1
```
Si sigue en blanco, verificar que `lib.rs` las setea también
(ya lo hace — es redundante pero inofensivo).

### "error: No se pudo crear el directorio de instalación"

En KDE Neon tus Flatpaks están instalados a nivel **sistema** (no usuario).
El script `build.sh` usa `sudo flatpak-builder` para coincidir con eso.
Si ves este error sin sudo, es la causa.

### El ícono no aparece en el menú de KDE

```bash
# Actualizar la caché de iconos manualmente:
sudo gtk-update-icon-cache -f /usr/share/icons/hicolor
kbuildsycoca6 --noincremental   # reconstruye la caché de KDE
```

O simplemente cerrar sesión y volver a entrar — KDE actualiza
la caché automáticamente al iniciar sesión.

### "webkit process crashed" dentro del sandbox

```bash
# Probar con el sandbox de WebKit desactivado (solo debug):
flatpak run --env=WEBKIT_DISABLE_SANDBOX_FOR_DEBUGGER=1 com.oweeme.arte
```

Si funciona así, el problema es un permiso del sandbox.
Revisar `finish-args` en el manifiesto.

### El diálogo de guardar/abrir no abre

Verificar que `--filesystem=home` está en `finish-args`.
Para acceder a discos USB o externos, agregar:
```yaml
- --filesystem=/run/media
- --filesystem=/media
```

### Wacom / stylus no funciona dentro del Flatpak

El manifiesto ya incluye `--device=all`. Si sigue sin funcionar:
```bash
# Verificar que el dispositivo es visible en el sandbox:
flatpak run --device=all com.oweeme.arte
```

---

## Resumen de comandos para KDE Neon

```bash
# ── Una sola vez — instalar herramientas ─────────────────────
sudo apt install flatpak-builder python3-pip

sudo flatpak install flathub \
    org.gnome.Platform//46 \
    org.gnome.Sdk//46 \
    org.freedesktop.Sdk.Extension.rust-stable//24.08 \
    org.freedesktop.Sdk.Extension.node20//24.08

# ── Generar cache (repetir si cambia Cargo.toml) ─────────────
./flatpak/generar-cache.sh

# ── Compilar e instalar para probar ──────────────────────────
./flatpak/build.sh

# ── Lanzar Arte desde terminal ────────────────────────────────
flatpak run com.oweeme.arte

# ── Exportar .flatpak para distribuir ────────────────────────
./flatpak/exportar-bundle.sh 0.2.0
# → arte-0.2.0.flatpak  (doble clic en KDE Discover para instalar)

# ── Desinstalar versión local de prueba ───────────────────────
sudo flatpak uninstall com.oweeme.arte

# ── Ver logs si algo falla ────────────────────────────────────
flatpak run --env=G_MESSAGES_DEBUG=all com.oweeme.arte
journalctl --user -f   # en otra terminal mientras corre
```

---

*Última actualización: 2026-06-09 | KDE Neon 24.04 | Flatpak 1.14.6*
