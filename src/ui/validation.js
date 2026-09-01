// D7: Validera nät – rad 824–866 exakt
import { getState } from '../state/store.js';
import { MATKLASSER, klassificeraKtal, K_NAT_GOLV, K_OVERBESTAMD_PRELIMINAR } from '../core/constants.js';
import { findBlockedMeasurements } from '../core/visibility.js';

export function validateNetwork() {
  const { simResult, pts, meas = [], activeMatklass, obstacles = [] } = getState();
  if (!simResult || !simResult.ok) {
    return { ok: false, issues: ["Simulering har inte körts ännu – tryck på \"Kör simulering\" eller aktivera auto-sim."] };
  }
  const issues   = [];
  const warnings = [];
  const sr = simResult;

  // Normgolv enligt SIS-TS 21143:2016 §6.2.2 och HMK-Stommätning 2024 §3.2.2 b).
  if (!klassificeraKtal(sr.K_global).uppfyllerNorm)
    issues.push(`Kontrollerbarhet k=${sr.K_global.toFixed(3)} < ${K_NAT_GOLV.toFixed(2).replace(".", ",")} – nätet uppfyller inte SIS-TS-kravet.`);
  if (sr.K_global >= K_OVERBESTAMD_PRELIMINAR)
    warnings.push(`k=${sr.K_global.toFixed(3)} ≥ ${K_OVERBESTAMD_PRELIMINAR.toFixed(2).replace(".", ",")} – överbestämt nät, kontrollera att mätinsatsen ger mervärde.`);

  const weak = (sr.redund || []).filter(r => r.ri < 0.3);
  if (weak.length) issues.push(`${weak.length} mätning(ar) har r_i < 0,30: ` +
    weak.slice(0, 3).map(r => `${r.fromId}→${r.toId} (${r.type}, r=${r.ri.toFixed(2)})`).join(", ") +
    (weak.length > 3 ? " m.fl." : ""));
  const medium = (sr.redund || []).filter(r => r.ri >= 0.3 && r.ri < 0.5);
  if (medium.length) warnings.push(`${medium.length} mätning(ar) har 0,30 ≤ r_i < 0,50.`);

  const knownN = pts.filter(p => p.type === "known").length;
  if (knownN < 1) issues.push("Inga kända punkter – nätet saknar absolut anslutning.");
  if (knownN < 3) warnings.push(`Endast ${knownN} känd(a) punkt(er) – ≥3 rekommenderas.`);

  // Siktlinje-kontroll mot hinder (körs bara om hinder finns)
  if (obstacles.length > 0) {
    const blockedMeas = findBlockedMeasurements(meas, pts, obstacles)
      .map(b => `${b.meas.from}→${b.meas.to} (${b.blockedBy || 'hinder'})`);
    if (blockedMeas.length > 0) {
      issues.push(`${blockedMeas.length} mätning(ar) saknar siktlinje: ` +
        blockedMeas.slice(0, 3).join(', ') +
        (blockedMeas.length > 3 ? ' m.fl.' : ''));
    }
  }

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
