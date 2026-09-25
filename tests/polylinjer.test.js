// Polylinjer Etapp 1: en visuell linje är en polylinje med hörn i ordning,
// öppen eller sluten. Modell, hörn som försvinner, hinder per segment,
// markering, snappning och åtgärder på markeringen.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const V = await import('../src/state/visual.js');
const SEL = await import('../src/state/visual-selection.js');
const { findSnapTarget } = await import('../src/map/snap.js');
const { hitTestVisualLine } = await import('../src/map/visual-canvas.js');
const { delPt, delPtConfirmText } = await import('../src/ui/modals.js');
const { getState, setState } = await import('../src/state/store.js');
const { saveUndo, undo } = await import('../src/state/undo.js');
const { findBlockedMeasurements } = await import('../src/core/visibility.js');

const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '<div id="modal"></div>';
  setState({
    pts: [{ id: 'N1', type: 'known', E: 100, N: 0 }, { id: 'N2', type: 'known', E: 0, N: 100 }],
    meas: [], obstacles: [], simResult: null, selObsId: null, selId: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

// Hörnpunkter (role 'vertex') i lagret L.
function hörn(lay, ...koord) {
  return koord.map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
}
// Linje (0,0) → N1 (100,0) → (100,100) → (200,100).
function linje(extra = {}) {
  const lay = V.addVisualLayer({ name: 'L' });
  const [a, c, d] = hörn(lay, [0, 0], [100, 100], [200, 100]);
  const id = V.addVisualLine({ vertices: [vis(a), net('N1'), vis(c), vis(d)], layerId: lay, ...extra });
  return { lay, id, a, c, d };
}
const coords = id => V.visualLineCoords(V.findVisualLine(id));

describe('modell', () => {
  it('hörn i ordning, öppen, utan hinder och med löpande id', () => {
    const { id } = linje();
    expect(id).toBe('VL1');
    expect(V.findVisualLine(id)).toMatchObject({ closed: false, linkedObsIds: [], color: null });
    expect(coords(id)).toEqual([[0, 0], [100, 0], [100, 100], [200, 100]]);
    expect(V.visualLineSegments(V.findVisualLine(id))).toHaveLength(3);
  });

  it('upprepade grannhörn slås ihop; första hörnet upprepat sist ger en sluten linje', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a, b, c] = hörn(lay, [0, 0], [10, 0], [10, 10]);
    const id = V.addVisualLine({ vertices: [vis(a), vis(b), vis(b), vis(c), vis(a)], layerId: lay });
    const l = V.findVisualLine(id);
    expect(l.vertices.map(v => v.id)).toEqual([a, b, c]);
    expect(l.closed).toBe(true);
    expect(V.visualLineSegments(l)).toHaveLength(3);
  });

  it('sluten kräver tre hörn; färre än två skilda hörn ger ingen linje', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a, b] = hörn(lay, [0, 0], [10, 0]);
    expect(V.findVisualLine(V.addVisualLine({ vertices: [vis(a), vis(b)], closed: true })).closed).toBe(false);
    expect(V.addVisualLine({ vertices: [vis(a), vis(a)] })).toBeNull();
    expect(V.addVisualLine({ vertices: [vis(a)] })).toBeNull();
  });

  it('{from, to} är en förkortning för två hörn', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a, b] = hörn(lay, [0, 0], [10, 0]);
    const l = V.findVisualLine(V.addVisualLine({ from: vis(a), to: vis(b) }));
    expect(l.vertices).toEqual([vis(a), vis(b)]);
  });

  it('namn sätts och tas bort; tomt namn försvinner ur objektet', () => {
    const { id } = linje({ name: '  Kantbalk N ' });
    expect(V.findVisualLine(id).name).toBe('Kantbalk N');
    V.updateVisualLine(id, { name: '' });
    expect('name' in V.findVisualLine(id)).toBe(false);
  });

  it('visualLayerPositions tar med mitthörnen, också nätpunkten', () => {
    const { lay } = linje();
    const lägen = V.visualLayerPositions(lay).map(p => `${p.E},${p.N}`).sort();
    expect(lägen).toEqual(['0,0', '100,0', '100,100', '200,100']);
  });

  it('lagret räknar polylinjer, inte segment', () => {
    const { lay } = linje();
    expect(V.visualLayerCounts(lay)).toEqual({ pts: 0, lines: 1, areas: 0, circles: 0 });
  });
});

describe('ett hörn försvinner', () => {
  it('nätpunkt som mitthörn: gapet sluts', () => {
    const { id } = linje();
    V.dropNetPointFromVisual('N1');
    expect(coords(id)).toEqual([[0, 0], [100, 100], [200, 100]]);
  });

  it('fri punkt som mitthörn följer samma regel', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const fri = V.addVisualPt({ E: 50, N: 50, layerId: lay });
    const [a, b] = hörn(lay, [0, 0], [100, 0]);
    const id = V.addVisualLine({ vertices: [vis(a), vis(fri), vis(b)], layerId: lay });
    expect(V.removeVisualPt(fri)).toBe(0);
    expect(coords(id)).toEqual([[0, 0], [100, 0]]);
  });

  it('under två hörn tas linjen bort', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a] = hörn(lay, [0, 0]);
    V.addVisualLine({ vertices: [vis(a), net('N1')], layerId: lay });
    expect(V.dropNetPointFromVisual('N1')).toMatchObject({ lines: 1, linesChanged: 0 });
    expect(getState().visualLines).toEqual([]);
  });

  it('en sluten linje med två hörn kvar blir öppen', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a, b] = hörn(lay, [0, 0], [100, 100]);
    const id = V.addVisualLine({ vertices: [vis(a), net('N1'), vis(b)], closed: true, layerId: lay });
    V.dropNetPointFromVisual('N1');
    expect(V.findVisualLine(id)).toMatchObject({ closed: false });
    expect(coords(id)).toEqual([[0, 0], [100, 100]]);
  });

  it('hörn som blir grannar med sig själva slås ihop', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a, b] = hörn(lay, [0, 0], [50, 50]);
    const id = V.addVisualLine({ vertices: [vis(a), net('N1'), vis(a), vis(b)], layerId: lay });
    V.dropNetPointFromVisual('N1');
    expect(V.findVisualLine(id).vertices.map(v => v.id)).toEqual([a, b]);
  });

  it('bekräftelsen redovisar linjer som ändras och som tas bort', () => {
    linje({ name: 'Kant' });
    const lay = getState().visualLayers[0].id;
    const [x] = hörn(lay, [5, 5]);
    V.addVisualLine({ vertices: [vis(x), net('N1')], layerId: lay, name: 'Kort' });
    const t = delPtConfirmText('N1');
    expect(t).toContain('2 visuella linjer påverkas');
    expect(t).toContain('1 tappar hörnet och sluter gapet: Kant');
    expect(t).toContain('1 tas bort helt – färre än två hörn kvar: Kort');
  });

  it('delPt: linjen tappar hörnet, ett ångra-steg återställer', () => {
    const { id } = linje();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    delPt('N1');
    expect(coords(id)).toEqual([[0, 0], [100, 100], [200, 100]]);
    undo();
    expect(coords(id)).toEqual([[0, 0], [100, 0], [100, 100], [200, 100]]);
  });

  it('removeVisualLine tar bort linjens egna hörn men inte fria punkter eller nätpunkter', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const fri = V.addVisualPt({ E: 50, N: 50, layerId: lay });
    const [a] = hörn(lay, [0, 0]);
    const id = V.addVisualLine({ vertices: [vis(a), vis(fri), net('N1')], layerId: lay });
    V.removeVisualLine(id);
    expect(getState().visualPts.map(p => p.id)).toEqual([fri]);
    expect(getState().pts).toHaveLength(2);
  });

  it('removeVisualObjects: en markerad fri punkt tar sig ur andra linjer', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const fri = V.addVisualPt({ E: 50, N: 50, layerId: lay });
    const [a, b] = hörn(lay, [0, 0], [100, 0]);
    V.addVisualLine({ vertices: [vis(a), vis(fri), vis(b)], layerId: lay });
    V.addVisualLine({ vertices: [vis(fri), vis(a)], layerId: lay });
    expect(V.linesAfterPointRemoval([`visual:${fri}`]).linesChanged).toHaveLength(1);
    const n = V.removeVisualObjects([fri]);
    expect(n).toMatchObject({ pts: 1, extraLines: 1, changedLines: 1 });
    expect(getState().visualLines).toHaveLength(1);
  });
});

describe('hinder per segment', () => {
  const obs = () => getState().obstacles;

  it('"Använd som vägg": ett linjehinder per segment, i ordning, med etikett k/n', () => {
    const { id } = linje();
    expect(V.linkVisualLineObstacles(id, 'wall')).toBe(3);
    const l = V.findVisualLine(id);
    expect(l.linkedObsIds).toEqual(obs().map(o => o.id));
    expect(obs().map(o => o.points)).toEqual(V.visualLineSegments(l));
    expect(obs().map(o => o.label)).toEqual(['Vägg (VL1) 1/3', 'Vägg (VL1) 2/3', 'Vägg (VL1) 3/3']);
    expect(obs().every(o => o.type === 'line' && o.source === 'visual' && o.color === '#8aa8c0')).toBe(true);
  });

  it('ett segment: etiketten utan k/n, som förut', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const [a] = hörn(lay, [0, 0]);
    const id = V.addVisualLine({ vertices: [vis(a), net('N1')], layerId: lay });
    V.linkVisualLineObstacles(id, 'blocker');
    expect(id).toBe('VL1');
    expect(obs()[0]).toMatchObject({ label: 'Blockeringslinje (VL1)', color: '#ef5350' });
  });

  it('blockerar sikt längs alla segment, inte bara det första', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    // Siktlinjen korsar bara tredje segmentet (100,100)–(200,100).
    const pts = [{ id: 'A', E: 150, N: 50 }, { id: 'B', E: 150, N: 150 }];
    expect(findBlockedMeasurements([{ id: 'M', from: 'A', to: 'B' }], pts, obs())).toHaveLength(1);
  });

  it('sluten linje: även slutsegmentet blir ett hinder', () => {
    const { id } = linje({ closed: true });
    expect(V.linkVisualLineObstacles(id)).toBe(4);
    expect(obs()[3].points).toEqual([[200, 100], [0, 0]]);
  });

  it('flyttat hörn drar med sig sina två segmenthinder', () => {
    const { id, c } = linje();
    V.linkVisualLineObstacles(id);
    V.updateVisualPt(c, { E: 110, N: 90 });
    expect(obs()[1].points).toEqual([[100, 0], [110, 90]]);
    expect(obs()[2].points).toEqual([[110, 90], [200, 100]]);
  });

  it('ett segmenthinder raderat i hinderpanelen: linjen kopplas loss, övriga tas bort', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    setState({ obstacles: obs().filter((_, i) => i !== 1) });
    V.syncLinkedObstacles();
    expect(V.findVisualLine(id).linkedObsIds).toEqual([]);
    expect(obs()).toEqual([]);
  });

  it('färre segment: sista hindret tas bort och etiketterna räknas om', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    const [o1, o2] = V.findVisualLine(id).linkedObsIds;
    V.dropNetPointFromVisual('N1');
    const l = V.findVisualLine(id);
    expect(l.linkedObsIds).toEqual([o1, o2]);
    expect(obs().map(o => o.points)).toEqual(V.visualLineSegments(l));
    expect(obs().map(o => o.label)).toEqual(['Vägg (VL1) 1/2', 'Vägg (VL1) 2/2']);
  });

  it('fler segment: nya hinder läggs efter gruppen, med samma färg', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id, 'blocker');
    V.updateVisualLine(id, { closed: true });
    const l = V.findVisualLine(id);
    expect(l.linkedObsIds).toHaveLength(4);
    expect(obs().map(o => o.id)).toEqual(l.linkedObsIds);
    expect(obs()[3]).toMatchObject({ points: [[200, 100], [0, 0]], color: '#ef5350', label: 'Blockeringslinje (VL1) 4/4' });
  });

  it('koppla loss: hindren blir fristående och står kvar', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    V.unlinkVisualLineObstacles(id);
    expect(V.findVisualLine(id).linkedObsIds).toEqual([]);
    expect(obs()).toHaveLength(3);
  });

  it('borttagen linje tar alla sina hinder med sig; ångra återställer', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    saveUndo('ta bort');
    V.removeVisualLine(id);
    expect(obs()).toEqual([]);
    undo();
    expect(obs()).toHaveLength(3);
    expect(V.findVisualLine(id).linkedObsIds).toHaveLength(3);
  });

  it('lagret och markeringen räknar hindren per segment', () => {
    const { id } = linje();
    V.linkVisualLineObstacles(id);
    expect(V.netPointVisualImpact('N1').obstacles).toBe(0);   // linjen ändras, tas inte bort
  });
});

describe('markering och snappning', () => {
  const project = (E, N) => ({ x: E, y: -N });
  const map = { latLngToContainerPoint: ([N, E]) => ({ x: E, y: -N }) };
  const ENtoLatLng = (E, N) => [N, E];

  it('klick på ett segment markerar hela polylinjen', () => {
    const { id } = linje();
    expect(hitTestVisualLine(150, -100, getState(), map, ENtoLatLng)?.id).toBe(id);
    expect(hitTestVisualLine(50, -50, getState(), map, ENtoLatLng)).toBeNull();
  });

  it('sluten linje: slutsegmentet går att träffa', () => {
    const { id } = linje({ closed: true });
    expect(hitTestVisualLine(100, -50, getState(), map, ENtoLatLng)?.id).toBe(id);
  });

  it('område, helt inuti: alla hörn måste ligga i rektangeln', () => {
    const { id } = linje();
    expect(SEL.objectsInRect(getState(), { x0: -10, y0: 10, x1: 150, y1: -150 }, 'window', project)).toEqual([]);
    expect(SEL.objectsInRect(getState(), { x0: -10, y0: 10, x1: 210, y1: -150 }, 'window', project)).toEqual([id]);
  });

  it('område, korsade: ett segment räcker', () => {
    const { id } = linje();
    expect(SEL.objectsInRect(getState(), { x0: 140, y0: -90, x1: 160, y1: -110 }, 'crossing', project)).toEqual([id]);
  });

  it('snappning mot linje: närmaste punkt på närmaste segment', () => {
    linje({ name: 'Kant' });
    const t = findSnapTarget(getState(), 150, -104, project, 10);
    expect(t).toMatchObject({ kind: 'line', E: 150, N: 100, label: 'på linje Kant' });
  });

  it('flytta till lager: linjen med alla sina egna hörn', () => {
    const { id, a, c, d } = linje();
    const annat = V.addVisualLayer({ name: 'Annat' });
    V.moveVisualToLayer([id], annat);
    expect(V.findVisualLine(id).layerId).toBe(annat);
    expect([a, c, d].map(p => V.findVisualPt(p).layerId)).toEqual([annat, annat, annat]);
  });

  it('dölj namn: linjen och dess hörn', () => {
    const { id, a } = linje();
    V.setVisualLabelsHidden([id], true);
    expect(V.findVisualLine(id).hideLabel).toBe(true);
    expect(V.findVisualPt(a).hideLabel).toBe(true);
    V.setVisualLabelsHidden([id], false);
    expect('hideLabel' in V.findVisualLine(id)).toBe(false);
  });
});

describe('sparas och laddas', () => {
  it('nya formen sparas med visualVer och laddas oförändrad', async () => {
    const { _buildSnapshot, _applySnapshot } = await import('../src/io/export-project.js');
    const { id } = linje({ name: 'Kant', closed: true });
    V.linkVisualLineObstacles(id);
    const före = JSON.parse(JSON.stringify(getState().visualLines));
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    expect(snap.visualVer).toBe(2);
    _applySnapshot(snap);
    expect(getState().visualLines).toEqual(före);
    expect(getState().obstacles).toHaveLength(4);
  });

  it('en visuell punkt med H = 0 i den nya formen behåller 0', async () => {
    const { _applySnapshot } = await import('../src/io/export-project.js');
    _applySnapshot({ ver: 3, visualVer: 2, pts: [], meas: [], obstacles: [],
      visualPts: [{ id: 'V1', E: 0, N: 0, H: 0 }, { id: 'V2', E: 1, N: 0, H: null }] });
    expect(getState().visualPts.map(p => p.H)).toEqual([0, null]);
  });
});
