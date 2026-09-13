// D7: Validera nät – rad 824–866 exakt
import { getState } from '../state/store.js';
import { nf } from '../core/format.js';
import { MATKLASSER, klassificeraKtal, K_NAT_GOLV,
         R_OBS_NORM, R_OBS_GOD } from '../core/constants.js';
import { viewNet } from '../state/optimizer-proposal.js';
import { findBlockedMeasurements } from '../core/visibility.js';

export function validateNetwork() {
  const { pts, activeMatklass, obstacles = [] } = getState();
  // Etapp E: i förslagsvyn valideras förslaget, inte originalnätet.
  const { meas = [], simResult, isProposal } = viewNet();
  if (!simResult || !simResult.ok) {
    // Omgång 2: knappen heter "▶ Beräkna simulering" – texten pekade tidigare
    // på en knapp som inte finns. Se Fix 4 i inventeringen.
    return { ok: false, issues: ["Simuleringen har inte beräknats ännu – tryck på \"▶ Beräkna simulering\" i fliken SIMULERING, eller aktivera auto-sim."] };
  }
  const issues   = [];
  const warnings = [];
  const sr = simResult;
  if (isProposal) warnings.push('Valideringen avser det OPTIMERADE FÖRSLAGET, inte det aktiva nätet.');

  // Normgolv enligt SIS-TS 21143:2016 §6.2.2 och HMK-Stommätning 2024 §3.2.2 b).
  if (!klassificeraKtal(sr.K_global).uppfyllerNorm)
    issues.push(`Kontrollerbarhet k=${nf(sr.K_global, 3)} < ${nf(K_NAT_GOLV, 2)} – nätet uppfyller inte SIS-TS-kravet.`);
  // Varningen "överbestämt nät, kontrollera att mätinsatsen ger mervärde"
  // låg här. Borttagen 2026-09-13: gränsen 0,70 var ett produktval utan
  // normstöd, och varningen var en värdering av användarens mätinsats som
  // varken SIS-TS eller HMK ger täckning för. k-talet redovisas som tal.

  // Felgränsen är normens tal (SIS-TS §6.2.2), inte produktens tidigare 0,30.
  const weak = (sr.redund || []).filter(r => r.ri < R_OBS_NORM);
  if (weak.length) issues.push(`${weak.length} ${weak.length === 1 ? "mätning har" : "mätningar har"} r-tal < ${nf(R_OBS_NORM, 2)} (SIS-TS §6.2.2): ` +
    weak.slice(0, 3).map(r => `${r.fromId}→${r.toId} (${r.type === "dist" ? "avstånd" : "riktning"}, r-tal ${nf(r.ri, 2)})`).join(", ") +
    (weak.length > 3 ? " m.fl." : ""));
  const medium = (sr.redund || []).filter(r => r.ri >= R_OBS_NORM && r.ri < R_OBS_GOD);
  if (medium.length) warnings.push(
    `${medium.length} ${medium.length === 1 ? "mätning har" : "mätningar har"} ${nf(R_OBS_NORM, 2)} ≤ r-tal < ` +
    `${nf(R_OBS_GOD, 2)} – uppfyller SIS-TS men under HMK Bilaga F.6:s nivå för ingen anmärkning.`);

  const knownN = pts.filter(p => p.type === "known").length;
  if (knownN < 1) issues.push("Inga kända punkter – nätet saknar absolut anslutning.");
  if (knownN < 3) warnings.push(`Endast ${knownN} ${knownN === 1 ? "känd punkt" : "kända punkter"} – minst 3 rekommenderas.`);

  // Siktlinje-kontroll mot hinder (körs bara om hinder finns)
  if (obstacles.length > 0) {
    const blockedMeas = findBlockedMeasurements(meas, pts, obstacles)
      .map(b => `${b.meas.from}→${b.meas.to} (${b.blockedBy || 'hinder'})`);
    if (blockedMeas.length > 0) {
      issues.push(`${blockedMeas.length} ${blockedMeas.length === 1 ? "mätning saknar" : "mätningar saknar"} siktlinje: ` +
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
