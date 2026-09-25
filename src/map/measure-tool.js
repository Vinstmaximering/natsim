// Mätverktyget D (Polylinjer Etapp 2): avstånd och riktning mellan två
// punkter på kartan, med samma snappning som ritverktygen (map/snap.js).
//
// Klick 1 sätter punkt A, klick 2 punkt B och visar resultatet; ett tredje
// klick börjar om med en ny punkt A. Esc börjar om; utan påbörjad mätning
// lämnar Esc verktyget. Ingenting sparas – mätningen finns bara så länge
// verktyget är valt.
//
// Höjd: en visuell punkt har höjd när H inte är null; en nätpunkt när H är
// skild från 0 (0 betyder "ingen höjd" för nätpunkter, se README). En klickad
// position utan punktsnapp – eller snapp mot en linje – har ingen höjd. ΔH
// visas bara när båda punkterna har höjd.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i
// funktioner, aldrig vid modul-initialisering.
import { map, ENtoLatLng, latLngToEN } from './leaflet-setup.js';
import { getState } from '../state/store.js';
import { findSnapTarget, snapActive, snapRadius, drawSnapMarker } from './snap.js';
import { measureBetween } from '../state/line-geometry.js';
import { visualPtDisplayName } from '../state/visual.js';

let _on = false;
let _a = null, _b = null;     // mätpunkter: { E, N, H, name, kind }
let _mouseEN = null, _snap = null;

export const isMeasuring = () => _on;
export const getMeasurePoints = () => ({ a: _a && { ..._a }, b: _b && { ..._b } });
export const hasMeasurePoint = () => _on && !!_a;

export function startMeasure() { _on = true; _a = _b = null; _mouseEN = null; _snap = null; }
export function cancelMeasure() { _on = false; _a = _b = null; _mouseEN = null; _snap = null; }
/** Esc: börjar om. Returnerar false när inget var påbörjat. */
export function resetMeasure() {
  if (!_a) return false;
  _a = _b = null;
  return true;
}

const _px = (E, N) => { const p = map.latLngToContainerPoint(ENtoLatLng(E, N)); return { x: p.x, y: p.y }; };

function _snapAt(latlng) {
  if (!map || !snapActive()) return null;
  const en = latLngToEN(latlng);
  const p = _px(en.E, en.N);
  return findSnapTarget(getState(), p.x, p.y, _px, snapRadius());
}

/** Punktens höjd enligt reglerna ovan, eller null. */
export function targetHeight(t, state = getState()) {
  if (!t?.ref) return null;
  if (t.ref === 'net') {
    const p = (state.pts || []).find(x => x.id === t.id);
    return Number.isFinite(p?.H) && p.H !== 0 ? p.H : null;
  }
  const v = (state.visualPts || []).find(x => x.id === t.id);
  return Number.isFinite(v?.H) ? v.H : null;
}

/** Mätpunkten för ett snappmål eller en fri kartposition. */
export function measurePointFor(snap, en, state = getState()) {
  if (snap) {
    return {
      E: snap.E, N: snap.N, H: targetHeight(snap, state),
      // Namnet visas bara när snappningen träffat en punkt.
      name: snap.ref === 'net' ? snap.id
        : snap.ref ? visualPtDisplayName((state.visualPts || []).find(x => x.id === snap.id), state) : null,
      kind: snap.kind,
    };
  }
  return { E: en.E, N: en.N, H: null, name: null, kind: 'free' };
}

export function handleMeasureClick(latlng) {
  const snap = _snapAt(latlng);
  const p = measurePointFor(snap, latLngToEN(latlng));
  if (!_a || _b) { _a = p; _b = null; }
  else _b = p;
  return getMeasureResult();
}

export function updateMeasureMouse(latlng) {
  _mouseEN = latLngToEN(latlng);
  _snap = _snapAt(latlng);
}

/** Resultatet när båda punkterna är satta, annars null. */
export function getMeasureResult() {
  if (!_a || !_b) return null;
  return { a: { ..._a }, b: { ..._b }, ...measureBetween(_a, _b) };
}

// ── Ritning ──────────────────────────────────────────────────────────────────

const COL = '#ffd54f';

export function drawMeasure(ctx) {
  if (!_on || !map) return;
  const slut = _b || (_a && (_snap || _mouseEN));
  if (_a && slut) {
    const a = _px(_a.E, _a.N), b = _px(slut.E, slut.N);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = COL;
    ctx.lineWidth = 2;
    ctx.setLineDash(_b ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of _b ? [a, b] : [a]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = COL;
      ctx.fill();
    }
    ctx.restore();
  }
  if (_snap && snapActive()) drawSnapMarker(ctx, _px(_snap.E, _snap.N), _snap);
}
