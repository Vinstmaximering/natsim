// Etapp E: optimeringsfunktionen för mätförslag (second-order design).
//
// Testfall 1–5 nedan är beställningens acceptanstester. Övriga block täcker
// kriterieuppslagningen, kandidatpoolen, viktnormaliseringen, förslagslagret
// och serialiseringen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  optimizeNetwork, generateCandidates, normalizeWeights, scoreDelta,
  formatLogEntry, MAX_ADDITIONS, MAX_ITERATIONS, DEFAULT_WEIGHTS,
} from '../src/core/optimizer.js';
import {
  criteriaForClass, metricsFromSim, checkCriteria, describeCriteria, R_MIN_DEFAULT,
} from '../src/core/optimizer-criteria.js';
import { runOptimization, shouldUseWorker } from '../src/core/optimizer-runner.js';
import { computeSimulation } from '../src/core/simulation.js';
import { getState, setState } from '../src/state/store.js';
import {
  createProposal, storeProposal, applyProposal, discardProposal, setNetView, comparisonRows,
} from '../src/state/optimizer-proposal.js';
import { renderOptimizeButton, renderProposalSection, renderTab } from '../src/ui/right-panel.js';
import { _buildSnapshot, _applySnapshot, _normalizeOptimizerConfig } from '../src/io/export-project.js';
import { openOptimizerDialog, closeOptimizerDialog, _getResult, _isOpen } from '../src/ui/optimizer-modal.js';

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
  it('läser σ_max ur SIS-TS Tabell A.9 per klass', () => {
    expect(criteriaForClass('G1').sigmaMaxMm).toBe(2);
    expect(criteriaForClass('G2').sigmaMaxMm).toBe(3);
    expect(criteriaForClass('G3').sigmaMaxMm).toBe(5);
    expect(criteriaForClass('G4').sigmaMaxMm).toBe(8);
  });

  it('ger G2:s krav som fallback när ingen klass är vald', () => {
    const c = criteriaForClass(null);
    expect(c.klass).toBe('G2');
    expect(c.assumedClass).toBe(true);
    expect(criteriaForClass('G3').assumedClass).toBe(false);
  });

  it('har normens k-gräns och produktens r-gräns', () => {
    const c = criteriaForClass('G2');
    expect(c.kMin).toBe(0.50);
    expect(c.rMin).toBe(R_MIN_DEFAULT);
    expect(c.rMin).toBe(0.30);
  });

  it('spärrar inte på MUF/YT som default men redovisar gränserna', () => {
    const c = criteriaForClass('G2');
    expect(c.enforceMufYt).toBe(false);
    expect(c.mufFactorMax).toBe(4);
    expect(c.ytFactorMax).toBe(2);
    expect(describeCriteria(c).join(' ')).toContain('MUF');
  });
});

describe('checkCriteria', () => {
  const crit = criteriaForClass('G2');

  it('godkänner metrics som klarar alla gränser', () => {
    const m = { computable: true, minR: 0.4, maxSigPosMm: 2, kGlobal: 0.6,
                maxMufFactor: 4.4, maxYtFactor: 2.7, nObs: 20, nMeas: 10 };
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

  it('spärrar på MUF/YT först när enforceMufYt är satt', () => {
    const m = { computable: true, minR: 0.31, maxSigPosMm: 1, kGlobal: 0.6,
                maxMufFactor: 5.0, maxYtFactor: 3.4, nObs: 20, nMeas: 10 };
    expect(checkCriteria(m, crit).ok).toBe(true);
    const strict = { ...crit, enforceMufYt: true };
    expect(checkCriteria(m, strict).violations.map(v => v.key)).toEqual(['muf', 'yt']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kandidatpool och poängsättning
// ═══════════════════════════════════════════════════════════════════════════
describe('generateCandidates', () => {
  it('utgår bara från uppställningspunkter och hoppar över befintliga mätningar', () => {
    const { candidates } = generateCandidates({ pts: PTS, meas: SPARSE });
    expect(candidates.every(c => ['S1', 'S2', 'S3'].includes(c.from))).toBe(true);
    expect(candidates.some(c => c.from === 'S1' && c.to === 'FP1')).toBe(false);
    expect(candidates.some(c => c.from === 'S1' && c.to === 'FP3')).toBe(true);
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
    const open = generateCandidates({ pts: PTS, meas: [] });
    const blocked = generateCandidates({ pts: PTS, meas: [], obstacles: wall });
    expect(blocked.filteredByObstacle).toBeGreaterThan(0);
    expect(blocked.candidates.length).toBe(open.candidates.length - blocked.filteredByObstacle);
  });

  it('ger samma ordning varje gång', () => {
    const a = generateCandidates({ pts: PTS, meas: SPARSE }).candidates;
    const b = generateCandidates({ pts: [...PTS].reverse(), meas: SPARSE }).candidates;
    expect(a.map(c => `${c.from}>${c.to}`)).toEqual(b.map(c => `${c.from}>${c.to}`));
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
    // 0,3 mm förbättring = 10 % av σ_max; 0,03 i r = 10 % av r_min.
    const a = scoreDelta(M(0.3, 3.3), M(0.3, 3.0), crit, w);
    const b = scoreDelta(M(0.30, 3), M(0.33, 3), crit, w);
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
    const limit = 150;
    const res = run({ meas: SPARSE, maxSuggestDist: limit });
    expect(res.ok).toBe(true);
    const d = (a, b) => Math.hypot(a.E - b.E, a.N - b.N);
    const at = id => PTS.find(p => p.id === id);
    res.meas.filter(m => res.addedIds.includes(m.id)).forEach(m => {
      expect(d(at(m.from), at(m.to))).toBeLessThanOrEqual(limit);
    });
  });

  it('utan gräns får längre sikter användas', () => {
    const limited = run({ meas: SPARSE, maxSuggestDist: 150 });
    const free    = run({ meas: SPARSE, maxSuggestDist: null });
    expect(limited.meas.map(m => m.id)).not.toEqual(free.meas.map(m => m.id));
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
      'σ_pos-effekt +0.03 mm, r-tal-effekt -0.020. Alla kriterier hålls fortfarande.');
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

  it('väljer worker först för stora nät, och bara om miljön har en', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: 'P' + i, type: 'new', E: i, N: i }));
    const hasWorker = typeof Worker !== 'undefined';
    expect(shouldUseWorker(PTS)).toBe(false);
    expect(shouldUseWorker(many)).toBe(hasWorker);
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
    expect(r.krav).toBe('≥ 0.30');
    expect(r.ok).toBe(true);
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
    expect(html).toContain('σ_pos ≤ 3.0 mm');
    expect(html).toContain('Kontrollerbarhet: k ≥ 0.50');
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
    setState({ optimizerConfig: { weightSigma: 0.7, weightR: 0.3 } });
    expect(_buildSnapshot().optimizerConfig).toEqual({ weightSigma: 0.7, weightR: 0.3 });
  });

  it('äldre filer utan sektionen laddas med 50/50', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [] });
    expect(getState().optimizerConfig).toEqual({ weightSigma: 0.5, weightR: 0.5 });
  });

  it('normaliserar viktparet till summa 1 och sanerar skräp', () => {
    expect(_normalizeOptimizerConfig({ weightSigma: 70, weightR: 30 }))
      .toEqual({ weightSigma: 0.7, weightR: 0.3 });
    expect(_normalizeOptimizerConfig({ weightSigma: 0, weightR: 0 }))
      .toEqual({ weightSigma: 0.5, weightR: 0.5 });
    expect(_normalizeOptimizerConfig({ weightSigma: 'abc', weightR: null }))
      .toEqual({ weightSigma: 0.5, weightR: 0.5 });
  });

  it('går fram och tillbaka utan att ändra värdet', () => {
    setState({ optimizerConfig: { weightSigma: 0.25, weightR: 0.75 } });
    const snap = _buildSnapshot();
    setState({ optimizerConfig: { weightSigma: 0.5, weightR: 0.5 } });
    _applySnapshot(snap);
    expect(getState().optimizerConfig).toEqual({ weightSigma: 0.25, weightR: 0.75 });
  });

  it('ett laddat projekt börjar utan liggande förslag', () => {
    setState({ optimizerProposal: { meas: [] }, netView: 'optimized' });
    _applySnapshot({ ver: 3, pts: [], meas: [] });
    expect(getState().optimizerProposal).toBeNull();
    expect(getState().netView).toBe('original');
  });
});
