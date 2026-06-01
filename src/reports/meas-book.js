// Kopierad exakt från NätSim_Beta_2.html rad 2935–3228.
// openMeasBook, buildSchemeText, exportMeasScheme
import { getState } from '../state/store.js';
import { CRS_DEFS, INSTRUMENTS, PT } from '../core/constants.js';
import { calcM, fG, fD } from '../core/designmatrix.js';

// ── Mätschema som text – rad 2935–2955 exakt ────────────────────────────────
export function buildSchemeText() {
  const { meas, pts, defaultInstr, centerErr, au } = getState();
  if (meas.length === 0) return "Inga mätningar definierade.";
  const fmt     = d => au === "grad" ? fG(d) : fD(d);
  const fromIds = [...new Set(meas.map(m => m.from))];
  let txt = `MÄTSCHEMA – ${new Date().toLocaleDateString("sv-SE")}\n${"═".repeat(44)}\n`;
  txt += `Instrument: ${INSTRUMENTS[defaultInstr].l}\nCentreringsfel: ${centerErr} mm\n\n`;
  fromIds.forEach(fid => {
    const fp     = pts.find(p => p.id === fid);
    const myMeas = meas.filter(m => m.from === fid);
    const ptType = fp ? PT[fp.type].l : "okänd";
    txt += `${"─".repeat(44)}\nUPPSTÄLLNING: ${fid}  (${ptType})\n${"─".repeat(44)}\n`;
    txt += `${"Nr".padEnd(6)} ${"Till".padEnd(12)} ${"Dist(m)".padStart(9)} ${"Riktning".padStart(13)} Satser\n`;
    myMeas.forEach((m, i) => {
      const md = calcM(m, pts);
      const ns = m.numSatser != null ? m.numSatser : 3;
      txt += `${(i+1+".").padEnd(6)} ${m.to.padEnd(12)} ${(md?md.dist.toFixed(3):"–").padStart(9)} ${(md?fmt(md.hz):"–").padStart(13)} ${ns} sat\n`;
    });
    txt += `  Totalt: ${myMeas.length} mätning(ar)\n\n`;
  });
  txt += "═".repeat(44);
  return txt;
}

export function exportMeasScheme() {
  const txt = buildSchemeText();
  const a   = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type:"text/plain" }));
  a.download = `mätschema_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}

// ── Mätbok A4 – popup-fönster för utskrift – rad 2965–3228 exakt ─────────────
export function openMeasBook() {
  const { meas, pts, defaultInstr, centerErr, au, activeCRS } = getState();
  if (meas.length === 0) { alert("Inga mätningar definierade."); return; }
  const fmt      = d => au === "grad" ? fG(d) : fD(d);
  const crsName  = CRS_DEFS[activeCRS]?.name || activeCRS;
  const dateStr  = new Date().toLocaleDateString("sv-SE");
  const instrName = INSTRUMENTS[defaultInstr].l.split("(")[0].trim();
  const fromIds  = [...new Set(meas.map(m => m.from))];

  const stationPages = fromIds.map(fid => {
    const fp         = pts.find(p => p.id === fid);
    const myMeas     = meas.filter(m => m.from === fid);
    const ptType     = fp ? PT[fp.type].l : "okänd";
    const knownCount = myMeas.filter(m => pts.find(p => p.id===m.to && p.type==="known")).length;

    const rows = myMeas.map((m, i) => {
      const md      = calcM(m, pts);
      const ns      = m.numSatser != null ? m.numSatser : 3;
      const toType  = pts.find(p => p.id===m.to)?.type || "";
      const typeCol = toType==="known" ? "#1a4a1a" : toType==="station" ? "#1a2a4a" : "#2a2a2a";
      const typeLbl = toType==="known" ? "KP" : toType==="station" ? "UPS" : toType==="detail" ? "DET" : "NY";
      return `<tr>
        <td class="nr">${i+1}</td>
        <td class="ptid"><span class="badge" style="background:${typeCol}">${typeLbl}</span> ${m.to}</td>
        <td class="num mono">${md ? md.dist.toFixed(3) : "–"}</td>
        <td class="num mono">${md ? fmt(md.hz) : "–"}</td>
        <td class="num">${ns}</td>
        <td class="inp"></td><td class="inp"></td><td class="inp"></td><td class="inp wide"></td>
      </tr>`;
    }).join("");

    const extraRows = Array(3).fill(0).map((_, i) => `<tr class="extra">
        <td class="nr">${myMeas.length+i+1}</td>
        <td class="ptid"></td><td class="num mono"></td><td class="num mono"></td>
        <td class="num"></td><td class="inp"></td><td class="inp"></td><td class="inp"></td><td class="inp wide"></td>
      </tr>`).join("");

    return `<div class="page">
      <div class="page-header">
        <div class="header-left">
          <div class="project-title">STOMNÄTSMÄTNING – MÄTBOK</div>
          <div class="project-sub">${crsName} &nbsp;|&nbsp; ${instrName} &nbsp;|&nbsp; Centreringsfel: ${centerErr} mm</div>
        </div>
        <div class="header-right">
          <div class="date-box">Datum: <span class="date-line">____________________</span></div>
          <div class="date-box">Mätare: <span class="date-line">____________________</span></div>
        </div>
      </div>
      <div class="station-header">
        <div class="station-main">
          <span class="station-label">UPPSTÄLLNING</span>
          <span class="station-id">${fid}</span>
          <span class="station-type">${ptType}</span>
        </div>
      </div>
      <div class="atm-row">
        <div class="atm-box"><div class="atm-label">Lufttryck (hPa)</div><div class="atm-input">______________</div></div>
        <div class="atm-box"><div class="atm-label">Temperatur (°C)</div><div class="atm-input">______________</div></div>
        <div class="atm-box"><div class="atm-label">Instrumenthöjd (m)</div><div class="atm-input">______________</div></div>
      </div>
      <table class="meas-table"><thead><tr>
        <th class="nr">Nr</th><th class="ptid">Målpunkt</th>
        <th class="num">Kalk. dist (m)</th><th class="num">Kalk. riktning</th>
        <th class="num">Sat.</th>
        <th class="inp">Hz 1 (sats 1)</th><th class="inp">Hz 2 (sats 2)</th>
        <th class="inp">Dist. (m)</th><th class="inp wide">Anmärkning</th>
      </tr></thead><tbody>${rows}${extraRows}</tbody></table>
      <div class="footer-row">
        <div class="footer-box"><div class="footer-label">Orienteringsriktning (bakåtsikt)</div><div class="footer-line">___________________________________</div></div>
        <div class="footer-box"><div class="footer-label">Antal kända punkter mätta: ${knownCount}</div></div>
        <div class="footer-box"><div class="footer-label">Kontroll – signatur</div><div class="footer-line">___________________________________</div></div>
      </div>
      <div class="remarks-box">
        <div class="remarks-label">Anteckningar / Avvikelser</div>
        <div class="remarks-lines"><div class="rline"></div><div class="rline"></div><div class="rline"></div></div>
      </div>
    </div>`;
  }).join('<div class="page-break"></div>');

  const cover = `<div class="page cover-page">
    <div class="cover-title">MÄTBOK</div>
    <div class="cover-sub">Stomnätsmätning</div>
    <div class="cover-table">
      <div class="cover-row"><span>Projekt:</span><span class="cover-line"></span></div>
      <div class="cover-row"><span>Koordinatsystem:</span><span class="cover-val">${crsName}</span></div>
      <div class="cover-row"><span>Instrument:</span><span class="cover-val">${instrName}</span></div>
      <div class="cover-row"><span>Centreringsfel:</span><span class="cover-val">${centerErr} mm</span></div>
      <div class="cover-row"><span>Antal uppställningar:</span><span class="cover-val">${fromIds.length}</span></div>
      <div class="cover-row"><span>Antal mätningar:</span><span class="cover-val">${meas.length}</span></div>
      <div class="cover-row"><span>Skapad:</span><span class="cover-val">${dateStr}</span></div>
      <div class="cover-row"><span>Mätare:</span><span class="cover-line"></span></div>
    </div>
    <div class="cover-toc">
      <div class="toc-title">INNEHÅLL</div>
      ${fromIds.map((fid,i) => {
        const fp = pts.find(p=>p.id===fid);
        const n  = meas.filter(m=>m.from===fid).length;
        return `<div class="toc-row"><span>${i+2}. Uppst. ${fid} (${fp?PT[fp.type].l:"?"})</span><span>${n} mätningar</span></div>`;
      }).join("")}
    </div>
  </div><div class="page-break"></div>`;

  const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><title>Mätbok – ${dateStr}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:"Arial",sans-serif;font-size:9pt;color:#000;background:#fff;}
  .page{width:210mm;min-height:297mm;padding:12mm 14mm 10mm;page-break-after:always;position:relative;}
  .page-break{page-break-after:always;}
  @media print{body{margin:0;}.page{page-break-after:always;margin:0;padding:10mm 12mm 8mm;}.no-print{display:none!important;}}
  .page-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:4mm;margin-bottom:4mm;}
  .project-title{font-size:12pt;font-weight:bold;letter-spacing:0.5px;}
  .project-sub{font-size:7.5pt;color:#444;margin-top:2px;}
  .header-right{text-align:right;font-size:8pt;}
  .date-box{margin-bottom:2px;}
  .date-line{display:inline-block;border-bottom:1px solid #000;width:38mm;margin-left:2mm;}
  .station-header{background:#f0f0f0;border:1px solid #aaa;border-radius:2px;padding:3mm 4mm;margin-bottom:3mm;}
  .station-main{display:flex;align-items:baseline;gap:6mm;margin-bottom:2mm;}
  .station-label{font-size:7.5pt;color:#555;text-transform:uppercase;letter-spacing:0.5px;}
  .station-id{font-size:16pt;font-weight:bold;letter-spacing:1px;}
  .station-type{font-size:8pt;color:#555;font-style:italic;}
  .atm-row{display:flex;gap:3mm;margin-bottom:3mm;background:#fafafa;border:1px solid #ddd;padding:2mm 3mm;border-radius:2px;}
  .atm-box{flex:1;}.atm-label{font-size:6.5pt;color:#555;margin-bottom:1mm;}.atm-input{border-bottom:1px solid #999;height:5mm;}
  .meas-table{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:3mm;}
  .meas-table thead tr{background:#222;color:#fff;}
  .meas-table th{padding:2mm 1.5mm;text-align:center;font-size:7pt;font-weight:bold;border:1px solid #555;}
  .meas-table td{padding:1.8mm 1.5mm;border:1px solid #ccc;vertical-align:middle;}
  .meas-table tbody tr:nth-child(even){background:#f8f8f8;}
  .meas-table tr.extra td{background:#fafafa;border-style:dashed;}
  .nr{width:8mm;text-align:center;font-weight:bold;color:#444;}
  .ptid{width:38mm;}.badge{display:inline-block;padding:0 2mm;border-radius:2px;font-size:6.5pt;color:#fff;margin-right:1mm;}
  .num{width:22mm;text-align:center;}.mono{font-family:monospace;font-size:7.5pt;}
  .inp{width:24mm;background:#fffff0;}.inp.wide{width:auto;}
  .footer-row{display:flex;gap:6mm;margin-bottom:3mm;font-size:8pt;}
  .footer-box{flex:1;}.footer-label{font-size:7pt;color:#555;margin-bottom:1mm;}.footer-line{border-bottom:1px solid #999;}
  .remarks-box{border:1px solid #ccc;border-radius:2px;padding:2mm 3mm;}
  .remarks-label{font-size:7pt;color:#555;margin-bottom:2mm;}.rline{border-bottom:1px solid #ddd;height:6mm;margin-bottom:1mm;}
  .cover-page{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}
  .cover-title{font-size:36pt;font-weight:bold;letter-spacing:4px;margin-bottom:4mm;}
  .cover-sub{font-size:14pt;color:#555;margin-bottom:12mm;}
  .cover-table{text-align:left;width:140mm;border:1px solid #aaa;padding:6mm 8mm;border-radius:3px;background:#fafafa;margin-bottom:8mm;}
  .cover-row{display:flex;gap:4mm;padding:2mm 0;border-bottom:1px solid #eee;font-size:10pt;}
  .cover-row span:first-child{width:50mm;color:#555;font-size:9pt;}
  .cover-line{flex:1;border-bottom:1px solid #999;min-height:5mm;}.cover-val{flex:1;font-weight:bold;}
  .cover-toc{text-align:left;width:140mm;}.toc-title{font-size:10pt;font-weight:bold;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:3mm;}
  .toc-row{display:flex;justify-content:space-between;padding:1mm 0;border-bottom:1px solid #eee;font-size:9pt;}
  .print-bar{position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:8px;background:#fff;padding:8px;border-radius:6px;box-shadow:0 2px 12px #0003;}
  .print-bar button{padding:8px 16px;font-size:14px;border-radius:4px;cursor:pointer;border:1px solid;}
  .btn-print{background:#1a3a1a;color:#00ff88;border-color:#00ff88;}
  .btn-close{background:#3a1a1a;color:#ff6060;border-color:#ff6060;}
</style></head><body>
<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">🖨 Skriv ut / Spara PDF</button>
  <button class="btn-close" onclick="window.close()">✕ Stäng</button>
</div>
${cover}${stationPages}
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Popup blockerades. Tillåt popups för den här sidan."); return; }
  w.document.write(html);
  w.document.close();
}
