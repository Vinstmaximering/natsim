// Node-redigering för hinder: flytta/infoga/ta bort hörn.
// Importeras av interactions.js (event-hantering) och leaflet-setup.js (snap-rendering).
// Importerar INTE leaflet-setup.js – undviker cirkulär dep. Karthjälpare tas som parametrar.
import { getObstacles, updateObstacle } from '../state/obstacles.js';
import { saveUndo }                      from '../state/undo.js';

export const HANDLE_HIT_PX = 8;    // pixel-tolerans för handtag-träff
export const EDGE_HIT_PX   = 10;  // pixel-tolerans för kant-träff (dubbelklick → infoga)
const        SNAP_PX       = 15;  // pixel-tolerans för snap (identisk med ritning)

let _dragObsId  = null;
let _dragPtIdx  = null;
let _snapTarget = null;   // {E, N} | null
let _isDragging = false;
let _dragMoved  = false;  // saveUndo triggas bara vid första rörelse

export const isDraggingNode    = () => _isDragging;
export const getDragSnapTarget = () => _snapTarget;

// ── Hit-tester ────────────────────────────────────────────────────────────────

export function getHandlesForObstacle(obs, map, ENtoLatLng) {
  if (!map || !obs?.points) return [];
  return obs.points.map(([E, N], i) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y, pointIndex: i };
  });
}

// Returnerar pointIndex om px,py träffar ett hörn-handtag inom HANDLE_HIT_PX, annars null.
export function hitTestHandle(px, py, obs, map, ENtoLatLng) {
  for (const h of getHandlesForObstacle(obs, map, ENtoLatLng)) {
    if (Math.hypot(h.x - px, h.y - py) <= HANDLE_HIT_PX) return h.pointIndex;
  }
  return null;
}

// Returnerar {edgeIndex, insertPoint:{E,N}} om px,py ligger inom EDGE_HIT_PX
// från en polygon-kant, annars null. Funkar inte för linjer.
export function hitTestEdge(px, py, obs, map, ENtoLatLng) {
  if (!obs?.points || obs.type !== 'polygon' || !map) return null;
  const pts = obs.points.map(([E, N]) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y, E, N };
  });
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = pts[i], b = pts[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) continue;
    const t  = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    if (Math.hypot(px - cx, py - cy) <= EDGE_HIT_PX) {
      return { edgeIndex: i, insertPoint: { E: a.E + t * (b.E - a.E), N: a.N + t * (b.N - a.N) } };
    }
  }
  return null;
}

// Returnerar true om (px,py) träffar hindret – inside polygon eller nära linje.
// Används i click-handlern för att välja hinder via klick på kartan.
export function hitTestObstacle(px, py, obs, map, ENtoLatLng) {
  if (!obs?.points || !map) return false;
  const pxPts = obs.points.map(([E, N]) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  });

  if (obs.type === 'polygon') {
    // Ray casting i pixel-rymd (identisk algoritm som pointInPolygon i visibility.js)
    let inside = false;
    const n = pxPts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const { x: xi, y: yi } = pxPts[i], { x: xj, y: yj } = pxPts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi) / (yj - yi)) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  if (obs.type === 'line') {
    const LINE_HIT_PX = 8;
    for (let i = 0; i < pxPts.length - 1; i++) {
      const { x: ax, y: ay } = pxPts[i], { x: bx, y: by } = pxPts[i + 1];
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= LINE_HIT_PX) return true;
    }
  }

  return false;
}

// ── Snap under drag – bara mot andra hinders hörn, INTE mät-punkter ──────────

function _findSnapForDrag(px, py, skipObsId, map, ENtoLatLng) {
  if (!map) return null;
  for (const obs of getObstacles()) {
    if (obs.id === skipObsId) continue;
    for (const [E, N] of obs.points) {
      const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
      if (Math.hypot(p.x - px, p.y - py) < SNAP_PX) return { E, N };
    }
  }
  return null;
}

// ── Drag-livscykel ────────────────────────────────────────────────────────────

export function startNodeDrag(obsId, ptIdx) {
  _dragObsId  = obsId;
  _dragPtIdx  = ptIdx;
  _snapTarget = null;
  _isDragging = true;
  _dragMoved  = false;
}

// Kallas vid varje mousemove under drag. Uppdaterar state optimistiskt.
export function updateNodeDrag(latlng, containerPoint, map, ENtoLatLng, latLngToEN) {
  if (!_isDragging) return;
  if (!_dragMoved) {
    saveUndo(`Flytta hörn på ${_dragObsId}`);
    _dragMoved = true;
  }
  _snapTarget   = _findSnapForDrag(containerPoint.x, containerPoint.y, _dragObsId, map, ENtoLatLng);
  const en      = _snapTarget || latLngToEN(latlng);
  const obs     = getObstacles().find(o => o.id === _dragObsId);
  if (!obs) return;
  updateObstacle(_dragObsId, { points: obs.points.map((p, i) => i === _dragPtIdx ? [en.E, en.N] : p) });
}

export function endNodeDrag() {
  _isDragging = false;
  _dragObsId  = null;
  _dragPtIdx  = null;
  _snapTarget = null;
  _dragMoved  = false;
}

// ── State-mutationer ──────────────────────────────────────────────────────────

// Infogar ett nytt hörn efter afterIndex i hindret obsId.
export function insertNode(obsId, afterIndex, point) {
  const obs = getObstacles().find(o => o.id === obsId);
  if (!obs) return;
  saveUndo(`Lägg till hörn på ${obsId}`);
  const pts = [...obs.points];
  pts.splice(afterIndex + 1, 0, [point.E, point.N]);
  updateObstacle(obsId, { points: pts });
}

// Tar bort hörn vid ptIdx. Blockerar om polygon skulle få < 3 hörn.
export function deleteNode(obsId, ptIdx, showToastFn) {
  const obs = getObstacles().find(o => o.id === obsId);
  if (!obs) return;
  if (obs.type === 'polygon' && obs.points.length <= 3) {
    showToastFn?.('En byggnad måste ha minst 3 hörn', '#ff5050');
    return;
  }
  if (obs.type === 'line') return;
  saveUndo(`Ta bort hörn på ${obsId}`);
  updateObstacle(obsId, { points: obs.points.filter((_, i) => i !== ptIdx) });
}
