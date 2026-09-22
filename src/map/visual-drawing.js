// Ritläges-tillståndsmaskin för det visuella lagret.
// Speglar obstacle-drawing.js men skiljer sig på en punkt: läget avslutas inte
// automatiskt efter ett objekt. Användaren klickar ut flera punkter respektive
// en kedja av linjesegment, och avslutar med Escape eller högerklick.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i funktioner,
// aldrig vid modul-initialisering.
import { map, ENtoLatLng, latLngToEN } from './leaflet-setup.js';
import { getState }                    from '../state/store.js';
import { addVisualPt, addVisualLine, makeEndpoint, isVisualObjVisible } from '../state/visual.js';

const SNAP_PX = 15;

let _mode    = 'idle';  // 'idle' | 'point' | 'line'
let _pending = null;    // {ref,id} – linjens startpunkt när ett segment påbörjats
let _mouseEN = null;
let _snap    = null;    // {ref, id, E, N} eller null

export const getVisualDrawMode = () => _mode;
export const isDrawingVisual   = () => _mode !== 'idle';

export function startVisualPointDraw() {
  _mode = 'point'; _pending = null; _mouseEN = null; _snap = null;
}

export function startVisualLineDraw() {
  _mode = 'line';  _pending = null; _mouseEN = null; _snap = null;
}

export function cancelVisualDraw() {
  _mode = 'idle';  _pending = null; _mouseEN = null; _snap = null;
}

// Avslutar en påbörjad linjekedja men stannar kvar i ritläget.
export function breakVisualChain() {
  _pending = null;
}

export const hasPendingChain = () => _pending !== null;

// ── Snap ─────────────────────────────────────────────────────────────────────
// Snap mot både nätpunkter och visuella punkter. Träff på en nätpunkt ger en
// endpoint med ref:'net' – det är så en visuell linje fästs i nätet.
function _findSnap(px, py) {
  if (!map) return null;
  const { pts = [], visualPts = [] } = getState();

  for (const p of visualPts) {
    // Dolda lager snappar inte – annars fäster linjen i något osynligt.
    if (!isVisualObjVisible(p)) continue;
    const c = map.latLngToContainerPoint(ENtoLatLng(p.E, p.N));
    if (Math.hypot(c.x - px, c.y - py) < SNAP_PX)
      return { ref: 'visual', id: p.id, E: p.E, N: p.N };
  }
  for (const p of pts) {
    const c = map.latLngToContainerPoint(ENtoLatLng(p.E, p.N));
    if (Math.hypot(c.x - px, c.y - py) < SNAP_PX)
      return { ref: 'net', id: p.id, E: p.E, N: p.N };
  }
  return null;
}

export function updateVisualMousePos(latlng, containerPoint) {
  _mouseEN = latLngToEN(latlng);
  _snap    = _findSnap(containerPoint.x, containerPoint.y);
}

// ── Klickhantering ───────────────────────────────────────────────────────────

// Ger endpoint för ett klick: befintligt objekt vid snap, annars en ny
// visuell punkt på kartkoordinaten.
function _endpointAt(latlng) {
  if (_snap) return makeEndpoint(_snap.ref, _snap.id);
  const en = latLngToEN(latlng);
  return makeEndpoint('visual', addVisualPt({ E: en.E, N: en.N }));
}

// Returnerar {created} – vad klicket resulterade i, för toast/hint.
export function handleVisualMapClick(latlng) {
  if (_mode === 'point') {
    if (_snap && _snap.ref === 'visual') return { created: null }; // klick på befintlig
    const en = latLngToEN(latlng);
    return { created: 'point', id: addVisualPt({ E: en.E, N: en.N }) };
  }

  if (_mode === 'line') {
    const ep = _endpointAt(latlng);
    if (!_pending) { _pending = ep; return { created: null }; }
    // Klick på samma punkt igen bryter kedjan i stället för att skapa en
    // nollängdslinje.
    if (_pending.ref === ep.ref && _pending.id === ep.id) {
      _pending = null;
      return { created: null };
    }
    const id = addVisualLine({ from: _pending, to: ep });
    _pending = ep;   // kedjan fortsätter från senaste punkten
    return { created: 'line', id };
  }

  return { created: null };
}

// ── Förhandsvisning ──────────────────────────────────────────────────────────

export function drawVisualPreview(ctx) {
  if (!map || _mode === 'idle') return;

  const toPixel = ({ E, N }) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  };

  // Gummiband från kedjans senaste punkt till musen
  if (_mode === 'line' && _pending) {
    const state = getState();
    const src = _pending.ref === 'net'
      ? (state.pts || []).find(p => p.id === _pending.id)
      : (state.visualPts || []).find(p => p.id === _pending.id);
    const target = _snap || _mouseEN;
    if (src && target) {
      const a = toPixel(src), b = toPixel(target);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(207,216,220,0.7)';
      ctx.lineWidth   = 1.8;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#cfd8dc';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  }

  // Ihålig markör under musen i punktläge
  if (_mode === 'point' && (_snap || _mouseEN)) {
    const p = toPixel(_snap || _mouseEN);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(207,216,220,0.8)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Snap-indikator – samma gröna ring som hinder-ritningen
  if (_snap) {
    const p = toPixel(_snap);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
  }
}
