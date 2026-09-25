// Polylinjer Etapp 5: cirklar – modell, verktyget C, kortet, radering,
// sparande, markering, snappning och export.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({
  map: {
    latLngToContainerPoint: ll => Array.isArray(ll) ? { x: ll[1], y: -ll[0] } : { x: ll.lng, y: -ll.lat },
    dragging: { enable() {}, disable() {} },
    getContainer: () => ({ style: {} }),
  },
  ENtoLatLng: (E, N) => [N, E],
  latLngToEN: ll => ({ E: ll.lng, N: ll.lat }),
  draw: vi.fn(), resize: vi.fn(), toggleMapLayer: vi.fn(), fitViewToENBounds: vi.fn(),
}));

const V = await import('../src/state/visual.js');
const A = await import('../src/state/arc-tolerance.js');
const C = await import('../src/map/circle-tool.js');
const UI = await import('../src/ui/circle-card.js');
const SEL = await import('../src/state/visual-selection.js');
const S = await import('../src/map/snap.js');
const X = await import('../src/io/export-visual-geo.js');
const { parseGeo } = await import('../src/io/parse-geo.js');
const { delPtConfirmText } = await import('../src/ui/modals.js');
const { setTool, MAP_TOOLS } = await import('../src/ui/toolbar.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo, getUndoStack, saveUndo } = await import('../src/state/undo.js');
const { _buildSnapshot, _applySnapshot } = await import('../src/io/export-project.js');

const NBSP = ' ';

beforeEach(() => {
  localStorage.removeItem('natsim_arc_tol');
  A._reloadArcTolerance();
  localStorage.removeItem(S.SNAP_KEY);
  S._reloadSnapSetting();
  C.cancelCircleTool();
  document.body.innerHTML = '<div id="circle-card" hidden></div><div id="circle-box" hidden></div>'
    + '<div id="modal"></div><div id="mtb"></div><div id="hint"></div>';
  setState({
    tool: 'pan', measFrom: null, activeCRS: 'sweref991545',
    pts: [{ id: 'FP1', type: 'known', E: 100, N: 100, H: 10 }], meas: [], obstacles: [], selObsId: null,
    visualPts: [], visualLines: [], visualAreas: [], visualCircles: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, nVcid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

const cirkel = (over = {}) => V.addVisualCircle({ center: { ref: 'net', id: 'FP1' }, radius: 10, ...over });

describe('modell', () => {
  it('lagras exakt: centrum och radie, id VC1, i aktivt lager', () => {
    const id = cirkel({ name: ' Brunn ' });
    expect(id).toBe('VC1');
    expect(V.findVisualCircle(id)).toMatchObject({ center: { ref: 'net', id: 'FP1' }, radius: 10, name: 'Brunn' });
    expect(V.findVisualCircle(id).layerId).toBe(getState().activeVisualLayerId);
    expect(V.addVisualCircle({ center: { E: 0, N: 0 }, radius: 0 })).toBeNull();
    expect(V.addVisualCircle({ center: null, radius: 5 })).toBeNull();
  });

  it('polygonen: första hörnet i norr, medurs, avvikelse inom toleransen', () => {
    const id = cirkel();
    const c = V.visualCircleCoords(V.findVisualCircle(id));
    expect(c).toHaveLength(A.circleVertexCount(10));
    expect(c[0][0]).toBeCloseTo(100, 12);
    expect(c[0][1]).toBeCloseTo(110, 12);
    expect(c[1][0]).toBeGreaterThan(100);                  // medurs: österut från norr
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(10 - Math.hypot(m[0] - 100, m[1] - 100)).toBeLessThanOrEqual(0.001 + 1e-12);
    }
    A.setArcTolerance(0.01);
    expect(V.visualCircleCoords(V.findVisualCircle(id)).length).toBeLessThan(c.length);
  });

  it('centrum i en nätpunkt följer punkten', () => {
    const id = cirkel();
    setState({ pts: [{ id: 'FP1', type: 'known', E: 200, N: 50 }] });
    expect(V.circleCenter(V.findVisualCircle(id))).toMatchObject({ E: 200, N: 50 });
  });

  it('nätpunkten tas bort: cirkeln stannar kvar där den var', () => {
    const id = cirkel({ name: 'Brunn' });
    expect(delPtConfirmText('FP1')).toContain('1 cirkel har punkten som centrum och stannar kvar där den är: Brunn');
    V.dropNetPointFromVisual('FP1');
    expect(V.findVisualCircle(id).center).toEqual({ E: 100, N: 100 });
  });

  it('en visuell centrumpunkt tas bort: samma sak', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const p = V.addVisualPt({ E: 5, N: 6, layerId: lay });
    const id = V.addVisualCircle({ center: V.makeEndpoint('visual', p), radius: 2 });
    V.removeVisualPt(p);
    expect(V.findVisualCircle(id).center).toEqual({ E: 5, N: 6 });
  });

  it('namnbyte på nätpunkten följs', () => {
    const id = cirkel();
    V.renameNetPointInVisual('FP1', 'FP9');
    expect(V.findVisualCircle(id).center).toEqual({ ref: 'net', id: 'FP9' });
  });
});

describe('verktyget C', () => {
  const klick = (E, N) => C.handleCircleClick({ lat: N, lng: E });

  it('finns i verktygsraden och den mobila raden med kortkommandot C', () => {
    expect(MAP_TOOLS.find(t => t.tool === 'visual-circle')).toMatchObject({ key: 'c', btn: 'btn-visual-circle' });
    setTool('visual-circle');
    expect(C.isCircleTool()).toBe(true);
  });

  it('centrum snappar mot nätpunkten; en punkt på cirkeln ger radien; ett ångra-steg', () => {
    setTool('visual-circle');
    const före = getUndoStack().length;
    klick(102, 101);                                  // snappar mot FP1
    expect(C.getCircleCenter()).toMatchObject({ ref: 'net', id: 'FP1' });
    klick(109, 112);                                  // (9, 12) från centrum: radie 15
    const [c] = getState().visualCircles;
    expect(c).toMatchObject({ center: { ref: 'net', id: 'FP1' }, radius: 15 });
    expect(getUndoStack().length).toBe(före + 1);
    expect(getState().selVisualId).toBe(c.id);
    expect(C.getCircleCenter()).toBeNull();          // redo för nästa cirkel
    undo();
    expect(getState().visualCircles).toEqual([]);
  });

  it('fritt centrum blir en fast koordinat; inskriven radie via rutan', () => {
    setTool('visual-circle');
    klick(500, 500);
    expect(C.getCircleCenter()).toEqual({ E: 500, N: 500 });
    UI.renderCircleBox();
    const box = document.getElementById('circle-box');
    expect(box.textContent).toContain('Centrum: E 500,000 · N 500,000');
    const inp = box.querySelector('.cc-r');
    inp.value = '12,5';
    inp.dispatchEvent(new Event('input'));
    expect(box.querySelector('.cc-info').textContent)
      .toBe(`Radie 12,500${NBSP}m · Omkrets 78,540${NBSP}m (plan) · ${A.circleVertexCount(12.5)} hörn`);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(getState().visualCircles[0]).toMatchObject({ center: { E: 500, N: 500 }, radius: 12.5 });
  });

  it('antalet hörn i rutan följer vald tolerans', () => {
    setTool('visual-circle');
    klick(500, 500);
    UI.renderCircleBox();
    const box = document.getElementById('circle-box');
    const inp = box.querySelector('.cc-r');
    inp.value = '100';
    inp.dispatchEvent(new Event('input'));
    const hörn = () => Number(/(\d+) hörn/.exec(box.querySelector('.cc-info').textContent)[1]);
    const fin = hörn();
    const sel = box.querySelector('.cc-tol');
    sel.value = '0.005';
    sel.dispatchEvent(new Event('change'));
    expect(A.getArcTolerance()).toBe(0.005);
    expect(hörn()).toBe(A.circleVertexCount(100, 0.005));
    expect(hörn()).toBeLessThan(fin);
  });

  it('Esc släpper centrum; nästa Esc lämnar verktyget', () => {
    setTool('visual-circle');
    klick(500, 500);
    expect(C.resetCircleCenter()).toBe(true);
    expect(C.resetCircleCenter()).toBe(false);
  });
});

describe('kortet', () => {
  it('visar centrum, radie, omkrets (plan) och hörn; radien går att ändra', () => {
    const id = cirkel({ name: 'Brunn' });
    setState({ selVisualId: id });
    UI.renderCircleCard();
    const card = document.getElementById('circle-card');
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.cc-center').textContent).toBe('FP1 (nätpunkt)');
    expect(card.querySelector('.cc-card-r').value).toBe('10,000');
    expect(card.querySelector('.cc-perim').textContent).toBe(`62,832${NBSP}m (plan)`);
    const r = card.querySelector('.cc-card-r');
    r.value = '4';
    r.dispatchEvent(new Event('change'));
    expect(V.findVisualCircle(id).radius).toBe(4);
    undo();
    expect(V.findVisualCircle(id).radius).toBe(10);
  });

  it('Gör om till polylinje: sluten linje med cirkelns hörn, cirkeln borta, ett ångra-steg', () => {
    const id = cirkel({ name: 'Brunn' });
    setState({ selVisualId: id });
    UI.renderCircleCard();
    const före = getUndoStack().length;
    document.querySelector('#circle-card [data-cc="line"]').click();
    expect(getUndoStack().length).toBe(före + 1);
    expect(getState().visualCircles).toEqual([]);
    const [l] = getState().visualLines;
    expect(l).toMatchObject({ closed: true, name: 'Brunn' });
    expect(l.vertices).toHaveLength(A.circleVertexCount(10));
    undo();
    expect(getState().visualCircles).toHaveLength(1);
    expect(getState().visualLines).toEqual([]);
  });
});

describe('sparas, ångras och laddas', () => {
  it('projektfil fram och tillbaka', () => {
    const id = cirkel({ name: 'Brunn' });
    V.addVisualCircle({ center: { E: 1, N: 2 }, radius: 3 });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ visualCircles: [], nVcid: 1 });
    _applySnapshot(snap);
    expect(getState().visualCircles.map(c => c.id)).toEqual([id, 'VC2']);
    expect(getState().nVcid).toBe(3);
    expect(V.addVisualCircle({ center: { E: 0, N: 0 }, radius: 1 })).toBe('VC3');
  });

  it('äldre projektfil utan cirklar laddas utan fel', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [], visualPts: [], visualLines: [] });
    expect(getState().visualCircles).toEqual([]);
  });

  it('ångra tar med cirklarna', () => {
    saveUndo('x');
    cirkel();
    undo();
    expect(getState().visualCircles).toEqual([]);
  });
});

describe('markering, lager och snappning', () => {
  const project = (E, N) => ({ x: E, y: -N });

  it('område: helt inuti eller korsad', () => {
    const id = cirkel();
    expect(SEL.objectsInRect(getState(), { x0: 85, y0: -115, x1: 115, y1: -85 }, 'window', project)).toEqual([id]);
    expect(SEL.objectsInRect(getState(), { x0: 95, y0: -115, x1: 115, y1: -85 }, 'window', project)).toEqual([]);
    expect(SEL.objectsInRect(getState(), { x0: 108, y0: -102, x1: 115, y1: -98 }, 'crossing', project)).toEqual([id]);
    expect(SEL.objectsInRect(getState(), { x0: 98, y0: -102, x1: 102, y1: -98 }, 'crossing', project)).toEqual([]);
  });

  it('flytta till lager, ta bort, lagrets antal', () => {
    const id = cirkel();
    const annat = V.addVisualLayer({ name: 'Annat' });
    V.moveVisualToLayer([id], annat);
    expect(V.visualLayerCounts(annat).circles).toBe(1);
    expect(V.removeVisualLayer(annat).circles).toBe(1);
    expect(getState().visualCircles).toEqual([]);
  });

  it('snappning mot omkretsen', () => {
    cirkel({ name: 'Brunn' });
    const t = S.findSnapTarget(getState(), 111, -100, project, 5);
    expect(t).toMatchObject({ kind: 'circle', label: 'på cirkel Brunn' });
    // Snappmålet ligger på polygonen, högst toleransen (1 mm) innanför cirkeln.
    expect(10 - Math.hypot(t.E - 100, t.N - 100)).toBeLessThanOrEqual(0.001);
  });
});

describe('export', () => {
  it('som sluten linje med hörn enligt toleransen, första hörnet upprepat sist', () => {
    const id = cirkel({ name: 'Brunn' });
    const r = X.buildVisualGeo(getState(), { objectIds: [id] }, 'Brunn');
    expect(r.counts.circles).toBe(1);
    const [l] = parseGeo(r.text).lines;
    const n = A.circleVertexCount(10);
    expect(l.name).toBe('Brunn');
    expect(l.vertices).toHaveLength(n + 1);
    expect(l.vertices.at(-1)).toMatchObject({ E: l.vertices[0].E, N: l.vertices[0].N, H: null });
    expect(l.vertices.at(-1).name).toBe(String(n + 1).padStart(2, '0'));
    expect(X.collectVisualGeo(getState(), { include: { points: true, lines: true, areas: true, circles: false } }).lines).toEqual([]);
  });
});
