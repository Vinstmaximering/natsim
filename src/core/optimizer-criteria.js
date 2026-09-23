// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANSKRITERIER FÖR NÄTOPTIMERINGEN (Etapp E)
//
// Kriterierna följer av projektets mätklass. Tre av dem är normstyrda, ett är
// produktval – skillnaden är utskriven här eftersom den ska kunna granskas.
//
// r_min (HÅRT KRAV, blockerar leverans)   r_i > 0,35 per observation
//   TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2. Kravet är STRIKT
//   ("större än"), så r_i = 0,35 exakt underkänns. Vid och under detta värde
//   är observationen så
//   okontrollerad att ett grovt fel inte kan detekteras med normal
//   data-snooping – felet fortplantar sig i stället rakt in i koordinaterna.
//   Värdet hämtas ur SIS_TS_GENERAL_REQS.k_individual_min så att det bara står
//   på ett ställe i kodbasen.
//
// r_soft (MJUKT KRAV, rapporteras men blockerar inte)   r_i ≥ 0,50
//   HMK-Stommätning 2024 Bilaga F.2. Inte ett v6-krav och därför inte strikt.
//   Observationer i intervallet 0,35 < r_i < 0,50
//   levereras, men räknas och redovisas i beslutsspårningsloggen så att
//   användaren kan motivera dem i planeringsrapporten. Samma nivå som
//   nätvalideringen (R_OBS_GOD) och studio-vyerna kallar godkänd, vilket
//   betyder att ett optimerat nät kan få VARNINGAR i "Validera nät" – men
//   aldrig FEL, eftersom valideringens felgräns är samma normtal som det
//   hårda kravet (R_OBS_NORM = 0,35, TDOK v6 §2.8 K3 · SIS-TS §6.2.2).
//
// σ_max (PRODUKTVAL, inte normcitat)   σ_pos ≤ 3 mm för G2
//   Avser punktens standardosäkerhet σ_pos (1σ) EFTER UTJÄMNING, alltså
//   resultatet av simuleringen. Detta är en annan storhet än SIS-TS Tabell
//   A.9:s kolumn "spridning längd", som anger tillåten spridning mellan
//   dubbelmätta längder i fält och som kriteriet tidigare felaktigt hämtades
//   ur (se diagnosrapporten 2026-09-02). Värdena nedan är produktval grundade
//   på svensk praxis för bruksnät i plan och kan överstyras per projekt via
//   optimizerConfig.sigma_max_mm.
//
// k_min (NORMSTYRT)   k = f/n > 0,50 för nätet
//   TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2, samma värde som
//   K_NAT_GOLV i core/constants.js. Även detta krav är STRIKT: k = 0,50 exakt
//   underkänns. Optimeraren behöver inget ε för det – den poängsätter bara nät
//   den redan har beräknat, och checkCriteria() jämför med <= mot golvet.
//
// MUF och YT är i simuleringen rena funktioner av r_i:
//     MUF_i/σ_i = κ/√r_i        YT_i/σ_i = (1−r_i)·κ/√r_i      (κ = 2,80, HMK F.16)
// Kraven MUF ≤ 4σ och YT ≤ 2σ (SIS-TS §6.2.2) motsvarar därför r_i ≥ 0,490
// respektive r_i ≥ 0,497. Båda ligger ÖVER det hårda r-kravet 0,35, så att
// grinda på dem skulle i praktiken sätta det hårda kravet till 0,497 och göra
// tvånivåmodellen ovan verkningslös. De beräknas och redovisas därför, men
// spärrar inte (enforceMufYt = false).
// ─────────────────────────────────────────────────────────────────────────────
import { SIS_TS_CLASSES, SIS_TS_GENERAL_REQS } from '../data/sis-ts-classes.js';
import { R_OBS_GOD } from './constants.js';
import { nf } from './format.js';

// Hårt krav per observation – blockerar leverans. Kravet är r_i > detta värde.
// TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2.
export const R_MIN_HARD = SIS_TS_GENERAL_REQS.k_individual_min;   // 0,35

// Mjukt krav per observation – rapporteras, blockerar inte.
// HMK-Stommätning 2024 Bilaga F.2.
export const R_MIN_SOFT = R_OBS_GOD;                              // 0,50

// σ_pos-tak per mätklass i mm. PRODUKTVAL, inte normcitat – se blockkommentaren.
// G2 = 3 mm är fastställt värde för bruksnät i plan; övriga klasser följer
// klassernas inbördes ambitionsnivå. Överstyrs per projekt med
// optimizerConfig.sigma_max_mm.
export const SIGMA_MAX_DEFAULT_MM = Object.freeze({ G1: 2, G2: 3, G3: 5, G4: 8 });

// Mätklass som används när projektet saknar vald klass. Redovisas i dialogen
// så att användaren ser att kravnivån är antagen och inte projektstyrd.
export const FALLBACK_KLASS = 'G2';

/**
 * Acceptanskriterier för en mätklass ("G1".."G4"). Okänd/tom klass ger G2:s
 * krav, markerade med assumedClass:true.
 *
 * @param {string|null} klass
 * @param {{sigmaMaxMm?:number|null}} [overrides] – projektets egna värden
 *        (optimizerConfig.sigma_max_mm). null/utelämnat ⇒ klassens default.
 */
export function criteriaForClass(klass, overrides = {}) {
  const key = SIS_TS_CLASSES[klass] ? klass : FALLBACK_KLASS;
  const g = SIS_TS_GENERAL_REQS;
  const sigmaDefault = SIGMA_MAX_DEFAULT_MM[key];
  const sigmaOverride = Number(overrides.sigmaMaxMm);
  const sigmaMaxMm = Number.isFinite(sigmaOverride) && sigmaOverride > 0
    ? sigmaOverride : sigmaDefault;
  return {
    klass: key,
    assumedClass: key !== klass,
    rMin: R_MIN_HARD,
    rSoft: R_MIN_SOFT,
    sigmaMaxMm,
    sigmaMaxDefaultMm: sigmaDefault,
    sigmaMaxIsCustom: sigmaMaxMm !== sigmaDefault,
    kMin: g.k_global_min,
    mufFactorMax: g.muf_factor_max,
    ytFactorMax: g.yt_factor_max,
    // Se blockkommentaren: MUF/YT motsvarar r ≥ 0,49 och skulle annars göra
    // det hårda kravet 0,35 verkningslöst.
    enforceMufYt: false,
    source: 'TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2 ' +
            '(k > 0,50 och r-tal > 0,35) + HMK-Stommätning 2024 Bilaga F.2; ' +
            'σ_max är produktval',
  };
}

// Sentinelvärden för ett nät som inte går att beräkna alls (singulär normal-
// matris, underdeterminerat, datumdefekt). Poängsättningen behöver ett
// definierat "sämsta möjliga" läge att jämföra emot.
const UNCOMPUTABLE = Object.freeze({
  computable: false, minR: 0, maxSigPosMm: Infinity, kGlobal: 0,
  maxMufFactor: Infinity, maxYtFactor: Infinity, nObs: 0, nMeas: 0,
  nBelowHard: 0, nBelowSoft: 0,
});

/**
 * Plockar ut de storheter kriterierna prövas mot ur ett simResult.
 * Ett simResult med .error ger UNCOMPUTABLE.
 */
export function metricsFromSim(simResult, criteria = null) {
  if (!simResult || !simResult.ok) return { ...UNCOMPUTABLE, error: simResult?.error || 'Okänt beräkningsfel' };
  const rs = simResult.redund.map(r => r.ri);
  const minR = rs.length ? Math.min(...rs) : 0;
  // Fix 2.3: antalet observationer under respektive tröskel redovisas i
  // beslutsspårningsloggen – det mjuka kravet ska synas, inte bara minsta r.
  const hard = criteria?.rMin  ?? R_MIN_HARD;
  const soft = criteria?.rSoft ?? R_MIN_SOFT;
  const sig = (simResult.allPtResults || simResult.ptResults || []).map(p => p.sigPos * 1000);
  const kappa = simResult.kappa ?? 2.80;
  // MUF/YT-faktorerna är monotona i r_i – minsta r ger största faktor.
  const maxMufFactor = minR > 0 ? kappa / Math.sqrt(minR) : Infinity;
  const maxYtFactor  = minR > 0 ? (1 - minR) * kappa / Math.sqrt(minR) : Infinity;
  return {
    computable: true,
    minR,
    maxSigPosMm: sig.length ? Math.max(...sig) : 0,
    kGlobal: simResult.K_global,
    maxMufFactor, maxYtFactor,
    nObs: simResult.meas_n,
    nMeas: simResult.measCount,
    // Hårt krav strikt (>): r = hard exakt räknas som under kravet.
    nBelowHard: rs.filter(r => r <= hard).length,
    nBelowSoft: rs.filter(r => r < soft).length,
  };
}

// Omgång 2: svensk decimalkomma i allt som når beslutsspårningsloggen.
const f3 = v => Number.isFinite(v) ? nf(v, 3) : '∞';
const f2 = v => Number.isFinite(v) ? nf(v, 2) : '∞';

/**
 * Prövar metrics mot kriterierna.
 * @returns {{ok:boolean, violations:Array<{key,text}>}}
 */
export function checkCriteria(metrics, criteria) {
  const v = [];
  if (!metrics.computable) {
    v.push({ key: 'berakning', text: `Nätet kan inte beräknas: ${(metrics.error || '').split('\n')[0]}` });
    return { ok: false, violations: v };
  }
  // HÅRT krav (TDOK v6 §2.8 K3 · SIS-TS §6.2.2), strikt: <= underkänner exakt
  // gränsvärdet. Det mjuka kravet r ≥ 0,50 (HMK Bilaga F.2) prövas medvetet
  // INTE här – det rapporteras via metrics.nBelowSoft.
  if (metrics.minR <= criteria.rMin)
    v.push({ key: 'rMin', text: `Minsta r-tal ${f3(metrics.minR)} uppfyller inte hårt krav r-tal > ${f3(criteria.rMin)}` });
  if (metrics.maxSigPosMm > criteria.sigmaMaxMm)
    v.push({ key: 'sigmaMax', text: `Största σ_pos ${f2(metrics.maxSigPosMm)} mm > krav ${f2(criteria.sigmaMaxMm)} mm` });
  if (metrics.kGlobal <= criteria.kMin)
    v.push({ key: 'kMin', text: `Kontrollerbarhet k ${f3(metrics.kGlobal)} uppfyller inte krav k > ${f3(criteria.kMin)}` });
  if (criteria.enforceMufYt) {
    if (metrics.maxMufFactor > criteria.mufFactorMax)
      v.push({ key: 'muf', text: `Största MUF ${f2(metrics.maxMufFactor)} × σ > krav ${f2(criteria.mufFactorMax)} × σ` });
    if (metrics.maxYtFactor > criteria.ytFactorMax)
      v.push({ key: 'yt', text: `Största YT ${f2(metrics.maxYtFactor)} × σ > krav ${f2(criteria.ytFactorMax)} × σ` });
  }
  return { ok: v.length === 0, violations: v };
}

/** Läsbar sammanfattning av kravnivån, för dialog och beslutslogg. */
export function describeCriteria(criteria) {
  return [
    `Minsta r-tal per observation: r-tal > ${nf(criteria.rMin, 2)} (hårt krav, ` +
      'TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2)',
    `Observationer med r-tal < ${nf(criteria.rSoft ?? R_MIN_SOFT, 2)} rapporteras men blockerar inte ` +
      '(HMK Bilaga F.2)',
    `Största punktosäkerhet: σ_pos ≤ ${nf(criteria.sigmaMaxMm, 1)} mm (1σ efter utjämning` +
      (criteria.sigmaMaxIsCustom ? ', projektets eget värde)' : ', produktval)'),
    `Kontrollerbarhet: k > ${nf(criteria.kMin, 2)} ` +
      '(TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2)',
    `MUF ≤ ${criteria.mufFactorMax} × σ, YT ≤ ${criteria.ytFactorMax} × σ` +
      (criteria.enforceMufYt ? ' (följer av r-kravet)' : ' (redovisas, spärrar ej)'),
  ];
}
