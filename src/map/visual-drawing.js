// Ritläges-tillståndsmaskin för det visuella lagret.
// Speglar obstacle-drawing.js men skiljer sig på en punkt: läget avslutas inte
// automatiskt efter ett objekt. Användaren klickar ut flera punkter respektive
// en kedja av linjesegment, och avslutar med Escape eller högerklick.
//
// Yta (Lager-verktyg Etapp 3): hörnen samlas i minnet medan man ritar och
// sparas först när ytan sluts – dubbelklick, eller klick på första hörnet.
// Minst tre hörn. Backspace tar bort senaste hörnet. Esc eller högerklick
// kastar en påbörjad yta; utan påbörjad yta lämnar de läget. En avbruten yta
// lämnar alltså inga lösa hörnpunkter efter sig, och en färdig yta är ett
// ångra-steg.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i funktioner,
// aldrig vid modul-initialisering.
import { map, ENtoLatLng, latLngToEN } from './leaflet-setup.js';
import { getState, setState }          from '../state/store.js';
import { saveUndo }                    from '../state/undo.js';
import { addVisualPt, addVisualLine, addVisualArea, makeEndpoint, isVisualObjVisible,
         ensureActiveVisualLayer } from '../state/visual.js';
import { isSelfIntersecting } from '../state/area-geometry.js';

const SNAP_PX = 15;
// Klick så här nära ytans första hörn sluter ytan. Med finger (grov pekare)
// är träffytan större – 10 px går inte att pricka på en telefon.
export const AREA_CLOSE_PX = 10;
export const AREA_CLOSE_PX_TOUCH = 22;
const closePx = () => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  ? AREA_CLOSE_PX_TOUCH : AREA_CLOSE_PX;
// Ett klick så här nära förra hörnet räknas som samma klick – dubbelklicket som
// sluter ytan ger annars två extra hörn på samma ställe.
const AREA_DUP_PX = 3;

let _mode    = 'idle';  // 'idle' | 'point' | 'line' | 'area'
let _pending = null;    // {ref,id} – linjens startpunkt när ett segment påbörjats
let _mouseEN = null;
let _snap    = null;    // {ref, id, E, N} eller null
let _area    = [];      // ytans hörn under ritning: {ref,id,E,N} eller {E,N}

export const getVisualDrawMode = () => _mode;
export const isDrawingVisual   = () => _mode !== 'idle';

export function startVisualPointDraw() {
  _mode = 'point'; _pending = null; _mouseEN = null; _snap = null;
}

export function startVisualLineDraw() {
  _mode = 'line';  _pending = null; _mouseEN = null; _snap = null;
}

export function startVisualAreaDraw() {
  _mode = 'area';  _pending = null; _mouseEN = null; _snap = null; _area = [];
}

export function cancelVisualDraw() {
  _mode = 'idle';  _pending = null; _mouseEN = null; _snap = null; _area = [];
}

// ── Yta ──────────────────────────────────────────────────────────────────────

export const getPendingAreaVertices = () => _area.map(v => ({ ...v }));
export const hasPendingArea = () => _mode === 'area' && _area.length > 0;

/** Kastar den påbörjade ytan men stannar i ytläget. */
export function discardPendingArea() { _area = []; }

/** Backspace: tar bort senaste hörnet. Returnerar true om det fanns något. */
export function undoLastAreaVertex() {
  if (_mode !== 'area' || !_area.length) return false;
  _area.pop();
  return true;
}

const _px = ({ E, N }) => {
  const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
  return { x: p.x, y: p.y };
};
const _pxDist = (a, b) => { const p = _px(a), q = _px(b); return Math.hypot(p.x - q.x, p.y - q.y); };

/** Är musen/klicket nära första hörnet, så att ett klick sluter ytan? */
export function nearFirstAreaVertex(en) {
  if (_mode !== 'area' || _area.length < 3 || !en || !map) return false;
  return _pxDist(_area[0], en) <= closePx();
}

/**
 * Sluter ytan: skapar hörnpunkterna (role 'vertex', i aktivt lager) för hörn
 * som inte snappade mot en befintlig punkt, och ytan själv – ett ångra-steg.
 * Returnerar { ok, id, selfIntersecting } eller { ok:false, reason }.
 */
export function completeVisualArea() {
  if (_mode !== 'area') return { ok: false, reason: 'mode' };
  if (_area.length < 3) return { ok: false, reason: 'few' };
  const coords = _area.map(v => [v.E, v.N]);
  saveUndo('Ny yta');
  const layerId = ensureActiveVisualLayer();
  const vertices = _area.map(v => v.ref
    ? makeEndpoint(v.ref, v.id)
    : makeEndpoint('visual', addVisualPt({ E: v.E, N: v.N, layerId, role: 'vertex' })));
  const id = addVisualArea({ vertices, layerId });
  _area = [];
  // Ytan markeras direkt, så att egenskapskortet visar area och omkrets.
  setState({ selVisualId: id });
  return { ok: true, id, selfIntersecting: isSelfIntersecting(coords) };
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
  if (_mode === 'area') {
    const v = _snap
      ? { ref: _snap.ref, id: _snap.id, E: _snap.E, N: _snap.N }
      : { ...latLngToEN(latlng) };
    if (nearFirstAreaVertex(v)) {
      const r = completeVisualArea();
      return { created: r.ok ? 'area' : null, ...r };
    }
    const last = _area[_area.length - 1];
    if (last && map && _pxDist(last, v) <= AREA_DUP_PX) return { created: null };
    _area.push(v);
    return { created: null, vertices: _area.length };
  }

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

  // Yta under ritning: fylld förhandsvisning, gummiband till musen och en
  // streckad slutkant tillbaka till första hörnet.
  if (_mode === 'area' && _area.length) {
    const target = _snap || _mouseEN;
    const pts = _area.map(toPixel);
    const closing = target && nearFirstAreaVertex(target);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (target && !closing) { const t = toPixel(target); ctx.lineTo(t.x, t.y); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(207,216,220,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(207,216,220,0.8)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [i, p] of pts.entries()) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 && closing ? 8 : 4, 0, Math.PI * 2);
      ctx.strokeStyle = i === 0 && closing ? '#00ff88' : '#cfd8dc';
      ctx.lineWidth = 2;
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
