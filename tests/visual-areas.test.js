// Lager-verktyg Etapp 3: visuella ytor.
// – plangeometri: area (skosnöre), omkrets, självkorsning, tyngdpunkt, format
// – datamodell och mutationer, städning av hörn och kopplade hinder
// – "Blockerar sikt": polygonhinder via linkedObsId och syncLinkedObstacles
// – ytor påverkar aldrig simuleringen; siktberäkningen bara via hindret
// – nätpunkter: flytt, namnbyte och radering
// – ritverktyget: slut, Backspace, avbryt, snappning mot nätpunkt, ångra
// – persistens: projektfil, autosave, migrering av äldre filer
// – import: slutna linjer i .geo och DXF som ytor

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Kartan: en enkel skärmprojektion (x = E, y = −N) räcker för ritverktyget.
vi.mock('../src/map/leaflet-setup.js', () => ({
  map: { latLngToContainerPoint: ([N, E]) => ({ x: E, y: -N }) },
  ENtoLatLng: (E, N) => [N, E],
  latLngToEN: ll => ({ E: ll.lng, N: ll.lat }),
  draw: vi.fn(), fitViewToENBounds: vi.fn(),
}));

const G = await import('../src/state/area-geometry.js');
const V = await import('../src/state/visual.js');
const { getState, setState } = await import('../src/state/store.js');
const { saveUndo, undo } = await import('../src/state/undo.js');
const { addObstacle, removeObstacle } = await import('../src/state/obstacles.js');
const { runSimulation } = await import('../src/core/simulation.js');
const { findBlockedMeasurements, hasLineOfSight } = await import('../src/core/visibility.js');
const { _buildSnapshot, _applySnapshot } = await import('../src/io/export-project.js');
const { writeAutosaveNow, loadAutosave } = await import('../src/state/persistence.js');
const D = await import('../src/map/visual-drawing.js');
const { hitTestVisualArea } = await import('../src/map/visual-canvas.js');
const { applyGeoImport, defaultGeoImportOptions } = await import('../src/io/geo-import.js');
const { applyDxfImport, defaultDxfImportOptions } = await import('../src/io/dxf-import.js');
const { closedRing, isClosedPolyline } = await import('../src/io/vertex-index.js');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null, selObsId: null, selId: null,
  visualPts: [], visualLines: [], visualAreas: [], selVisualId: null,
  nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm', centerErr: 1.0, defaultInstr: 'ts16_1',
  maxSuggestDist: null, symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 1, nId: 1,
};
const reset = () => setState({ ...BASE });
const nbsp = s => s.replace(/\u00a0/g, ' ');
const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

// Yta med nya hörnpunkter i ett lager. Returnerar { layer, area, hörn }.
function yta(coords, opts = {}) {
  const layer = opts.layerId || V.addVisualLayer({ name: 'L' });
  const hörn = coords.map(([E, N]) => V.addVisualPt({ E, N, layerId: layer, role: 'vertex' }));
  const area = V.addVisualArea({ vertices: hörn.map(vis), layerId: layer, ...opts });
  return { layer, area, hörn };
}

const REKT = [[0, 0], [40, 0], [40, 30], [0, 30]];

// ── Plangeometri ────────────────────────────────────────────────────────────

describe('plangeometri', () => {
  it('rektangel: area och omkrets', () => {
    expect(G.polygonArea(REKT)).toBe(1200);
    expect(G.polygonPerimeter(REKT)).toBe(140);
  });

  it('medurs och moturs ger samma absoluta area, tecknet visar riktningen', () => {
    const cw = [...REKT].reverse();
    expect(G.polygonArea(cw)).toBe(G.polygonArea(REKT));
    expect(Math.sign(G.signedArea(REKT))).toBe(1);
    expect(Math.sign(G.signedArea(cw))).toBe(-1);
  });

  it('L-form', () => {
    const L = [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20]];
    expect(G.polygonArea(L)).toBe(175);
    expect(G.polygonPerimeter(L)).toBe(80);
    expect(G.isSelfIntersecting(L)).toBe(false);
  });

  it('SWEREF-koordinater: arean är exakt trots sjusiffriga värden', () => {
    const E0 = 674032.123, N0 = 6580123.456;
    const c = REKT.map(([e, n]) => [E0 + e, N0 + n]);
    expect(G.polygonArea(c)).toBeCloseTo(1200, 6);
    expect(G.isSelfIntersecting(c)).toBe(false);
  });

  it('självkorsning: fjäril, beröring i ett hörn, kant som vänder tillbaka', () => {
    expect(G.isSelfIntersecting([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
    expect(G.isSelfIntersecting([[0, 0], [10, 0], [5, 5], [10, 10], [0, 10], [5, 5]])).toBe(true);
    expect(G.isSelfIntersecting([[0, 0], [10, 0], [5, 0], [5, 5]])).toBe(true);
  });

  it('ett hörn mitt på en rak kant är inte en självkorsning', () => {
    expect(G.isSelfIntersecting([[0, 0], [20, 0], [40, 0], [40, 30], [0, 30]])).toBe(false);
  });

  it('areaStats: ingen area för självkorsande eller för få hörn', () => {
    expect(G.areaStats([[0, 0], [10, 10], [10, 0], [0, 10]])).toMatchObject({ area: null, selfIntersecting: true });
    expect(G.areaStats([[0, 0], [10, 0]])).toMatchObject({ area: null, tooFew: true });
    expect(G.areaStats(REKT)).toMatchObject({ area: 1200, perimeter: 140, n: 4 });
  });

  it('tyngdpunkt', () => {
    expect(G.polygonCentroid(REKT)).toEqual([20, 15]);
  });

  it('format: enhet, tusental och ordet "plan"', () => {
    expect(nbsp(G.formatPlanArea(1214.3))).toBe('1 214 m² (plan)');
    expect(nbsp(G.formatPlanArea(56.25))).toBe('56,3 m² (plan)');
    expect(nbsp(G.formatPlanArea(3.14159))).toBe('3,14 m² (plan)');
    expect(nbsp(G.formatPlanLength(142.346))).toBe('142,35 m (plan)');
    expect(G.formatPlanArea(null)).toBe('–');
    // Hårt mellanslag – talet ska inte brytas över två rader.
    expect(G.formatPlanArea(1214)).toContain('\u00a0');
  });
});

// ── Datamodell ──────────────────────────────────────────────────────────────

describe('datamodell', () => {
  beforeEach(reset);

  it('addVisualArea: förval, löpande id, aktivt lager', () => {
    const { layer, area } = yta(REKT);
    const a = V.findVisualArea(area);
    expect(area).toBe('VA1');
    expect(a).toMatchObject({ layerId: layer, color: null, fillOpacity: 0.25, pattern: 'none',
                              blocksSight: false, linkedObsId: null });
    expect(a.vertices).toHaveLength(4);
    expect(V.visualAreaCoords(a)).toEqual(REKT);
  });

  it('minst tre hörn', () => {
    const l = V.addVisualLayer({ name: 'L' });
    const p = [V.addVisualPt({ E: 0, N: 0, layerId: l }), V.addVisualPt({ E: 1, N: 0, layerId: l })];
    expect(V.addVisualArea({ vertices: p.map(vis), layerId: l })).toBeNull();
    expect(getState().visualAreas).toEqual([]);
  });

  it('updateVisualArea sanerar opacitet, mönster och namn', () => {
    const { area } = yta(REKT);
    V.updateVisualArea(area, { fillOpacity: 7, pattern: 'prickar', name: '  Platta ' });
    expect(V.findVisualArea(area)).toMatchObject({ fillOpacity: 1, pattern: 'none', name: 'Platta' });
    V.updateVisualArea(area, { name: '' });
    expect('name' in V.findVisualArea(area)).toBe(false);
  });

  it('lagerraden räknar ytor', () => {
    const { layer } = yta(REKT);
    expect(V.visualLayerCounts(layer)).toEqual({ pts: 0, lines: 0, areas: 1 });
  });

  it('PM:ets lägen innehåller ytans hörn, också nätpunkter', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 100, N: 100 }] });
    const l = V.addVisualLayer({ name: 'Bro' });
    const p = [V.addVisualPt({ E: 0, N: 0, layerId: l, role: 'vertex' }),
               V.addVisualPt({ E: 10, N: 0, layerId: l, role: 'vertex' })];
    V.addVisualArea({ vertices: [...p.map(vis), net('A')], layerId: l });
    expect(V.visualLayerPositions(l)).toEqual([{ E: 0, N: 0 }, { E: 10, N: 0 }, { E: 100, N: 100 }]);
  });

  it('träfftest: inuti, på kanten, utanför och i dolt lager', () => {
    const { layer } = yta(REKT);
    const map = { latLngToContainerPoint: ([N, E]) => ({ x: E, y: -N }) };
    const ll = (E, N) => [N, E];
    const st = () => getState();
    expect(hitTestVisualArea(20, -15, st(), map, ll)?.id).toBe('VA1');
    expect(hitTestVisualArea(45, -15, st(), map, ll)?.id).toBe('VA1');   // 5 px från kanten
    expect(hitTestVisualArea(60, -15, st(), map, ll)).toBeNull();
    V.updateVisualLayer(layer, { visible: false });
    expect(hitTestVisualArea(20, -15, st(), map, ll)).toBeNull();
  });
});

// ── Radering och städning ───────────────────────────────────────────────────

describe('radering', () => {
  beforeEach(reset);

  it('ytans egna hörn tas bort med den, men inte nätpunkter eller delade punkter', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 40, N: 30 }] });
    const l = V.addVisualLayer({ name: 'L' });
    const a = V.addVisualPt({ E: 0, N: 0, layerId: l, role: 'vertex' });
    const b = V.addVisualPt({ E: 40, N: 0, layerId: l, role: 'vertex' });
    const c = V.addVisualPt({ E: 0, N: 30, layerId: l, role: 'vertex' });
    const fri = V.addVisualPt({ E: -10, N: -10, layerId: l });
    V.addVisualLine({ from: vis(b), to: vis(fri), layerId: l });          // b delas med en linje
    const area = V.addVisualArea({ vertices: [vis(a), vis(b), net('N1'), vis(c)], layerId: l });
    V.removeVisualArea(area);
    expect(getState().visualAreas).toEqual([]);
    expect(getState().visualPts.map(p => p.id).sort()).toEqual([b, fri].sort());
    expect(getState().pts.map(p => p.id)).toEqual(['N1']);
  });

  it('en borttagen hörnpunkt krymper ytan; under tre hörn försvinner ytan och hindret', () => {
    const { area, hörn } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    V.removeVisualPt(hörn[0]);
    expect(V.findVisualArea(area).vertices).toHaveLength(3);
    expect(getState().obstacles[0].points).toHaveLength(3);
    V.removeVisualPt(hörn[1]);
    expect(V.findVisualArea(area)).toBeNull();
    expect(getState().obstacles).toEqual([]);
  });

  it('radera lager tar bort dess ytor och kopplade hinder', () => {
    const { layer, area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    const n = V.removeVisualLayer(layer);
    expect(n.areas).toBe(1);
    expect(getState().visualAreas).toEqual([]);
    expect(getState().obstacles).toEqual([]);
    expect(getState().visualPts).toEqual([]);
  });
});

// ── Blockerar sikt ──────────────────────────────────────────────────────────

describe('Blockerar sikt (hinder)', () => {
  beforeEach(reset);

  it('på: ett polygonhinder med ytans koordinater, kopplat via linkedObsId', () => {
    const { area } = yta(REKT, { name: 'Hus' });
    expect(V.setVisualAreaBlocksSight(area, true)).toBe(true);
    const a = V.findVisualArea(area);
    const o = getState().obstacles[0];
    expect(a).toMatchObject({ blocksSight: true, linkedObsId: o.id });
    expect(o).toMatchObject({ type: 'polygon', source: 'visual', label: 'Yta (Hus)' });
    expect(o.points).toEqual(REKT);
  });

  it('hindret följer när ett hörn flyttas', () => {
    const { area, hörn } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    V.updateVisualPt(hörn[2], { E: 50, N: 40 });
    expect(getState().obstacles[0].points[2]).toEqual([50, 40]);
  });

  it('hindret följer när en förankrad nätpunkt flyttas', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 40, N: 30 }] });
    const l = V.addVisualLayer({ name: 'L' });
    const p = [[0, 0], [40, 0], [0, 30]].map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
    const area = V.addVisualArea({ vertices: [vis(p[0]), vis(p[1]), net('N1'), vis(p[2])], layerId: l });
    V.setVisualAreaBlocksSight(area, true);
    getState().pts[0].E = 60;            // som ett drag i interactions.js
    V.syncLinkedObstacles();
    expect(getState().obstacles[0].points[2]).toEqual([60, 30]);
  });

  it('av: hindret tas bort', () => {
    const { area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    V.setVisualAreaBlocksSight(area, false);
    expect(getState().obstacles).toEqual([]);
    expect(V.findVisualArea(area)).toMatchObject({ blocksSight: false, linkedObsId: null });
  });

  it('hindret raderat i hinder-panelen: ytan blockerar inte längre', () => {
    const { area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    removeObstacle(getState().obstacles[0].id);
    V.syncLinkedObstacles();
    expect(V.findVisualArea(area)).toMatchObject({ blocksSight: false, linkedObsId: null });
  });

  it('namnbyte följer till hindrets etikett', () => {
    const { area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    V.updateVisualArea(area, { name: 'Garage' });
    expect(getState().obstacles[0].label).toBe('Yta (Garage)');
  });

  it('siktlinjen genom ytan blockeras via hindret – och bara då', () => {
    const { area } = yta(REKT);
    const [a, b] = [{ E: -10, N: 15 }, { E: 50, N: 15 }];
    expect(hasLineOfSight(a, b, getState().obstacles).visible).toBe(true);
    V.setVisualAreaBlocksSight(area, true);
    expect(hasLineOfSight(a, b, getState().obstacles)).toMatchObject({ visible: false });
  });
});

// ── Separation från beräkningen ─────────────────────────────────────────────

describe('ytor påverkar aldrig simuleringen', () => {
  beforeEach(reset);

  const NÄT = {
    pts: [
      { id: 'FP1', type: 'known',   E: 0,   N: 0,   H: 0 },
      { id: 'FP2', type: 'known',   E: 100, N: 0,   H: 0 },
      { id: 'FP3', type: 'known',   E: 0,   N: 100, H: 0 },
      { id: 'S1',  type: 'station', E: 50,  N: 50,  H: 0 },
    ],
    meas: ['FP1', 'FP2', 'FP3'].map((to, i) => ({ id: `M${i + 1}`, from: 'S1', to, obsType: 'both',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 })),
  };

  it('simuleringsresultatet är identiskt med och utan ytor, även blockerande', () => {
    setState(JSON.parse(JSON.stringify(NÄT)));
    runSimulation();
    const före = JSON.stringify(getState().simResult);

    const { area } = yta([[60, -10], [90, -10], [90, 10], [60, 10]], { name: 'Hus' });
    runSimulation();
    expect(JSON.stringify(getState().simResult)).toBe(före);
    V.setVisualAreaBlocksSight(area, true);
    runSimulation();
    expect(JSON.stringify(getState().simResult)).toBe(före);
    expect(getState().pts.map(p => p.id)).toEqual(['FP1', 'FP2', 'FP3', 'S1']);
    expect(getState().meas).toHaveLength(3);
  });

  it('siktberäkningen ser bara hindret: samma resultat utan ytorna men med hindret', () => {
    setState(JSON.parse(JSON.stringify(NÄT)));
    // Linjen S1 → FP2 (y = 100 − x) går genom rutan 70–90 × 20–40.
    const { area } = yta([[70, 20], [90, 20], [90, 40], [70, 40]]);
    const { pts, meas } = getState();
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toEqual([]);

    V.setVisualAreaBlocksSight(area, true);
    const med = findBlockedMeasurements(meas, pts, getState().obstacles).map(b => b.meas.id);
    expect(med).toEqual(['M2']);   // S1 → FP2 går genom ytan

    // Ytorna bort, hindret kvar: exakt samma blockering.
    const hinder = JSON.parse(JSON.stringify(getState().obstacles));
    setState({ visualAreas: [], visualPts: [] });
    expect(findBlockedMeasurements(meas, pts, hinder).map(b => b.meas.id)).toEqual(med);
  });
});

// ── Nätpunkter ──────────────────────────────────────────────────────────────

describe('nätpunkter som hörn', () => {
  beforeEach(reset);

  function medNät(nNät) {
    const ptsN = [{ id: 'N1', type: 'known', E: 40, N: 30 }, { id: 'N2', type: 'known', E: 0, N: 30 }];
    setState({ pts: ptsN.slice(0, nNät) });
    const l = V.addVisualLayer({ name: 'L' });
    const fria = [[0, 0], [40, 0], [0, 30]].slice(0, 4 - nNät)
      .map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
    const vs = [...fria.map(vis), ...ptsN.slice(0, nNät).map(p => net(p.id))];
    return V.addVisualArea({ vertices: vs, layerId: l });
  }

  it('namnbyte flyttar referensen', () => {
    const area = medNät(1);
    V.renameNetPointInVisual('N1', 'K1');
    expect(V.findVisualArea(area).vertices.some(v => v.ref === 'net' && v.id === 'K1')).toBe(true);
    expect(V.findVisualArea(area).vertices.some(v => v.id === 'N1')).toBe(false);
  });

  it('radering: ytan tappar hörnet och behålls med tre hörn kvar', () => {
    const area = medNät(1);            // 3 fria + N1
    V.setVisualAreaBlocksSight(area, true);
    const r = V.dropNetPointFromVisual('N1');
    expect(r).toMatchObject({ areasChanged: 1, areasRemoved: 0 });
    expect(V.findVisualArea(area).vertices).toHaveLength(3);
    expect(getState().obstacles[0].points).toHaveLength(3);
  });

  it('radering: under tre hörn tas ytan och hindret bort', () => {
    const area = medNät(2);            // 2 fria + N1 + N2 = 4; ta bort båda nätpunkterna
    V.setVisualAreaBlocksSight(area, true);
    V.dropNetPointFromVisual('N1');
    expect(V.findVisualArea(area)).not.toBeNull();
    V.dropNetPointFromVisual('N2');
    expect(V.findVisualArea(area)).toBeNull();
    expect(getState().obstacles).toEqual([]);
  });

  it('linjer i nätpunkten tas bort som förut', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 0, N: 0 }] });
    const l = V.addVisualLayer({ name: 'L' });
    const p = V.addVisualPt({ E: 5, N: 5, layerId: l });
    V.addVisualLine({ from: net('N1'), to: vis(p), layerId: l });
    expect(V.dropNetPointFromVisual('N1').lines).toBe(1);
    expect(getState().visualLines).toEqual([]);
  });

  it('självkorsning upptäcks när en förankrad nätpunkt flyttas över en kant', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 40, N: 30 }] });
    const l = V.addVisualLayer({ name: 'L' });
    const p = [[0, 0], [40, 0], [0, 30]].map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
    const area = V.addVisualArea({ vertices: [vis(p[0]), vis(p[1]), net('N1'), vis(p[2])], layerId: l });
    const stats = () => G.areaStats(V.visualAreaCoords(V.findVisualArea(area)));
    expect(stats()).toMatchObject({ area: 1200, selfIntersecting: false });
    getState().pts[0].E = -20;         // över kanten 0,0 → 0,30
    getState().pts[0].N = 10;
    expect(stats()).toMatchObject({ area: null, selfIntersecting: true });
  });
});

// ── Ritverktyget ────────────────────────────────────────────────────────────

describe('ritverktyget', () => {
  beforeEach(() => { reset(); D.cancelVisualDraw(); });
  const klick = (E, N) => D.handleVisualMapClick({ lat: N, lng: E });

  it('klick på första hörnet sluter ytan; ytan markeras', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0); klick(40, 30);
    const r = klick(1, 1);   // inom 10 px från första hörnet
    expect(r).toMatchObject({ created: 'area', ok: true, selfIntersecting: false });
    const a = getState().visualAreas[0];
    expect(V.visualAreaCoords(a)).toEqual([[0, 0], [40, 0], [40, 30]]);
    expect(getState().selVisualId).toBe(a.id);
    expect(getState().visualPts.every(p => p.role === 'vertex')).toBe(true);
    expect(D.getVisualDrawMode()).toBe('area');   // läget står kvar
  });

  it('dubbelklick: klicket på samma ställe räknas inte två gånger', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0); klick(40, 30);
    klick(40.5, 30.5);                            // dubbelklickets andra klick
    expect(D.getPendingAreaVertices()).toHaveLength(3);
    expect(D.completeVisualArea().ok).toBe(true);
  });

  it('färre än tre hörn sluts inte', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0);
    expect(D.completeVisualArea()).toMatchObject({ ok: false, reason: 'few' });
    expect(getState().visualAreas).toEqual([]);
  });

  it('Backspace tar bort senaste hörnet', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0); klick(99, 99);
    expect(D.undoLastAreaVertex()).toBe(true);
    klick(40, 30);
    expect(D.getPendingAreaVertices().map(v => [v.E, v.N])).toEqual([[0, 0], [40, 0], [40, 30]]);
  });

  it('avbruten yta lämnar inga punkter efter sig', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0); klick(40, 30);
    D.discardPendingArea();
    D.cancelVisualDraw();
    expect(getState().visualPts).toEqual([]);
    expect(getState().visualAreas).toEqual([]);
  });

  it('snappning mot en nätpunkt ger ref:"net"', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 40, N: 30 }] });
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0);
    D.updateVisualMousePos({ lat: 31, lng: 41 }, { x: 41, y: -31 });   // nära N1
    klick(41, 31);
    D.updateVisualMousePos({ lat: 50, lng: 50 }, { x: 500, y: 500 });  // ingen snap
    D.completeVisualArea();
    const vs = getState().visualAreas[0].vertices;
    expect(vs[2]).toEqual({ ref: 'net', id: 'N1' });
    expect(getState().visualPts).toHaveLength(2);   // bara de fria hörnen blev punkter
  });

  it('självkorsande yta skapas men rapporteras', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 30); klick(40, 0); klick(0, 30);
    expect(D.completeVisualArea()).toMatchObject({ ok: true, selfIntersecting: true });
  });

  it('en ritad yta är ett ångra-steg', () => {
    D.startVisualAreaDraw();
    klick(0, 0); klick(40, 0); klick(40, 30);
    D.completeVisualArea();
    undo();
    expect(getState().visualAreas).toEqual([]);
    expect(getState().visualPts).toEqual([]);
  });
});

// ── Ångra för ändra och ta bort ─────────────────────────────────────────────

describe('ångra', () => {
  beforeEach(reset);

  it('ändra yta', () => {
    const { area } = yta(REKT);
    saveUndo('mönster');
    V.updateVisualArea(area, { pattern: 'grid' });
    undo();
    expect(V.findVisualArea(area).pattern).toBe('none');
  });

  it('blockerar sikt', () => {
    const { area } = yta(REKT);
    saveUndo('sikt');
    V.setVisualAreaBlocksSight(area, true);
    undo();
    expect(V.findVisualArea(area).linkedObsId).toBeNull();
    expect(getState().obstacles).toEqual([]);
  });

  it('ta bort yta återställer ytan, hörnen och hindret', () => {
    const { area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    saveUndo('ta bort');
    V.removeVisualArea(area);
    undo();
    expect(V.findVisualArea(area)).not.toBeNull();
    expect(getState().visualPts).toHaveLength(4);
    expect(getState().obstacles).toHaveLength(1);
  });
});

// ── Persistens ──────────────────────────────────────────────────────────────

describe('persistens', () => {
  beforeEach(() => { reset(); localStorage.clear(); });

  it('projektfilen bär ytor, räknare och hinderkoppling', () => {
    const { area } = yta(REKT, { name: 'Hus', pattern: 'hatch', fillOpacity: 0.5 });
    V.setVisualAreaBlocksSight(area, true);
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    expect(snap.nVaid).toBe(2);
    reset();
    _applySnapshot(snap);
    const a = V.findVisualArea(area);
    expect(a).toMatchObject({ name: 'Hus', pattern: 'hatch', fillOpacity: 0.5, blocksSight: true });
    expect(getState().obstacles.map(o => o.id)).toEqual([a.linkedObsId]);
    expect(V.addVisualArea({ vertices: a.vertices })).toBe('VA2');
  });

  it('äldre projektfil utan visualAreas laddas utan fel', () => {
    expect(() => _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [] })).not.toThrow();
    expect(getState().visualAreas).toEqual([]);
    expect(getState().nVaid).toBe(1);
  });

  it('sanering: för få hörn kastas, blocksSight utan koppling blir false, okänt lager → Handritat', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [],
      visualPts: [{ id: 'V1', E: 0, N: 0 }, { id: 'V2', E: 1, N: 0 }, { id: 'V3', E: 0, N: 1 }],
      visualAreas: [
        { id: 'VA1', layerId: 'VLY9', vertices: [{ ref: 'visual', id: 'V1' }, { ref: 'visual', id: 'V2' }, { ref: 'x', id: 'V3' }],
          blocksSight: true, pattern: 'zebra', fillOpacity: 'mycket' },
        { id: 'VA2', vertices: [{ ref: 'visual', id: 'V1' }, { id: 7 }] },
      ] });
    const [a] = getState().visualAreas;
    expect(getState().visualAreas).toHaveLength(1);
    expect(a).toMatchObject({ blocksSight: false, linkedObsId: null, pattern: 'none', fillOpacity: 0.25 });
    expect(a.vertices[2]).toEqual({ ref: 'visual', id: 'V3' });
    expect(V.findVisualLayer(a.layerId).name).toBe(V.VISUAL_LAYER_FALLBACK_NAME);
    expect(getState().nVaid).toBe(2);
  });

  it('autosave: ytor och deras hinder överlever en omladdning', () => {
    const { area } = yta(REKT);
    V.setVisualAreaBlocksSight(area, true);
    expect(writeAutosaveNow().ok).toBe(true);
    reset();
    expect(loadAutosave()).toBe(true);
    expect(V.findVisualArea(area)).toMatchObject({ blocksSight: true });
    expect(getState().obstacles).toHaveLength(1);
    expect(getState().nVaid).toBe(2);
  });

  it('autosave från före ytorna laddas utan ytor', () => {
    localStorage.setItem('stomnät_autosave', JSON.stringify({ ver: 2, pts: [], meas: [] }));
    expect(loadAutosave()).toBe(true);
    expect(getState().visualAreas).toEqual([]);
  });
});

// ── Import ──────────────────────────────────────────────────────────────────

describe('import av slutna linjer som ytor', () => {
  beforeEach(reset);

  it('closedRing: flagga, upprepat första hörn, för få hörn', () => {
    expect(closedRing(['a', 'b', 'c'], true)).toEqual(['a', 'b', 'c']);
    expect(closedRing(['a', 'b', 'c', 'a'], false)).toEqual(['a', 'b', 'c']);
    expect(closedRing(['a', 'b', 'c'], false)).toBeNull();
    expect(closedRing(['a', 'b', 'a'], false)).toBeNull();
    expect(closedRing(['a', 'b', 'b', 'c'], true)).toEqual(['a', 'b', 'c']);
  });

  it('isClosedPolyline räknar som dialogen', () => {
    const v = [[0, 0], [10, 0], [10, 10], [0, 0]].map(([E, N]) => ({ E, N }));
    expect(isClosedPolyline(v, false)).toBe(true);
    expect(isClosedPolyline(v.slice(0, 3), false)).toBe(false);
    expect(isClosedPolyline(v.slice(0, 3), true)).toBe(true);
    expect(isClosedPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], true)).toBe(true);
  });

  const geo = () => ({
    points: [], fileInfo: {},
    lines: [
      { name: 'HUS', closed: true, vertices: [[0, 0], [10, 0], [10, 10], [0, 10]]
          .map(([E, N], i) => ({ name: `${i}`, E, N, H: null })) },
      { name: 'PLATTA', closed: false, vertices: [[20, 0], [30, 0], [30, 10], [20, 0]]
          .map(([E, N], i) => ({ name: `${i}`, E, N, H: null })) },
      { name: 'KANT', closed: false, vertices: [[40, 0], [50, 0]]
          .map(([E, N], i) => ({ name: `${i}`, E, N, H: null })) },
    ],
  });

  it('.geo: förval linjer – som förut', () => {
    const r = applyGeoImport(geo(), defaultGeoImportOptions(geo(), 'a.geo', 'sweref99tm'));
    expect(r.areasCreated).toBe(0);
    expect(getState().visualAreas).toEqual([]);
    expect(r.linesCreated).toBe(4 + 3 + 1);
  });

  it('.geo: ytor – flagga 1 och upprepat första hörn blir ytor, öppna linjer förblir linjer', () => {
    const opts = { ...defaultGeoImportOptions(geo(), 'a.geo', 'sweref99tm'), closedAs: 'areas' };
    const r = applyGeoImport(geo(), opts);
    expect(r.areasCreated).toBe(2);
    expect(r.linesCreated).toBe(1);
    const [hus, platta] = getState().visualAreas;
    expect(hus.name).toBe('HUS');
    expect(G.polygonArea(V.visualAreaCoords(hus))).toBe(100);
    expect(platta.vertices).toHaveLength(3);
    expect(getState().obstacles).toEqual([]);
  });

  it('.geo: ytor + Hinder ger blockerande ytor', () => {
    const opts = { ...defaultGeoImportOptions(geo(), 'a.geo', 'sweref99tm'), closedAs: 'areas', lines: 'obstacle' };
    const r = applyGeoImport(geo(), opts);
    expect(getState().visualAreas.every(a => a.blocksSight)).toBe(true);
    expect(getState().obstacles.filter(o => o.type === 'polygon')).toHaveLength(2);
    expect(r.obstaclesCreated).toBe(2 + 1);   // två ytor och en vägg
  });

  const dxf = () => ({
    header: { insunits: 6 },
    layers: [{ name: 'A', supported: true }],
    warnings: [],
    entities: [
      { type: 'LWPOLYLINE', layer: 'A', closed: true,
        vertices: [[0, 0], [10, 0], [10, 10], [0, 10]].map(([x, y]) => ({ x, y, z: 0 })) },
      { type: 'LWPOLYLINE', layer: 'A', closed: false,
        vertices: [[20, 0], [30, 0]].map(([x, y]) => ({ x, y, z: 0 })) },
    ],
  });

  it('DXF: förval linjer – som förut', () => {
    const r = applyDxfImport(dxf(), defaultDxfImportOptions(dxf(), 'a.dxf'));
    expect(r.areasCreated).toBe(0);
    expect(r.linesCreated).toBe(4 + 1);
  });

  it('DXF: slutna polylinjer som ytor', () => {
    const r = applyDxfImport(dxf(), { ...defaultDxfImportOptions(dxf(), 'a.dxf'), closedAs: 'areas' });
    expect(r.areasCreated).toBe(1);
    expect(r.linesCreated).toBe(1);
    expect(G.polygonArea(V.visualAreaCoords(getState().visualAreas[0]))).toBe(100);
  });
});

describe('pekskärm', () => {
  beforeEach(() => { reset(); D.cancelVisualDraw(); });

  it('grov pekare: första hörnet går att träffa inom 22 px', () => {
    const orig = window.matchMedia;
    window.matchMedia = q => ({ matches: q === '(pointer: coarse)' });
    try {
      D.startVisualAreaDraw();
      for (const [E, N] of [[0, 0], [100, 0], [100, 100]]) D.handleVisualMapClick({ lat: N, lng: E });
      expect(D.handleVisualMapClick({ lat: 15, lng: 15 })).toMatchObject({ created: 'area' });  // 21 px bort
    } finally { window.matchMedia = orig; }
  });

  it('mus: 21 px bort blir ett nytt hörn', () => {
    D.startVisualAreaDraw();
    for (const [E, N] of [[0, 0], [100, 0], [100, 100]]) D.handleVisualMapClick({ lat: N, lng: E });
    expect(D.handleVisualMapClick({ lat: 15, lng: 15 })).toMatchObject({ created: null, vertices: 4 });
  });
});
