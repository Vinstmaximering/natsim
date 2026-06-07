// Tabs och höger-panel: buildTabs, setTab, renderTab, buildGlobalInstr, applyMatklass
// rad 1679–2215 (renderTab) + rad 1116–1151 (suggestMeasurements) + rad 3332–3352 (instrument)
import { getState, setState } from '../state/store.js';
import { STUDIO_TABS } from './studio.js';
import { INSTRUMENTS, MATKLASSER, PT, CRS_DEFS } from '../core/constants.js';
import { calcM, fG, fD, d2EN, brgEN } from '../core/designmatrix.js';
import { rColor, rLabel } from '../core/redundancy.js';
import { runSimulation } from '../core/simulation.js';
import { saveUndo } from '../state/undo.js';
import { draw } from '../map/leaflet-setup.js';
import { openMM, delM } from './modals.js';
import { showValidationDialog } from './validation.js';
import { renderObstaclePanel, initObstaclePanel } from './obstacle-panel.js';
import { hasLineOfSight } from '../core/visibility.js';

// ── Bugg 1-fix: suggestMeasurements – rad 1116–1151 exakt ──────────────────
// Läser ENBART pts/meas från state – kräver INTE att simResult är satt.
// Fas 3: siktlinje-kontroll mot obstacles (tom array = identiskt beteende som innan).
export function suggestMeasurements() {
  const { pts, meas, obstacles = [] } = getState();
  const stations = pts.filter(p => p.type === "station");
  const known    = pts.filter(p => p.type === "known");
  // Fix: inkludera new, detail och simstation som mätmål (var ofrivilligt borttaget)
  const unknowns = pts.filter(p => ["new", "detail", "simstation"].includes(p.type));
  const suggested = [];
  const blocked   = []; // [{from, to, blockedBy}]
  if (!stations.length) { setState({ suggestedMeas: [], blockedSuggestions: [] }); return; }

  stations.forEach(s => {
    const existing    = meas.filter(m => m.from === s.id || m.to === s.id);
    const existingIds = new Set(existing.map(m => m.from === s.id ? m.to : m.from));

    // Bakåtsikter till kända punkter (upp till 3 saknade)
    const missingKnown = known.filter(k => !existingIds.has(k.id));
    missingKnown.sort((a, b) => d2EN(s, a) - d2EN(s, b));
    const currentKnownCount = known.filter(k => existingIds.has(k.id)).length;
    const needed = Math.max(0, 3 - currentKnownCount);
    missingKnown.slice(0, needed).forEach(k => {
      const los = hasLineOfSight(s, k, obstacles);
      if (!los.visible) {
        blocked.push({ from: s.id, to: k.id, blockedBy: los.blockedBy });
      } else {
        suggested.push({ from: s.id, to: k.id, reason: `Bakåtsikt till känd punkt (${currentKnownCount + 1}/3 min. rekommenderat)` });
      }
    });

    // Mätningar till obekanta punkter (new, detail, simstation)
    unknowns.filter(u => !existingIds.has(u.id)).forEach(u => {
      const los = hasLineOfSight(s, u, obstacles);
      if (!los.visible) {
        blocked.push({ from: s.id, to: u.id, blockedBy: los.blockedBy });
      } else {
        suggested.push({ from: s.id, to: u.id, reason: "Mätning till obekant punkt" });
      }
    });

    // Korsförbindelser mellan uppställningar
    if (stations.length > 1) {
      stations.filter(s2 => s2.id !== s.id && !existingIds.has(s2.id)).forEach(s2 => {
        const already = suggested.find(sg =>
          (sg.from === s.id && sg.to === s2.id) || (sg.from === s2.id && sg.to === s.id)
        );
        const alreadyBlocked = blocked.find(b =>
          (b.from === s.id && b.to === s2.id) || (b.from === s2.id && b.to === s.id)
        );
        if (!already && !alreadyBlocked) {
          const los = hasLineOfSight(s, s2, obstacles);
          if (!los.visible) {
            blocked.push({ from: s.id, to: s2.id, blockedBy: los.blockedBy });
          } else {
            suggested.push({ from: s.id, to: s2.id, reason: "Korsförbindelse mellan uppställningar (stärker geometrin)" });
          }
        }
      });
    }
  });
  setState({ suggestedMeas: suggested, blockedSuggestions: blocked });
}

const TABS = [
  { k:"net",    l:"NÄT" },
  { k:"meas",   l:"MÄTNINGAR" },
  { k:"polar",  l:"POLÄR" },
  { k:"sim",    l:"SIMULERING" },
  { k:"hinder", l:"HINDER" },
  { k:"instr",  l:"INSTRUMENT" },
  { k:"aprior", l:"A PRIORI σ" },
  { k:"rep",    l:"RAPPORT" },
];

export function buildTabs() {
  const { atab } = getState();
  const el = document.getElementById("tabs");
  if (!el) return;
  el.innerHTML = TABS.map(t => {
    const act = t.k === atab ? ' act' : '';
    const dbl = STUDIO_TABS.has(t.k) ? ` ondblclick="window._openStudio('${t.k}')"` : '';
    const sx  = STUDIO_TABS.has(t.k)
      ? `<button class="tabt-sx" onclick="window._openStudio('${t.k}')" title="Studioläge (Ctrl+E)">⛶</button>`
      : '';
    return `<span class="tabt-wrap"><button class="tabt${act}" onclick="window._setTab('${t.k}')"${dbl}>${t.l}</button>${sx}</span>`;
  }).join("");
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
    <button onclick="window._suggestMeas()" style="width:100%;padding:7px;font-size:12px;background:#ffdc3218;border:1px solid #ffdc3266;color:#ffdc32;border-radius:3px;cursor:pointer;margin-bottom:4px;">⚡ Analysera och föreslå mätningar</button>
    ${(() => {
      const sg = getState().suggestedMeas || [];
      if (!sg.length) return '';
      return `<button onclick="window._importAllSugg()"
        style="width:100%;padding:6px;font-size:12px;background:#00ff8818;border:1px solid #00ff8866;color:#00ff88;border-radius:3px;cursor:pointer;margin-bottom:4px;">
        ✓ Importera alla ${sg.length} förslag som mätningar
      </button>`;
    })()}
    ${(() => {
      const bl = getState().blockedSuggestions || [];
      if (!bl.length) return '';
      const on = document.getElementById('tgb')?.checked ?? false;
      return `<div style="font-size:11px;color:#ff7070;padding:4px 6px;background:#1e0808;border-radius:3px;margin-bottom:6px;">
        ⛔ ${bl.length} förslag blockerade av hinder
        <span style="cursor:pointer;color:#4fc3f7;text-decoration:underline;margin-left:4px;"
              onclick="window._toggleBlockedSugg()">
          ${on ? 'dölj' : 'visa'}
        </span>
      </div>`;
    })()}
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
      return `<div class="lc" style="${isSel?"border-color:#ff9900;":""}cursor:pointer;" onclick="window._selectMeas('${m.id}')">
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

  // ── HINDER ──
  if (atab === "hinder") {
    renderObstaclePanel();
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
      tc.innerHTML += `<div class="val-danger" style="font-size:12px;background:color-mix(in srgb,var(--color-danger) 10%,var(--bg-card));padding:10px;border-radius:3px;line-height:1.8;border:1px solid color-mix(in srgb,var(--color-danger) 40%,transparent)">⚠ ${errLines.map((l,i)=>i===0?`<b>${l}</b>`:l).join("<br>")}</div>`;
      return;
    }

    const sr  = simResult;
    const { ellipsMode, activeCRS, sigReq = 3 } = getState();
    const k   = (ellipsMode !== "95") ? 1.0 : 2.4477;
    const D_  = r => r * 180 / Math.PI;
    const now = new Date();
    const dateStr  = now.toLocaleDateString("sv-SE") + " " + now.toLocaleTimeString("sv-SE", { hour:"2-digit", minute:"2-digit" });
    const crsName  = CRS_DEFS[activeCRS]?.name || activeCRS;

    // ── Klasser för statusfärger (tema-anpassade via tokens.css) ──────────────
    const rClass    = r  => r  >= 0.5 ? "val-good" : r  >= 0.3 ? "val-caution" : r  >= 0.1 ? "val-warn" : "val-danger";
    const sigClass  = mm => mm <  5   ? "val-good" : mm <  20  ? "val-caution" : "val-danger";
    const precClass = (mm, req) => mm < req * 0.5 ? "val-good" : mm <= req ? "val-caution" : "val-danger";
    const kCls      = kv => kv > 1.14 ? "val-purple" : kv >= 0.5 ? "val-good" : kv >= 0.3 ? "val-caution" : kv >= 0.1 ? "val-warn" : "val-danger";
    const relClass  = (nObs, hasRed, rMean) => {
      if (!nObs || !hasRed) return "val-danger";
      return rMean < 0.15 ? "val-warn" : rMean < 0.35 ? "val-caution" : "val-good";
    };

    // TR: tabellrad med semantisk klass på värde-cellen i stället för inline color.
    const TR  = (label, val, cls) => `<tr><td class="val-secondary" style="padding:2px 6px 2px 0;white-space:nowrap;">${label}</td><td class="${cls||"val-value"}" style="font-family:monospace;text-align:right;">${val}</td></tr>`;
    const SEC = title => `<div class="sim-sec">${title}</div>`;

    tc.innerHTML += `
    <div class="sim-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="val-info" style="font-size:14px;font-weight:bold;letter-spacing:1px;">NÄTSIMULERING</div>
          <div class="val-muted" style="font-size:11px;margin-top:2px;">Absolut anslutning – minsta kvadratutjämning</div>
        </div>
        <div class="val-muted" style="text-align:right;font-size:11px;">
          <div>${dateStr}</div><div class="val-info">${crsName}</div>
        </div>
      </div>
    </div>

    ${SEC("1. NÄTÖVERSIKT")}
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      ${TR("Kända punkter (fixerade)", sr.knownCount, "val-good")}
      ${TR("Fria punkter", sr.freeCount, "val-info")}
      ${TR("Uppställningar (orienteringar)", sr.nOrientUnkn ?? "–", "val-warn")}
      ${TR("Mätningar (linjer)", sr.measCount)}
      ${TR("Observationer (riktningar+längder)", sr.meas_n)}
      <tr><td colspan="2" class="sim-tbl-sep"></td></tr>
      ${TR("Koordinatobekanta", sr.nCoordUnkn ?? sr.unkn_n, "val-info")}
      ${TR("Orienteringskonstanter", sr.nOrientUnkn ?? 0, "val-warn")}
      ${TR("Totalt obekanta", sr.unkn_n)}
      <tr><td colspan="2" class="sim-tbl-sep"></td></tr>
      ${TR("Frihetsgrader f", sr.redundancy, sr.redundancy > 0 ? "val-good" : "val-danger")}
      ${TR("Σ redundansbidrag", sr.redundTotal)}
      ${TR("κ (MUF-faktor)", sr.kappa != null ? sr.kappa.toFixed(2) : "2.80")}
    </table>

    ${SEC("2. KONTROLLERBARHETSTAL  k = f/n")}
    <div class="sim-k-box" style="border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span class="${kCls(sr.K_global)}" style="font-size:16px;font-weight:bold;font-family:monospace;">k = ${sr.K_global.toFixed(3)}</span>
        <span class="${kCls(sr.K_global)}" style="font-size:12px;font-weight:bold;background:color-mix(in srgb,currentColor 12%,transparent);padding:3px 10px;border-radius:2px;">${sr.K_class}</span>
      </div>
      <div class="val-muted" style="font-size:10px;line-height:1.7;">≥0.50 Starkt &nbsp;|&nbsp; 0.30–0.50 Acceptabelt &nbsp;|&nbsp; 0.10–0.30 Svagt &nbsp;|&nbsp; &lt;0.10 Otillräckligt</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;">
        ${TR("Medel r_i",        sr.rMean.toFixed(3),    rClass(sr.rMean))}
        ${sr.rMinDist != null ? TR("Min r_i (avstånd)", sr.rMinDist.toFixed(3), rClass(sr.rMinDist)) : ""}
        ${sr.rMinHz   != null ? TR("Min r_i (vinkel)",  sr.rMinHz.toFixed(3),   rClass(sr.rMinHz))   : ""}
      </table>
    </div>

    ${SEC("3. PUNKTOSÄKERHETER")}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;flex-wrap:wrap;">
      <span class="val-secondary">Felellipsskala:</span>
      <button onclick="window._setEllipsMode('1sig')" style="padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${(ellipsMode !== '95') ? 'var(--accent)' : 'var(--border-strong)'};background:${(ellipsMode !== '95') ? 'color-mix(in srgb,var(--accent) 12%,transparent)' : 'transparent'};color:${(ellipsMode !== '95') ? 'var(--accent)' : 'var(--text-muted)'};">1σ (Geo)</button>
      <button onclick="window._setEllipsMode('95')" style="padding:2px 8px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${ellipsMode === '95' ? 'var(--color-measure)' : 'var(--border-strong)'};background:${ellipsMode === '95' ? 'color-mix(in srgb,var(--color-measure) 12%,transparent)' : 'transparent'};color:${ellipsMode === '95' ? 'var(--color-measure)' : 'var(--text-muted)'};">95% (k=2.45)</button>
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:300px;">
      <tr style="border-bottom:1px solid var(--border-strong);">
        <th class="val-muted" style="text-align:left;font-weight:normal;padding:2px 4px 4px 0;">Punkt</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">σE mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">σN mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">σpos mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">a mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">b mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 0;">θ</th>
      </tr>
      ${sr.ptResults.map(pr => {
        const sm   = pr.sigPos * 1000 * k;
        const a_mm = pr.aSemi  * 1000 * k;
        const b_mm = pr.bSemi  * 1000 * k;
        const ptType = pts.find(p => p.id === pr.id)?.type || "";
        return `<tr style="border-bottom:1px solid var(--border-default);">
          <td style="padding:3px 4px 3px 0;color:${PT[ptType]?.c||"var(--text-value)"};font-weight:bold;">${pr.id}</td>
          <td class="val-purple" style="text-align:right;font-family:monospace;padding:0 3px;">${(pr.sigE*1000).toFixed(2)}</td>
          <td class="val-warn"   style="text-align:right;font-family:monospace;padding:0 3px;">${(pr.sigN*1000).toFixed(2)}</td>
          <td class="${sigClass(sm)}" style="text-align:right;font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td class="val-value"  style="text-align:right;font-family:monospace;padding:0 3px;">${a_mm.toFixed(2)}</td>
          <td class="val-value"  style="text-align:right;font-family:monospace;padding:0 3px;">${b_mm.toFixed(2)}</td>
          <td class="val-secondary" style="text-align:right;font-family:monospace;font-size:10px;padding:0;">${fG(D_(pr.theta))}</td>
        </tr>`;
      }).join("")}
    </table></div>

    ${sr.simStationResults && sr.simStationResults.length > 0 ? `
    ${SEC("3b. SIMULERADE UPPSTÄLLNINGAR")}
    <div class="val-muted" style="font-size:10px;margin-bottom:4px;line-height:1.7;">
      σ_pos inkl. anslutningspunkternas osäkerhet. <span class="val-muted">Obs</span> = utan felfortplantning (för jämförelse).
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr style="border-bottom:1px solid var(--border-strong);">
        <th style="text-align:left;color:#ff6090;font-weight:normal;padding:2px 4px 4px 0;">Uppst.</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σE mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σN mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">σpos mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">Obs mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 3px;">a mm</th>
        <th style="text-align:right;color:#ff6090;font-weight:normal;padding:2px 0;">b mm</th>
      </tr>
      ${sr.simStationResults.map(ss => {
        if (!ss.ok) return `<tr><td colspan="7" class="val-danger" style="padding:4px;font-size:11px;">⚠ ${ss.id}: ${ss.error}</td></tr>`;
        const sm = ss.sigPos * 1000 * k;
        return `<tr style="border-bottom:1px solid var(--border-default);">
          <td style="padding:3px 4px 3px 0;color:#ff6090;font-weight:bold;">${ss.id}</td>
          <td class="val-purple" style="text-align:right;font-family:monospace;padding:0 3px;">${(ss.sigE*1000*k).toFixed(2)}</td>
          <td class="val-warn"   style="text-align:right;font-family:monospace;padding:0 3px;">${(ss.sigN*1000*k).toFixed(2)}</td>
          <td class="${sigClass(sm)}" style="text-align:right;font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td class="val-muted"  style="text-align:right;font-family:monospace;padding:0 3px;">${ss.sigPos_obs != null ? (ss.sigPos_obs*1000*k).toFixed(2) : "–"}</td>
          <td style="text-align:right;color:#ff6090;font-family:monospace;padding:0 3px;">${(ss.aSemi*1000*k).toFixed(2)}</td>
          <td style="text-align:right;color:#ff6090;font-family:monospace;padding:0;">${(ss.bSemi*1000*k).toFixed(2)}</td>
        </tr>`;
      }).join("")}
    </table></div>` : ""}

    ${SEC("4. RELIABILITET PER MÄTNING")}
    <div class="val-muted" style="font-size:10px;margin-bottom:4px;line-height:1.7;">
      r = redundansbidrag &nbsp;|&nbsp; MUF = Minsta Urskiljbara Fel (κ=${sr.kappa||2.80})<br>
      <span class="val-info">YT</span> = MUF×(1−r) i observationsdomänen &nbsp;|&nbsp;
      <span class="val-warn">KP</span> = Koordinatpåverkan (mm)
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:380px;">
      <tr style="border-bottom:1px solid var(--border-strong);">
        <th class="val-muted" style="text-align:left;font-weight:normal;padding:2px 4px 4px 0;">Sträcka</th>
        <th class="val-muted" style="text-align:left;font-weight:normal;">Typ</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">r</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;" title="Minsta Urskiljbara Fel – minsta systematiskt fel som ger statistisk signifikans vid givet κ">MUF</th>
        <th class="val-info"  style="text-align:right;font-weight:normal;padding:2px 3px;" title="Yttre tillförlitlighet: MUF × (1 − r), påverkan i observationsdomänen">YT</th>
        <th class="val-warn"  style="text-align:right;font-weight:normal;padding:2px 3px;">KP mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;">Klass</th>
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
        return `<tr style="border-bottom:1px solid var(--border-default);">
          <td class="val-secondary" style="padding:3px 4px 3px 0;font-size:10px;white-space:nowrap;">${rd.fromId}→${rd.toId}</td>
          <td class="val-muted">${rd.type === "dist" ? "Avst" : "Riktning"}</td>
          <td class="${rClass(rd.ri)}" style="text-align:right;font-family:monospace;font-weight:bold;padding:0 3px;">${rd.ri.toFixed(3)}</td>
          <td class="val-secondary" style="text-align:right;font-family:monospace;font-size:10px;padding:0 3px;">${mufStr}</td>
          <td class="val-info" style="text-align:right;font-family:monospace;font-size:10px;padding:0 3px;">${ytStr}</td>
          <td class="val-warn" style="text-align:right;font-family:monospace;font-size:10px;padding:0 3px;">${kpStr}</td>
          <td class="${rClass(rd.ri)}" style="text-align:right;font-size:10px;">${rLabel(rd.ri)}</td>
        </tr>`;
      }).join("")}
    </table></div>

    ${SEC("5. PUNKTKVALITET  σ_pos  +  RELIABILITET")}
    <div class="val-muted" style="font-size:10px;margin-bottom:4px;line-height:1.8;">
      Reliabilitet = förmåga att detektera fel. Bägge måtten krävs för komplett kvalitetsbedömning.
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;">
      <span class="val-secondary">Krav σ_pos ≤</span>
      <input type="number" id="sig-req" value="${sigReq}" min="0.1" step="0.5"
        onchange="window._setSigReq(parseFloat(this.value)||3)"
        style="width:55px;padding:2px 4px;font-size:12px;background:var(--bg-input);border:1px solid var(--border-strong);color:var(--text-value);border-radius:3px;">
      <span class="val-secondary">mm</span>
    </div>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:340px;">
      <tr style="border-bottom:1px solid var(--border-strong);">
        <th class="val-muted" style="text-align:left;font-weight:normal;padding:2px 4px 4px 0;">Punkt</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">σ_pos mm</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">Precision</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">Obs</th>
        <th class="val-muted" style="text-align:right;font-weight:normal;padding:2px 3px;">r̄</th>
        <th class="val-muted" style="text-align:left;font-weight:normal;padding:2px 3px;">Reliabilitet</th>
      </tr>
      ${sr.ptResults.map(pr => {
        const sm       = pr.sigPos * 1000;
        const precOK   = sm <= sigReq;
        const pcls     = precClass(sm, sigReq);
        const myR      = sr.redund.filter(rd => rd.fromId === pr.id || rd.toId === pr.id);
        const nObs     = myR.length;
        const rMeanPt  = nObs > 0 ? myR.reduce((a, b) => a + b.ri, 0) / nObs : null;
        const maxR     = nObs > 0 ? Math.max(...myR.map(r => r.ri)) : 0;
        const hasRedundans = maxR > 0.05;
        const nObsMeas = Math.round(nObs / 2);
        let relText, relIcon;
        if (nObs === 0)          { relText="Ingen mätning";    relIcon="⛔"; }
        else if (!hasRedundans)  { relText="Ej kontrollerbar"; relIcon="⚠"; }
        else if (rMeanPt < 0.15) { relText="Svag";             relIcon="△"; }
        else if (rMeanPt < 0.35) { relText="Acceptabel";       relIcon="◇"; }
        else                     { relText="God";               relIcon="✓"; }
        const rcls  = relClass(nObs, hasRedundans, rMeanPt);
        const ptType = pts.find(p => p.id === pr.id)?.type || "";
        const rowBorder = !hasRedundans && nObs > 0
          ? "border-bottom:1px solid color-mix(in srgb,var(--color-danger) 30%,transparent)"
          : "border-bottom:1px solid var(--border-default)";
        return `<tr style="${rowBorder}">
          <td style="padding:3px 4px 3px 0;color:${PT[ptType]?.c||"var(--text-value)"};font-weight:bold;">${pr.id}</td>
          <td class="${pcls}" style="text-align:right;font-family:monospace;font-weight:bold;padding:0 3px;">${sm.toFixed(2)}</td>
          <td class="${pcls}" style="text-align:right;font-size:10px;padding:0 3px;">${precOK ? "✓ OK" : "✗ Ej krav"}</td>
          <td class="val-secondary" style="text-align:right;padding:0 3px;">${nObsMeas}</td>
          <td class="${rcls}" style="text-align:right;font-family:monospace;padding:0 3px;">${rMeanPt != null ? rMeanPt.toFixed(3) : "–"}</td>
          <td class="${rcls}" style="padding:0 3px;">${relIcon} ${relText}</td>
        </tr>`;
      }).join("")}
    </table></div>

    <div style="margin-top:12px;">
      <button onclick="window._exportRep()" class="tb tb-info" style="width:100%;padding:7px;font-size:12px;border-radius:3px;cursor:pointer;">💾 Exportera simuleringsrapport (.txt)</button>
    </div>`;
    return;
  }

  // ── INSTRUMENT ──
  if (atab === "instr") {
    tc.innerHTML = `<div class="sl">STANDARDINSTRUMENT</div>
      <select id="global-instr" onchange="window._setDefaultInstr(this.value)" style="width:100%;padding:5px;font-size:12px;background:var(--bg-input);border:1px solid var(--border-strong);color:var(--text-value);border-radius:3px;margin-bottom:4px;">
        ${Object.entries(INSTRUMENTS).map(([k,v]) => `<option value="${k}"${k===defaultInstr?" selected":""}>${v.l}</option>`).join("")}
      </select>
      <div id="global-instr-info" class="val-muted" style="font-size:11px;margin-bottom:8px;"></div>
      <button onclick="window._applyInstrToAll()" class="tb tb-info" style="width:100%;padding:6px;font-size:12px;border-radius:3px;cursor:pointer;margin-bottom:10px;">Tillämpa på alla mätningar</button>
      <div class="sl">CENTRERINGSFEL</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <input id="center-err" type="number" step="0.1" min="0" value="${centerErr}" style="flex:1;padding:5px;font-size:12px;background:var(--bg-input);border:1px solid var(--border-strong);color:var(--text-value);border-radius:3px;">
        <span class="val-muted" style="font-size:12px;">mm (globalt)</span>
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
      <div class="val-muted" style="font-size:12px;line-height:1.7;">Ange kraven för nätnoggrannheten (SIS-TS 21143:2016).</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
        <span class="val-secondary" style="font-size:12px;">Krav σ_pos ≤</span>
        <input id="sig-req" type="number" step="0.5" min="0.5" value="${getState().sigReq||3}" style="width:70px;padding:5px;font-size:12px;background:var(--bg-input);border:1px solid var(--border-strong);color:var(--text-value);border-radius:3px;">
        <span class="val-secondary" style="font-size:12px;">mm</span>
      </div>`;
    document.getElementById("sig-req")?.addEventListener("change", e => {
      setState({ sigReq: parseFloat(e.target.value) || 3 });
    });
    return;
  }

  // ── POLÄR – identisk med original rad 1746–1772 ──
  if (atab === "polar") {
    const { selId } = getState();
    const sp = pts.find(p => p.id === selId);
    if (!sp) {
      tc.innerHTML = `<div class="sl">POLÄR BERÄKNING</div>
        <div style="text-align:center;padding:24px 0;color:#7090a8;font-size:12px;">Välj en punkt i kartan</div>`;
      return;
    }
    const myM = meas.filter(m => m.from === selId || m.to === selId);
    const rows = pts.filter(p => p.id !== selId).map(p => {
      const dc = Math.sqrt((p.E-sp.E)**2 + (p.N-sp.N)**2);
      let bc = Math.atan2(p.E-sp.E, p.N-sp.N) * 180 / Math.PI;
      if (bc < 0) bc += 360;
      const hm = myM.find(m => (m.from===selId&&m.to===p.id)||(m.to===selId&&m.from===p.id));
      const col = { known:"#00ff88", station:"#4fc3f7", new:"#ce93d8", detail:"#ffb74d", simstation:"#ff6090" }[p.type] || "#e8f4fd";
      return `<tr style="border-bottom:1px solid #1a2d48;">
        <td style="padding:4px 0;color:${col}">${p.id}</td>
        <td style="text-align:right;color:#e8f4fd;font-family:monospace">${dc.toFixed(4)}</td>
        <td style="text-align:right;color:#00ff88;font-family:monospace;font-size:10px">${fmt(bc)}</td>
        <td style="text-align:right">${hm ? '<span style="color:#ff9900">●</span>' : '<span style="color:#2a4060">○</span>'}</td>
      </tr>`;
    }).join("");
    tc.innerHTML = `<div class="sl">POLÄR FRÅN: ${sp.id}</div>
      <div style="background:${({ known:"#00ff88", station:"#4fc3f7", new:"#ce93d8", detail:"#ffb74d" }[sp.type]||"#888")}18;border:1px solid ${({ known:"#00ff88", station:"#4fc3f7", new:"#ce93d8", detail:"#ffb74d" }[sp.type]||"#888")}44;border-radius:3px;padding:5px 8px;margin-bottom:8px;font-size:12px;">
        <span style="font-weight:bold">${sp.id}</span>
        <span style="color:#7090a8;margin-left:6px">${({ known:"Känd punkt", station:"Uppställning", new:"Ny punkt", detail:"Detaljpunkt" }[sp.type]||sp.type)}</span>
      </div>
      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <thead><tr style="color:#7090a8;border-bottom:1px solid #1a2d48;">
          <th style="text-align:left;padding:2px 0;font-weight:normal;">Till</th>
          <th style="text-align:right;font-weight:normal;">Dist (m)</th>
          <th style="text-align:right;font-weight:normal;">Riktning</th>
          <th style="text-align:right;font-weight:normal;">M</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    return;
  }

  // ── RAPPORT ──
  if (atab === "rep") {
    tc.innerHTML = `<div class="sl">RAPPORTER</div>
      <button onclick="window._exportRep()" style="width:100%;padding:7px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f766;color:#4fc3f7;border-radius:3px;cursor:pointer;margin-bottom:4px;">📄 Simuleringsrapport (.txt)</button>
      <button onclick="window._exportCalcRep()" style="width:100%;padding:7px;font-size:12px;background:#4fc3f718;border:1px solid #4fc3f766;color:#4fc3f7;border-radius:3px;cursor:pointer;margin-bottom:4px;">📊 Beräkningsrapport (.txt)</button>
      <button onclick="window._exportSimPDF()" style="width:100%;padding:7px;font-size:12px;background:#ce93d818;border:1px solid #ce93d8;color:#ce93d8;border-radius:3px;cursor:pointer;margin-bottom:4px;">🖨 Simuleringsrapport (PDF)</button>
      <div class="dv" style="margin:6px 0;"></div>
      <div class="sl">FÄLTDOKUMENTATION</div>
      <button onclick="window._openMeasBook()" style="width:100%;padding:7px;font-size:12px;background:#ffb74d18;border:1px solid #ffb74d;color:#ffb74d;border-radius:3px;cursor:pointer;margin-bottom:4px;">📋 Mätbok A4 (utskrift/PDF)</button>
      <button onclick="window._exportMeasScheme()" style="width:100%;padding:7px;font-size:12px;background:#ffb74d18;border:1px solid #ffb74d;color:#ffb74d;border-radius:3px;cursor:pointer;margin-bottom:6px;">📝 Mätschema (.txt)</button>
      <div class="dv" style="margin:6px 0;"></div>
      <button onclick="window._openPM()" style="width:100%;padding:8px;font-size:12px;background:#00ff8818;border:1px solid #00ff88;color:#00ff88;border-radius:3px;cursor:pointer;">📐 Generera Mätningstekniskt PM</button>`;
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

  initObstaclePanel();

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
  window._importAllSugg   = () => {
    const { suggestedMeas, meas, defaultInstr, nMid } = getState();
    if (!suggestedMeas.length) return;
    if (suggestedMeas.length > 5 && !confirm(`Importera ${suggestedMeas.length} förslag som mätningar?`)) return;
    const pr = INSTRUMENTS[defaultInstr] || INSTRUMENTS['ts16_1'];
    saveUndo(`Importera ${suggestedMeas.length} föreslagna mätningar`);
    let nextId = nMid;
    const newMeas = [
      ...meas,
      ...suggestedMeas.map(sg => ({
        id: `M${nextId++}`,
        from: sg.from, to: sg.to,
        obsType: 'both',
        instrPreset: defaultInstr,
        sigDist_mm: pr.sigDmm, sigDist_ppm: pr.sigDppm,
        sigHz_mgon: pr.sigHz, numSatser: 3,
        measDist: null, measHz: null,
      })),
    ];
    const n = suggestedMeas.length;
    setState({ meas: newMeas, nMid: nextId, suggestedMeas: [] });
    import('./toast.js').then(m => m.showToast(`✓ ${n} mätningar importerade`, '#00ff88'));
    draw();
    renderTab();
  };
  window._setEllipsMode    = mode => { setState({ ellipsMode: mode }); draw(); renderTab(); };
  window._setSigReq        = val  => { setState({ sigReq: val }); renderTab(); };
  window._showValidationDialog = showValidationDialog;
  window._toggleBlockedSugg = () => {
    const cb = document.getElementById('tgb');
    if (cb) { cb.checked = !cb.checked; draw(); renderTab(); }
  };
  // _exportRep och _openPM sätts av main.js – sätt INTE om dem här (skulle overrida med stubs).

  // Exponera setState/draw för inline onclick i renderTab-HTML
  window.setState_ = partial => { setState(partial); };
  window.draw_     = draw;
  window._selectMeas = id => { setState({ selMId: id }); renderTab(); draw(); };
}
