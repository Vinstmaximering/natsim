// Ritläges-tillståndsmaskin för hinder.
// Importeras av interactions.js (event-hantering) och toolbar.js (verktygsval).
// Cirkulär import med leaflet-setup.js är OK – alla värden används i funktioner,
// aldrig vid modul-initialisering.

import { map, ENtoLatLng, latLngToEN } from './leaflet-setup.js';
import { getState }                    from '../state/store.js';
import { addObstacle, getObstacles }   from '../state/obstacles.js';

const SNAP_PX = 15; // pixelradie för snap

let _mode      = 'idle'; // 'idle' | 'drawing-polygon' | 'drawing-line'
let _points    = [];     // [{E,N}] placerade punkter
let _mouseEN   = null;   // aktuell musposition i världskoordinater
let _snapTarget = null;  // snap-mål {E,N} eller null

// ── Läsning av ritläge ────────────────────────────────────────────────────────
export const getDrawMode = () => _mode;
export const isDrawing   = () => _mode !== 'idle';

// ── Starta / avbryta / slutföra ───────────────────────────────────────────────
export function startPolygonDraw() {
  _mode = 'drawing-polygon'; _points = []; _mouseEN = null; _snapTarget = null;
}

export function startLineDraw() {
  _mode = 'drawing-line';    _points = []; _mouseEN = null; _snapTarget = null;
}

export function cancelDraw() {
  _mode = 'idle'; _points = []; _mouseEN = null; _snapTarget = null;
}

// Returnerar true om hindret sparades, false om för få punkter
export function completeDraw() {
  if (_mode === 'drawing-polygon' && _points.length >= 3) {
    addObstacle({ type: 'polygon', points: _points.map(p => [p.E, p.N]) });
    _mode = 'idle'; _points = [];
    return true;
  }
  if (_mode === 'drawing-line' && _points.length === 2) {
    addObstacle({ type: 'line', points: _points.map(p => [p.E, p.N]) });
    _mode = 'idle'; _points = [];
    return true;
  }
  return false;
}

// Hantera ett kartkick – returnerar {done: bool}
// done=true innebär att ritningen är klar (linje efter 2:a punkt)
export function handleMapClick(latlng) {
  const en = _snapTarget || latLngToEN(latlng);
  _points.push({ E: en.E, N: en.N });

  if (_mode === 'drawing-line' && _points.length === 2) {
    completeDraw();
    return { done: true };
  }
  return { done: false };
}

// Uppdatera musposition + snap-mål (kallas vid varje mousemove i drawing-läge)
export function updateMousePos(latlng, containerPoint) {
  _mouseEN    = latLngToEN(latlng);
  _snapTarget = _findSnap(containerPoint.x, containerPoint.y);
}

// ── Snap-logik ────────────────────────────────────────────────────────────────
function _findSnap(px, py) {
  if (!map) return null;
  const { pts } = getState();

  // Snap till befintliga mät-punkter
  for (const pt of pts) {
    const p = map.latLngToContainerPoint(ENtoLatLng(pt.E, pt.N));
    if (Math.hypot(p.x - px, p.y - py) < SNAP_PX) return { E: pt.E, N: pt.N };
  }

  // Snap till hörn av befintliga hinder
  for (const obs of getObstacles()) {
    for (const [E, N] of obs.points) {
      const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
      if (Math.hypot(p.x - px, p.y - py) < SNAP_PX) return { E, N };
    }
  }

  return null;
}

// ── Canvas-förhandsvisning ────────────────────────────────────────────────────
export function drawPreview(ctx) {
  if (!map || (_mode === 'idle')) return;
  if (_points.length === 0 && !_mouseEN) return;

  const toPixel = ({ E, N }) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  };

  const pixPts = _points.map(toPixel);

  // Placerade segment
  if (pixPts.length >= 1) {
    ctx.beginPath();
    ctx.moveTo(pixPts[0].x, pixPts[0].y);
    for (let i = 1; i < pixPts.length; i++) ctx.lineTo(pixPts[i].x, pixPts[i].y);
    ctx.strokeStyle = 'rgba(255,140,0,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  // Punktmarkörer för placerade hörn
  for (const p of pixPts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255,140,0,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Förhandslinje från sista punkt till musen (eller snap-mål)
  const target = _snapTarget || _mouseEN;
  if (target && pixPts.length >= 1) {
    const pp   = toPixel(target);
    const last = pixPts[pixPts.length - 1];
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pp.x,   pp.y);
    ctx.strokeStyle = 'rgba(255,140,0,0.45)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Polygon: visa även stänglinje mot startpunkt (om ≥2 hörn)
    if (_mode === 'drawing-polygon' && _points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pp.x, pp.y);
      ctx.lineTo(pixPts[0].x, pixPts[0].y);
      ctx.strokeStyle = 'rgba(255,140,0,0.22)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Snap-indikator (grön ring + punkt)
  if (_snapTarget) {
    const pp = toPixel(_snapTarget);
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
  }
}
