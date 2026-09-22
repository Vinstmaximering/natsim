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
