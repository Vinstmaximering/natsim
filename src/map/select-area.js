// Verktyget Markera område (Lager-verktyg Etapp 4): tillståndet under en
// dragning, klick utan drag och rektangelns utseende.
//
// Händelserna kommer från map/interactions.js (mus via Leaflet, finger via
// touch-händelser på kartbehållaren). Här finns bara logiken, i skärmpixlar,
// så att samma regler gäller för mus och finger.
//
//   Dra vänster → höger: objekt helt inuti   (heldragen-streckad, accentfärg)
//   Dra höger → vänster: inuti eller korsade (tätt streckad, grön)
//   Klick utan drag: ett enskilt objekt (punkt före linje före yta)
//   Skift lägger till, Ctrl/Cmd tar bort; på pekskärm gäller växlaren
//   Ny / Lägg till / Dra ifrån i åtgärdsraden.
import { map, ENtoLatLng } from './leaflet-setup.js';
import { getState, setState } from '../state/store.js';
import { objectsInRect, applySelection, modeFromDrag, opFromEvent } from '../state/visual-selection.js';
import { hitTestVisualPt, hitTestVisualLine, hitTestVisualArea } from './visual-canvas.js';

// Rörelse under så här många pixlar är ett klick, inte en dragning.
export const DRAG_MIN_PX = 4;

let _drag = null;          // { x0, y0, x1, y1 } i kartbehållarens pixlar
let _touchOp = 'replace';  // pekskärmens växlare

export const getTouchSelectOp = () => _touchOp;
export function setTouchSelectOp(op) {
  _touchOp = ['replace', 'add', 'remove'].includes(op) ? op : 'replace';
}

export const isSelectDragging = () => !!_drag;
export const getSelectRect = () => (_drag ? { ..._drag } : null);

const project = (E, N) => {
  const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
  return { x: p.x, y: p.y };
};

export function beginSelectDrag(x, y) { _drag = { x0: x, y0: y, x1: x, y1: y }; }
export function updateSelectDrag(x, y) { if (_drag) { _drag.x1 = x; _drag.y1 = y; } }
export function cancelSelectDrag() { _drag = null; }

/** Har dragningen rört sig så långt att den är en rektangel? */
export const selectDragMoved = () => !!_drag
  && Math.hypot(_drag.x1 - _drag.x0, _drag.y1 - _drag.y0) >= DRAG_MIN_PX;

// Markeringen och det enskilda valet (selVisualId, egenskapskortet) utesluter
// varandra: åtgärdsraden och kortet ska inte stå samtidigt.
function commit(ids) {
  setState({ visualSelection: ids, selVisualId: null });
  return ids;
}

/**
 * Avslutar dragningen och markerar det rektangeln valde. mods är händelsen
 * (shiftKey/ctrlKey/metaKey). Returnerar den nya markeringen, eller null om
 * dragningen var för kort (då är det ett klick).
 */
export function endSelectDrag(mods) {
  if (!_drag) return null;
  const r = _drag;
  _drag = null;
  if (Math.hypot(r.x1 - r.x0, r.y1 - r.y0) < DRAG_MIN_PX) return null;
  const st = getState();
  const ids = objectsInRect(st, r, modeFromDrag(r.x0, r.x1), project);
  return commit(applySelection(st.visualSelection || [], ids, opFromEvent(mods, _touchOp)));
}

/** Klick utan drag: ett objekt under pekaren, eller tom markering vid miss. */
export function clickSelect(x, y, mods) {
  const st = getState();
  // Ett hörn markeras inte för sig – klicket går vidare till dess linje eller yta.
  const pt  = hitTestVisualPt(x, y, st, map, ENtoLatLng);
  const hit = (pt && pt.role !== 'vertex' ? pt : null)
           || hitTestVisualLine(x, y, st, map, ENtoLatLng)
           || hitTestVisualArea(x, y, st, map, ENtoLatLng);
  const op = opFromEvent(mods, _touchOp);
  const id = hit?.id ?? null;
  if (!id) return op === 'replace' ? commit([]) : (st.visualSelection || []);
  return commit(applySelection(st.visualSelection || [], [id], op));
}

// Färgerna ur tokens.css, med samma värden som reserv om variabeln saknas.
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

export function drawSelectRect(ctx) {
  if (!selectDragMoved()) return;
  const r = _drag;
  const crossing = modeFromDrag(r.x0, r.x1) === 'crossing';
  const col = crossing ? token('--color-success', '#00ff88') : token('--accent', '#4fc3f7');
  const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
  const w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(crossing ? [3, 3] : [8, 4]);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}
