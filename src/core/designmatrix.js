// Kopierad exakt från NätSim_Beta_2.html rad 561–577 + 567–568 (fG/fD).
// calcM tar pts som explicit parameter (ej global) – enda strukturella ändringen.
import { R, D } from './constants.js';

// Avstånd i meter direkt från E,N – rad 561
export const d2EN = (a, b) => Math.sqrt((b.E - a.E) ** 2 + (b.N - a.N) ** 2);

// Returnerar true för typ "station" och för känd punkt med isStation: true.
// Används för att identifiera alla uppställningspunkter oavsett ursprungstyp.
// Låg i ui/right-panel.js till Etapp E; optimeringskärnan behöver samma
// predikat och core/ får inte importera från ui/.
export function isStationPoint(p) {
  return p.type === "station" || (p.type === "known" && p.isStation === true);
}

// Bäring i grader (norr=0, medsols) från E,N – rad 563
export const brgEN = (a, b) => {
  let v = D(Math.atan2(b.E - a.E, b.N - a.N));
  return v < 0 ? v + 360 : v;
};

// Vinkelformatering – BORTTAGEN i UI-städning Omgång 2 (2026-09-11).
//
// Här låg fG() och fD() (rad 567–568 i NätSim_Beta_2.html). fG gav
// hybridformatet 123g45'67.8" och fD gav DMS 123°45'67.8". Båda var rena
// visningsfunktioner – ingen beräkning använde dem – och båda är ersatta av
// gon()/gonU() i core/format.js, som ger rena gon-decimaler.
//
// Hybridformatet togs bort för att det användes på åtta ytor samtidigt som
// fyra andra ytor visade samma storhet i decimalgrader, och DMS-växlaren
// (state.au) togs bort eftersom den bara nådde fyra av dessa åtta.
// Se docs/troubleshooting/ui_inventering_20260910.md avsnitt A och B, punkt 5.
//
// Kärnan räknar fortfarande i GRADER – brgEN() nedan är oförändrad. Bara
// visningen är gon.

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
