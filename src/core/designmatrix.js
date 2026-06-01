// Kopierad exakt från NätSim_Beta_2.html rad 561–577 + 567–568 (fG/fD).
// calcM tar pts som explicit parameter (ej global) – enda strukturella ändringen.
import { R, D } from './constants.js';

// Avstånd i meter direkt från E,N – rad 561
export const d2EN = (a, b) => Math.sqrt((b.E - a.E) ** 2 + (b.N - a.N) ** 2);

// Bäring i grader (norr=0, medsols) från E,N – rad 563
export const brgEN = (a, b) => {
  let v = D(Math.atan2(b.E - a.E, b.N - a.N));
  return v < 0 ? v + 360 : v;
};

// Vinkelformatering – rad 567–568 exakt
export function fG(d) {
  const g=d/0.9,gi=Math.floor(g),mn=(g-gi)*100,mi=Math.floor(mn),s=(mn-mi)*100;
  return `${String(gi).padStart(3,"0")}g${String(mi).padStart(2,"0")}'${s.toFixed(1).padStart(4,"0")}"`;
}
export function fD(d) {
  const di=Math.floor(d),m=Math.floor((d-di)*60),s=((d-di)*60-m)*60;
  return `${di}°${String(m).padStart(2,"0")}'${s.toFixed(1).padStart(4,"0")}"`;
}

// Geometriska egenskaper för en mätning – rad 571–577
export function calcM(m, pts) {
  const p1 = pts.find(p => p.id === m.from);
  const p2 = pts.find(p => p.id === m.to);
  if (!p1 || !p2) return null;
  const dc = d2EN(p1, p2), bc = brgEN(p1, p2);
  return {
    dc, bc,
    dist: m.measDist != null ? m.measDist : dc,
    hz:   m.measHz   != null ? m.measHz   : bc,
    dE: dc * Math.sin(R(bc)),
    dN: dc * Math.cos(R(bc)),
    p1, p2
  };
}
