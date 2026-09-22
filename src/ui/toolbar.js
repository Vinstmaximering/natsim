// rad 3266–3354: buildTools, setTool, togglePanel, clearAll
import { getState, setState } from '../state/store.js';
import { PT, INSTRUMENTS, ptLabel } from '../core/constants.js';
import { draw, resize, toggleMapLayer } from '../map/leaflet-setup.js';
import { isDrawing, cancelDraw, startPolygonDraw, startLineDraw } from '../map/obstacle-drawing.js';
import { isDrawingVisual, cancelVisualDraw, startVisualPointDraw, startVisualLineDraw } from '../map/visual-drawing.js';

export { toggleMapLayer };

export function buildTools() {
  const { tool, measFrom } = getState();
  const ptEntries = Object.entries(PT).filter(([k]) => k !== "simstation");

  const tg = document.getElementById("tg");
  if (tg) tg.innerHTML = ptEntries.map(([k, v]) =>
    `<button class="tb${tool===k?" act":""}" style="--c:${v.c}" onclick="window._setTool('${k}')">${v.l}</button>`
  ).join("");

  const btnPan = document.getElementById("btn-pan");
  if (btnPan) {
    btnPan.className = "tb" + (tool === "pan" ? " act" : "");
    btnPan.style.cssText = "margin-top:3px;" + (tool==="pan" ? "--c:#a0b8d0;border-color:#a0b8d0;background:rgba(160,184,208,0.15);color:#a0b8d0" : "");
  }
  const mb = document.getElementById("btn-meas");
  if (mb) {
    mb.className = "tb" + (tool === "measure" ? " act" : "");
    mb.style.cssText = "margin-top:2px;--c:#ff9900;" + (tool==="measure" ? "border-color:#ff9900;background:rgba(255,153,0,0.15);color:#ff9900" : "");
  }
  const sb = document.getElementById("btn-simstation");
  if (sb) {
    sb.className = "tb" + (tool === "simstation" ? " act" : "");
    sb.style.cssText = "margin-top:2px;--c:#ff6090;" + (tool==="simstation" ? "border-color:#ff6090;background:rgba(255,96,144,0.15);color:#ff6090" : "");
  }

  const mtb = document.getElementById("mtb");
  if (mtb) mtb.innerHTML =
    ptEntries.map(([k,v]) => `<button class="mtbb${tool===k?" act":""}" style="--c:${v.c}" onclick="window._setTool('${k}')">${v.l.split(" ")[0]}</button>`).join("") +
    `<button class="mtbb${tool==="simstation"?" act":""}" style="--c:#ff6090" onclick="window._setTool('simstation')">🔴</button>` +
    `<button class="mtbb${tool==="pan"?" act":""}" style="--c:#a0b8d0" onclick="window._setTool('pan')">🖐</button>` +
    `<button class="mtbb${tool==="measure"?" act":""}" style="--c:#ff9900" onclick="window._setTool('measure')">📏</button>`;

  // Uppdatera hinder-verktygsknappar
  const obsPolBtn = document.getElementById('btn-obs-polygon');
  if (obsPolBtn) {
    obsPolBtn.className = 'tb' + (tool === 'obstacle-polygon' ? ' act' : '');
    obsPolBtn.style.cssText = '--c:#ff9900;margin-top:2px;' + (tool === 'obstacle-polygon' ? 'border-color:#ff9900;background:rgba(255,153,0,0.15);color:#ff9900' : '');
  }
  const obsLineBtn = document.getElementById('btn-obs-line');
  if (obsLineBtn) {
    obsLineBtn.className = 'tb' + (tool === 'obstacle-line' ? ' act' : '');
    obsLineBtn.style.cssText = '--c:#8aa8c0;margin-top:2px;' + (tool === 'obstacle-line' ? 'border-color:#8aa8c0;background:rgba(160,184,208,0.15);color:#8aa8c0' : '');
  }

  const visPtBtn = document.getElementById('btn-visual-point');
  if (visPtBtn) {
    visPtBtn.className = 'tb' + (tool === 'visual-point' ? ' act' : '');
    visPtBtn.style.cssText = '--c:#cfd8dc;margin-top:2px;' + (tool === 'visual-point' ? 'border-color:#cfd8dc;background:rgba(207,216,220,0.15);color:#cfd8dc' : '');
  }
  const visLineBtn = document.getElementById('btn-visual-line');
  if (visLineBtn) {
    visLineBtn.className = 'tb' + (tool === 'visual-line' ? ' act' : '');
    visLineBtn.style.cssText = '--c:#cfd8dc;margin-top:2px;' + (tool === 'visual-line' ? 'border-color:#cfd8dc;background:rgba(207,216,220,0.15);color:#cfd8dc' : '');
  }

  // Omgång 2: punkttypernas namn kommer ur PT, så hjälpraden inte kan
  // divergera från knappen den beskriver.
  const ptHint = t => `➕ Klicka: lägg ${ptLabel(t)} | Dra: flytta`;
  const hints = { pan:"🖐 Dra kartan | Dubbelklick på punkt: redigera",
    known: ptHint("known"), station: ptHint("station"), detail: ptHint("detail"),
    new: ptHint("new"), simstation:`🔴 Klicka: lägg ${ptLabel("simstation")}`,
    measure:"📏 Klicka FRÅN-punkt → klicka TILL-punkt",
    'obstacle-polygon': "🏢 Klicka för att lägga hörn · Dubbelklick/Enter: avsluta · Esc: avbryt",
    'obstacle-line':    "━ Klicka FRÅN-punkt → klicka TILL-punkt (vägg avslutas automatiskt)",
    'visual-point':     "○ Klicka för att placera visuella punkter · Esc/högerklick: avsluta",
    'visual-line':      "⤺ Klicka för att kedja visuella linjer · Esc/högerklick: avsluta" };
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = hints[tool] || "";

  const mfb = document.getElementById("mfb");
  if (mfb) {
    if (tool === "measure" && measFrom) { mfb.style.display = "block"; mfb.textContent = `📏 Från: ${measFrom} — klicka TILL-punkt`; }
    else mfb.style.display = "none";
  }
}

export function setTool(t) {
  // Avbryt pågående ritning om verktyget byts
  if (isDrawing()) cancelDraw();
  if (isDrawingVisual()) cancelVisualDraw();

  if (t !== "measure") setState({ measFrom: null });
  setState({ tool: t });

  // Starta ritläge direkt
  if (t === 'obstacle-polygon') startPolygonDraw();
  else if (t === 'obstacle-line') startLineDraw();
  else if (t === 'visual-point') startVisualPointDraw();
  else if (t === 'visual-line')  startVisualLineDraw();

  import('../map/leaflet-setup.js').then(({ map: m }) => {
    if (m) { m.dragging.enable(); m.getContainer().style.cursor = t === "pan" ? "grab" : "crosshair"; }
  });
  buildTools();
  draw();
}

export function togglePanel(id) {
  document.getElementById(id)?.classList.toggle("hidden");
  _updateBackdrop();
  setTimeout(() => { import('../map/leaflet-setup.js').then(({ map: m }) => { if (m) m.invalidateSize(); resize(); }); }, 220);
}

export function closeAllPanels() {
  ["lp", "rp"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
  _updateBackdrop();
  setTimeout(() => { import('../map/leaflet-setup.js').then(({ map: m }) => { if (m) m.invalidateSize(); resize(); }); }, 220);
}

function _updateBackdrop() {
  if (window.innerWidth >= 768) return;
  const lpHidden = document.getElementById("lp")?.classList.contains("hidden") !== false;
  const rpHidden = document.getElementById("rp")?.classList.contains("hidden") !== false;
  const backdrop = document.getElementById("panel-backdrop");
  if (backdrop) backdrop.classList.toggle("active", !lpHidden || !rpHidden);
}

export function clearAll() {
  if (confirm("Rensa alla punkter, mätningar, hinder och visuella objekt?")) {
    setState({
      pts: [], meas: [], obstacles: [],
      visualPts: [], visualLines: [], selVisualId: null,
      // Etapp 1: lagren följer sitt innehåll – ett tomt projekt har inga lager.
      visualLayers: [], activeVisualLayerId: null,
      selId: null, selMId: null, selObsId: null,
      measFrom: null, simResult: null,
      suggestedMeas: [], blockedSuggestions: [],
      // Etapp E: ett förslag som pekar på borttagna punkter är meningslöst.
      optimizerProposal: null, netView: 'original',
    });
    draw();
  }
}

// toggleAU() låg här. Borttagen i UI-städning Omgång 2 (2026-09-11)
// tillsammans med knappen #btn-au och state.au: alla vinklar visas i gon.
// Se core/format.js och docs/troubleshooting/ui_inventering_20260910.md.

export function initToolbar() {
  ["tgc","tga","tgd","tgl","tge","tgs","tgb","sym-lock","tv_known","tv_station","tv_new","tv_detail","tv_simstation"]
    .forEach(id => document.getElementById(id)?.addEventListener("change", () => draw()));

  const symSlider = document.getElementById("sym-size");
  if (symSlider) symSlider.addEventListener("input", e => {
    setState({ symSize: +e.target.value });
    const sv = document.getElementById("sym-val");
    if (sv) sv.textContent = e.target.value + "px";
    draw();
  });
  const ellSlider = document.getElementById("ell-scale");
  if (ellSlider) ellSlider.addEventListener("input", e => {
    setState({ ellScale: +e.target.value });
    const ev = document.getElementById("ell-val");
    if (ev) ev.textContent = e.target.value + "×";
    draw();
  });

  // Importera filhantering – Fas 6 (fullständiga implementationer)
  // Etapp 3: .geo-filen öppnar importdialogen i stället för att importeras
  // rakt av. Dialogen flyttas till Data-menyn i etapp 4; knappen här är
  // tillsvidare vägen in.
  document.getElementById("geo-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(text => import('./geo-import-modal.js').then(m => m.openGeoImport(text, f.name)));
    e.target.value = "";
  });
  document.getElementById("xl-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "csv") {
      f.text().then(text => import('../io/import-csv.js').then(m => m.importPointsFromCSV(text)));
    } else {
      import('../io/import-csv.js').then(m => m.readXLSX(f));
    }
    e.target.value = "";
  });
  document.getElementById("load-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(text => import('../io/export-project.js').then(m => m.loadProject(text)));
    e.target.value = "";
  });

  // Exponera på window för inline onclick i index.html
  window._setTool        = setTool;
  window._togglePanel    = togglePanel;
  window._closeAllPanels = closeAllPanels;
  window._clearAll       = clearAll;
  window._toggleMapLayer = toggleMapLayer;
}
