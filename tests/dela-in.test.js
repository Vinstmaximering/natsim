// Polylinjer Etapp 5: Dela in i punkter – polylinje, sluten polylinje, yta
// och cirkel. Handräknade lägen.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const V = await import('../src/state/visual.js');
const D = await import('../src/state/divide.js');
const UI = await import('../src/ui/divide-dialog.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo, getUndoStack } = await import('../src/state/undo.js');

const NBSP = ' ';
const vis = id => V.makeEndpoint('visual', id);

beforeEach(() => {
  document.body.innerHTML = '<div id="modal" style="display:none"><div id="mi"></div></div>';
  setState({
    pts: [], meas: [], obstacles: [], selObsId: null,
    visualPts: [], visualLines: [], visualAreas: [], visualCircles: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, nVcid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

const lager = () => V.addVisualLayer({ name: 'L' });
function linje(coords, closed = false) {
  const lay = lager();
  const h = coords.map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
  return V.addVisualLine({ vertices: h.map(vis), closed, layerId: lay, name: 'Kant' });
}
const lägen = (id, o) => D.divisionPositions(D.divideSource(id), o).positions
  .map(p => [Number(p.E.toFixed(6)), Number(p.N.toFixed(6))]);

describe('cirkel', () => {
  const cirkel = () => { lager(); return V.addVisualCircle({ center: { E: 100, N: 100 }, radius: 10 }); };

  it('8 punkter: var 50:e gon från norr, på den exakta cirkeln', () => {
    const id = cirkel();
    const r = D.divisionPositions(D.divideSource(id), { mode: 'count', count: 8, startGon: 0 });
    expect(r.spacingGon).toBeCloseTo(50, 12);
    expect(r.spacing).toBeCloseTo(2 * Math.PI * 10 / 8, 12);
    const s = Math.SQRT1_2 * 10;
    const förv = [[0, 10], [s, s], [10, 0], [s, -s], [0, -10], [-s, -s], [-10, 0], [-s, s]];
    r.positions.forEach((p, i) => {
      expect(p.E).toBeCloseTo(100 + förv[i][0], 9);
      expect(p.N).toBeCloseTo(100 + förv[i][1], 9);
      expect(Math.hypot(p.E - 100, p.N - 100)).toBeCloseTo(10, 12);   // på cirkeln, inte polygonen
    });
    expect(UI.divideSummary(D.divideSource(id), { mode: 'count', count: 8, prefix: 'P' }).text)
      .toBe(`8 punkter P1–P8 · delning 50,0000${NBSP}gon (7,854${NBSP}m båge)`);
  });

  it('startvinkel 25 gon: första punkten i riktningen 25 gon från centrum', () => {
    const id = cirkel();
    const [p] = D.divisionPositions(D.divideSource(id), { mode: 'count', count: 4, startGon: 25 }).positions;
    // 25 gon = π/8 rad: E = 100 + 10·sin(π/8) = 103,826834, N = 100 + 10·cos(π/8) = 109,238795
    expect(p.E).toBeCloseTo(103.826834, 6);
    expect(p.N).toBeCloseTo(109.238795, 6);
  });

  it('fast avstånd längs bågen: rest till startpunkten', () => {
    const id = cirkel();
    const r = D.divisionPositions(D.divideSource(id), { mode: 'distance', distance: 20, startGon: 0 });
    expect(r.positions).toHaveLength(4);                 // 0, 20, 40, 60 av 62,832 m
    expect(r.rest).toBeCloseTo(2 * Math.PI * 10 - 60, 9);
  });
});

describe('öppen polylinje', () => {
  // (0,0) → (10,0) → (10,5): längd 15 m.
  const kant = () => linje([[0, 0], [10, 0], [10, 5]]);

  it('fast avstånd 4 m med rest 3 m; slutpunkten med eller inte', () => {
    const id = kant();
    expect(lägen(id, { mode: 'distance', distance: 4 })).toEqual([[0, 0], [4, 0], [8, 0], [10, 2], [10, 5]]);
    expect(lägen(id, { mode: 'distance', distance: 4, includeEnd: false })).toEqual([[0, 0], [4, 0], [8, 0], [10, 2]]);
    expect(lägen(id, { mode: 'distance', distance: 4, includeStart: false, includeEnd: false }))
      .toEqual([[4, 0], [8, 0], [10, 2]]);
    const r = D.divisionPositions(D.divideSource(id), { mode: 'distance', distance: 4 });
    expect(r.rest).toBeCloseTo(3, 12);
    expect(UI.divideSummary(D.divideSource(id), { mode: 'distance', distance: 4, prefix: 'K' }).text)
      .toBe(`5 punkter K1–K5 · delning 4,000${NBSP}m · rest 3,000${NBSP}m`);
  });

  it('jämn delning utan rest: slutpunkten upprepas inte', () => {
    const id = kant();
    expect(lägen(id, { mode: 'distance', distance: 5 })).toEqual([[0, 0], [5, 0], [10, 0], [10, 5]]);
  });

  it('antal 4: start och slut med, bara start, bara slut, ingen', () => {
    const id = kant();
    expect(lägen(id, { mode: 'count', count: 4 })).toEqual([[0, 0], [5, 0], [10, 0], [10, 5]]);
    expect(lägen(id, { mode: 'count', count: 4, includeEnd: false })).toEqual([[0, 0], [3.75, 0], [7.5, 0], [10, 1.25]]);
    expect(lägen(id, { mode: 'count', count: 4, includeStart: false })).toEqual([[3.75, 0], [7.5, 0], [10, 1.25], [10, 5]]);
    expect(lägen(id, { mode: 'count', count: 4, includeStart: false, includeEnd: false }))
      .toEqual([[3, 0], [6, 0], [9, 0], [10, 2]]);
  });

  it('ogiltiga värden', () => {
    const src = D.divideSource(kant());
    expect(D.divisionPositions(src, { mode: 'count', count: 0 }).error).toBe('count');
    expect(D.divisionPositions(src, { mode: 'count', count: 2.5 }).error).toBe('count');
    expect(D.divisionPositions(src, { mode: 'distance', distance: 0 }).error).toBe('distance');
    expect(D.divisionPositions(src, { mode: 'distance', distance: 0.0001 }).error).toBe('many');
    expect(UI.divideSummary(src, { mode: 'count', count: 0 }).ok).toBe(false);
  });
});

describe('sluten polylinje och yta', () => {
  const rekt = [[0, 0], [10, 0], [10, 6], [0, 6]];   // omkrets 32 m

  it('sluten polylinje: 4 punkter var 8:e meter från första hörnet, runt', () => {
    const id = linje(rekt, true);
    expect(lägen(id, { mode: 'count', count: 4 })).toEqual([[0, 0], [8, 0], [10, 6], [2, 6]]);
  });

  it('fast avstånd 10 m: 0, 10, 20, 30 – rest 2 m tillbaka till start', () => {
    const id = linje(rekt, true);
    const r = D.divisionPositions(D.divideSource(id), { mode: 'distance', distance: 10 });
    expect(r.positions.map(p => [p.E, p.N])).toEqual([[0, 0], [10, 0], [6, 6], [0, 2]]);
    expect(r.rest).toBeCloseTo(2, 12);
  });

  it('yta: samma som sluten linje', () => {
    const lay = lager();
    const h = rekt.map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
    const id = V.addVisualArea({ vertices: h.map(vis), layerId: lay });
    expect(lägen(id, { mode: 'count', count: 4 })).toEqual([[0, 0], [8, 0], [10, 6], [2, 6]]);
  });
});

describe('skapa – dialogen', () => {
  it('fria punkter i aktivt lager med prefix och löpnummer; ett ångra-steg', () => {
    lager();
    const id = V.addVisualCircle({ center: { E: 100, N: 100 }, radius: 10, name: 'Brunn' });
    const mål = V.addVisualLayer({ name: 'Mål' });
    V.setActiveVisualLayer(mål);
    UI.openDivideDialog(id);
    const mi = document.getElementById('mi');
    expect(mi.textContent).toContain('cirkel Brunn');
    const count = mi.querySelector('.dv-count');
    count.value = '8';
    count.dispatchEvent(new Event('input', { bubbles: true }));
    const pre = mi.querySelector('.dv-prefix');
    pre.value = 'B';
    pre.dispatchEvent(new Event('input', { bubbles: true }));
    expect(mi.querySelector('.dv-sum').textContent).toContain('8 punkter B1–B8');
    const före = getUndoStack().length;
    document.getElementById('dv-ok').click();
    expect(getUndoStack().length).toBe(före + 1);
    const pts = getState().visualPts;
    expect(pts.map(p => p.name)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
    expect(pts.every(p => p.role === 'point' && p.layerId === mål && p.H === null)).toBe(true);
    expect(getState().visualCircles).toHaveLength(1);      // cirkeln rörs inte
    undo();
    expect(getState().visualPts).toEqual([]);
  });

  it('ett ogiltigt värde stänger av Skapa', () => {
    const id = linje([[0, 0], [10, 0]]);
    UI.openDivideDialog(id);
    const mi = document.getElementById('mi');
    const count = mi.querySelector('.dv-count');
    count.value = '0';
    count.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('dv-ok').disabled).toBe(true);
    expect(mi.querySelector('.dv-sum').textContent).toContain('minst 1');
  });

  it('öppen linje visar start/slut-valen, sluten linje gör det inte', () => {
    UI.openDivideDialog(linje([[0, 0], [10, 0]]));
    expect(document.querySelector('#mi .dv-s')).not.toBeNull();
    UI.openDivideDialog(linje([[0, 0], [10, 0], [10, 6]], true));
    expect(document.querySelector('#mi .dv-s')).toBeNull();
    expect(document.getElementById('mi').textContent).toContain('start- och slutpunkt sammanfaller');
  });
});
