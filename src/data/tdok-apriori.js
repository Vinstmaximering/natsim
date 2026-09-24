// A priori-förval ur TDOK 2014:0571 version 6.0.
//
// Ligger i src/data/ och inte i src/core/constants.js bland INSTRUMENTS av två
// skäl: värdena är ett NORMKRAV på viktsättningen, inte ett instruments
// prestanda, och src/core/ hålls utanför den här etappen.
//
// ── §2.8 K25, Tabell 3 – standardosäkerheter för viktsättning, järnväg ──────
//
// Tabellen anger fem värden. NätSim simulerar terrestra nät I PLAN, och två av
// dem påverkar därför inte beräkningen alls:
//
//   • Vertikalvinklar 1,0 mgon – ingår inte i en 2D-utjämning.
//   • Instrument- och signalhöjder 2 mm – påverkar bara höjdledet.
//
// De redovisas ändå, dels för att tabellen ska kunna läsas i sin helhet, dels
// för att den som tar programmet vidare till 3D ska se vad som gäller. Att de
// inte påverkar simuleringen står i förvalets beskrivning och i rapporten.
//
// Centrering: Tabell 3 skiljer centrering i plan för STATION från centrering
// för ALLA OBJEKT, men anger 2 mm för båda. NätSim har en enda centreringsterm
// (HMK Bilaga C.1.1), så 2 mm täcker båda raderna.

export const TDOK_TABELL3_JARNVAG = Object.freeze({
  id:    'tdok-t3-jvg',
  l:     'TDOK 2014:0571 v6.0 Tabell 3 (järnväg)',
  kalla: 'TDOK 2014:0571 v6.0 §2.8 K25 Tabell 3',

  // Värden som styr 2D-simuleringen.
  sigHz_mgon:  0.5,
  sigDist_mm:  3.0,
  sigDist_ppm: 3.0,
  centerErr:   2.0,

  // Värden ur samma tabell som INTE påverkar ett nät i plan.
  utanforPlan: Object.freeze([
    { storhet: 'Vertikalvinklar',              varde: '1,0 mgon' },
    { storhet: 'Instrument- och signalhöjder', varde: '2 mm' },
  ]),

  beskrivning:
    'Standardosäkerheter för viktsättning vid stommätning för järnväg. ' +
    'Horisontalvinklar 0,5 mgon, längder 3 mm + 3 ppm, centrering i plan 2 mm. ' +
    'Tabellen anger dessutom vertikalvinklar 1,0 mgon och instrument- och ' +
    'signalhöjder 2 mm; de påverkar inte ett nät i plan och ingår därför inte ' +
    'i simuleringen.',
});

/** Alla a priori-förval som går att välja. Fler kan tillkomma. */
export const APRIORI_FORVAL = Object.freeze({
  [TDOK_TABELL3_JARNVAG.id]: TDOK_TABELL3_JARNVAG,
});

/**
 * Vilket förval en uppsättning a priori-värden motsvarar, eller null.
 *
 * Rapporten ska kunna säga "TDOK Tabell 3" eller "användardefinierat" utan att
 * lita på ett sparat val – användaren kan ha ändrat en enskild mätning efteråt.
 * Jämförelsen görs därför mot de faktiska värdena.
 *
 * @param {{sigHz_mgon, sigDist_mm, sigDist_ppm, centerErr}} v
 * @returns {object|null}
 */
export function identifieraForval(v) {
  if (!v) return null;
  const lika = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  for (const f of Object.values(APRIORI_FORVAL)) {
    if (lika(v.sigHz_mgon, f.sigHz_mgon) &&
        lika(v.sigDist_mm, f.sigDist_mm) &&
        lika(v.sigDist_ppm, f.sigDist_ppm) &&
        lika(v.centerErr, f.centerErr)) return f;
  }
  return null;
}

/**
 * Avvikelser mot Tabell 3, storhet för storhet. Används av §2.8 K25-kontrollen
 * i rapporten, som ska visa VAD som avviker och inte bara att något gör det.
 *
 * @returns {Array<{storhet, kravVarde, faktisktVarde, avviker}>}
 */
export function avvikelserMotTabell3({ sigHz_mgon, sigDist_mm, sigDist_ppm, centerErr }) {
  const T = TDOK_TABELL3_JARNVAG;
  const rad = (storhet, krav, faktisk, enhet) => ({
    storhet,
    kravVarde:     `${komma(krav)} ${enhet}`,
    faktisktVarde: Number.isFinite(faktisk) ? `${komma(faktisk)} ${enhet}` : '–',
    // Ett värde som är BÄTTRE än tabellens är ingen avvikelse att anmärka på;
    // tabellen anger den osäkerhet viktsättningen ska utgå från, och ett lägre
    // tal betyder noggrannare mätning. Avvikelse = större än tabellens värde.
    avviker: !Number.isFinite(faktisk) || faktisk > krav + 1e-9,
  });
  return [
    rad('Horisontalvinklar', T.sigHz_mgon, sigHz_mgon, 'mgon'),
    rad('Längder, konstantdel', T.sigDist_mm, sigDist_mm, 'mm'),
    rad('Längder, avståndsberoende del', T.sigDist_ppm, sigDist_ppm, 'ppm'),
    rad('Centrering i plan', T.centerErr, centerErr, 'mm'),
  ];
}

// Svensk decimalkomma. Egen minimal variant för att modulen ska vara fri från
// beroenden till core/ och kunna användas av både UI och rapport.
const komma = v => String(v).replace('.', ',');
