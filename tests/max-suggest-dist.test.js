// Etapp A: maxavstånd för föreslagna mätningar.
// – normalisering av tröskelvärdet
// – filtrering i suggestMeasurements (både förslag och blockerade)
// – serialisering i projektfilen + bakåtkompatibilitet med filer utan fältet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  suggestMeasurements,
  normalizeMaxSuggestDist,
  withinSuggestRange,
  MAX_SUGGEST_DIST_OPTIONS,
} from '../src/ui/right-panel.js';
import { getState, setState } from '../src/state/store.js';
import { _buildSnapshot, _applySnapshot } from '../src/io/export-project.js';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [],
  activeCRS: 'sweref99tm', centerErr: 1.0, defaultInstr: 'ts16_1',
  nMid: 1, nId: 1, au: 'grad', maxSuggestDist: 500,
};

// Uppställning i origo, tre kända punkter nära, en obekant på 800 m.
const NET = [
  { id: 'S1',  type: 'station', E: 0,    N: 0 },
  { id: 'FP1', type: 'known',   E: 100,  N: 0 },
  { id: 'FP2', type: 'known',   E: 0,    N: 200 },
  { id: 'FP3', type: 'known',   E: -300, N: 0 },
  { id: 'NY1', type: 'new',     E: 50,   N: 50 },
  { id: 'NY2', type: 'new',     E: 800,  N: 0 },
];

describe('normalizeMaxSuggestDist', () => {
  it('behåller positiva tal', () => {
    expect(normalizeMaxSuggestDist(500)).toBe(500);
    expect(normalizeMaxSuggestDist(2000)).toBe(2000);
  });

  it('tolkar strängar från <select>', () => {
    expect(normalizeMaxSuggestDist('1000')).toBe(1000);
  });

  it('ger null (obegränsat) för tomt, null, noll och skräp', () => {
    expect(normalizeMaxSuggestDist('')).toBeNull();
    expect(normalizeMaxSuggestDist(null)).toBeNull();
    expect(normalizeMaxSuggestDist(undefined)).toBeNull();
    expect(normalizeMaxSuggestDist(0)).toBeNull();
    expect(normalizeMaxSuggestDist(-100)).toBeNull();
    expect(normalizeMaxSuggestDist('abc')).toBeNull();
  });
});

describe('withinSuggestRange', () => {
  const a = { E: 0, N: 0 }, b = { E: 300, N: 400 }; // 500 m exakt

  it('släpper igenom allt när tröskeln är null', () => {
    expect(withinSuggestRange(a, b, null)).toBe(true);
  });

  it('inkluderar avstånd exakt på tröskeln', () => {
    expect(withinSuggestRange(a, b, 500)).toBe(true);
  });

  it('utesluter avstånd över tröskeln', () => {
    expect(withinSuggestRange(a, b, 499)).toBe(false);
  });
});

describe('suggestMeasurements – maxavstånd', () => {
  beforeEach(() => setState({ ...BASE }));

  it('utelämnar förslag längre bort än tröskeln', () => {
    setState({ pts: NET, maxSuggestDist: 500 });
    suggestMeasurements();
    const ids = getState().suggestedMeas.map(s => s.to);
    expect(ids).toContain('NY1');
    expect(ids).not.toContain('NY2');
  });

  it('tar med långa förslag när tröskeln är obegränsad', () => {
    setState({ pts: NET, maxSuggestDist: null });
    suggestMeasurements();
    expect(getState().suggestedMeas.map(s => s.to)).toContain('NY2');
  });

  it('sänkt tröskel filtrerar bort fler förslag', () => {
    setState({ pts: NET, maxSuggestDist: null });
    suggestMeasurements();
    const nAll = getState().suggestedMeas.length;
    setState({ maxSuggestDist: 150 });
    suggestMeasurements();
    const nTight = getState().suggestedMeas.length;
    expect(nTight).toBeLessThan(nAll);
    // Endast FP1 (100 m) och NY1 (~71 m) ligger inom 150 m
    expect(getState().suggestedMeas.map(s => s.to).sort()).toEqual(['FP1', 'NY1']);
  });

  it('filtrerar bort för långa par innan siktlinjekontrollen – de blir inte blockerade', () => {
    // Vägg tvärs över sikten mot NY2 (800 m bort)
    const wall = {
      id: 'obs_1', type: 'line', label: 'Vägg', source: 'manual',
      points: [[400, -100], [400, 100]],
    };
    setState({ pts: NET, obstacles: [wall], maxSuggestDist: null });
    suggestMeasurements();
    expect(getState().blockedSuggestions.map(b => b.to)).toContain('NY2');

    setState({ maxSuggestDist: 500 });
    suggestMeasurements();
    expect(getState().blockedSuggestions.map(b => b.to)).not.toContain('NY2');
    expect(getState().suggestedMeas.map(s => s.to)).not.toContain('NY2');
  });

  it('gäller även korsförbindelser mellan uppställningar', () => {
    setState({
      pts: [
        { id: 'S1', type: 'station', E: 0,    N: 0 },
        { id: 'S2', type: 'station', E: 300,  N: 0 },
        { id: 'S3', type: 'station', E: 700,  N: 0 },
      ],
      maxSuggestDist: 500,
    });
    suggestMeasurements();
    const pairs = getState().suggestedMeas.map(s => `${s.from}-${s.to}`);
    expect(pairs).toContain('S1-S2');
    expect(pairs).not.toContain('S1-S3'); // 700 m > 500 m
    expect(pairs).toContain('S2-S3');     // 400 m – filtret gäller per par
  });

  it('gäller bakåtsikter till kända punkter', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0,    N: 0 },
        { id: 'FP1', type: 'known',   E: 100,  N: 0 },
        { id: 'FP2', type: 'known',   E: 1000, N: 0 },
        { id: 'FP3', type: 'known',   E: 2000, N: 0 },
      ],
      maxSuggestDist: 500,
    });
    suggestMeasurements();
    expect(getState().suggestedMeas.map(s => s.to)).toEqual(['FP1']);
  });

  it('saknat fält i state behandlas som obegränsat, inte som noll', () => {
    setState({ pts: NET, maxSuggestDist: undefined });
    suggestMeasurements();
    expect(getState().suggestedMeas.length).toBeGreaterThan(0);
  });
});

describe('maxSuggestDist – serialisering', () => {
  beforeEach(() => setState({ ...BASE }));

  it('finns med i sparad projektfil', () => {
    setState({ maxSuggestDist: 1000 });
    expect(_buildSnapshot().maxSuggestDist).toBe(1000);
  });

  it('sparar obegränsat som null', () => {
    setState({ maxSuggestDist: null });
    expect(_buildSnapshot().maxSuggestDist).toBeNull();
  });

  it('överlever spara → ladda', () => {
    setState({ maxSuggestDist: 2000 });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ maxSuggestDist: 100 });
    _applySnapshot(snap);
    expect(getState().maxSuggestDist).toBe(2000);
  });

  it('äldre projektfil utan fältet laddas med 500 m', () => {
    setState({ maxSuggestDist: 2000 });
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [] });
    expect(getState().maxSuggestDist).toBe(500);
  });

  it('ver:1-fil utan fältet laddas med 500 m', () => {
    setState({ maxSuggestDist: null });
    _applySnapshot({ ver: 1, pts: [], meas: [] });
    expect(getState().maxSuggestDist).toBe(500);
  });

  it('explicit null i filen bevaras som obegränsat', () => {
    setState({ maxSuggestDist: 500 });
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [], maxSuggestDist: null });
    expect(getState().maxSuggestDist).toBeNull();
  });

  it('ogiltigt värde i filen saneras till obegränsat', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [], maxSuggestDist: -5 });
    expect(getState().maxSuggestDist).toBeNull();
  });
});

describe('MAX_SUGGEST_DIST_OPTIONS', () => {
  it('innehåller de efterfrågade stegen samt obegränsat', () => {
    expect(MAX_SUGGEST_DIST_OPTIONS.map(o => o.v)).toEqual([100, 250, 500, 1000, 2000, null]);
  });
});
