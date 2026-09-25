// rad 3266–3354: buildTools, setTool, togglePanel, clearAll
import { getState, setState } from '../state/store.js';
import { PT, INSTRUMENTS, ptLabel } from '../core/constants.js';
import { draw, resize, toggleMapLayer } from '../map/leaflet-setup.js';
import { isDrawing, cancelDraw, startPolygonDraw, startLineDraw } from '../map/obstacle-drawing.js';
import { isDrawingVisual, cancelVisualDraw, startVisualPointDraw, startVisualLineDraw,
         startVisualAreaDraw, hasUndoableVertex, undoLastDrawVertex,
         canFinishLine, completeVisualLine } from '../map/visual-drawing.js';
import { isSnapEnabled } from '../map/snap.js';
import { startMeasure, cancelMeasure } from '../map/measure-tool.js';
import { startOffsetTool, cancelOffsetTool } from '../map/offset-tool.js';
import { startCircleTool, cancelCircleTool } from '../map/circle-tool.js';
import { isOffsetSource } from '../state/offset.js';

export { toggleMapLayer };

// Verktygsraden på kartan (index.html #map-tools). tool = state.tool när
// verktyget är valt; mobile = knapptext i den mobila verktygsraden (#mtb) för
// verktyg som finns.
export const MAP_TOOLS = [
  { btn: 'btn-select-area', tool: 'select-area', key: 'm', mobile: '⬚ Markera',
    title: 'Markera område – dra en rektangel' },
  { btn: 'btn-measure-dist', tool: 'measure-dist', key: 'd', mobile: '📐 Mät',
    title: 'Mät avstånd – klicka två punkter' },
  { btn: 'btn-visual-point', tool: 'visual-point', key: 'p', mobile: '○ Pkt',
    title: 'Visuell punkt – ritas i aktivt lager' },
  { btn: 'btn-visual-line',  tool: 'visual-line',  key: 'l', mobile: '⤺ Linje',
    title: 'Visuell linje – ritas i aktivt lager' },
  { btn: 'btn-visual-area',  tool: 'visual-area',  key: 'y', mobile: '▱ Yta',
    title: 'Yta – ritas i aktivt lager' },
  { btn: 'btn-visual-circle', tool: 'visual-circle', key: 'c', mobile: '◯ Cirkel',
    title: 'Cirkel – klicka centrum och en punkt på cirkeln' },
  { btn: 'btn-offset',       tool: 'offset',       key: 'o', mobile: '⇉ Offset',
    title: 'Offset – klicka en linje eller yta' },
];

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
    `<button class="mtbb${tool==="measure"?" act":""}" style="--c:#ff9900" onclick="window._setTool('measure')">📏</button>` +
    // Lager-verktyg Etapp 2: kartans verktygsrad döljs på telefon; de visuella
    // ritverktygen ligger i stället här, sist i den mobila raden.
    MAP_TOOLS.filter(t => t.mobile).map(t =>
      `<button class="mtbb${tool===t.tool?" act":""}" style="--c:#cfd8dc" aria-pressed="${tool===t.tool}" title="${t.title}" onclick="window._setTool('${t.tool}')">${t.mobile}</button>`
    ).join("") +
    // Snappning av/på (Etapp 5) – en växlare, inget verktyg.
    `<button class="mtbb${isSnapEnabled()?" act":""}" style="--c:#00ff88" aria-pressed="${isSnapEnabled()}" title="Snappning av/på" onclick="window._toggleSnap()">⌖ Snapp</button>` +
    // Pekskärmens Backspace: ta bort senaste hörnet i pågående linje eller
    // yta. Visas bara när det finns ett hörn att ta bort – se
    // syncMobileDrawButtons(), som körs vid varje omritning av kartan.
    `<button class="mtbb" id="mtb-undo-vertex" style="--c:#ffb74d" title="Ta bort senaste hörnet" aria-label="Ta bort senaste hörnet" onclick="window._undoLastVertex()" hidden>↶ Hörn</button>` +
    // Pekskärmens dubbelklick: avslutar linjen. Visas från andra hörnet.
    `<button class="mtbb" id="mtb-finish-line" style="--c:#00ff88" title="Avsluta linjen" aria-label="Avsluta linjen" onclick="window._finishLine()" hidden>✓ Klar</button>`;
  syncMobileDrawButtons();

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

  // Verktygsraden på kartan (Lager-verktyg Etapp 2): valt verktyg markeras
  // med klassen act och aria-pressed. #btn-visual-point och #btn-visual-line
  // bor numera där, med sina id:n i behåll.
  for (const t of MAP_TOOLS) {
    const b = document.getElementById(t.btn);
    if (!b) continue;
    const on = tool === t.tool;
    b.classList.toggle('act', on);
    b.setAttribute('aria-pressed', String(on));
  }
  // Snappning är en växlare: markerad när den är på, oavsett verktyg.
  const snapBtn = document.getElementById('btn-snap');
  if (snapBtn) {
    snapBtn.classList.toggle('act', isSnapEnabled());
    snapBtn.setAttribute('aria-pressed', String(isSnapEnabled()));
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
    'visual-point':     "○ Klicka: visuell punkt i aktivt lager · Esc/högerklick: avsluta",
    'visual-line':      "⤺ Klicka hörn: visuell linje i aktivt lager · Dubbelklick/Enter: avsluta · Klick på första hörnet: slut · Backspace: ta bort hörn · Esc: avbryt",
    'visual-area':      "▱ Klicka hörn: yta i aktivt lager · Dubbelklick eller klick på första hörnet: slut · Backspace: ta bort hörn · Esc: avbryt",
    'visual-circle':    "◯ Klicka centrum · sedan en punkt på cirkeln, eller skriv radien + Enter · Esc: nytt centrum",
    'offset':           "⇉ Klicka en linje eller yta · Avstånd, sida och hörn i rutan · Enter: skapa · Esc: välj en annan",
    'measure-dist':     "📐 Klicka två punkter: avstånd och riktning (plan) · Snappar mot punkter och linjer · Esc: börja om",
    'select-area':      "⬚ Dra → helt inuti · Dra ← inuti eller korsade · Klick: ett objekt · Skift: lägg till · Ctrl: ta bort · Esc: avmarkera" };
  // Pekskärm: inget tangentbord och ingen högerklick – ytan sluts genom att
  // trycka på första hörnet, och verktygsknappen igen avbryter.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch) {
    hints['visual-area'] = "▱ Tryck hörn: yta i aktivt lager · Tryck på första hörnet: slut · ▱ Yta igen: avbryt";
    hints['visual-circle'] = "◯ Tryck centrum · sedan en punkt på cirkeln, eller skriv radien";
    hints['offset'] = "⇉ Tryck en linje eller yta · Avstånd, sida och hörn i rutan · ⇉ Skapa";
    hints['measure-dist'] = "📐 Tryck två punkter: avstånd och riktning (plan) · Nytt tryck: börja om";
    hints['visual-line'] = "⤺ Tryck hörn: linje i aktivt lager · ✓ Klar eller tryck på sista hörnet: avsluta · Första hörnet: slut · ⤺ Linje igen: avbryt";
    hints['select-area'] = "⬚ Ett finger: dra rektangel (→ helt inuti, ← korsade) · Två fingrar: flytta och zooma · Tryck: ett objekt";
  }
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = hints[tool] || "";

  const mfb = document.getElementById("mfb");
  if (mfb) {
    if (tool === "measure" && measFrom) { mfb.style.display = "block"; mfb.textContent = `📏 Från: ${measFrom} — klicka TILL-punkt`; }
    else mfb.style.display = "none";
  }
}

/**
 * Visar "↶ Hörn" bara medan en linje eller yta har ett hörn att ta bort, och
 * "✓ Klar" bara medan en linje har minst två hörn.
 */
export function syncMobileDrawButtons() {
  const b = document.getElementById('mtb-undo-vertex');
  if (b) b.hidden = !hasUndoableVertex();
  const k = document.getElementById('mtb-finish-line');
  if (k) k.hidden = !canFinishLine();
}

/** "✓ Klar" i den mobila raden: sparar linjen, som dubbelklick. */
export function finishLineFromButton() {
  if (!canFinishLine()) return false;
  completeVisualLine();
  draw();
  return true;
}

/** "↶ Hörn" i den mobila raden. */
export function undoLastVertexFromButton() {
  if (!undoLastDrawVertex()) return false;
  draw();
  return true;
}

export function setTool(t) {
  // Avbryt pågående ritning om verktyget byts
  if (isDrawing()) cancelDraw();
  if (isDrawingVisual()) cancelVisualDraw();
  cancelMeasure();
  cancelOffsetTool();
  cancelCircleTool();

  if (t !== "measure") setState({ measFrom: null });
  setState({ tool: t });

  // Starta ritläge direkt
  if (t === 'obstacle-polygon') startPolygonDraw();
  else if (t === 'obstacle-line') startLineDraw();
  else if (t === 'visual-point') startVisualPointDraw();
  else if (t === 'visual-line')  startVisualLineDraw();
  else if (t === 'visual-area')  startVisualAreaDraw();
  else if (t === 'measure-dist') startMeasure();
  else if (t === 'visual-circle') startCircleTool();
  else if (t === 'offset') {
    // En markerad linje eller yta blir verktygets val direkt; kortet stängs,
    // så att det inte skymmer förhandsvisningen.
    const sel = getState().selVisualId;
    startOffsetTool(isOffsetSource(sel) ? sel : null);
    if (isOffsetSource(sel)) setState({ selVisualId: null });
  }

  // Markera område: ett drag med musen eller ett finger ritar rektangeln, så
  // kartans panorering med ett drag är av så länge verktyget är valt. Två
  // fingrar panorerar och zoomar fortfarande (Leaflets touchZoom).
  import('../map/leaflet-setup.js').then(({ map: m }) => {
    if (m) {
      if (t === 'select-area') m.dragging.disable(); else m.dragging.enable();
      m.getContainer().style.cursor = t === "pan" ? "grab" : "crosshair";
    }
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
      visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
      // Etapp 1: lagren följer sitt innehåll – ett tomt projekt har inga lager.
      visualLayers: [], activeVisualLayerId: null,
      // Etapp 5: ett tomt projekt ska inte ärva en bortgömd karta.
      netVisible: true, obstaclesVisible: true,
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
  // Etapp 6: DXF öppnar alltid importdialogen – georefereringen är ett val,
  // inte något filen kan svara på.
  document.getElementById("dxf-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(text => import('./dxf-import-modal.js').then(m => m.openDxfImport(text, f.name)));
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
  window._undoLastVertex = undoLastVertexFromButton;
  window._finishLine     = finishLineFromButton;
}
