// Bygger A4-rapporten som HTML-sträng.
// buildReport(data) är en PUR FUNKTION – inga DOM-anrop, inga globaler.
// Testad av tests/pm.test.js och tests/pm-mallar.test.js.
//
// data = { vals, sr, redund, ptRes, allPts, knownPts, mk, mkKey,
//          crs, ins, mHz, mDm, mDp, mSt, dag, centerErr, img, imgs }
//
// ETAPP 4. Rapporten har inte längre EN struktur utan fyra, valda ur
// verksamhet + nättyp (steg 1). Dokumenttypen och därmed mallen följer av
// TDOK 2014:0571 v6.0:
//
//   A  Väg, bruksnät i plan      Redovisning av planerat stomnät  §2.5 K2
//   B  Järnväg, bruksnät i plan  Åtgärdsförslag                   §2.5 K1
//   C  Bro eller tunnel          Mätningsprogram                  §1.7 K1
//   D  Ej Trafikverket           Planering av stomnät             SIS-TS Bilaga B kolumn P
//
// Den här filen väljer mall och förbereder ctx. Rubrikerna och deras ordning
// ligger i report/mallar.js, de delade byggstenarna i report/blocks.js.
//
// NOTERING OM r-tal kontra k_i (UI-städning Omgång 1, 2026-09-11).
// Se docs/troubleshooting/ui_inventering_20260910.md avsnitt B, punkt 1.
// Den OBSERVATIONSVISA redundansen hette tidigare k_i i rapporten. Det är
// HMK-Stommätning 2024:s egen beteckning (Formel F.6: Σk_i = f, se
// tests/ref-angle.mjs), men den stod två rader under "Kontrollerbarhet k" –
// nätets GLOBALA k-tal – i samma tabell. Två olika storheter med samma bokstav
// i samma tabell är en läsfälla i ett dokument som går till beställare.
//
// Rapporten säger därför "r-tal", som resten av NätSim (constants.js
// R_OBS_NORM/R_OBS_GOD, valideringen, optimeringen, alla paneler), och
// behåller kopplingen till normen genom att skriva ut k_i-beteckningen i
// legenden under r-talstabellen. Storheten är oförändrad – bara namnet.

import { dokumenttyp, nattyperFor } from './tdok-v6.js';
import { prep, dokumenttypSaknas } from './report/blocks.js';
import { MALLAR } from './report/mallar.js';

/**
 * Väljer mall ur verksamhet och nättyp, och tar fram dokumenttypens namn och
 * paragraf. Ren funktion – används också av testerna.
 *
 * @returns {{typ, kalla, mall, nattypLabel}|null} null när valen saknas
 */
export function valjMall(verksamhet, nattyp) {
  // Utan vald verksamhet är dokumenttypen inte bestämd. dokumenttyp() svarar
  // mall D för allt som inte är Trafikverket, så tomt val fångas här först.
  if (!verksamhet) return null;
  const d = dokumenttyp(verksamhet, nattyp);
  if (!d) return null;
  const nt = nattyperFor(verksamhet).find(n => n.v === nattyp);
  if (!nt) return null;
  return { ...d, nattypLabel: nt.l };
}

export function buildReport(data) {
  const vals = data?.vals || {};
  const dok  = valjMall((vals.verksamhet || "").trim(), (vals.nattyp || "").trim());

  const ctx = prep({ ...data, dok });

  // Utan bestämd dokumenttyp visas innehållet ändå, med mall D:s neutrala
  // struktur, men med en varning överst. Att vägra helt hade dolt allt
  // användaren matat in – och ett migrerat gammalt utkast hamnar här.
  if (!dok) return dokumenttypSaknas() + MALLAR.D(ctx);

  return MALLAR[dok.mall](ctx);
}
