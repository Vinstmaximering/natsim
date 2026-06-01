// GEO-fil import/export – implementeras fullt i Fas 6.
import { getState, setState } from '../state/store.js';
import { showToast } from '../ui/toast.js';

export function importGeoFile(text, filename) {
  const lines = text.split(/\r?\n/);
  const pts = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [id, , N, E, H] = parts;
    if (isNaN(parseFloat(N)) || isNaN(parseFloat(E))) continue;
    pts.push({ id, type:"known", E:parseFloat(E), N:parseFloat(N), H:parseFloat(H)||0 });
  }
  if (!pts.length) { showToast("Inga punkter hittades i .geo-filen.", "#ff5050"); return; }
  const { pts: existing } = getState();
  setState({ pts: [...existing, ...pts], simResult: null });
  showToast(`✓ Importerade ${pts.length} punkter från ${filename}`, "#00ff88");
  import('../map/leaflet-setup.js').then(m => { m.draw(); m.resetView(); });
}

export function exportGeoFile() {
  const { pts, activeCRS } = getState();
  const lines = ["##ObjectType SBGObjectText V2.0", `##CRS ${activeCRS}`, ""];
  pts.forEach(pt => {
    lines.push(`${pt.id}\t\t${pt.N.toFixed(4)}\t${pt.E.toFixed(4)}\t${(pt.H||0).toFixed(4)}`);
  });
  const blob = new Blob([lines.join("\n")], { type:"text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "punkter.geo";
  a.click();
}
