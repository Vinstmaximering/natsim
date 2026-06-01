// rad 3266–3354: buildTools, setTool, togglePanel, clearAll, toggleAU
import { getState, setState } from '../state/store.js';
import { PT, INSTRUMENTS } from '../core/constants.js';
import { draw, resize, toggleMapLayer } from '../map/leaflet-setup.js';

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

  const hints = { pan:"🖐 Dra kartan | Dubbelklick på punkt: redigera", known:"➕ Klicka: lägg Känd punkt | Dra: flytta",
    station:"➕ Klicka: lägg Uppställning | Dra: flytta", detail:"➕ Klicka: lägg Detaljpunkt | Dra: flytta",
    new:"➕ Klicka: lägg Ny punkt | Dra: flytta", simstation:"🔴 Klicka: lägg Simulerad uppställning",
    measure:"📏 Klicka FRÅN-punkt → klicka TILL-punkt" };
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = hints[tool] || "";

  const mfb = document.getElementById("mfb");
  if (mfb) {
    if (tool === "measure" && measFrom) { mfb.style.display = "block"; mfb.textContent = `📏 Från: ${measFrom} — klicka TILL-punkt`; }
    else mfb.style.display = "none";
  }
}

export function setTool(t) {
  const { map } = window; // map is set globally in main.js for legacy inline onclick
  if (t !== "measure") setState({ measFrom: null });
  setState({ tool: t });
  // Import map dynamically to avoid circular at module level
  import('../map/leaflet-setup.js').then(({ map: m }) => {
    if (m) { m.dragging.enable(); m.getContainer().style.cursor = t === "pan" ? "grab" : "crosshair"; }
  });
  buildTools();
  draw();
}

export function togglePanel(id) {
  document.getElementById(id)?.classList.toggle("hidden");
  setTimeout(() => { import('../map/leaflet-setup.js').then(({ map: m }) => { if (m) m.invalidateSize(); resize(); }); }, 220);
}

export function clearAll() {
  if (confirm("Rensa alla punkter och mätningar?")) {
    setState({ pts: [], meas: [], selId: null, selMId: null, measFrom: null, simResult: null, suggestedMeas: [] });
    draw();
  }
}

export function toggleAU() {
  const { au } = getState();
  const next = au === "grad" ? "dms" : "grad";
  setState({ au: next });
  const btn = document.getElementById("btn-au");
  if (btn) btn.textContent = "Vinkel: " + (next === "grad" ? "Gon (grad)" : "DMS");
  draw();
}

export function initToolbar() {
  ["tgc","tga","tgd","tgl","tge","tgs","sym-lock","tv_known","tv_station","tv_new","tv_detail","tv_simstation"]
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

  // Importera filhantering
  document.getElementById("geo-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(text => { import('../io/import-geo.js').then(m => m.importGeoFile(text, f.name)); });
    e.target.value = "";
  });
  document.getElementById("load-fi")?.addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(text => { import('../io/export-project.js').then(m => m.loadProject(text)); });
    e.target.value = "";
  });

  // Exponera på window för inline onclick i index.html
  window._setTool      = setTool;
  window._togglePanel  = togglePanel;
  window._toggleAU     = toggleAU;
  window._clearAll     = clearAll;
  window._toggleMapLayer = toggleMapLayer;
}
