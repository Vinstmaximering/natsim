// Cirkelverktyget C (Polylinjer Etapp 5).
//
// Klicka centrum (med snappning) → skriv radien i rutan och tryck Enter, eller
// klicka en punkt på cirkeln (med snappning). Centrum som snappar mot en punkt
// blir {ref, id} – cirkeln följer punkten; annars en fast koordinat {E, N}.
// Förhandsvisningen följer musen tills en radie är inskriven. En skapad
// cirkel är ett ångra-steg; verktyget står kvar för nästa cirkel. Esc börjar
// om; utan valt centrum lämnar Esc verktyget.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i
// funktioner, aldrig vid modul-initialisering.
import { map, ENtoLatLng, latLngToEN } from './leaflet-setup.js';
import { getState, setState } from '../state/store.js';
import { saveUndo } from '../state/undo.js';
import { findSnapTarget, snapActive, snapRadius, drawSnapMarker } from './snap.js';
import { addVisualCircle, visualCircleCoords } from '../state/visual.js';

let _on = false;
let _center = null;     // { ref, id, E, N } eller { E, N }
let _typed = null;      // inskriven radie (m) eller null
let _mouse = null, _snap = null;

export const isCircleTool = () => _on;
export const getCircleCenter = () => (_center ? { ..._center } : null);

export function startCircleTool() { _on = true; _center = null; _typed = null; _mouse = null; _snap = null; }
export function cancelCircleTool() { _on = false; _center = null; _typed = null; _mouse = null; _snap = null; }

/** Esc: släpper centrum. Returnerar false när inget centrum var valt. */
export function resetCircleCenter() {
  if (!_center) return false;
  _center = null; _typed = null;
  return true;
}

const _px = (E, N) => { const p = map.latLngToContainerPoint(ENtoLatLng(E, N)); return { x: p.x, y: p.y }; };

function _snapAt(latlng) {
  if (!map || !snapActive()) return null;
  const en = latLngToEN(latlng);
  const p = _px(en.E, en.N);
  return findSnapTarget(getState(), p.x, p.y, _px, snapRadius());
}

const _punkt = (snap, latlng) => (snap
  ? (snap.ref ? { ref: snap.ref, id: snap.id, E: snap.E, N: snap.N } : { E: snap.E, N: snap.N })
  : latLngToEN(latlng));

/** Inskriven radie från rutan (null = följ musen). */
export function setTypedRadius(r) { _typed = Number(r) > 0 ? Number(r) : null; }

/** Radien för förhandsvisningen: inskriven, annars avståndet till musen. */
export function previewRadius() {
  if (!_center) return null;
  if (_typed) return _typed;
  const t = _snap || _mouse;
  return t ? Math.hypot(t.E - _center.E, t.N - _center.N) : null;
}

export function updateCircleMouse(latlng) {
  _mouse = latLngToEN(latlng);
  _snap = _snapAt(latlng);
}

/** Skapar cirkeln med radien r runt valt centrum. Ett ångra-steg. */
export function createCircle(r) {
  if (!_center || !(r > 0)) return null;
  saveUndo('Ny cirkel');
  const center = _center.ref ? { ref: _center.ref, id: _center.id } : { E: _center.E, N: _center.N };
  const id = addVisualCircle({ center, radius: r });
  _center = null; _typed = null;
  if (id) setState({ selVisualId: id });
  return id;
}

/** Klick: centrum, eller en punkt på cirkeln som ger radien. */
export function handleCircleClick(latlng) {
  const snap = _snapAt(latlng);
  const p = _punkt(snap, latlng);
  if (!_center) { _center = p; _typed = null; return { center: true }; }
  const r = Math.hypot(p.E - _center.E, p.N - _center.N);
  if (!(r > 0)) return { created: null };
  return { created: createCircle(r) };
}

// ── Förhandsvisning ──────────────────────────────────────────────────────────

export function drawCirclePreview(ctx) {
  if (!_on || !map) return;
  if (_center) {
    const r = previewRadius();
    const c = _px(_center.E, _center.N);
    ctx.save();
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.x - 5, c.y); ctx.lineTo(c.x + 5, c.y);
    ctx.moveTo(c.x, c.y - 5); ctx.lineTo(c.x, c.y + 5);
    ctx.stroke();
    if (r > 0) {
      const coords = visualCircleCoords({ center: { E: _center.E, N: _center.N }, radius: r }, getState());
      ctx.beginPath();
      coords.map(([E, N]) => _px(E, N)).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  if (_snap && snapActive()) drawSnapMarker(ctx, _px(_snap.E, _snap.N), _snap);
}
