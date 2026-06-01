// D7: Validera nät – rad 824–866 exakt
import { getState } from '../state/store.js';
import { MATKLASSER } from '../core/constants.js';

export function validateNetwork() {
  const { simResult, pts, activeMatklass } = getState();
  if (!simResult || !simResult.ok) {
    return { ok: false, issues: ["Simulering har inte körts ännu – tryck på \"Kör simulering\" eller aktivera auto-sim."] };
  }
  const issues   = [];
  const warnings = [];
  const sr = simResult;

  if (sr.K_global < 0.5)  issues.push(`Kontrollerbarhet k=${sr.K_global.toFixed(3)} < 0,50 – nätet uppfyller inte SIS-TS-kravet.`);
  if (sr.K_global > 1.14) warnings.push(`k=${sr.K_global.toFixed(3)} > 1,14 – överbestämt nät utan mervärde.`);

  const weak = (sr.redund || []).filter(r => r.ri < 0.3);
  if (weak.length) issues.push(`${weak.length} mätning(ar) har r_i < 0,30: ` +
    weak.slice(0, 3).map(r => `${r.fromId}→${r.toId} (${r.type}, r=${r.ri.toFixed(2)})`).join(", ") +
    (weak.length > 3 ? " m.fl." : ""));
  const medium = (sr.redund || []).filter(r => r.ri >= 0.3 && r.ri < 0.5);
  if (medium.length) warnings.push(`${medium.length} mätning(ar) har 0,30 ≤ r_i < 0,50.`);

  const knownN = pts.filter(p => p.type === "known").length;
  if (knownN < 1) issues.push("Inga kända punkter – nätet saknar absolut anslutning.");
  if (knownN < 3) warnings.push(`Endast ${knownN} känd(a) punkt(er) – ≥3 rekommenderas.`);

  return { ok: issues.length === 0, issues, warnings };
}

export function showValidationDialog() {
  const v = validateNetwork();
  let msg = "";
  if (v.ok && v.warnings.length === 0) {
    msg = "✓ Nätet uppfyller alla SIS-TS-krav och har inga varningar.\n\nDu kan generera PM.";
  } else {
    if (v.issues.length)   msg += `✗ FEL (${v.issues.length}):\n• ${v.issues.join("\n• ")}\n\n`;
    if (v.warnings.length) msg += `⚠ VARNINGAR (${v.warnings.length}):\n• ${v.warnings.join("\n• ")}\n\n`;
    msg += v.ok ? "Inga blockerande fel – PM kan genereras med försiktighet." : "Åtgärda felen innan PM genereras.";
  }
  alert(msg);
}
