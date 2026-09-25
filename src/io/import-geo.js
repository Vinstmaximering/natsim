// importGeoFile: SBG Object Text v2.x (Geo Professional)
// exportGeoFile: SBG Object Text v2.01 via io/write-geo.js (Polylinjer Etapp 3)
//
// Etapp 2: läsningen ligger i den rena parsern io/parse-geo.js. Den här filen
// gör bara det som kräver state och DOM – punkttyp, id-krockar, CRS-byte och
// återkoppling till användaren. Den hårdkodade crsMap togs bort: parsern
// matchar filens koordinatsystem mot CRS_DEFS, som har alla tretton zonerna.
// LineList läses av parsern men används först i etapp 3:s importdialog.
import { getState, setState } from '../state/store.js';
import { CRS_DEFS } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { parseGeo } from './parse-geo.js';
import { downloadGeo, geoCoordinateSystem, GeoWriteError } from './write-geo.js';
import { buildNetGeo } from './export-visual-geo.js';

// Punkttyp ur id-prefix – samma heuristik som före Etapp 2, oförändrad.
// Etapp 3 gör den valbar i importdialogen; tills dess är den enda vägen.
export function geoPointTypeFromId(id) {
  const idU = String(id ?? '').toUpperCase();
  if (/^(FP|KP|GP|RP|GNSS|FIX|REF|CM|ANSL)/.test(idU) || idU.includes("FIXPUNKT")) return "known";
  if (/^(NY|NEW|NP)/.test(idU)) return "new";
  if (/^(DET|OBJ)/.test(idU) || /^\d/.test(idU)) return "detail";
  return "station";
}

export function importGeoFile(text, filename) {
  const parsed = parseGeo(text);
  const { pts: existingPts, activeCRS } = getState();
  const pts = [...existingPts];
  let imported = 0, updated = 0;

  // ── Koordinatsystem ur filen ──
  const detectedCRS = parsed.fileInfo.coordinateSystem;
  if (parsed.fileInfo.crs && parsed.fileInfo.crs !== activeCRS) {
    const crsName = CRS_DEFS[parsed.fileInfo.crs]?.name || parsed.fileInfo.crs;
    if (confirm(`Filen anger koordinatsystem:\n"${detectedCRS}"\n\nVill du byta aktivt CRS till ${crsName}?`)) {
      import('../map/leaflet-setup.js').then(({ buildCRSSel }) => {
        setState({ activeCRS: parsed.fileInfo.crs });
        buildCRSSel();
      });
    }
  }

  // ── Punkter ──
  // Beteendet är oförändrat: samma id skriver över tidigare koordinater.
  // Parsern lämnar dubbletterna orörda och varnar för dem; valet mellan
  // hoppa över / uppdatera / byt namn kommer i etapp 3.
  for (const p of parsed.points) {
    const id  = p.name.trim();
    const typ = geoPointTypeFromId(id);
    const H   = p.H ?? 0;
    const existing = pts.find(x => x.id === id);
    if (existing) { existing.E = p.E; existing.N = p.N; existing.H = H; existing.type = typ; updated++; }
    else { pts.push({ id, type: typ, E: p.E, N: p.N, H }); imported++; }
  }

  setState({ pts, simResult: null });
  if (imported + updated > 0) {
    import('../map/leaflet-setup.js').then(({ draw, resetView }) => {
      draw();
      setTimeout(resetView, 300);
    });
  }

  const skipped = parsed.warnings.filter(w => w.code === 'invalid-point').length;
  const crsMsg  = detectedCRS ? `\nKoordinatsystem: ${detectedCRS}` : "";
  const lineMsg = parsed.lines.length
    ? `\n\nFilen innehåller även ${parsed.lines.length} linje(r). Linjeimport kommer i nästa version.`
    : "";
  const dupMsg  = parsed.warnings.filter(w => w.code === 'duplicate-point')
    .map(w => `\n⚠️ ${w.message}`).join("");
  showToast(`✓ .geo importerad: ${imported} nya, ${updated} uppdaterade`, "#00ff88");
  alert(`Import klar: ${filename}\n✅ Nya punkter: ${imported}\n🔄 Uppdaterade: ${updated}` +
        `${skipped ? `\n⚠️ Hoppade (ogiltiga): ${skipped}` : ""}${dupMsg}${crsMsg}${lineMsg}` +
        `\n\nOBS: Punkttyp sätts automatiskt baserat på ID-prefix.\nKontrollera och justera vid behov.`);
  return parsed;
}

// Polylinjer Etapp 3: skrivs med io/write-geo.js – samma format som exporten
// av visuella lager: fyra decimaler, "Sweref 99 <zon> / RH2000 (SWEN17)" och
// tomt höjdfält för H = 0 (en nätpunkt med H = 0 saknar höjd).
export function exportGeoFile() {
  const state = getState();
  const { pts } = state;
  if (pts.length === 0) { alert("Inga punkter att exportera."); return; }
  let text;
  try {
    text = buildNetGeo(state);
  } catch (e) {
    if (!(e instanceof GeoWriteError)) throw e;
    alert(`Exporten stoppades.\n\n${e.message}`);
    return;
  }
  const fname = `stomnät_${new Date().toISOString().slice(0, 10)}.geo`;
  downloadGeo(fname, text);
  const verifierad = geoCoordinateSystem(state.activeCRS).verified;
  showToast(`✓ Exporterade ${pts.length} punkter som ${fname}` +
    (verifierad ? '' : ' · ⚠ koordinatsystemets namn ej verifierat'), verifierad ? "#00ff88" : "#ffb74d");
}
