// Kopierad exakt från NätSim_Beta_2.html rad 3538–3643 (getState + applyState + saveProject).
// JSON-format ver:2 – bakåtkompatibelt med ver:1 (gamla .json-filer).
// KRITISKT: ändra inte fältnamnen i save-objektet utan att uppdatera applyState.
import { getState, setState } from '../state/store.js';
import { CRS_DEFS } from '../core/constants.js';
import { showToast } from '../ui/toast.js';

// ── Serialisera state till spara-objekt – rad 3538–3551 ─────────────────────
function buildSnapshot() {
  const s = getState();
  return {
    ver: 2,
    pts:  JSON.parse(JSON.stringify(s.pts)),
    meas: JSON.parse(JSON.stringify(s.meas)),
    activeCRS:    s.activeCRS    || "sweref99tm",
    activeLayerKey: s.activeLayerKey || "osm",
    centerErr:    s.centerErr    ?? 1.0,
    defaultInstr: s.defaultInstr || "ts16_1",
    symSize:      s.symSize      ?? 10,
    ellScale:     s.ellScale     ?? 50,
    ellipsMode:   s.ellipsMode   || "1sig",
    au:           s.au           || "grad",
    nMid:         s.nMid         ?? 1,
    // Kartläge sparas i mån av tillgång (används vid öppning)
    mapCenter: (() => {
      try {
        const m = document.getElementById("leaflet-map")?._leaflet_map;
        if (m) return { lat: m.getCenter().lat, lng: m.getCenter().lng };
      } catch {}
      return { lat: 59.33, lng: 18.07 };
    })(),
    mapZoom: (() => {
      try {
        const m = document.getElementById("leaflet-map")?._leaflet_map;
        if (m) return m.getZoom();
      } catch {}
      return 14;
    })(),
  };
}

// ── Spara projekt – rad 3616–3624 exakt ─────────────────────────────────────
export function saveProject() {
  const snapshot = buildSnapshot();
  const name = `stomnät_${new Date().toISOString().slice(0,16).replace("T","_").replace(":","-")}.json`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type:"application/json" }));
  a.download = name;
  a.click();
  const el = document.getElementById("autosave-status");
  if (el) el.textContent = `Sparad som ${name}`;
}

// ── Ladda projekt från JSON-text – bakåtkompatibelt med ver:1 och ver:2 ────
// Bakåtkompatibilitet: ver:1-filer hade samma fältnamn som ver:2 – rad 3553–3587 exakt.
export function loadProject(text) {
  let s;
  try { s = JSON.parse(text); } catch (e) { alert("Felaktig JSON-fil: " + e.message); return false; }
  if (!s || (s.ver !== 2 && s.ver !== 1)) {
    alert("Kunde inte läsa projektfilen – fel format eller version.\n\nFilen måste vara skapad av NätSim v1 eller v2.");
    return false;
  }

  // Strip v1-format x/y-fält (pixelkoordinater som inte längre används) – rad 3557–3558
  const pts  = (s.pts  || []).map(p => { const { x, y, ...rest } = p; return rest; });
  const meas = s.meas || [];

  setState({
    pts,
    meas,
    activeCRS:    s.activeCRS     || "sweref99tm",
    activeLayerKey: s.activeLayerKey || "osm",
    centerErr:    s.centerErr  != null ? s.centerErr  : 1.0,
    defaultInstr: s.defaultInstr   || "ts16_1",
    symSize:      s.symSize        ?? 10,
    ellScale:     s.ellScale       ?? 50,
    ellipsMode:   s.ellipsMode     || "1sig",
    au:           s.au             || "grad",
    nMid:         s.nMid           ?? 1,
    simResult:    null,
  });

  // Synka UI-sliders om de finns
  const symSlider = document.getElementById("sym-size");
  if (symSlider) { symSlider.value = s.symSize || 10; const sv=document.getElementById("sym-val"); if(sv)sv.textContent=(s.symSize||10)+"px"; }
  const ellSlider = document.getElementById("ell-scale");
  if (ellSlider) { ellSlider.value = s.ellScale || 50; const ev=document.getElementById("ell-val"); if(ev)ev.textContent=(s.ellScale||50)+"×"; }
  const ceEl = document.getElementById("center-err");
  if (ceEl) ceEl.value = s.centerErr ?? 1.0;

  // Uppdatera karta
  import('../map/leaflet-setup.js').then(({ buildCRSSel, setMapLayer, resetView, map: leafletMap }) => {
    buildCRSSel();
    setMapLayer(s.activeLayerKey || "osm");
    if (s.mapCenter && leafletMap) {
      leafletMap.setView([s.mapCenter.lat, s.mapCenter.lng], s.mapZoom || 14);
    } else if (pts.length > 0) {
      setTimeout(resetView, 200);
    }
    import('../map/leaflet-setup.js').then(({ draw }) => draw());
  });

  const el = document.getElementById("autosave-status");
  if (el) el.textContent = "Projekt laddat";
  return true;
}
