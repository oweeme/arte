#!/bin/bash
# Exporta el Flatpak compilado como un archivo .flatpak (bundle)
# que puedes distribuir directamente sin necesidad de Flathub.
#
# El usuario instala con:
#   flatpak install arte-0.2.0.flatpak
#
# Uso: ./flatpak/exportar-bundle.sh [version]

set -e

VERSION="${1:-0.2.0}"
APP_ID="com.oweeme.arte"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$PROJECT_DIR/.flatpak-repo"
OUTPUT="$PROJECT_DIR/arte-$VERSION.flatpak"

if [ ! -d "$REPO_DIR" ]; then
    echo "✗ No hay build previo. Ejecuta primero: ./flatpak/build.sh"
    exit 1
fi

echo "── Exportando bundle $OUTPUT ──"

flatpak build-bundle \
    "$REPO_DIR" \
    "$OUTPUT" \
    "$APP_ID" \
    --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo

echo ""
echo "✓ Bundle creado: $OUTPUT"
echo "  Tamaño: $(du -sh "$OUTPUT" | cut -f1)"
echo ""
echo "Instalación para el usuario final:"
echo "  flatpak install $OUTPUT"
echo ""
echo "O comparte el archivo .flatpak y el usuario lo instala"
echo "desde el gestor de archivos (doble clic en GNOME/KDE)"
