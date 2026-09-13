// Etapp E: optimeringsfunktionen för mätförslag (second-order design).
//
// Testfall 1–5 nedan är beställningens acceptanstester. Övriga block täcker
// kriterieuppslagningen, kandidatpoolen, viktnormaliseringen, förslagslagret
// och serialiseringen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  optimizeNetwork, generateCandidates, normalizeWeights, scoreDelta,
  formatLogEntry, formatRReport, lineMinHzR, dirMinHzR,
  MAX_ADDITIONS, MAX_ITERATIONS, DEFAULT_WEIGHTS,
} from '../src/core/optimizer.js';
import {
  criteriaForClass, metricsFromSim, checkCriteria, describeCriteria,
  R_MIN_HARD, R_MIN_SOFT, SIGMA_MAX_DEFAULT_MM,
} from '../src/core/optimizer-criteria.js';
import { SIS_TS_GENERAL_REQS } from '../src/data/sis-ts-classes.js';
import { R_OBS_NORM, R_OBS_GOD } from '../src/core/constants.js';
import { runOptimization, shouldUseWorker, WORKER_MEAS_THRESHOLD } from '../src/core/optimizer-runner.js';
import { computeSimulation } from '../src/core/simulation.js';
import { getState, setState } from '../src/state/store.js';
import {
  createProposal, storeProposal, applyProposal, discardProposal, setNetView, comparisonRows,
} from '../src/state/optimizer-proposal.js';
import { renderOptimizeButton, renderProposalSection, renderTab } from '../src/ui/right-panel.js';
import { isStationPoint } from '../src/core/designmatrix.js';
import { _buildSnapshot, _applySnapshot, _normalizeOptimizerConfig } from '../src/io/export-project.js';
import { openOptimizerDialog, closeOptimizerDialog, _getResult, _isOpen } from '../src/ui/optimizer-modal.js';
import { validateNetwork } from '../src/ui/validation.js';
import { runSimulation } from '../src/core/simulation.js';

const INSTR = {
  obsType: 'both', instrPreset: 'ts16_1',
  sigDist_mm: 1, sigDist_ppm: 1.5, sigHz_mgon: 0.3, numSatser: 3,
  measDist: null, measHz: null,
};

// Kvadratiskt nät: fyra kända hörn och tre uppställningar innanför.
const PTS = [
  { id: 'FP1', type: 'known',   E: 0,   N: 0   },
  { id: 'FP2', type: 'known',   E: 200, N: 0   },
  { id: 'FP3', type: 'known',   E: 200, N: 200 },
  { id: 'FP4', type: 'known',   E: 0,   N: 200 },
  { id: 'S1',  type: 'station', E: 60,  N: 60  },
  { id: 'S2',  type: 'station', E: 140, N: 60  },
  { id: 'S3',  type: 'station', E: 100, N: 150 },
];

function mkMeas(pairs, start = 1) {
  let n = start;
  return pairs.map(([from, to]) => ({ id: `M${n++}`, from, to, ...INSTR }));
}

// Mättat nät – varje uppställning mot varje annan punkt. Uppfyller G2 med god
// marginal och är därmed underlaget för Fas 2.
const RICH_PAIRS = [];
['S1', 'S2', 'S3'].forEach(s => PTS.forEach(p => { if (p.id !== s) RICH_PAIRS.push([s, p.id]); }));
const RICH = mkMeas(RICH_PAIRS);

// Magert nät – två sikter per uppställning. Uppfyller inte kraven.
const SPARSE = mkMeas([
  ['S1', 'FP1'], ['S1', 'FP2'],
  ['S2', 'FP2'], ['S2', 'FP3'],
  ['S3', 'FP4'], ['S3', 'S1'],
]);

const BASE_INPUT = { pts: PTS, centerErr: 1.0, matklass: 'G2' };
const run = (extra = {}) => optimizeNetwork({ ...BASE_INPUT, nextMeasId: 100, ...extra });

const metricsOf = (pts, meas) => metricsFromSim(computeSimulation({ pts, meas, centerErr: 1.0 }));

const BASE_STATE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [],
  optimizerProposal: null, netView: 'original',
  optimizerConfig: { weightSigma: 0.5, weightR: 0.5 },
  activeCRS: 'sweref99tm', centerErr: 1.0, defaultInstr: 'ts16_1',
  activeMatklass: 'G2', maxSuggestDist: 500, nMid: 1, nId: 1, au: 'grad',
};

// ═══════════════════════════════════════════════════════════════════════════
// Acceptanskriterier ur mätklassen
// ═══════════════════════════════════════════════════════════════════════════
describe('criteriaForClass', () => {
  it('har ett σ_max-tak per klass som PRODUKTVAL, inte ur Tabell A.9', () => {
    // Fix 2.2: σ_max avser σ_pos efter utjämning. Tabell A.9:s "spridning
    // längd" är en annan storhet (spridning mellan dubbelmätta längder i fält)
    // och får inte återinföras som källa.
    expect(criteriaForClass('G1').sigmaMaxMm).toBe(2);
    expect(criteriaForClass('G2').sigmaMaxMm).toBe(3);
    expect(criteriaForClass('G3').sigmaMaxMm).toBe(5);
    expect(criteriaForClass('G4').sigmaMaxMm).toBe(8);
    expect(SIGMA_MAX_DEFAULT_MM.G2).toBe(3);
    expect(criteriaForClass('G2').source).toContain('produktval');
    expect(criteriaForClass('G2').source).not.toContain('A.9');
  });

  it('σ_max kan överstyras per projekt', () => {
    const c = criteriaForClass('G2', { sigmaMaxMm: 1.5 });
    expect(c.sigmaMaxMm).toBe(1.5);
    expect(c.sigmaMaxDefaultMm).toBe(3);
    expect(c.sigmaMaxIsCustom).toBe(true);
    expect(describeCriteria(c).join(' ')).toContain('projektets eget värde');
    // null/skräp/0 faller tillbaka på klassens default
    [null, undefined, 0, -2, 'abc'].forEach(v => {
      expect(criteriaForClass('G2', { sigmaMaxMm: v }).sigmaMaxMm).toBe(3);
    });
    expect(criteriaForClass('G2').sigmaMaxIsCustom).toBe(false);
  });

  it('ger G2:s krav som fallback när ingen klass är vald', () => {
    const c = criteriaForClass(null);
    expect(c.klass).toBe('G2');
    expect(c.assumedClass).toBe(true);
    expect(criteriaForClass('G3').assumedClass).toBe(false);
  });

  it('har tvånivåkravet på r: hårt 0,35 och mjukt 0,50', () => {
    const c = criteriaForClass('G2');
    expect(c.kMin).toBe(0.50);
    // Hårt krav = SIS-TS §6.2.2, hämtat ur den befintliga normtabellen.
    expect(c.rMin).toBe(R_MIN_HARD);
    expect(c.rMin).toBe(0.35);
    expect(R_MIN_HARD).toBe(SIS_TS_GENERAL_REQS.k_individual_min);
    // Mjukt krav = HMK Bilaga F.6, samma nivå som valideringen kallar godkänd.
    expect(c.rSoft).toBe(R_MIN_SOFT);
    expect(c.rSoft).toBe(R_OBS_GOD);
    // Den avgörande ordningen: valideringens FELgräns sammanfaller med dett hårda
    // kravet, så ett optimerat nät kan få varningar men aldrig fel.
    // hårda kravet (båda är SIS-TS §6.2.2:s 0,35), och det mjuka ligger över.
    // Ett optimerat nät kan därför få varningar men aldrig fel.
    expect(R_OBS_NORM).toBe(c.rMin);
    expect(c.rMin).toBeLessThan(c.rSoft);
  });

  it('redovisar MUF/YT men låter dem inte spärra', () => {
    // Skulle de spärra vore det hårda kravet i praktiken 0,497 i stället för
    // 0,35 (MUF ≤ 4σ ⇔ r ≥ 0,490; YT ≤ 2σ ⇔ r ≥ 0,497) och tvånivåmodellen
    // verkningslös.
    const c = criteriaForClass('G2');
    expect(c.enforceMufYt).toBe(false);
    expect(c.mufFactorMax).toBe(4);
    expect(c.ytFactorMax).toBe(2);
    expect(describeCriteria(c).join(' ')).toContain('MUF');
    expect(describeCriteria(c).join(' ')).toContain('spärrar ej');
  });
});

describe('checkCriteria', () => {
  const crit = criteriaForClass('G2');

  it('godkänner metrics som klarar alla gränser', () => {
    const m = { computable: true, minR: 0.55, maxSigPosMm: 2, kGlobal: 0.6,
                maxMufFactor: 3.8, maxYtFactor: 1.7, nObs: 20, nMeas: 10 };
    expect(checkCriteria(m, crit).ok).toBe(true);
  });

  it('pekar ut varje brutet kriterium för sig', () => {
    const m = { computable: true, minR: 0.1, maxSigPosMm: 9, kGlobal: 0.2,
                maxMufFactor: 8, maxYtFactor: 7, nObs: 10, nMeas: 5 };
    const keys = checkCriteria(m, crit).violations.map(v => v.key);
    expect(keys).toEqual(['rMin', 'sigmaMax', 'kMin']);
  });

  it('behandlar ett oberäkningsbart nät som ett brott', () => {
    const m = metricsFromSim({ error: 'Normalmatrisen är singulär.\nrad2' });
    const res = checkCriteria(m, crit);
    expect(m.computable).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.violations[0].key).toBe('berakning');
  });

  it('observationer mellan 0,35 och 0,50 godkänns men räknas', () => {
    // Kärnan i Fix 2.1: det mjuka kravet blockerar inte.
    const m = { computable: true, minR: 0.36, maxSigPosMm: 1, kGlobal: 0.6,
                maxMufFactor: 4.67, maxYtFactor: 2.99,
                nObs: 20, nMeas: 10, nBelowHard: 0, nBelowSoft: 7 };
    expect(checkCriteria(m, crit).ok).toBe(true);
    // …men under 0,35 blockerar det.
    const under = { ...m, minR: 0.34, nBelowHard: 1 };
    const res = checkCriteria(under, crit);
    expect(res.ok).toBe(false);
    expect(res.violations[0].key).toBe('rMin');
    expect(res.violations[0].text).toContain('hårt krav');
  });

  it('metricsFromSim räknar observationer under båda trösklarna', () => {
    const crit2 = criteriaForClass('G2');
    const m = metricsOf(PTS, RICH);
    const rs = computeSimulation({ pts: PTS, meas: RICH, centerErr: 1.0 }).redund.map(r => r.ri);
    expect(m.nBelowHard).toBe(rs.filter(r => r < crit2.rMin).length);
    expect(m.nBelowSoft).toBe(rs.filter(r => r < crit2.rSoft).length);
    expect(m.nBelowHard).toBeLessThanOrEqual(m.nBelowSoft);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kandidatpool och poängsättning
// ═══════════════════════════════════════════════════════════════════════════
describe('generateCandidates', () => {
  it('utgår bara från uppställda punkter och hoppar över befintliga mätningar', () => {
    const { candidates } = generateCandidates({ pts: PTS, meas: SPARSE });
    expect(candidates.every(c => ['S1', 'S2', 'S3'].includes(c.from))).toBe(true);
    expect(candidates.some(c => c.from === 'S1' && c.to === 'FP1')).toBe(false);
    expect(candidates.some(c => c.from === 'S1' && c.to === 'FP3')).toBe(true);
  });

  it('en punkt utan riktningsmätning från sig är inte uppställd', () => {
    // Fix 1.1: uppställd = förekommer som from i en riktningsobservation
    // (kärnans stationIds), inte punkttyp. S3 är typad station men mäter
    // ingenting i detta nät och får därför inte vara ursprung för kandidater.
    const utanS3 = SPARSE.filter(m => m.from !== 'S3');
    const { candidates } = generateCandidates({ pts: PTS, meas: utanS3 });
    expect(candidates.some(c => c.from === 'S3')).toBe(false);
    expect(candidates.some(c => c.to === 'S3')).toBe(true);
  });

  it('en dist_only-mätning gör inte punkten uppställd', () => {
    // stationIds räknar bara riktningsobservationer – en uppställning med
    // enbart längdmätning får ingen orienteringsobekant i kärnan heller.
    const bara = [{ id: 'D1', from: 'S1', to: 'FP1', ...INSTR, obsType: 'dist_only' },
                  { id: 'H1', from: 'S2', to: 'FP2', ...INSTR }];
    const { candidates } = generateCandidates({ pts: PTS, meas: bara });
    expect(candidates.some(c => c.from === 'S1')).toBe(false);
    expect(candidates.some(c => c.from === 'S2')).toBe(true);
  });

  it('räknar bort par över maxavståndet i stället för att föreslå dem', () => {
    const wide = generateCandidates({ pts: PTS, meas: SPARSE });
    const tight = generateCandidates({ pts: PTS, meas: SPARSE, maxSuggestDist: 60 });
    expect(tight.candidates.length).toBeLessThan(wide.candidates.length);
    expect(tight.filteredByDistance).toBe(wide.candidates.length - tight.candidates.length);
    expect(tight.candidates.every(c => c.dist <= 60)).toBe(true);
  });

  it('utesluter siktlinjer som blockeras av hinder', () => {
    // Vägg tvärs över mellan S1 och FP4.
    const wall = [{ id: 'O1', type: 'line', points: [[-20, 130], [120, 130]] }];
    const open = generateCandidates({ pts: PTS, meas: SPARSE });
    const blocked = generateCandidates({ pts: PTS, meas: SPARSE, obstacles: wall });
    expect(blocked.filteredByObstacle).toBeGreaterThan(0);
    expect(blocked.candidates.length).toBe(open.candidates.length - blocked.filteredByObstacle);
  });

  it('ger samma ordning varje gång', () => {
    const a = generateCandidates({ pts: PTS, meas: SPARSE }).candidates;
    const b = generateCandidates({ pts: [...PTS].reverse(), meas: SPARSE }).candidates;
    expect(a.map(c => `${c.from}>${c.to}`)).toEqual(b.map(c => `${c.from}>${c.to}`));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 1.3 – nät utan station-typade punkter (F-13 i diagnosrapporten)
//
// Den vanliga sitsen vid import från Excel eller extern datakälla: punkterna
// är bara `known` och `new`, uppställningarna framgår enbart av mätningarna.
// Före Fix 1.1 gav sådana nät en tom kandidatpool och optimeringen blev en
// no-op. Testerna nedan var det som saknades – de gamla testerna använde
// uteslutande station-typade punkter och kodifierade därmed felantagandet.
// ═══════════════════════════════════════════════════════════════════════════
describe('Fix 1.3 – importerat nät med enbart known/new-punkter', () => {
  const IMPORT_PTS = [
    { id: 'FP1', type: 'known', E: 0,   N: 0   },
    { id: 'FP2', type: 'known', E: 200, N: 0   },
    { id: 'FP3', type: 'known', E: 200, N: 200 },
    { id: 'FP4', type: 'known', E: 0,   N: 200 },
    { id: 'N1',  type: 'new',   E: 60,  N: 60  },
    { id: 'N2',  type: 'new',   E: 140, N: 70  },
    { id: 'N3',  type: 'new',   E: 100, N: 150 },
  ];
  // Uppställda: N1, N2, N3 (de förekommer som from). FP1–FP4 är enbart mål.
  const IMPORT_MEAS = mkMeas([
    ['N1', 'FP1'], ['N1', 'FP2'],
    ['N2', 'FP2'], ['N2', 'FP3'],
    ['N3', 'FP4'], ['N3', 'N1'],
  ]);
  const OCCUPIED = ['N1', 'N2', 'N3'];

  it('ingen punkt skulle ha passerat det gamla punkttyps-predikatet', () => {
    expect(IMPORT_PTS.some(isStationPoint)).toBe(false);
  });

  it('kandidatpoolen är ändå icke-tom', () => {
    const { candidates } = generateCandidates({ pts: IMPORT_PTS, meas: IMPORT_MEAS, maxSuggestDist: 500 });
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('kandidaterna utgår bara från punkter som faktiskt är uppställda', () => {
    const { candidates } = generateCandidates({ pts: IMPORT_PTS, meas: IMPORT_MEAS, maxSuggestDist: 500 });
    expect(candidates.every(c => OCCUPIED.includes(c.from))).toBe(true);
    // FP1–FP4 är aldrig from i nätet och får därför inte bli ursprung …
    expect(candidates.some(c => c.from.startsWith('FP'))).toBe(false);
    // … men de är fullt giltiga mål.
    expect(candidates.some(c => c.to.startsWith('FP'))).toBe(true);
  });

  it('optimeringen arbetar i stället för att avbryta med tom pool', () => {
    const res = optimizeNetwork({
      pts: IMPORT_PTS, meas: IMPORT_MEAS, centerErr: 1.0,
      matklass: 'G2', nextMeasId: 100, maxSuggestDist: 500,
    });
    expect(res.error?.message ?? '').not.toMatch(/inga fler möjliga mätningar/);
    expect(res.log.some(e => e.action === 'add')).toBe(true);
    expect(res.meas.length).toBeGreaterThan(IMPORT_MEAS.length);
  });

  it('resultatet uppfyller kriterierna', () => {
    const res = optimizeNetwork({
      pts: IMPORT_PTS, meas: IMPORT_MEAS, centerErr: 1.0,
      matklass: 'G2', nextMeasId: 100, maxSuggestDist: 500,
    });
    expect(res.ok).toBe(true);
    expect(checkCriteria(metricsOf(IMPORT_PTS, res.meas), criteriaForClass('G2')).ok).toBe(true);
  });
});

describe('normalizeWeights', () => {
  it('normaliserar till summa 1', () => {
    expect(normalizeWeights({ sigma: 70, r: 30 })).toEqual({ sigma: 0.7, r: 0.3 });
  });
  it('faller tillbaka på 50/50 vid skräp eller 0/0', () => {
    expect(normalizeWeights(undefined)).toEqual({ ...DEFAULT_WEIGHTS });
    expect(normalizeWeights({ sigma: 0, r: 0 })).toEqual({ ...DEFAULT_WEIGHTS });
    expect(normalizeWeights({ sigma: -1, r: 2 })).toEqual({ ...DEFAULT_WEIGHTS });
    expect(normalizeWeights({ sigma: 'x', r: 1 })).toEqual({ ...DEFAULT_WEIGHTS });
  });
});

describe('scoreDelta', () => {
  const crit = criteriaForClass('G2');
  const w = { sigma: 0.5, r: 0.5 };
  const M = (minR, sig) => ({ computable: true, minR, maxSigPosMm: sig });

  it('är positiv när både σ_pos och r-tal förbättras', () => {
    expect(scoreDelta(M(0.2, 4), M(0.3, 3), crit, w)).toBeGreaterThan(0);
  });

  it('relativiserar mot kravnivån så att vikterna betyder samma sak', () => {
    // 0,3 mm förbättring = 10 % av σ_max (3 mm); 0,035 i r = 10 % av r_min (0,35).
    const a = scoreDelta(M(0.5, 3.3), M(0.5, 3.0), crit, w);
    const b = scoreDelta(M(0.500, 3), M(0.535, 3), crit, w);
    expect(a).toBeCloseTo(b, 12);
  });

  it('vikterna styr vilken effekt som väger tyngst', () => {
    const sigmaHeavy = scoreDelta(M(0.3, 4), M(0.3, 3), crit, { sigma: 1, r: 0 });
    const rHeavy     = scoreDelta(M(0.3, 4), M(0.3, 3), crit, { sigma: 0, r: 1 });
    expect(sigmaHeavy).toBeGreaterThan(0);
    expect(rHeavy).toBe(0);
  });

  it('diskvalificerar förändringar som gör nätet oberäkningsbart', () => {
    expect(scoreDelta(M(0.3, 3), { computable: false, minR: 0, maxSigPosMm: Infinity }, crit, w))
      .toBe(-Infinity);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 – nät som redan uppfyller kraven med marginal ska bantas
// ═══════════════════════════════════════════════════════════════════════════
describe('Test 1 – överbestämt nät bantas tills kriterierna precis håller', () => {
  const res = run({ meas: RICH });

  it('lyckas utan att behöva lägga till något', () => {
    expect(res.ok).toBe(true);
    expect(res.addedIds).toEqual([]);
    expect(res.log[0].text).toContain('hålls redan');
  });

  it('tar bort mätningar', () => {
    expect(res.removedIds.length).toBeGreaterThan(0);
    expect(res.meas.length).toBe(RICH.length - res.removedIds.length);
  });

  it('kriterierna håller fortfarande efteråt', () => {
    const m = metricsOf(PTS, res.meas);
    const c = criteriaForClass('G2');
    expect(checkCriteria(m, c).ok).toBe(true);
    expect(m.nMeas).toBeLessThan(RICH.length);
  });

  it('nätet är minimalt: varje ytterligare borttagning bryter ett krav', () => {
    const c = criteriaForClass('G2');
    res.meas.forEach((_, i) => {
      const reduced = res.meas.filter((__, j) => j !== i);
      expect(checkCriteria(metricsOf(PTS, reduced), c).ok).toBe(false);
    });
  });

  it('avslutas med en lograd som säger att nätet är hittat', () => {
    expect(res.log[res.log.length - 1].text).toContain('optimerade nätet är hittat');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 – nät med för få mätningar byggs upp
// ═══════════════════════════════════════════════════════════════════════════
describe('Test 2 – underbestämt nät byggs upp tills kriterierna håller', () => {
  const res = run({ meas: SPARSE });

  it('utgångsläget bryter mot kraven', () => {
    expect(checkCriteria(metricsOf(PTS, SPARSE), criteriaForClass('G2')).ok).toBe(false);
  });

  it('lägger till mätningar i Fas 1', () => {
    expect(res.ok).toBe(true);
    expect(res.addedIds.length).toBeGreaterThan(0);
    expect(res.log.some(e => e.phase === 1 && e.action === 'add')).toBe(true);
  });

  it('slutnätet uppfyller alla kriterier', () => {
    expect(checkCriteria(metricsOf(PTS, res.meas), criteriaForClass('G2')).ok).toBe(true);
  });

  it('tillagda mätningar har id som inte krockar och kompletta a priori-värden', () => {
    const added = res.meas.filter(m => res.addedIds.includes(m.id));
    expect(added.length).toBe(res.addedIds.length);
    expect(new Set(res.meas.map(m => m.id)).size).toBe(res.meas.length);
    added.forEach(m => {
      expect(m.obsType).toBe('both');
      expect(m.sigHz_mgon).toBeGreaterThan(0);
      expect(m.sigDist_mm).toBeGreaterThan(0);
      expect(m.numSatser).toBe(3);
    });
    expect(res.nextMeasId).toBeGreaterThan(100);
  });

  it('håller sig inom säkerhetsgränserna', () => {
    expect(res.addedIds.length).toBeLessThanOrEqual(MAX_ADDITIONS);
    expect(res.iterations).toBeLessThanOrEqual(MAX_ITERATIONS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 – fundamentalt otillräckligt nät avbryts med förklaring
// ═══════════════════════════════════════════════════════════════════════════
describe('Test 3 – för få punkter ger avbrott utan att nätet ändras', () => {
  const tinyPts = [
    { id: 'FP1', type: 'known',   E: 0,  N: 0 },
    { id: 'S1',  type: 'station', E: 50, N: 0 },
  ];
  const tinyMeas = mkMeas([['S1', 'FP1']]);
  const res = optimizeNetwork({ pts: tinyPts, meas: tinyMeas, centerErr: 1.0,
                                matklass: 'G2', nextMeasId: 50 });

  it('misslyckas i stället för att leverera ett obrukbart nät', () => {
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/avbröts/);
  });

  it('talar om vilka kriterier som inte kunde uppfyllas', () => {
    expect(res.error.violations.length).toBeGreaterThan(0);
    expect(res.error.violations.map(v => v.text).join(' ')).toMatch(/r-tal|Kontrollerbarhet|beräknas/);
  });

  it('föreslår konkreta åtgärder', () => {
    const s = res.error.suggestions.join(' ');
    expect(res.error.suggestions.length).toBeGreaterThan(0);
    expect(s).toMatch(/anslutningspunkter|uppställningar/);
  });

  it('lämnar nätet orört', () => {
    expect(res.meas).toEqual(tinyMeas);
    expect(res.addedIds).toEqual([]);
    expect(res.removedIds).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 – maxSuggestDist respekteras även när kraven då inte kan nås
// ═══════════════════════════════════════════════════════════════════════════
describe('Test 4 – maxavståndet är en hård gräns', () => {
  it('avbryter hellre än föreslår en mätning över gränsen', () => {
    const res = run({ meas: SPARSE, maxSuggestDist: 60 });
    expect(res.ok).toBe(false);
    expect(res.meas).toEqual(SPARSE);
    expect(res.error.suggestions.join(' ')).toContain('Öka maxavståndet från 60 m till 120 m');
  });

  it('ingen tillagd mätning överstiger gränsen när optimeringen lyckas', () => {
    const limit = 200;
    const res = run({ meas: SPARSE, maxSuggestDist: limit });
    expect(res.ok).toBe(true);
    const d = (a, b) => Math.hypot(a.E - b.E, a.N - b.N);
    const at = id => PTS.find(p => p.id === id);
    res.meas.filter(m => res.addedIds.includes(m.id)).forEach(m => {
      expect(d(at(m.from), at(m.to))).toBeLessThanOrEqual(limit);
    });
  });

  it('en för snäv gräns stoppar optimeringen där en generös lyckas', () => {
    // 60 m lämnar inga kandidater alls; utan gräns går det.
    expect(run({ meas: SPARSE, maxSuggestDist: 60 }).ok).toBe(false);
    expect(run({ meas: SPARSE, maxSuggestDist: null }).ok).toBe(true);
  });

  it('gränsen styr vilka sikter som får användas', () => {
    // Sedan Fas 3 klarar optimeringen 150 m genom dubbelmätning av korta
    // sikter – men aldrig genom att bryta gränsen.
    const d = (a, b) => Math.hypot(a.E - b.E, a.N - b.N);
    const at = id => PTS.find(p => p.id === id);
    const langst = res => Math.max(0, ...res.meas.filter(m => res.addedIds.includes(m.id))
      .map(m => d(at(m.from), at(m.to))));
    const begransad = run({ meas: SPARSE, maxSuggestDist: 150 });
    const fri       = run({ meas: SPARSE, maxSuggestDist: null });
    expect(begransad.ok).toBe(true);
    expect(langst(begransad)).toBeLessThanOrEqual(150);
    expect(langst(fri)).toBeGreaterThan(150);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 – reproducerbarhet
// ═══════════════════════════════════════════════════════════════════════════
describe('Test 5 – samma indata ger exakt samma resultat', () => {
  it('två körningar på det mättade nätet är identiska', () => {
    const a = run({ meas: RICH });
    const b = run({ meas: RICH });
    expect(b.meas).toEqual(a.meas);
    expect(b.removedIds).toEqual(a.removedIds);
    expect(b.log.map(e => e.text)).toEqual(a.log.map(e => e.text));
  });

  it('två körningar på det magra nätet är identiska', () => {
    const a = run({ meas: SPARSE });
    const b = run({ meas: SPARSE });
    expect(b.addedIds).toEqual(a.addedIds);
    expect(b.meas.map(m => `${m.from}>${m.to}`)).toEqual(a.meas.map(m => `${m.from}>${m.to}`));
  });

  it('påverkas inte av punkternas ordning i indata', () => {
    const a = run({ meas: RICH });
    const b = optimizeNetwork({ ...BASE_INPUT, pts: [...PTS].reverse(), meas: RICH, nextMeasId: 100 });
    expect(b.removedIds.slice().sort()).toEqual(a.removedIds.slice().sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Beslutsspårning
// ═══════════════════════════════════════════════════════════════════════════
describe('beslutsspårningslogg', () => {
  it('följer det beställda formatet för borttagningar', () => {
    const e = { iteration: 1, phase: 2, action: 'remove', from: 'A', to: 'B',
                sigmaEffectMm: 0.03, rEffect: -0.02 };
    expect(formatLogEntry(e)).toBe(
      'Iteration 1 (Fas 2): Tog bort mätning A→B. Bidrog minst till nätet: ' +
      'σ_pos-effekt +0,03 mm, r-tal-effekt -0,020. Alla kriterier hålls fortfarande.');
  });

  it('redovisar kvarstående brister för tillägg som inte räcker', () => {
    const e = { iteration: 2, phase: 1, action: 'add', from: 'S1', to: 'FP3',
                sigmaEffectMm: 0.5, rEffect: 0.05, criteriaOk: false,
                violations: [{ key: 'rMin', text: 'Minsta r-tal 0.100 < krav 0.300' }] };
    const t = formatLogEntry(e);
    expect(t).toContain('Lade till mätning S1→FP3');
    expect(t).toContain('Kvarstår: Minsta r-tal 0.100 < krav 0.300.');
  });

  it('varje operation i en riktig körning har text, fas och iteration', () => {
    const res = run({ meas: RICH });
    res.log.filter(e => e.action !== 'skip').forEach(e => {
      expect(e.text.length).toBeGreaterThan(20);
      expect([1, 2]).toContain(e.phase);
      expect(typeof e.iteration).toBe('number');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fas 3 – dubbelmätning i kandidatpoolen (F-3 i diagnosrapporten)
//
// test1_baseline enligt facittest F20: A och B kända, N1 ny, alla sex ordnade
// par mätta. Före Fas 3 gav nätet en tom kandidatpool – varje par var redan
// mätt – och optimeringen avbröt utan att kunna göra något alls.
// ═══════════════════════════════════════════════════════════════════════════
describe('Fas 3 – dubbelmätning', () => {
  const BL_PTS = [
    { id: 'A',  type: 'known', N: 7000000.0, E: 100000.0, centerErr: 1.0 },
    { id: 'B',  type: 'known', N: 7000000.0, E: 100200.0, centerErr: 1.0 },
    { id: 'N1', type: 'new',   N: 7000100.0, E: 100100.0, centerErr: 1.0 },
  ];
  const BL_I = { obsType: 'both', sigHz_mgon: 0.135, numSatser: 3,
                 sigDist_mm: 1.0, sigDist_ppm: 1.0, instrPreset: 'ts16_1' };
  const BL_MEAS = [['A','B'],['A','N1'],['B','A'],['B','N1'],['N1','A'],['N1','B']]
    .map(([from, to], i) => ({ id: 'm' + i, from, to, ...BL_I }));
  const blSim = meas => computeSimulation({ pts: BL_PTS, meas, centerErr: 1.0 });
  const dup = (from, to) => ({ id: 'dup', from, to, ...BL_I });
  const optBaseline = () => optimizeNetwork({
    pts: BL_PTS, meas: BL_MEAS, centerErr: 1.0,
    matklass: 'G2', nextMeasId: 7, maxSuggestDist: 500,
  });

  // ── Fix 3.1 + 3.2: vilka par som får dubbelmätas ──
  it('ett redan mätt par är numera kandidat', () => {
    const { candidates } = generateCandidates({ pts: BL_PTS, meas: BL_MEAS, maxSuggestDist: 500 });
    expect(candidates.length).toBe(6);
    expect(candidates.every(c => c.kind === 'duplicate')).toBe(true);
  });

  it('ommätning kräver att BÅDA ändarna är uppställda', () => {
    // FP1 är aldrig from i SPARSE ⇒ sikten S1→FP1 kan inte mätas om, eftersom
    // en verklig ommätning kräver uppställning i andra änden.
    const { candidates } = generateCandidates({ pts: PTS, meas: SPARSE });
    expect(candidates.some(c => c.from === 'S1' && c.to === 'FP1')).toBe(false);
    // …men en sträcka som ALDRIG mätts får föreslås mot samma fixpunkt.
    expect(candidates.some(c => c.from === 'S2' && c.to === 'FP1' && c.kind === 'new')).toBe(true);
  });

  it('motriktad ommätning föredras framför upprepning i samma riktning', () => {
    // Bara A→B finns i denna uppsättning; båda ändarna är uppställda.
    const enkelriktat = BL_MEAS.filter(m => !(m.from === 'B' && m.to === 'A'));
    const { candidates } = generateCandidates({ pts: BL_PTS, meas: enkelriktat, maxSuggestDist: 500 });
    const ab = candidates.find(c => c.from === 'A' && c.to === 'B');
    const ba = candidates.find(c => c.from === 'B' && c.to === 'A');
    expect(ab).toBeUndefined();                 // upprepning i samma riktning utesluts
    expect(ba).toBeDefined();
    expect(ba.kind).toBe('reverse');
  });

  it('finns båda riktningarna redan tillåts en tredje observation', () => {
    const { candidates } = generateCandidates({ pts: BL_PTS, meas: BL_MEAS, maxSuggestDist: 500 });
    expect(candidates.find(c => c.from === 'A' && c.to === 'B').kind).toBe('duplicate');
    expect(candidates.find(c => c.from === 'B' && c.to === 'A').kind).toBe('duplicate');
  });

  // ── Fix 3.5: de verifierade r-talen ur diagnosrapporten ──
  it('en ytterligare A→B höjer r för A→B-riktningen 0,2237 → 0,5630', () => {
    expect(dirMinHzR(blSim(BL_MEAS), 'A', 'B')).toBeCloseTo(0.2237, 4);
    const efter = blSim([...BL_MEAS, dup('A', 'B')]);
    expect(dirMinHzR(efter, 'A', 'B')).toBeCloseTo(0.5630, 4);
    expect(efter.meas_n).toBe(14);
    expect(efter.redundancy).toBe(9);
  });

  it('effekten hamnar i den riktning som mäts om, inte i motriktningen', () => {
    // Viktig geodetisk nyans: två IDENTISKA observationer kontrollerar
    // varandra. Motriktningen hänger på en annan orienteringsobekant och rör
    // sig knappt (0,2237 → 0,2241).
    const efter = blSim([...BL_MEAS, dup('B', 'A')]);
    expect(dirMinHzR(efter, 'B', 'A')).toBeCloseTo(0.5630, 4);
    expect(dirMinHzR(efter, 'A', 'B')).toBeCloseTo(0.2241, 4);
    expect(lineMinHzR(efter, 'A', 'B')).toBeCloseTo(0.2241, 4);
  });

  it('optimeringen löser test1_baseline i stället för att avbryta', () => {
    const res = optBaseline();
    expect(res.ok).toBe(true);
    expect(res.addedIds.length).toBeGreaterThan(0);
    expect(res.finalMetrics.minR).toBeGreaterThanOrEqual(criteriaForClass('G2').rMin);
    // Alla tillägg är dubbelmätningar – nätet har inga omätta par kvar.
    const tillagg = res.log.filter(e => e.action === 'add');
    expect(tillagg.every(e => e.kind === 'duplicate' || e.kind === 'reverse')).toBe(true);
  });

  // ── Fix 3.4: motiveringen i loggen ──
  it('loggen märker ut dubbelmätning och visar sträckans r-tal', () => {
    const res = optBaseline();
    const rad = res.log.find(e => e.action === 'add');
    expect(rad.text).toContain('dubbelmätning');
    expect(rad.text).toContain('sträckan');
    expect(rad.text).toMatch(/Höjer r-tal för sträckan .+ från \d,\d\d till \d,\d\d\./);
    expect(rad.lineRAfter).toBeGreaterThan(rad.lineRBefore);
  });

  it('formatLogEntry skiljer ny sträcka, motriktad och upprepad', () => {
    const bas = { iteration: 1, phase: 1, action: 'add', from: 'B', to: 'A', line: 'A–B',
                  sigmaEffectMm: 0.1, rEffect: 0.34, criteriaOk: true, violations: [] };
    expect(formatLogEntry({ ...bas, kind: 'new' })).toContain('Lade till mätning B→A');
    const rev = formatLogEntry({ ...bas, kind: 'reverse', lineRBefore: 0.22, lineRAfter: 0.56 });
    expect(rev).toContain('Lade till dubbelmätning B→A (motriktad ommätning av sträckan A–B)');
    expect(rev).toContain('Höjer r-tal för sträckan A–B från 0,22 till 0,56.');
    expect(formatLogEntry({ ...bas, kind: 'duplicate', lineRBefore: 0.22, lineRAfter: 0.56 }))
      .toContain('(ytterligare mätning av sträckan A–B)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 2.3 – r-rapporteringen i beslutsspårningen
// ═══════════════════════════════════════════════════════════════════════════
describe('Fix 2.3 – tvånivåkravet redovisas per iteration', () => {
  const res = run({ meas: RICH });

  it('varje operation redovisar antalet under det mjuka kravet', () => {
    const ops = res.log.filter(e => e.action === 'add' || e.action === 'remove');
    expect(ops.length).toBeGreaterThan(0);
    ops.forEach(e => {
      expect(e.belowSoft).toBe(e.metrics.nBelowSoft);
      expect(e.softLimit).toBe(0.50);
      expect(e.text).toMatch(/observationer? under r 0,50|Inga observationer under r 0,50/);
    });
  });

  it('varje operation bekräftar att inget värde ligger under det hårda kravet', () => {
    res.log.filter(e => e.action === 'add' || e.action === 'remove').forEach(e => {
      expect(e.belowHard).toBe(0);
      expect(e.hardLimit).toBe(0.35);
      expect(e.text).toContain('Inget värde under det hårda kravet r 0,35');
    });
  });

  it('sista raden speglar slutnätets faktiska antal', () => {
    const sista = res.log.filter(e => e.action === 'add' || e.action === 'remove').pop();
    expect(sista.belowSoft).toBe(res.finalMetrics.nBelowSoft);
    expect(sista.text).toContain(`${res.finalMetrics.nBelowSoft} observationer under r 0,50`);
  });

  it('formatRReport varnar när det hårda kravet är brutet', () => {
    const txt = formatRReport({ belowSoft: 4, belowHard: 2, softLimit: 0.5, hardLimit: 0.35 });
    expect(txt).toContain('4 observationer under r 0,50 (rapporteras).');
    expect(txt).toContain('⚠ 2 observationer UNDER det hårda kravet r 0,35.');
    // Singular/plural och nolläge
    expect(formatRReport({ belowSoft: 1, belowHard: 0, softLimit: 0.5, hardLimit: 0.35 }))
      .toContain('1 observation under r 0,50');
    expect(formatRReport({ belowSoft: 0, belowHard: 0, softLimit: 0.5, hardLimit: 0.35 }))
      .toContain('Inga observationer under r 0,50.');
    // Saknade fält ⇒ ingen text alls (äldre poster, skip/stop-rader)
    expect(formatRReport({})).toBe('');
  });

  it('jämförelsetabellen visar det mjuka kravet som egen rad', () => {
    const rows = comparisonRows(res.baseMetrics, res.finalMetrics, res.criteria);
    // Omgång 2: etiketten säger "r-tal", inte "r".
    const rad = rows.find(r => r.label.startsWith('Obs. med r-tal <'));
    expect(rad).toBeDefined();
    expect(rad.opt).toBe(res.finalMetrics.nBelowSoft);
    expect(rad.krav).toBe('rapporteras');
    expect(rad.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 2.2 – σ_max styr optimeringen
// ═══════════════════════════════════════════════════════════════════════════
describe('Fix 2.2 – projektets σ_max styr resultatet', () => {
  it('hårdare σ_max ger ett tätare nät', () => {
    const default_ = run({ meas: RICH });
    const hart     = run({ meas: RICH, sigmaMaxMm: 1.0 });
    expect(default_.finalMetrics.maxSigPosMm).toBeGreaterThan(hart.finalMetrics.maxSigPosMm);
    expect(hart.meas.length).toBeGreaterThan(default_.meas.length);
    expect(hart.finalMetrics.maxSigPosMm).toBeLessThanOrEqual(1.0);
  });

  it('ett hårdare σ_max nås numera genom dubbelmätning', () => {
    // Före Fas 3 avbröts 0,6 mm med tom pool. Nu kan optimeringen mäta om
    // befintliga sträckor och når kravet – till priset av många mätningar.
    const res = run({ meas: RICH, sigmaMaxMm: 0.6 });
    expect(res.ok).toBe(true);
    expect(res.finalMetrics.maxSigPosMm).toBeLessThanOrEqual(0.6);
    expect(res.addedIds.length).toBeGreaterThan(RICH.length);
  });

  it('ett orimligt σ_max slår i säkerhetsgränsen och lämnar nätet orört', () => {
    const res = run({ meas: RICH, sigmaMaxMm: 0.3 });
    expect(res.ok).toBe(false);
    expect(res.error.message).toContain(`säkerhetsgränsen ${MAX_ADDITIONS}`);
    expect(res.error.violations.some(v => v.key === 'sigmaMax')).toBe(true);
    expect(res.meas).toEqual(RICH);
  });

  it('utelämnat värde ger mätklassens default', () => {
    const utan = run({ meas: RICH });
    const med  = run({ meas: RICH, sigmaMaxMm: SIGMA_MAX_DEFAULT_MM.G2 });
    expect(med.meas.map(m => m.id)).toEqual(utan.meas.map(m => m.id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Körning via runner (Web Worker saknas i jsdom → huvudtrådsvägen)
// ═══════════════════════════════════════════════════════════════════════════
describe('optimizer-runner', () => {
  it('ger samma resultat som den synkrona körningen', async () => {
    const sync = run({ meas: RICH });
    const asyn = await runOptimization({ ...BASE_INPUT, meas: RICH, nextMeasId: 100 },
                                       { useWorker: false });
    expect(asyn.meas).toEqual(sync.meas);
    expect(asyn.log.map(e => e.text)).toEqual(sync.log.map(e => e.text));
  });

  it('rapporterar progress under körningen', async () => {
    const seen = [];
    await runOptimization({ ...BASE_INPUT, meas: RICH, nextMeasId: 100 },
                          { useWorker: false, onProgress: p => seen.push(p) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some(p => p.kind === 'operation')).toBe(true);
  });

  it('väljer worker på antal MÄTNINGAR, inte antal punkter', () => {
    // Fix 1.2: kostnaden styrs av mätningsantalet. Ett nät med många punkter
    // men få mätningar är billigt; motsatsen är dyr (16 punkter/120 mätningar
    // tog 6,9 s på huvudtråden enligt diagnosrapportens bilaga B).
    const hasWorker = typeof Worker !== 'undefined';
    const meas = n => Array.from({ length: n }, (_, i) => ({ id: 'M' + i, from: 'A', to: 'B' }));
    const mangaPunkter = Array.from({ length: 40 }, (_, i) => ({ id: 'P' + i, type: 'new', E: i, N: i }));

    expect(WORKER_MEAS_THRESHOLD).toBe(50);
    expect(shouldUseWorker({ pts: mangaPunkter, meas: meas(10) })).toBe(false);
    expect(shouldUseWorker({ pts: PTS, meas: meas(WORKER_MEAS_THRESHOLD - 1) })).toBe(false);
    expect(shouldUseWorker({ pts: PTS, meas: meas(WORKER_MEAS_THRESHOLD) })).toBe(hasWorker);
    expect(shouldUseWorker({ pts: PTS, meas: meas(120) })).toBe(hasWorker);
    expect(shouldUseWorker()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Förslagslagret (Behåll som förslag)
// ═══════════════════════════════════════════════════════════════════════════
describe('optimeringsförslag som eget visningslager', () => {
  beforeEach(() => setState({ ...BASE_STATE, pts: PTS, meas: RICH, nMid: 100 }));

  const proposal = () => createProposal(run({ meas: RICH }), getState());

  it('skapar förslaget utan att röra nätet', () => {
    const p = proposal();
    storeProposal(p);
    expect(getState().meas).toBe(RICH);
    expect(getState().netView).toBe('optimized');
    expect(p.meas.length).toBeLessThan(RICH.length);
    expect(p.simResult.ok).toBe(true);
  });

  it('går att växla mellan original och förslag', () => {
    storeProposal(proposal());
    expect(setNetView('original')).toBe('original');
    expect(setNetView('optimized')).toBe('optimized');
  });

  it('kan inte visa förslagsvyn utan förslag', () => {
    discardProposal();
    expect(setNetView('optimized')).toBe('original');
  });

  it('tillämpning byter nätet och rensar förslaget', () => {
    const p = proposal();
    storeProposal(p);
    expect(applyProposal()).toBe(true);
    expect(getState().meas.map(m => m.id)).toEqual(p.meas.map(m => m.id));
    expect(getState().optimizerProposal).toBeNull();
    expect(getState().netView).toBe('original');
    expect(getState().simResult).toBeNull();
  });

  it('förkastning lämnar nätet orört', () => {
    storeProposal(proposal());
    discardProposal();
    expect(getState().meas).toBe(RICH);
    expect(getState().optimizerProposal).toBeNull();
  });

  it('jämförelsetabellen visar båda näten mot kravet', () => {
    const res = run({ meas: RICH });
    const rows = comparisonRows(res.baseMetrics, res.finalMetrics, res.criteria);
    const r = rows.find(x => x.label === 'Minsta r-tal');
    expect(rows.map(x => x.label)).toContain('Största σ_pos');
    expect(r.krav).toBe('≥ 0,35');
    expect(r.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Nätvalideringen efter optimering
//
// Regressionsskydd för buggen som hittades vid genomgången: optimeringens
// r-krav låg på felgränsen 0,30 medan valideringen varnar under 0,50, så ett
// optimerat nät fick varningar direkt av produktens egen validering.
// ═══════════════════════════════════════════════════════════════════════════
describe('nätvalidering efter optimering', () => {
  beforeEach(() => setState({ ...BASE_STATE, pts: PTS, meas: RICH, nMid: 100 }));

  it('ett optimerat nät ger inga FEL i valideringen', () => {
    // Kontraktet efter Fas 2: optimeringens hårda krav och valideringens
    // felgräns är samma normtal (SIS-TS §6.2.2, 0,35), så ett optimerat nät
    // kan aldrig underkännas av validateNetwork() på r-talen.
    // 2026-09-13: felgränsen var tidigare produktens egen 0,30.
    const res = run({ meas: RICH });
    setState({ meas: res.meas, simResult: null });
    runSimulation();
    const v = validateNetwork();
    expect(v.issues.filter(i => i.includes('r_i'))).toEqual([]);
    expect(v.ok).toBe(true);
    expect(getState().simResult.redund.every(r => r.ri >= R_OBS_NORM)).toBe(true);
  });

  it('varningarna i bandet 0,35–0,50 är exakt de optimeringen rapporterar', () => {
    // Observationer mellan hårt och mjukt krav levereras medvetet. Kopplingen
    // som måste hålla: antalet valideringen varnar för är samma antal som
    // beslutsspårningsloggen redovisar, så användaren kan motivera dem.
    const res = run({ meas: RICH });
    setState({ meas: res.meas, simResult: null });
    runSimulation();
    const band = getState().simResult.redund
      .filter(r => r.ri >= R_OBS_NORM && r.ri < R_OBS_GOD);
    expect(band.length).toBe(res.finalMetrics.nBelowSoft);
    expect(res.finalMetrics.nBelowHard).toBe(0);
    if (band.length) {
      // Omgång 2: valideringen säger "r-tal" i stället för indexnotationen r_i.
      expect(validateNetwork().warnings.some(w => w.includes('r-tal'))).toBe(true);
    }
  });

  it('valideringen prövar förslaget när förslagsvyn är aktiv', () => {
    // Originalnätet har en svag mätning som förslaget inte har.
    setState({ meas: SPARSE, simResult: null });
    runSimulation();
    expect(validateNetwork().ok).toBe(false);

    const res = run({ meas: SPARSE });
    storeProposal(createProposal(res, getState()));
    const v = validateNetwork();
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toContain('OPTIMERADE FÖRSLAGET');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Panelens knapp och vy-växlare
// ═══════════════════════════════════════════════════════════════════════════
describe('mätningspanelen', () => {
  beforeEach(() => setState({ ...BASE_STATE }));

  it('optimeringsknappen är avstängd utan nät', () => {
    const html = renderOptimizeButton();
    expect(html).toContain('disabled');
    expect(html).toContain('Optimera nät');
  });

  it('optimeringsknappen är aktiv med punkter och mätningar', () => {
    setState({ pts: PTS, meas: RICH });
    const html = renderOptimizeButton();
    expect(html).not.toContain('disabled');
    expect(html).toContain('window._openOptimizer()');
  });

  it('MÄTNINGAR-fliken renderar knappen och växlaren tillsammans', () => {
    document.body.innerHTML = '<div id="tc"></div>';
    setState({ pts: PTS, meas: RICH, nMid: 100, atab: 'meas' });
    storeProposal(createProposal(run({ meas: RICH }), getState()));
    renderTab();
    const html = document.getElementById('tc').innerHTML;
    expect(html).toContain('Optimera nät');
    expect(html).toContain('OPTIMERAT FÖRSLAG');
    expect(html).toContain(`MÄTNINGAR (${RICH.length})`);
  });

  it('vy-växlaren syns bara när ett förslag finns', () => {
    setState({ pts: PTS, meas: RICH, nMid: 100 });
    expect(renderProposalSection()).toBe('');
    storeProposal(createProposal(run({ meas: RICH }), getState()));
    const html = renderProposalSection();
    expect(html).toContain('OPTIMERAT FÖRSLAG');
    expect(html).toContain("window._setNetView('original')");
    expect(html).toContain('Tillämpa förslag');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Optimeringsdialogen
// ═══════════════════════════════════════════════════════════════════════════
describe('optimeringsdialogen', () => {
  beforeEach(() => {
    setState({ ...BASE_STATE, pts: PTS, meas: RICH, nMid: 100 });
    document.body.innerHTML = '';
    closeOptimizerDialog();
  });

  it('öppnar inte för ett nät som är för litet', () => {
    setState({ pts: [], meas: [] });
    openOptimizerDialog();
    expect(_isOpen()).toBe(false);
  });

  it('visar mätklassen och kriterierna den ger', () => {
    openOptimizerDialog();
    const html = document.querySelector('#opt-overlay .mo').innerHTML;
    expect(html).toContain('G2');
    expect(html).toContain('Minsta r-tal per observation');
    expect(html).toContain('σ_pos ≤ 3,0 mm');
    expect(html).toContain('Kontrollerbarhet: k ≥ 0,50');
  });

  it('talar om att maxavståndet respekteras', () => {
    openOptimizerDialog();
    expect(document.querySelector('#opt-overlay').innerHTML)
      .toContain('500 m – respekteras av optimeringen');
  });

  it('markerar när mätklass saknas i projektet', () => {
    setState({ activeMatklass: null });
    openOptimizerDialog();
    expect(document.querySelector('#opt-overlay').innerHTML).toContain('Ingen mätklass vald');
  });

  it('σ_max-fältet skriver till optimizerConfig utan att röra vikterna', () => {
    openOptimizerDialog();
    const inp = document.getElementById('opt-sigmax');
    expect(inp.value).toBe('');                       // tomt = klassens default
    expect(inp.placeholder).toContain('3');
    inp.value = '1.5';
    inp.dispatchEvent(new window.Event('input'));
    expect(getState().optimizerConfig.sigma_max_mm).toBe(1.5);
    expect(getState().optimizerConfig.weightSigma).toBe(0.5);
    expect(document.getElementById('opt-crit-list').innerHTML).toContain('1,5 mm');
    // Tomt fält återställer till klassens default
    inp.value = '';
    inp.dispatchEvent(new window.Event('input'));
    expect(getState().optimizerConfig.sigma_max_mm).toBeNull();
  });

  it('visar att σ_max är produktval och r-kravet tvånivåigt', () => {
    openOptimizerDialog();
    const html = document.querySelector('#opt-overlay .mo').innerHTML;
    expect(html).toContain('hårt krav');
    expect(html).toContain('rapporteras men blockerar inte');
    expect(html).toContain('produktval');
  });

  it('viktreglaget skriver till optimizerConfig', () => {
    openOptimizerDialog();
    const slider = document.getElementById('opt-weight');
    expect(slider.value).toBe('50');
    slider.value = '75';
    slider.dispatchEvent(new window.Event('input'));
    expect(getState().optimizerConfig).toEqual({ weightSigma: 0.75, weightR: 0.25 });
  });

  it('kör optimeringen och visar beslutsspårning och tre utgångar', async () => {
    openOptimizerDialog();
    document.getElementById('opt-run').click();
    await vi.waitFor(() => expect(_getResult()).not.toBeNull());
    const html = document.querySelector('#opt-overlay .mo').innerHTML;
    expect(html).toContain('Tog bort mätning');
    expect(html).toContain('Beslutsspårning');
    expect(document.getElementById('opt-apply')).not.toBeNull();
    expect(document.getElementById('opt-keep')).not.toBeNull();
    expect(document.getElementById('opt-cancel')).not.toBeNull();
  });

  it('"Behåll som förslag" lägger nätet i förslagslagret utan att ändra det', async () => {
    openOptimizerDialog();
    document.getElementById('opt-run').click();
    await vi.waitFor(() => expect(_getResult()).not.toBeNull());
    document.getElementById('opt-keep').click();
    expect(_isOpen()).toBe(false);
    expect(getState().meas).toBe(RICH);
    expect(getState().netView).toBe('optimized');
    expect(getState().optimizerProposal.meas.length).toBeLessThan(RICH.length);
  });

  it('"Tillämpa" byter nätet direkt', async () => {
    openOptimizerDialog();
    document.getElementById('opt-run').click();
    await vi.waitFor(() => expect(_getResult()).not.toBeNull());
    const kvar = _getResult().meas.length;
    document.getElementById('opt-apply').click();
    expect(getState().meas.length).toBe(kvar);
    expect(getState().optimizerProposal).toBeNull();
  });

  it('"Avbryt" stänger utan att ändra något', async () => {
    openOptimizerDialog();
    document.getElementById('opt-run').click();
    await vi.waitFor(() => expect(_getResult()).not.toBeNull());
    document.getElementById('opt-cancel').click();
    expect(_isOpen()).toBe(false);
    expect(getState().meas).toBe(RICH);
    expect(getState().optimizerProposal).toBeNull();
  });

  it('visar felmeddelande och åtgärder när kraven inte kan nås', async () => {
    setState({ pts: PTS, meas: SPARSE, maxSuggestDist: 60 });
    openOptimizerDialog();
    document.getElementById('opt-run').click();
    await vi.waitFor(() => expect(_getResult()).not.toBeNull());
    const html = document.querySelector('#opt-overlay .mo').innerHTML;
    expect(html).toContain('avbröts');
    expect(html).toContain('Föreslagna åtgärder');
    expect(html).toContain('Nätet är oförändrat');
    expect(document.getElementById('opt-apply')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Serialisering av optimizerConfig
// ═══════════════════════════════════════════════════════════════════════════
describe('optimizerConfig i projektfilen', () => {
  beforeEach(() => setState({ ...BASE_STATE }));

  it('sparas i snapshotet', () => {
    setState({ optimizerConfig: { weightSigma: 0.7, weightR: 0.3, sigma_max_mm: 2.5 } });
    expect(_buildSnapshot().optimizerConfig)
      .toEqual({ weightSigma: 0.7, weightR: 0.3, sigma_max_mm: 2.5 });
  });

  it('äldre filer utan sektionen laddas med 50/50 och klassens σ_max', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [] });
    // sigma_max_mm = null betyder "följ mätklassens default", vilket för G2
    // är 3 mm – kravet på bakåtkompatibilitet i Fix 2.2.
    expect(getState().optimizerConfig).toEqual({ weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null });
    expect(criteriaForClass('G2', { sigmaMaxMm: getState().optimizerConfig.sigma_max_mm })
      .sigmaMaxMm).toBe(3);
  });

  it('normaliserar viktparet till summa 1 och sanerar skräp', () => {
    expect(_normalizeOptimizerConfig({ weightSigma: 70, weightR: 30 }))
      .toEqual({ weightSigma: 0.7, weightR: 0.3, sigma_max_mm: null });
    expect(_normalizeOptimizerConfig({ weightSigma: 0, weightR: 0 }))
      .toEqual({ weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null });
    expect(_normalizeOptimizerConfig({ weightSigma: 'abc', weightR: null }))
      .toEqual({ weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null });
  });

  it('sanerar sigma_max_mm', () => {
    expect(_normalizeOptimizerConfig({ sigma_max_mm: 4.5 }).sigma_max_mm).toBe(4.5);
    expect(_normalizeOptimizerConfig({ sigma_max_mm: '2,5' }).sigma_max_mm).toBe(2.5);
    [0, -1, 'abc', null, undefined].forEach(v => {
      expect(_normalizeOptimizerConfig({ sigma_max_mm: v }).sigma_max_mm).toBeNull();
    });
  });

  it('går fram och tillbaka utan att ändra värdet', () => {
    setState({ optimizerConfig: { weightSigma: 0.25, weightR: 0.75, sigma_max_mm: 1.8 } });
    const snap = _buildSnapshot();
    setState({ optimizerConfig: { weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null } });
    _applySnapshot(snap);
    expect(getState().optimizerConfig)
      .toEqual({ weightSigma: 0.25, weightR: 0.75, sigma_max_mm: 1.8 });
  });

  it('ett laddat projekt börjar utan liggande förslag', () => {
    setState({ optimizerProposal: { meas: [] }, netView: 'optimized' });
    _applySnapshot({ ver: 3, pts: [], meas: [] });
    expect(getState().optimizerProposal).toBeNull();
    expect(getState().netView).toBe('original');
  });
});
