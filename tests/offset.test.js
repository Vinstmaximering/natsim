// Polylinjer Etapp 4: offset av linjer och ytor.
//
// Handräknade fall. Riktning öst (+E) har höger sida söder (−N).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const O = await import('../src/state/offset-geometry.js');
const OS = await import('../src/state/offset.js');
const V = await import('../src/state/visual.js');
const { signedArea, polygonArea } = await import('../src/state/area-geometry.js');
const { getState, setState } = await import('../src/state/store.js');

const R = 1, L = -1;
const nära = (a, b, d = 9) => a.forEach((p, i) => { expect(p[0]).toBeCloseTo(b[i][0], d); expect(p[1]).toBeCloseTo(b[i][1], d); });

describe('rak linje', () => {
  const c = [[0, 0], [10, 0]];
  it('höger: två meter söderut', () => {
    const r = O.offsetPolyline(c, { distance: 2, side: R });
    expect(r.problem).toBeNull();
    nära(r.coords, [[0, -2], [10, -2]]);
  });
  it('vänster: två meter norrut', () => {
    nära(O.offsetPolyline(c, { distance: 2, side: L }).coords, [[0, 2], [10, 2]]);
  });
  it('båda sidor ger två linjer', () => {
    expect(O.offsetSides(c, false, 'both').map(s => s.key)).toEqual(['right', 'left']);
  });
});

describe('rät vinkel', () => {
  // Öst 10 m, sedan norr 10 m: vänstersväng. Höger sida är ytterhörnet.
  const c = [[0, 0], [10, 0], [10, 10]];

  it('skarpt ytterhörn: kanterna förlängs till (12, −2)', () => {
    const r = O.offsetPolyline(c, { distance: 2, side: R, corners: 'sharp' });
    nära(r.coords, [[0, -2], [12, -2], [12, 10]]);
    expect(r.problem).toBeNull();
  });

  it('innerhörn: skärningen (8, 2), för både skarpa och rundade', () => {
    for (const corners of ['sharp', 'round'])
      nära(O.offsetPolyline(c, { distance: 2, side: L, corners }).coords, [[0, 2], [8, 2], [8, 10]]);
  });

  it('rundat ytterhörn: båge runt (10, 0) med radien 2, inom 1 mm', () => {
    const r = O.offsetPolyline(c, { distance: 2, side: R, corners: 'round' });
    const båge = r.coords.slice(1, -1);
    nära([båge[0], båge.at(-1)], [[10, -2], [12, 0]]);
    // Varje hörn på bågen, och varje kordas mitt, ligger inom 1 mm från cirkeln.
    for (const [E, N] of båge) expect(Math.hypot(E - 10, N)).toBeCloseTo(2, 9);
    for (let i = 0; i + 1 < båge.length; i++) {
      const m = [(båge[i][0] + båge[i + 1][0]) / 2, (båge[i][1] + båge[i + 1][1]) / 2];
      expect(2 - Math.hypot(m[0] - 10, m[1])).toBeLessThanOrEqual(0.001 + 1e-12);
    }
    // Färre hörn skulle inte räcka: kordan för en båge med ett hörn mindre avviker mer.
    const n = båge.length - 1, φ = (Math.PI / 2) / (n - 1);
    expect(2 * (1 - Math.cos(φ / 2))).toBeGreaterThan(0.001);
  });
});

describe('spetsig vinkel', () => {
  // Öst 10 m och sedan nästan rakt tillbaka: vinkeln mellan kanterna ≈ 5,7°.
  const c = [[0, 0], [10, 0], [0, 1]];

  it('geringen blir längre än 4 · d – hörnet fasas av', () => {
    const r = O.offsetPolyline(c, { distance: 1, side: R, corners: 'sharp' });
    // Ytterhörnet ligger till höger (vänstersväng). Avfasningen: kanternas ändar
    // P + d·n1 = (10, −1) och P + d·n2, där n2 är högernormalen till (−10, 1)/|…|.
    const l = Math.hypot(10, 1), n2 = [1 / l, 10 / l];
    nära(r.coords.slice(1, 3), [[10, -1], [10 + n2[0], n2[1]]]);
    expect(r.coords).toHaveLength(4);
  });

  it('gränsen: 4 · d motsvarar 28,96° mellan kanterna', () => {
    const vid = grader => {
      const a = (180 - grader) * Math.PI / 180;   // svängvinkel
      return O.offsetPolyline([[0, 0], [10, 0], [10 + 10 * Math.cos(a), 10 * Math.sin(a)]],
        { distance: 1, side: R }).coords.length;
    };
    expect(vid(29.5)).toBe(3);   // gering
    expect(vid(28.5)).toBe(4);   // avfasning
  });

  it('rundat: en båge i stället för avfasning', () => {
    const r = O.offsetPolyline(c, { distance: 1, side: R, corners: 'round' });
    expect(r.coords.length).toBeGreaterThan(10);
    expect(r.problem).toBeNull();
  });
});

describe('sluten rektangel', () => {
  // 10 × 6 m, moturs.
  const c = [[0, 0], [10, 0], [10, 6], [0, 6]];

  it('utåt 1 m: 12 × 8', () => {
    const [s] = O.offsetSides(c, true, 'out');
    const r = O.offsetPolyline(c, { distance: 1, side: s.side, closed: true });
    nära(r.coords, [[-1, -1], [11, -1], [11, 7], [-1, 7]]);
    expect(polygonArea(r.coords)).toBeCloseTo(96, 9);
  });

  it('inåt 1 m: 8 × 4', () => {
    const [s] = O.offsetSides(c, true, 'in');
    const r = O.offsetPolyline(c, { distance: 1, side: s.side, closed: true });
    nära(r.coords, [[1, 1], [9, 1], [9, 5], [1, 5]]);
  });

  it('medurs rektangel: utåt är fortfarande utåt', () => {
    const cw = [...c].reverse();
    const [s] = O.offsetSides(cw, true, 'out');
    const r = O.offsetPolyline(cw, { distance: 1, side: s.side, closed: true });
    expect(polygonArea(r.coords)).toBeCloseTo(96, 9);
    expect(Math.sign(signedArea(r.coords))).toBe(Math.sign(signedArea(cw)));
  });

  it('rundade hörn utåt: arean är 10·6 + 2·(10+6)·1 + π·1²', () => {
    const [s] = O.offsetSides(c, true, 'out');
    const r = O.offsetPolyline(c, { distance: 1, side: s.side, corners: 'round', closed: true });
    expect(polygonArea(r.coords)).toBeCloseTo(60 + 32 + Math.PI, 2);
  });

  it('inåt 3 m eller mer: rektangeln försvinner – inget skapas', () => {
    const [s] = O.offsetSides(c, true, 'in');
    expect(O.offsetPolyline(c, { distance: 3.5, side: s.side, closed: true }).problem).toBe('collapsed');
    expect(O.offsetPolyline(c, { distance: 4, side: s.side, closed: true }).problem).toBe('collapsed');
  });
});

describe('självkorsning', () => {
  it('en nästan sluten kontur: inåt 3 m korsar offseten sig själv', () => {
    const c = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 2]];
    const r = O.offsetPolyline(c, { distance: 3, side: L });
    expect(r.problem).toBe('self');
    expect(O.offsetPolyline(c, { distance: 0.5, side: L }).problem).toBeNull();
  });

  it('smal U-form: inåt mer än halva bredden – segmentet vänder, inget skapas', () => {
    const c = [[0, 0], [0, 10], [2, 10], [2, 0]];
    expect(O.offsetPolyline(c, { distance: 3, side: R }).problem).toBe('collapsed');
    expect(O.offsetPolyline(c, { distance: 0.9, side: R }).problem).toBeNull();
  });
});

describe('skapa i projektet', () => {
  beforeEach(() => setState({
    pts: [], meas: [], obstacles: [], visualPts: [], visualLines: [], visualAreas: [],
    selVisualId: null, visualSelection: [], nVid: 1, nVlid: 1, nVaid: 1,
    visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  }));
  const vis = id => V.makeEndpoint('visual', id);
  function linje(closed = false, name = 'Kant') {
    const lay = V.addVisualLayer({ name: 'L' });
    const h = [[0, 0], [10, 0], [10, 6], [0, 6]].slice(0, closed ? 4 : 3)
      .map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
    return V.addVisualLine({ vertices: h.map(vis), closed, layerId: lay, name });
  }

  it('namnet: "<original> +2,000 H"', () => {
    expect(OS.offsetName('Kantbalk N', 2, 'right')).toBe('Kantbalk N +2,000 H');
    expect(OS.offsetName('VL3', 0.5, 'left')).toBe('VL3 +0,500 V');
    expect(OS.offsetName('Platta', 1.25, 'in')).toBe('Platta +1,250 in');
  });

  it('båda sidor: två nya polylinjer i aktivt lager med egna hörn, inte kopplade', () => {
    const src = linje();
    const annat = V.addVisualLayer({ name: 'Mål' });
    V.setActiveVisualLayer(annat);
    const r = OS.createOffsets(src, { distance: 1, side: 'both', corners: 'sharp' });
    expect(r.ok).toBe(true);
    const nya = r.ids.map(V.findVisualLine);
    expect(nya.map(l => l.name)).toEqual(['Kant +1,000 H', 'Kant +1,000 V']);
    expect(nya.every(l => l.layerId === annat && l.linkedObsIds.length === 0)).toBe(true);
    const källhörn = new Set(V.findVisualLine(src).vertices.map(v => v.id));
    for (const l of nya) for (const v of l.vertices) {
      expect(v.ref).toBe('visual');
      expect(källhörn.has(v.id)).toBe(false);
      expect(V.findVisualPt(v.id)).toMatchObject({ role: 'vertex', H: null, layerId: annat });
    }
    // Flyttas originalet följer offseten inte med.
    const före = V.visualLineCoords(nya[0]);
    V.updateVisualPt(V.findVisualLine(src).vertices[0].id, { E: -50 });
    expect(V.visualLineCoords(V.findVisualLine(r.ids[0]))).toEqual(före);
  });

  it('sluten linje ger sluten linje; yta ger ny yta', () => {
    const src = linje(true, 'Mur');
    const r = OS.createOffsets(src, { distance: 1, side: 'out', corners: 'sharp' });
    expect(V.findVisualLine(r.ids[0])).toMatchObject({ closed: true, name: 'Mur +1,000 ut' });
    const lay = getState().visualLayers[0].id;
    const h = [[0, 0], [10, 0], [10, 6], [0, 6]].map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
    const yta = V.addVisualArea({ vertices: h.map(vis), layerId: lay, name: 'Platta' });
    const r2 = OS.createOffsets(yta, { distance: 1, side: 'in', corners: 'sharp' });
    const ny = V.findVisualArea(r2.ids[0]);
    expect(ny.name).toBe('Platta +1,000 in');
    expect(polygonArea(V.visualAreaCoords(ny))).toBeCloseTo(32, 9);
  });

  it('problem: ingenting skapas', () => {
    const src = linje(true, 'Mur');
    const före = getState().visualPts.length;
    const r = OS.createOffsets(src, { distance: 4, side: 'both', corners: 'sharp' });
    expect(r).toMatchObject({ ok: false, problem: 'collapsed', key: 'in' });
    expect(getState().visualPts).toHaveLength(före);
    expect(getState().visualLines).toHaveLength(1);
    expect(OS.createOffsets(src, { distance: 0, side: 'out' })).toMatchObject({ ok: false, problem: 'distance' });
  });

  it('sidan tolkas efter formen: höger ↔ utåt, vänster ↔ inåt', () => {
    expect(OS.normalizeSide('right', true)).toBe('out');
    expect(OS.normalizeSide('in', false)).toBe('left');
    expect(OS.normalizeSide('both', true)).toBe('both');
  });
});
