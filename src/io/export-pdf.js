// Popup-baserad PDF-export – kopierad från NätSim_Beta_2.html rad 2504–2600.
// Öppnar ett nytt fönster med print-optimerat HTML; användaren skriver ut/sparar som PDF.
// jsPDF används för Fas 7 (PM-rapporten) – se src/reports/pdf-helpers.js.
import { getState } from '../state/store.js';
import { CRS_DEFS, INSTRUMENTS, MATKLASSER } from '../core/constants.js';

export async function exportSimPDF() {
  const { simResult, activeCRS, defaultInstr, activeMatklass } = getState();
  if (!simResult || !simResult.ok) { alert("Kör simuleringen först."); return; }

  // Öppna popup synkront – måste ske före await
  const w = window.open("", "_blank", "width=950,height=800");
  if (!w) { alert("Popup blockerades – tillåt popups."); return; }
  w.document.write(`<html><body style="background:#111;color:#aaa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;"><div style="font-size:24px;margin-bottom:12px;">⏳</div><div>Genererar simuleringsrapport...</div></div></body></html>`);

  const sr       = simResult;
  const crsName  = CRS_DEFS[activeCRS]?.name || activeCRS;
  const instrName = INSTRUMENTS[defaultInstr]?.l || defaultInstr;
  const mk       = activeMatklass ? MATKLASSER[activeMatklass] : null;
  const today    = new Date().toLocaleDateString("sv-SE");

  // Lägg ett litet dröjsmål för att popupen ska visa laddnings-meddelandet
  await new Promise(res => setTimeout(res, 50));

  const ptRows = (sr.allPtResults || sr.ptResults || []).map(r => `<tr>
    <td>${r.id}</td>
    <td style="text-align:right;font-family:monospace;">${(r.sigN*1000).toFixed(2)}</td>
    <td style="text-align:right;font-family:monospace;">${(r.sigE*1000).toFixed(2)}</td>
    <td style="text-align:right;font-family:monospace;font-weight:bold;">${(r.sigPos*1000).toFixed(2)}</td>
    <td style="text-align:right;font-family:monospace;">${r.aSemi?(r.aSemi*1000).toFixed(2):"–"}</td>
    <td style="text-align:right;font-family:monospace;">${r.bSemi?(r.bSemi*1000).toFixed(2):"–"}</td>
  </tr>`).join("");

  const rdRows = sr.redund.map(r => {
    const muf = r.mdb.val === Infinity ? "∞" : r.type === "dist" ? (r.mdb.val*1000).toFixed(1)+" mm" : r.mdb.val.toFixed(3)+" mgon";
    const col = r.ri >= 0.5 ? "#006600" : r.ri >= 0.3 ? "#7a5800" : "#990000";
    return `<tr>
      <td>${r.fromId}→${r.toId}</td>
      <td>${r.type === "dist" ? "Avst" : "Riktning"}</td>
      <td style="text-align:right;font-weight:bold;color:${col};">${r.ri.toFixed(3)}</td>
      <td style="text-align:right;font-family:monospace;">${muf}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="sv"><head><meta charset="UTF-8"><title>NätSim – Simuleringsrapport ${today}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:"Arial",sans-serif;font-size:9pt;color:#000;background:#fff;padding:10mm 14mm;}
  h1{font-size:16pt;border-bottom:2px solid #000;padding-bottom:3mm;margin-bottom:4mm;}
  h2{font-size:10pt;background:#222;color:#fff;padding:2mm 3mm;margin:6mm 0 2mm;}
  table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:4mm;}
  th{background:#444;color:#fff;padding:2mm 2mm;text-align:center;font-size:8pt;}
  td{padding:1.5mm 2mm;border:1px solid #ccc;}
  tr:nth-child(even){background:#f8f8f8;}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:6mm;font-size:9pt;}
  .kv{display:flex;gap:3mm;border-bottom:1px solid #eee;padding:1mm 0;}
  .kv span:first-child{color:#555;width:45mm;}
  .print-bar{position:fixed;top:8px;right:8px;display:flex;gap:6px;z-index:999;background:#fff;padding:6px;border-radius:4px;box-shadow:0 2px 8px #0003;}
  .print-bar button{padding:6px 14px;font-size:12px;border-radius:3px;cursor:pointer;border:1px solid;}
  @media print{.print-bar{display:none;} body{padding:8mm 10mm;}}
</style></head><body>
<div class="print-bar">
  <button onclick="window.print()" style="background:#1a3a1a;color:#00ff88;border-color:#00ff88;">🖨 Skriv ut / Spara PDF</button>
  <button onclick="window.close()" style="background:#3a1a1a;color:#ff6060;border-color:#ff6060;">✕ Stäng</button>
</div>
<h1>NÄTSIMULERING – Simuleringsrapport</h1>
<div class="meta">
  <div>
    <div class="kv"><span>Datum:</span><span>${today}</span></div>
    <div class="kv"><span>Koordinatsystem:</span><span>${crsName}</span></div>
    <div class="kv"><span>Instrument:</span><span>${instrName}</span></div>
    ${mk ? `<div class="kv"><span>Mätklass:</span><span>${mk.l}</span></div>` : ""}
  </div>
  <div>
    <div class="kv"><span>k-tal:</span><span>${sr.K_global.toFixed(3)} (${sr.K_class})</span></div>
    <div class="kv"><span>Frihetsgrader f:</span><span>${sr.redundancy}</span></div>
    <div class="kv"><span>Observationer n:</span><span>${sr.meas_n}</span></div>
    <div class="kv"><span>Obekanta u:</span><span>${sr.unkn_n}</span></div>
  </div>
</div>
<h2>PUNKTOSÄKERHETER</h2>
<table>
  <thead><tr><th>Punkt</th><th>σN mm</th><th>σE mm</th><th>σpos mm</th><th>a mm</th><th>b mm</th></tr></thead>
  <tbody>${ptRows}</tbody>
</table>
<h2>RELIABILITET</h2>
<table>
  <thead><tr><th>Sträcka</th><th>Typ</th><th>r_i</th><th>MUF</th></tr></thead>
  <tbody>${rdRows}</tbody>
</table>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
