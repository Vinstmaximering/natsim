// Polylinjer Etapp 2: längd och riktning (plan), egenskapskortet för linjer,
// segmentlängder på kartan och mätverktyget D.
//
// Handräknade fall: 3–4–5-triangeln. arctan(3/4) = 0,643501109 rad
// = 0,643501109 · 200/π = 40,9665529 gon. I de fyra kvadranterna:
//   ΔE=+3 ΔN=+4:       40,9665529 gon
//   ΔE=+3 ΔN=−4: 200 − 40,9665529 = 159,0334471 gon
//   ΔE=−3 ΔN=−4: 200 + 40,9665529 = 240,9665529 gon
//   ΔE=−3 ΔN=+4: 400 − 40,9665529 = 359,0334471 gon
// och S = √(3² + 4²) = 5,000 m.

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

const G = await import('../src/state/line-geometry.js');
const V = await import('../src/state/visual.js');
const M = await import('../src/map/measure-tool.js');
const { measureBoxHtml } = await import('../src/ui/measure-box.js');
const { renderLineCard, lineCardRows } = await import('../src/ui/line-card.js');
const { drawVisualLayer, segmentLabelAngle } = await import('../src/map/visual-canvas.js');
const { setTool, MAP_TOOLS } = await import('../src/ui/toolbar.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo, getUndoStack } = await import('../src/state/undo.js');
const S = await import('../src/map/snap.js');

const NBSP = ' ';
const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

beforeEach(() => {
  localStorage.removeItem(S.SNAP_KEY);
  S._reloadSnapSetting();
  M.cancelMeasure();
  document.body.innerHTML = '<div id="line-card" hidden></div><div id="measure-box" hidden></div><div id="mtb"></div><div id="hint"></div>';
  setState({
    tool: 'pan', measFrom: null,
    pts: [{ id: 'FP1', type: 'known', E: 100, N: 100, H: 0 }, { id: 'FP2', type: 'known', E: 103, N: 96, H: 12.5 }],
    meas: [], obstacles: [], selObsId: null, simResult: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

// ── Geometri ─────────────────────────────────────────────────────────────────

describe('riktning i gon, medurs från norr', () => {
  const O = [1000, 2000];
  const från = (dE, dN) => G.bearingGon(O, [O[0] + dE, O[1] + dN]);

  it('0, 100, 200 och 300 gon längs axlarna', () => {
    expect(från(0, 10)).toBe(0);
    expect(från(10, 0)).toBeCloseTo(100, 12);
    expect(från(0, -10)).toBeCloseTo(200, 12);
    expect(från(-10, 0)).toBeCloseTo(300, 12);
  });

  it('alla fyra kvadranter (3–4–5)', () => {
    expect(från(3, 4)).toBeCloseTo(40.9665529, 7);
    expect(från(3, -4)).toBeCloseTo(159.0334471, 7);
    expect(från(-3, -4)).toBeCloseTo(240.9665529, 7);
    expect(från(-3, 4)).toBeCloseTo(359.0334471, 7);
  });

  it('formateras med fyra decimaler; ett värde som avrundas till 400 blir 0', () => {
    expect(G.formatGon(från(3, 4))).toBe(`40,9666${NBSP}gon`);
    expect(G.formatGon(från(3, -4))).toBe(`159,0334${NBSP}gon`);
    expect(G.formatGon(från(-3, -4))).toBe(`240,9666${NBSP}gon`);
    expect(G.formatGon(från(-3, 4))).toBe(`359,0334${NBSP}gon`);
    expect(G.formatGon(399.99996)).toBe(`0,0000${NBSP}gon`);
    expect(G.formatGon(100)).toBe(`100,0000${NBSP}gon`);
  });

  it('sammanfallande punkter har ingen riktning', () => {
    expect(G.bearingGon(O, O)).toBeNull();
    expect(G.formatGon(null)).toBe('–');
  });
});

describe('längd (plan)', () => {
  it('3–4–5 ger 5,000 m, i alla kvadranter', () => {
    for (const [dE, dN] of [[3, 4], [3, -4], [-3, -4], [-3, 4]])
      expect(G.planDistance([0, 0], [dE, dN])).toBe(5);
    expect(G.formatMeters(5)).toBe(`5,000${NBSP}m`);
    expect(G.formatMeters(1234.5678)).toBe(`1${NBSP}234,568${NBSP}m`);
  });

  it('polylinje: summa av segmenten; sluten tar med slutsegmentet', () => {
    const c = [[0, 0], [3, 4], [3, 0]];
    const öppen = G.lineStats(c);
    expect(öppen.segments.map(s => [s.from, s.to, s.length])).toEqual([[0, 1, 5], [1, 2, 4]]);
    expect(öppen.length).toBe(9);
    const sluten = G.lineStats(c, true);
    expect(sluten.segments.at(-1)).toMatchObject({ from: 2, to: 0, length: 3 });
    expect(sluten.segments.at(-1).bearing).toBeCloseTo(300, 12);
    expect(sluten.length).toBe(12);
  });

  it('sjusiffriga koordinater tappar inte millimetrarna', () => {
    const a = [150000.001, 6600000.002], b = [150003.001, 6600004.002];
    expect(G.formatMeters(G.planDistance(a, b))).toBe(`5,000${NBSP}m`);
    expect(G.bearingGon(a, b)).toBeCloseTo(40.9665529, 5);
  });
});

describe('mätvärden mellan två punkter', () => {
  it('S, riktning, ΔN, ΔE och ΔH', () => {
    const r = G.measureBetween({ E: 100, N: 100, H: 10 }, { E: 97, N: 104, H: 10.25 });
    expect(r.S).toBe(5);
    expect(r.bearing).toBeCloseTo(359.0334471, 7);
    expect([r.dN, r.dE, r.dH]).toEqual([4, -3, 0.25]);
    expect(G.formatDelta(r.dE)).toBe(`−3,000${NBSP}m`);
    expect(G.formatDelta(r.dN)).toBe(`+4,000${NBSP}m`);
  });

  it('ΔH saknas ("–") när någon punkt saknar höjd', () => {
    expect(G.measureBetween({ E: 0, N: 0, H: null }, { E: 1, N: 1, H: 5 }).dH).toBeNull();
    expect(G.measureBetween({ E: 0, N: 0, H: 5 }, { E: 1, N: 1 }).dH).toBeNull();
    expect(G.formatDelta(null)).toBe('–');
  });

  it('ett värde som avrundas till noll får inget tecken', () => {
    expect(G.formatDelta(-0.0001)).toBe(`0,000${NBSP}m`);
  });
});

// ── Egenskapskortet ──────────────────────────────────────────────────────────

function linje({ closed = false, name = null } = {}) {
  const lay = V.addVisualLayer({ name: 'Kantbalk' });
  const a = V.addVisualPt({ E: 97, N: 104, layerId: lay, role: 'vertex' });
  const b = V.addVisualPt({ E: 100, N: 108, layerId: lay, role: 'vertex', name: 'K7' });
  const id = V.addVisualLine({ vertices: [net('FP1'), vis(a), vis(b)], closed, layerId: lay, name });
  return { lay, id, a, b };
}
const card = () => document.getElementById('line-card');
const text = sel => card().querySelector(sel).textContent;

describe('egenskapskort för linje', () => {
  it('hörnen heter punktens namn, annars löpnummer', () => {
    const { id } = linje();
    expect(V.lineVertexNames(V.findVisualLine(id))).toEqual(['FP1', '2', 'K7']);
  });

  it('segmenttabellen: namn, längd och riktning (plan)', () => {
    const { id } = linje({ closed: true });
    const { length, rows } = lineCardRows(V.findVisualLine(id));
    expect(rows.map(r => r.label)).toEqual(['FP1–2', '2–K7', 'K7–FP1']);
    expect(rows[0]).toMatchObject({ length: `5,000${NBSP}m`, bearing: `359,0334${NBSP}gon` });
    expect(rows[1]).toMatchObject({ length: `5,000${NBSP}m`, bearing: `40,9666${NBSP}gon` });
    expect(rows[2]).toMatchObject({ length: `8,000${NBSP}m`, bearing: `200,0000${NBSP}gon` });
    expect(length).toBe(18);
  });

  it('visas när linjen markeras, med namn, lager, hörn, form och total längd', () => {
    const { id } = linje({ name: 'Kant N' });
    setState({ selVisualId: id });
    renderLineCard();
    expect(card().hidden).toBe(false);
    expect(card().querySelector('.ac-name').value).toBe('Kant N');
    expect(text('.lc-layer')).toBe('Kantbalk');
    expect(text('.lc-n')).toBe('3 (varav 1 nätpunkt)');
    expect(text('.lc-form')).toBe('Öppen');
    expect(text('.lc-len')).toBe(`10,000${NBSP}m (plan)`);
    expect(card().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(card().querySelector('thead').textContent).toContain('Längd (plan)');
    setState({ selVisualId: null });
    renderLineCard();
    expect(card().hidden).toBe(true);
  });

  it('namnet går att ändra – ett ångra-steg', () => {
    const { id } = linje();
    setState({ selVisualId: id });
    renderLineCard();
    const före = getUndoStack().length;
    const inp = card().querySelector('.ac-name');
    inp.value = 'Stödmur';
    inp.dispatchEvent(new Event('change'));
    expect(V.findVisualLine(id).name).toBe('Stödmur');
    expect(getUndoStack().length).toBe(före + 1);
  });

  it('Använd som vägg: ett hinder per segment; knappen blir Koppla loss', () => {
    const { id } = linje();
    setState({ selVisualId: id });
    renderLineCard();
    card().querySelector('[data-lc="wall"]').click();
    renderLineCard();
    expect(V.findVisualLine(id).linkedObsIds).toHaveLength(2);
    expect(card().querySelector('[data-lc="wall"]').textContent).toContain('Koppla loss');
    card().querySelector('[data-lc="wall"]').click();
    expect(V.findVisualLine(id).linkedObsIds).toEqual([]);
    expect(getState().obstacles).toHaveLength(2);
  });

  it('Slut linjen → yta: samma hörn, linjen borta, ett ångra-steg', () => {
    const { id, a, b } = linje({ name: 'Platta' });
    setState({ selVisualId: id });
    renderLineCard();
    const före = getUndoStack().length;
    card().querySelector('[data-lc="area"]').click();
    expect(getUndoStack().length).toBe(före + 1);
    expect(V.findVisualLine(id)).toBeNull();
    const [yta] = getState().visualAreas;
    expect(yta.vertices).toEqual([net('FP1'), vis(a), vis(b)]);
    expect(yta.name).toBe('Platta');
    expect(getState().selVisualId).toBe(yta.id);
    expect(getState().visualPts.map(p => p.id)).toEqual([a, b]);   // hörnen står kvar
    undo();
    expect(V.findVisualLine(id)).not.toBeNull();
    expect(getState().visualAreas).toEqual([]);
  });

  it('Slut linjen → yta kräver tre hörn', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const a = V.addVisualPt({ E: 0, N: 0, layerId: lay, role: 'vertex' });
    const id = V.addVisualLine({ vertices: [vis(a), net('FP1')], layerId: lay });
    setState({ selVisualId: id });
    renderLineCard();
    expect(card().querySelector('[data-lc="area"]').disabled).toBe(true);
    expect(V.convertLineToArea(id)).toBeNull();
  });
});

// ── Segmentlängder på kartan ─────────────────────────────────────────────────

describe('segmentlängder på kartan', () => {
  const ritadText = () => {
    const texter = [];
    const ctx = new Proxy({}, {
      get: (_, p) => (p === 'fillText' ? t => texter.push(t) : () => {}),
      set: () => true,
    });
    drawVisualLayer(ctx, getState(), {
      map: { latLngToContainerPoint: ([N, E]) => ({ x: E, y: -N }) }, ENtoLatLng: (E, N) => [N, E],
    });
    return texter;
  };

  it('bara för den markerade linjen', () => {
    const { id } = linje();
    expect(ritadText().filter(t => t.endsWith('m'))).toEqual([]);
    setState({ selVisualId: id });
    expect(ritadText().filter(t => t.endsWith(`${NBSP}m`))).toEqual([`5,000${NBSP}m`, `5,000${NBSP}m`]);
  });

  it('dolt namn döljer också längderna', () => {
    const { id } = linje();
    V.setVisualLabelsHidden([id], true);
    setState({ selVisualId: id });
    expect(ritadText().filter(t => t.endsWith(`${NBSP}m`))).toEqual([]);
  });

  it('texten står aldrig upp och ned', () => {
    const vinkel = (dx, dy) => segmentLabelAngle({ x: 0, y: 0 }, { x: dx, y: dy });
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10], [-7, 3], [-7, -3], [7, 3], [7, -3]]) {
      const a = vinkel(dx, dy);
      expect(a).toBeGreaterThanOrEqual(-Math.PI / 2);
      expect(a).toBeLessThanOrEqual(Math.PI / 2);
    }
    expect(vinkel(-10, 0)).toBeCloseTo(0, 12);    // från höger till vänster: läses ändå vänster → höger
  });
});

// ── Mätverktyget D ───────────────────────────────────────────────────────────

describe('mätverktyget D', () => {
  const klick = (E, N) => M.handleMeasureClick({ lat: N, lng: E });

  it('finns i verktygsraden och den mobila raden, med kortkommandot D', () => {
    const t = MAP_TOOLS.find(x => x.tool === 'measure-dist');
    expect(t).toMatchObject({ key: 'd', btn: 'btn-measure-dist' });
    expect(t.mobile).toBeTruthy();
    setTool('measure-dist');
    expect(M.isMeasuring()).toBe(true);
    setTool('pan');
    expect(M.isMeasuring()).toBe(false);
  });

  it('två klick ger resultatet; snappade punkter visar sina namn', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 97, N: 104, H: 10.25, layerId: lay, name: 'U101' });
    setTool('measure-dist');
    klick(101, 101);                        // snappar mot FP1 (H = 0: ingen höjd)
    expect(measureBoxHtml()).toContain('Från FP1');
    const r = klick(98, 103);               // snappar mot U101
    expect(r).toMatchObject({ S: 5, dN: 4, dE: -3, dH: null });
    expect(r.a.name).toBe('FP1');
    expect(r.b.name).toBe('U101');
    const html = measureBoxHtml();
    expect(html).toContain('FP1 → U101');
    expect(html).toContain(`5,000${NBSP}m`);
    expect(html).toContain(`359,0334${NBSP}gon`);
    expect(html).toMatch(/ΔH<\/span><span class="mb-v">–</);
  });

  it('ΔH visas när båda punkterna har höjd', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 97, N: 104, H: 10.25, layerId: lay });
    setTool('measure-dist');
    klick(103, 96);                         // FP2, H 12,5
    const r = klick(97, 104);
    expect(r.dH).toBeCloseTo(-2.25, 12);
    expect(measureBoxHtml()).toContain(`−2,250${NBSP}m`);
  });

  it('en fri position har ingen höjd och inget namn', () => {
    setTool('measure-dist');
    klick(500, 500);
    const r = klick(503, 504);
    expect(r).toMatchObject({ S: 5, dH: null });
    expect(r.a).toMatchObject({ name: null, kind: 'free' });
    expect(measureBoxHtml()).toContain('fri punkt → fri punkt');
  });

  it('nytt klick efter en färdig mätning börjar om; Esc börjar om', () => {
    setTool('measure-dist');
    klick(500, 500); klick(503, 504);
    expect(M.getMeasureResult()).not.toBeNull();
    klick(600, 600);
    expect(M.getMeasureResult()).toBeNull();
    expect(M.getMeasurePoints().a).toMatchObject({ E: 600, N: 600 });
    expect(M.resetMeasure()).toBe(true);
    expect(M.getMeasurePoints()).toEqual({ a: null, b: null });
    expect(M.resetMeasure()).toBe(false);   // inget påbörjat: Esc lämnar verktyget
  });

  it('ingenting sparas: inga objekt och inget ångra-steg', () => {
    const före = { ...getState() };
    const steg = getUndoStack().length;
    setTool('measure-dist');
    klick(500, 500); klick(503, 504);
    expect(getState().visualPts).toEqual(före.visualPts);
    expect(getState().visualLines).toEqual(före.visualLines);
    expect(getUndoStack().length).toBe(steg);
  });

  it('snappning av: klicket hamnar där man klickar', () => {
    S.setSnapEnabled(false);
    setTool('measure-dist');
    const r = (klick(101, 101), klick(104, 105));
    expect(r.a).toMatchObject({ E: 101, N: 101, name: null });
    expect(r.S).toBe(5);
  });

  it('höjdregler: nätpunkt med H = 0 saknar höjd, visuell punkt med H = 0 har höjd', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const v = V.addVisualPt({ E: 0, N: 0, H: 0, layerId: lay });
    expect(M.targetHeight({ ref: 'net', id: 'FP1' })).toBeNull();
    expect(M.targetHeight({ ref: 'net', id: 'FP2' })).toBe(12.5);
    expect(M.targetHeight({ ref: 'visual', id: v })).toBe(0);
    expect(M.targetHeight({ ref: null })).toBeNull();
  });
});
