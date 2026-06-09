#!/bin/bash
# Genera generated-sources.json con todas las dependencias de Cargo
# para que flatpak-builder pueda compilar sin internet.
#
# Uso: ./flatpak/generar-cache.sh
# Requiere: python3, pip3

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "── Instalando flatpak-cargo-generator ──"
pip3 install --user aiohttp toml

# Descargar flatpak-cargo-generator si no está
if [ ! -f "$SCRIPT_DIR/flatpak-cargo-generator.py" ]; then
    echo "── Descargando flatpak-cargo-generator ──"
    curl -fsSL \
      "https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/cargo/flatpak-cargo-generator.py" \
      -o "$SCRIPT_DIR/flatpak-cargo-generator.py"
fi

echo "── Generando generated-sources.json ──"
python3 "$SCRIPT_DIR/flatpak-cargo-generator.py" \
    "$PROJECT_DIR/src-tauri/Cargo.lock" \
    -o "$SCRIPT_DIR/generated-sources.json"

echo ""
echo "✓ generated-sources.json creado en flatpak/"
echo "  Ahora puedes ejecutar: ./flatpak/build.sh"
