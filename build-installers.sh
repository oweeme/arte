#!/bin/bash
# Arte — Genera instaladores para Linux y Windows 64-bit
# Uso: ./build-installers.sh [linux] [windows] [flatpak] [all]
# Sin argumentos: genera todos

set -e

PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLES="$PROYECTO/src-tauri/target/release/bundle"
DIST="$PROYECTO/dist"
VERSION=$(grep '^version' "$PROYECTO/src-tauri/Cargo.toml" | head -1 | sed 's/.*= *"\(.*\)"/\1/')

HACER_LINUX=false
HACER_WINDOWS=false
HACER_FLATPAK=false

if [ $# -eq 0 ]; then
    HACER_LINUX=true
    HACER_WINDOWS=true
    HACER_FLATPAK=true
else
    for arg in "$@"; do
        case $arg in
            linux)   HACER_LINUX=true ;;
            windows) HACER_WINDOWS=true ;;
            flatpak) HACER_FLATPAK=true ;;
            all)     HACER_LINUX=true; HACER_WINDOWS=true; HACER_FLATPAK=true ;;
        esac
    done
fi

mkdir -p "$DIST"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Arte v$VERSION — Build de instaladores  ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ════════════════════════════════════════
# LINUX — .deb  .rpm  .AppImage
# ════════════════════════════════════════
if [ "$HACER_LINUX" = true ]; then
    echo "▶ [1/3] Linux — .deb / .rpm / .AppImage"
    echo "────────────────────────────────────────"

    npm run tauri build

    cp "$BUNDLES/deb/arte_${VERSION}_amd64.deb"          "$DIST/"
    cp "$BUNDLES/rpm/arte-${VERSION}-1.x86_64.rpm"       "$DIST/"
    cp "$BUNDLES/appimage/arte_${VERSION}_amd64.AppImage" "$DIST/"
    chmod +x "$DIST/arte_${VERSION}_amd64.AppImage"

    echo "  ✓ arte_${VERSION}_amd64.deb"
    echo "  ✓ arte-${VERSION}-1.x86_64.rpm"
    echo "  ✓ arte_${VERSION}_amd64.AppImage"
    echo ""
fi

# ════════════════════════════════════════
# WINDOWS 64-bit — .exe (cross-compile)
# ════════════════════════════════════════
if [ "$HACER_WINDOWS" = true ]; then
    echo "▶ [2/3] Windows 64-bit — .exe"
    echo "────────────────────────────────────────"

    # Verificar mingw-w64
    if ! command -v x86_64-w64-mingw32-gcc &>/dev/null; then
        echo "  Instalando mingw-w64..."
        sudo apt-get install -y mingw-w64
    fi

    # Verificar target de Rust
    if ! rustup target list --installed | grep -q "x86_64-pc-windows-gnu"; then
        rustup target add x86_64-pc-windows-gnu
    fi

    # Configurar linker si no está
    if ! grep -q "x86_64-pc-windows-gnu" ~/.cargo/config.toml 2>/dev/null; then
        mkdir -p ~/.cargo
        cat >> ~/.cargo/config.toml << 'EOF'

[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
ar     = "x86_64-w64-mingw32-ar"
EOF
    fi

    # Compilar el .exe
    echo "  Compilando arte.exe para Windows x64..."
    cargo build --release \
        --target x86_64-pc-windows-gnu \
        --manifest-path "$PROYECTO/src-tauri/Cargo.toml"

    # Copiar el .exe al dist
    WIN_EXE="$PROYECTO/src-tauri/target/x86_64-pc-windows-gnu/release/arte.exe"
    if [ -f "$WIN_EXE" ]; then
        cp "$WIN_EXE" "$DIST/arte_${VERSION}_x64.exe"
        echo "  ✓ arte_${VERSION}_x64.exe ($(du -sh "$DIST/arte_${VERSION}_x64.exe" | cut -f1))"
        echo ""
        echo "  ⚠  Este .exe requiere WebView2 en el PC de destino."
        echo "     Para instalador .msi completo, usa GitHub Actions (ver doc/BUILD_PRODUCCION.md §6)"
    else
        echo "  ✗ Error al compilar arte.exe"
        echo "    Ver doc/BUILD_PRODUCCION.md §4 para compilar en una VM Windows"
    fi
    echo ""
fi

# ════════════════════════════════════════
# FLATPAK — universal Linux
# ════════════════════════════════════════
if [ "$HACER_FLATPAK" = true ]; then
    echo "▶ [3/3] Flatpak — universal Linux"
    echo "────────────────────────────────────────"

    # Verificar flatpak-builder
    if ! command -v flatpak-builder &>/dev/null; then
        echo "  Instalando flatpak-builder..."
        sudo apt-get install -y flatpak-builder python3-pip
    fi

    # Verificar SDK de GNOME 46
    if ! flatpak info org.gnome.Sdk//46 &>/dev/null; then
        echo "  Instalando GNOME SDK 46 (descarga ~500 MB, solo una vez)..."
        sudo flatpak install -y flathub \
            org.gnome.Platform//46 \
            org.gnome.Sdk//46 \
            org.freedesktop.Sdk.Extension.rust-stable//24.08 \
            org.freedesktop.Sdk.Extension.node20//24.08
    fi

    # Generar cache de Cargo si no existe
    if [ ! -f "$PROYECTO/flatpak/generated-sources.json" ]; then
        echo "  Generando cache de dependencias de Cargo..."
        pip3 install --user -q aiohttp toml

        if [ ! -f "$PROYECTO/flatpak/flatpak-cargo-generator.py" ]; then
            curl -fsSL \
              "https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py" \
              -o "$PROYECTO/flatpak/flatpak-cargo-generator.py"
        fi

        python3 "$PROYECTO/flatpak/flatpak-cargo-generator.py" \
            "$PROYECTO/src-tauri/Cargo.lock" \
            -o "$PROYECTO/flatpak/generated-sources.json"
    fi

    # Compilar Flatpak
    echo "  Compilando Flatpak (tarda ~10 min la primera vez)..."
    FLATPAK_REPO="$PROYECTO/.flatpak-repo"
    FLATPAK_BUILD="$PROYECTO/.flatpak-build"

    sudo flatpak-builder \
        --force-clean \
        --repo="$FLATPAK_REPO" \
        "$FLATPAK_BUILD" \
        "$PROYECTO/flatpak/com.oweeme.arte.yml"

    # Exportar bundle .flatpak
    BUNDLE_OUT="$DIST/arte-${VERSION}.flatpak"
    flatpak build-bundle \
        "$FLATPAK_REPO" \
        "$BUNDLE_OUT" \
        com.oweeme.arte \
        --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo

    echo "  ✓ arte-${VERSION}.flatpak ($(du -sh "$BUNDLE_OUT" | cut -f1))"
    echo ""
fi

# ════════════════════════════════════════
# RESUMEN
# ════════════════════════════════════════
echo "════════════════════════════════════════"
echo "  Archivos generados en dist/"
echo "════════════════════════════════════════"
ls -lh "$DIST/" | grep -v '^total' | awk '{print "  " $5 "  " $9}'
echo ""
echo "  Instalar en esta PC (KDE Neon):"
echo "    .deb:     sudo dpkg -i dist/arte_${VERSION}_amd64.deb"
echo "    .AppImage: chmod +x dist/arte_${VERSION}_amd64.AppImage && ./dist/arte_${VERSION}_amd64.AppImage"
echo "    .flatpak: sudo flatpak install dist/arte-${VERSION}.flatpak"
echo ""
echo "  Para Windows:"
echo "    Copiar dist/arte_${VERSION}_x64.exe al PC con Windows"
echo "    (requiere WebView2 — incluido en Windows 11, descargable en Win10)"
echo ""
