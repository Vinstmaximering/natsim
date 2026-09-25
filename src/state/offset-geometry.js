// Offset av polylinjer och ytor i plan (Polylinjer Etapp 4). Rena funktioner.
//
// Varje segment flyttas avståndet d åt vald sida. "Höger" är höger om
// linjens riktning från första till sista hörnet. Hörnen:
//
//   Inre hörn (offsetlinjerna möts): skärningen mellan de flyttade kanterna.
//   Yttre hörn, skarpa: kanterna förlängs till skärningen (gering). Är
//     skärningen längre bort från hörnet än MITER_LIMIT · d – vid en spetsig
//     vinkel, mindre än 28,96° mellan kanterna – fasas hörnet av i stället:
//     två punkter, där kanterna slutar.
//   Yttre hörn, rundade: en båge runt hörnet med radien d, approximerad med
//     hörn så tätt att kordan avviker högst ARC_TOL (1 mm) från bågen.
//
// Resultatet kontrolleras:
//   'collapsed' – något segment vänder riktning i offsetlinjen. Händer när
//                 avståndet är större än vad en krök eller ett kort segment
//                 rymmer på insidan (t.ex. inåt i en smal rektangel).
//   'self'      – offsetlinjen korsar sig själv.
// Ett resultat med problem ska inte skapas; förhandsvisningen visar varför.
import { signedArea, isSelfIntersecting, segmentsTouch } from './area-geometry.js';

export const MITER_LIMIT = 4;      // gering högst 4 · d från hörnet, annars avfasning
export const ARC_TOL = 0.001;      // m – kordans största avvikelse från bågen

const EPS = 1e-12;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

// Upprepade grannhörn bort; i en sluten linje även första hörnet upprepat sist.
function städa(coords, closed) {
  const out = [];
  for (const c of coords || []) {
    const s = out[out.length - 1];
    if (!s || Math.hypot(c[0] - s[0], c[1] - s[1]) > 1e-9) out.push([c[0], c[1]]);
  }
  if (closed && out.length > 1) {
    const [a, b] = [out[0], out[out.length - 1]];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9) out.pop();
  }
  return out;
}

/** Hur tätt en båge med radien r måste delas för att kordan ska avvika högst tol. */
export function arcStep(r, tol = ARC_TOL) {
  if (r <= tol) return Math.PI / 2;
  return 2 * Math.acos(1 - tol / r);
}

/**
 * Offset av en polylinje.
 * @param {number[][]} coords  [[E,N], …], utan upprepat sluthörn
 * @param {{ distance:number, side:1|-1, corners?:'sharp'|'round', closed?:boolean }} p
 *   side +1 = höger om riktningen, −1 = vänster.
 * @returns {{ coords:number[][], closed:boolean, problem:null|'collapsed'|'self'|'few' }}
 */
export function offsetPolyline(coords, { distance: d, side, corners = 'sharp', closed = false }) {
  const pts = städa(coords, closed);
  const n = pts.length;
  if (n < 2 || (closed && n < 3) || !(d > 0)) return { coords: [], closed, problem: 'few' };

  const nSeg = closed ? n : n - 1;
  const dir = [], nor = [];
  for (let i = 0; i < nSeg; i++) {
    const v = sub(pts[(i + 1) % n], pts[i]);
    const l = Math.hypot(v[0], v[1]);
    dir.push([v[0] / l, v[1] / l]);
    nor.push(mul([v[1] / l, -v[0] / l], side));     // höger normal · sida
  }

  const out = [];
  const start = new Array(nSeg), slut = new Array(nSeg);   // varje segments ändar i resultatet

  // Hörn j mellan segment ia (slutar i j) och ib (börjar i j).
  const hörn = (j, ia, ib) => {
    const P = pts[j], na = nor[ia], nb = nor[ib];
    const A = add(P, mul(na, d)), B = add(P, mul(nb, d));
    const kr = cross(dir[ia], dir[ib]);
    const rakt = Math.abs(kr) < EPS && dot(dir[ia], dir[ib]) > 0;
    if (rakt) { out.push(A); slut[ia] = A; start[ib] = A; return; }
    const yttre = kr * side > 0 || Math.abs(kr) < EPS;     // vändning räknas som yttre
    const k = 1 + dot(na, nb);
    if (!yttre) {
      const M = add(P, mul(add(na, nb), d / k));
      out.push(M); slut[ia] = M; start[ib] = M;
      return;
    }
    if (corners === 'round') {
      const vinkel = Math.abs(kr) < EPS ? side * Math.PI : Math.atan2(cross(na, nb), dot(na, nb));
      const a0 = Math.atan2(na[1], na[0]);
      const steg = Math.max(1, Math.ceil(Math.abs(vinkel) / arcStep(d)));
      for (let s = 0; s <= steg; s++) {
        const a = a0 + (vinkel * s) / steg;
        out.push(add(P, [d * Math.cos(a), d * Math.sin(a)]));
      }
      slut[ia] = A; start[ib] = B;
      return;
    }
    if (k > EPS) {
      const M = add(P, mul(add(na, nb), d / k));
      if (Math.hypot(M[0] - P[0], M[1] - P[1]) <= MITER_LIMIT * d + 1e-9) {
        out.push(M); slut[ia] = M; start[ib] = M;
        return;
      }
    }
    out.push(A, B); slut[ia] = A; start[ib] = B;           // avfasning
  };

  if (closed) {
    for (let j = 0; j < n; j++) hörn(j, (j - 1 + n) % n, j);
  } else {
    const a = add(pts[0], mul(nor[0], d));
    out.push(a); start[0] = a;
    for (let j = 1; j < n - 1; j++) hörn(j, j - 1, j);
    const b = add(pts[n - 1], mul(nor[nSeg - 1], d));
    out.push(b); slut[nSeg - 1] = b;
  }

  // Ett segment som vänt riktning har ätits upp av grannarna.
  for (let i = 0; i < nSeg; i++) {
    if (dot(sub(slut[i], start[i]), dir[i]) <= 1e-9) return { coords: out, closed, problem: 'collapsed' };
  }
  const korsar = closed ? isSelfIntersecting(out) : openSelfIntersects(out);
  return { coords: out, closed, problem: korsar ? 'self' : null };
}

/** Korsar en öppen polylinje sig själv? Grannsegment räknas inte. */
export function openSelfIntersects(c) {
  for (let i = 0; i + 1 < c.length; i++)
    for (let j = i + 2; j + 1 < c.length; j++)
      if (segmentsTouch(c[i], c[i + 1], c[j], c[j + 1])) return true;
  return false;
}

/**
 * Sidorna för ett objekt. Öppen linje: 'right' | 'left' | 'both'.
 * Sluten linje och yta: 'out' | 'in' | 'both'. Utåt är höger om
 * riktningen när hörnen går moturs (positiv area), annars vänster.
 * @returns {Array<{ key:'right'|'left'|'out'|'in', side:1|-1 }>}
 */
export function offsetSides(coords, closed, choice) {
  if (!closed) {
    const alla = [{ key: 'right', side: 1 }, { key: 'left', side: -1 }];
    return choice === 'both' ? alla : alla.filter(s => s.key === choice);
  }
  const ut = signedArea(coords) > 0 ? 1 : -1;
  const alla = [{ key: 'out', side: ut }, { key: 'in', side: -ut }];
  return choice === 'both' ? alla : alla.filter(s => s.key === choice);
}
