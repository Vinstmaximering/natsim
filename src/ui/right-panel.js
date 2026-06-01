// Tabs och höger-panel: buildTabs, setTab, renderTab, buildGlobalInstr, applyMatklass
// rad 1679–2215 (renderTab) + rad 1116–1151 (suggestMeasurements) + rad 3332–3352 (instrument)
import { getState, setState } from '../state/store.js';
import { INSTRUMENTS, MATKLASSER, PT, CRS_DEFS } from '../core/constants.js';
import { calcM, fG, fD, d2EN, brgEN } from '../core/designmatrix.js';
import { rColor, rLabel } from '../core/redundancy.js';
import { runSimulation } from '../core/simulation.js';
import { saveUndo } from '../state/undo.js';
import { draw } from '../map/leaflet-setup.js';
import { openMM, delM } from './modals.js';
import { showValidationDialog } from './validation.js';

// ── Bugg 1-fix: suggestMeasurements – rad 1116–1151 exakt ──────────────────
// Läser ENBART pts/meas från state – kräver INTE att simResult är satt.
export function suggestMeasurements() {
  const { pts, meas } = getState();
  const stations = pts.filter(p => p.type === "station");
  const known    = pts.filter(p => p.type === "known");
  const suggested = [];
  if (!stations.length) { setState({ suggestedMeas: [] }); return; }

  stations.forEach(s => {
    const existing    = meas.filter(m => m.from === s.id || m.to === s.id);
    const existingIds = new Set(existing.map(m => m.from === s.id ? m.to : m.from));
    const missingKnown = known.filter(k => !existingIds.has(k.id));
    missingKnown.sort((a, b) => d2EN(s, a) - d2EN(s, b));

    const currentKnownCount = known.filter(k => existingIds.has(k.id)).length;
    const needed = Math.max(0, 3 - currentKnownCount);
    missingKnown.slice(0, needed).forEach(k => {
      suggested.push({ from: s.id, to: k.id, reason: `Bakåtsikt till känd punkt (${currentKnownCount + 1}/3 min. rekommenderat)` });
    });

    if (stations.length > 1) {
      stations.filter(s2 => s2.id !== s.id && !existingIds.has(s2.id)).forEach(s2 => {
        const already = suggested.find(sg =>
          (sg.from === s.id && sg.to === s2.id) || (sg.from === s2.id && sg.to === s.id)
        );
        if (!already) suggested.push({ from: s.id, to: s2.id, reason: "Korsförbindelse mellan uppställningar (stärker geometrin)" });
      });
    }
  });
  setState({ suggestedMeas: suggested });
}

const TABS = [
  { k:"net",   l:"NÄT" },
  { k:"meas",  l:"MÄTNINGAR" },
  { k:"polar", l:"POLÄR" },
  { k:"sim",   l:"SIMULERING" },
  { k:"instr", l:"INSTRUMENT" },
  { k:"aprior",l:"A PRIORI σ" },
  { k:"rep",   l:"RAPPORT" },
];

export function buildTabs() {
  const { atab } = getState();
  const el = document.getElementById("tabs");
  if (!el) return;
  el.innerHTML = TABS.map(t =>
    `<button class="tabt${t.k === atab ? " act" : ""}" onclick="window._setTab('${t.k}')">${t.l}</button>`
  ).join("");
}

export function setTab(k) {
  setState({ atab: k });
  buildTabs();
  renderTab();
}

// ── renderTab – huvud-rendering för högerpanelen ──────────────────────────────
export function renderTab() {
  const tc = document.getElementById("tc");
  if (!tc) return;
  const { atab, pts, meas, simResult, centerErr, defaultInstr } = getState();
  const fmt = d => getState().au === "grad" ? fG(d) : fD(d);

  // ── NÄT ──
  if (atab === "net") {
    tc.innerHTML = `<div class="sl">NÄTÖVERSIKT</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;">
      ${[["Kända",pts.filter(p=>p.type==="known").length,"#00ff88"],["Uppst.",pts.filter(p=>p.type==="station").length,"#4fc3f7"],
         ["Detalj",pts.filter(p=>p.type==="detail").length,"#ffb74d"],["Nya",pts.filter(p=>p.type==="new").length,"#ce93d8"],
         ["Mätningar",meas.length,"#ff9900"],["Inmatade",meas.filter(m=>m.measDist!=null||m.measHz!=null).length,"#ff9900"]]
        .map(([l,n,c]) => `<div style="background:#091424;border-radius:3px;padding:6px 8px;border:1px solid ${c}28;"><div style="font-size:20px;font-weight:bold;color:${c}">${n}</div><div style="font-size:11px;color:#7090a8">${l}</div></div>`).join("")}
    </div>
    <div class="sl">MÄTKLASS (SIS-TS)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
      <button class="tb" onclick="window._applyMatklass('')" style="font-size:12px;${!getState().activeMatklass?"border-color:#4fc3f7;color:#4fc3f7;":""}">Ingen</button>
      ${Object.entries(MATKLASSER).map(([k,v])=>`<button class="tb" onclick="window._applyMatklass('${k}')" style="font-size:12px;${getState().activeMatklass===k?"border-color:#00ff88;color:#00ff88;":""}">${k}</button>`).join("")}
    </div>
    <div class="sl">FÖRESLÅ MÄTNINGAR</div>
    <button onclick="window._suggestMeas()" style="width:100%;padding:7px;font-size:12px;background:#ffdc3218;border:1px solid #ffdc3266;color:#ffdc32;border-radius:3px;cursor:pointer;margin-bottom:8px;">⚡ Analysera och föreslå mätningar</button>
    <div class="sl">VALIDERING</div>
    <button onclick="window._showValidationDialog()" style="width:100%;padding:7px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f766;color:#4fc3f7;border-radius:3px;cursor:pointer;">🔍 Validera nät</button>`;
    return;
  }

  // ── MÄTNINGAR ──
  if (atab === "meas") {
    const { selMId } = getState();
    tc.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div class="sl" style="margin:0">MÄTNINGAR (${meas.length})</div>
    </div>
    ${meas.length === 0 ? '<div style="color:#7090a8;font-size:12px;text-align:center;padding:20px 0;">Inga mätningar ännu.<br><br>Välj 📏 och klicka på två punkter.</div>' : ""}
    ${meas.map(m => {
      const md = calcM(m, pts); if (!md) return "";
      const isSel = m.id === selMId;
      const rd = simResult?.ok ? simResult.redund.find(r => r.measId === m.id && r.type === "dist") : null;
      const rh = simResult?.ok ? simResult.redund.find(r => r.measId === m.id && r.type === "hz")   : null;
      const riStr = rd ? `r_d=${rd.ri.toFixed(3)}` : rh ? `r_h=${rh.ri.toFixed(3)}` : "";
      const riCol = rd ? rColor(rd.ri) : rh ? rColor(rh.ri) : "#7090a8";
      return `<div class="lc" style="${isSel?"border-color:#ff9900;":""}cursor:pointer;" onclick="setState_({selMId:'${m.id}'});draw_();">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="color:#ff9900;font-weight:bold;">[${m.id}] ${m.from}→${m.to}</span>
          <div style="display:flex;gap:3px;">
            <button onclick="event.stopPropagation();window._openMM('${m.id}')" style="padding:2px 5px;font-size:11px;background:transparent;border:1px solid #2a4060;color:#4fc3f7;border-radius:2px;cursor:pointer;">✏</button>
            <button onclick="event.stopPropagation();window._delM('${m.id}')" style="padding:2px 5px;font-size:11px;background:transparent;border:1px solid #3a1010;color:#ff5050;border-radius:2px;cursor:pointer;">✕</button>
          </div>
        </div>
        <div style="color:#8aa8c0;">Avst: <span style="color:${m.measDist!=null?"#ff9900":"#e8f4fd"}">${md.dist.toFixed(4)} m</span> &nbsp; Riktn: ${fmt(md.hz)}${riStr?` &nbsp;<span style="color:${riCol}">${riStr}</span>`:""}</div>
      </div>`;
    }).join("")}`;
    return;
  }

  // ── SIMULERING – Bugg 2-fix: fullständig rendering identisk med original ──
  if (atab === "sim") {
    // Beräkna-knapp alltid synlig (kör även suggestMeasurements)
    tc.innerHTML = `<div style="text-align:center;margin-bottom:10px;">
      <button onclick="window._runSim()"
        style="padding:8px 24px;font-size:13px;background:#00ff8822;border:1px solid #00ff88;color:#00ff88;border-radius:4px;cursor:pointer;font-weight:bold;letter-spacing:0.5px;">
        ▶ BERÄKNA SIMULERING
      </button>
    </div>`;

    if (!simResult) {
      tc.innerHTML += `<div style="color:#7090a8;font-size:12px;text-align:center;padding:12px;border:1px dashed #1a2d48;border-radius:3px;">Tryck ▶ Beräkna för att starta simuleringen.</div>`;
      return;
    }
    if (simResult.error) {
      const errLines = simResult.error.split("\n");
      tc.innerHTML += `<div style="color:#ff5050;font-size:12px;background:#1e0808;padding:10px;border-radius:3px;line-height:1.8;">⚠ ${errLines.map((l,i)=>i===0?`<b>${l}</b>`:l).join("<br>")}</div>`;
      return;
    }

    const sr  = simResult;
    const { ellipsMode, activeCRS, sigReq = 3 } = getState();
    const k   = (ellipsMode !== "95") ? 1.0 : 2.4477;
    const D_  = r => r * 180 / Math.PI;
    const now = new Date();
    const dateStr  = now.toLocaleDateString("sv-SE") + " " + now.toLocaleTimeString("sv-SE", { hour:"2-digit", minute:"2-digit" });
    const crsName  = CRS_DEFS[activeCRS]?.name || activeCRS;

    const TR  = (label, val, col) => `<tr><td style="color:#8aa8c0;padding:2px 6px 2px 0;white-space:nowrap;">${label}</td><td style="color:${col||"#e8f4fd"};font-family:monospace;text-align:right;">${val}</td></tr>`;
    const SEC = title => `<div style="background:#0d1e30;border-left:3px solid #4fc3f7;padding:4px 8px;margin:10px 0 5px;font-size:12px;font-weight:bold;color:#4fc3f7;letter-spacing:0.5px;">${title}</div>`;

    tc.innerHTML += `
    <div style="background:#070f1c;border:1px solid #1e3850;border-radius:4px;padding:8px 10px;margin-bottom:6px;font-family:monospace;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:14px;font-weight:bold;color:#4fc3f7;letter-spacing:1px;">NÄTSIMULERING</div>
          <div style="font-size:11px;color:#7090a8;margin-top:2px;">Absolut anslutning – minsta kvadratutjämning</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#7090a8;">
          <div>${dateStr}</div><div style="color:#4fc3f7;">${crsName}</div>
        </div>
      </div>
    </div>

    ${SEC("1. NÄTÖVERSIKT")}
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      ${TR("Kända punkter (fixerade)", sr.knownCount, "#00ff88")}
      ${TR("Fria punkter", sr.freeCount, "#4fc3f7")}
      ${TR("Uppställningar (orienteringar)", sr.nOrientUnkn ?? "–", "#ffb74d")}
      ${TR("Mätningar (linjer)", sr.measCount)}
      ${TR("Observationer (riktningar+längder)", sr.meas_n)}
      <tr><td colspan="2" style="border-bottom:1px solid #1e3850;padding:2px 0;"></td></tr>
      ${TR("Koordinatobekanta", sr.nCoordUnkn ?? sr.unkn_n, "#4fc3f7")}
      ${TR("Orienteringskonstanter", sr.nOrientUnkn ?? 0, "#ffb74d")}
      ${TR("Totalt obekanta", sr.unkn_n)}
      <tr><td colspan="2" style="border-bottom:1px solid #1e3850;padding:2px 0;"></td></tr>
      ${TR("Frihetsgrader f", sr.redundancy, sr.redundancy > 0 ? "#00ff88" : "#ff5050")}
      ${TR("Σ redundansbidrag", sr.redundTotal)}
      ${TR("κ (MUF-faktor)", sr.kappa != null ? sr.kappa.toFixed(2) : "2.80")}
    </table>

    ${SEC("2. KONTROLLERBARHETSTAL  k = f/n")}
    <div style="background:#091424;border:1px solid ${sr.K_col}44;border-radius:3px;padding:8px;margin-bottom:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:16px;font-weight:bold;color:${sr.K_col};font-family:monospace;">k = ${sr.K_global.toFixed(3)}</span>
        <span style="font-size:12px;font-weight:bold;color:${sr.K_col};background:${sr.K_col}22;padding:3px 10px;border-radius:2px;">${sr.K_class}</span>
      </div>
      <div style="font-size:10px;color:#6080a0;line-height:1.7;">≥0.50 Starkt &nbsp;|&nbsp; 0.30–0.50 Acceptabelt &nbsp;|&nbsp; 0.10–0.30 Svagt &nbsp;|&nbsp; &lt;0.10 Otillräckligt</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
        ${TR("Medel r_i", sr.rMean.toFixed(3), rColor(sr.rMean))}
        ${sr.rMinDist != null ? TR("Min r_i (avstånd)", sr.rMinDist.toFixed(3), rColor(sr.rMinDist)) : ""}
        ${sr.rMinHz   != null ? TR("Min r_i (vinkel)",  sr.rMinHz.toFixed(3),   rColor(sr.rMinHz))   : ""}
      </table>
    </div>

    ${SEC("3. PUNKTOSÄKERHETER")}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;flex-wrap:wrap;">
      <span style="color:#8aa8c0;">Felellipsskala:</span>
      <button onclick="window._setEllipsMode('1sig')" style="padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${(ellipsMode !== '95') ? '#4fc3f7' : '#1e3850'};background:${(ellipsMode !== '95') ? '#4fc3f718' : 'transparent'};color:${(ellipsMode !== '95') ? '#4fc3f7' : '#7090a8'};">1σ (Geo)</button>
      <button onclick="window._setEllipsMode('95')" style="padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${ellipsMode === '95' ? '#ffb74d' : '#1e3850'};background:${ellipsMode === '95' ? '#ffb74d18' : 'transparent'};color:${ellipsMode === '95' ? '#ffb74d' : '#7090a8'};">95% (k=2.45)</button>
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:300px;">
      <tr style="border-bottom:1px solid #1e3850;">
        <th style="text-align:left;color:#6080a0;font-weight:normal;padding:2px 4px 4px 0;">Punkt</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">σE mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">σN mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">σpos mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">a mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">b mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 0;">θ</th>
      </tr>
      ${sr.ptResults.map(pr => {
        const sm   = pr.sigPos * 1000 * k;
        const a_mm = pr.aSemi  * 1000 * k;
        const b_mm = pr.bSemi  * 1000 * k;
        const col  = sm < 5 ? "#00ff88" : sm < 20 ? "#ffcc00" : "#ff5050";
        const ptType = pts.find(p => p.id === pr.id)?.type || "";
        return `<tr style="border-bottom:1px solid #0f1e30;">
          <td style="padding:3px 4px 3px 0;color:${PT[ptType]?.c||"#e8f4fd"};font-weight:bold;">${pr.id}</td>
          <td style="text-align:right;color:#ce93d8;font-family:monospace;padding:0 3px;">${(pr.sigE*1000).toFixed(2)}</td>
          <td style="text-align:right;color:#ffb74d;font-family:monospace;padding:0 3px;">${(pr.sigN*1000).toFixed(2)}</td>
          <td style="text-align:right;color:${col};font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td style="text-align:right;color:#e8f4fd;font-family:monospace;padding:0 3px;">${a_mm.toFixed(2)}</td>
          <td style="text-align:right;color:#e8f4fd;font-family:monospace;padding:0 3px;">${b_mm.toFixed(2)}</td>
          <td style="text-align:right;color:#8aa8c0;font-family:monospace;font-size:10px;padding:0;">${fG(D_(pr.theta))}</td>
        </tr>`;
      }).join("")}
    </table></div>

    ${sr.simStationResults && sr.simStationResults.length > 0 ? `
    ${SEC("3b. SIMULERADE UPPSTÄLLNINGAR")}
    <div style="font-size:10px;color:#6080a0;margin-bottom:4px;line-height:1.7;">
      σ_pos inkl. anslutningspunkternas osäkerhet. <span style="color:#7090a8;">Obs</span> = utan felfortplantning (för jämförelse).
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr style="border-bottom:1px solid #1e3850;">
        <th style="text-align:left;color:#ff6090;font-weight:normal;padding:2px 4px 4px 0;">Uppst.</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σE mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σN mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σpos mm</th>
        <th style="text-align:right;color:#7090a8;font-weight:normal;padding:2px 3px;">Obs mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">a mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 0;">b mm</th>
      </tr>
      ${sr.simStationResults.map(ss => {
        if (!ss.ok) return `<tr><td colspan="7" style="padding:4px;color:#ff5050;font-size:11px;">⚠ ${ss.id}: ${ss.error}</td></tr>`;
        const sm  = ss.sigPos * 1000 * k;
        const col = sm < 5 ? "#00ff88" : sm < 20 ? "#ffcc00" : "#ff5050";
        return `<tr style="border-bottom:1px solid #0f1e30;">
          <td style="padding:3px 4px 3px 0;color:#ff6090;font-weight:bold;">${ss.id}</td>
          <td style="text-align:right;color:#ce93d8;font-family:monospace;padding:0 3px;">${(ss.sigE*1000*k).toFixed(2)}</td>
          <td style="text-align:right;color:#ffb74d;font-family:monospace;padding:0 3px;">${(ss.sigN*1000*k).toFixed(2)}</td>
          <td style="text-align:right;color:${col};font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td style="text-align:right;color:#506070;font-family:monospace;padding:0 3px;">${ss.sigPos_obs != null ? (ss.sigPos_obs*1000*k).toFixed(2) : "–"}</td>
          <td style="text-align:right;color:#ff6090;font-family:monospace;padding:0 3px;">${(ss.aSemi*1000*k).toFixed(2)}</td>
          <td style="text-align:right;color:#ff6090;font-family:monospace;padding:0;">${(ss.bSemi*1000*k).toFixed(2)}</td>
        </tr>`;
      }).join("")}
    </table></div>` : ""}

    ${SEC("4. RELIABILITET PER MÄTNING")}
    <div style="font-size:10px;color:#6080a0;margin-bottom:4px;line-height:1.7;">
      r = redundansbidrag &nbsp;|&nbsp; MUF = Minsta Urskiljbara Fel (κ=${sr.kappa||2.80})<br>
      <span style="color:#4fc3f7;">YT</span> = MUF×(1−r) i observationsdomänen &nbsp;|&nbsp;
      <span style="color:#ffb74d;">KP</span> = Koordinatpåverkan (mm)
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:380px;">
      <tr style="border-bottom:1px solid #1e3850;">
        <th style="text-align:left;color:#6080a0;font-weight:normal;padding:2px 4px 4px 0;">Sträcka</th>
        <th style="text-align:left;color:#6080a0;font-weight:normal;">Typ</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">r</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">MUF</th>
        <th style="text-align:right;color:#4fc3f7;font-weight:normal;padding:2px 3px;">YT</th>
        <th style="text-align:right;color:#ffb74d;font-weight:normal;padding:2px 3px;">KP mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;">Klass</th>
      </tr>
      ${sr.redund.map(rd => {
        const mufStr = rd.mdb.val === Infinity ? "∞" : rd.type === "dist"
          ? (rd.mdb.val*1000).toFixed(1) + "mm"
          : rd.mdb.val.toFixed(2) + "mgon";
        const yt    = rd.mdb.val === Infinity ? Infinity : rd.mdb.val * (1 - rd.ri);
        const ytStr = yt === Infinity ? "∞" : rd.type === "dist"
          ? (yt*1000).toFixed(2) + "mm"
          : yt.toFixed(4) + "gon";
        const kpStr = rd.yt_m === undefined || rd.yt_m === Infinity ? "∞" : (rd.yt_m*1000).toFixed(2);
        return `<tr style="border-bottom:1px solid #0f1e30;">
          <td style="padding:3px 4px 3px 0;color:#8aa8c0;font-size:10px;white-space:nowrap;">${rd.fromId}→${rd.toId}</td>
          <td style="color:#7090a8;">${rd.type === "dist" ? "Avst" : "Riktning"}</td>
          <td style="text-align:right;color:${rColor(rd.ri)};font-family:monospace;font-weight:bold;padding:0 3px;">${rd.ri.toFixed(3)}</td>
          <td style="text-align:right;color:#8aa8c0;font-family:monospace;font-size:10px;padding:0 3px;">${mufStr}</td>
          <td style="text-align:right;color:#4fc3f7;font-family:monospace;font-size:10px;padding:0 3px;">${ytStr}</td>
          <td style="text-align:right;color:#ffb74d;font-family:monospace;font-size:10px;padding:0 3px;">${kpStr}</td>
          <td style="text-align:right;color:${rColor(rd.ri)};font-size:10px;">${rLabel(rd.ri)}</td>
        </tr>`;
      }).join("")}
    </table></div>

    ${SEC("5. PUNKTKVALITET  σ_pos  +  RELIABILITET")}
    <div style="font-size:10px;color:#6080a0;margin-bottom:4px;line-height:1.8;">
      Reliabilitet = förmåga att detektera fel. Bägge måtten krävs för komplett kvalitetsbedömning.
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;">
      <span style="color:#8aa8c0;">Krav σ_pos ≤</span>
      <input type="number" id="sig-req" value="${sigReq}" min="0.1" step="0.5"
        oninput="window._setSigReq(parseFloat(this.value)||3)"
        style="width:55px;padding:2px 4px;font-size:12px;background:#060c18;border:1px solid #1e3850;color:#e8f4fd;border-radius:3px;">
      <span style="color:#8aa8c0;">mm</span>
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:340px;">
      <tr style="border-bottom:1px solid #1e3850;">
        <th style="text-align:left;color:#6080a0;font-weight:normal;padding:2px 4px 4px 0;">Punkt</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">σ_pos mm</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">Precision</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">Obs</th>
        <th style="text-align:right;color:#6080a0;font-weight:normal;padding:2px 3px;">r̄</th>
        <th style="text-align:left;color:#6080a0;font-weight:normal;padding:2px 3px;">Reliabilitet</th>
      </tr>
      ${sr.ptResults.map(pr => {
        const sm      = pr.sigPos * 1000;
        const precOK  = sm <= sigReq;
        const precCol = sm < sigReq * 0.5 ? "#00ff88" : sm <= sigReq ? "#ffcc00" : "#ff5050";
        const myR     = sr.redund.filter(rd => rd.fromId === pr.id || rd.toId === pr.id);
        const nObs    = myR.length;
        const rMeanPt = nObs > 0 ? myR.reduce((a, b) => a + b.ri, 0) / nObs : null;
        const maxR    = nObs > 0 ? Math.max(...myR.map(r => r.ri)) : 0;
        const hasRedundans = maxR > 0.05;
        const nObsMeas = Math.round(nObs / 2);
        let relCol, relText, relIcon;
        if (nObs === 0)          { relCol="#ff5050"; relText="Ingen mätning";    relIcon="⛔"; }
        else if (!hasRedundans)  { relCol="#ff5050"; relText="Ej kontrollerbar"; relIcon="⚠"; }
        else if (rMeanPt < 0.15) { relCol="#ff9900"; relText="Svag";             relIcon="△"; }
        else if (rMeanPt < 0.35) { relCol="#ffcc00"; relText="Acceptabel";       relIcon="◇"; }
        else                     { relCol="#00ff88"; relText="God";               relIcon="✓"; }
        const ptType = pts.find(p => p.id === pr.id)?.type || "";
        return `<tr style="border-bottom:1px solid ${!hasRedundans && nObs > 0 ? "#ff505033" : "#0f1e30"};">
          <td style="padding:3px 4px 3px 0;color:${PT[ptType]?.c||"#e8f4fd"};font-weight:bold;">${pr.id}</td>
          <td style="text-align:right;color:${precCol};font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td style="text-align:right;color:${precCol};font-size:10px;padding:0 3px;">${precOK ? "✓ OK" : "✗ Ej krav"}</td>
          <td style="text-align:right;color:#8aa8c0;padding:0 3px;">${nObsMeas}</td>
          <td style="text-align:right;color:${relCol};font-family:monospace;padding:0 3px;">${rMeanPt != null ? rMeanPt.toFixed(3) : "–"}</td>
          <td style="padding:0 3px;color:${relCol};">${relIcon} ${relText}</td>
        </tr>`;
      }).join("")}
    </table></div>

    <div style="margin-top:12px;">
      <button onclick="window._exportRep()" style="width:100%;padding:7px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f7;color:#4fc3f7;border-radius:3px;cursor:pointer;">💾 Exportera simuleringsrapport (.txt)</button>
    </div>`;
    return;
  }

  // ── INSTRUMENT ──
  if (atab === "instr") {
    tc.innerHTML = `<div class="sl">STANDARDINSTRUMENT</div>
      <select id="global-instr" onchange="window._setDefaultInstr(this.value)" style="width:100%;padding:5px;font-size:12px;background:#060c18;border:1px solid #1e3850;color:#e8f4fd;border-radius:3px;margin-bottom:4px;">
        ${Object.entries(INSTRUMENTS).map(([k,v]) => `<option value="${k}"${k===defaultInstr?" selected":""}>${v.l}</option>`).join("")}
      </select>
      <div id="global-instr-info" style="font-size:11px;color:#6080a0;margin-bottom:8px;"></div>
      <button onclick="window._applyInstrToAll()" style="width:100%;padding:6px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f766;color:#4fc3f7;border-radius:3px;cursor:pointer;margin-bottom:10px;">Tillämpa på alla mätningar</button>
      <div class="sl">CENTRERINGSFEL</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <input id="center-err" type="number" step="0.1" min="0" value="${centerErr}" style="flex:1;padding:5px;font-size:12px;background:#060c18;border:1px solid #1e3850;color:#e8f4fd;border-radius:3px;">
        <span style="font-size:12px;color:#7090a8;">mm (globalt)</span>
      </div>`;
    updateGlobalInstrInfo();
    document.getElementById("center-err")?.addEventListener("change", e => {
      setState({ centerErr: parseFloat(e.target.value) || 1.0 });
    });
    return;
  }

  // ── A PRIORI σ ──
  if (atab === "aprior") {
    tc.innerHTML = `<div class="sl">A PRIORI OSÄKERHET</div>
      <div style="font-size:12px;color:#7090a8;line-height:1.7;">Ange kraven för nätnoggrannheten (SIS-TS 21143:2016).</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;color:#a0bcd0;">Krav σ_pos ≤</span>
        <input id="sig-req" type="number" step="0.5" min="0.5" value="${getState().sigReq||3}" style="width:70px;padding:5px;font-size:12px;background:#060c18;border:1px solid #1e3850;color:#e8f4fd;border-radius:3px;">
        <span style="font-size:12px;color:#a0bcd0;">mm</span>
      </div>`;
    return;
  }

  // ── POLÄR ──
  if (atab === "polar") {
    tc.innerHTML = `<div class="sl">POLÄR BERÄKNING</div>
      <div style="font-size:12px;color:#7090a8;padding:20px 0;text-align:center;">Polärberäkning tillgänglig i nästa fas.</div>`;
    return;
  }

  // ── RAPPORT ──
  if (atab === "rep") {
    tc.innerHTML = `<div class="sl">RAPPORT</div>
      <button onclick="window._exportRep()" style="width:100%;padding:8px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f766;color:#4fc3f7;border-radius:3px;cursor:pointer;margin-bottom:6px;">📄 Simuleringsrapport (.txt)</button>
      <button onclick="window._openPM()" style="width:100%;padding:8px;font-size:12px;background:#00ff8818;border:1px solid #00ff88;color:#00ff88;border-radius:3px;cursor:pointer;">📐 Generera PM</button>`;
    return;
  }
}

// ── Instrument-hjälpfunktioner ──
export function buildGlobalInstr() {
  const { defaultInstr } = getState();
  const sel = document.getElementById("global-instr");
  if (!sel) return;
  sel.innerHTML = Object.entries(INSTRUMENTS).map(([k,v]) => `<option value="${k}"${k===defaultInstr?" selected":""}>${v.l}</option>`).join("");
  updateGlobalInstrInfo();
}

export function updateGlobalInstrInfo() {
  const { defaultInstr } = getState();
  const pr   = INSTRUMENTS[defaultInstr];
  const info = document.getElementById("global-instr-info");
  if (!info || !pr) return;
  info.innerHTML = `σ vinkel: <span style="color:#4fc3f7">${pr.sigHz} mgon</span> &nbsp; σ avst: <span style="color:#4fc3f7">${pr.sigDmm} mm + ${pr.sigDppm} ppm</span>`;
}

export function applyMatklass(key) {
  if (!key || !MATKLASSER[key]) { setState({ activeMatklass: null }); return; }
  const mk = MATKLASSER[key];
  setState({ activeMatklass: key, centerErr: mk.centerErr });
  const ceInp = document.getElementById("center-err");
  if (ceInp) ceInp.value = mk.centerErr;
  const { meas } = getState();
  meas.forEach(m => { m.sigHz_mgon=mk.sigHz_mgon; m.sigDist_mm=mk.sigDist_mm; m.sigDist_ppm=mk.sigDist_ppm; m.numSatser=mk.numSatser; m.instrPreset="custom"; });
  setState({ simResult: null });
  import('./toast.js').then(t => t.showToast(`✓ ${mk.l} tillämpad på alla mätningar`, "#00ff88"));
  draw();
  renderTab();
}

export function initRightPanel() {
  buildTabs();
  renderTab();

  window._setTab           = setTab;
  window._openMM           = openMM;
  window._delM             = delM;
  window._runSim           = () => { runSimulation(); suggestMeasurements(); import('./quality-panel.js').then(m => m.updateQualityPanel()); draw(); renderTab(); };
  window._applyMatklass    = applyMatklass;
  window._setDefaultInstr  = key => { setState({ defaultInstr: key }); updateGlobalInstrInfo(); };
  window._applyInstrToAll  = () => {
    const { meas, defaultInstr } = getState();
    if (!confirm(`Tillämpa "${INSTRUMENTS[defaultInstr].l}" på alla ${meas.length} mätningar?`)) return;
    const pr = INSTRUMENTS[defaultInstr];
    meas.forEach(m => { m.instrPreset=defaultInstr; m.sigHz_mgon=pr.sigHz; m.sigDist_mm=pr.sigDmm; m.sigDist_ppm=pr.sigDppm; });
    setState({ simResult: null }); draw();
  };
  window._suggestMeas      = () => { suggestMeasurements(); draw(); renderTab(); };
  window._setEllipsMode    = mode => { setState({ ellipsMode: mode }); draw(); renderTab(); };
  window._setSigReq        = val  => { setState({ sigReq: val }); renderTab(); };
  window._showValidationDialog = showValidationDialog;
  window._exportRep        = () => import('../reports/sim-report.js').then(m => m.exportSimReport()).catch(() => alert("Rapport-export tillgänglig i Fas 6."));
  window._openPM           = () => import('../pm/pm.js').then(m => m.openPM()).catch(() => alert("PM-generering tillgänglig i Fas 7."));

  // Exponera setState/draw för inline onclick i renderTab-HTML
  window.setState_ = partial => { setState(partial); };
  window.draw_     = draw;
}
