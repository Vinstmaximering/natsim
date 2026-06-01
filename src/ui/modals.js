// rad 3361–3532 exakt: openMM, openEditPt, closeModal, saveMM, savePM, delPt, delM
// openEditPt(id) – ej openPM(id) (den buggen är rättad)
import { getState, setState } from '../state/store.js';
import { INSTRUMENTS, PT } from '../core/constants.js';
import { calcM } from '../core/designmatrix.js';
import { saveUndo } from '../state/undo.js';
import { draw } from '../map/leaflet-setup.js';

function mi() { return document.getElementById("mi"); }

// ── Mätningsmodal – rad 3361–3417 ──────────────────────────────────────────
export function openMM(id) {
  const { meas, pts, centerErr } = getState();
  const m = meas.find(x => x.id === id); if (!m) return;
  const md     = calcM(m, pts);
  const preset = m.instrPreset || "ts16_1";
  const obsType = m.obsType || "both";
  const btn = (ot, label, col) =>
    `<button id="obs-${ot}" onclick="window._setObsType('${id}','${ot}')" style="flex:1;padding:5px;font-size:11px;border-radius:3px;cursor:pointer;border:1px solid ${obsType===ot?col:"#1e3850"};background:${obsType===ot?col+"18":"transparent"};color:${obsType===ot?col:"#7090a8"};">${label}</button>`;
  mi().innerHTML = `
    <div style="font-size:14px;color:#ff9900;margin-bottom:4px;font-weight:bold;">📏 Mätning [${m.id}]</div>
    <div style="font-size:12px;color:#4fc3f7;margin-bottom:10px;">${m.from} → ${m.to}</div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:3px;">Observationstyp</div>
      <div style="display:flex;gap:4px;">
        ${btn("both","📐 Vinkel + Avstånd","#00ff88")}
        ${btn("hz_only","📐 Endast vinkel","#4fc3f7")}
        ${btn("dist_only","📏 Endast avstånd","#ffb74d")}
      </div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:3px;">Instrument / Osäkerhet</div>
      <select id="mm_instr" onchange="window._onInstrChange('${id}')">
        ${Object.entries(INSTRUMENTS).map(([k,v]) => `<option value="${k}"${k===preset?" selected":""}>${v.l}</option>`).join("")}
      </select>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-top:4px;">
        <div><div style="font-size:11px;color:#7090a8;margin-bottom:2px;">σ vinkel (mgon)</div><input id="mm_shz" type="number" step="0.01" value="${m.sigHz_mgon??INSTRUMENTS[preset].sigHz}"></div>
        <div><div style="font-size:11px;color:#7090a8;margin-bottom:2px;">σ avst mm</div><input id="mm_sdmm" type="number" step="0.1" value="${m.sigDist_mm??INSTRUMENTS[preset].sigDmm}"></div>
        <div><div style="font-size:11px;color:#7090a8;margin-bottom:2px;">σ avst ppm</div><input id="mm_sdppm" type="number" step="0.1" value="${m.sigDist_ppm??INSTRUMENTS[preset].sigDppm}"></div>
        <div><div style="font-size:11px;color:#ffb74d;margin-bottom:2px;">Satser</div><input id="mm_nsat" type="number" step="1" min="1" max="20" value="${m.numSatser??3}" style="border-color:#ffb74d44;"></div>
      </div>
      <div id="mm_sigeff" style="font-size:11px;color:#6080a0;margin-top:3px;"></div>
    </div>
    <div style="margin-bottom:6px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Uppmätt avstånd (m) — kalk: ${md?md.dc.toFixed(4):"-"} m</div>
      <input id="mm_d" type="number" step="0.001" placeholder="Lämna tomt = beräknat" value="${m.measDist??''}">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Uppmätt riktningsvinkel (°) — kalk: ${md?md.bc.toFixed(4):"-"}°</div>
      <input id="mm_h" type="number" step="0.0001" placeholder="Lämna tomt = beräknad" value="${m.measHz??''}">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#4fc3f7;margin-bottom:4px;">FRÅN:</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;">${pts.map(p => `<button onclick="window._chMP('${id}','from','${p.id}')" style="padding:2px 6px;font-size:11px;border-radius:2px;cursor:pointer;border:1px solid ${m.from===p.id?PT[p.type].c:"#1e3850"};background:${m.from===p.id?PT[p.type].c+"22":"transparent"};color:${m.from===p.id?PT[p.type].c:"#7090a8"}">${p.id}</button>`).join("")}</div>
      <div style="font-size:11px;color:#4fc3f7;margin-bottom:4px;">TILL:</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;">${pts.map(p => `<button onclick="window._chMP('${id}','to','${p.id}')" style="padding:2px 6px;font-size:11px;border-radius:2px;cursor:pointer;border:1px solid ${m.to===p.id?PT[p.type].c:"#1e3850"};background:${m.to===p.id?PT[p.type].c+"22":"transparent"};color:${m.to===p.id?PT[p.type].c:"#7090a8"}">${p.id}</button>`).join("")}</div>
    </div>
    <div class="mbs">
      <button class="bs" onclick="window._saveMM('${id}')">✓ Spara</button>
      <button class="bd" onclick="window._delM('${id}')">🗑 Ta bort</button>
      <button class="bc" onclick="window._closeModal()">✕</button>
    </div>`;
  document.getElementById("modal").style.display = "flex";
  setTimeout(() => {
    const s = document.getElementById("mm_shz");
    const n = document.getElementById("mm_nsat");
    if (s) s.oninput = _updateSigEff;
    if (n) n.oninput = _updateSigEff;
    _updateSigEff();
  }, 10);
}

export function setObsType(id, t) {
  const { meas } = getState();
  const m = meas.find(x => x.id === id);
  if (m) { m.obsType = t; openMM(id); }
}

function _updateSigEff() {
  const shz  = parseFloat(document.getElementById("mm_shz")?.value)  || 0;
  const nsat = parseInt(document.getElementById("mm_nsat")?.value)    || 3;
  const eff  = (shz / Math.sqrt(nsat)).toFixed(4);
  const el   = document.getElementById("mm_sigeff");
  if (el) el.innerHTML = `σ vinkel effektiv: <span style="color:#00ff88">${eff} mgon</span> (${shz}/${Math.sqrt(nsat).toFixed(2)})`;
}

export function saveMM(id) {
  const { meas } = getState();
  const m = meas.find(x => x.id === id); if (!m) return;
  saveUndo(`Redigera mätning ${id}`);
  const dv = document.getElementById("mm_d").value.trim();
  const hv = document.getElementById("mm_h").value.trim();
  m.measDist   = dv !== "" ? parseFloat(dv) : null;
  m.measHz     = hv !== "" ? parseFloat(hv) : null;
  m.instrPreset = document.getElementById("mm_instr").value;
  m.obsType    = m.obsType || "both";
  m.sigHz_mgon  = parseFloat(document.getElementById("mm_shz").value)  || null;
  m.sigDist_mm  = parseFloat(document.getElementById("mm_sdmm").value) || null;
  m.sigDist_ppm = parseFloat(document.getElementById("mm_sdppm").value)|| null;
  m.numSatser   = parseInt(document.getElementById("mm_nsat").value)   || 3;
  setState({ simResult: null });
  closeModal();
  draw();
}

// ── Punktmodal – rad 3480–3519 ──────────────────────────────────────────────
// openEditPt(id) – ej openPM (rättad bugg)
export function openEditPt(id) {
  const { pts, meas, centerErr } = getState();
  const pt = pts.find(p => p.id === id); if (!pt) return;
  const c  = PT[pt.type].c;
  const mc = meas.filter(m => m.from === id || m.to === id).length;
  mi().innerHTML = `
    <div style="font-size:14px;color:${c};margin-bottom:10px;font-weight:bold;">Redigera: ${pt.id}</div>
    ${mc ? `<div style="font-size:12px;color:#ff9900;margin-bottom:8px;">⚠ ${mc} mätning(ar) kopplade</div>` : ""}
    <div style="font-size:11px;color:#7090a8;background:#091424;padding:6px;border-radius:3px;margin-bottom:8px;">Ändra E/N-koordinater för att flytta punkten på kartan.</div>
    ${[["id","Punkt-ID","text",pt.id],["E","E-koordinat (m)","number",(pt.E||0).toFixed(3)],
       ["N","N-koordinat (m)","number",(pt.N||0).toFixed(3)],["H","Höjd (m ö.h.)","number",(pt.H||0).toFixed(3)]]
      .map(([k,l,t,v]) => `<div style="margin-bottom:6px;"><div style="font-size:11px;color:#7090a8;margin-bottom:2px;">${l}</div><input id="me_${k}" type="${t}" value="${v}"></div>`).join("")}
    <div style="margin-bottom:6px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Befästning / markering</div>
      <input id="me_markering" type="text" placeholder="ex. Rördubb i asfalt..." value="${(pt.markering||'').replace(/"/g,'&quot;')}">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Prisma / instrument</div>
      <input id="me_prisma" type="text" placeholder="ex. Leica Standardprisma..." value="${(pt.prisma||'').replace(/"/g,'&quot;')}" list="prisma-list">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Centreringsfel (mm) — lämna tomt = globalt (${centerErr} mm)</div>
      <input id="me_ce" type="number" step="0.1" min="0" placeholder="Globalt (${centerErr} mm)" value="${pt.centerErr != null ? pt.centerErr : ''}">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:4px;">Typ</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;">${Object.entries(PT).map(([k,v]) =>
        `<button onclick="window._setMT('${id}','${k}')" style="padding:3px 7px;font-size:11px;border-radius:3px;cursor:pointer;border:1px solid ${pt.type===k?v.c:"#1e3850"};background:${pt.type===k?v.c+"22":"transparent"};color:${pt.type===k?v.c:"#7090a8"}">${v.l}</button>`).join("")}</div>
    </div>
    <div class="mbs">
      <button class="bs" onclick="window._savePM('${id}')">✓ Spara</button>
      <button class="bd" onclick="window._delPt('${id}')">🗑</button>
      <button class="bc" onclick="window._closeModal()">✕</button>
    </div>`;
  document.getElementById("modal").style.display = "flex";
}

export function closeModal() {
  document.getElementById("modal").style.display = "none";
}

export function savePM(id) {
  const { pts, meas: allMeas } = getState();
  const pt = pts.find(p => p.id === id); if (!pt) return;
  saveUndo(`Redigera punkt ${id}`);
  const ni = document.getElementById("me_id").value.trim();
  if (ni && ni !== id) {
    if (pts.find(p => p.id === ni && p.id !== id)) { alert("ID finns redan!"); return; }
    allMeas.forEach(m => { if (m.from === id) m.from = ni; if (m.to === id) m.to = ni; });
    pt.id = ni;
    const { selId } = getState();
    if (selId === id) setState({ selId: ni });
  }
  pt.E = parseFloat(document.getElementById("me_E").value) || 0;
  pt.N = parseFloat(document.getElementById("me_N").value) || 0;
  pt.H = parseFloat(document.getElementById("me_H").value) || 0;
  const ceVal = document.getElementById("me_ce").value.trim();
  pt.centerErr  = ceVal !== "" ? parseFloat(ceVal) : null;
  pt.markering  = document.getElementById("me_markering").value.trim() || undefined;
  pt.prisma     = document.getElementById("me_prisma").value.trim()    || undefined;
  setState({ simResult: null });
  closeModal();
  draw();
}

export function delPt(id) {
  const { pts, meas } = getState();
  if (meas.filter(m => m.from === id || m.to === id).length && !confirm("Ta bort punkt och alla dess mätningar?")) return;
  saveUndo(`Ta bort punkt ${id}`);
  const { selId } = getState();
  setState({
    pts:  pts.filter(p => p.id !== id),
    meas: meas.filter(m => m.from !== id && m.to !== id),
    selId: selId === id ? null : selId,
    simResult: null,
  });
  closeModal();
  draw();
}

export function delM(id) {
  const { meas, selMId } = getState();
  saveUndo(`Ta bort mätning ${id}`);
  setState({ meas: meas.filter(m => m.id !== id), selMId: selMId === id ? null : selMId, simResult: null });
  closeModal();
  draw();
}

function _setMT(id, nt) {
  const { pts } = getState();
  const pt = pts.find(p => p.id === id);
  if (pt) { saveUndo(`Ändra typ ${id}`); pt.type = nt; openEditPt(id); }
}

// Exponera hjälpfunktioner på window för inline onclick i innerHTML
window._setObsType  = setObsType;
window._onInstrChange = (id) => {
  const sel = document.getElementById("mm_instr")?.value;
  const pr  = INSTRUMENTS[sel];
  if (sel !== "custom" && pr) {
    document.getElementById("mm_shz").value  = pr.sigHz;
    document.getElementById("mm_sdmm").value = pr.sigDmm;
    document.getElementById("mm_sdppm").value= pr.sigDppm;
  }
  _updateSigEff();
};
window._chMP        = (id, f, pid) => { const { meas } = getState(); const m = meas.find(x => x.id === id); if (m) { m[f] = pid; openMM(id); } };
window._saveMM      = saveMM;
window._delM        = delM;
window._closeModal  = closeModal;
window._savePM      = savePM;
window._delPt       = delPt;
window._setMT       = _setMT;
