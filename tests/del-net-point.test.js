// Radering av en nätpunkt som visuella linjer och ytor hänger i
// (Lager-verktyg Etapp 3, ändring efter STOPP 3): bekräftelsen säger hur många
// linjer och ytor som påverkas och vilka som tas bort helt.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const { delPt, delPtConfirmText } = await import('../src/ui/modals.js');
const V = await import('../src/state/visual.js');
const { getState, setState } = await import('../src/state/store.js');

const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '<div id="modal"></div>';
  setState({
    pts: [{ id: 'N1', type: 'known', E: 0, N: 0 }, { id: 'N2', type: 'known', E: 50, N: 0 }],
    meas: [{ id: 'M1', from: 'N1', to: 'N2' }],
    obstacles: [], simResult: null, selObsId: null, selId: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null,
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

// Linje VL1 i N1, yta "Platta" med fyra hörn (ett i N1) och yta "Kil" med tre
// hörn (ett i N1, blockerar sikt).
function scen() {
  const l = V.addVisualLayer({ name: 'L' });
  const p = [[10, 10], [20, 10], [20, 20], [30, 30], [40, 30]]
    .map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
  V.addVisualLine({ from: net('N1'), to: vis(p[0]), layerId: l });
  const platta = V.addVisualArea({ vertices: [net('N1'), vis(p[0]), vis(p[1]), vis(p[2])], layerId: l, name: 'Platta' });
  const kil = V.addVisualArea({ vertices: [net('N1'), vis(p[3]), vis(p[4])], layerId: l, name: 'Kil' });
  V.setVisualAreaBlocksSight(kil, true);
  return { platta, kil };
}

describe('bekräftelsen vid radering av nätpunkt', () => {
  it('räknar mätningar, linjer och ytor och säger vilka som tas bort helt', () => {
    scen();
    const t = delPtConfirmText('N1');
    expect(t).toContain('Ta bort punkt N1?');
    expect(t).toContain('1 mätning tas bort');
    expect(t).toMatch(/1 visuell linje tas bort helt – de saknar då en ändpunkt: VL1/);
    expect(t).toContain('2 ytor påverkas');
    expect(t).toContain('1 tappar hörnet: Platta');
    expect(t).toContain('1 tas bort helt – färre än tre hörn kvar: Kil');
    expect(t).toContain('1 kopplat hinder försvinner');
  });

  it('ingenting annat berörs: ingen fråga', () => {
    setState({ meas: [] });
    expect(delPtConfirmText('N2')).toBeNull();
  });

  it('bara mätningar: frågan nämner dem', () => {
    expect(delPtConfirmText('N2')).toContain('1 mätning tas bort');
  });

  it('Avbryt ändrar ingenting; OK gör det som texten sa', () => {
    const { platta, kil } = scen();
    const spy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    delPt('N1');
    expect(getState().pts).toHaveLength(2);
    expect(getState().visualAreas).toHaveLength(2);
    delPt('N1');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(getState().pts.map(p => p.id)).toEqual(['N2']);
    expect(getState().visualLines).toEqual([]);
    expect(V.findVisualArea(platta).vertices).toHaveLength(3);
    expect(V.findVisualArea(kil)).toBeNull();
    expect(getState().obstacles).toEqual([]);
  });

  it('netPointVisualImpact ändrar inget', () => {
    scen();
    const före = JSON.stringify(getState());
    const v = V.netPointVisualImpact('N1');
    expect([v.linesRemoved.length, v.areasChanged.length, v.areasRemoved.length, v.obstacles]).toEqual([1, 1, 1, 1]);
    expect(JSON.stringify(getState())).toBe(före);
  });
});
