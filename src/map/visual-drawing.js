// Ritläges-tillståndsmaskin för det visuella lagret.
// Speglar obstacle-drawing.js men skiljer sig på en punkt: läget avslutas inte
// automatiskt efter ett objekt. Användaren klickar ut flera punkter, linjer
// eller ytor i följd och lämnar läget med Escape eller högerklick.
//
// Linje (Polylinjer Etapp 1): hörnen samlas i minnet medan man ritar, som för
// ytan, och linjen sparas först när den avslutas – dubbelklick, Enter,
// högerklick, klick på sista hörnet igen (pekskärm: tryck på det, eller
// "✓ Klar"). Klick på första hörnet sluter linjen (minst tre hörn). En färdig
// linje är ett ångra-steg. Esc kastar en påbörjad linje; utan påbörjad linje
// lämnar Esc läget. Backspace och "↶ Hörn" tar bort senaste hörnet. Eftersom
// inget sparas förrän linjen är klar lämnar en avbruten linje inga punkter
// efter sig, och en punkt som klicket snappade mot rörs aldrig.
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
let _line    = [];      // linjens hörn under ritning: {ref,id,E,N} eller {E,N}
let _mouseEN = null;
let _snap    = null;    // snappmål (map/snap.js) eller null
let _mouseCP = null;    // senaste muspositionen i skärmpixlar
let _flash   = null;    // { target, until } – snappmålet efter ett tryck
let _area    = [];      // ytans hörn under ritning: {ref,id,E,N} eller {E,N}

export const getVisualDrawMode = () => _mode;
export const isDrawingVisual   = () => _mode !== 'idle';

export function startVisualPointDraw() {
  _mode = 'point'; _mouseEN = null; _snap = null;
}

export function startVisualLineDraw() {
  _mode = 'line';  _mouseEN = null; _snap = null; _line = [];
}

export function startVisualAreaDraw() {
  _mode = 'area';  _mouseEN = null; _snap = null; _area = [];
}

export function cancelVisualDraw() {
  _mode = 'idle';  _mouseEN = null; _snap = null; _area = []; _line = [];
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

// ── Linje ────────────────────────────────────────────────────────────────────

export const getPendingLineVertices = () => _line.map(v => ({ ...v }));
export const hasPendingLine = () => _mode === 'line' && _line.length > 0;

/** Kastar den påbörjade linjen men stannar i linjeläget. */
export function discardPendingLine() { _line = []; }

/** Backspace: tar bort senaste hörnet. Returnerar true om det fanns något. */
export function undoLastLineVertex() {
  if (_mode !== 'line' || !_line.length) return false;
  _line.pop();
  return true;
}

/** Är musen/klicket nära första hörnet, så att ett klick sluter linjen? */
export function nearFirstLineVertex(en) {
  if (_mode !== 'line' || _line.length < 3 || !en || !map) return false;
  return _pxDist(_line[0], en) <= closePx();
}

// Samma hörn som det senaste: samma punkt vid punktsnapp, annars inom
// träffradien på skärmen. Ett klick där avslutar linjen – så blir ett
// dubbelklicks andra klick aldrig ett extra hörn. Snappar klicket mot en
// annan befintlig punkt är det ett nytt hörn, hur nära det än ligger.
function _onLastLineVertex(v) {
  const last = _line[_line.length - 1];
  if (!last) return false;
  if (v.ref) return last.ref === v.ref && last.id === v.id;
  return !!map && _pxDist(last, v) <= closePx();
}

/**
 * Sparar linjen: skapar hörnpunkterna (role 'vertex', i aktivt lager) för hörn
 * som inte snappade mot en befintlig punkt, och polylinjen själv – ett
 * ångra-steg. closed sluter linjen (kräver minst tre hörn).
 * Returnerar { ok, id } eller { ok:false, reason }.
 */
export function completeVisualLine({ closed = false } = {}) {
  if (_mode !== 'line') return { ok: false, reason: 'mode' };
  if (_line.length < 2) return { ok: false, reason: 'few' };
  saveUndo('Ny linje');
  const layerId = ensureActiveVisualLayer();
  const vertices = _line.map(v => v.ref
    ? makeEndpoint(v.ref, v.id)
    : makeEndpoint('visual', addVisualPt({ E: v.E, N: v.N, layerId, role: 'vertex' })));
  const id = addVisualLine({ vertices, closed: closed && _line.length >= 3, layerId });
  _line = [];
  setState({ selVisualId: id });
  return { ok: true, id };
}

/**
 * Högerklick i linjeläget: en linje med minst två hörn sparas, ett ensamt
 * första hörn kastas. Returnerar false när ingen linje var påbörjad – då ska
 * läget lämnas.
 */
export function finishOrDiscardLine() {
  if (!hasPendingLine()) return false;
  if (_line.length >= 2) completeVisualLine();
  else _line = [];
  return true;
}

/** Finns det ett hörn att ta bort i pågående linje eller yta? */
export const hasUndoableVertex = () =>
  (_mode === 'line' && _line.length > 0) || (_mode === 'area' && _area.length > 0);

/** Kan "✓ Klar" avsluta en pågående linje (minst två hörn)? */
export const canFinishLine = () => _mode === 'line' && _line.length >= 2;

/** "↶ Hörn": senaste hörnet i pågående linje eller yta (motsvarar Backspace). */
export function undoLastDrawVertex() {
  return _mode === 'area' ? undoLastAreaVertex() : undoLastLineVertex();
}

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

// Hörnet för ett klick: en befintlig punkt vid punktsnapp (ref:'net' för en
// nätpunkt), annars en position – på linjen vid kantsnapp, annars på
// kartkoordinaten.
const _vertexAt = (snap, latlng) => (snap?.ref
  ? { ref: snap.ref, id: snap.id, E: snap.E, N: snap.N }
  : { ..._posFor(snap, latlng) });

// Returnerar {created} – vad klicket resulterade i, för toast/hint.
export function handleVisualMapClick(latlng) {
  const snap = _snapForClick(latlng);

  if (_mode === 'area') {
    const v = _vertexAt(snap, latlng);
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
    saveUndo('Ny visuell punkt');
    return { created: 'point', id: addVisualPt({ E: en.E, N: en.N }) };
  }

  if (_mode === 'line') {
    const v = _vertexAt(snap, latlng);
    if (nearFirstLineVertex(v)) {
      const r = completeVisualLine({ closed: true });
      return { created: r.ok ? 'line' : null, ...r };
    }
    // Klick på senaste hörnet igen avslutar linjen (ett ensamt första hörn
    // blir kvar – en linje behöver två).
    if (_onLastLineVertex(v)) {
      if (_line.length < 2) return { created: null };
      const r = completeVisualLine();
      return { created: r.ok ? 'line' : null, ...r };
    }
    _line.push(v);
    return { created: null, vertices: _line.length };
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

  // Linje under ritning: hörnen hittills och ett gummiband till musen. Kan
  // ett klick sluta linjen ringas första hörnet in.
  if (_mode === 'line' && _line.length) {
    const target = _snap || _mouseEN;
    const pts = _line.map(toPixel);
    const closing = target && nearFirstLineVertex(target);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (closing) ctx.lineTo(pts[0].x, pts[0].y);
    else if (target) { const t = toPixel(target); ctx.lineTo(t.x, t.y); }
    ctx.strokeStyle = 'rgba(207,216,220,0.7)';
    ctx.lineWidth   = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [i, p] of pts.entries()) {
      const ring = i === 0 && closing;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ring ? 8 : (i === pts.length - 1 ? 5 : 4), 0, Math.PI * 2);
      ctx.strokeStyle = ring ? '#00ff88' : '#cfd8dc';
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
