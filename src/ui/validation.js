// D7: Validera nät – rad 824–866 exakt
import { getState } from '../state/store.js';
import { nf } from '../core/format.js';
import { MATKLASSER, klassificeraKtal, K_NAT_GOLV,
         R_OBS_NORM, R_OBS_GOD, K_R_KALLA } from '../core/constants.js';
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

  // Normgolv enligt TDOK 2014:0571 v6.0 §2.8 K3 och SIS-TS 21143:2016 §6.2.2.
  // Kravet är STRIKT: k = 0,50 exakt underkänns.
  if (!klassificeraKtal(sr.K_global).uppfyllerNorm)
    issues.push(`Kontrollerbarhet k=${nf(sr.K_global, 3)} uppfyller inte kravet k > ${nf(K_NAT_GOLV, 2)} (${K_R_KALLA}).`);
  // Varningen "överbestämt nät, kontrollera att mätinsatsen ger mervärde"
  // låg här. Borttagen 2026-09-13: gränsen 0,70 var ett produktval utan
  // normstöd, och varningen var en värdering av användarens mätinsats som
  // varken SIS-TS eller HMK ger täckning för. k-talet redovisas som tal.

  // Felgränsen är normens tal, inte produktens tidigare 0,30. Etapp 2: kravet
  // är strikt (> 0,35), så exakt 0,35 hamnar bland felen.
  const weak = (sr.redund || []).filter(r => r.ri <= R_OBS_NORM);
  if (weak.length) issues.push(`${weak.length} ${weak.length === 1 ? "mätning uppfyller" : "mätningar uppfyller"} inte kravet r-tal > ${nf(R_OBS_NORM, 2)} (${K_R_KALLA}): ` +
    weak.slice(0, 3).map(r => `${r.fromId}→${r.toId} (${r.type === "dist" ? "avstånd" : "riktning"}, r-tal ${nf(r.ri, 2)})`).join(", ") +
    (weak.length > 3 ? " m.fl." : ""));
  const medium = (sr.redund || []).filter(r => r.ri > R_OBS_NORM && r.ri < R_OBS_GOD);
  if (medium.length) warnings.push(
    `${medium.length} ${medium.length === 1 ? "mätning har" : "mätningar har"} r-tal > ${nf(R_OBS_NORM, 2)} men < ` +
    `${nf(R_OBS_GOD, 2)} – uppfyller ${K_R_KALLA} men ligger under HMK Bilaga F.2:s nivå för ingen anmärkning.`);

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
    msg = "✓ Nätet uppfyller kraven på k-tal och r-tal och har inga varningar.\n\nDu kan generera PM.";
  } else {
    if (v.issues.length)   msg += `✗ FEL (${v.issues.length}):\n• ${v.issues.join("\n• ")}\n\n`;
    if (v.warnings.length) msg += `⚠ VARNINGAR (${v.warnings.length}):\n• ${v.warnings.join("\n• ")}\n\n`;
    msg += v.ok ? "Inga blockerande fel – PM kan genereras med försiktighet." : "Åtgärda felen innan PM genereras.";
  }
  alert(msg);
}
