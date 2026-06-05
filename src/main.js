import './styles/main.css';
import 'leaflet/dist/leaflet.css';

import { openStudio, closeStudio, bindKeyboardShortcut, initStudioForTab } from './ui/studio.js';
import { render as renderNetStudio }  from './ui/studio-views/net-studio.js';
import { render as renderMeasStudio } from './ui/studio-views/measurements-studio.js';
import { render as renderSimStudio }  from './ui/studio-views/simulation-studio.js';
import { render as renderRepStudio }  from './ui/studio-views/report-studio.js';
window._openStudio  = openStudio;
window.closeStudio  = closeStudio;

import { getState, setState, setAutoSimHandler, subscribe } from './state/store.js';
// openPM definieras nedan (refererar till getState och map-imports)
import { autoSim, undo, setUndoCallbacks, saveUndo } from './state/undo.js';
import { loadAutosave, saveAutosave }           from './state/persistence.js';
import { initMap, draw, setDrawCallbacks, resize, map as leafletMap } from './map/leaflet-setup.js';
import { setInteractionCallbacks }              from './map/interactions.js';
import { showToast }                            from './ui/toast.js';
import { initOnboarding, hideOnboarding }       from './ui/onboarding.js';
import { initQualityPanel, updateQualityPanel } from './ui/quality-panel.js';
import { initToolbar, buildTools, setTool, togglePanel, clearAll, toggleAU, toggleMapLayer } from './ui/toolbar.js';
import { updatePtList, initLeftPanel }          from './ui/left-panel.js';
import { buildTabs, setTab, renderTab, initRightPanel, applyMatklass } from './ui/right-panel.js';
import { initResize }                           from './ui/panel-resize.js';
import { openEditPt, openMM, closeModal }       from './ui/modals.js';
import { setMapRef }                             from './reports/net-image.js';
import { initImageBridge }                       from './main-image-bridge.js';
import { renderObstaclePanel }                   from './ui/obstacle-panel.js';

// ── 1. AutoSim ──────────────────────────────────────────────────────────────
setAutoSimHandler(autoSim);

// ── 2. Draw callbacks ───────────────────────────────────────────────────────
setDrawCallbacks({ updatePtList, renderTab });

// ── 3. Map interaction callbacks ────────────────────────────────────────────
setInteractionCallbacks({ openEditPt, openMM, buildTools, setTab, showToast, renderObsPanel: renderObstaclePanel });

// ── 3b. Bugg 3-fix: undo-callbacks (draw + toast direkt efter Ctrl+Z) ───────
setUndoCallbacks({ draw, updateQualityPanel, showToast });

// ── 4. Window-globals för index.html inline-onclick ─────────────────────────
window.setTool        = setTool;
window.togglePanel    = togglePanel;
window.clearAll       = clearAll;
window.toggleAU       = toggleAU;
window.toggleMapLayer = toggleMapLayer;
window.locateMe       = () => import('./map/leaflet-setup.js').then(m => m.locateMe());
window.resetView      = () => import('./map/leaflet-setup.js').then(m => m.resetView());
window.toggleCoordView = toggleCoordView;
window.openMM         = openMM;
window.openEditPt     = openEditPt;
window.closeModal     = closeModal;
window.undo           = undo;
window.setAutoSim     = on => import('./state/undo.js').then(m => m.setAutoSim(on));
window.draw           = draw;
window.saveProject       = () => import('./io/export-project.js').then(m => m.saveProject());
window.exportGeoFile     = () => import('./io/import-geo.js').then(m => m.exportGeoFile());
window.showExcelTemplate = () => import('./io/import-csv.js').then(m => m.showExcelTemplate());
window._downloadCSVTemplate = () => import('./io/import-csv.js').then(m => m.downloadCSVTemplate());
window._exportSimPDF     = () => import('./io/export-pdf.js').then(m => m.exportSimPDF());
window._exportCalcRep    = () => import('./reports/sim-report.js').then(m => m.exportCalcReport());
window._openMeasBook     = () => import('./reports/meas-book.js').then(m => m.openMeasBook());
window._exportMeasScheme = () => import('./reports/meas-book.js').then(m => m.exportMeasScheme());
window.cvSaveNewRow   = cvSaveNewRow;
window.cvAddRow       = () => { document.getElementById("cv-newrow")?.scrollIntoView({ behavior:"smooth" }); };
window.cvImportGeo    = () => document.getElementById("geo-fi")?.click();
window.cvExportGeo    = () => import('./io/import-geo.js').then(m => m.exportGeoFile());
window._applyMatklass = applyMatklass;
window._showValidationDialog = () => import('./ui/validation.js').then(m => m.showValidationDialog());
window._suggestMeas   = () => { import('./ui/right-panel.js').then(m => { m.suggestMeasurements(); draw(); renderTab(); }); };
window._exportRep     = () => import('./reports/sim-report.js').then(m => m.exportSimReport());
window._openPM        = () => openPM();
window._setTab        = setTab;
window._runSim        = () => { import('./core/simulation.js').then(m => { m.runSimulation(); updateQualityPanel(); draw(); renderTab(); }); };
window._mapZoomIn     = () => { const m = getState(); if (leafletMap) leafletMap.zoomIn(); };
window._mapZoomOut    = () => { if (leafletMap) leafletMap.zoomOut(); };

// ── 5. Autosave-lyssnare ───────────────────────────────────────────────────
let _saveTimer = null;
subscribe(() => {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveAutosave, 2000);
});

// ── 6. Initiera UI-paneler ─────────────────────────────────────────────────
initToolbar();
initLeftPanel();
initQualityPanel();
initOnboarding();

// ── 6b. Mobil-initialisering: paneler dolda som default på phone ───────────
if (window.innerWidth < 768) {
  document.getElementById("lp")?.classList.add("hidden");
  document.getElementById("rp")?.classList.add("hidden");
}

// ── 7. Initiera karta ──────────────────────────────────────────────────────
initMap();
setMapRef(leafletMap);
initImageBridge();

// ── 8. Ladda sparad data eller visa demo-data ──────────────────────────────
const loaded = loadAutosave();
if (!loaded) {
  setState({
    pts: [
      { id:"FP1", type:"known", E:6500100,    N:1620400,    H:45.23  },
      { id:"FP2", type:"known", E:6500312.45, N:1620554.78, H:46.112 },
    ],
    meas: [],
  });
}

// ── 9. Initiera höger-panel, studio-genvägar och rendera ──────────────────
initRightPanel();
bindKeyboardShortcut();
initStudioForTab('net',  { render: renderNetStudio });
initStudioForTab('meas', { render: renderMeasStudio });
initStudioForTab('sim',  { render: renderSimStudio });
initStudioForTab('rep',  { render: renderRepStudio });
initResize('lp', 'right');
initResize('rp', 'left');
buildTools();
updatePtList();
renderTab();

// ── 10. Dölja onboarding om punkter finns ─────────────────────────────────
if (getState().pts.length > 0) hideOnboarding();

// ── 11. Globala events ─────────────────────────────────────────────────────
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", saveAutosave);

// ── 12. Koordinatlista – toggle + render ────────────────────────────────────
let _coordViewOpen = false;

function toggleCoordView() {
  _coordViewOpen = !_coordViewOpen;
  const cv  = document.getElementById("coordview");
  const btn = document.getElementById("btn-coordview");
  if (!cv) return;
  cv.style.display = _coordViewOpen ? "flex" : "none";
  if (btn) {
    btn.style.background   = _coordViewOpen ? "#4fc3f744" : "#4fc3f722";
    btn.style.borderColor  = "#4fc3f7";
    btn.style.color        = "#4fc3f7";
  }
  if (_coordViewOpen) _renderCoordView();
}

function _renderCoordView() {
  const { pts, meas, activeCRS } = getState();
  const crsEl = document.getElementById("cv-crs-label");
  if (crsEl) crsEl.textContent = activeCRS;

  const tbody = document.getElementById("cv-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const typeLabels = { known:"Känd punkt", station:"Uppställning", new:"Ny punkt", detail:"Detaljpunkt", simstation:"Sim. uppst." };
  const typeColors = { known:"#00ff88", station:"#4fc3f7", new:"#ce93d8", detail:"#ffb74d", simstation:"#ff6090" };

  pts.forEach((pt, i) => {
    const mc = meas.filter(m => m.from === pt.id || m.to === pt.id).length;
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #1a2d48";
    tr.innerHTML = `
      <td style="padding:5px 6px;color:#506070;font-size:11px;">${i + 1}</td>
      <td style="padding:5px 6px;color:${typeColors[pt.type]||"#e8f4fd"};font-weight:bold;font-family:monospace;">${pt.id}</td>
      <td style="padding:5px 6px;color:#7090a8;font-size:11px;">${typeLabels[pt.type]||pt.type}</td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace;">${pt.N.toFixed(4)}</td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace;">${pt.E.toFixed(4)}</td>
      <td style="padding:5px 6px;text-align:right;font-family:monospace;">${pt.H ? pt.H.toFixed(3) : "–"}</td>
      <td style="padding:5px 6px;color:#7090a8;font-size:11px;">${mc || ""}</td>
      <td style="padding:5px 6px;color:#7090a8;font-size:11px;">${pt.markering || ""}</td>
      <td style="padding:5px 6px;color:#7090a8;font-size:11px;">${pt.prisma || ""}</td>
      <td style="padding:5px 6px;text-align:center;">
        <button onclick="window.openEditPt('${pt.id}')" style="padding:2px 6px;font-size:10px;background:transparent;border:1px solid #2a4060;color:#4fc3f7;border-radius:2px;cursor:pointer;">✏</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Statistik
  const total = pts.length;
  const known = pts.filter(p => p.type === "known").length;
  const stn   = pts.filter(p => p.type === "station").length;
  const newPt = pts.filter(p => p.type === "new" || p.type === "detail").length;
  const st = document.getElementById("cv-stat-total");   if (st) st.textContent = `Totalt: ${total} punkter`;
  const sk = document.getElementById("cv-stat-known");   if (sk) sk.textContent = `Kända: ${known}`;
  const ss = document.getElementById("cv-stat-station"); if (ss) ss.textContent = `Uppst: ${stn}`;
  const sn = document.getElementById("cv-stat-new");     if (sn) sn.textContent = `Nya/Detalj: ${newPt}`;
}

function cvSaveNewRow() {
  const idEl = document.getElementById("cv-new-id");
  const eEl  = document.getElementById("cv-new-E");
  const nEl  = document.getElementById("cv-new-N");
  const hEl  = document.getElementById("cv-new-H");
  const tEl  = document.getElementById("cv-new-type");
  if (!idEl || !eEl || !nEl) return;

  const id = idEl.value.trim();
  const E  = parseFloat(eEl.value);
  const N  = parseFloat(nEl.value);
  const H  = parseFloat(hEl?.value || "0") || 0;
  const tp = tEl?.value || "station";
  const markering = document.getElementById("cv-new-markering")?.value.trim() || undefined;
  const prisma    = document.getElementById("cv-new-prisma")?.value.trim()    || undefined;

  if (!id) { showToast("Ange ett Punkt-ID.", "#ff5050"); return; }
  if (isNaN(E) || isNaN(N)) { showToast("E och N måste vara tal.", "#ff5050"); return; }

  const { pts } = getState();
  if (pts.find(p => p.id === id)) { showToast(`Punkt ${id} finns redan.`, "#ff5050"); return; }

  saveUndo(`Lägg till punkt ${id}`);
  setState({ pts: [...pts, { id, type:tp, E, N, H, markering, prisma }], simResult: null });
  showToast(`✓ Punkt ${id} tillagd.`, "#00ff88");

  // Rensa formuläret
  [idEl, eEl, nEl].forEach(el => { el.value = ""; });
  if (hEl) hEl.value = "";
  if (document.getElementById("cv-new-markering")) document.getElementById("cv-new-markering").value = "";
  if (document.getElementById("cv-new-prisma"))    document.getElementById("cv-new-prisma").value    = "";

  _renderCoordView();
  draw();
}

// ── 14. openPM – öppnar PM-popupen och skickar data via postMessage ─────────
// Ersätter pmPopupHTML() helt – inga inline-scripts, inga escape-knep.

function isMobilePhone() {
  return window.innerWidth < 768;
}

async function openPM() {
  if (isMobilePhone()) {
    showToast(
      "PM-modulen kräver tablet eller dator. Öppna sidan där för att generera ett mätningstekniskt PM.",
      "#ff9900"
    );
    return;
  }
  const { simResult, pts, meas, activeCRS, activeMatklass, defaultInstr, centerErr, obstacles, activeLayerKey } = getState();
  if (!simResult?.ok) { alert("Kör simuleringen först."); return; }

  const popup = window.open(
    `${import.meta.env.BASE_URL}src/pm/pm.html`,
    "natsim-pm",
    "width=1060,height=920,menubar=no,toolbar=no"
  );
  if (!popup) { alert("Popup blockerades – tillåt popups för denna sida."); return; }

  // Lyssnaren MÅSTE registreras innan await-punkten nedan.
  // pm.js postar 'ready' direkt vid modulstart – om handleMsg läggs till efter
  // await kan 'ready' ha kommit och gått (race condition på produktion).
  let pendingPayload = null;
  let readyFired     = false;
  const handleMsg = e => {
    if (e.source !== popup) return;
    if (e.data?.type === "ready") {
      readyFired = true;
      if (pendingPayload) popup.postMessage({ type: "data", payload: pendingPayload }, "*");
    } else if (e.data?.type === "save-draft") {
      try { localStorage.setItem("pm_draft", JSON.stringify({ vals: e.data.payload?.vals || {} })); } catch {}
    }
  };
  window.addEventListener("message", handleMsg);
  const checkClosed = setInterval(() => {
    if (popup.closed) { window.removeEventListener("message", handleMsg); clearInterval(checkClosed); }
  }, 1000);

  const { CRS_DEFS, INSTRUMENTS, MATKLASSER } = await import('./core/constants.js').catch(() => ({}));
  const sr   = simResult;
  const mk   = activeMatklass ? MATKLASSER?.[activeMatklass] : null;
  const crs  = CRS_DEFS?.[activeCRS]?.name || activeCRS;
  const ins  = INSTRUMENTS?.[defaultInstr]?.l || defaultInstr;
  const mHz  = meas[0]?.sigHz_mgon  ?? (mk?.sigHz_mgon  ?? 0.3);
  const mDm  = meas[0]?.sigDist_mm  ?? (mk?.sigDist_mm  ?? 1.0);
  const mDp  = meas[0]?.sigDist_ppm ?? (mk?.sigDist_ppm ?? 1.0);
  const mSt  = meas[0]?.numSatser   ?? (mk?.numSatser   ?? 3);
  const dag  = new Date().toISOString().slice(0, 10);
  const knd  = pts.filter(p => p.type === "known");
  const pRes = (sr.allPtResults || []).filter(r => r.type !== "known" && r.sigPos > 0);

  const payload = {
    sr: {
      meas_n:sr.meas_n, unkn_n:sr.unkn_n, redundancy:sr.redundancy,
      K_global:sr.K_global, rMean:sr.rMean, rMinDist:sr.rMinDist,
      rMinHz:sr.rMinHz, kappa:sr.kappa, redundTotal:sr.redundTotal,
      datumDesc:sr.datumDesc, nCoordUnkn:sr.nCoordUnkn, nOrientUnkn:sr.nOrientUnkn
    },
    redund: (sr.redund||[]).map(r => ({ ri:r.ri, type:r.type, measId:r.measId,
      fromId:r.fromId, toId:r.toId, d:r.d, mdb:r.mdb, yt_m:r.yt_m })),
    ptRes:    pRes.map(r => ({ id:r.id, type:r.type, sigE:r.sigE, sigN:r.sigN,
              sigPos:r.sigPos, aSemi:r.aSemi, bSemi:r.bSemi })),
    allPts:   pts.map(p => ({ id:p.id, type:p.type, N:p.N, E:p.E, H:p.H||0, markering:p.markering||"", prisma:p.prisma||"" })),
    knownPts: knd.map(p => ({ id:p.id, N:p.N, E:p.E, H:p.H||0, markering:p.markering||"" })),
    mk, mkKey:activeMatklass||"", crs, ins, mHz, mDm, mDp, mSt, dag, centerErr,
    img: "",
    meas:      meas.map(m => ({ id:m.id, from:m.from, to:m.to })),
    activeCRS,
    activeLayerKey,
    obstacles: obstacles || [],
    imgSimResult: {
      ok: true,
      allPtResults: (sr.allPtResults || []).map(r => ({
        id:r.id, type:r.type, N:r.N, E:r.E,
        aSemi:r.aSemi, bSemi:r.bSemi, theta:r.theta,
      })),
      simStationResults: (sr.simStationResults || []).map(ss => ({
        ok:ss.ok, N:ss.N, E:ss.E,
        aSemi:ss.aSemi, bSemi:ss.bSemi, theta:ss.theta,
      })),
    },
    projnamn: "", projnr: "", kravSp: ""
  };

  pendingPayload = payload;
  // Om 'ready' anlände under await (race condition) skickar vi data nu
  if (readyFired && !popup.closed) {
    popup.postMessage({ type: "data", payload }, "*");
  }
}
