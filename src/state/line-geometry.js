// Plangeometri för linjer och mätverktyget (Polylinjer Etapp 2).
//
// Rena funktioner på [E,N] i koordinatsystemets projektionsplan – samma
// koordinater som resten av NätSim räknar i, utan skalfaktor eller
// höjdreduktion. Därför står "(plan)" vid varje längd och riktning.
//
// Riktning i gon, medurs från norr (geodetisk bäring): 0 gon = +N,
// 100 gon = +E, 200 gon = −N, 300 gon = −E. Längder i meter.
// Hör inte till src/core/ – linjerna är visuella och deltar aldrig i
// beräkningen.
import { groupThousands } from './area-geometry.js';

const NBSP = String.fromCharCode(0xa0);
const GON_PER_RAD = 200 / Math.PI;

/** Avstånd i plan mellan [E,N] a och b. */
export const planDistance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Riktning a → b i gon, [0, 400), medurs från norr. null när punkterna
 * sammanfaller – då finns ingen riktning.
 */
export function bearingGon(a, b) {
  const dE = b[0] - a[0], dN = b[1] - a[1];
  if (dE === 0 && dN === 0) return null;
  const g = Math.atan2(dE, dN) * GON_PER_RAD;
  return g < 0 ? g + 400 : g;
}

/**
 * Längd och segment för en polylinje. coords utan upprepat sluthörn; closed
 * lägger till segmentet sista → första.
 * @returns {{ length:number, segments: Array<{from:number, to:number, length:number, bearing:number|null}> }}
 *   from/to är hörnens index i coords.
 */
export function lineStats(coords, closed = false) {
  const n = coords?.length || 0;
  const segments = [];
  for (let i = 0; i + 1 < n; i++) segments.push({ from: i, to: i + 1 });
  if (closed && n >= 3) segments.push({ from: n - 1, to: 0 });
  let length = 0;
  for (const s of segments) {
    s.length  = planDistance(coords[s.from], coords[s.to]);
    s.bearing = bearingGon(coords[s.from], coords[s.to]);
    length += s.length;
  }
  return { length, segments };
}

/**
 * Mätverktygets värden mellan två punkter {E, N, H}. H null betyder att
 * punkten saknar höjd; ΔH är då null.
 */
export function measureBetween(a, b) {
  const dE = b.E - a.E, dN = b.N - a.N;
  const hA = Number.isFinite(a.H) ? a.H : null, hB = Number.isFinite(b.H) ? b.H : null;
  return {
    S: Math.hypot(dE, dN),
    bearing: bearingGon([a.E, a.N], [b.E, b.N]),
    dN, dE,
    dH: hA !== null && hB !== null ? hB - hA : null,
  };
}

// ── Formatering ──────────────────────────────────────────────────────────────

/** "12,345 m" – tre decimaler, hårt mellanslag som tusentalsavgränsare. */
export function formatMeters(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '–';
  return `${groupThousands(m, 3)}${NBSP}m`;
}

/** "+12,345 m" / "−12,345 m" – för ΔN, ΔE och ΔH. */
export function formatDelta(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '–';
  const s = formatMeters(m);
  // Ett värde som avrundas till noll får inget tecken.
  return Number(m.toFixed(3)) === 0 ? s.replace('−', '') : (m > 0 ? `+${s}` : s);
}

/**
 * "123,4567 gon" – fyra decimaler. Ett värde som avrundas upp till 400
 * skrivs 0,0000: riktningen är densamma.
 */
export function formatGon(g) {
  if (g === null || g === undefined || !Number.isFinite(g)) return '–';
  let r = Number(g.toFixed(4));
  if (r >= 400) r -= 400;
  return `${r.toFixed(4).replace('.', ',')}${NBSP}gon`;
}
