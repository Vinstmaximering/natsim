// Projekt-export/-import – implementeras i Fas 6.
import { getState, setState } from '../state/store.js';

export function saveProject() {
  const { pts, meas, centerErr, activeCRS, activeLayerKey, nMid } = getState();
  const snapshot = { ver:2, pts, meas, centerErr, activeCRS, activeLayerKey, nMid };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "natsim-projekt.json";
  a.click();
}

export function loadProject(text) {
  try {
    const s = JSON.parse(text);
    if (!s || (s.ver !== 2 && s.ver !== 1)) { alert("Ogiltigt projektformat."); return; }
    setState({
      pts:  (s.pts  || []).map(p => { delete p.x; delete p.y; return p; }),
      meas: s.meas  || [],
      centerErr:    s.centerErr ?? 1.0,
      activeCRS:    s.activeCRS ?? "sweref99tm",
      activeLayerKey: s.activeLayerKey ?? "osm",
      nMid:         s.nMid ?? 1,
      simResult:    null,
    });
    import('../map/leaflet-setup.js').then(({ buildCRSSel, setMapLayer, resetView }) => {
      buildCRSSel(); setMapLayer(s.activeLayerKey ?? "osm");
      setTimeout(resetView, 200);
    });
  } catch (e) {
    alert("Kunde inte läsa projektfilen: " + e.message);
  }
}
