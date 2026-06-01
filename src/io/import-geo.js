// Kopierad exakt från NätSim_Beta_2.html rad 3711–3819.
// importGeoFile: SBG Object Text v2.x (Geo Professional)
// exportGeoFile: SBG Object Text v2.01 med CRLF och N,E,H-ordning
import { getState, setState } from '../state/store.js';
import { CRS_DEFS } from '../core/constants.js';
import { showToast } from '../ui/toast.js';

export function importGeoFile(text, filename) {
  const { pts: existingPts, activeCRS } = getState();
  const pts = [...existingPts];
  let imported = 0, updated = 0, skipped = 0;
  let detectedCRS = null;

  // Detektera koordinatsystem från FileInfo
  const crsMatch = text.match(/FileInfo\s+"Coordinate System"\s*,\s*"([^"]+)"/i);
  if (crsMatch) detectedCRS = crsMatch[1];

  // Försök matcha koordinatsystem till känt CRS
  let newCRS = activeCRS;
  if (detectedCRS) {
    const crsMap = {
      "sweref 99 tm":"sweref99tm","sweref99tm":"sweref99tm",
      "sweref 99 12 00":"sweref991200","sweref 99 13 30":"sweref991330",
      "sweref 99 15 00":"sweref991500","sweref 99 16 30":"sweref991630",
      "sweref 99 18 00":"sweref991800","sweref 99 19 30":"sweref991930",
      "sweref 99 20 15":"sweref992015","sweref 99 21 45":"sweref992145",
      "sweref 99 23 15":"sweref992315",
    };
    const key     = detectedCRS.toLowerCase().replace(/\s*\/.*$/, "").trim();
    const matched = Object.entries(crsMap).find(([k]) => key.includes(k));
    if (matched && matched[1] !== activeCRS) {
      const crsName = CRS_DEFS[matched[1]]?.name || matched[1];
      if (confirm(`Filen anger koordinatsystem:\n"${detectedCRS}"\n\nVill du byta aktivt CRS till ${crsName}?`)) {
        newCRS = matched[1];
        import('../map/leaflet-setup.js').then(({ buildCRSSel }) => {
          setState({ activeCRS: newCRS });
          buildCRSSel();
        });
      }
    }
  }

  // Extrahera PointList-blocket
  const plMatch   = text.match(/PointList[\s\S]*?(?=\nLineList|\nAttributeList|$)/i);
  const searchText = plMatch ? plMatch[0] : text;

  // Matcha alla Point-rader
  const pointRe = /^\s*Point\s+"([^"]+)"\s*,\s*([\d.eE+\-]+)\s*,\s*([\d.eE+\-]+)\s*(?:,\s*([\d.eE+\-]*))?/gim;
  let m;
  while ((m = pointRe.exec(searchText)) !== null) {
    const id = m[1].trim();
    const N  = parseFloat(m[2]);
    const E  = parseFloat(m[3]);
    const H  = m[4] && m[4].trim() !== "" ? parseFloat(m[4]) : 0;
    if (isNaN(N) || isNaN(E)) { skipped++; continue; }

    // Heuristisk typbestämning – rad 3758–3762 exakt
    let typ = "station";
    const idU = id.toUpperCase();
    if (/^(FP|KP|GP|RP|GNSS|FIX|REF|CM|ANSL)/.test(idU) || idU.includes("FIXPUNKT")) typ = "known";
    else if (/^(NY|NEW|NP)/.test(idU)) typ = "new";
    else if (/^(DET|OBJ)/.test(idU) || /^\d/.test(idU)) typ = "detail";

    const existing = pts.find(p => p.id === id);
    if (existing) { existing.E = E; existing.N = N; existing.H = H; existing.type = typ; updated++; }
    else { pts.push({ id, type: typ, E, N, H }); imported++; }
  }

  setState({ pts, simResult: null });
  if (imported + updated > 0) {
    import('../map/leaflet-setup.js').then(({ draw, resetView }) => {
      draw();
      setTimeout(resetView, 300);
    });
  }
  const crsMsg = detectedCRS ? `\nKoordinatsystem: ${detectedCRS}` : "";
  showToast(`✓ .geo importerad: ${imported} nya, ${updated} uppdaterade`, "#00ff88");
  alert(`Import klar: ${filename}\n✅ Nya punkter: ${imported}\n🔄 Uppdaterade: ${updated}${skipped ? `\n⚠️ Hoppade (ogiltiga): ${skipped}` : ""}${crsMsg}\n\nOBS: Punkttyp sätts automatiskt baserat på ID-prefix.\nKontrollera och justera vid behov.`);
}

export function exportGeoFile() {
  const { pts, activeCRS } = getState();
  if (pts.length === 0) { alert("Inga punkter att exportera."); return; }
  const crsName = CRS_DEFS[activeCRS]?.name || activeCRS;
  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace("T", " ");
  const author  = window._geoAuthor  || "";
  const company = window._geoCompany || "";

  // SBG Object Text v2.01 – N, E, H-ordning (rad 3793–3818 exakt)
  let out = `FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"\r\n`;
  out += `begin\r\n`;
  out += `\tFileInfo "Application","Stomnätssimulering"\r\n`;
  out += `\tFileInfo "Author","${author}"\r\n`;
  out += `\tFileInfo "Company","${company}"\r\n`;
  out += `\tFileInfo "Description","Exporterad ${dateStr}"\r\n`;
  out += `\tFileInfo "Coordinate System","${crsName}"\r\n`;
  out += `end\r\n`;
  out += `PointList \r\n`;
  out += `begin\r\n`;
  pts.forEach(p => {
    const N = (p.N || 0).toFixed(3);
    const E = (p.E || 0).toFixed(3);
    const H = p.H != null && p.H !== 0 ? p.H.toFixed(3) : "";
    out += `\tPoint "${p.id}",${N},${E},${H},,,\r\n`;
  });
  out += `end\r\n`;
  out += `LineList \r\n`;
  out += `AttributeList \r\n`;

  const fname = `stomnät_${now.toISOString().slice(0, 10)}.geo`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([out], { type:"text/plain;charset=utf-8" }));
  a.download = fname;
  a.click();
  showToast(`✓ Exporterade ${pts.length} punkter som ${fname}`, "#00ff88");
}
