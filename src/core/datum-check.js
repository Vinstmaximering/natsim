// Kopierad exakt från NätSim_Beta_2.html rad 981–1015.
// Extraherad som separat funktion per CLAUDE_CODE_PROMPTS.md Prompt 3.
// Tröskeln diag > 100 är bevarad exakt – ändra ej.
export function checkDatumDefect(Qxx, nu, knownPts, meas) {
  let datumDefect = false;
  let datumDefectDetails = "";
  for (let i = 0; i < nu; i++) {
    const diag = Qxx[i][i];
    if (!isFinite(diag) || diag < 0 || diag > 100) {   // ← rad 990 exakt
      datumDefect = true;
      datumDefectDetails = "Qxx[" + i + "][" + i + "]=" + diag.toExponential(2);
      break;
    }
  }

  const knownIds = knownPts.map(p => p.id);
  const measuredIds = new Set();
  meas.forEach(m => { measuredIds.add(m.from); measuredIds.add(m.to); });
  const unusedKnown = knownIds.filter(id => !measuredIds.has(id));

  if (!datumDefect) return { ok: true, message: null, unusedKnown };

  let msg = "Nätet har dolda datumdefekter (rotation/translation/skala kan inte bestämmas).\n\n";
  if (unusedKnown.length) {
    msg += "ORSAK: Kända punkter ingår inte i några mätningar: " + unusedKnown.join(", ") + "\n\n";
    msg += "ÅTGÄRD: Mät in minst en känd punkt från en uppställning så att nätet anknyts till det kända koordinatsystemet.";
  } else if (knownIds.length < 2) {
    msg += "ORSAK: Nätet har " + knownIds.length + " känd(a) punkt(er) – för få för att låsa rotationen.\n\n";
    msg += "ÅTGÄRD: Lägg till minst 2 kända punkter (eller mät avstånd+riktning till den enda kända).";
  } else {
    msg += "ORSAK: Kovariansmatrisen är nära-singulär (" + datumDefectDetails + ").\n\n";
    msg += "ÅTGÄRD: Kontrollera att alla fria punkter har mätningar i minst 2 ej-parallella riktningar.";
  }

  return { ok: false, message: msg, unusedKnown };
}
