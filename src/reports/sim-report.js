// Simuleringsrapport – implementeras i Fas 6.
import { getState } from '../state/store.js';

export function exportSimReport() {
  const { simResult, pts, meas } = getState();
  if (!simResult?.ok) { alert("Kör simulering först."); return; }
  const lines = [
    "NätSim – Simuleringsrapport",
    "=".repeat(40),
    `Punkter: ${pts.length}  Mätningar: ${meas.length}`,
    `k-tal: ${simResult.K_global.toFixed(3)} (${simResult.K_class})`,
    `Redundans f: ${simResult.redundancy}`,
    "",
    "PUNKTOSÄKERHETER",
    ...simResult.ptResults.map(p => `${p.id}: σ_pos=${(p.sigPos*1000).toFixed(2)} mm`),
  ];
  const blob = new Blob([lines.join("\n")], { type:"text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "simuleringsrapport.txt";
  a.click();
}
