// Snappning vid ritning av visuell punkt, linje och yta (Lager-verktyg Etapp 5).
//
// Mål, i prioritetsordning:
//   1. punkter – nätpunkter, fria visuella punkter och hörn i linjer och ytor
//      (närmaste inom radien vinner, oavsett sort – men ligger en nätpunkt och
//      en visuell punkt inom 1 px från varandra på skärmen vinner nätpunkten,
//      så att hörnet fäster i nätet med ref:'net')
//   2. närmaste punkt på en visuell linje (närmaste segment i polylinjen)
//      eller en ytas kant
// En punkt vinner alltid över en linje, även om linjen ligger närmare pekaren –
// annars går det inte att träffa ett hörn där två kanter möts.
//
// Radien är i skärmpixlar, inte meter, så att den känns likadan på alla
// zoomnivåer: 10 px med mus, 22 px med finger (samma som ytverktygets
// träffyta för första hörnet). Objekt i släckta lager snappar inte.
//
// Snappning mot en nätpunkt ger ref:'net' – så fäster linjer och ytor i nätet.
// Snappningen gäller bara när man ritar. Den styr inte när man drar i något, och
// hindrens egen snappning (map/obstacle-*.js) är orörd.
//
// Av/på sparas per användare (localStorage), förval på. Alt nedtryckt stänger
// av tillfälligt.
import { visualLineSegments, visualAreaCoords, isVisualObjVisible, visualPtLabel } from '../state/visual.js';

export const SNAP_PX = 10;
export const SNAP_PX_TOUCH = 22;
export const SNAP_KEY = 'natsim_snap';
// Nätpunkt och visuell punkt så här nära varandra på skärmen räknas som samma
// ställe – då vinner nätpunkten.
export const SAME_SPOT_PX = 1;

const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
export const snapRadius = () => (coarse() ? SNAP_PX_TOUCH : SNAP_PX);

// ── Inställning ─────────────────────────────────────────────────────────────

function _load() {
  try { return localStorage.getItem(SNAP_KEY) !== '0'; } catch { return true; }
}
let _enabled = _load();
let _alt = false;

export const isSnapEnabled = () => _enabled;
export function setSnapEnabled(on) {
  _enabled = !!on;
  try { localStorage.setItem(SNAP_KEY, _enabled ? '1' : '0'); } catch { /* privat läge m.m. */ }
  return _enabled;
}
export const toggleSnap = () => setSnapEnabled(!_enabled);

export const isAltHeld = () => _alt;
export function setAltHeld(on) { _alt = !!on; }

/** Gäller snappningen just nu? */
export const snapActive = () => _enabled && !_alt;

/** För tester: läs om inställningen ur localStorage. */
export function _reloadSnapSetting() { _enabled = _load(); _alt = false; }

// ── Sökning ─────────────────────────────────────────────────────────────────

/**
 * Snappmålet närmast (px,py), eller null.
 * @param {object} state
 * @param {number} px, py   skärmpixlar
 * @param {(E,N)=>{x,y}} project
 * @param {number} radius   skärmpixlar
 * @returns {null | { kind:'net'|'point'|'vertex'|'line'|'edge', ref:'net'|'visual'|null,
 *                    id:string|null, objId:string|null, E:number, N:number, label:string }}
 *   ref/id är satta för punktmål (en befintlig punkt att fästa i); för mål på
 *   en linje eller kant är de null – där skapas en ny punkt på (E,N).
 */
export function findSnapTarget(state, px, py, project, radius) {
  let best = null, bestD = Infinity;
  const pröva = (d, t) => { if (d <= radius && d < bestD) { bestD = d; best = t; } };

  const näthits = [];   // nätpunkter inom radien, med skärmläge
  for (const p of state.pts || []) {
    const c = project(p.E, p.N);
    const t = { kind: 'net', ref: 'net', id: p.id, objId: p.id, E: p.E, N: p.N, label: `nätpunkt ${p.id}` };
    const d = Math.hypot(c.x - px, c.y - py);
    if (d <= radius) näthits.push({ c, t });
    pröva(d, t);
  }
  for (const p of state.visualPts || []) {
    if (!isVisualObjVisible(p, state)) continue;
    const c = project(p.E, p.N);
    const hörn = p.role === 'vertex';
    pröva(Math.hypot(c.x - px, c.y - py),
      { kind: hörn ? 'vertex' : 'point', ref: 'visual', id: p.id, objId: p.id, E: p.E, N: p.N,
        label: `${hörn ? 'hörn' : 'punkt'} ${visualPtLabel(p)}` });
  }
  // En visuell punkt på (nästan) samma ställe som en nätpunkt: nätpunkten vinner.
  if (best && best.ref === 'visual') {
    const b = project(best.E, best.N);
    const nät = näthits.find(h => Math.hypot(h.c.x - b.x, h.c.y - b.y) <= SAME_SPOT_PX);
    if (nät) return nät.t;
  }
  if (best) return best;

  // Inga punkter inom radien: närmaste punkt på en linje eller ytkant.
  const segment = (a, b, kind, obj) => {
    const A = project(a[0], a[1]), B = project(b[0], b[1]);
    const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
    const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - A.x) * dx + (py - A.y) * dy) / l2));
    const d = Math.hypot(px - (A.x + t * dx), py - (A.y + t * dy));
    // Kartprojektionen är lokalt affin, så samma t gäller i plan.
    pröva(d, { kind, ref: null, id: null, objId: obj.id,
      E: a[0] + t * (b[0] - a[0]), N: a[1] + t * (b[1] - a[1]),
      label: kind === 'line' ? `på linje ${obj.name || obj.id}` : `på ytkant ${obj.name || obj.id}` });
  };
  for (const l of state.visualLines || []) {
    if (!isVisualObjVisible(l, state)) continue;
    for (const [a, b] of visualLineSegments(l, state) || []) segment(a, b, 'line', l);
  }
  for (const a of state.visualAreas || []) {
    if (!isVisualObjVisible(a, state)) continue;
    const c = visualAreaCoords(a, state);
    if (!c) continue;
    for (let i = 0; i < c.length; i++) segment(c[i], c[(i + 1) % c.length], 'edge', a);
  }
  return best;
}

// ── Markör ──────────────────────────────────────────────────────────────────

/**
 * Snappmarkören: grön ring med prick för punktmål, grön romb för mål på en
 * linje eller kant, och en kort text bredvid ("hörn U101", "på linje VL3").
 */
export function drawSnapMarker(ctx, p, target, { fade = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#00ff88';
  ctx.fillStyle = '#00ff88';
  ctx.lineWidth = 2;
  if (target.ref) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 8, p.y); ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x - 8, p.y);
    ctx.closePath(); ctx.stroke();
  }
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(7,13,24,0.8)';
  ctx.strokeText(target.label, p.x + 14, p.y - 12);
  ctx.fillText(target.label, p.x + 14, p.y - 12);
  ctx.restore();
}
