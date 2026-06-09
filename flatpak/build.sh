#!/bin/bash
# Compila Arte como Flatpak en KDE Neon (Ubuntu 24.04)
# y lo instala localmente para probar.
#
# Uso:
#   ./flatpak/build.sh          # compilar e instalar
#   ./flatpak/build.sh --run    # compilar e iniciar

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/.flatpak-build"
REPO_DIR="$PROJECT_DIR/.flatpak-repo"
APP_ID="com.oweeme.arte"

# ── 1. Verificar flatpak-builder ──────────────────────────────
if ! command -v flatpak-builder &>/dev/null; then
    echo "✗ flatpak-builder no está instalado."
    echo "  Instalando automáticamente..."
    sudo apt install -y flatpak-builder
fi

# ── 2. Verificar SDK de GNOME (se instala a nivel sistema como tus otras apps) ──
SDK_OK=true
for pkg in "org.gnome.Platform//46" "org.gnome.Sdk//46" \
           "org.freedesktop.Sdk.Extension.rust-stable//24.08" \
           "org.freedesktop.Sdk.Extension.node20//24.08"; do
    if ! flatpak info "$pkg" &>/dev/null; then
        SDK_OK=false
        break
    fi
done

if [ "$SDK_OK" = false ]; then
    echo "── Instalando SDK de GNOME 46 (requiere sudo para sistema) ──"
    sudo flatpak install -y flathub \
        org.gnome.Platform//46 \
        org.gnome.Sdk//46 \
        org.freedesktop.Sdk.Extension.rust-stable//24.08 \
        org.freedesktop.Sdk.Extension.node20//24.08
fi

# ── 3. Verificar generated-sources.json ──────────────────────
if [ ! -f "$SCRIPT_DIR/generated-sources.json" ]; then
    echo "✗ Falta flatpak/generated-sources.json"
    echo "  Ejecuta primero: ./flatpak/generar-cache.sh"
    exit 1
fi

# ── 4. Compilar ───────────────────────────────────────────────
echo ""
echo "── Compilando Flatpak (5-15 min la primera vez) ──"

# Instalar a nivel sistema como tus otras apps de Flatpak
sudo flatpak-builder \
    --force-clean \
    --install \
    --repo="$REPO_DIR" \
    "$BUILD_DIR" \
    "$SCRIPT_DIR/$APP_ID.yml"

echo ""
echo "✓ Arte instalado como Flatpak"
echo "  Búscalo en el lanzador de KDE (krunner con Alt+F2)"
echo "  o en el menú de aplicaciones bajo Gráficos"
echo ""

# ── 5. Lanzar si se pidió --run ───────────────────────────────
if [[ "$1" == "--run" ]]; then
    echo "── Iniciando Arte ──"
    flatpak run "$APP_ID"
else
    echo "Para iniciar:       flatpak run $APP_ID"
    echo "Para desinstalar:   sudo flatpak uninstall $APP_ID"
fi
