// Lager-verktyg Etapp 5: snappning vid ritning.
// – prioritet: punkter (nät, visuella, hörn) före linjer och ytkanter
// – radien är i skärmpixlar – samma känsla på alla zoomnivåer
// – större radie med grov pekare
// – snapp mot nätpunkt ger ref:'net'; mot linje/kant en ny punkt på linjen
// – avstängd snappning, Alt, sparad inställning, släckta lager
// – Alt stoppas (preventDefault) medan ett ritverktyg är valt, annars inte

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Kartan med zoomfaktor k: 1 m = k px. Ändra k för att "zooma".
let k = 1;
vi.mock('../src/map/leaflet-setup.js', () => ({
  map: { latLngToContainerPoint: ll => Array.isArray(ll) ? { x: ll[1] * k, y: -ll[0] * k } : { x: ll.lng * k, y: -ll.lat * k } },
  ENtoLatLng: (E, N) => [N, E],
  latLngToEN: ll => ({ E: ll.lng, N: ll.lat }),
  draw: vi.fn(), fitViewToENBounds: vi.fn(),
}));

const S = await import('../src/map/snap.js');
const D = await import('../src/map/visual-drawing.js');
const V = await import('../src/state/visual.js');
const { getState, setState } = await import('../src/state/store.js');
const { handleAltKey } = await import('../src/ui/map-tools.js');

const vis = id => V.makeEndpoint('visual', id);
const project = (E, N) => ({ x: E * k, y: -N * k });
const hitta = (E, N, r = 10) => S.findSnapTarget(getState(), E * k, -N * k, project, r);

beforeEach(() => {
  k = 1;
  localStorage.removeItem(S.SNAP_KEY);
  S._reloadSnapSetting();
  D.cancelVisualDraw();
  setState({
    pts: [{ id: 'FP1', type: 'known', E: 0, N: 0 }], meas: [], obstacles: [],
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

// Linje (100,0)–(200,0) med hörn, en fri punkt U101 vid (150,30), en yta 300–400.
function scen() {
  const l = V.addVisualLayer({ name: 'L' });
  const a = V.addVisualPt({ E: 100, N: 0, layerId: l, role: 'vertex', name: 'H1' });
  const b = V.addVisualPt({ E: 200, N: 0, layerId: l, role: 'vertex' });
  const line = V.addVisualLine({ from: vis(a), to: vis(b), layerId: l });
  const u = V.addVisualPt({ E: 150, N: 30, layerId: l, name: 'U101' });
  const h = [[300, 0], [400, 0], [400, 100], [300, 100]].map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
  const area = V.addVisualArea({ vertices: h.map(vis), layerId: l, name: 'Platta' });
  return { l, a, b, line, u, area };
}

describe('mål och prioritet', () => {
  it('nätpunkt ger ref:"net" och texten "nätpunkt FP1"', () => {
    expect(hitta(3, 4)).toMatchObject({ kind: 'net', ref: 'net', id: 'FP1', E: 0, N: 0, label: 'nätpunkt FP1' });
  });

  it('hörn och fri punkt: ref:"visual" och namnet i texten', () => {
    scen();
    expect(hitta(102, 1)).toMatchObject({ kind: 'vertex', ref: 'visual', label: 'hörn H1' });
    expect(hitta(151, 29)).toMatchObject({ kind: 'point', ref: 'visual', label: 'punkt U101' });
  });

  it('på linjen: närmaste punkt, utan ref', () => {
    const { line } = scen();
    expect(hitta(130, 6)).toMatchObject({ kind: 'line', ref: null, id: null, objId: line, E: 130, N: 0,
                                          label: `på linje ${line}` });
  });

  it('på ytkant', () => {
    scen();
    expect(hitta(350, 104)).toMatchObject({ kind: 'edge', E: 350, N: 100, label: 'på ytkant Platta' });
  });

  it('en punkt vinner över en linje som ligger närmare', () => {
    scen();
    // (108, 1): linjen 1 px bort, hörnet H1 8 px bort.
    expect(hitta(108, 1)).toMatchObject({ kind: 'vertex', E: 100, N: 0 });
  });

  it('bland punkter vinner den närmaste, oavsett sort', () => {
    setState({ pts: [{ id: 'FP1', type: 'known', E: 0, N: 0 }] });
    const l = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 6, N: 0, layerId: l, name: 'V' });
    expect(hitta(4, 0).label).toBe('punkt V');
    expect(hitta(2, 0).label).toBe('nätpunkt FP1');
  });

  // Tillägg efter STOPP 5.
  it('visuell punkt exakt på en nätpunkt: nätpunkten vinner och ger ref:"net"', () => {
    const l = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 0, N: 0, layerId: l, name: 'V' });          // exakt på FP1
    // Från alla håll, också när pekaren ligger lika nära båda.
    for (const [E, N] of [[0, 0], [3, 4], [-5, 2]])
      expect(hitta(E, N)).toMatchObject({ kind: 'net', ref: 'net', id: 'FP1' });
    // Inom 1 px räknas som samma ställe – även om den visuella punkten är närmast.
    setState({ visualPts: [{ ...getState().visualPts[0], E: 0.8, N: 0 }] });
    expect(hitta(1, 0)).toMatchObject({ ref: 'net', id: 'FP1' });
    // Längre isär än 1 px vinner den närmaste som vanligt.
    setState({ visualPts: [{ ...getState().visualPts[0], E: 3, N: 0 }] });
    expect(hitta(3, 0)).toMatchObject({ ref: 'visual' });
  });

  it('linje och yta: hörnet på en nätpunkt med en visuell punkt ovanpå fäster i nätet', () => {
    const l = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 0, N: 0, layerId: l });
    D.startVisualLineDraw();
    D.handleVisualMapClick({ lat: 50, lng: 50 });
    D.handleVisualMapClick({ lat: 0, lng: 0 });
    expect(getState().visualLines[0].to).toEqual({ ref: 'net', id: 'FP1' });
  });

  it('släckta lager snappar inte', () => {
    const { l } = scen();
    V.updateVisualLayer(l, { visible: false });
    expect(hitta(102, 1)).toBeNull();
    expect(hitta(130, 6)).toBeNull();
  });
});

describe('radien är i skärmpixlar', () => {
  it('samma pixelavstånd snappar på alla zoomnivåer, samma meteravstånd gör det inte', () => {
    // 8 m bort: vid k=1 är det 8 px (snappar), vid k=4 är det 32 px (snappar inte).
    k = 1; expect(hitta(8, 0)).not.toBeNull();
    k = 4; expect(hitta(8, 0)).toBeNull();
    // 8 px bort vid k=4 är 2 m.
    k = 4; expect(hitta(2, 0)).not.toBeNull();
    k = 0.25; expect(hitta(32, 0)).not.toBeNull();   // 8 px
    k = 0.25; expect(hitta(48, 0)).toBeNull();       // 12 px
  });

  it('10 px med mus, 22 px med grov pekare', () => {
    expect(S.snapRadius()).toBe(10);
    const orig = window.matchMedia;
    window.matchMedia = q => ({ matches: q === '(pointer: coarse)' });
    try { expect(S.snapRadius()).toBe(22); } finally { window.matchMedia = orig; }
  });
});

describe('av, på och Alt', () => {
  it('förval på; S sparas per användare', () => {
    expect(S.isSnapEnabled()).toBe(true);
    S.toggleSnap();
    expect(localStorage.getItem(S.SNAP_KEY)).toBe('0');
    S._reloadSnapSetting();
    expect(S.isSnapEnabled()).toBe(false);
  });

  it('lagring som kastar: förval på, ingen krasch', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    S._reloadSnapSetting();
    expect(S.isSnapEnabled()).toBe(true);
    expect(() => S.toggleSnap()).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });

  it('avstängd snappning: klicket hamnar där man klickar', () => {
    S.setSnapEnabled(false);
    D.startVisualPointDraw();
    D.handleVisualMapClick({ lat: 3, lng: 4 });
    expect(getState().visualPts[0]).toMatchObject({ E: 4, N: 3 });
  });

  it('Alt: tillfälligt av, bara medan ett ritverktyg är valt', () => {
    const tangent = typ => {
      const e = new KeyboardEvent(typ, { key: 'Alt', cancelable: true });
      handleAltKey(e);
      return e;
    };
    // Inget ritverktyg: sidan rör inte Alt.
    expect(tangent('keydown').defaultPrevented).toBe(false);
    expect(S.isAltHeld()).toBe(false);

    D.startVisualLineDraw();
    const ner = tangent('keydown');
    expect(ner.defaultPrevented).toBe(true);
    expect(S.isAltHeld()).toBe(true);
    expect(S.snapActive()).toBe(false);
    D.handleVisualMapClick({ lat: 3, lng: 4 });          // nära FP1 – men Alt
    const upp = tangent('keyup');
    // keyup stoppas också: det är när Alt släpps som Windows-webbläsarna
    // annars flyttar fokus till sin meny.
    expect(upp.defaultPrevented).toBe(true);
    expect(S.snapActive()).toBe(true);
    // Nu snappar den – mot FP1, som ligger närmare än punkten från första klicket.
    D.handleVisualMapClick({ lat: 1, lng: 1 });
    const [linje] = getState().visualLines;
    expect(linje.from.ref).toBe('visual');               // första klicket: ny punkt
    expect(linje.to).toEqual({ ref: 'net', id: 'FP1' });
  });
});

describe('ritverktygen använder snappningen', () => {
  const klick = (E, N) => D.handleVisualMapClick({ lat: N, lng: E });

  it('linje: snapp mot nätpunkt ger ref:"net"', () => {
    D.startVisualLineDraw();
    klick(50, 50); klick(3, 4);
    expect(getState().visualLines[0].to).toEqual({ ref: 'net', id: 'FP1' });
  });

  it('linje: snapp mot en annan linje lägger en ny punkt på linjen', () => {
    scen();
    D.startVisualLineDraw();
    klick(130, 60); klick(130, 6);
    const p = getState().visualPts.at(-1);
    expect(p).toMatchObject({ E: 130, N: 0 });
    expect(getState().visualLines.at(-1).to).toEqual({ ref: 'visual', id: p.id });
  });

  it('yta: hörn i nätpunkt blir ref:"net", hörn på en kant hamnar på kanten', () => {
    scen();
    D.startVisualAreaDraw();
    klick(3, 4); klick(130, 6); klick(60, 80);
    D.completeVisualArea();
    const a = getState().visualAreas.at(-1);
    expect(a.vertices[0]).toEqual({ ref: 'net', id: 'FP1' });
    expect(V.visualAreaCoords(a)[1]).toEqual([130, 0]);
  });

  it('punkt: ingen dubblett på en befintlig punkt; vid en nätpunkt läggs den exakt där', () => {
    scen();
    D.startVisualPointDraw();
    const före = getState().visualPts.length;
    expect(klick(151, 29).created).toBeNull();
    expect(getState().visualPts).toHaveLength(före);
    klick(3, 4);
    expect(getState().visualPts.at(-1)).toMatchObject({ E: 0, N: 0 });
  });

  it('snappmålet räknas vid klicket – ett tryck utan hovring snappar också', () => {
    D.startVisualLineDraw();
    D.updateVisualMousePos({ lat: 500, lng: 500 }, { x: 500, y: -500 });   // hovring långt bort
    klick(50, 50); klick(3, 4);
    expect(getState().visualLines[0].to).toEqual({ ref: 'net', id: 'FP1' });
  });

  it('pekskärm: målet visas en kort stund efter trycket', () => {
    const orig = window.matchMedia;
    window.matchMedia = q => ({ matches: q === '(pointer: coarse)' });
    try {
      D.startVisualLineDraw();
      klick(15, 15);                                    // 21 px från FP1: inom 22 px
      const labels = [];
      const ctx = new Proxy({}, { get: (_, p) => p === 'fillText' ? t => labels.push(t) : () => {}, set: () => true });
      D.drawVisualPreview(ctx);
      expect(labels).toContain('nätpunkt FP1');
    } finally { window.matchMedia = orig; }
  });

  it('markören ritar texten bredvid målet', () => {
    const texts = [];
    const ctx = new Proxy({}, { get: (_, p) => p === 'fillText' ? t => texts.push(t) : () => {}, set: () => true });
    S.drawSnapMarker(ctx, { x: 0, y: 0 }, { ref: null, label: 'på linje VL1' });
    expect(texts).toEqual(['på linje VL1']);
  });
});

describe('punktverktyget vid en nätpunkt med en visuell punkt ovanpå', () => {
  it('skapar ingen dubblett', () => {
    const l = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 0, N: 0, layerId: l });
    D.startVisualPointDraw();
    expect(D.handleVisualMapClick({ lat: 2, lng: 2 }).created).toBeNull();
    expect(getState().visualPts).toHaveLength(1);
  });
});
