// Kopierad exakt från NätSim_Beta_2.html rad 3848–3969.
// readXLSX, importPointsFromCSV, importPointsFromRows, resolveType,
// showExcelTemplate, downloadCSVTemplate
import { getState, setState } from '../state/store.js';
import { showToast } from '../ui/toast.js';

// ── Typbestämning från textfält – rad 3865–3872 exakt ──────────────────────
export function resolveType(raw) {
  const v = (raw || "").toString().toLowerCase().trim();
  if (["känd","known","kp","fp","kand","kända"].some(x => v.includes(x))) return "known";
  if (["uppst","station","s"].some(x => v === x || v.startsWith(x)))       return "station";
  if (["detalj","detail","d"].some(x => v === x || v.startsWith(x)))       return "detail";
  if (["ny","new","nypunkt"].some(x => v === x || v.startsWith(x)))        return "new";
  return "station";
}

// ── XLSX-läsning via SheetJS (laddas dynamiskt från CDN) – rad 3848 ─────────
export function readXLSX(file) {
  if (window.XLSX) {
    _doReadXLSX(file);
  } else {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => _doReadXLSX(file);
    document.head.appendChild(s);
  }
}
function _doReadXLSX(file) {
  const r = new FileReader();
  r.onload = ev => {
    const wb   = window.XLSX.read(new Uint8Array(ev.target.result), { type:"array" });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
    importPointsFromRows(rows);
  };
  r.readAsArrayBuffer(file);
}

// ── CSV-parsning – rad 3859–3863 exakt ──────────────────────────────────────
export function importPointsFromCSV(text) {
  const sep  = text.includes(";") ? ";" : ",";
  const rows = text.trim().split(/\r?\n/).map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "")));
  importPointsFromRows(rows);
}

// ── Radbaserad import – rad 3874–3913 exakt ─────────────────────────────────
export function importPointsFromRows(rows) {
  if (rows.length < 2) { alert("Filen verkar tom eller har fel format."); return; }
  const hdr      = rows[0].map(h => (h || "").toString().toLowerCase().trim());
  const dataStart = 1;
  const colID    = hdr.findIndex(h => h === "id" || h === "punktid" || h === "punkt");
  const colTyp   = hdr.findIndex(h => h === "typ" || h === "type");
  const colE     = hdr.findIndex(h => h === "e" || h === "east" || h === "öst" || h === "ost" || h === "easting");
  const colN     = hdr.findIndex(h => h === "n" || h === "north" || h === "nord" || h === "northing");
  const colH     = hdr.findIndex(h => h === "h" || h === "hoj" || h === "höj" || h === "höjd" || h === "height" || h === "elev");
  const colMark  = hdr.findIndex(h => /(markering|befästning|marking|mark)/.test(h));
  const colPris  = hdr.findIndex(h => /(prisma|prism|instrument)/.test(h));
  if (colID < 0 || colE < 0 || colN < 0) {
    alert("Kunde inte hitta kolumnerna ID, E och N.\nKontrollera att headern innehåller: ID, Typ, E, N, H");
    return;
  }

  const { pts: existingPts } = getState();
  const pts = [...existingPts];
  let imported = 0, updated = 0, skipped = 0;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const id  = (row[colID] || "").toString().trim();
    if (!id) continue;
    const E = parseFloat((row[colE] || "").toString().replace(",", "."));
    const N = parseFloat((row[colN] || "").toString().replace(",", "."));
    if (isNaN(E) || isNaN(N)) { skipped++; continue; }
    const H        = colH  >= 0 ? parseFloat((row[colH]  || "").toString().replace(",", ".")) || 0 : 0;
    const typ      = colTyp >= 0 ? resolveType(row[colTyp]) : "station";
    const markering = colMark >= 0 ? (row[colMark] || "").toString().trim() || undefined : undefined;
    const prisma    = colPris >= 0 ? (row[colPris]  || "").toString().trim() || undefined : undefined;
    const existing  = pts.find(p => p.id === id);
    if (existing) {
      existing.E = E; existing.N = N; existing.H = H; existing.type = typ;
      if (markering !== undefined) existing.markering = markering;
      if (prisma    !== undefined) existing.prisma    = prisma;
      updated++;
    } else {
      pts.push({ id, type:typ, E, N, H, markering, prisma });
      imported++;
    }
  }
  setState({ pts, simResult: null });
  import('../map/leaflet-setup.js').then(({ draw }) => draw());
  alert(`Import klar!\n✅ Nya punkter: ${imported}\n🔄 Uppdaterade: ${updated}\n⚠️ Hoppade över (ogiltiga): ${skipped}`);
}

// ── Excel-mall i modal – rad 3915–3961 exakt ─────────────────────────────────
export function showExcelTemplate() {
  const tmpl = `EXCEL-MALL FÖR PUNKTIMPORT
${"─".repeat(50)}
Spara som .xlsx eller .csv (semikolon-separerat).
Första raden MÅSTE vara header (kolumnnamn).

OBLIGATORISKA KOLUMNER:
  ID    – Punktnamn (text, t.ex. FP1, S1, D5)
  E     – Östkoordinat i meter (t.ex. 6500100.000)
  N     – Nordkoordinat i meter (t.ex. 1620400.000)

VALFRIA KOLUMNER:
  Typ        – Punkttyp (se nedan)
  H          – Höjd i meter
  Markering  – Befästning/markeringstyp (ex. Rördubb i asfalt)
  Prisma     – Prisma/instrument (ex. Leica Standardprisma)

PUNKTTYPER (skrivs i Typ-kolumnen):
  känd / kp / fp / known  → Känd punkt (grön)
  uppställning / station  → Uppställning (blå)
  detalj / detail         → Detaljpunkt (orange)
  ny / new                → Ny punkt (lila)
  (tomt)                  → Uppställning (default)

EXEMPELINNEHÅLL:
ID;Typ;E;N;H
FP1;känd;6500100.000;1620400.000;45.230
FP2;känd;6500312.450;1620554.780;46.112
S1;uppställning;6500180.000;1620450.000;45.500
S2;uppställning;6500250.000;1620480.000;45.800
D1;detalj;6500200.000;1620420.000;45.100

TIPS:
• Koordinater i SWEREF99 eller lokalt system
• Decimaler med punkt ELLER komma fungerar
• Tomma rader ignoreras
${"─".repeat(50)}`;

  const mi  = document.getElementById("mi");
  document.getElementById("modal").style.display = "flex";
  mi.innerHTML = `<div style="font-size:13px;color:#4fc3f7;font-weight:bold;margin-bottom:8px;">📋 EXCEL-MALL</div>
  <div style="background:#060c18;border:1px solid #1e3850;border-radius:3px;padding:8px;font-size:11px;color:#90aabb;line-height:1.8;white-space:pre;overflow-x:auto;max-height:65vh;overflow-y:auto;">${tmpl.replace(/</g, "&lt;")}</div>
  <div style="display:flex;gap:5px;margin-top:8px;">
    <button onclick="window._downloadCSVTemplate()" style="flex:1;padding:7px;font-size:12px;background:#00ff8818;border:1px solid #00ff88;color:#00ff88;border-radius:3px;cursor:pointer;">💾 Ladda ner CSV-mall</button>
    <button onclick="window._closeModal()" style="flex:1;padding:7px;font-size:12px;background:transparent;border:1px solid #1e3850;color:#8aa8c0;border-radius:3px;cursor:pointer;">✕ Stäng</button>
  </div>`;
}

export function downloadCSVTemplate() {
  const csv = `ID;Typ;E;N;H\nFP1;känd;6500100.000;1620400.000;45.230\nFP2;känd;6500312.450;1620554.780;46.112\nS1;uppställning;6500180.000;1620450.000;45.500\nS2;uppställning;6500250.000;1620480.000;45.800\nD1;detalj;6500200.000;1620420.000;45.100\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type:"text/csv;charset=utf-8" })); // BOM för Excel
  a.download = "punktmall.csv";
  a.click();
}
