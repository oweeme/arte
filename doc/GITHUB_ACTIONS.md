# Arte — GitHub Actions CI/CD

> Repo privado: `github.com/oweeme/arte`
> Última actualización: 2026-06-09

---

## Índice

1. [Cómo funciona](#1-cómo-funciona)
2. [Flujo completo](#2-flujo-completo)
3. [Cada job explicado](#3-cada-job-explicado)
4. [Secrets configurados](#4-secrets-configurados)
5. [Cómo lanzar un release](#5-cómo-lanzar-un-release)
6. [Compartir los instaladores](#6-compartir-los-instaladores)
7. [Solución de problemas](#7-solución-de-problemas)

---

## 1. Cómo funciona

Cada vez que publicas un tag de versión (`v0.2.0`, `v1.0.0`, etc.),
GitHub Actions arranca automáticamente y compila Arte para todas las plataformas
en máquinas virtuales reales en la nube — sin que tengas que hacer nada más.

```
git tag v0.2.0
git push origin v0.2.0
         │
         ▼
   GitHub Actions
   ┌─────────────────────────────────────────────┐
   │  VM Windows  → Arte_0.2.0_x64_en-US.msi    │
   │  VM Linux    → Arte_0.2.0_amd64.deb         │
   │               Arte-0.2.0-1.x86_64.rpm       │
   │               Arte_0.2.0_amd64.AppImage     │
   │  VM Ubuntu   → app-universal-release.apk    │
   │               app-universal-release.aab     │
   │  VM macOS    → Arte_universal.dmg            │
   └─────────────────────────────────────────────┘
         │
         ▼
   GitHub Release v0.2.0
   (todos los archivos adjuntos automáticamente)
```

**Tiempo total:** ~20 minutos (los jobs corren en paralelo)
**Costo:** Gratis (GitHub incluye 2000 min/mes en repos privados)

---

## 2. Flujo completo

```
Tu PC (KDE Neon)
    │
    ├── git commit -m "..."
    ├── git tag v0.2.0
    └── git push origin main && git push origin v0.2.0
                │
                ▼
         GitHub detecta el tag
                │
    ┌───────────┴────────────────────────┐
    │           │            │           │
    ▼           ▼            ▼           ▼
 Windows     Linux        Android     macOS
 (12 min)   (8 min)      (18 min)    (5 min)
    │           │            │           │
    └───────────┴────────────┴───────────┘
                │
                ▼
         create-release (10s)
         Crea el GitHub Release y adjunta todos los archivos
                │
                ▼
         github.com/oweeme/arte/releases/tag/v0.2.0
```

---

## 3. Cada job explicado

### `build-windows` — `windows-latest`

Compila Arte en una VM Windows real con Visual Studio 2022.

Genera:
- `Arte_X.X.X_x64_en-US.msi` — instalador MSI con asistente
- `Arte_X.X.X_x64-setup.exe` — instalador NSIS (más ligero)

Ambos instalan Arte en Programas del sistema y crean acceso directo en el escritorio.
En "Agregar o quitar programas" aparece como **Arte** con publisher **Hector Martinez**.

### `build-linux` — `ubuntu-22.04`

Instala dependencias del sistema (`libwebkit2gtk-4.1-dev`, etc.) y compila.

Genera:
- `Arte_X.X.X_amd64.deb` — para Ubuntu, KDE Neon, Mint, Debian
- `Arte-X.X.X-1.x86_64.rpm` — para Fedora, openSUSE, RHEL
- `Arte_X.X.X_amd64.AppImage` — portable, funciona en cualquier Linux sin instalar

El `.deb` incluye el metainfo AppStream para que KDE Discover muestre
el nombre y autor correctamente.

### `build-android` — `ubuntu-22.04`

Instala NDK 26, configura los 4 targets de Rust, decodifica el keystore desde
el secret `ANDROID_KEYSTORE_BASE64` y compila para las 4 arquitecturas Android.

Genera:
- `app-universal-release.apk` — para instalar directamente con `adb install`
- `app-universal-release.aab` — para subir a Google Play Store

El APK/AAB está **firmado** con el keystore de Hector Martinez
(SHA-256: `5a:17:93...b9:90:f7`).

### `build-macos` — `macos-latest` (Apple Silicon M2)

Compila dos veces: una para Apple Silicon (`aarch64`) y otra para Intel (`x86_64`).
Luego combina los binarios con `lipo -create` en un **Universal Binary**.

Genera:
- `Arte_universal.dmg` — funciona en CUALQUIER Mac (Intel y M1/M2/M3/M4)
- `Arte_X.X.X_aarch64.dmg` — solo Apple Silicon
- `Arte_X.X.X_x64.dmg` — solo Intel

**Sin cuenta Apple Developer:** El `.dmg` se puede instalar pero macOS mostrará
"App de desarrollador no identificado". El usuario puede abrir con clic derecho → Abrir.

**Con cuenta Apple Developer ($99/año):** El `.dmg` se puede firmar y notarizar,
eliminando la advertencia de seguridad.

### `build-ios` — `macos-latest`

Intenta compilar el `.ipa` para iPhone/iPad.
Tiene `continue-on-error: true` — si falla, no bloquea el Release.

**Sin Apple Developer ($99/año):** Falla al firmar. El `.ipa` no se puede instalar
en dispositivos reales. Solo en el simulador.

**Con Apple Developer:** Requiere agregar estos secrets:
- `APPLE_CERTIFICATE` — certificado `.p12` en base64
- `APPLE_CERTIFICATE_PASSWORD` — contraseña del .p12
- `APPLE_PROVISIONING_PROFILE` — perfil de distribución en base64
- `APPLE_SIGNING_IDENTITY` — ej. `"Apple Distribution: Hector Martinez (XXXXXXXXXX)"`

### `create-release` — `ubuntu-22.04`

Descarga todos los artefactos de los jobs anteriores y crea el GitHub Release.
Solo corre cuando el trigger es un tag (`refs/tags/`).

Tiene `permissions: contents: write` para poder crear el Release.

---

## 4. Secrets configurados

En `github.com/oweeme/arte/settings/secrets/actions`:

| Secret | Descripción | Cómo actualizarlo |
|--------|-------------|-------------------|
| `ANDROID_KEYSTORE_BASE64` | Keystore en base64 | `base64 -w0 ~/keystores/arte-release.jks \| gh secret set ANDROID_KEYSTORE_BASE64 --repo oweeme/arte --body -` |
| `ARTE_KEYSTORE_PASS` | Contraseña del keystore | `gh secret set ARTE_KEYSTORE_PASS --repo oweeme/arte --body "nueva_contraseña"` |
| `ARTE_KEY_PASS` | Contraseña del alias `arte` | Igual que arriba |

**El keystore nunca se sube al repo** — está en `.gitignore`. GitHub lo recibe solo
como variable de entorno cifrada.

---

## 5. Cómo lanzar un release

### Release normal

```bash
cd /home/oweeme/Dev/rust/arte/arte

# 1. Actualizar la versión en Cargo.toml y tauri.conf.json
#    version = "0.2.0"

# 2. Hacer commit
git add .
git commit -m "Arte v0.2.0 — descripción de cambios"

# 3. Crear tag y subir
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

Ir a `github.com/oweeme/arte/actions` para ver el progreso.
En ~20 min el Release aparece en `github.com/oweeme/arte/releases`.

### Lanzar el build manualmente (sin nuevo tag)

En GitHub → Actions → "Build Arte" → "Run workflow" → seleccionar rama → Run.
Útil para probar cambios en el workflow sin crear una versión nueva.

### Relanzar un job fallido

```bash
gh run rerun <RUN_ID> --repo oweeme/arte --failed
```

O en GitHub → Actions → click en el run → "Re-run failed jobs".

---

## 6. Compartir los instaladores

El repo es **privado** — los links de GitHub Releases no son accesibles públicamente.

### Opción A — Google Drive (más simple)

1. Descarga los archivos desde `github.com/oweeme/arte/releases`
2. Súbelos a Google Drive
3. Clic derecho → "Obtener enlace" → "Cualquier persona con el enlace"
4. Comparte ese link

### Opción B — Hacer el repo público

Si el código no es secreto:
```bash
gh repo edit oweeme/arte --visibility public
```

Los links de Release quedan públicos automáticamente:
```
https://github.com/oweeme/arte/releases/latest
https://github.com/oweeme/arte/releases/download/v0.2.0/Arte_0.2.0_x64_en-US.msi
```

### Opción C — Página web de descargas

Crear un repo público separado con GitHub Pages que enlace a los archivos de Drive:

```html
<!-- index.html del repo público oweeme/arte-website -->
<a href="https://drive.google.com/.../Arte_0.2.0.msi">Descargar para Windows</a>
<a href="https://drive.google.com/.../Arte_0.2.0.deb">Descargar para Linux</a>
<a href="https://drive.google.com/.../Arte_0.2.0.dmg">Descargar para macOS</a>
```

### Opción D — Agregar colaboradores al repo privado

En GitHub → Settings → Collaborators → "Add people" → email de la persona.
Solo esa persona puede ver y descargar.

---

## 7. Solución de problemas

### "Resource not accessible by integration" en create-release

Faltaba el permiso. Ya está corregido con:
```yaml
permissions:
  contents: write
```

### Build de Windows falla con "WiX not found"

GitHub Actions instala WiX automáticamente en `windows-latest`.
Si falla, verificar que `tauri.conf.json` tenga `"targets": "all"` o `"msi"`.

### Build de Android falla con "SDK location not found"

El job crea `local.properties` automáticamente:
```yaml
- name: Crear local.properties
  run: echo "sdk.dir=$ANDROID_SDK_ROOT" > src-tauri/gen/android/local.properties
```
Si falla, verificar que `android-actions/setup-android@v3` esté funcionando.

### Build de macOS falla con "no such file Arte.app"

El nombre del `.app` viene de `productName` en `tauri.conf.json`.
Si cambiaste el nombre, actualizar el workflow:
```yaml
ARM_APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Arte.app"
X86_APP="src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Arte.app"
```

### Ver los logs de un job específico

```bash
# Ver qué falló en el último run
gh run list --repo oweeme/arte --limit 1
gh run view <RUN_ID> --repo oweeme/arte --log-failed
```

### Descargar los artefactos desde terminal

```bash
gh run download <RUN_ID> --repo oweeme/arte --dir ./downloads/
```

---

## Resumen de comandos útiles

```bash
# Ver estado de los últimos builds
gh run list --repo oweeme/arte --limit 5

# Ver detalle de un build
gh run view <RUN_ID> --repo oweeme/arte

# Lanzar build manualmente
gh workflow run build.yml --repo oweeme/arte

# Ver releases publicados
gh release list --repo oweeme/arte

# Descargar archivos de un release
gh release download v0.2.0 --repo oweeme/arte --dir ./dist/

# Actualizar un secret
gh secret set ARTE_KEYSTORE_PASS --repo oweeme/arte --body "nueva_contraseña"

# Ver todos los secrets (solo nombres, no valores)
gh secret list --repo oweeme/arte
```

---

*Última actualización: 2026-06-09 | GitHub Actions | Arte v0.1.4*
