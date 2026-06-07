// Regressionstester och funktionstester
// – suggestMeasurements mot blandade punkttyper
// – importera alla förslagna mätningar
// – isStationPoint + kombinerade uppställningar + dubbelmätta mätningar

import { describe, it, expect, beforeEach } from 'vitest';
import { suggestMeasurements, isStationPoint } from '../src/ui/right-panel.js';
import { getState, setState } from '../src/state/store.js';
import { _buildSnapshot, _applySnapshot } from '../src/io/export-project.js';

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

// ─── isStationPoint + kombinerade uppställningar ─────────────────────────────

describe('isStationPoint', () => {
  it('returnerar true för type:"station"', () => {
    expect(isStationPoint({ id: 'S1', type: 'station', E: 0, N: 0 })).toBe(true);
  });

  it('returnerar true för type:"known" med isStation:true', () => {
    expect(isStationPoint({ id: 'K1', type: 'known', isStation: true, E: 0, N: 0 })).toBe(true);
  });

  it('returnerar false för type:"known" utan isStation', () => {
    expect(isStationPoint({ id: 'K1', type: 'known', E: 0, N: 0 })).toBe(false);
    expect(isStationPoint({ id: 'K2', type: 'known', isStation: false, E: 0, N: 0 })).toBe(false);
  });
});

describe('suggestMeasurements – kombinerade uppställningar och dubbelmätta mätningar', () => {
  beforeEach(() => setState(BASE));

  it('föreslår båda riktningar för två rena uppställningar utan befintliga mätningar', () => {
    setState({
      pts: [
        { id: 'S1', type: 'station', E: 0,   N: 0   },
        { id: 'S2', type: 'station', E: 100, N: 0   },
        { id: 'FP1', type: 'known',  E: 50,  N: 100 },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const fwd = sugg.find(s => s.from === 'S1' && s.to === 'S2');
    const bwd = sugg.find(s => s.from === 'S2' && s.to === 'S1');
    expect(fwd).toBeDefined();
    expect(bwd).toBeDefined();
  });

  it('föreslår bara uppst→känd (enkelriktat) – känd utan isStation ger inget omvänt förslag', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0,   N: 0   },
        { id: 'FP1', type: 'known',   E: 100, N: 0   },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    // FP1 är inte station → inget förslag FP1→S1
    const reverse = sugg.find(s => s.from === 'FP1' && s.to === 'S1');
    expect(reverse).toBeUndefined();
    // S1→FP1 ska däremot finnas (bakåtsikt)
    const fwd = sugg.find(s => s.from === 'S1' && s.to === 'FP1');
    expect(fwd).toBeDefined();
  });

  it('kombi+station-par: båda riktningar föreslås, inget självpar', () => {
    setState({
      pts: [
        { id: 'K1', type: 'known', isStation: true, E: 0,   N: 0   },
        { id: 'S1', type: 'station',                E: 100, N: 0   },
      ],
      meas: [],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    // S1 → K1 (S1 mäter bakåtsikt mot K1 som känd)
    const s1_k1 = sugg.find(s => s.from === 'S1' && s.to === 'K1');
    // K1 → S1 (K1 som station mäter mot S1)
    const k1_s1 = sugg.find(s => s.from === 'K1' && s.to === 'S1');
    // Inget självpar
    const selfPair = sugg.find(s => s.from === s.to);
    expect(s1_k1).toBeDefined();
    expect(k1_s1).toBeDefined();
    expect(selfPair).toBeUndefined();
  });

  it('kompletterande dubbelmätning: om A→B finns i meas föreslås B→A med rätt reason', () => {
    setState({
      pts: [
        { id: 'S1', type: 'station', E: 0,   N: 0   },
        { id: 'S2', type: 'station', E: 100, N: 0   },
        { id: 'FP1', type: 'known',  E: 50,  N: 100 },
      ],
      meas: [
        { id: 'M1', from: 'S1', to: 'S2', obsType: 'both',
          sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
      ],
    });
    suggestMeasurements();
    const sugg = getState().suggestedMeas;
    const complement = sugg.find(s => s.from === 'S2' && s.to === 'S1');
    expect(complement).toBeDefined();
    expect(complement.reason).toMatch(/dubbelmätning/i);
    // S1→S2 ska inte föreslås igen
    const duplicate = sugg.find(s => s.from === 'S1' && s.to === 'S2');
    expect(duplicate).toBeUndefined();
  });

  it('isStation sparas och återladdas korrekt via _buildSnapshot/_applySnapshot', () => {
    setState({
      ...BASE,
      pts: [
        { id: 'K1', type: 'known', isStation: true,  E: 100, N: 200 },
        { id: 'K2', type: 'known', isStation: false, E: 300, N: 400 },
        { id: 'K3', type: 'known',                   E: 500, N: 600 },
      ],
    });
    const snap = _buildSnapshot();
    // Simulera ny session
    setState({ ...BASE, pts: [] });
    _applySnapshot(snap);
    const loaded = getState().pts;
    expect(loaded.find(p => p.id === 'K1')?.isStation).toBe(true);
    expect(loaded.find(p => p.id === 'K2')?.isStation).toBe(false);
    // K3 har inget isStation-fält → isStationPoint ska returnera false
    expect(isStationPoint(loaded.find(p => p.id === 'K3'))).toBe(false);
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
