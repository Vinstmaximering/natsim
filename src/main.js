import './styles/main.css';
import 'leaflet/dist/leaflet.css';

import { getState, setState, setAutoSimHandler, subscribe } from './state/store.js';
import { autoSim, undo, setUndoCallbacks }     from './state/undo.js';
import { loadAutosave, saveAutosave }           from './state/persistence.js';
import { initMap, draw, setDrawCallbacks, resize, map as leafletMap } from './map/leaflet-setup.js';
import { setInteractionCallbacks }              from './map/interactions.js';
import { showToast }                            from './ui/toast.js';
import { initOnboarding, hideOnboarding }       from './ui/onboarding.js';
import { initQualityPanel, updateQualityPanel } from './ui/quality-panel.js';
import { initToolbar, buildTools, setTool, togglePanel, clearAll, toggleAU, toggleMapLayer } from './ui/toolbar.js';
import { updatePtList, initLeftPanel }          from './ui/left-panel.js';
import { buildTabs, setTab, renderTab, initRightPanel, applyMatklass } from './ui/right-panel.js';
import { openEditPt, openMM, closeModal }       from './ui/modals.js';

// ── 1. AutoSim ──────────────────────────────────────────────────────────────
setAutoSimHandler(autoSim);

// ── 2. Draw callbacks ───────────────────────────────────────────────────────
setDrawCallbacks({ updatePtList, renderTab });

// ── 3. Map interaction callbacks ────────────────────────────────────────────
setInteractionCallbacks({ openEditPt, openMM, buildTools, setTab, showToast });

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
window.toggleCoordView = () => showToast("Koordinatlista tillgänglig i Fas 6.", "#4fc3f7");
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
window.cvSaveNewRow   = () => {};
window.cvAddRow       = () => {};
window.cvImportGeo    = () => {};
window.cvExportGeo    = () => {};
window._applyMatklass = applyMatklass;
window._showValidationDialog = () => import('./ui/validation.js').then(m => m.showValidationDialog());
window._suggestMeas   = () => showToast("Föreslå mätningar: Fas 6", "#ffdc32");
window._exportRep     = () => import('./reports/sim-report.js').then(m => m.exportSimReport()).catch(() => showToast("Rapport: Fas 6", "#ff9900"));
window._openPM        = () => import('./pm/pm.js').then(m => m.openPM()).catch(() => showToast("PM-generering: Fas 7", "#00ff88"));
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

// ── 7. Initiera karta ──────────────────────────────────────────────────────
initMap();

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

// ── 9. Initiera höger-panel och rendera ────────────────────────────────────
initRightPanel();
buildTools();
updatePtList();
renderTab();

// ── 10. Dölja onboarding om punkter finns ─────────────────────────────────
if (getState().pts.length > 0) hideOnboarding();

// ── 11. Globala events ─────────────────────────────────────────────────────
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", saveAutosave);
