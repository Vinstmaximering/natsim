// Etapp 2 – gränsvärdena enligt TDOK 2014:0571 v6.0 §2.8 K3.
//
//   "Bruksnät i plan ska utformas så att k-tal för nätet är större än 0,5
//    och enskilda mätningar större än 0,35."
//
// Samma ordalydelse i SIS-TS 21143:2016 §6.2.2. Kravet är STÖRRE ÄN, inte
// minst – ett nät med k = 0,50 exakt uppfyller det alltså inte. Fram till
// Etapp 2 jämförde NätSim med >= överallt.
//
// HMK – Stommätning 2024 Bilaga F.2:s nivå 0,50 för r-tal ("ingen anmärkning")
// är en rekommendation, inte v6-kravet. Dess ordalydelse är inte verifierad,
// så den jämförelsen är medvetet kvar som >= och prövas här som sådan.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  klassificeraKtal, klassificeraRtal, K_NAT_GOLV, R_OBS_NORM, R_OBS_GOD,
  K_BAND, R_BAND, K_R_KALLA, bandIntervall,
} from '../src/core/constants.js';
import { SIS_TS_GENERAL_REQS } from '../src/data/sis-ts-classes.js';
import {
  criteriaForClass, metricsFromSim, checkCriteria, describeCriteria,
} from '../src/core/optimizer-criteria.js';
import { computeSimulation } from '../src/core/simulation.js';
import { setState } from '../src/state/store.js';
import { validateNetwork } from '../src/ui/validation.js';
import { bandForklaring } from '../src/ui/right-panel.js';
import { legendInnehall } from '../src/ui/map-legend.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// ── Klassificerarna på och kring gränsen ────────────────────────────────────

describe('k-talet: kravet är k > 0,50', () => {
  it('k = 0,50 exakt uppfyller INTE kravet', () => {
    const k = klassificeraKtal(0.50);
    expect(k.uppfyllerNorm).toBe(false);
    expect(k.klass).toBe('Under norm');
  });

  it('k = 0,5001 uppfyller kravet', () => {
    const k = klassificeraKtal(0.5001);
    expect(k.uppfyllerNorm).toBe(true);
    expect(k.klass).toBe('Uppfyller norm');
  });

  it('gränsen ligger exakt vid K_NAT_GOLV och ingen annanstans', () => {
    expect(K_NAT_GOLV).toBe(0.50);
    expect(klassificeraKtal(K_NAT_GOLV).uppfyllerNorm).toBe(false);
    expect(klassificeraKtal(K_NAT_GOLV + Number.EPSILON).uppfyllerNorm).toBe(true);
    expect(klassificeraKtal(K_NAT_GOLV - Number.EPSILON).uppfyllerNorm).toBe(false);
  });
});

describe('r-talet: kravet är r > 0,35', () => {
  it('r = 0,35 exakt är under norm', () => {
    const r = klassificeraRtal(0.35);
    expect(r.uppfyllerNorm).toBe(false);
    expect(r.klass).toBe('Under norm');
  });

  it('r = 0,3501 uppfyller normen', () => {
    const r = klassificeraRtal(0.3501);
    expect(r.uppfyllerNorm).toBe(true);
    expect(r.klass).toBe('Uppfyller norm');
  });

  it('gränsen ligger exakt vid R_OBS_NORM och ingen annanstans', () => {
    expect(R_OBS_NORM).toBe(0.35);
    expect(klassificeraRtal(R_OBS_NORM).uppfyllerNorm).toBe(false);
    expect(klassificeraRtal(R_OBS_NORM + Number.EPSILON).uppfyllerNorm).toBe(true);
  });

  // HMK:s nivå är INTE v6-kravet och ska inte ha blivit strikt på köpet.
  it('HMK:s 0,50 för r-tal är kvar som ≥ – r = 0,50 ger "Ingen anmärkning"', () => {
    expect(R_OBS_GOD).toBe(0.50);
    expect(klassificeraRtal(0.50).klass).toBe('Ingen anmärkning');
    expect(klassificeraRtal(0.4999).klass).toBe('Uppfyller norm');
  });
});

// ── Bandtabellerna ──────────────────────────────────────────────────────────

describe('banden bär rätt exklusivitet och rätt källa', () => {
  it('k-bandet över golvet är strikt, HMK-bandet är det inte', () => {
    expect(K_BAND.find(b => b.min === K_NAT_GOLV).exkl).toBe(true);
    expect(R_BAND.find(b => b.min === R_OBS_NORM).exkl).toBe(true);
    expect(R_BAND.find(b => b.min === R_OBS_GOD).exkl).toBe(false);
  });

  // Flaggan får inte kunna hamna i otakt med jämförelsen i klassificeraren.
  it('exkl speglar klassificerarens faktiska jämförelse', () => {
    for (const [fn, band] of [[klassificeraKtal, K_BAND], [klassificeraRtal, R_BAND]]) {
      for (const b of band) {
        if (b.min === 0) continue;
        const påGränsen = fn(b.min).klass === b.klass;
        expect(påGränsen, `bandet "${b.klass}" vid ${b.min}`).toBe(!b.exkl);
      }
    }
  });

  it('bandIntervall formulerar strikta och inklusiva gränser olika', () => {
    expect(bandIntervall(K_BAND, 0)).toBe('> 0,50');
    expect(bandIntervall(K_BAND, 1)).toBe('≤ 0,50');
    expect(bandIntervall(R_BAND, 0)).toBe('≥ 0,50');
    expect(bandIntervall(R_BAND, 1)).toBe('> 0,35 och < 0,50');
    expect(bandIntervall(R_BAND, 2)).toBe('≤ 0,35');
  });

  // Huvudappen vet inte vilken projekttyp nätet tillhör. TDOK 2014:0571 v6.0
  // §2.8 K3 gäller bruksnät i plan hos Trafikverket och får därför inte stå
  // som källa för ett godtyckligt nät – SIS-TS är huvudkällan här, med TDOK
  // som upplysning. PM:et, som vet verksamhet och nättyp, skriver ut den fulla
  // TDOK-hänvisningen (Etapp 3–5).
  it('SIS-TS är huvudkälla, TDOK står som tillägg', () => {
    expect(K_R_KALLA).toBe(
      'SIS-TS 21143:2016 §6.2.2 (samma krav i TDOK 2014:0571 v6.0 §2.8 K3 för bruksnät i plan)');
    expect(K_R_KALLA.indexOf('SIS-TS')).toBeLessThan(K_R_KALLA.indexOf('TDOK'));
    expect(K_R_KALLA).toMatch(/^SIS-TS/);
    expect(K_R_KALLA).toContain('bruksnät i plan');
    for (const b of K_BAND) expect(b.kalla, b.klass).toBe(K_R_KALLA);
    expect(R_BAND.find(b => b.min === R_OBS_NORM).kalla).toBe(K_R_KALLA);
    // HMK-bandet är en rekommendation och får INTE bära TDOK-källan.
    expect(R_BAND.find(b => b.min === R_OBS_GOD).kalla).toMatch(/HMK/);
    expect(R_BAND.find(b => b.min === R_OBS_GOD).kalla).not.toMatch(/TDOK/);
  });
});

// ── Texterna som når användaren ─────────────────────────────────────────────

describe('UI-texterna säger "större än", inte "minst"', () => {
  it('bandförklaringen under k-talet skriver > 0,50', () => {
    const t = bandForklaring(K_BAND);
    expect(t).toContain('&gt; 0,50 Uppfyller norm');
    expect(t).toContain('≤ 0,50 Under norm');
    expect(t).not.toMatch(/≥\s*0,50/);
  });

  it('kartans teckenförklaring skriver r-talsbanden med rätt tecken', () => {
    const html = legendInnehall();
    expect(html).toContain('&gt; 0,35 och &lt; 0,50');
    expect(html).toContain('≤ 0,35');
    expect(html).toContain('≥ 0,50');        // HMK-bandet, oförändrat
    expect(html).toContain(K_R_KALLA);
  });

  it('optimeringens kriterietext skriver > och bär källan', () => {
    const t = describeCriteria(criteriaForClass('G2')).join(' ');
    expect(t).toContain('r-tal > 0,35');
    expect(t).toContain('k > 0,50');
    expect(t).toContain(K_R_KALLA);
    expect(t).not.toMatch(/k ≥ 0,50/);
    expect(t).not.toMatch(/r-tal ≥ 0,35/);
  });

  // Källan får bara stå på ett ställe. Skrivs den av för hand någonstans kan
  // de två börja säga olika saker, vilket var hela skälet till K_R_KALLA.
  it('ingen fil skriver TDOK-paragrafen för hand vid sidan av K_R_KALLA', () => {
    const filer = [
      'src/core/optimizer-criteria.js', 'src/ui/validation.js',
      'src/ui/map-legend.js', 'src/ui/right-panel.js', 'src/ui/tooltip.js',
      'src/ui/studio-views/simulation-studio.js',
    ];
    for (const f of filer) {
      const src = read(f).replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${f} skriver TDOK-paragrafen för hand`)
        .not.toMatch(/TDOK 2014:0571 v6\.0 §2\.8 K3/);
    }
  });
});

// ── Optimeraren och valideringen prövar samma gräns ─────────────────────────

describe('optimeraren underkänner exakt på gränsen', () => {
  const crit = criteriaForClass('G2');

  it('k = 0,50 exakt bryter kMin', () => {
    const m = { computable: true, minR: 0.6, maxSigPosMm: 2, kGlobal: 0.50,
                maxMufFactor: 3, maxYtFactor: 1, nObs: 20, nMeas: 10 };
    const res = checkCriteria(m, crit);
    expect(res.ok).toBe(false);
    expect(res.violations.map(v => v.key)).toContain('kMin');
  });

  it('k = 0,5001 klarar kMin', () => {
    const m = { computable: true, minR: 0.6, maxSigPosMm: 2, kGlobal: 0.5001,
                maxMufFactor: 3, maxYtFactor: 1, nObs: 20, nMeas: 10 };
    expect(checkCriteria(m, crit).ok).toBe(true);
  });

  it('r = 0,35 exakt bryter rMin, r = 0,3501 gör det inte', () => {
    const bas = { computable: true, maxSigPosMm: 2, kGlobal: 0.7,
                  maxMufFactor: 3, maxYtFactor: 1, nObs: 20, nMeas: 10 };
    expect(checkCriteria({ ...bas, minR: 0.35 }, crit).violations.map(v => v.key))
      .toContain('rMin');
    expect(checkCriteria({ ...bas, minR: 0.3501 }, crit).ok).toBe(true);
  });

  // Ett optimerat nät får inte kunna landa exakt på gränsen och kallas godkänt.
  // Det kräver inget ε: metricsFromSim räknar r = rMin som "under kravet", och
  // checkCriteria använder samma <=, så de kan inte ge olika svar.
  it('metricsFromSim och checkCriteria räknar gränsvärdet likadant', () => {
    const sim = {
      ok: true, K_global: 0.7, meas_n: 20, measCount: 10, kappa: 2.8,
      redund: [{ ri: 0.35 }, { ri: 0.60 }],
      allPtResults: [{ sigPos: 0.002 }],
    };
    const m = metricsFromSim(sim, crit);
    expect(m.nBelowHard).toBe(1);                       // 0,35 räknas som under
    expect(checkCriteria(m, crit).violations.map(v => v.key)).toContain('rMin');
  });

  it('kriterievärdena kommer ur constants.js, inte ur en egen kopia', () => {
    expect(crit.kMin).toBe(K_NAT_GOLV);
    expect(crit.rMin).toBe(R_OBS_NORM);
    expect(SIS_TS_GENERAL_REQS.k_global_min).toBe(K_NAT_GOLV);
    expect(SIS_TS_GENERAL_REQS.k_individual_min).toBe(R_OBS_NORM);
  });
});

describe('valideringen underkänner exakt på gränsen', () => {
  const BAS = {
    pts: [{ id: 'FP1', type: 'known', E: 0, N: 0 }, { id: 'FP2', type: 'known', E: 100, N: 0 },
          { id: 'FP3', type: 'known', E: 50, N: 90 }],
    meas: [], obstacles: [], optimizerProposal: null, netView: 'original',
  };
  beforeEach(() => setState({ ...BAS, simResult: null }));

  it('k = 0,50 exakt ger ett FEL, inte ett godkännande', () => {
    setState({ simResult: { ok: true, K_global: 0.50, redund: [{ ri: 0.6, fromId: 'a', toId: 'b', type: 'dist' }] } });
    const v = validateNetwork();
    expect(v.ok).toBe(false);
    expect(v.issues.join(' ')).toContain('k > 0,50');
  });

  it('k = 0,5001 ger inget k-fel', () => {
    setState({ simResult: { ok: true, K_global: 0.5001, redund: [{ ri: 0.6, fromId: 'a', toId: 'b', type: 'dist' }] } });
    expect(validateNetwork().issues.join(' ')).not.toContain('Kontrollerbarhet');
  });

  it('r = 0,35 exakt hamnar bland felen, r = 0,3501 bland varningarna', () => {
    setState({ simResult: { ok: true, K_global: 0.8,
      redund: [{ ri: 0.35, fromId: 'a', toId: 'b', type: 'dist' }] } });
    const pa = validateNetwork();
    expect(pa.issues.join(' ')).toContain('r-tal > 0,35');

    setState({ simResult: { ok: true, K_global: 0.8,
      redund: [{ ri: 0.3501, fromId: 'a', toId: 'b', type: 'dist' }] } });
    const over = validateNetwork();
    expect(over.issues.join(' ')).not.toContain('r-tal');
    expect(over.warnings.join(' ')).toContain('r-tal > 0,35');
  });
});

// ── Ett riktigt nät med k = f/n = 0,50 exakt ────────────────────────────────

describe('ett verkligt nät på gränsen', () => {
  // f = 10, n = 20 ⇒ k = (20 − 10)/20 = 0,50 exakt.
  //
  // Mätningarna är AVSTÅNDSMÄTNINGAR. Med riktningar tillkommer en
  // orienteringsobekant per uppställning, och u blir då inte 2 × antalet fria
  // punkter – ett nät med samma geometri och obsType 'both' får u = 14, n = 20
  // och k = 0,30. Avståndsmätning ger u = 2 × 5 fria punkter = 10 och n = 20
  // observationer (en per mätning), alltså exakt det gränsfall etappen kräver.
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3,
              instrPreset: 'ts16_1', obsType: 'dist_only' };

  it('k blir exakt 0,50 och nätet underkänns', () => {
    const pts = [
      { id: 'FP1', type: 'known', E: 0,   N: 0,   centerErr: 0 },
      { id: 'FP2', type: 'known', E: 400, N: 0,   centerErr: 0 },
      { id: 'FP3', type: 'known', E: 400, N: 400, centerErr: 0 },
      { id: 'FP4', type: 'known', E: 0,   N: 400, centerErr: 0 },
      { id: 'N1',  type: 'new',   E: 100, N: 100, centerErr: 0 },
      { id: 'N2',  type: 'new',   E: 300, N: 100, centerErr: 0 },
      { id: 'N3',  type: 'new',   E: 300, N: 300, centerErr: 0 },
      { id: 'N4',  type: 'new',   E: 100, N: 300, centerErr: 0 },
      { id: 'N5',  type: 'new',   E: 200, N: 200, centerErr: 0 },
    ];
    // Varje ny punkt mäts mot alla fyra kända: 5 × 4 = 20 avstånd.
    const par = [];
    for (const ny of ['N1', 'N2', 'N3', 'N4', 'N5'])
      for (const fp of ['FP1', 'FP2', 'FP3', 'FP4']) par.push([fp, ny]);
    const meas = par.map(([f, t], i) => ({ id: 'M' + i, from: f, to: t, ...I }));
    const sr = computeSimulation({ pts, meas, centerErr: 0 });

    expect(sr.ok).toBe(true);
    expect(sr.meas_n).toBe(20);
    expect(sr.unkn_n).toBe(10);
    expect(sr.redundancy).toBe(10);
    expect(sr.K_global).toBe(0.5);                  // exakt, inte bara nära

    // Utfallet: före Etapp 2 hette detta nät "Uppfyller norm".
    expect(klassificeraKtal(sr.K_global).uppfyllerNorm).toBe(false);
    expect(sr.K_class).toBe('Under norm');
  });

  // k räknas ur heltalen n och u, inte ur Σr_i. Storheterna är matematiskt
  // lika (Σr_i = f, HMK Formel F.6), men Σr_i är en flyttalssumma över alla
  // observationer och landar i allmänhet inte exakt på f. Med en STRIKT gräns
  // avgör den skillnaden utfallet: hamnar Σr_i/n strax över 0,5 blir nätet
  // godkänt, strax under underkänt – på ren avrundning.
  it('k kommer ur heltalen (n − u)/n, inte ur flyttalssumman Σr_i/n', () => {
    const pts = [
      { id: 'FP1', type: 'known', E: 0,   N: 0,   centerErr: 0 },
      { id: 'FP2', type: 'known', E: 400, N: 0,   centerErr: 0 },
      { id: 'FP3', type: 'known', E: 400, N: 400, centerErr: 0 },
      { id: 'FP4', type: 'known', E: 0,   N: 400, centerErr: 0 },
      { id: 'N1',  type: 'new',   E: 137, N: 211, centerErr: 0 },
      { id: 'N2',  type: 'new',   E: 289, N: 97,  centerErr: 0 },
      { id: 'N3',  type: 'new',   E: 311, N: 342, centerErr: 0 },
      { id: 'N4',  type: 'new',   E: 96,  N: 318, centerErr: 0 },
      { id: 'N5',  type: 'new',   E: 203, N: 187, centerErr: 0 },
    ];
    const par = [];
    for (const ny of ['N1', 'N2', 'N3', 'N4', 'N5'])
      for (const fp of ['FP1', 'FP2', 'FP3', 'FP4']) par.push([fp, ny]);
    const meas = par.map(([f, t], i) => ({ id: 'M' + i, from: f, to: t, ...I }));
    const sr = computeSimulation({ pts, meas, centerErr: 0 });

    expect(sr.ok).toBe(true);
    expect(sr.meas_n).toBe(20);
    expect(sr.unkn_n).toBe(10);

    // Heltalsvägen: exakt 0,5, utan flyttalsbrus.
    expect(sr.K_global).toBe(0.5);
    expect(Object.is(sr.K_global, 0.5)).toBe(true);

    // Flyttalsvägen: Σr_i träffar inte f exakt. Att den avviker är själva
    // skälet till att k inte får räknas den vägen.
    const sumR = sr.redund.reduce((a, r) => a + r.ri, 0);
    expect(sumR).toBeCloseTo(sr.redundancy, 9);
    expect(sumR).not.toBe(sr.redundancy);
    expect(sumR / sr.meas_n).not.toBe(0.5);

    // Och utfallet avgörs av heltalsvägen, oavsett åt vilket håll Σr_i pekar.
    expect(klassificeraKtal(sr.K_global).uppfyllerNorm).toBe(false);
  });
});
