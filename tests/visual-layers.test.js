// Etapp 1: visuella lager – namngivna behållare för det visuella lagret.
// – datamodell: lager, aktivt lager, färg- och synlighetsarv
// – migrering: projektfiler och autosparningar från före Etapp 1
// – radering av lager städar objekt OCH kopplade hinder
// – separationen mot simuleringen gäller fortfarande med lager inblandade

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VISUAL_DEFAULT_COLOR, VISUAL_LAYER_FALLBACK_NAME,
  addVisualLayer, getVisualLayers, findVisualLayer, updateVisualLayer,
  removeVisualLayer, setActiveVisualLayer, ensureActiveVisualLayer,
  isVisualLayerVisible, isVisualObjVisible, visualObjColor, visualPtLabel,
  visualLayerCounts,
  addVisualPt, addVisualLine, makeEndpoint, findVisualPt, findVisualLine,
  visualLineCoords, _sanitizeVisual, _migrateVisualLayers,
} from '../src/state/visual.js';
import { hitTestVisualPt, hitTestVisualLine } from '../src/map/visual-canvas.js';
import { addObstacle } from '../src/state/obstacles.js';
import { getState, setState } from '../src/state/store.js';
import { _buildSnapshot, _applySnapshot } from '../src/io/export-project.js';
import { saveUndo, undo } from '../src/state/undo.js';
import { runSimulation } from '../src/core/simulation.js';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
  symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 1, nId: 1,
};

const reset = () => setState({ ...BASE });

describe('lager som datamodell', () => {
  beforeEach(reset);

  it('addVisualLayer ger löpande id och normaliserad source', () => {
    const a = addVisualLayer({ name: 'Bottenplatta', color: '#FFD54F',
                               source: { kind: 'geo', filename: 'x.geo', crs: 'sweref991545' } });
    const b = addVisualLayer({ name: 'Ritning' });
    expect(a).toBe('VLY1');
    expect(b).toBe('VLY2');
    expect(findVisualLayer(a)).toMatchObject({
      name: 'Bottenplatta', color: '#ffd54f', visible: true,
      source: { kind: 'geo', filename: 'x.geo', crs: 'sweref991545' },
    });
    // Okänd kind faller tillbaka på 'manual'
    expect(findVisualLayer(b).source).toEqual({ kind: 'manual', filename: null, crs: null });
  });

  it('första lagret blir aktivt, senare lager ändrar inte aktivt lager', () => {
    const a = addVisualLayer({ name: 'A' });
    addVisualLayer({ name: 'B' });
    expect(getState().activeVisualLayerId).toBe(a);
  });

  it('objekt ritade utan lager hamnar i ett nyskapat "Handritat"', () => {
    const p = addVisualPt({ E: 1, N: 2 });
    const layers = getVisualLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe(VISUAL_LAYER_FALLBACK_NAME);
    expect(findVisualPt(p).layerId).toBe(layers[0].id);
  });

  it('objekt hamnar i aktivt lager', () => {
    addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    setActiveVisualLayer(b);
    const p = addVisualPt({ E: 0, N: 0 });
    const q = addVisualPt({ E: 1, N: 1 });
    const l = addVisualLine({ from: makeEndpoint('visual', p), to: makeEndpoint('visual', q) });
    expect(findVisualPt(p).layerId).toBe(b);
    expect(findVisualLine(l).layerId).toBe(b);
    expect(visualLayerCounts(b)).toEqual({ pts: 2, lines: 1, areas: 0 });
  });

  it('explicit layerId vid import vinner över aktivt lager', () => {
    const a = addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    setActiveVisualLayer(a);
    const p = addVisualPt({ E: 0, N: 0, layerId: b });
    expect(findVisualPt(p).layerId).toBe(b);
  });

  it('okänt layerId faller tillbaka på aktivt lager i stället för att bli null', () => {
    const a = addVisualLayer({ name: 'A' });
    const p = addVisualPt({ E: 0, N: 0, layerId: 'FINNS_EJ' });
    expect(findVisualPt(p).layerId).toBe(a);
  });

  it('ensureActiveVisualLayer läker ett aktivt lager som pekar på ingenting', () => {
    const a = addVisualLayer({ name: 'A' });
    setState({ activeVisualLayerId: 'VLY99' });
    expect(ensureActiveVisualLayer()).toBe(a);
  });

  it('setActiveVisualLayer avvisar okänt id', () => {
    const a = addVisualLayer({ name: 'A' });
    expect(setActiveVisualLayer('VLY99')).toBe(false);
    expect(getState().activeVisualLayerId).toBe(a);
  });

  it('updateVisualLayer byter namn, färg och synlighet', () => {
    const a = addVisualLayer({ name: 'A' });
    updateVisualLayer(a, { name: '  Nytt namn ', color: '#ABC', visible: false });
    expect(findVisualLayer(a)).toMatchObject({ name: 'Nytt namn', color: '#aabbcc', visible: false });
    // Tomt namn ignoreras – ett lager utan namn går inte att peka ut i panelen.
    updateVisualLayer(a, { name: '   ' });
    expect(findVisualLayer(a).name).toBe('Nytt namn');
  });

  it('valfria fält skrivs bara när de har värde', () => {
    const plain    = findVisualPt(addVisualPt({ E: 0, N: 0 }));
    const imported = findVisualPt(addVisualPt({ E: 0, N: 0, name: '8', attrs: { UB: 'x' }, role: 'vertex' }));
    expect('name' in plain).toBe(false);
    expect('role' in plain).toBe(false);
    expect(imported).toMatchObject({ name: '8', attrs: { UB: 'x' }, role: 'vertex' });
    expect(visualPtLabel(imported)).toBe('8');
    expect(visualPtLabel(plain)).toBe(plain.id);
  });
});

describe('färgarv', () => {
  beforeEach(reset);

  it('objektets färg → lagrets färg → standardfärg', () => {
    const a = addVisualLayer({ name: 'A', color: '#4dd0e1' });
    const utan = findVisualPt(addVisualPt({ E: 0, N: 0 }));
    const med  = findVisualPt(addVisualPt({ E: 1, N: 1, color: '#f06292' }));
    expect(visualObjColor(utan)).toBe('#4dd0e1');
    expect(visualObjColor(med)).toBe('#f06292');

    updateVisualLayer(a, { color: null });
    expect(visualObjColor(findVisualPt(utan.id))).toBe(VISUAL_DEFAULT_COLOR);
  });
});

describe('synlighet', () => {
  beforeEach(reset);

  // Minimal kart-stubb: E/N tolkas rakt av som pixlar.
  const map = { latLngToContainerPoint: ({ x, y }) => ({ x, y }) };
  const ENtoLatLng = (E, N) => ({ x: E, y: N });

  function twoLayers() {
    const a = addVisualLayer({ name: 'Synligt' });
    const b = addVisualLayer({ name: 'Dolt' });
    const pa  = addVisualPt({ E: 10,  N: 10,  layerId: a });
    const pa2 = addVisualPt({ E: 40,  N: 10,  layerId: a });
    const pb  = addVisualPt({ E: 100, N: 100, layerId: b });
    const pb2 = addVisualPt({ E: 140, N: 100, layerId: b });
    const la = addVisualLine({ from: makeEndpoint('visual', pa), to: makeEndpoint('visual', pa2), layerId: a });
    const lb = addVisualLine({ from: makeEndpoint('visual', pb), to: makeEndpoint('visual', pb2), layerId: b });
    updateVisualLayer(b, { visible: false });
    return { a, b, pa, pb, la, lb };
  }

  it('isVisualLayerVisible speglar lagrets flagga', () => {
    const { a, b } = twoLayers();
    expect(isVisualLayerVisible(a)).toBe(true);
    expect(isVisualLayerVisible(b)).toBe(false);
    // Objekt vars lager saknas behandlas som synligt.
    expect(isVisualObjVisible({ layerId: 'FINNS_EJ' })).toBe(true);
  });

  it('objekt i dolt lager går inte att träffa på kartan', () => {
    const { pa } = twoLayers();
    const st = getState();
    expect(hitTestVisualPt(10, 10, st, map, ENtoLatLng)?.id).toBe(pa);
    expect(hitTestVisualPt(100, 100, st, map, ENtoLatLng)).toBeNull();
    expect(hitTestVisualPt(0, 0, st, map, ENtoLatLng)).toBeNull();
  });

  it('linje i dolt lager går inte att träffa', () => {
    const { la } = twoLayers();
    const st = getState();
    expect(hitTestVisualLine(25, 10, st, map, ENtoLatLng)?.id).toBe(la);
    expect(hitTestVisualLine(120, 100, st, map, ENtoLatLng)).toBeNull();
  });
});

describe('radering av lager', () => {
  beforeEach(reset);

  it('tar bort lagrets punkter och linjer', () => {
    const a = addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    const p1 = addVisualPt({ E: 0, N: 0, layerId: a });
    const p2 = addVisualPt({ E: 1, N: 0, layerId: a });
    addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    const q = addVisualPt({ E: 9, N: 9, layerId: b });

    const n = removeVisualLayer(a);
    expect(n).toEqual({ pts: 2, lines: 1, areas: 0 });   // areas: Lager-verktyg Etapp 3
    expect(getVisualLayers().map(l => l.id)).toEqual([b]);
    expect(getState().visualPts.map(p => p.id)).toEqual([q]);
    expect(getState().visualLines).toEqual([]);
  });

  it('kopplat hinder städas bort med lagret', () => {
    const a = addVisualLayer({ name: 'A' });
    const p1 = addVisualPt({ E: 0, N: 0, layerId: a });
    const p2 = addVisualPt({ E: 10, N: 0, layerId: a });
    const lineId = addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    const obsId = addObstacle({
      type: 'line', source: 'visual', points: visualLineCoords(findVisualLine(lineId)),
    });
    setState({ visualLines: getState().visualLines.map(l => l.id === lineId ? { ...l, linkedObsIds: [obsId] } : l) });

    removeVisualLayer(a);
    expect(getState().obstacles.find(o => o.id === obsId)).toBeUndefined();
  });

  it('okopplade hinder rörs inte', () => {
    const a = addVisualLayer({ name: 'A' });
    const fristaende = addObstacle({ type: 'line', points: [[0, 0], [1, 1]] });
    addVisualPt({ E: 0, N: 0, layerId: a });
    removeVisualLayer(a);
    expect(getState().obstacles.find(o => o.id === fristaende)).toBeDefined();
  });

  it('aktivt lager flyttas till ett kvarvarande lager, annars null', () => {
    const a = addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    setActiveVisualLayer(b);
    removeVisualLayer(b);
    expect(getState().activeVisualLayerId).toBe(a);
    removeVisualLayer(a);
    expect(getState().activeVisualLayerId).toBeNull();
  });

  it('okänt lager-id gör ingenting', () => {
    const a = addVisualLayer({ name: 'A' });
    addVisualPt({ E: 0, N: 0, layerId: a });
    expect(removeVisualLayer('VLY99')).toEqual({ pts: 0, lines: 0, areas: 0 });
    expect(getState().visualPts).toHaveLength(1);
  });
});

describe('migrering av äldre projektfil', () => {
  beforeEach(reset);

  // Objekten saknar layerId – exakt så en fil sparad före Etapp 1 ser ut.
  const GAMMAL = {
    ver: 3, pts: [], meas: [], obstacles: [],
    visualPts: [{ id: 'V1', E: 0, N: 0, color: '#ffd54f' }, { id: 'V2', E: 10, N: 0 }],
    visualLines: [{ id: 'VL1', from: { ref: 'visual', id: 'V1' }, to: { ref: 'visual', id: 'V2' } }],
  };

  it('objekt utan layerId samlas i "Handritat"', () => {
    _applySnapshot(GAMMAL);
    const layers = getVisualLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe(VISUAL_LAYER_FALLBACK_NAME);
    expect(getState().visualPts.every(p => p.layerId === layers[0].id)).toBe(true);
    expect(getState().visualLines[0].layerId).toBe(layers[0].id);
    expect(getState().activeVisualLayerId).toBe(layers[0].id);
    // Färger och koordinater överlever migreringen oförändrade.
    expect(getState().visualPts[0].color).toBe('#ffd54f');
    expect(visualLineCoords(findVisualLine('VL1'))).toEqual([[0, 0], [10, 0]]);
  });

  it('lager-räknaren hamnar efter migreringslagret', () => {
    _applySnapshot(GAMMAL);
    const first = getVisualLayers()[0].id;
    const next = addVisualLayer({ name: 'Nytt' });
    expect(next).not.toBe(first);
  });

  it('fil helt utan visuellt innehåll får inga lager', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [] });
    expect(getVisualLayers()).toEqual([]);
    expect(getState().activeVisualLayerId).toBeNull();
  });

  it('ver:1-fil laddas utan lager och utan att krascha', () => {
    _applySnapshot({ ver: 1, pts: [], meas: [] });
    expect(getVisualLayers()).toEqual([]);
  });

  it('lager i filen bevaras och objekten behåller sitt lager', () => {
    const a = addVisualLayer({ name: 'Bottenplatta', color: '#4dd0e1', source: { kind: 'geo', filename: 'b.geo' } });
    addVisualPt({ E: 5, N: 5, layerId: a, name: '8', role: 'vertex' });
    updateVisualLayer(a, { visible: false });

    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    reset();
    _applySnapshot(snap);

    const l = getVisualLayers()[0];
    expect(l).toMatchObject({ name: 'Bottenplatta', color: '#4dd0e1', visible: false });
    expect(l.source.kind).toBe('geo');
    expect(getState().visualPts[0]).toMatchObject({ layerId: l.id, name: '8', role: 'vertex' });
  });

  it('blandad fil: objekt med okänt layerId hamnar i "Handritat", övriga står kvar', () => {
    _applySnapshot({
      ver: 3, pts: [], meas: [], obstacles: [],
      visualLayers: [{ id: 'VLY1', name: 'Import', color: '#aed581', visible: true, source: { kind: 'geo' } }],
      activeVisualLayerId: 'VLY1',
      visualPts: [
        { id: 'V1', E: 0, N: 0, layerId: 'VLY1' },
        { id: 'V2', E: 1, N: 1, layerId: 'BORTA' },
        { id: 'V3', E: 2, N: 2 },
      ],
      visualLines: [],
    });
    const layers = getVisualLayers();
    expect(layers.map(l => l.name)).toEqual(['Import', VISUAL_LAYER_FALLBACK_NAME]);
    const handritat = layers[1].id;
    expect(getState().visualPts.map(p => p.layerId)).toEqual(['VLY1', handritat, handritat]);
  });

  it('_migrateVisualLayers återanvänder ett befintligt "Handritat"', () => {
    const r = _migrateVisualLayers(
      [{ id: 'V1', E: 0, N: 0 }],
      [],
      [{ id: 'VLY1', name: VISUAL_LAYER_FALLBACK_NAME }],
      null);
    expect(r.visualLayers).toHaveLength(1);
    expect(r.visualPts[0].layerId).toBe('VLY1');
    expect(r.activeVisualLayerId).toBe('VLY1');
  });

  it('_migrateVisualLayers tål tomma indata', () => {
    expect(_migrateVisualLayers(undefined, undefined, undefined, undefined))
      .toEqual({ visualPts: [], visualLines: [], visualAreas: [], visualLayers: [],
                 activeVisualLayerId: null, nVlyid: 1 });   // visualAreas: Etapp 3
  });

  it('_sanitizeVisual bär med layerId och kastar det som inte är en sträng', () => {
    const { visualPts, visualLines } = _sanitizeVisual(
      [{ id: 'V1', E: 0, N: 0, layerId: 'VLY1' }, { id: 'V2', E: 1, N: 1, layerId: 7 }],
      [{ id: 'VL1', layerId: 'VLY1', from: { ref: 'visual', id: 'V1' }, to: { ref: 'visual', id: 'V2' } }]);
    expect(visualPts.map(p => p.layerId)).toEqual(['VLY1', null]);
    expect(visualLines[0].layerId).toBe('VLY1');
  });
});

describe('migrering av autosparning', () => {
  beforeEach(() => { reset(); localStorage.clear(); });

  async function load(snapshot) {
    localStorage.setItem('stomnät_autosave', JSON.stringify(snapshot));
    const m = await import('../src/state/persistence.js');
    return m.loadAutosave();
  }

  it('autosparning från före Etapp 1 laddas utan visuellt innehåll', async () => {
    expect(await load({ ver: 2, pts: [], meas: [], centerErr: 1.0, nMid: 1 })).toBe(true);
    expect(getState().visualPts).toEqual([]);
    expect(getVisualLayers()).toEqual([]);
  });

  it('visuella objekt utan layerId i autosparningen hamnar i "Handritat"', async () => {
    await load({
      ver: 2, pts: [], meas: [], centerErr: 1.0, nMid: 1,
      visualPts: [{ id: 'V1', E: 3, N: 4 }], visualLines: [],
    });
    const layers = getVisualLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe(VISUAL_LAYER_FALLBACK_NAME);
    expect(getState().visualPts[0]).toMatchObject({ E: 3, N: 4, layerId: layers[0].id });
  });
});

describe('ångra', () => {
  beforeEach(reset);

  it('ångrar skapandet av ett lager tillsammans med dess objekt', () => {
    saveUndo('före');
    const a = addVisualLayer({ name: 'Import', source: { kind: 'geo' } });
    addVisualPt({ E: 1, N: 1, layerId: a });
    undo();
    expect(getVisualLayers()).toEqual([]);
    expect(getState().visualPts).toEqual([]);
    expect(getState().activeVisualLayerId).toBeNull();
  });
});

describe('separation från simuleringen', () => {
  beforeEach(reset);

  it('simuleringsresultatet är identiskt med och utan visuella lager', () => {
    setState({
      pts: [
        { id: 'FP1', type: 'known',   E: 0,   N: 0,   H: 0 },
        { id: 'FP2', type: 'known',   E: 100, N: 0,   H: 0 },
        { id: 'FP3', type: 'known',   E: 0,   N: 100, H: 0 },
        { id: 'S1',  type: 'station', E: 50,  N: 50,  H: 0 },
      ],
      meas: [
        { id: 'M1', from: 'S1', to: 'FP1', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
        { id: 'M2', from: 'S1', to: 'FP2', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
        { id: 'M3', from: 'S1', to: 'FP3', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
      ],
    });
    runSimulation();
    const before = JSON.stringify(getState().simResult);

    const a = addVisualLayer({ name: 'Ritning', color: '#4dd0e1', source: { kind: 'dxf', filename: 'r.dxf' } });
    const p1 = addVisualPt({ E: 25, N: 25, layerId: a, role: 'vertex' });
    const p2 = addVisualPt({ E: 75, N: 75, layerId: a, role: 'vertex' });
    addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    runSimulation();

    expect(JSON.stringify(getState().simResult)).toBe(before);
    // Lagret får inte läcka in i nätdata.
    expect(getState().pts.map(p => p.id)).toEqual(['FP1', 'FP2', 'FP3', 'S1']);
    expect(getState().meas).toHaveLength(3);
  });
});
