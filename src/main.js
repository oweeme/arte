const { invoke } = window.__TAURI__.core;

// ─── Estado ──────────────────────────────────────────────
const cam = { yaw: 0, pitch: 0, zoom: 2.5, viewScale: 1.0, panX: 0, panY: 0 };

// ─── Capas ────────────────────────────────────────────────
let layers         = [{ id: 1, name: 'Capa 1', visible: true, locked: false, strokes: [] }];
let activeLayerIdx = 0;
let layerIdCtr     = 1;

function getActiveLayer() { return layers[activeLayerIdx]; }

let currentStroke  = null;
let isDrawing      = false;
let isOrbiting     = false;
let isPanning      = false;
let strokeIdCtr    = 0;
let needsRender    = true;

let brushType  = 'round';
let thickness  = 8;
let opacity    = 1.0;
let strokeHex  = '#1a1a2e';
let bgHex      = '#f8f6f1';
let drawPlane  = 'xy';
let drawDepth  = 0.0;

// Grid de órbita
let gridAlpha  = 0;
let gridFadeId = null;

// Modo presentación
let presentationMode = false;

// ─── Canvas ───────────────────────────────────────────────
const canvas = document.getElementById('canvas-3d');
const ctx    = canvas.getContext('2d');
// renderCtx apunta al contexto activo durante el renderizado de capas
let renderCtx = ctx;

function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    needsRender   = true;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ─── Proyección perspectiva 3D → pantalla ────────────────
function project(x, y, z) {
    const cy = Math.cos(cam.yaw),  sy = Math.sin(cam.yaw);
    const rx  = x*cy + z*sy;
    const ry  = y;
    const rz  = -x*sy + z*cy;

    const cp  = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const ry2 = ry*cp - rz*sp;
    const rz2 = ry*sp + rz*cp;

    const depth = rz2 + cam.zoom;
    if (depth < 0.01) return null;
    const s = (cam.zoom / depth) * cam.viewScale;

    const hw  = canvas.width  * .5 + cam.panX;
    const hh0 = canvas.height * .5;
    const hv  = canvas.height * .5 + cam.panY;
    return { x: hw + rx*s*hh0, y: hv - ry2*s*hh0, scale: s, depth };
}

// ─── Unproject: rayo desde pantalla → plano 3D ──────────
function unproject(sx, sy) {
    const hh   = canvas.height * .5;
    const ndcX = (sx - (canvas.width  * .5 + cam.panX)) / (hh * cam.viewScale);
    const ndcY = -(sy - (canvas.height * .5 + cam.panY)) / (hh * cam.viewScale);

    const cy = Math.cos(cam.yaw),  sy_ = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp  = Math.sin(cam.pitch);
    const Z  = cam.zoom;

    let s;
    if (drawPlane === 'xy') {
        const A = sy_, B = -cy*sp, C = cy*cp, D = cy*cp;
        const denom = drawDepth + D*Z;
        if (Math.abs(denom) < 1e-4) return null;
        s = (A*ndcX + B*ndcY + C*Z) / denom;
    } else if (drawPlane === 'xz') {
        const denom = drawDepth + sp*Z;
        if (Math.abs(denom) < 1e-4) return null;
        s = (cp*ndcY + sp*Z) / denom;
    } else {
        const A = cy, B = sy_*sp, C = -sy_*cp, D = -sy_*cp;
        const denom = drawDepth + D*Z;
        if (Math.abs(denom) < 1e-4) return null;
        s = (A*ndcX + B*ndcY + C*Z) / denom;
    }
    if (s < 0.01) return null;

    const rx2 = ndcX / s;
    const ry2 = ndcY / s;
    const rz2 = Z * (1/s - 1);
    const wx = cy*rx2 + sy_*sp*ry2 + (-sy_*cp)*rz2;
    const wy = cp*ry2 + sp*rz2;
    const wz = sy_*rx2 + (-cy*sp)*ry2 + cy*cp*rz2;
    return { x: wx, y: wy, z: wz };
}

// ─── Estado de cuadrícula / snap ─────────────────────────
let showGrid  = true;   // cuadrícula siempre visible (G)
let gridSnap  = false;  // snap a cuadrícula (S)
const SNAP_SIZE = 0.25; // unidades de snap

function snapPoint(pt) {
    if (!gridSnap || !pt) return pt;
    return {
        x: Math.round(pt.x / SNAP_SIZE) * SNAP_SIZE,
        y: Math.round(pt.y / SNAP_SIZE) * SNAP_SIZE,
        z: Math.round(pt.z / SNAP_SIZE) * SNAP_SIZE,
    };
}

// Cursor 3D: punto donde caerá el trazo en el plano activo
let cursor3D = null; // { x, y, z } o null

// ─── Grid fade (para gizmo en órbita) ────────────────────
function fadeGrid(dir) {
    if (gridFadeId) cancelAnimationFrame(gridFadeId);
    function step() {
        gridAlpha = Math.max(0, Math.min(1, gridAlpha + dir * 0.07));
        needsRender = true;
        if ((dir > 0 && gridAlpha < 1) || (dir < 0 && gridAlpha > 0))
            gridFadeId = requestAnimationFrame(step);
        else gridFadeId = null;
    }
    gridFadeId = requestAnimationFrame(step);
}

// ─── Cuadrícula 3D persistente (estilo Blender) ──────────
function drawPersistentGrid() {
    if (!showGrid) return;
    ctx.save();

    // Paleta según fondo oscuro/claro
    const isDark = bgIsDark();
    const minorColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const majorColor  = isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.11)';
    const axisXColor  = 'rgba(210,60,60,0.55)';
    const axisZColor  = 'rgba(60,100,220,0.55)';
    const axisYColor  = 'rgba(50,190,70,0.55)';

    const gridSize = 4;
    const minor    = 0.25;
    const major    = 1.0;

    // Plano suelo XZ (siempre visible)
    ctx.lineWidth = 0.6;
    for (let ix = -gridSize; ix <= gridSize; ix += minor) {
        const v = Math.round(ix * 1000) / 1000;
        const isMajor = Math.abs(v % major) < 0.001;
        const isOrigin = Math.abs(v) < 0.001;
        if (isOrigin) continue;
        ctx.strokeStyle = isMajor ? majorColor : minorColor;
        ctx.lineWidth   = isMajor ? 0.8 : 0.5;
        const p1 = project(v, 0, -gridSize), p2 = project(v, 0, gridSize);
        const p3 = project(-gridSize, 0, v), p4 = project(gridSize, 0, v);
        if (p1&&p2) { ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
        if (p3&&p4) { ctx.beginPath(); ctx.moveTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.stroke(); }
    }

    // Ejes X (rojo), Z (azul) en el suelo
    const o  = project(0,0,0);
    const xN = project(-gridSize,0,0), xP = project(gridSize,0,0);
    const zN = project(0,0,-gridSize), zP = project(0,0,gridSize);
    const yP = project(0,gridSize,0);
    if (o && xN && xP) {
        ctx.strokeStyle = axisXColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xN.x,xN.y); ctx.lineTo(xP.x,xP.y); ctx.stroke();
    }
    if (o && zN && zP) {
        ctx.strokeStyle = axisZColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(zN.x,zN.y); ctx.lineTo(zP.x,zP.y); ctx.stroke();
    }
    if (o && yP) {
        ctx.strokeStyle = axisYColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(yP.x,yP.y); ctx.stroke();
    }

    ctx.restore();
}

// ─── Plano de dibujo activo (overlay semi-transparente) ──
function drawActivePlaneOverlay() {
    const s = 4.0;      // tamaño del plano visible
    const step = 0.5;   // paso de la mini-grilla interna
    const d = drawDepth;

    // Colores por plano: XY=azul, XZ=verde, YZ=naranja
    const planeColor = drawPlane === 'xy' ? '92,92,220' :
                       drawPlane === 'xz' ? '60,180,80' : '220,130,40';

    ctx.save();

    // ── Mini-grilla interna del plano ────────────────────────
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = `rgb(${planeColor})`;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([]);
    for (let v = -s; v <= s + 0.001; v += step) {
        let a, b;
        if (drawPlane === 'xy') {
            a = project(v, -s, d); b = project(v,  s, d);
        } else if (drawPlane === 'xz') {
            a = project(v, d, -s); b = project(v,  d, s);
        } else {
            a = project(d, v, -s); b = project(d, v, s);
        }
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
        if (drawPlane === 'xy') {
            a = project(-s, v, d); b = project( s, v, d);
        } else if (drawPlane === 'xz') {
            a = project(-s, d, v); b = project( s, d, v);
        } else {
            a = project(d, -s, v); b = project(d,  s, v);
        }
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    }

    // ── Fill semitransparente ────────────────────────────────
    const corners = [];
    if (drawPlane === 'xy') {
        corners.push(project(-s,-s,d), project(s,-s,d),
                     project(s,s,d),   project(-s,s,d));
    } else if (drawPlane === 'xz') {
        corners.push(project(-s,d,-s), project(s,d,-s),
                     project(s,d,s),   project(-s,d,s));
    } else {
        corners.push(project(d,-s,-s), project(d,s,-s),
                     project(d,s,s),   project(d,-s,s));
    }
    const ok = corners.filter(Boolean);
    if (ok.length < 4) { ctx.restore(); return; }

    ctx.globalAlpha = 0.04;
    ctx.fillStyle   = `rgb(${planeColor})`;
    ctx.beginPath();
    ctx.moveTo(ok[0].x,ok[0].y);
    for (let i=1;i<ok.length;i++) ctx.lineTo(ok[i].x,ok[i].y);
    ctx.closePath();
    ctx.fill();

    // ── Borde del plano ──────────────────────────────────────
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = `rgb(${planeColor})`;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Etiqueta del plano activo en la esquina ──────────────
    const labelPt = ok[0];
    if (labelPt) {
        const planeName = drawPlane === 'xy' ? 'XY' : drawPlane === 'xz' ? 'XZ' : 'YZ';
        const axisName  = drawPlane === 'xy' ? 'Z' : drawPlane === 'xz' ? 'Y' : 'X';
        const labelTxt  = `Plano ${planeName}  ${axisName}=${drawDepth.toFixed(2)}`;
        ctx.globalAlpha = 0.8;
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = `rgb(${planeColor})`;
        ctx.fillText(labelTxt, labelPt.x + 4, labelPt.y - 4);
    }
    ctx.restore();
}

// ─── Cursor 3D — cruza en el punto del plano activo ──────
function drawCursor3D() {
    if (!cursor3D || isDrawing || isPanning || isOrbiting) return;
    const p = project(cursor3D.x, cursor3D.y, cursor3D.z);
    if (!p) return;
    ctx.save();
    const r = Math.max(4, thickness * 0.4 * cam.viewScale);
    ctx.strokeStyle = brushType === 'eraser' ? '#e05050' : strokeHex;
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.stroke();
    // Pequeña cruz
    ctx.beginPath();
    ctx.moveTo(p.x - r*1.5, p.y); ctx.lineTo(p.x + r*1.5, p.y);
    ctx.moveTo(p.x, p.y - r*1.5); ctx.lineTo(p.x, p.y + r*1.5);
    ctx.stroke();
    // Si snap activo, mostrar punto de snap
    if (gridSnap) {
        ctx.fillStyle = strokeHex;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.restore();
}

// ─── Highlight del stroke seleccionado (modo mover/resize)
function drawSelectionHighlight(s) {
    if (!s || !s.puntos || s.puntos.length === 0) return;
    const pts = s.puntos.map(p => project(p.x, p.y, p.z)).filter(Boolean);
    if (pts.length === 0) return;
    ctx.save();

    // Halo naranja sobre el trazo
    ctx.strokeStyle = '#f0a020';
    ctx.lineWidth = (s.thickness || 4) + 8;
    ctx.globalAlpha = 0.28;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) ctx.arc(pts[0].x, pts[0].y, (s.thickness||4)/2+5, 0, Math.PI*2);
    ctx.stroke();

    // Caja delimitadora en pantalla
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const p of pts) {
        if (p.x < minX) minX=p.x; if (p.y < minY) minY=p.y;
        if (p.x > maxX) maxX=p.x; if (p.y > maxY) maxY=p.y;
    }
    const pad = 10;
    const bx = minX-pad, by = minY-pad, bw = maxX-minX+pad*2, bh = maxY-minY+pad*2;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#f0a020';
    ctx.setLineDash([5,3]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);

    // Handles de esquina (cuadraditos blancos con borde naranja)
    const handles = [
        { x: bx,      y: by      },   // 0 TL
        { x: bx + bw, y: by      },   // 1 TR
        { x: bx + bw, y: by + bh },   // 2 BR
        { x: bx,      y: by + bh },   // 3 BL
    ];
    const HS = 7; // mitad del lado del handle
    ctx.globalAlpha = 1;
    for (const h of handles) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(h.x - HS, h.y - HS, HS*2, HS*2);
        ctx.strokeStyle = '#f0a020';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(h.x - HS, h.y - HS, HS*2, HS*2);
    }

    // Handle de rotación (círculo arriba del centro)
    const rh = rotateHandlePos(s);
    if (rh) {
        // Línea de conexión al bbox
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#f0a020';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((bx + bx+bw)/2, by);
        ctx.lineTo(rh.x, rh.y + 10);
        ctx.stroke();
        // Círculo
        ctx.globalAlpha = 1;
        ctx.fillStyle = isRotating ? '#f0a020' : '#fff';
        ctx.strokeStyle = '#f0a020';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 10, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        // Flecha de rotación dentro del círculo
        ctx.strokeStyle = isRotating ? '#fff' : '#f0a020';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 5, -Math.PI*0.8, Math.PI*0.8);
        ctx.stroke();
        // Punta de flecha
        ctx.beginPath();
        ctx.moveTo(rh.x + 4, rh.y - 5);
        ctx.lineTo(rh.x + 7, rh.y - 2);
        ctx.lineTo(rh.x + 4, rh.y + 1);
        ctx.stroke();
    }

    // Etiqueta de acción
    ctx.globalAlpha = 0.85;
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#f0a020';
    const label = isRotating ? 'Girando…' : isResizing ? 'Escalando…' : 'Mover · esquina=escalar · ○=girar';
    ctx.fillText(label, bx, by - 5);
    ctx.restore();
}

// ─── Gizmo de ejes siempre visible ───────────────────────
function drawAxisGizmo() {
    const gx = canvas.width - 60, gy = canvas.height - 60, gLen = 30;
    ctx.save();
    ctx.globalAlpha = 0.85;

    // Fondo circular
    ctx.fillStyle = bgIsDark() ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(gx, gy, gLen + 10, 0, Math.PI*2);
    ctx.fill();

    const gizmoAxes = [
        [1,0,0,'rgba(210,55,55,1)','X'],
        [0,1,0,'rgba(40,185,70,1)','Y'],
        [0,0,1,'rgba(55,110,230,1)','Z'],
    ];
    const op_ = project(0,0,0);
    ctx.lineWidth = 2.5;
    for (const [dx,dy,dz,col,lbl] of gizmoAxes) {
        const ep_ = project(dx*.7, dy*.7, dz*.7);
        if (!ep_ || !op_) continue;
        const ex = ep_.x - op_.x, ey = ep_.y - op_.y;
        const len = Math.hypot(ex,ey) || 1;
        const tx = gx + ex/len * gLen, ty = gy + ey/len * gLen;
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
        // Bolita en el extremo
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = bgIsDark() ? 'white' : col;
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, tx + ex/len*9, ty + ey/len*9);
    }
    ctx.restore();
}

// ─── Etiquetas de coordenadas en la cuadrícula ───────────
function drawGridLabels() {
    if (!showGrid) return;
    const isDark = bgIsDark();
    ctx.save();
    ctx.fillStyle  = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
    ctx.font       = '9px system-ui';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    for (const v of [-2,-1,1,2]) {
        const px = project(v, 0, 0);
        const pz = project(0, 0, v);
        if (px) ctx.fillText(v, px.x, px.y + 10);
        if (pz) ctx.fillText(v, pz.x + 10, pz.y);
    }
    ctx.restore();
}

function bgIsDark() {
    const r = parseInt(bgHex.slice(1,3),16);
    const g = parseInt(bgHex.slice(3,5),16);
    const b = parseInt(bgHex.slice(5,7),16);
    return (r*0.299 + g*0.587 + b*0.114) < 128;
}

// ─── Renderizado ──────────────────────────────────────────
function floatRgba(c) {
    return `rgba(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)},${c[3]})`;
}

// ─── Formas geométricas 3D: Rectángulo y Círculo ────────
// Ambas figuras se almacenan con 2 puntos (inicio y fin) en el plano activo.
// El renderizado proyecta los vértices/muestras al espacio de pantalla.

function shapeCorners(s) {
    // Devuelve los 4 vértices del rectángulo sobre el plano activo
    const a = s.puntos[0], b = s.puntos[1];
    if (s.shapePlane === 'xy') {
        return [
            {x:a.x, y:a.y, z:a.z}, {x:b.x, y:a.y, z:a.z},
            {x:b.x, y:b.y, z:b.z}, {x:a.x, y:b.y, z:b.z},
        ];
    } else if (s.shapePlane === 'xz') {
        return [
            {x:a.x, y:a.y, z:a.z}, {x:b.x, y:a.y, z:a.z},
            {x:b.x, y:b.y, z:b.z}, {x:a.x, y:b.y, z:b.z},
        ];
    } else { // yz
        return [
            {x:a.x, y:a.y, z:a.z}, {x:a.x, y:b.y, z:a.z},
            {x:b.x, y:b.y, z:b.z}, {x:b.x, y:a.y, z:b.z},
        ];
    }
}

function circlePoints(s, samples = 48) {
    // Genera puntos del círculo en el plano activo
    // puntos[0]=centro, puntos[1]=punto en el borde
    const c = s.puntos[0], e = s.puntos[1];
    const pts = [];
    if (s.shapePlane === 'xy') {
        const rx = Math.abs(e.x - c.x), ry = Math.abs(e.y - c.y);
        const r  = Math.max(rx, ry) || 0.01;
        for (let i = 0; i <= samples; i++) {
            const a = (i / samples) * Math.PI * 2;
            pts.push({ x: c.x + Math.cos(a)*r, y: c.y + Math.sin(a)*r, z: c.z });
        }
    } else if (s.shapePlane === 'xz') {
        const rx = Math.abs(e.x - c.x), rz = Math.abs(e.z - c.z);
        const r  = Math.max(rx, rz) || 0.01;
        for (let i = 0; i <= samples; i++) {
            const a = (i / samples) * Math.PI * 2;
            pts.push({ x: c.x + Math.cos(a)*r, y: c.y, z: c.z + Math.sin(a)*r });
        }
    } else { // yz
        const ry = Math.abs(e.y - c.y), rz = Math.abs(e.z - c.z);
        const r  = Math.max(ry, rz) || 0.01;
        for (let i = 0; i <= samples; i++) {
            const a = (i / samples) * Math.PI * 2;
            pts.push({ x: c.x, y: c.y + Math.cos(a)*r, z: c.z + Math.sin(a)*r });
        }
    }
    return pts;
}

function drawShape(s) {
    if (!s.puntos || s.puntos.length < 2) return;
    const rc   = renderCtx;
    const rgba = floatRgba(s.color);
    rc.strokeStyle = rgba;
    rc.lineWidth   = s.thickness;
    rc.lineCap     = 'round';
    rc.lineJoin    = 'round';

    let worldPts;
    if (s.brushType === 'rect')   worldPts = [...shapeCorners(s), shapeCorners(s)[0]];
    else /* circle */             worldPts = circlePoints(s);

    rc.beginPath();
    let started = false;
    for (const pt of worldPts) {
        const p = project(pt.x, pt.y, pt.z);
        if (!p) continue;
        if (!started) { rc.moveTo(p.x, p.y); started = true; }
        else rc.lineTo(p.x, p.y);
    }
    rc.stroke();

    // Relleno con opacidad reducida si hay relleno definido
    if (s.fill) {
        rc.fillStyle = rgba.replace(/[\d.]+\)$/, `${s.color[3] * 0.18})`);
        rc.fill();
    }
}

// ─── Formas: estado de dibujo ────────────────────────────
let shapeStart = null;   // { x, y, z } world point del primer click

// ─── Herramienta Mover / Redimensionar trazo ────────────
let isMoveMode      = false;
let selectedStroke  = null;  // referencia al stroke seleccionado
let moveOrigin      = null;  // { sx, sy } screen coords del inicio del drag
let moveOrigPuntos  = null;  // copia de los puntos originales antes de mover

// Redimensionado
let isResizing      = false;
let resizeHandleIdx = -1;    // 0=TL, 1=TR, 2=BR, 3=BL
let resizeOrigBBox  = null;  // {minX,minY,minZ,maxX,maxY,maxZ} en mundo antes de resize

// Rotación
let isRotating      = false;
let rotateOriginAngle = 0;   // ángulo inicial del drag de rotación (en pantalla, atan2)

// Calcula bounding box en mundo de un stroke
function strokeBBox(s) {
    const pts = s.puntos;
    if (!pts || pts.length === 0) return null;
    let minX=pts[0].x, maxX=pts[0].x;
    let minY=pts[0].y, maxY=pts[0].y;
    let minZ=pts[0].z, maxZ=pts[0].z;
    for (const p of pts) {
        if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
        if (p.y<minY) minY=p.y; if (p.y>maxY) maxY=p.y;
        if (p.z<minZ) minZ=p.z; if (p.z>maxZ) maxZ=p.z;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
}

// Posiciones en pantalla de los 4 handles: TL, TR, BR, BL
function resizeHandlePositions(s) {
    const b = strokeBBox(s);
    if (!b) return [];
    // Proyectar las 8 esquinas del bbox y obtener el quad de pantalla
    const corners3d = [
        { x:b.minX, y:b.minY, z:b.minZ },
        { x:b.maxX, y:b.minY, z:b.minZ },
        { x:b.maxX, y:b.maxY, z:b.maxZ },
        { x:b.minX, y:b.maxY, z:b.maxZ },
    ];
    return corners3d.map(c => project(c.x, c.y, c.z)).filter(Boolean);
}

// Retorna índice del handle hit (0-3) o -1
function hitResizeHandle(sx, sy, s, thresh=10) {
    const handles = resizeHandlePositions(s);
    for (let i=0; i<handles.length; i++) {
        const dx = handles[i].x-sx, dy = handles[i].y-sy;
        if (Math.sqrt(dx*dx+dy*dy) < thresh) return i;
    }
    return -1;
}

// Handle de rotación: círculo por encima del bounding box
function rotateHandlePos(s) {
    const pts = s.puntos.map(p => project(p.x, p.y, p.z)).filter(Boolean);
    if (pts.length === 0) return null;
    let minX=Infinity, minY=Infinity, maxX=-Infinity;
    for (const p of pts) {
        if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x;
        if (p.y<minY) minY=p.y;
    }
    return { x: (minX+maxX)/2, y: minY - 28 };
}

function hitRotateHandle(sx, sy, s, thresh=12) {
    const h = rotateHandlePos(s);
    if (!h) return false;
    const dx = h.x-sx, dy = h.y-sy;
    return Math.sqrt(dx*dx+dy*dy) < thresh;
}

// Rota todos los puntos alrededor del centroide del stroke en el plano XZ (yaw) o XY (pitch)
function rotateStrokePuntos(origPuntos, angleDelta) {
    // Calcular centroide
    let cx=0, cy=0, cz=0;
    for (const p of origPuntos) { cx+=p.x; cy+=p.y; cz+=p.z; }
    cx/=origPuntos.length; cy/=origPuntos.length; cz/=origPuntos.length;
    const cos = Math.cos(angleDelta), sin = Math.sin(angleDelta);
    // Rotar en el plano que tiene más variación (XZ para plano horizontal, XY para vertical)
    const rangeXZ = Math.max(...origPuntos.map(p=>p.x)) - Math.min(...origPuntos.map(p=>p.x))
                  + Math.max(...origPuntos.map(p=>p.z)) - Math.min(...origPuntos.map(p=>p.z));
    const rangeXY = Math.max(...origPuntos.map(p=>p.x)) - Math.min(...origPuntos.map(p=>p.x))
                  + Math.max(...origPuntos.map(p=>p.y)) - Math.min(...origPuntos.map(p=>p.y));
    return origPuntos.map(p => {
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        if (rangeXZ >= rangeXY) {
            // Rotar en XZ (como yaw)
            return { ...p, x: cx + dx*cos - dz*sin, z: cz + dx*sin + dz*cos };
        } else {
            // Rotar en XY (como roll)
            return { ...p, x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos };
        }
    });
}

function isShapeTool() { return brushType === 'rect' || brushType === 'circle'; }

function buildPreviewShape(end) {
    if (!shapeStart || !end) return null;
    return {
        id: 0,
        brushType,
        shapePlane: drawPlane,
        puntos: [shapeStart, end],
        color: hexToColorArray(strokeHex, opacity),
        thickness,
        fill: false,
    };
}

function drawStroke(s) {
    const rc = renderCtx;
    if (s.brushType === 'text') { drawTextStroke(s); return; }
    if (s.brushType === 'rect' || s.brushType === 'circle') { drawShape(s); return; }
    if (!s.puntos || s.puntos.length < 2) return;

    if (s.brushType === 'eraser') {
        rc.save();
        rc.globalCompositeOperation = 'destination-out';
        rc.strokeStyle = 'rgba(0,0,0,1)';
        rc.lineWidth   = s.thickness * 2;
        rc.lineCap     = 'round';
        rc.lineJoin    = 'round';
        rc.beginPath();
        let started = false;
        for (const pt of s.puntos) {
            const p = project(pt.x, pt.y, pt.z);
            if (!p) continue;
            if (!started) { rc.moveTo(p.x, p.y); started = true; } else rc.lineTo(p.x, p.y);
        }
        rc.stroke();
        rc.restore();
        return;
    }

    const rgba = floatRgba(s.color);
    if (s.brushType === 'sketch') {
        rc.globalAlpha = 0.65;
        for (let pass = 0; pass < 2; pass++) {
            rc.beginPath();
            rc.strokeStyle = rgba;
            rc.lineWidth   = Math.max(0.5, s.thickness * 0.25);
            rc.lineCap = rc.lineJoin = 'round';
            let started = false;
            const j = pass * 0.003;
            for (const pt of s.puntos) {
                const p = project(pt.x+(Math.random()-.5)*j, pt.y+(Math.random()-.5)*j, pt.z);
                if (!p) continue;
                if (!started) { rc.moveTo(p.x,p.y); started=true; } else rc.lineTo(p.x,p.y);
            }
            rc.stroke();
        }
        rc.globalAlpha = 1;
    } else {
        rc.beginPath();
        rc.strokeStyle = rgba;
        rc.lineWidth   = s.thickness * (s.brushType==='flat' ? 0.65 : 1.0);
        rc.lineCap     = s.brushType==='flat' ? 'butt' : 'round';
        rc.lineJoin    = s.brushType==='flat' ? 'miter' : 'round';
        let started = false;
        for (const pt of s.puntos) {
            const p = project(pt.x, pt.y, pt.z);
            if (!p) continue;
            if (!started) { rc.moveTo(p.x,p.y); started=true; } else rc.lineTo(p.x,p.y);
        }
        rc.stroke();
    }
}

// ─── Hit test: stroke más cercano al punto de pantalla ───
function hitTestStroke(sx, sy, threshPx = 16) {
    let best = null, bestDist = Infinity;
    for (const layer of layers) {
        if (!layer.visible || layer.locked) continue;
        for (const s of layer.strokes) {
            if (!s.puntos || s.puntos.length === 0) continue;
            const pts = s.puntos.map(p => project(p.x, p.y, p.z)).filter(Boolean);
            for (let i = 0; i < pts.length; i++) {
                // distancia al punto
                const dx = pts[i].x - sx, dy = pts[i].y - sy;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d < bestDist) { bestDist = d; best = s; }
                // distancia al segmento siguiente
                if (i < pts.length - 1) {
                    const ax = pts[i].x, ay = pts[i].y;
                    const bx = pts[i+1].x, by = pts[i+1].y;
                    const abx = bx-ax, aby = by-ay;
                    const len2 = abx*abx + aby*aby;
                    if (len2 > 0) {
                        const t = Math.max(0, Math.min(1, ((sx-ax)*abx + (sy-ay)*aby) / len2));
                        const px = ax + t*abx - sx, py = ay + t*aby - sy;
                        const ds = Math.sqrt(px*px + py*py);
                        if (ds < bestDist) { bestDist = ds; best = s; }
                    }
                }
            }
        }
    }
    return bestDist <= threshPx ? best : null;
}

function drawTextStroke(s) {
    const rc = renderCtx;
    if (!s.puntos || s.puntos.length === 0) return;
    const p = project(s.puntos[0].x, s.puntos[0].y, s.puntos[0].z);
    if (!p) return;
    const fontSize = Math.max(8, Math.round(s.thickness * 2 * p.scale * cam.viewScale));
    rc.fillStyle    = floatRgba(s.color);
    rc.font         = `${fontSize}px system-ui, sans-serif`;
    rc.textBaseline = 'middle';
    rc.fillText(s.textContent || '', p.x, p.y);
}

// Renderiza todas las capas con compositing correcto para el borrador
function render() {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cuadrícula 3D persistente — siempre visible
    drawPersistentGrid();
    // Overlay del plano activo
    drawActivePlaneOverlay();

    // Capas de dibujo
    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        if (!layer.visible) continue;
        const oc    = new OffscreenCanvas(canvas.width, canvas.height);
        renderCtx   = oc.getContext('2d');
        for (const s of layer.strokes) drawStroke(s);
        if (li === activeLayerIdx && currentStroke && currentStroke.puntos && currentStroke.puntos.length >= 2) {
            drawStroke(currentStroke);
        }
        // Preview de forma geométrica mientras se arrastra
        if (li === activeLayerIdx && shapeStart && cursor3D) {
            drawShape(buildPreviewShape(cursor3D));
        }
        renderCtx = ctx;
        ctx.drawImage(oc, 0, 0);
    }

    // Elementos superpuestos: gizmo, etiquetas, cursor 3D
    drawAxisGizmo();
    drawGridLabels();
    drawCursor3D();
    if (isMoveMode && selectedStroke) drawSelectionHighlight(selectedStroke);

    needsRender = false;
}

(function loop() {
    if (needsRender) render();
    requestAnimationFrame(loop);
})();

// ─── Herramienta de texto ─────────────────────────────────
let isTextMode = false;
let textFontSize = 24;  // tamaño de texto independiente del grosor de pincel

function activateTextMode(on) {
    isTextMode = on;
    if (on) { isPanMode = false; isMoveMode = false; }
    document.querySelectorAll('.brush-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.brush === (on ? 'text' : (isMoveMode ? 'move' : (isPanMode ? 'pan' : brushType))));
    });
    // Mostrar/ocultar slider de tamaño de texto
    const tsg = document.getElementById('text-size-group');
    if (tsg) tsg.style.display = on ? 'flex' : 'none';
    updateCanvasCursor();
}

function placeTextInput(sx, sy, worldPt) {
    const old   = document.getElementById('text-input');
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    const inp = document.getElementById('text-input');

    inp.style.cssText = `display:block; left:${sx}px; top:${sy - 20}px; font-size:${Math.max(10, Math.round(textFontSize * cam.viewScale))}px;`;
    inp.value = '';
    setTimeout(() => inp.focus(), 30);

    let committed = false;

    function commit() {
        if (committed) return;
        committed = true;
        const txt = inp.value.trim();
        inp.style.display = 'none';
        inp.value = '';
        if (txt && worldPt) {
            strokeIdCtr++;
            const layer = getActiveLayer();
            if (!layer.locked) {
                layer.strokes.push({
                    id: strokeIdCtr,
                    brushType: 'text',
                    textContent: txt,
                    puntos: [{ x: worldPt.x, y: worldPt.y, z: worldPt.z }],
                    color: hexToColorArray(strokeHex, opacity),
                    thickness: textFontSize,
                });
                needsRender = true;
            }
        }
    }

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { committed = true; inp.style.display='none'; inp.value=''; }
    });
    inp.addEventListener('blur', () => setTimeout(commit, 120));
}

// ─── Touch / Wacom multi-touch ────────────────────────────
// Gestión de dos dedos: pinch → zoom, arrastrar → pan
let touchState = { active: false, lastDist: 0, lastMidX: 0, lastMidY: 0 };

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
        // Un dedo = dibujar (simula pointerdown)
        const t = e.touches[0];
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: t.clientX, clientY: t.clientY,
            pointerId: 1, pointerType: 'touch', isPrimary: true, pressure: 0.5,
            bubbles: true
        }));
    } else if (e.touches.length === 2) {
        // Dos dedos = pinch/pan — cancelar dibujo activo
        touchState.active   = true;
        canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        const t0 = e.touches[0], t1 = e.touches[1];
        touchState.lastDist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
        touchState.lastMidX = (t0.clientX + t1.clientX) * .5;
        touchState.lastMidY = (t0.clientY + t1.clientY) * .5;
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && !touchState.active) {
        // Un dedo moviéndose = pointermove
        const t = e.touches[0];
        canvas.dispatchEvent(new PointerEvent('pointermove', {
            clientX: t.clientX, clientY: t.clientY,
            pointerId: 1, pointerType: 'touch', isPrimary: true, pressure: 0.5,
            bubbles: true
        }));
    } else if (e.touches.length === 2 && touchState.active) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
        const midX = (t0.clientX + t1.clientX) * .5;
        const midY = (t0.clientY + t1.clientY) * .5;

        // Pinch zoom — suavizado para Wacom
        if (touchState.lastDist > 0) {
            const scale = dist / touchState.lastDist;
            cam.viewScale = Math.max(0.08, Math.min(8, cam.viewScale * scale));
            document.getElementById('zoom-value').textContent = Math.round(cam.viewScale*100) + '%';
        }
        // Pan de dos dedos
        cam.panX += midX - touchState.lastMidX;
        cam.panY += midY - touchState.lastMidY;

        touchState.lastDist = dist;
        touchState.lastMidX = midX;
        touchState.lastMidY = midY;
        needsRender = true;
    }
}, { passive: false });

canvas.addEventListener('touchend', e => {
    if (e.touches.length < 2) {
        touchState.active = false;
        // Soltar dedo = pointerup
        canvas.dispatchEvent(new PointerEvent('pointerup', {
            pointerId: 1, pointerType: 'touch', isPrimary: true,
            bubbles: true
        }));
    }
}, { passive: false });

// ─── Modificadores de teclado para pan ────────────────────
// spaceHeld y altHeld activan pan mientras se mantienen presionados.
// Alt es más fiable en Linux/Tauri porque no activa botones del panel.
let spaceHeld = false;
let altHeld   = false;
let isPanMode = false;   // botón de herramienta Mano activo

function panModifierActive() { return spaceHeld || altHeld || isPanMode; }
function updateCanvasCursor() {
    if (panModifierActive()) canvas.style.cursor = 'grab';
    else if (isTextMode) canvas.style.cursor = 'text';
    else canvas.style.cursor = 'none';
}

// Space — prevenir que active botones del panel
window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !isTextMode) {
        e.preventDefault();
        if (!spaceHeld) { spaceHeld = true; updateCanvasCursor(); }
    }
}, true); // captura en fase de captura para mayor prioridad
window.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceHeld = false; updateCanvasCursor(); }
}, true);

// Alt — muy confiable en todos los OS
window.addEventListener('keydown', e => {
    if (e.key === 'Alt' && !e.repeat) { e.preventDefault(); altHeld = true; updateCanvasCursor(); }
}, true);
window.addEventListener('keyup', e => {
    if (e.key === 'Alt') { altHeld = false; updateCanvasCursor(); }
}, true);

// ─── Pointer events ───────────────────────────────────────
const cursorRing = document.getElementById('cursor-ring');

canvas.addEventListener('pointerenter', () => { cursorRing.style.display = isTextMode ? 'none' : 'block'; });
canvas.addEventListener('pointerleave', () => { cursorRing.style.display = 'none'; });

canvas.addEventListener('pointerdown', e => {
    // Pan: botón central, Alt+izq, Space+izq, Shift+der, o herramienta Mano
    const wantPan = e.button === 1
        || (e.button === 0 && (altHeld || spaceHeld || isPanMode))
        || (e.button === 2 && e.shiftKey);
    if (wantPan) {
        isPanning = true;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button !== 0 && e.button !== 2) return;

    // Modo texto: NO capturar pointer para que el input reciba focus
    if (e.button === 0 && isTextMode) {
        const wpt = unproject(e.clientX, e.clientY);
        if (wpt) placeTextInput(e.clientX, e.clientY, wpt);
        return;
    }

    canvas.setPointerCapture(e.pointerId);

    if (e.button === 2) {
        isOrbiting = true;
        fadeGrid(1);
        return;
    }

    // ── Modo Mover / Redimensionar ───────────────────────────
    if (isMoveMode) {
        // Primero: ¿click en handles del stroke ya seleccionado?
        if (selectedStroke) {
            // Handle de rotación
            if (hitRotateHandle(e.clientX, e.clientY, selectedStroke)) {
                isRotating = true;
                isResizing = false;
                moveOrigin = { sx: e.clientX, sy: e.clientY };
                moveOrigPuntos = selectedStroke.puntos.map(p => ({...p}));
                // Ángulo inicial respecto al centroide del stroke proyectado
                const pts = selectedStroke.puntos.map(p => project(p.x, p.y, p.z)).filter(Boolean);
                let cx=0, cy=0;
                for (const p of pts) { cx+=p.x; cy+=p.y; }
                cx/=pts.length; cy/=pts.length;
                rotateOriginAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
                canvas.setPointerCapture(e.pointerId);
                needsRender = true;
                return;
            }
            // Handle de resize
            const hIdx = hitResizeHandle(e.clientX, e.clientY, selectedStroke);
            if (hIdx >= 0) {
                isResizing      = true;
                isRotating      = false;
                resizeHandleIdx = hIdx;
                resizeOrigBBox  = strokeBBox(selectedStroke);
                moveOrigin      = { sx: e.clientX, sy: e.clientY };
                moveOrigPuntos  = selectedStroke.puntos.map(p => ({...p}));
                canvas.setPointerCapture(e.pointerId);
                needsRender = true;
                return;
            }
        }
        // Segundo: ¿click en un trazo?
        const hit = hitTestStroke(e.clientX, e.clientY);
        if (hit) {
            selectedStroke  = hit;
            isResizing      = false;
            moveOrigin      = { sx: e.clientX, sy: e.clientY };
            moveOrigPuntos  = hit.puntos.map(p => ({...p}));
        } else {
            selectedStroke = null;
        }
        needsRender = true;
        return;
    }

    // Dibujar
    const layer = getActiveLayer();
    if (layer.locked) return;

    const wpt = snapPoint(unproject(e.clientX, e.clientY));
    if (!wpt) return;

    // Herramientas de forma geométrica: solo marcar el punto de inicio
    if (isShapeTool()) {
        shapeStart = { x: wpt.x, y: wpt.y, z: wpt.z };
        isDrawing  = true;
        needsRender = true;
        return;
    }

    isDrawing = true;
    strokeIdCtr++;
    currentStroke = {
        id: strokeIdCtr,
        puntos: [{ x: wpt.x, y: wpt.y, z: wpt.z, pressure: e.pressure||0.5 }],
        color: hexToColorArray(strokeHex, opacity),
        thickness,
        brushType,
    };
    needsRender = true;
});

canvas.addEventListener('pointermove', e => {
    const pressure = e.pressure || 0.5;
    const sz = Math.max(6, thickness * (0.5 + pressure));
    cursorRing.style.left        = e.clientX + 'px';
    cursorRing.style.top         = e.clientY + 'px';
    cursorRing.style.width       = sz + 'px';
    cursorRing.style.height      = sz + 'px';
    cursorRing.style.borderColor = brushType === 'eraser' ? '#e05050' : strokeHex;

    // ── Arrastrar / Redimensionar stroke ────────────────────
    if (isMoveMode && selectedStroke && moveOrigin && e.buttons === 1) {
        const dx = e.clientX - moveOrigin.sx;
        const dy = e.clientY - moveOrigin.sy;
        const hh = canvas.height * 0.5;
        const worldScale = hh * cam.viewScale;
        const cyaw = Math.cos(cam.yaw),  syaw = Math.sin(cam.yaw);
        const cpitch = Math.cos(cam.pitch);

        if (isRotating) {
            // Calcular centroide del stroke en pantalla
            const pts = moveOrigPuntos.map(p => project(p.x, p.y, p.z)).filter(Boolean);
            let cx=0, cy=0;
            for (const p of pts) { cx+=p.x; cy+=p.y; }
            cx/=pts.length; cy/=pts.length;
            const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
            const delta = currentAngle - rotateOriginAngle;
            selectedStroke.puntos = rotateStrokePuntos(moveOrigPuntos, delta);
            needsRender = true;
            return;
        } else if (isResizing && resizeOrigBBox) {
            // Escalar: calcular cuánto movió el handle en pantalla
            // y derivar factor de escala relativo al centro del bbox
            const b = resizeOrigBBox;
            const cx3 = (b.minX+b.maxX)/2, cy3 = (b.minY+b.maxY)/2, cz3 = (b.minZ+b.maxZ)/2;
            // Proyectar centro original y esquina opuesta al handle
            const oppIdx = (resizeHandleIdx + 2) % 4;
            const handleWorldCorners = [
                { x:b.minX, y:b.minY, z:b.minZ },
                { x:b.maxX, y:b.minY, z:b.minZ },
                { x:b.maxX, y:b.maxY, z:b.maxZ },
                { x:b.minX, y:b.maxY, z:b.maxZ },
            ];
            const origHandlePt = project(handleWorldCorners[resizeHandleIdx].x, handleWorldCorners[resizeHandleIdx].y, handleWorldCorners[resizeHandleIdx].z);
            const origOppPt    = project(handleWorldCorners[oppIdx].x, handleWorldCorners[oppIdx].y, handleWorldCorners[oppIdx].z);
            if (origHandlePt && origOppPt) {
                // Distancia original handle→opuesta en pantalla
                const origDist = Math.sqrt(
                    (origHandlePt.x-origOppPt.x)**2 + (origHandlePt.y-origOppPt.y)**2
                ) || 1;
                // Distancia nueva: handle se movió (dx,dy)
                const newHx = origHandlePt.x + dx, newHy = origHandlePt.y + dy;
                const newDist = Math.sqrt(
                    (newHx-origOppPt.x)**2 + (newHy-origOppPt.y)**2
                );
                const scale = newDist / origDist;
                // Escalar todos los puntos desde el centro del bbox
                selectedStroke.puntos = moveOrigPuntos.map(p => ({
                    ...p,
                    x: cx3 + (p.x - cx3) * scale,
                    y: cy3 + (p.y - cy3) * scale,
                    z: cz3 + (p.z - cz3) * scale,
                }));
            }
        } else {
            // Mover
            const worldDx =  (dx / worldScale) * cyaw;
            const worldDz =  (dx / worldScale) * syaw;
            const worldDy = -(dy / worldScale) * cpitch;
            selectedStroke.puntos = moveOrigPuntos.map(p => ({
                ...p,
                x: p.x + worldDx,
                y: p.y + worldDy,
                z: p.z + worldDz,
            }));
        }
        needsRender = true;
        return;
    }

    if (isPanning) {
        cam.panX += e.movementX;
        cam.panY += e.movementY;
        needsRender = true;
        cursor3D = null;
        return;
    }
    if (isOrbiting) {
        cam.yaw   -= e.movementX * 0.005;
        cam.pitch -= e.movementY * 0.005;
        cam.pitch  = Math.max(-Math.PI/2+.05, Math.min(Math.PI/2-.05, cam.pitch));
        needsRender = true;
        cursor3D = null;
        updateViewButtons(null);
        return;
    }

    // En modo mover: actualizar cursor según posición
    if (isMoveMode && !isRotating && !isResizing) {
        if (selectedStroke && hitRotateHandle(e.clientX, e.clientY, selectedStroke)) {
            canvas.style.cursor = 'crosshair';
        } else if (selectedStroke && hitResizeHandle(e.clientX, e.clientY, selectedStroke) >= 0) {
            canvas.style.cursor = 'nwse-resize';
        } else if (hitTestStroke(e.clientX, e.clientY)) {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'default';
        }
    }

    // Actualizar cursor 3D (siempre, para previsualizar snap y posición)
    const rawPt = unproject(e.clientX, e.clientY);
    cursor3D = snapPoint(rawPt);
    needsRender = true;

    // Actualizar indicador de coordenadas
    if (cursor3D) {
        document.getElementById('coord-display').textContent =
            `X:${cursor3D.x.toFixed(2)}  Y:${cursor3D.y.toFixed(2)}  Z:${cursor3D.z.toFixed(2)}`;
    }

    if (isDrawing && currentStroke && cursor3D) {
        const last = currentStroke.puntos.at(-1);
        const dx = cursor3D.x-last.x, dy = cursor3D.y-last.y, dz = cursor3D.z-last.z;
        if (dx*dx+dy*dy+dz*dz > 1e-5) {
            currentStroke.puntos.push({ x:cursor3D.x, y:cursor3D.y, z:cursor3D.z, pressure });
            needsRender = true;
        }
    }
});

canvas.addEventListener('pointerup', e => {
    if (isMoveMode) {
        moveOrigin = null;
        isResizing = false;
        isRotating = false;
        resizeHandleIdx = -1;
        resizeOrigBBox = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
        needsRender = true;
        return;
    }
    if (isPanning) {
        isPanning = false;
        updateCanvasCursor();
        try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
        return;
    }
    if (isOrbiting) fadeGrid(-1);

    // Confirmar forma geométrica
    if (isDrawing && isShapeTool() && shapeStart && cursor3D) {
        const end = snapPoint(unproject(e.clientX, e.clientY)) || cursor3D;
        const dx = end.x-shapeStart.x, dy = end.y-shapeStart.y, dz = end.z-shapeStart.z;
        if (dx*dx + dy*dy + dz*dz > 1e-6) {
            strokeIdCtr++;
            getActiveLayer().strokes.push({
                id: strokeIdCtr, brushType, shapePlane: drawPlane,
                puntos: [shapeStart, end],
                color: hexToColorArray(strokeHex, opacity),
                thickness, fill: false,
            });
            addToRecent(strokeHex);
        }
        shapeStart = null;
        isDrawing  = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
        needsRender = true;
        return;
    }

    if (isDrawing && currentStroke && currentStroke.puntos.length >= 2) {
        getActiveLayer().strokes.push(currentStroke);
        addToRecent(strokeHex);
    }
    currentStroke = null;
    isDrawing = isOrbiting = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
    needsRender = true;
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 1/1.06;
    cam.viewScale = Math.max(0.08, Math.min(8, cam.viewScale * factor));
    document.getElementById('zoom-value').textContent = Math.round(cam.viewScale*100) + '%';
    needsRender = true;
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Teclado — atajos generales ───────────────────────────
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; // no interferir con text-input
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); }
        return;
    }
    switch (e.key.toLowerCase()) {
        case '1': activateBrush('round');   break;
        case '2': activateBrush('flat');    break;
        case '3': activateBrush('sketch');  break;
        case '4': activateTextMode(!isTextMode); break;
        case 'e': activateBrush('eraser');       break;
        case 'h': activatePanTool(!isPanMode);   break;
        case 'm': activateMoveMode(!isMoveMode); break;
        case 'q': activateBrush('rect');          break;
        case 'c': activateBrush('circle');  break;
        case 'g': showGrid = !showGrid; updateGridUI(); needsRender = true; break;
        case 's': gridSnap = !gridSnap; updateGridUI(); break;
        case 'r': resetCamera(); updateViewButtons(null); break;
        // Vistas rápidas — igual que Blender numpad
        case 'numpad1': case 'f1': goToView('front');       break;
        case 'numpad3': case 'f3': goToView('side');        break;
        case 'numpad7': case 'f7': goToView('top');         break;
        case 'numpad5': case 'f5': goToView('perspective'); break;
        case 'numpad0': case 'f4': goToView('iso');         break;
        case 'tab': e.preventDefault(); togglePresentation(); break;
        case 'escape':
            if (isTextMode) activateTextMode(false);
            else if (isMoveMode) { activateMoveMode(false); }
            else if (isPanMode) activatePanTool(false);
            else if (shapeStart) { shapeStart = null; isDrawing = false; needsRender = true; }
            else if (presentationMode) togglePresentation();
            break;
        case '+': case '=': zoomStep(1.1);  break;
        case '-':            zoomStep(1/1.1); break;
        // [ ] mueven el plano de dibujo en profundidad (pasos de 0.25 unidades)
        case '[': stepDepth(-0.25); break;
        case ']': stepDepth( 0.25); break;
    }
});

function stepDepth(delta) {
    drawDepth = Math.round((drawDepth + delta) * 100) / 100;
    // Sincronizar slider (rango -200..200, valor = drawDepth*100)
    const slider = document.getElementById('depth-slider');
    const display = document.getElementById('depth-display');
    if (slider) slider.value = drawDepth * 100;
    if (display) display.textContent = drawDepth.toFixed(2);
    needsRender = true;
}

function zoomStep(factor) {
    cam.viewScale = Math.max(0.08, Math.min(8, cam.viewScale * factor));
    document.getElementById('zoom-value').textContent = Math.round(cam.viewScale*100) + '%';
    needsRender = true;
}

function resetCamera() {
    cam.yaw=0; cam.pitch=0; cam.zoom=2.5; cam.viewScale=1.0;
    cam.panX=0; cam.panY=0;
    document.getElementById('zoom-value').textContent='100%';
    needsRender=true;
}

function activatePanTool(on) {
    isPanMode = on;
    if (on) { isMoveMode = false; selectedStroke = null; }
    document.querySelectorAll('.brush-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.brush === (isPanMode ? 'pan' : (isMoveMode ? 'move' : (isTextMode ? 'text' : brushType))))
    );
    updateCanvasCursor();
}

function activateMoveMode(on) {
    isMoveMode = on;
    if (on) {
        isPanMode = false;
        activateTextMode(false);
        selectedStroke = null;
    }
    canvas.style.cursor = on ? 'default' : 'none';
    document.querySelectorAll('.brush-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.brush === (isMoveMode ? 'move' : (isPanMode ? 'pan' : (isTextMode ? 'text' : brushType))))
    );
}

// ─── Vistas rápidas 3D ────────────────────────────────────
const VIEWS = {
    //              yaw              pitch        viewScale  label
    perspective: { yaw: -0.6,       pitch: -0.4, vs: 1.0,  label: '3D'  },
    front:       { yaw:  0,         pitch:  0,   vs: 1.0,  label: 'Frente' },
    side:        { yaw:  Math.PI/2, pitch:  0,   vs: 1.0,  label: 'Lateral' },
    top:         { yaw:  0,         pitch: -Math.PI/2 + 0.05, vs: 1.0, label: 'Superior' },
    iso:         { yaw:  Math.PI/4, pitch: -0.6155, vs: 1.0, label: 'ISO' }, // ángulo isométrico
};

let viewAnimId = null;

// Plano sugerido por cada vista
const VIEW_PLANE = {
    front: 'xy',   // frente → dibujas en la pared XY (Z es profundidad)
    side:  'yz',   // lateral → dibujas en la pared YZ (X es profundidad)
    top:   'xz',   // superior → dibujas en el suelo XZ (Y es profundidad)
    perspective: null, // 3D libre → no cambia el plano
    iso: null,         // iso libre → no cambia el plano
};

function setDrawPlane(plane) {
    drawPlane = plane;
    document.querySelectorAll('.plane-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.plane === plane)
    );
}

function goToView(name) {
    const target = VIEWS[name];
    if (!target) return;
    if (viewAnimId) cancelAnimationFrame(viewAnimId);

    // Auto-switch plano de dibujo según vista
    const suggestedPlane = VIEW_PLANE[name];
    if (suggestedPlane) setDrawPlane(suggestedPlane);

    const startYaw   = cam.yaw;
    const startPitch = cam.pitch;
    const startVS    = cam.viewScale;
    const endYaw     = target.yaw;
    const endPitch   = target.pitch;
    const endVS      = target.vs;
    const duration   = 380; // ms
    const t0         = performance.now();

    // Normalizar diferencia de yaw al camino más corto
    let dYaw = endYaw - startYaw;
    while (dYaw >  Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;

    function step(now) {
        const t  = Math.min(1, (now - t0) / duration);
        const k  = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // ease-in-out cuadrático
        cam.yaw   = startYaw   + dYaw                   * k;
        cam.pitch = startPitch + (endPitch - startPitch) * k;
        cam.viewScale = startVS + (endVS - startVS)     * k;
        needsRender = true;
        if (t < 1) viewAnimId = requestAnimationFrame(step);
        else { viewAnimId = null; updateViewButtons(name); }
    }
    viewAnimId = requestAnimationFrame(step);
    updateViewButtons(name);
}

function updateViewButtons(activeName) {
    document.querySelectorAll('.view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === activeName);
    });
}

// Inicializar botones de vista
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
});

// Atajos numpad / números para vistas (sin Ctrl)
// Se añaden al listener de keydown existente más abajo

function togglePresentation() {
    presentationMode = !presentationMode;
    document.body.classList.toggle('presentation', presentationMode);
    if (presentationMode) fadeGrid(1);
    else fadeGrid(-1);
}

// ─── Helpers ──────────────────────────────────────────────
function hexToColorArray(hex, a) {
    return [
        parseInt(hex.slice(1,3),16)/255,
        parseInt(hex.slice(3,5),16)/255,
        parseInt(hex.slice(5,7),16)/255,
        a,
    ];
}

function undo() {
    const layer = getActiveLayer();
    if (layer.strokes.length > 0) { layer.strokes.pop(); needsRender=true; }
}

// ─── Capas: lógica ────────────────────────────────────────
function addLayer() {
    layerIdCtr++;
    layers.push({ id: layerIdCtr, name: `Capa ${layerIdCtr}`, visible: true, locked: false, strokes: [] });
    activeLayerIdx = layers.length - 1;
    updateLayersUI();
    needsRender = true;
}

function deleteLayer(idx) {
    if (layers.length <= 1) return; // mínimo 1 capa
    layers.splice(idx, 1);
    activeLayerIdx = Math.min(activeLayerIdx, layers.length - 1);
    updateLayersUI();
    needsRender = true;
}

function toggleLayerVisibility(idx) {
    layers[idx].visible = !layers[idx].visible;
    updateLayersUI();
    needsRender = true;
}

function toggleLayerLock(idx) {
    layers[idx].locked = !layers[idx].locked;
    updateLayersUI();
}

function setActiveLayer(idx) {
    activeLayerIdx = idx;
    updateLayersUI();
}

function moveLayerUp(idx) {
    if (idx <= 0) return;
    [layers[idx-1], layers[idx]] = [layers[idx], layers[idx-1]];
    if (activeLayerIdx === idx) activeLayerIdx = idx-1;
    else if (activeLayerIdx === idx-1) activeLayerIdx = idx;
    updateLayersUI();
    needsRender = true;
}

function moveLayerDown(idx) {
    if (idx >= layers.length-1) return;
    [layers[idx], layers[idx+1]] = [layers[idx+1], layers[idx]];
    if (activeLayerIdx === idx) activeLayerIdx = idx+1;
    else if (activeLayerIdx === idx+1) activeLayerIdx = idx;
    updateLayersUI();
    needsRender = true;
}

function updateLayersUI() {
    const list = document.getElementById('layers-list');
    list.innerHTML = '';
    // Mostrar de arriba abajo (último layer = más arriba en UI)
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const row   = document.createElement('div');
        row.className = 'layer-row' + (i === activeLayerIdx ? ' active' : '');
        row.innerHTML = `
            <button class="layer-vis" title="${layer.visible ? 'Ocultar' : 'Mostrar'}">${layer.visible ? '👁' : '🚫'}</button>
            <button class="layer-lock" title="${layer.locked ? 'Desbloquear' : 'Bloquear'}">${layer.locked ? '🔒' : '🔓'}</button>
            <span class="layer-name" title="${layer.name}">${layer.name}</span>
            <div class="layer-actions">
                <button class="layer-up" title="Subir">↑</button>
                <button class="layer-down" title="Bajar">↓</button>
                <button class="layer-del" title="Eliminar capa">✕</button>
            </div>
        `;
        row.querySelector('.layer-vis').addEventListener('click', e => { e.stopPropagation(); toggleLayerVisibility(i); });
        row.querySelector('.layer-lock').addEventListener('click', e => { e.stopPropagation(); toggleLayerLock(i); });
        row.querySelector('.layer-up').addEventListener('click', e => { e.stopPropagation(); moveLayerUp(i); });
        row.querySelector('.layer-down').addEventListener('click', e => { e.stopPropagation(); moveLayerDown(i); });
        row.querySelector('.layer-del').addEventListener('click', e => { e.stopPropagation(); deleteLayer(i); });
        row.addEventListener('click', () => setActiveLayer(i));
        list.appendChild(row);
    }
    // Etiqueta de capa activa en panel de acción
    const lbl = document.getElementById('active-layer-label');
    if (lbl) lbl.textContent = getActiveLayer().name;
}

// ─── Paleta de color siempre visible ──────────────────────
const QUICK_COLORS = [
    '#1a1a2e','#16213e','#0f3460','#533483',
    '#e94560','#f5a623','#f8f6f1','#ffffff',
    '#2ecc71','#1abc9c','#3498db','#9b59b6',
    '#e74c3c','#e67e22','#f1c40f','#95a5a6',
    '#2c3e50','#7f8c8d','#bdc3c7','#000000',
];
const MAX_RECENT = 10;
let recentColors = [];

function initQuickPalette() {
    const qp = document.getElementById('quick-palette');
    qp.innerHTML = '';
    for (const hex of QUICK_COLORS) {
        const chip = document.createElement('div');
        chip.className = 'palette-chip' + (hex === strokeHex ? ' selected' : '');
        chip.style.background = hex;
        chip.title = hex;
        chip.addEventListener('click', () => setStrokeColor(hex));
        qp.appendChild(chip);
    }
}

function updateRecentPalette() {
    const rp = document.getElementById('recent-palette');
    rp.innerHTML = '';
    for (const hex of recentColors) {
        const chip = document.createElement('div');
        chip.className = 'palette-chip' + (hex === strokeHex ? ' selected' : '');
        chip.style.background = hex;
        chip.title = hex;
        chip.addEventListener('click', () => setStrokeColor(hex));
        rp.appendChild(chip);
    }
}

function setStrokeColor(hex) {
    strokeHex = hex;
    document.getElementById('stroke-color').value = hex;
    document.getElementById('stroke-swatch').style.background = hex;
    // Marcar seleccionado en ambas paletas
    document.querySelectorAll('#quick-palette .palette-chip').forEach(c => {
        c.classList.toggle('selected', c.style.background === hexToRgbStr(hex) || c.title === hex);
    });
    document.querySelectorAll('#recent-palette .palette-chip').forEach(c => {
        c.classList.toggle('selected', c.title === hex);
    });
}

function addToRecent(hex) {
    if (recentColors[0] === hex) return;
    recentColors = [hex, ...recentColors.filter(c => c !== hex)].slice(0, MAX_RECENT);
    updateRecentPalette();
}

// Convierte #rrggbb → "rgb(r, g, b)" para comparación con el estilo computado
function hexToRgbStr(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${r}, ${g}, ${b})`;
}

// ─── Controles del panel izquierdo ───────────────────────
function activateBrush(type) {
    if (type === 'text') { activateTextMode(!isTextMode); return; }
    if (type === 'pan')  { activatePanTool(!isPanMode); return; }
    if (type === 'move') { activateMoveMode(!isMoveMode); return; }
    activateTextMode(false);
    isPanMode = false;
    isMoveMode = false;
    selectedStroke = null;
    brushType = type;
    document.querySelectorAll('.brush-btn').forEach(b => b.classList.toggle('active', b.dataset.brush === type));
    updateCanvasCursor();
}

document.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', () => activateBrush(btn.dataset.brush));
});

document.querySelectorAll('.plane-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.plane-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        drawPlane = btn.dataset.plane;
    });
});

const thicknessSlider = document.getElementById('thickness-slider');
const sizeDisplay     = document.getElementById('size-display');
thicknessSlider.addEventListener('input', e => {
    thickness = parseFloat(e.target.value);
    sizeDisplay.textContent = Math.round(thickness);
});

document.getElementById('opacity-slider').addEventListener('input', e => {
    opacity = e.target.value / 100;
});

document.getElementById('text-size-slider').addEventListener('input', e => {
    textFontSize = parseInt(e.target.value);
    document.getElementById('text-size-display').textContent = textFontSize;
});

document.getElementById('depth-slider').addEventListener('input', e => {
    drawDepth = parseFloat(e.target.value) / 100;
    document.getElementById('depth-display').textContent = drawDepth.toFixed(2);
    needsRender = true;
});

document.getElementById('stroke-color').addEventListener('input', e => {
    setStrokeColor(e.target.value);
});
document.getElementById('stroke-color').addEventListener('change', e => {
    addToRecent(e.target.value);
});

document.getElementById('bg-color').addEventListener('input', e => {
    bgHex = e.target.value;
    document.getElementById('bg-swatch').style.background = bgHex;
    needsRender = true;
});

// ─── Botones del panel de acciones ───────────────────────
document.getElementById('btn-undo').addEventListener('click', undo);

document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('¿Limpiar la capa activa?')) {
        getActiveLayer().strokes = [];
        needsRender = true;
    }
});

document.getElementById('btn-save').addEventListener('click', async () => {
    const allStrokes = layers.flatMap(l => l.strokes);
    try { await invoke('guardar_archivo_arte', { trazos: allStrokes }); }
    catch (e) { if (e!=='Guardado cancelado') console.error(e); }
});

document.getElementById('btn-load').addEventListener('click', async () => {
    try {
        const loaded = await invoke('cargar_archivo_arte');
        if (loaded?.length > 0) {
            layers = [{ id: 1, name: 'Capa 1', visible: true, locked: false, strokes: loaded }];
            activeLayerIdx = 0;
            layerIdCtr = 1;
            updateLayersUI();
            needsRender = true;
        }
    } catch (e) { if (e!=='Carga cancelada') console.error(e); }
});

// ─── Licencia ────────────────────────────────────────────────
// Validación local simple: la clave debe ser ARTE-XXXX-XXXX-XXXX
// Para un sistema real, valida contra tu servidor.
const LICENSE_KEY = 'arte_licensed_v1';

function validateKey(key) {
    if (!key) return false;
    const k = key.trim().toUpperCase();
    // Formato: ARTE-XXXX-XXXX-XXXX  (4+4+4+4 alfanumérico)
    return /^ARTE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k);
}

function isLicensed() {
    return localStorage.getItem(LICENSE_KEY) === 'true';
}

function applyLicenseUI() {
    const licensed = isLicensed();
    const exportBtns = [
        document.getElementById('btn-export-jpg'),
        document.getElementById('btn-export-svg'),
        document.getElementById('btn-export-obj'),
    ];
    exportBtns.forEach(btn => {
        btn.classList.toggle('btn-locked', !licensed);
        btn.title = licensed
            ? btn.dataset.titleOrig || btn.title
            : 'Se requiere licencia — abre Ayuda (?) para activar';
    });
    const title  = document.getElementById('license-title');
    const desc   = document.getElementById('license-desc');
    const input  = document.getElementById('license-input');
    const status = document.getElementById('license-status');
    if (licensed) {
        if (title)  title.textContent  = '✅ Licencia activa';
        if (desc)   desc.textContent   = 'Exportar JPG, SVG y OBJ habilitado. ¡Gracias por apoyar Arte!';
        if (input)  input.style.display = 'none';
        if (status) { status.textContent = ''; status.className = 'license-status'; }
    } else {
        if (title)  title.textContent  = '🔐 Versión Demo';
        if (desc)   desc.textContent   = 'En modo demo puedes dibujar, guardar y abrir. Ingresa tu licencia para habilitar exportar JPG, SVG y OBJ.';
        if (input)  input.style.display = '';
    }
}

document.getElementById('license-input')?.addEventListener('input', e => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    e.target.value = raw;
    const status = document.getElementById('license-status');
    if (validateKey(raw)) {
        localStorage.setItem(LICENSE_KEY, 'true');
        status.textContent = '✓ Licencia válida — exportar habilitado';
        status.className   = 'license-status ok';
        applyLicenseUI();
    } else if (raw.length > 0) {
        status.textContent = 'Formato: ARTE-XXXX-XXXX-XXXX';
        status.className   = 'license-status err';
    } else {
        status.textContent = '';
        status.className   = 'license-status';
    }
});

function requireLicense(fn) {
    if (!isLicensed()) {
        document.getElementById('modal-about').classList.add('open');
        return;
    }
    fn();
}

document.getElementById('btn-export-jpg').addEventListener('click', () => {
    requireLicense(() => {
        const savedCursor = cursorRing.style.display;
        cursorRing.style.display = 'none';
        needsRender = true;
        render();
        canvas.toBlob(async blob => {
            const buf   = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buf));
            try { await invoke('guardar_imagen', { data: bytes, extension: 'jpg' }); }
            catch (e) { if (e!=='Exportación cancelada') console.error(e); }
            cursorRing.style.display = savedCursor;
        }, 'image/jpeg', 0.95);
    });
});

function exportarSVG() {
    const W = canvas.width, H = canvas.height;
    // Color SVG seguro: siempre rgb() + opacity separado
    function svgColor(color) {
        if (!Array.isArray(color) || color.length < 4) return { stroke: '#000', opacity: '1' };
        const r = Math.round((color[0]||0) * 255);
        const g = Math.round((color[1]||0) * 255);
        const b = Math.round((color[2]||0) * 255);
        const a = isFinite(color[3]) ? color[3] : 1;
        return { stroke: `rgb(${r},${g},${b})`, opacity: a.toFixed(3) };
    }
    // Convierte array de puntos pantalla a string de path SVG
    function ptsToPath(pts) {
        const valid = pts.filter(p => p && isFinite(p.x) && isFinite(p.y));
        if (valid.length < 2) return null;
        return valid.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    }

    let body = `  <rect width="${W}" height="${H}" fill="${bgHex}"/>\n`;
    for (const layer of layers) {
        if (!layer.visible) continue;
        body += `  <!-- capa: ${layer.name} -->\n`;
        for (const s of layer.strokes) {
            // Saltar borrador y texto (no tienen representación vectorial directa)
            if (!s || !s.puntos || s.brushType === 'eraser') continue;
            const { stroke, opacity } = svgColor(s.color);
            const sw = Math.max(0.5, s.thickness || 2);

            if (s.brushType === 'text') {
                const p = project(s.puntos[0].x, s.puntos[0].y, s.puntos[0].z);
                if (!p || !isFinite(p.x)) continue;
                const fs = Math.max(8, Math.round(sw * 2 * p.scale * cam.viewScale));
                const txt = (s.textContent || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                body += `  <text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-size="${fs}" fill="${stroke}" opacity="${opacity}" font-family="system-ui,sans-serif">${txt}</text>\n`;
                continue;
            }

            let d;
            if (s.brushType === 'rect') {
                const corners = shapeCorners(s);
                const pts = corners.map(c => project(c.x, c.y, c.z));
                d = ptsToPath(pts);
                if (d) d += ' Z';
            } else if (s.brushType === 'circle') {
                const pts = circlePoints(s, 64).map(p => project(p.x, p.y, p.z));
                d = ptsToPath(pts);
                if (d) d += ' Z';
            } else {
                const pts = s.puntos.map(p => project(p.x, p.y, p.z));
                d = ptsToPath(pts);
            }
            if (!d) continue;
            body += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
        }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">\n${body}</svg>`;
}

document.getElementById('btn-export-svg').addEventListener('click', async () => {
    requireLicense(async () => {
        const svgStr = exportarSVG();
        const bytes = Array.from(new TextEncoder().encode(svgStr));
        try { await invoke('guardar_imagen', { data: bytes, extension: 'svg' }); }
        catch (e) { if (e !== 'Exportación cancelada') console.error('SVG export error:', e); }
    });
});

document.getElementById('btn-export-obj').addEventListener('click', async () => {
    requireLicense(async () => {
        const allStrokes = layers.flatMap(l => l.strokes);
        try { await invoke('exportar_formato', { trazos: allStrokes, formato: 'obj' }); }
        catch (e) { if (e!=='Exportación cancelada') console.error(e); }
    });
});

document.getElementById('btn-presentation').addEventListener('click', togglePresentation);

// Botones Grid y Snap
document.getElementById('btn-grid').addEventListener('click', () => {
    showGrid = !showGrid; updateGridUI(); needsRender = true;
});
document.getElementById('btn-snap').addEventListener('click', () => {
    gridSnap = !gridSnap; updateGridUI();
});

// Botón nueva capa
document.getElementById('btn-add-layer').addEventListener('click', addLayer);

// Modal acerca de
const modalAbout = document.getElementById('modal-about');
document.getElementById('btn-about').addEventListener('click', () => modalAbout.classList.add('open'));
document.getElementById('btn-close-about').addEventListener('click', () => modalAbout.classList.remove('open'));
modalAbout.addEventListener('click', e => { if (e.target===modalAbout) modalAbout.classList.remove('open'); });

// Aplicar estado de licencia al inicio
applyLicenseUI();

// Hint presentación
const presHint = document.createElement('div');
presHint.id = 'presentation-hint';
presHint.textContent = 'Modo Presentación  •  Tab para salir  •  Clic der → orbitar  •  Rueda / Pinch → zoom';
document.body.appendChild(presHint);

// ─── Paneles arrastrables ─────────────────────────────────
// Permite mover cualquier panel glass con data-draggable="true"
// La posición se guarda en localStorage para persistir entre sesiones.
function makeDraggable(el) {
    const storageKey = 'panel-pos-' + el.id;

    // Restaurar posición guardada
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved) {
            el.style.left   = saved.x + 'px';
            el.style.top    = saved.y + 'px';
            el.style.right  = 'unset';
            el.style.bottom = 'unset';
            el.style.transform = 'none';
        }
    } catch (_) {}

    // Handle de arrastre: la cabecera o el mismo panel si no hay cabecera
    const handle = el.querySelector('.drag-handle') || el;
    handle.style.cursor = 'grab';

    let ox = 0, oy = 0, dragging = false;

    handle.addEventListener('pointerdown', e => {
        // Solo botón izquierdo y no sobre controles interactivos
        if (e.button !== 0) return;
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT'
            || e.target.tagName === 'LABEL' || e.target.classList.contains('palette-chip')) return;

        dragging = true;
        const rect = el.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        handle.style.cursor = 'grabbing';
        el.style.transition = 'none';
        el.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    handle.addEventListener('pointermove', e => {
        if (!dragging) return;
        const nx = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  e.clientX - ox));
        const ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - oy));
        el.style.left   = nx + 'px';
        el.style.top    = ny + 'px';
        el.style.right  = 'unset';
        el.style.bottom = 'unset';
        el.style.transform = 'none';
        e.stopPropagation();
    });

    handle.addEventListener('pointerup', e => {
        if (!dragging) return;
        dragging = false;
        handle.style.cursor = 'grab';
        // Persistir posición
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                x: parseInt(el.style.left),
                y: parseInt(el.style.top),
            }));
        } catch (_) {}
        e.stopPropagation();
    });
}

// ─── Actualizar indicadores de grid/snap ─────────────────
function updateGridUI() {
    const gb = document.getElementById('btn-grid');
    const sb = document.getElementById('btn-snap');
    if (gb) gb.classList.toggle('active', showGrid);
    if (sb) sb.classList.toggle('active', gridSnap);
}

// Inicializar UI
updateLayersUI();
initQuickPalette();
updateRecentPalette();
updateGridUI();

// Vista inicial en perspectiva
cam.yaw   = VIEWS.perspective.yaw;
cam.pitch = VIEWS.perspective.pitch;
updateViewButtons('perspective');

// Activar arrastre en paneles marcados
makeDraggable(document.getElementById('color-dock'));
makeDraggable(document.getElementById('layers-panel'));
makeDraggable(document.getElementById('tool-panel'));
