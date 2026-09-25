// Dela in i punkter (Polylinjer Etapp 5): punkter längs en polylinje, en
// sluten polylinje, en yta eller en cirkel. Rena funktioner plus skapandet.
//
// Läge: ett antal punkter jämnt fördelade, eller ett fast avstånd längs
// linjen (sista biten blir en rest). Avstånden mäts längs linjen i plan.
//
// Öppen polylinje: börjar i första hörnet. Start- och slutpunkt kan tas med
// eller inte:
//   antal N, båda med:    delning L/(N−1), punkter 0 … L
//   bara start:           delning L/N,     punkter 0 … L − delning
//   bara slut:            delning L/N,     punkter delning … L
//   ingen:                delning L/(N+1), punkter delning … L − delning
//   fast avstånd d:       0 (om start med), d, 2d, … < L, och L om slut med
// Sluten polylinje och yta: börjar i första hörnet och går runt; start och
// slut är samma punkt och tas med en gång. Antal N ger delningen omkrets/N.
// Cirkel: som en sluten linje, men startpunkten anges som en riktning från
// centrum i gon (medurs från norr), och punkterna ligger på den exakta
// cirkeln – inte på polygonen som ritas.
//
// Punkterna blir fria visuella punkter (inte hörn) i aktivt lager, med namnen
// prefix + löpnummer: P1, P2, … Ångra-steget sparar anroparen.
import { getState } from './store.js';
import {
  findVisualLine, findVisualArea, findVisualCircle, visualLineCoords, visualAreaCoords,
  circleCenter, lineSegments, ensureActiveVisualLayer, addVisualPt,
} from './visual.js';
import { planDistance } from './line-geometry.js';

export const DIVIDE_MAX_POINTS = 10000;
const EPS = 1e-9;
const GON = Math.PI / 200;

/** Källan: typ, om den är sluten, längd och geometri. null om den saknas. */
export function divideSource(id, state = getState()) {
  const circle = (state.visualCircles || []).find(c => c.id === id);
  if (circle) {
    const m = circleCenter(circle, state);
    if (!m) return null;
    return { kind: 'circle', obj: circle, closed: true, center: m, radius: circle.radius,
             length: 2 * Math.PI * circle.radius };
  }
  const line = (state.visualLines || []).find(l => l.id === id);
  const area = !line && (state.visualAreas || []).find(a => a.id === id);
  const obj = line || area;
  if (!obj) return null;
  const coords = line ? visualLineCoords(line, state) : visualAreaCoords(area, state);
  if (!coords) return null;
  const closed = line ? line.closed === true : true;
  const segs = lineSegments(coords, closed);
  return { kind: line ? 'line' : 'area', obj, closed, coords, segs,
           length: segs.reduce((s, [a, b]) => s + planDistance(a, b), 0) };
}

// Läget s meter längs källan.
function läge(src, s, startGon) {
  if (src.kind === 'circle') {
    const t = startGon * GON + s / src.radius;
    return { E: src.center.E + src.radius * Math.sin(t), N: src.center.N + src.radius * Math.cos(t) };
  }
  let kvar = s;
  for (const [a, b] of src.segs) {
    const l = planDistance(a, b);
    if (kvar <= l + EPS || b === src.segs[src.segs.length - 1][1]) {
      const t = l > 0 ? Math.min(1, Math.max(0, kvar / l)) : 0;
      return { E: a[0] + t * (b[0] - a[0]), N: a[1] + t * (b[1] - a[1]) };
    }
    kvar -= l;
  }
  const sista = src.segs[src.segs.length - 1][1];
  return { E: sista[0], N: sista[1] };
}

/**
 * Var punkterna hamnar.
 * @param {object} src  divideSource()
 * @param {{ mode:'count'|'distance', count?:number, distance?:number, startGon?:number,
 *           includeStart?:boolean, includeEnd?:boolean }} o
 * @returns {{ positions:{E,N}[], spacing:number|null, spacingGon:number|null, rest:number|null,
 *             error:null|'count'|'distance'|'many'|'none' }}
 */
export function divisionPositions(src, o) {
  const L = src.length;
  const res = (s, spacing, rest = null) => {
    if (s.length > DIVIDE_MAX_POINTS) return { positions: [], spacing, spacingGon: null, rest, error: 'many' };
    if (!s.length) return { positions: [], spacing, spacingGon: null, rest, error: 'none' };
    return {
      positions: s.map(x => läge(src, x, Number(o.startGon) || 0)),
      spacing,
      spacingGon: src.kind === 'circle' && spacing !== null ? (spacing / src.radius) / GON : null,
      rest, error: null,
    };
  };
  const S = o.includeStart !== false, E = o.includeEnd !== false;

  if (o.mode === 'distance') {
    const d = Number(o.distance);
    if (!(d > 0) || !Number.isFinite(d)) return { positions: [], spacing: null, spacingGon: null, rest: null, error: 'distance' };
    if (L / d > DIVIDE_MAX_POINTS) return { positions: [], spacing: d, spacingGon: null, rest: null, error: 'many' };
    const hela = Math.floor(L / d + EPS);
    let rest = L - hela * d;
    if (rest < 1e-9) rest = 0;
    const s = [];
    if (src.closed) {
      for (let k = 0; k * d < L - EPS; k++) s.push(k * d);
    } else {
      for (let x = S ? 0 : d; x < L - EPS; x += d) s.push(x);
      if (E) s.push(L);
    }
    return res(s, d, rest);
  }

  const N = Number(o.count);
  if (!Number.isInteger(N) || N < 1) return { positions: [], spacing: null, spacingGon: null, rest: null, error: 'count' };
  if (N > DIVIDE_MAX_POINTS) return { positions: [], spacing: null, spacingGon: null, rest: null, error: 'many' };
  if (src.closed) {
    const sp = L / N;
    return res(Array.from({ length: N }, (_, k) => k * sp), sp);
  }
  if (S && E) {
    if (N === 1) return res([0], null);
    const sp = L / (N - 1);
    return res(Array.from({ length: N }, (_, k) => k * sp), sp);
  }
  const sp = S || E ? L / N : L / (N + 1);
  return res(Array.from({ length: N }, (_, k) => (S ? k : k + 1) * sp), sp);
}

/** "P1–P8" / "P1" för n punkter. */
export const divisionNames = (prefix, n) => (n <= 1 ? `${prefix}1` : `${prefix}1–${prefix}${n}`);

/**
 * Skapar punkterna i aktivt lager. Returnerar deras id:n, eller null när
 * indelningen inte går att göra.
 */
export function createDivisionPoints(id, o, prefix = 'P') {
  const src = divideSource(id);
  if (!src) return null;
  const r = divisionPositions(src, o);
  if (r.error) return null;
  const layerId = ensureActiveVisualLayer();
  const p = String(prefix ?? '').trim() || 'P';
  return r.positions.map(({ E, N }, i) => addVisualPt({ E, N, layerId, name: `${p}${i + 1}`, role: 'point' }));
}

// Källan finns? (för UI:t)
export const isDivideSource = id => !!(findVisualLine(id) || findVisualArea(id) || findVisualCircle(id));
