# Arte — Sistema de Licencias

> Cómo generar claves, validarlas localmente y cómo migrar a validación por servidor.

---

## Índice

1. [Modelo actual (validación local)](#1-modelo-actual-validación-local)
2. [Cómo generar claves válidas](#2-cómo-generar-claves-válidas)
3. [Integrar validación por servidor](#3-integrar-validación-por-servidor)
4. [Activación desde el servidor (flujo completo)](#4-activación-desde-el-servidor-flujo-completo)
5. [API de servidor mínima en Node.js](#5-api-de-servidor-mínima-en-nodejs)
6. [API de servidor mínima en Rust/Actix](#6-api-de-servidor-mínima-en-rustactix)
7. [Seguridad y consideraciones](#7-seguridad-y-consideraciones)
8. [Distribución y venta de licencias](#8-distribución-y-venta-de-licencias)

---

## 1. Modelo actual (validación local)

El sistema actual es **100% local**. La validación ocurre en el cliente sin llamadas de red.

### Código en `src/main.js`

```js
const LICENSE_KEY = 'arte_licensed_v1';   // clave de localStorage

function validateKey(key) {
    const k = key.trim().toUpperCase();
    // Formato: ARTE-XXXX-XXXX-XXXX  (4+4+4+4 alfanumérico)
    return /^ARTE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k);
}

function isLicensed() {
    return localStorage.getItem(LICENSE_KEY) === 'true';
}
```

### ¿Qué hace exactamente?

1. El usuario ingresa una clave.
2. Se valida con la regex `^ARTE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`.
3. Si es válida → se guarda `arte_licensed_v1 = "true"` en `localStorage`.
4. Los botones de exportar se habilitan sin recargar.

### Limitaciones del modelo actual

| Limitación | Impacto |
|-----------|---------|
| Cualquier clave con el formato correcto es válida | Usuario puede compartir claves fácilmente |
| `localStorage` se puede manipular desde DevTools | Usuario técnico puede auto-activarse |
| No hay revocación de licencias | No puedes desactivar una clave comprometida |
| No sabes cuántas instalaciones tiene cada licencia | Sin control de uso |

Este modelo es aceptable para **versiones tempranas** o **productos de bajo precio**. Para mayor seguridad, usar el modelo de servidor descrito a continuación.

---

## 2. Cómo generar claves válidas

### Script de generación en Node.js

Guarda este archivo como `tools/generar-licencia.js` y ejecútalo con `node generar-licencia.js`:

```js
#!/usr/bin/env node

// Genera claves de licencia para Arte
// Uso: node generar-licencia.js [cantidad]

const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1 (confusión visual)

function randomSegment(len = 4) {
    let s = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
        s += CHARS[bytes[i] % CHARS.length];
    }
    return s;
}

function generarClave() {
    return `ARTE-${randomSegment()}-${randomSegment()}-${randomSegment()}`;
}

const cantidad = parseInt(process.argv[2] || '10', 10);

console.log(`\n── Claves de licencia Arte (${cantidad}) ──\n`);
for (let i = 0; i < cantidad; i++) {
    console.log(generarClave());
}
console.log('');
```

**Ejecución:**
```bash
node tools/generar-licencia.js 5

── Claves de licencia Arte (5) ──

ARTE-K7RN-P2XQ-V8HM
ARTE-B4YT-N9WC-G3KF
ARTE-X2PM-H7RB-T5NQ
ARTE-Q9VK-C3MT-W6YH
ARTE-M5WX-F8NK-R4PB
```

### Script de generación en Rust

```rust
// tools/src/main.rs
use std::fmt::Write;

fn generar_clave() -> String {
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    let mut rng = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as usize;
    
    let mut segmento = |n: usize| -> String {
        (0..n).map(|i| {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(i + 1);
            chars[(rng >> 33) % chars.len()]
        }).collect()
    };

    format!("ARTE-{}-{}-{}", segmento(4), segmento(4), segmento(4))
}

fn main() {
    for _ in 0..10 { println!("{}", generar_clave()); }
}
```

> **Nota:** En producción usa `rand::thread_rng()` con la crate `rand` para números aleatorios criptográficamente seguros.

---

## 3. Integrar validación por servidor

Para un sistema robusto, la validación debe ocurrir en un servidor que tú controlas.

### Flujo propuesto

```
Usuario ingresa clave
        │
        ▼
Frontend (main.js)
  → POST /api/activar
    { clave, machineId, version }
        │
        ▼
Servidor
  → ¿Clave existe en la BD?
  → ¿No está revocada?
  → ¿Instalaciones < límite?
  → Registrar instalación
  → Responder { ok: true, token: "JWT..." }
        │
        ▼
Frontend
  → Guardar token en localStorage
  → Verificar token en cada inicio (opcional)
  → Exportar habilitado
```

### Cambios en `src/main.js`

Reemplaza las funciones `validateKey` e `isLicensed` con:

```js
const LICENSE_STORAGE = 'arte_license_token_v1';
const API_BASE = 'https://tu-servidor.com/api'; // Cambia a tu URL

// Genera un ID único de máquina (persistido en localStorage)
function getMachineId() {
    let id = localStorage.getItem('arte_machine_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('arte_machine_id', id);
    }
    return id;
}

// Verifica si hay un token de licencia guardado localmente
function isLicensed() {
    const token = localStorage.getItem(LICENSE_STORAGE);
    if (!token) return false;
    try {
        // Decodifica el JWT (solo la parte payload, sin verificar firma)
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Verifica que no haya expirado
        return payload.exp ? payload.exp * 1000 > Date.now() : true;
    } catch {
        return false;
    }
}

// Activa una licencia contra el servidor
async function activarLicencia(clave) {
    const res = await fetch(`${API_BASE}/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clave: clave.trim().toUpperCase(),
            machineId: getMachineId(),
            version: '0.2.0',
            os: navigator.platform,
        }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Error al validar la clave' };
    }

    // Guardar el token JWT (válido por 1 año o según el servidor)
    localStorage.setItem(LICENSE_STORAGE, data.token);
    return { ok: true };
}

// Verificación periódica opcional (cada vez que se abre la app)
async function verificarLicenciaOnline() {
    const token = localStorage.getItem(LICENSE_STORAGE);
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/verificar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ machineId: getMachineId() }),
        });
        if (!res.ok) {
            // Revocada o expirada — quitar licencia local
            localStorage.removeItem(LICENSE_STORAGE);
            applyLicenseUI();
        }
    } catch {
        // Sin conexión → la app sigue funcionando con el token local
        // (modo offline tolerante)
    }
}
```

**Actualizar el listener del input en el modal:**

```js
document.getElementById('license-input')?.addEventListener('input', async e => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    e.target.value = raw;
    const status = document.getElementById('license-status');

    // Solo intentar activar cuando tiene el formato completo
    if (!/^ARTE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(raw)) {
        if (raw.length > 0) {
            status.textContent = 'Formato: ARTE-XXXX-XXXX-XXXX';
            status.className   = 'license-status err';
        }
        return;
    }

    status.textContent = 'Verificando...';
    status.className   = 'license-status';

    const result = await activarLicencia(raw);

    if (result.ok) {
        status.textContent = '✓ Licencia activada — exportar habilitado';
        status.className   = 'license-status ok';
        applyLicenseUI();
    } else {
        status.textContent = result.error;
        status.className   = 'license-status err';
    }
});
```

**Llamar verificación al iniciar la app (al final de `main.js`):**

```js
applyLicenseUI();
verificarLicenciaOnline(); // No bloquea el inicio
```

---

## 4. Activación desde el servidor (flujo completo)

```
┌─────────────────────────────────────────────────────────────┐
│                      FLUJO DE ACTIVACIÓN                    │
│                                                             │
│  Cliente (Arte app)              Servidor (tu backend)      │
│  ─────────────────               ──────────────────────     │
│                                                             │
│  1. Usuario ingresa               BD: licencias             │
│     ARTE-K7RN-P2XQ-V8HM         ┌──────────────────────┐  │
│          │                       │ clave | usos | activa │  │
│          ▼                       │ K7RN… │  0   │  true  │  │
│  2. POST /api/activar  ──────▶  └──────────────────────┘  │
│     { clave, machineId }                │                   │
│                                         │ Buscar clave      │
│                                         │ ¿Existe? ✓        │
│                                         │ ¿Activa? ✓        │
│                                         │ ¿Usos < límite? ✓ │
│                                         │ Registrar install │
│                                         ▼                   │
│  3. ◀─────────────── 200 OK + JWT token                    │
│     { ok: true, token: "eyJ..." }       │                   │
│          │                              │                   │
│  4. Guardar token en localStorage       │                   │
│     Habilitar exportar                  │                   │
│                                                             │
│  (Próximos inicios de la app)                               │
│                                                             │
│  5. Token local existe                                      │
│     ¿Expirado? No → Exportar habilitado                     │
│                                                             │
│  6. POST /api/verificar  ────▶  ¿Token válido? ✓            │
│     (en background, no bloquea)  ¿Revocado? No              │
│                                  200 OK → todo bien          │
│                                                             │
│  Si el servidor dice 401:                                   │
│  7. Limpiar localStorage                                    │
│     Modo demo activado                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. API de servidor mínima en Node.js

Guarda como `server/index.js`. Requiere: `npm install express jsonwebtoken`

```js
const express = require('express');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');

const app    = express();
const SECRET = process.env.JWT_SECRET || 'cambia-esto-por-algo-seguro-en-produccion';

app.use(express.json());

// ── Base de datos en memoria (reemplaza con tu BD real) ──────
// En producción: SQLite, PostgreSQL, MySQL, etc.
const licencias = new Map([
    // clave → { activa, limiteSesiones, instalaciones: Set }
    ['ARTE-K7RN-P2XQ-V8HM', { activa: true, limite: 3, installs: new Set() }],
    ['ARTE-B4YT-N9WC-G3KF', { activa: true, limite: 1, installs: new Set() }],
    ['ARTE-X2PM-H7RB-T5NQ', { activa: true, limite: 5, installs: new Set() }],
]);

// ── POST /api/activar ────────────────────────────────────────
app.post('/api/activar', (req, res) => {
    const { clave, machineId, version, os } = req.body;

    if (!clave || !machineId) {
        return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }

    const lic = licencias.get(clave.trim().toUpperCase());

    if (!lic) {
        return res.status(404).json({ ok: false, error: 'Clave no encontrada' });
    }
    if (!lic.activa) {
        return res.status(403).json({ ok: false, error: 'Licencia revocada' });
    }

    // Ya estaba instalada en esta máquina → permitir (renovación)
    const yaRegistrada = lic.installs.has(machineId);

    if (!yaRegistrada && lic.installs.size >= lic.limite) {
        return res.status(403).json({
            ok: false,
            error: `Límite de instalaciones alcanzado (${lic.limite})`
        });
    }

    lic.installs.add(machineId);

    // Registrar activación (en producción: guardar en BD)
    console.log(`Activación: ${clave} | machine: ${machineId} | OS: ${os} | v${version}`);

    // Generar JWT válido por 1 año
    const token = jwt.sign(
        {
            clave,
            machineId,
            version,
            iat: Math.floor(Date.now() / 1000),
        },
        SECRET,
        { expiresIn: '365d' }
    );

    res.json({ ok: true, token });
});

// ── POST /api/verificar ──────────────────────────────────────
app.post('/api/verificar', (req, res) => {
    const authHeader = req.headers.authorization;
    const { machineId } = req.body;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'Sin token' });
    }

    try {
        const payload = jwt.verify(authHeader.slice(7), SECRET);
        const lic     = licencias.get(payload.clave);

        if (!lic || !lic.activa) {
            return res.status(401).json({ ok: false, error: 'Licencia revocada' });
        }
        if (payload.machineId !== machineId) {
            return res.status(401).json({ ok: false, error: 'Máquina no coincide' });
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
    }
});

// ── GET /api/admin/licencias ─────────────────────────────────
// Protege esto con autenticación en producción
app.get('/api/admin/licencias', (req, res) => {
    const resumen = [];
    for (const [clave, lic] of licencias) {
        resumen.push({
            clave,
            activa: lic.activa,
            limite: lic.limite,
            instalaciones: lic.installs.size,
            machineIds: [...lic.installs],
        });
    }
    res.json(resumen);
});

// ── POST /api/admin/revocar ──────────────────────────────────
app.post('/api/admin/revocar', (req, res) => {
    const { clave } = req.body;
    const lic = licencias.get(clave);
    if (!lic) return res.status(404).json({ ok: false });
    lic.activa = false;
    console.log(`Licencia revocada: ${clave}`);
    res.json({ ok: true });
});

app.listen(3000, () => console.log('Servidor de licencias en http://localhost:3000'));
```

**Ejecutar:**
```bash
JWT_SECRET="mi-secreto-super-seguro-2026" node server/index.js
```

---

## 6. API de servidor mínima en Rust/Actix

Si prefieres el servidor también en Rust. Agrega a `Cargo.toml`:
```toml
actix-web  = "4"
jsonwebtoken = "9"
serde = { version = "1", features = ["derive"] }
tokio  = { version = "1", features = ["full"] }
```

```rust
use actix_web::{web, App, HttpServer, HttpRequest, HttpResponse, middleware};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

#[derive(Clone)]
struct Licencia {
    activa:  bool,
    limite:  usize,
    installs: HashSet<String>,
}

struct AppState {
    licencias: Mutex<HashMap<String, Licencia>>,
    secret:    String,
}

#[derive(Serialize, Deserialize)]
struct Claims {
    clave:      String,
    machine_id: String,
    exp:        usize,
}

#[derive(Deserialize)]
struct ActivarRequest {
    clave:      String,
    machine_id: String,
    version:    Option<String>,
}

#[derive(Serialize)]
struct ActivarResponse {
    ok:    bool,
    token: Option<String>,
    error: Option<String>,
}

async fn activar(
    data:  web::Data<AppState>,
    body:  web::Json<ActivarRequest>,
) -> HttpResponse {
    let mut lics = data.licencias.lock().unwrap();
    let clave    = body.clave.trim().to_uppercase();

    let Some(lic) = lics.get_mut(&clave) else {
        return HttpResponse::NotFound().json(ActivarResponse {
            ok: false, token: None,
            error: Some("Clave no encontrada".into()),
        });
    };

    if !lic.activa {
        return HttpResponse::Forbidden().json(ActivarResponse {
            ok: false, token: None,
            error: Some("Licencia revocada".into()),
        });
    }

    let ya_registrada = lic.installs.contains(&body.machine_id);
    if !ya_registrada && lic.installs.len() >= lic.limite {
        return HttpResponse::Forbidden().json(ActivarResponse {
            ok: false, token: None,
            error: Some(format!("Límite de {} instalaciones alcanzado", lic.limite)),
        });
    }

    lic.installs.insert(body.machine_id.clone());

    let exp = (chrono::Utc::now() + chrono::Duration::days(365)).timestamp() as usize;
    let claims = Claims { clave, machine_id: body.machine_id.clone(), exp };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(data.secret.as_bytes()),
    ).unwrap();

    HttpResponse::Ok().json(ActivarResponse { ok: true, token: Some(token), error: None })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let secret = std::env::var("JWT_SECRET").unwrap_or("cambia-esto".into());

    let mut lics = HashMap::new();
    lics.insert("ARTE-K7RN-P2XQ-V8HM".into(), Licencia {
        activa: true, limite: 3, installs: HashSet::new(),
    });

    let state = web::Data::new(AppState {
        licencias: Mutex::new(lics),
        secret,
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/api/activar",   web::post().to(activar))
    })
    .bind("0.0.0.0:3000")?
    .run()
    .await
}
```

---

## 7. Seguridad y consideraciones

### Nivel de seguridad por modelo

| Modelo | Seguridad | Complejidad | Recomendado para |
|--------|-----------|-------------|-----------------|
| Solo regex (actual) | ⭐ Baja | ⭐ Mínima | MVP, precio < $10 |
| Hash local (SHA-256) | ⭐⭐ Media | ⭐⭐ Baja | Precio $10–$30 |
| JWT + servidor | ⭐⭐⭐ Alta | ⭐⭐⭐ Media | Precio > $30 |
| Servidor + hardware ID | ⭐⭐⭐⭐ Muy alta | ⭐⭐⭐⭐ Alta | Software enterprise |

### Mejora intermedia — Hash con sal (sin servidor)

Si no quieres servidor pero quieres más seguridad que la regex:

```js
// Genera claves en tu script privado:
// clave = "ARTE-" + base32(SHA256(secreto + numero_de_serie).slice(0,3 segmentos))

async function validateKey(key) {
    const k = key.trim().toUpperCase();
    if (!/^ARTE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return false;

    const partes = k.replace('ARTE-', ''); // "XXXX-XXXX-XXXX"
    // Verificar checksum: el último segmento es un hash de los primeros dos
    const encoder = new TextEncoder();
    const data    = encoder.encode('ARTE_SALT_2026_' + partes.slice(0, 9));
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hash    = Array.from(new Uint8Array(hashBuf));

    // Los últimos 4 chars de la clave deben coincidir con los primeros 2 bytes del hash
    const esperado = hash.slice(0, 2).map(b => CHARS[b % CHARS.length]).join('');
    const actual   = partes.slice(-4, -2); // primeros 2 del último segmento

    return esperado === actual;
}
```

Con este modelo, solo las claves generadas con tu script privado (que conoce el salt) son válidas.

### Modo offline tolerante

Con JWT + servidor, la app funciona sin internet:

- **Al activar:** necesita internet (una sola vez).
- **En uso diario:** verifica en background. Si falla (sin internet), la app sigue funcionando.
- **Al expirar el JWT (1 año):** la app vuelve a modo demo hasta reconectar y revalidar.
- **Si se revoca:** la próxima verificación online desactiva la licencia.

### Almacenamiento seguro (Tauri Store)

En lugar de `localStorage` (manipulable desde DevTools), usa el plugin `tauri-plugin-store`:

```toml
# Cargo.toml
tauri-plugin-store = "2"
```

```js
// main.js
import { load } from '@tauri-apps/plugin-store';

const store = await load('license.json', { autoSave: true });

// Guardar:
await store.set('token', jwtToken);

// Leer:
const token = await store.get('token');
```

El archivo `license.json` se guarda en el directorio de configuración del sistema
(`~/.config/arte/` en Linux, `%APPDATA%\arte\` en Windows), más difícil de manipular
que localStorage.

---

## 8. Distribución y venta de licencias

### Plataformas recomendadas

| Plataforma | Comisión | Lo que hace |
|-----------|---------|-------------|
| [Gumroad](https://gumroad.com) | 10% | Genera claves, maneja pagos, IVA |
| [Lemon Squeezy](https://lemonsqueezy.com) | 5% | Similar a Gumroad, mejor para SaaS |
| [Paddle](https://paddle.com) | 5% + fees | Merchant of Record, ideal para B2B |
| [Stripe](https://stripe.com) | 2.9% + $0.30 | Máximo control, tú manejas todo |

### Integración con Gumroad (más simple)

Gumroad puede generar claves automáticamente con un prefijo que definas:

1. Crear producto en Gumroad → "License Key" como tipo de entrega.
2. Configurar prefijo: `ARTE` (Gumroad agrega los segmentos automáticamente).
3. Gumroad genera: `ARTE-K7RN-P2XQ-V8HM` al completar la compra.
4. El cliente recibe la clave por email.
5. Ingresa la clave en Arte → se valida (local o contra tu servidor).

Para validación por servidor con Gumroad, usa su API:
```
GET https://api.gumroad.com/v2/licenses/verify
    ?product_id=TU_PRODUCT_ID
    &license_key=ARTE-K7RN-P2XQ-V8HM
```

### Webhook de activación automática

Cuando alguien compra, Gumroad/Lemon Squeezy puede hacer un POST a tu servidor:
```json
{
  "event": "order.created",
  "license_key": "ARTE-K7RN-P2XQ-V8HM",
  "email": "cliente@email.com",
  "product": "Arte Pro"
}
```

Tu servidor agrega la clave a la base de datos automáticamente.

---

## Resumen rápido

**Para empezar hoy (sin servidor):**
1. Usa el sistema actual (regex local).
2. Genera claves con el script Node.js.
3. Vende en Gumroad con prefijo `ARTE`.
4. Distribuye las claves por email.

**Cuando quieras más control:**
1. Despliega el servidor Node.js en Railway/Render/Fly.io (gratis para tráfico bajo).
2. Actualiza `API_BASE` en `main.js`.
3. Reemplaza `validateKey` por `activarLicencia`.
4. Listo — ahora tienes control total de licencias.

---

*Última actualización: 2026-06-08*
