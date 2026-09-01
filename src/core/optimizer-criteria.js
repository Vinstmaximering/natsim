// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTANSKRITERIER FÖR NÄTOPTIMERINGEN (Etapp E)
//
// Kriterierna läses ur projektets mätklass – användaren ställer inte in dem i
// optimeringsdialogen, de FÖLJER av vald klass. Källor:
//
//   σ_max   SIS-TS 21143:2016 Tabell A.9, kolumnen "spridning längd":
//           G1 2 mm · G2 3 mm · G3 5 mm · G4 8 mm. Tabellvärdet är klassens
//           tillåtna spridning i plan och används här som tak för punkternas
//           standardosäkerhet σ_pos (1σ) i simuleringen.
//   k_min   SIS-TS 21143:2016 §6.2.2 – k > 0,5 för nätet. Samma värde som
//           K_NAT_GOLV i core/constants.js; hämtas ur SIS_TS_GENERAL_REQS så
//           att det bara står på ett ställe.
//   r_min   Minsta redundanstal per observation. 0,30 är den gräns NätSim
//           redan använder för att flagga svag kontrollerbarhet i punkt- och
//           mätningstabellerna (rClass/isProb) och motsvarar HMK-Stommätning
//           2024:s nivå för godtagbar kontrollerbarhet per observation.
//           OBS: SIS-TS §6.2.2 anger k > 0,35 för ENSKILD mätning – det är k,
//           inte r_i, och gränserna är därför inte utbytbara.
//
// MUF och YT är i simuleringen rena funktioner av r_i:
//     MUF_i = κ·σ_i/√r_i        ⇒  MUF_i/σ_i = κ/√r_i
//     YT_i  = (1−r_i)·MUF_i     ⇒  YT_i/σ_i  = (1−r_i)·κ/√r_i
// med κ = 2,80 (HMK F.16). Kraven MUF ≤ 4σ respektive YT ≤ 2σ (SIS-TS §6.2.2)
// är alltså ekvivalenta med r_i ≥ (κ/4)² = 0,49 respektive r_i ≥ 0,462. Att
// grinda på dem skulle i praktiken kräva minsta r-tal ≈ 0,49 i HELA nätet,
// vilket är ouppnåeligt när medelvärdet av r_i per definition är k = f/n.
// Därför beräknas och redovisas MUF/YT-faktorerna alltid, men de spärrar bara
// optimeringen om enforceMufYt sätts explicit. Se README, avsnitt Optimera nät.
// ─────────────────────────────────────────────────────────────────────────────
import { SIS_TS_CLASSES, SIS_TS_GENERAL_REQS } from '../data/sis-ts-classes.js';

// Minsta redundanstal per observation. Produktvärde, se blockkommentaren ovan.
export const R_MIN_DEFAULT = 0.30;

// Mätklass som används när projektet saknar vald klass. Redovisas i dialogen
// så att användaren ser att kravnivån är antagen och inte projektstyrd.
export const FALLBACK_KLASS = 'G2';

/**
 * Acceptanskriterier för en mätklass ("G1".."G4"). Okänd/tom klass ger G2:s
 * krav, markerade med assumedClass:true.
 */
export function criteriaForClass(klass) {
  const key = SIS_TS_CLASSES[klass] ? klass : FALLBACK_KLASS;
  const c = SIS_TS_CLASSES[key];
  const g = SIS_TS_GENERAL_REQS;
  return {
    klass: key,
    assumedClass: key !== klass,
    rMin: R_MIN_DEFAULT,
    sigmaMaxMm: c.spridningLangd_mm,
    kMin: g.k_global_min,
    mufFactorMax: g.muf_factor_max,
    ytFactorMax: g.yt_factor_max,
    enforceMufYt: false,
    source: `${c._source} + SIS-TS 21143:2016 §6.2.2`,
  };
}

// Sentinelvärden för ett nät som inte går att beräkna alls (singulär normal-
// matris, underdeterminerat, datumdefekt). Poängsättningen behöver ett
// definierat "sämsta möjliga" läge att jämföra emot.
const UNCOMPUTABLE = Object.freeze({
  computable: false, minR: 0, maxSigPosMm: Infinity, kGlobal: 0,
  maxMufFactor: Infinity, maxYtFactor: Infinity, nObs: 0, nMeas: 0,
});

/**
 * Plockar ut de storheter kriterierna prövas mot ur ett simResult.
 * Ett simResult med .error ger UNCOMPUTABLE.
 */
export function metricsFromSim(simResult) {
  if (!simResult || !simResult.ok) return { ...UNCOMPUTABLE, error: simResult?.error || 'Okänt beräkningsfel' };
  const rs = simResult.redund.map(r => r.ri);
  const minR = rs.length ? Math.min(...rs) : 0;
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
  };
}

const f3 = v => Number.isFinite(v) ? v.toFixed(3) : '∞';
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '∞';

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
  if (metrics.minR < criteria.rMin)
    v.push({ key: 'rMin', text: `Minsta r-tal ${f3(metrics.minR)} < krav ${f3(criteria.rMin)}` });
  if (metrics.maxSigPosMm > criteria.sigmaMaxMm)
    v.push({ key: 'sigmaMax', text: `Största σ_pos ${f2(metrics.maxSigPosMm)} mm > krav ${f2(criteria.sigmaMaxMm)} mm` });
  if (metrics.kGlobal < criteria.kMin)
    v.push({ key: 'kMin', text: `Kontrollerbarhet k ${f3(metrics.kGlobal)} < krav ${f3(criteria.kMin)}` });
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
    `Minsta r-tal per observation: r ≥ ${criteria.rMin.toFixed(2)}`,
    `Största punktosäkerhet: σ_pos ≤ ${criteria.sigmaMaxMm.toFixed(1)} mm (1σ)`,
    `Kontrollerbarhet: k ≥ ${criteria.kMin.toFixed(2)}`,
    `MUF ≤ ${criteria.mufFactorMax} × σ, YT ≤ ${criteria.ytFactorMax} × σ` +
      (criteria.enforceMufYt ? '' : ' (redovisas, spärrar ej)'),
  ];
}
