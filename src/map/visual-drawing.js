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
// Snappning (Lager-verktyg Etapp 5): se map/snap.js. Målet räknas om vid varje
// musrörelse för förhandsvisningen och på nytt vid klicket, så att ett tryck
// på pekskärm – där det inte finns någon hovring – snappar på samma sätt. På
// pekskärm visas målet efteråt en kort stund, eftersom det inte syns i förväg.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i funktioner,
// aldrig vid modul-initialisering.
import { map, ENtoLatLng, latLngToEN, draw } from './leaflet-setup.js';
import { getState, setState }          from '../state/store.js';
import { saveUndo }                    from '../state/undo.js';
import { addVisualPt, addVisualLine, addVisualArea, makeEndpoint,
         ensureActiveVisualLayer } from '../state/visual.js';
import { isSelfIntersecting } from '../state/area-geometry.js';
import { findSnapTarget, snapActive, snapRadius, drawSnapMarker } from './snap.js';

// Så länge snappmålet syns efter ett tryck på pekskärm.
export const SNAP_FLASH_MS = 1200;
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
let _snap    = null;    // snappmål (map/snap.js) eller null
let _mouseCP = null;    // senaste muspositionen i skärmpixlar
let _flash   = null;    // { target, until } – snappmålet efter ett tryck
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

// ── Snappning ────────────────────────────────────────────────────────────────

function _snapAtPx(x, y) {
  if (!map || !snapActive()) return null;
  return findSnapTarget(getState(), x, y, _px_en, snapRadius());
}
const _px_en = (E, N) => _px({ E, N });

export function updateVisualMousePos(latlng, containerPoint) {
  _mouseEN = latLngToEN(latlng);
  _mouseCP = containerPoint ? { x: containerPoint.x, y: containerPoint.y } : null;
  _snap    = _mouseCP ? _snapAtPx(_mouseCP.x, _mouseCP.y) : null;
}

/** Räknar om snappmålet vid samma musposition – när Alt eller S ändrats. */
export function refreshVisualSnap() {
  _snap = _mouseCP ? _snapAtPx(_mouseCP.x, _mouseCP.y) : null;
}

export const getVisualSnap = () => _snap;

// Snappmålet för ett klick, räknat vid klickets position. På pekskärm finns
// ingen hovring, så målet visas en kort stund efteråt.
function _snapForClick(latlng) {
  if (!map) return _snap;
  const p = _px(latLngToEN(latlng));
  const t = _snapAtPx(p.x, p.y);
  _snap = t;
  if (t && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
    _flash = { target: t, until: Date.now() + SNAP_FLASH_MS };
    setTimeout(() => { try { draw(); } catch { /* kartan borta */ } }, SNAP_FLASH_MS + 50);
  }
  return t;
}

// Position för ett klick: snappmålet, annars kartkoordinaten.
const _posFor = (snap, latlng) => (snap ? { E: snap.E, N: snap.N } : latLngToEN(latlng));

// ── Klickhantering ───────────────────────────────────────────────────────────

// Ger endpoint för ett klick: en befintlig punkt vid punktsnapp (ref:'net' för
// en nätpunkt), annars en ny visuell punkt – på linjen vid kantsnapp, annars på
// kartkoordinaten.
function _endpointAt(latlng, snap) {
  if (snap?.ref) return makeEndpoint(snap.ref, snap.id);
  const en = _posFor(snap, latlng);
  return makeEndpoint('visual', addVisualPt({ E: en.E, N: en.N }));
}

// Returnerar {created} – vad klicket resulterade i, för toast/hint.
export function handleVisualMapClick(latlng) {
  const snap = _snapForClick(latlng);

  if (_mode === 'area') {
    const v = snap?.ref
      ? { ref: snap.ref, id: snap.id, E: snap.E, N: snap.N }
      : { ..._posFor(snap, latlng) };
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
    // Klick på en befintlig visuell punkt skapar ingen dubblett. Snapp mot en
    // nätpunkt eller en linje lägger den nya punkten exakt där.
    if (snap?.ref === 'visual') return { created: null };
    // Nätpunkten vinner över en visuell punkt på samma ställe (map/snap.js) –
    // men här finns redan en visuell punkt, så ingen dubblett.
    if (snap?.ref === 'net' && (getState().visualPts || []).some(p =>
        _pxDist(p, snap) <= 1)) return { created: null };
    const en = _posFor(snap, latlng);
    return { created: 'point', id: addVisualPt({ E: en.E, N: en.N }) };
  }

  if (_mode === 'line') {
    const ep = _endpointAt(latlng, snap);
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

  // Snappmålet: grön ring (punkt) eller romb (på linje/kant) med en kort text.
  if (_snap && snapActive()) drawSnapMarker(ctx, toPixel(_snap), _snap);

  // Pekskärm: målet för det senaste trycket, en kort stund.
  if (_flash && Date.now() < _flash.until) {
    const kvar = (_flash.until - Date.now()) / SNAP_FLASH_MS;
    drawSnapMarker(ctx, toPixel(_flash.target), _flash.target, { fade: Math.max(0.3, kvar) });
  } else _flash = null;
}
