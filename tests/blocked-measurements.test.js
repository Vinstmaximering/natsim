// Etapp C: rensa blockerade mätningar.
// – findBlockedMeasurements som delad källa för panel, validering och rensning
// – knappens tillstånd (aktiv/inaktiv + förklarande text)

import { describe, it, expect, beforeEach } from 'vitest';
import { findBlockedMeasurements } from '../src/core/visibility.js';
import { renderClearBlockedButton } from '../src/ui/right-panel.js';
import { validateNetwork } from '../src/ui/validation.js';
import { getState, setState } from '../src/state/store.js';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  activeCRS: 'sweref99tm', centerErr: 1.0, defaultInstr: 'ts16_1',
  nMid: 1, nId: 1, au: 'grad',
};

// S1 i origo, tre mål rakt österut. Väggen står tvärs över sikten mot B1 och B2.
const PTS = [
  { id: 'S1', type: 'station', E: 0,   N: 0 },
  { id: 'A1', type: 'new',     E: 10,  N: 0 },
  { id: 'B1', type: 'new',     E: 100, N: 0 },
  { id: 'B2', type: 'new',     E: 200, N: 0 },
];

const WALL = {
  id: 'obs_1', type: 'line', label: 'Vägg', source: 'manual',
  points: [[50, -50], [50, 50]],
};

const MEAS = [
  { id: 'M1', from: 'S1', to: 'A1' },   // fri sikt
  { id: 'M2', from: 'S1', to: 'B1' },   // blockerad
  { id: 'M3', from: 'S1', to: 'B2' },   // blockerad
];

describe('findBlockedMeasurements', () => {
  it('hittar mätningar vars sikte skärs av en vägg', () => {
    const blocked = findBlockedMeasurements(MEAS, PTS, [WALL]);
    expect(blocked.map(b => b.meas.id)).toEqual(['M2', 'M3']);
  });

  it('rapporterar vilket hinder som blockerar', () => {
    const blocked = findBlockedMeasurements(MEAS, PTS, [WALL]);
    expect(blocked[0].blockedBy).toBe('obs_1');
  });

  it('ger tom lista utan hinder', () => {
    expect(findBlockedMeasurements(MEAS, PTS, [])).toEqual([]);
  });

  it('ger tom lista utan mätningar', () => {
    expect(findBlockedMeasurements([], PTS, [WALL])).toEqual([]);
  });

  it('hoppar över mätningar vars punkter saknas i stället för att rensa dem', () => {
    const orphan = [{ id: 'M9', from: 'S1', to: 'FINNS_EJ' }];
    expect(findBlockedMeasurements(orphan, PTS, [WALL])).toEqual([]);
  });

  it('tål anrop helt utan argument', () => {
    expect(findBlockedMeasurements()).toEqual([]);
  });

  it('en byggnad blockerar sikt tvärs igenom', () => {
    const house = {
      id: 'obs_2', type: 'polygon', label: 'Hus',
      points: [[50, -20], [70, -20], [70, 20], [50, 20]],
    };
    const blocked = findBlockedMeasurements(MEAS, PTS, [house]);
    expect(blocked.map(b => b.meas.id)).toEqual(['M2', 'M3']);
  });
});

describe('validateNetwork använder samma källa', () => {
  beforeEach(() => setState({ ...BASE }));

  it('rapporterar blockerade mätningar i valideringen', () => {
    setState({
      pts: PTS, meas: MEAS, obstacles: [WALL],
      simResult: { ok: true, K_global: 0.5, redund: [], ptResults: [] },
    });
    const v = validateNetwork();
    const issue = v.issues.find(i => i.includes('saknar siktlinje'));
    expect(issue).toBeDefined();
    expect(issue).toContain('2 mätning(ar)');
    expect(issue).toContain('S1→B1 (obs_1)');
  });
});

describe('renderClearBlockedButton', () => {
  beforeEach(() => setState({ ...BASE }));

  it('är aktiv och visar antalet när mätningar är blockerade', () => {
    setState({ pts: PTS, meas: MEAS, obstacles: [WALL] });
    const html = renderClearBlockedButton();
    expect(html).toContain('Ta bort 2 blockerade mätningar');
    expect(html).toContain('window._clearBlockedMeas()');
    expect(html).not.toContain('disabled');
  });

  it('böjer entalsformen rätt', () => {
    setState({ pts: PTS, meas: [MEAS[1]], obstacles: [WALL] });
    expect(renderClearBlockedButton()).toContain('Ta bort 1 blockerad mätning');
  });

  it('är inaktiv utan hinder, med förklaring', () => {
    setState({ pts: PTS, meas: MEAS, obstacles: [] });
    const html = renderClearBlockedButton();
    expect(html).toContain('disabled');
    expect(html).toContain('Inga hinder utplacerade');
  });

  it('är inaktiv utan mätningar, med förklaring', () => {
    setState({ pts: PTS, meas: [], obstacles: [WALL] });
    const html = renderClearBlockedButton();
    expect(html).toContain('disabled');
    expect(html).toContain('Inga mätningar att kontrollera');
  });

  it('är inaktiv när allt har fri sikt, med förklaring', () => {
    setState({ pts: PTS, meas: [MEAS[0]], obstacles: [WALL] });
    const html = renderClearBlockedButton();
    expect(html).toContain('disabled');
    expect(html).toContain('Alla mätningar har fri sikt');
  });
});

describe('borttagningen', () => {
  beforeEach(() => setState({ ...BASE }));

  // Knapphandlaren sitter på window och kräver DOM + confirm; här testas
  // urvalslogiken den bygger på, så att rätt mätningar och bara de tas bort.
  it('behåller mätningar med fri sikt', () => {
    const ids = new Set(findBlockedMeasurements(MEAS, PTS, [WALL]).map(b => b.meas.id));
    const kvar = MEAS.filter(m => !ids.has(m.id));
    expect(kvar.map(m => m.id)).toEqual(['M1']);
  });

  it('en flyttad vägg ändrar vilka mätningar som är blockerade', () => {
    const moved = { ...WALL, points: [[150, -50], [150, 50]] };
    const blocked = findBlockedMeasurements(MEAS, PTS, [moved]);
    expect(blocked.map(b => b.meas.id)).toEqual(['M3']);
  });
});
