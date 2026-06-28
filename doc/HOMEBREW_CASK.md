# Arte — Distribución via Homebrew Cask (macOS)

> Cómo publicar Arte para que los usuarios de Mac puedan instalarlo con:
> `brew install --cask arte`

---

## Aclaración importante

`brew install --cask filezilla` en Mac **no instala el binario Linux de FileZilla**.
Homebrew descarga el **binario macOS** (Mach-O, `.dmg`).

FileZilla — igual que Arte — compila binarios separados para cada OS:
```
filezilla-linux-x64.tar.bz2    ← binario ELF para Linux
FileZilla_mac.dmg               ← binario Mach-O para macOS  ← esto instala brew
FileZilla_win64-setup.exe       ← PE para Windows
```

Para que Arte esté en Homebrew Cask, necesitas:
1. El `.dmg` universal de macOS compilado (ver BUILD_PRODUCCION.md §6)
2. Hospedarlo en GitHub Releases
3. Crear la fórmula Cask

---

## Pasos para publicar Arte en Homebrew Cask

### Paso 1 — Compilar y publicar el .dmg en GitHub Releases

```bash
# En tu Mac con Xcode y Developer ID configurado:
npm run tauri build -- --target universal-apple-darwin

# El .dmg queda en:
# src-tauri/target/universal-apple-darwin/release/bundle/dmg/
# → arte_0.2.0_universal.dmg
```

Crear un Release en GitHub:
```bash
git tag v0.2.0
git push origin v0.2.0
# En github.com/oweeme/arte → Releases → Draft new release
# Adjuntar arte_0.2.0_universal.dmg
```

### Paso 2 — Obtener el SHA256 del .dmg

Homebrew verifica la integridad del archivo con SHA256:

```bash
shasum -a 256 arte_0.2.0_universal.dmg
# Output ejemplo:
# a3f8c2d1e4b5a6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1  arte_0.2.0_universal.dmg
```

### Paso 3 — Crear la fórmula Cask

#### Opción A — Tu propio Tap (más rápido, control total)

Un "tap" es un repositorio de Homebrew que tú manejas.

```bash
# Crear repositorio en GitHub llamado: homebrew-tap
# (el nombre DEBE empezar con homebrew-)
# URL: github.com/oweeme/homebrew-tap
```

Crear el archivo `Casks/arte.rb` en ese repositorio:

```ruby
cask "arte" do
  version "0.2.0"
  sha256 "a3f8c2d1e4b5a6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1"

  url "https://github.com/oweeme/arte/releases/download/v#{version}/arte_#{version}_universal.dmg"

  name "Arte"
  desc "Motor de dibujo vectorial 3D para arquitectos y diseñadores"
  homepage "https://oweeme.com"

  # Versión mínima de macOS requerida por Tauri v2
  depends_on macos: ">= :ventura"  # macOS 13+

  app "arte.app"

  # Desinstalador (Homebrew lo llama al hacer brew uninstall --cask arte)
  uninstall quit: "com.oweeme.arte"

  zap trash: [
    "~/Library/Application Support/com.oweeme.arte",
    "~/Library/Preferences/com.oweeme.arte.plist",
    "~/Library/Caches/com.oweeme.arte",
    "~/Library/Logs/com.oweeme.arte",
  ]
end
```

**Instalación para el usuario con tu tap:**
```bash
brew tap oweeme/tap
brew install --cask arte
```

#### Opción B — Homebrew/homebrew-cask oficial (más difícil, más alcance)

Si Arte tiene suficientes usuarios, puedes solicitar inclusión en el repositorio oficial.
Requisitos mínimos de Homebrew:
- App firmada y notarizada por Apple (sin el aviso de Gatekeeper)
- Hospedada en una URL estable y permanente
- Con cierta popularidad/demanda comprobable

```bash
# Fork de homebrew/homebrew-cask en GitHub
# Agregar Casks/a/arte.rb (orden alfabético)
# Abrir Pull Request
```

La fórmula para el repo oficial es idéntica pero con revisión del equipo de Homebrew.

### Paso 4 — Actualizar la fórmula en cada nueva versión

Cada vez que publiques una versión nueva:

```bash
# 1. Compilar nuevo .dmg
npm run tauri build -- --target universal-apple-darwin

# 2. Obtener nuevo SHA256
shasum -a 256 arte_0.2.0_universal.dmg

# 3. Actualizar arte.rb en homebrew-tap:
#    - version "0.3.0"
#    - sha256 "nuevo_hash_aqui"

# 4. Hacer commit y push
git add Casks/arte.rb
git commit -m "Update arte to 0.3.0"
git push
```

Los usuarios actualizan con:
```bash
brew upgrade --cask arte
```

### Paso 5 — Automatizar con GitHub Actions

Actualiza `arte.rb` automáticamente al publicar un release:

```yaml
# En el repositorio de arte — agregar a .github/workflows/build.yml:

  update-homebrew:
    needs: build-macos
    runs-on: ubuntu-22.04
    if: startsWith(github.ref, 'refs/tags/')
    steps:
      - name: Descargar DMG
        uses: actions/download-artifact@v4
        with:
          name: arte-macos

      - name: Calcular SHA256
        id: sha
        run: |
          SHA=$(shasum -a 256 arte-macos/*.dmg | awk '{print $1}')
          echo "sha256=$SHA" >> $GITHUB_OUTPUT
          echo "version=${GITHUB_REF_NAME#v}" >> $GITHUB_OUTPUT

      - name: Actualizar homebrew-tap
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.TAP_GITHUB_TOKEN }}
          repository: oweeme/homebrew-tap
          event-type: update-cask
          client-payload: |
            {
              "version": "${{ steps.sha.outputs.version }}",
              "sha256": "${{ steps.sha.outputs.sha256 }}"
            }
```

```yaml
# En el repositorio homebrew-tap — .github/workflows/update.yml:

name: Update Cask
on:
  repository_dispatch:
    types: [update-cask]

jobs:
  update:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Actualizar versión y SHA en arte.rb
        run: |
          VERSION="${{ github.event.client_payload.version }}"
          SHA="${{ github.event.client_payload.sha256 }}"
          sed -i "s/version \".*\"/version \"$VERSION\"/" Casks/arte.rb
          sed -i "s/sha256 \".*\"/sha256 \"$SHA\"/" Casks/arte.rb

      - name: Commit y push
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Casks/arte.rb
          git commit -m "chore: update arte to ${{ github.event.client_payload.version }}"
          git push
```

---

## Equivalente en Linux — apt/dnf/AUR

Arte también puede distribuirse via gestores de paquetes nativos de Linux:

### Debian/Ubuntu — PPA (Personal Package Archive)

```bash
# El usuario instalaría:
sudo add-apt-repository ppa:oweeme/arte
sudo apt update
sudo apt install arte
```

Para crear un PPA se necesita cuenta en Launchpad.net (gratis).

### Arch Linux — AUR (Arch User Repository)

El `.deb` o el AppImage se puede empaquetar en el AUR. Es el repositorio
de paquetes de Arch, mantenido por la comunidad.

Crear `PKGBUILD` en el AUR:

```bash
# PKGBUILD
pkgname=arte-bin
pkgver=0.2.0
pkgrel=1
pkgdesc="Motor de dibujo vectorial 3D"
arch=('x86_64')
url="https://oweeme.com"
license=('Proprietary')
depends=('webkit2gtk-4.1')
source=("https://github.com/oweeme/arte/releases/download/v${pkgver}/arte_${pkgver}_amd64.deb")
sha256sums=('SHA256_DEL_DEB_AQUI')

package() {
    cd "$srcdir"
    bsdtar -xf data.tar.gz -C "$pkgdir/"
}
```

```bash
# Publicar en AUR:
git clone ssh://aur@aur.archlinux.org/arte-bin.git
cp PKGBUILD arte-bin/
cd arte-bin
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "Initial import"
git push
```

Instalación para el usuario:
```bash
yay -S arte-bin        # con yay (AUR helper)
paru -S arte-bin       # con paru
```

### Flatpak (universal Linux)

Flatpak funciona en todas las distros Linux (Ubuntu, Fedora, Arch, etc.)
y se puede publicar en [Flathub](https://flathub.org) (la tienda más grande de Linux desktop).

```yaml
# com.oweeme.arte.yml — manifiesto de Flatpak
app-id: com.oweeme.arte
runtime: org.gnome.Platform
runtime-version: '46'
sdk: org.gnome.Sdk
command: arte

finish-args:
  - --share=ipc
  - --socket=x11
  - --socket=wayland
  - --device=dri
  - --filesystem=home        # para guardar archivos

modules:
  - name: arte
    buildsystem: simple
    build-commands:
      - install -Dm755 arte /app/bin/arte
    sources:
      - type: file
        url: https://github.com/oweeme/arte/releases/download/v0.2.0/arte_0.2.0_amd64.AppImage
        sha256: SHA256_DEL_APPIMAGE_AQUI
```

Instalación para el usuario:
```bash
flatpak install flathub com.oweeme.arte
flatpak run com.oweeme.arte
```

### Snap (Ubuntu/Canonical)

```bash
# snapcraft.yaml
name: arte
version: '0.2.0'
summary: Motor de dibujo vectorial 3D
description: Arte es una aplicación de dibujo vectorial 3D.
grade: stable
confinement: classic   # necesario para acceso a archivos del usuario

apps:
  arte:
    command: bin/arte
    environment:
      GDK_BACKEND: x11
      WEBKIT_DISABLE_DMABUF_RENDERER: "1"

parts:
  arte:
    plugin: dump
    source: .
    stage-packages:
      - libwebkit2gtk-4.1-0
```

Publicar en la Snap Store:
```bash
snapcraft
snapcraft upload arte_0.2.0_amd64.snap --release stable
```

Instalación:
```bash
sudo snap install arte --classic
```

---

## Resumen — Gestores de paquetes por plataforma

| Plataforma | Gestor | Comando del usuario | Dificultad |
|-----------|--------|--------------------|-----------:|
| macOS | Homebrew Cask | `brew install --cask arte` | ⭐⭐ Media |
| macOS | Mac App Store | Buscar "Arte" | ⭐⭐⭐ Alta (revisión Apple) |
| Ubuntu/Debian | PPA + apt | `sudo apt install arte` | ⭐⭐ Media |
| Arch Linux | AUR | `yay -S arte-bin` | ⭐ Baja |
| Linux universal | Flatpak/Flathub | `flatpak install arte` | ⭐⭐ Media |
| Linux universal | Snap | `snap install arte` | ⭐ Baja |
| Windows | winget | `winget install oweeme.arte` | ⭐⭐ Media |
| Windows | Scoop | `scoop install arte` | ⭐ Baja |
| Android | Google Play | Buscar "Arte" | ⭐⭐⭐ Alta (revisión Google) |
| iOS | App Store | Buscar "Arte" | ⭐⭐⭐ Alta (revisión Apple) |

**Recomendación para empezar:** Homebrew Cask (Mac) + AppImage (Linux) + installer .exe (Windows).
No requieren tiendas ni revisiones — el usuario descarga y listo.

---

*Última actualización: 2026-06-09*
