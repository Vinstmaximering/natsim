// Autosparningen tar med hindren.
// – hindren och kopplingen visuell linje → vägg överlever en omladdning
// – autosparningar från före ändringen laddas utan hinder, som förut
// – full lagring ger ett tydligt meddelande, en gång per felperiod
// – storleken för ett projekt med många OSM-byggnader

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getState, setState } from '../src/state/store.js';
import {
  SAVE_KEY, loadAutosave, writeAutosaveNow, _buildAutosaveSnapshot, _isQuotaError,
} from '../src/state/persistence.js';
import { addObstacle } from '../src/state/obstacles.js';
import {
  addVisualLayer, addVisualPt, addVisualLine, makeEndpoint, updateVisualLine,
} from '../src/state/visual.js';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null, centerErr: 1.0, nMid: 1,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1, selObsId: null,
};

const quotaError = () => {
  const e = new Error('The quota has been exceeded.');
  e.name = 'QuotaExceededError';
  e.code = 22;
  return e;
};

beforeEach(() => {
  setState({ ...BASE });
  localStorage.clear();
  document.body.innerHTML = '<div id="autosave-status"></div>';
  document.getElementById('toast')?.remove();
});
afterEach(() => vi.restoreAllMocks());

describe('hindren i autosparningen', () => {
  it('ögonblicksbilden innehåller hindren', () => {
    addObstacle({ type: 'polygon', points: [[0, 0], [10, 0], [10, 10]], label: 'Hus' });
    const s = _buildAutosaveSnapshot();
    expect(s.obstacles).toHaveLength(1);
    expect(s.obstacles[0]).toMatchObject({ type: 'polygon', label: 'Hus' });
  });

  it('hinder och koppling från visuell linje överlever skriv + läs', () => {
    const lid = addVisualLayer({ name: 'L' });
    const a = addVisualPt({ E: 0, N: 0, layerId: lid });
    const b = addVisualPt({ E: 10, N: 0, layerId: lid });
    const vl = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b), layerId: lid });
    const obsId = addObstacle({ type: 'line', points: [[0, 0], [10, 0]], source: 'visual' });
    updateVisualLine(vl, { linkedObsIds: [obsId] });

    expect(writeAutosaveNow().ok).toBe(true);
    setState({ ...BASE });
    expect(loadAutosave()).toBe(true);

    const st = getState();
    expect(st.obstacles.map(o => o.id)).toEqual([obsId]);
    expect(st.visualLines[0].linkedObsIds).toEqual([obsId]);
  });

  it('hinderräknaren synkas – nästa hinder krockar inte med ett laddat', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ver: 2, pts: [], meas: [],
      obstacles: [{ id: 'obs_7', type: 'line', points: [[0, 0], [1, 1]] }],
    }));
    loadAutosave();
    expect(addObstacle({ type: 'line', points: [[2, 2], [3, 3]] })).toBe('obs_8');
  });

  it('autosparning utan obstacles-fält laddas med tomma hinder', () => {
    setState({ obstacles: [{ id: 'obs_1', type: 'line', points: [[0, 0], [1, 1]] }] });
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ver: 2, pts: [], meas: [], centerErr: 1, nMid: 1 }));
    expect(loadAutosave()).toBe(true);
    expect(getState().obstacles).toEqual([]);
  });

  it('trasiga hinder kastas, giltiga behålls och färgen saneras', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ver: 2, pts: [], meas: [],
      obstacles: [
        { id: 'obs_1', type: 'polygon', points: [[0, 0], [1, 0], [1, 1]], color: 'rött' },
        { id: 'obs_2', type: 'cirkel', points: [[0, 0]] },
        { id: 'obs_3', type: 'line', points: [[0, 'x'], [1, 1]] },
        { type: 'line', points: [[0, 0], [1, 1]] },
        null,
      ],
    }));
    loadAutosave();
    const obs = getState().obstacles;
    expect(obs.map(o => o.id)).toEqual(['obs_1']);
    expect(obs[0].color).toBeNull();
  });
});

describe('full lagring', () => {
  // Felperioden är modultillstånd – börja varje fall från en lyckad skrivning.
  beforeEach(() => { writeAutosaveNow(); document.getElementById('toast')?.remove(); });

  it('känner igen webbläsarnas kvotfel', () => {
    expect(_isQuotaError(quotaError())).toBe(true);
    expect(_isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(_isQuotaError({ code: 1014 })).toBe(true);
    expect(_isQuotaError(new Error('annat'))).toBe(false);
  });

  it('ger ett tydligt meddelande och behåller förra autosparningen', () => {
    expect(writeAutosaveNow().ok).toBe(true);
    const förra = localStorage.getItem(SAVE_KEY);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setState({ pts: [{ id: 'P1', type: 'station', E: 1, N: 1 }] });
    const r = writeAutosaveNow();

    expect(r).toMatchObject({ ok: false, quota: true });
    const status = document.getElementById('autosave-status');
    expect(status.textContent).toContain('lagringen full');
    expect(status.classList.contains('val-warn')).toBe(true);
    expect(status.title).toContain('Spara projektet till fil');
    expect(status.title).toContain('en omladdning återställer läget från');
    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('webbläsarens lagring är full');
    vi.restoreAllMocks();
    expect(localStorage.getItem(SAVE_KEY)).toBe(förra);
  });

  it('toasten visas en gång per felperiod, och statusen återställs när det går igen', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quotaError(); });
    writeAutosaveNow();
    document.getElementById('toast').textContent = '';
    writeAutosaveNow();
    expect(document.getElementById('toast').textContent).toBe('');

    spy.mockRestore();
    expect(writeAutosaveNow().ok).toBe(true);
    const status = document.getElementById('autosave-status');
    expect(status.textContent).toContain('Autosparat');
    expect(status.classList.contains('val-warn')).toBe(false);
  });
});

describe('storlek', () => {
  // OSM-byggnader transformerade till SWEREF 99 TM bär full flyttalsprecision
  // (~17 siffror per koordinat), så de är den tunga delen av en autosparning.
  const osmProjekt = (antal, hörn) => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const obstacles = Array.from({ length: antal }, (_, i) => ({
      id: `obs_${i + 1}`, type: 'polygon', label: 'OSM-byggnad', source: 'osm',
      osmId: 100000000 + i, color: null,
      points: Array.from({ length: hörn }, () => [674000 + rnd() * 3000, 6580000 + rnd() * 3000]),
    }));
    return { ...BASE, obstacles };
  };

  it('2 000 byggnader à 10 hörn ryms med god marginal i 5 MB', () => {
    const tecken = JSON.stringify(_buildAutosaveSnapshot(osmProjekt(2000, 10))).length;
    // Uppmätt ≈ 0,98 miljoner tecken (5 000 byggnader ≈ 2,5 miljoner).
    // localStorage rymmer ~5 miljoner tecken per ursprung i Chrome/Edge/
    // Firefox, delat med PM-utkastet m.m.
    expect(tecken).toBeLessThan(1_200_000);
    expect(tecken).toBeGreaterThan(600_000);
  });
});
