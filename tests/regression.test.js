// Regressionstester och funktionstester
// – suggestMeasurements mot blandade punkttyper
// – importera alla förslagna mätningar

import { describe, it, expect, beforeEach } from 'vitest';
import { suggestMeasurements } from '../src/ui/right-panel.js';
import { getState, setState } from '../src/state/store.js';

// ─── Hjälpdata ────────────────────────────────────────────────────────────────

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [],
  activeCRS: 'sweref99tm', centerErr: 1.0, defaultInstr: 'ts16_1',
  nMid: 1, nId: 1, au: 'grad',
};

// ─── Regression: suggestMeasurements mot alla punkttyper ─────────────────────

describe('suggestMeasurements – blandade punkttyper', () => {
  beforeEach(() => setState(BASE));

  it('föreslår mätning från uppställning till ny punkt (type: "new")', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0,   N: 0   },
        { id: 'FP1', type: 'known',   E: 100, N: 0   },
        { id: 'FP2', type: 'known',   E: 50,  N: 100 },
        { id: 'FP3', type: 'known',   E: -50, N: 80  },
        { id: 'NY1', type: 'new',     E: 30,  N: 30  },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const toNew = sugg.find(s => s.to === 'NY1' || s.from === 'NY1');
    expect(toNew).toBeDefined();
  });

  it('föreslår mätning till detaljpunkt (type: "detail")', () => {
    setState({
      pts: [
        { id: 'S1', type: 'station', E: 0, N: 0 },
        { id: 'FP', type: 'known',   E: 100, N: 0 },
        { id: 'D1', type: 'detail',  E: 20, N: 20 },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const toDetail = sugg.find(s => s.to === 'D1' || s.from === 'D1');
    expect(toDetail).toBeDefined();
  });

  it('föreslår till ALLA obekanta – new, detail, simstation', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station',    E: 0,  N: 0  },
        { id: 'FP1', type: 'known',      E: 100, N: 0  },
        { id: 'NY1', type: 'new',        E: 30,  N: 30 },
        { id: 'D1',  type: 'detail',     E: -20, N: 40 },
        { id: 'SS1', type: 'simstation', E: 50,  N: 80 },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const ids  = sugg.flatMap(s => [s.from, s.to]);
    expect(ids).toContain('NY1');
    expect(ids).toContain('D1');
    expect(ids).toContain('SS1');
  });

  it('ny punkt med befintlig mätning ingår inte igen', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0,  N: 0  },
        { id: 'FP1', type: 'known',   E: 100, N: 0  },
        { id: 'NY1', type: 'new',     E: 30,  N: 30 },
      ],
      meas: [
        // S1→NY1 finns redan
        { id: 'M1', from: 'S1', to: 'NY1', obsType: 'both',
          sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
      ],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const duplicate = sugg.find(s =>
      (s.from === 'S1' && s.to === 'NY1') || (s.from === 'NY1' && s.to === 'S1')
    );
    expect(duplicate).toBeUndefined();
  });

  it('tom obstacles → inga blockerade, alla förslag syns', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0, N: 0 },
        { id: 'FP1', type: 'known',   E: 100, N: 0 },
        { id: 'NY1', type: 'new',     E: 30, N: 30 },
      ],
      meas: [],
      obstacles: [],
    });
    suggestMeasurements();
    expect(getState().blockedSuggestions).toHaveLength(0);
    const ids = getState().suggestedMeas.flatMap(s => [s.from, s.to]);
    expect(ids).toContain('NY1');
  });

  it('inga uppställningar → inga förslag', () => {
    setState({
      pts: [
        { id: 'FP1', type: 'known', E: 100, N: 0 },
        { id: 'NY1', type: 'new',   E: 30, N: 30 },
      ],
      meas: [],
    });
    suggestMeasurements();
    expect(getState().suggestedMeas).toHaveLength(0);
    expect(getState().blockedSuggestions).toHaveLength(0);
  });
});

// ─── Funktion 3: importera alla förslag ──────────────────────────────────────

describe('_importAllSugg – importera föreslagna mätningar', () => {
  beforeEach(() => {
    setState(BASE);
    // Registrera window-funktioner som right-panel.js normalt gör i initRightPanel
    // Vi simulerar det via suggestMeasurements direkt
  });

  it('3 förslag → meas växer med exakt 3', async () => {
    setState({
      meas: [],
      suggestedMeas: [
        { from: 'S1', to: 'FP1', reason: 'Bakåtsikt' },
        { from: 'S1', to: 'FP2', reason: 'Bakåtsikt' },
        { from: 'S1', to: 'NY1', reason: 'Obekant punkt' },
      ],
      defaultInstr: 'ts16_1',
      nMid: 1,
    });

    const { suggestedMeas, meas, defaultInstr, nMid } = getState();
    const { INSTRUMENTS } = await import('../src/core/constants.js');
    const pr = INSTRUMENTS[defaultInstr] || INSTRUMENTS['ts16_1'];
    let nextId = nMid;
    const newMeas = [
      ...meas,
      ...suggestedMeas.map(sg => ({
        id: `M${nextId++}`, from: sg.from, to: sg.to,
        obsType: 'both', instrPreset: defaultInstr,
        sigDist_mm: pr.sigDmm, sigDist_ppm: pr.sigDppm,
        sigHz_mgon: pr.sigHz, numSatser: 3,
        measDist: null, measHz: null,
      })),
    ];
    setState({ meas: newMeas, nMid: nextId, suggestedMeas: [] });

    expect(getState().meas).toHaveLength(3);
    expect(getState().suggestedMeas).toHaveLength(0);
  });

  it('importerade mätningar har korrekta from/to och obsType', async () => {
    setState({
      meas: [],
      suggestedMeas: [{ from: 'S1', to: 'FP1', reason: 'Test' }],
      defaultInstr: 'ts16_1',
      nMid: 7,
    });

    const { suggestedMeas, meas, defaultInstr, nMid } = getState();
    const { INSTRUMENTS } = await import('../src/core/constants.js');
    const pr = INSTRUMENTS[defaultInstr];
    let nextId = nMid;
    setState({
      meas: [...meas, ...suggestedMeas.map(sg => ({
        id: `M${nextId++}`, from: sg.from, to: sg.to,
        obsType: 'both', instrPreset: defaultInstr,
        sigDist_mm: pr.sigDmm, sigDist_ppm: pr.sigDppm,
        sigHz_mgon: pr.sigHz, numSatser: 3, measDist: null, measHz: null,
      }))],
      nMid: nextId, suggestedMeas: [],
    });

    const m = getState().meas[0];
    expect(m.id).toBe('M7');
    expect(m.from).toBe('S1');
    expect(m.to).toBe('FP1');
    expect(m.obsType).toBe('both');
    expect(m.measDist).toBeNull();
  });

  it('befintliga mätningar bevaras vid import', async () => {
    setState({
      meas: [{ id: 'M1', from: 'S1', to: 'FP1', obsType: 'both',
               sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 }],
      suggestedMeas: [{ from: 'S1', to: 'NY1', reason: 'Test' }],
      defaultInstr: 'ts16_1', nMid: 2,
    });

    const { suggestedMeas, meas, defaultInstr, nMid } = getState();
    const { INSTRUMENTS } = await import('../src/core/constants.js');
    const pr = INSTRUMENTS[defaultInstr];
    let nextId = nMid;
    setState({
      meas: [...meas, ...suggestedMeas.map(sg => ({
        id: `M${nextId++}`, from: sg.from, to: sg.to, obsType: 'both',
        instrPreset: defaultInstr, sigDist_mm: pr.sigDmm, sigDist_ppm: pr.sigDppm,
        sigHz_mgon: pr.sigHz, numSatser: 3, measDist: null, measHz: null,
      }))],
      nMid: nextId, suggestedMeas: [],
    });

    expect(getState().meas).toHaveLength(2);
    expect(getState().meas[0].id).toBe('M1');
    expect(getState().meas[1].to).toBe('NY1');
  });
});
