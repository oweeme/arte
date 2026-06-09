# Arte — ¿Se puede usar un binario Linux en macOS o iOS?

> Respuesta corta: **No**. Cada plataforma de Apple requiere su propio binario compilado.
> Esta guía explica por qué, y qué alternativas existen.

---

## ¿Por qué un binario Linux no funciona en macOS ni iOS?

### 1. Formato de ejecutable diferente

Cada sistema operativo usa un formato de binario distinto e incompatible:

| Sistema | Formato | Extensión típica |
|---------|---------|-----------------|
| Linux | ELF (Executable and Linkable Format) | sin extensión / `.so` |
| macOS | Mach-O (Mach Object) | `.app` / `.dylib` |
| Windows | PE (Portable Executable) | `.exe` / `.dll` |
| iOS | Mach-O firmado + sandbox | `.ipa` |

Un binario ELF de Linux tiene una estructura de encabezado completamente diferente
a Mach-O. El kernel de macOS intenta leer el binario, ve que no es Mach-O, y lo
rechaza con `exec format error` antes de ejecutar ni una sola instrucción.

### 2. System calls diferentes

Incluso si el formato fuera compatible, las llamadas al sistema operativo son distintas:

```
Linux:  open() → syscall #2  (kernel Linux)
macOS:  open() → syscall #5  (kernel XNU/Darwin)
iOS:    open() → syscall #5  (XNU, mismo que macOS pero con sandboxing extra)
```

Un binario Linux llama `int 0x80` o `syscall` con números de Linux.
macOS usa `int 0x80` con números completamente distintos. El resultado es un crash inmediato.

### 3. Librerías del sistema incompatibles

Arte usa WebKit (vía Tauri) para renderizar la UI. En Linux se enlaza con:
```
libwebkit2gtk-4.1.so     ← solo existe en Linux
libgtk-3.so              ← solo existe en Linux
libgdk-3.so              ← solo existe en Linux
```

Estas librerías no existen en macOS. macOS usa:
```
WebKit.framework         ← framework nativo de Apple, solo en macOS/iOS
AppKit.framework         ← UI nativa de macOS
UIKit.framework          ← UI nativa de iOS
```

Tauri v2 abstrae estas diferencias, pero **requiere compilar para cada plataforma**
para enlazar con las librerías correctas de cada sistema.

### 4. iOS tiene restricciones adicionales

Además de todo lo anterior, iOS impone:

- **No permite ejecutar código no firmado.** Cada binario debe estar firmado con
  un certificado de Apple válido y con un Provisioning Profile asociado al dispositivo.
- **Sandbox estricto.** Las apps solo pueden acceder a su propio directorio.
  Un binario "suelto" no tiene concepto de sandbox y violaría las políticas de iOS.
- **No hay terminal ni shell.** iOS no tiene un entorno de ejecución general.
  Todo corre dentro de la caja de arena de una app específica.
- **JIT deshabilitado** (en apps de la App Store). El motor JS de WebKit en iOS
  no puede compilar código en tiempo de ejecución sin un entitlement especial.
- **Sin sideload** (sin jailbreak). Solo se pueden instalar apps firmadas via
  App Store, TestFlight, o ADP (Apple Developer Program con dispositivo registrado).

---

## Resumen visual

```
Binario Linux (ELF)
        │
        ├──▶ Linux x86_64     ✅ Funciona nativamente
        │
        ├──▶ macOS Intel      ❌ Formato Mach-O requerido
        ├──▶ macOS ARM (M1+)  ❌ Formato Mach-O requerido
        │
        ├──▶ iOS ARM64        ❌ Formato Mach-O + firma + sandbox requeridos
        │
        └──▶ Windows x64      ❌ Formato PE (.exe) requerido
```

---

## ¿Qué alternativas existen para correr Arte en una Mac?

### Opción 1 — Compilar para macOS (la correcta)

Es lo que se documenta en [BUILD_PRODUCCION.md](BUILD_PRODUCCION.md) sección 6.
Tauri compila un binario Mach-O nativo que corre perfectamente en Mac.
No requiere ningún software adicional para el usuario.

```bash
# En una Mac con Xcode:
npm run tauri build -- --target universal-apple-darwin
# → arte_0.2.0_universal.dmg
```

### Opción 2 — Lima (VM Linux ligera en macOS)

[Lima](https://github.com/lima-vm/lima) crea una VM Linux en macOS con integración
de carpetas y red. El usuario instalaría Lima y luego el binario Linux de Arte.

```bash
# El usuario haría esto en su Mac:
brew install lima
limactl start default           # inicia VM Ubuntu
limactl shell default           # abre shell en la VM
# Dentro de la VM:
sudo apt install ./arte.deb
arte                            # corre Arte dentro de la VM
```

**Desventajas:**
- La UI de Arte correría dentro de la VM, sin integración nativa con macOS.
- Rendimiento reducido.
- Instalación compleja para usuarios no técnicos.
- No es una experiencia de "app de escritorio Mac".

### Opción 3 — Docker con X11 forwarding

Similar a Lima pero con Docker. Aún más complejo para el usuario final.
Solo viable para desarrolladores o entornos de CI.

```bash
# Hipotético (no recomendado para usuarios normales):
docker run -e DISPLAY=host.docker.internal:0 \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  oweeme/arte:linux
```

**Desventajas:**
- Requiere un servidor X11 en la Mac (XQuartz).
- Rendimiento pobre.
- La experiencia visual es Linux, no macOS.

---

## ¿Qué alternativas existen para iOS?

### No hay alternativas prácticas para usuarios normales.

iOS es el sistema más cerrado de todos. Las únicas formas de instalar apps son:

| Método | Requisito | Para Arte |
|--------|-----------|-----------|
| App Store | Cuenta Apple Developer $99/año + revisión | ✅ Viable (ver BUILD_PRODUCCION.md §7) |
| TestFlight | Cuenta Developer + invitar testers | ✅ Para pruebas antes de publicar |
| ADP (Xcode directo) | Mac + cuenta Developer + dispositivo registrado | ✅ Solo para desarrollo |
| Jailbreak | Dispositivo jailbroken | ❌ No distribuir así |
| Sideload (AltStore) | AltStore + PC/Mac encendido | ⚠️ Revoca cada 7 días sin cuenta de pago |

La única forma práctica de distribuir Arte en iOS es **compilarlo para iOS**
y publicarlo en la App Store o TestFlight.

---

## Conclusión

| Pregunta | Respuesta |
|----------|-----------|
| ¿El binario Linux corre en macOS? | ❌ No. Formato ELF vs Mach-O incompatibles. |
| ¿El binario Linux corre en iOS? | ❌ No. Además del formato, iOS no permite binarios sin firma. |
| ¿Se puede usar Arte en Mac sin compilar para Mac? | ⚠️ Solo con VM (Lima/Docker), experiencia pobre. |
| ¿Se puede usar Arte en iOS sin compilar para iOS? | ❌ No hay manera práctica. |
| ¿Hay que mantener código separado para cada plataforma? | ❌ No. El mismo código Rust+JS, Tauri lo compila para cada target. |
| ¿Cuánto esfuerzo extra es soportar macOS + iOS? | La mayor parte del trabajo es el proceso de firma y la cuenta Developer de Apple. El código de Arte no cambia. |

**La buena noticia:** Tauri maneja toda la complejidad de adaptar el mismo código
a cada plataforma. Tú escribes el código una vez; Tauri lo enlaza con las librerías
correctas de cada OS al compilar. Por eso es importante compilar en cada plataforma
destino (o usar CI como GitHub Actions con runners de cada OS).

---

*Última actualización: 2026-06-09*
