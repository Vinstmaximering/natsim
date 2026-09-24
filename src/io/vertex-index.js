// Deduplicering av hörn vid import (Etapp 3, delad med Etapp 6).
//
// Två hörn närmare varandra än toleransen är samma hörn. Både Geo Professional
// och CAD-program skriver ut hörnen per linje, så ett hörn som delas av två
// linjer förekommer flera gånger med identiska koordinater. Utan deduplicering
// blir en kontur en samling lösa segment i stället för en sammanhängande kedja.
export const VERTEX_DEDUP_TOL_M = 0.0005;

// Rutnät med cellstorlek = toleransen. Identiska koordinater hamnar alltid i
// samma cell; grannceller genomsöks också så att ett par som råkar hamna på var
// sin sida om en cellgräns ändå hittas.
export class VertexIndex {
  constructor(tol = VERTEX_DEDUP_TOL_M) {
    this.tol = tol;
    this.cells = new Map();
  }
  _q(v) { return Math.round(v / this.tol); }
  // H jämförs med: två hörn på samma plankoordinat men olika höjd är olika
  // hörn. Saknad höjd (null) matchar bara saknad höjd.
  _sameH(a, b) {
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) <= this.tol;
  }
  find(E, N, H) {
    const cx = this._q(E), cy = this._q(N);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(`${cx + dx}|${cy + dy}`);
        if (!bucket) continue;
        for (const v of bucket) {
          if (Math.abs(v.E - E) <= this.tol && Math.abs(v.N - N) <= this.tol && this._sameH(v.H, H))
            return v.id;
        }
      }
    }
    return null;
  }
  add(E, N, H, id) {
    const key = `${this._q(E)}|${this._q(N)}`;
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push({ E, N, H, id });
  }
}

// ── Slutna linjer som ytor (Lager-verktyg Etapp 3) ───────────────────────────

/**
 * Hörnen i en sluten linje som ytans ring, eller null om linjen inte är sluten
 * eller har färre än tre skilda hörn. ids är hörnens punkt-id:n efter
 * dedupliceringen. Sluten betyder flaggan i filen (.geo flagga 1, DXF grupp 70
 * bit 1) eller att första hörnet upprepas sist – dedupliceringen har då gett
 * sista och första hörnet samma id. Upprepade grannhörn slås ihop.
 */
export function closedRing(ids, closedFlag) {
  const ring = [];
  for (const id of ids || []) if (ring[ring.length - 1] !== id) ring.push(id);
  const upprepad = ring.length > 1 && ring[0] === ring[ring.length - 1];
  if (upprepad) ring.pop();
  if (!(closedFlag || upprepad)) return null;
  return new Set(ring).size >= 3 ? ring : null;
}

/**
 * Räknas en inläst linje som sluten? För dialogernas antal, innan hörnen
 * dedupliceras: flaggan, eller första hörnet upprepat sist (inom toleransen).
 * Kräver minst tre skilda hörn, som closedRing().
 */
export function isClosedPolyline(vertices, closedFlag, tol = VERTEX_DEDUP_TOL_M) {
  const vs = vertices || [];
  const E = v => v.E ?? v.x, N = v => v.N ?? v.y;
  const a = vs[0], b = vs[vs.length - 1];
  const upprepad = vs.length > 3 && Math.abs(E(a) - E(b)) <= tol && Math.abs(N(a) - N(b)) <= tol;
  if (!(closedFlag || upprepad)) return false;
  return vs.length - (upprepad ? 1 : 0) >= 3;
}
