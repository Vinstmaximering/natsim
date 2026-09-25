// Etapp 6: DXF-importen – omräkning, axelordning, lagerstruktur och
// rimlighetskontroll. Parsern testas i parse-dxf.test.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseDxf } from '../src/io/parse-dxf.js';
import {
  applyDxfImport, defaultDxfImportOptions, assignLayerColors, axisSanity,
  dxfToEN, unitFactor, netCentroid, stripExtension,
  AXIS_SANITY_MAX_DIST_M, AXIS_ORDERS,
} from '../src/io/dxf-import.js';
import { VERTEX_DEDUP_TOL_M } from '../src/io/vertex-index.js';
import { getState, setState } from '../src/state/store.js';
import {
  getVisualLayers, findVisualLayer, visualLineCoords, visualLineSegments, findVisualPt,
} from '../src/state/visual.js';
import { undo, getUndoStack } from '../src/state/undo.js';
import { runSimulation } from '../src/core/simulation.js';

const dxf = (...pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
const SECTION = n => [[0, 'SECTION'], [2, n]];
const ENDSEC  = [[0, 'ENDSEC']];
const EOF     = [[0, 'EOF']];
const entities = (...body) => dxf(...SECTION('ENTITIES'), ...body, ...ENDSEC, ...EOF);
const withUnit = (kod, ...body) => dxf(
  ...SECTION('HEADER'), [9, '$INSUNITS'], [70, kod], ...ENDSEC,
  ...SECTION('ENTITIES'), ...body, ...ENDSEC, ...EOF);

const LINE = (layer, x1, y1, x2, y2, z1 = 0, z2 = 0) => [
  [0, 'LINE'], [8, layer],
  [10, x1], [20, y1], [30, z1], [11, x2], [21, y2], [31, z2],
];
const LW = (layer, flags, ...vs) => [
  [0, 'LWPOLYLINE'], [8, layer], [90, vs.length], [70, flags],
  ...vs.flatMap(([x, y]) => [[10, x], [20, y]]),
];

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  netVisible: true, obstaclesVisible: true,
  activeCRS: 'sweref991545', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
  symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 1, nId: 1,
};
const reset = () => setState({ ...BASE });

const opts = (parsed, over = {}) => ({
  ...defaultDxfImportOptions(parsed, 'Ritning_A.dxf'),
  ...over,
});

beforeEach(reset);

// ── Standardval ──────────────────────────────────────────────────────────────

describe('standardval', () => {
  it('tar enheten ur filen när den finns', () => {
    const p = parseDxf(withUnit(4, ...LINE('A', 0, 0, 1, 1)));
    expect(defaultDxfImportOptions(p, 'x.dxf').unitCode).toBe(4);
  });

  it('faller tillbaka på meter när enheten saknas eller är enhetslös', () => {
    expect(defaultDxfImportOptions(parseDxf(entities(...LINE('A', 0, 0, 1, 1))), 'x.dxf').unitCode).toBe(6);
    expect(defaultDxfImportOptions(parseDxf(withUnit(0, ...LINE('A', 0, 0, 1, 1))), 'x.dxf').unitCode).toBe(6);
  });

  it('X → E är förvalt och Z-värden används', () => {
    const o = defaultDxfImportOptions(parseDxf(entities(...LINE('A', 0, 0, 1, 1))), 'x.dxf');
    expect(o.axisOrder).toBe('xe');
    expect(o.useZ).toBe(true);
    expect(o.layerStructure).toBe('per');
    expect(o.layerName).toBe('x');
  });

  it('bara lager med stött innehåll är förvalda', () => {
    const p = parseDxf(entities(...LINE('MUR', 0, 0, 1, 1), [0, 'TEXT'], [8, 'TXT']));
    expect(defaultDxfImportOptions(p, 'x.dxf').selectedLayers).toEqual(['MUR']);
  });

  it('stripExtension tål filnamn utan ändelse', () => {
    expect(stripExtension('a.b.dxf')).toBe('a.b');
    expect(stripExtension('')).toBe('Ritning');
  });

  it('färgerna fördelas ur paletten och är deterministiska', () => {
    const a = assignLayerColors(['A', 'B', 'C']);
    expect(Object.keys(a)).toEqual(['A', 'B', 'C']);
    expect(a.A).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.A).not.toBe(a.B);
    expect(assignLayerColors(['A', 'B', 'C'])).toEqual(a);
  });
});

// ── Omräkning ────────────────────────────────────────────────────────────────

describe('enhetsomräkning', () => {
  it('millimeter blir meter', () => {
    const p = parseDxf(withUnit(4, ...LINE('A', 0, 0, 1000, 2000)));
    applyDxfImport(p, opts(p));
    const koord = visualLineCoords(getState().visualLines[0]);
    expect(koord).toEqual([[0, 0], [1, 2]]);
  });

  it('fot blir meter med den exakta faktorn', () => {
    const p = parseDxf(withUnit(2, ...LINE('A', 0, 0, 100, 0)));
    applyDxfImport(p, opts(p));
    expect(visualLineCoords(getState().visualLines[0])[1][0]).toBeCloseTo(30.48, 9);
  });

  it('enhetslös fil tolkas som meter', () => {
    expect(unitFactor(0)).toBe(1);
    expect(unitFactor(6)).toBe(1);
    expect(unitFactor(999)).toBe(1);
  });

  it('användarens enhetsval åsidosätter filens', () => {
    const p = parseDxf(withUnit(6, ...LINE('A', 0, 0, 1000, 0)));   // filen säger meter
    applyDxfImport(p, opts(p, { unitCode: 4 }));                    // vi säger millimeter
    expect(visualLineCoords(getState().visualLines[0])[1][0]).toBe(1);
  });

  it('Z räknas om med samma faktor och kan stängas av', () => {
    const p = parseDxf(withUnit(4, ...LINE('A', 0, 0, 1000, 0, 5000, 5000)));
    applyDxfImport(p, opts(p, { useZ: true }));
    expect(findVisualPt(getState().visualPts[0].id).H).toBe(5);

    reset();
    applyDxfImport(p, opts(p, { useZ: false }));
    // Polylinjer Etapp 1: utan Z saknar punkten höjd (null), den är inte 0.
    expect(findVisualPt(getState().visualPts[0].id).H).toBeNull();
  });
});

describe('axelordning', () => {
  const p = () => parseDxf(entities(...LINE('A', 10, 20, 30, 40)));

  it('X → E, Y → N (förval)', () => {
    expect(dxfToEN({ x: 10, y: 20, z: 0 }, { factor: 1, axisOrder: 'xe', useZ: false }))
      .toEqual({ E: 10, N: 20, H: null });
    applyDxfImport(p(), opts(p(), { axisOrder: 'xe' }));
    expect(visualLineCoords(getState().visualLines[0])).toEqual([[10, 20], [30, 40]]);
  });

  it('X → N, Y → E kastar om axlarna', () => {
    expect(dxfToEN({ x: 10, y: 20, z: 0 }, { factor: 1, axisOrder: 'xn', useZ: false }))
      .toEqual({ E: 20, N: 10, H: null });
    applyDxfImport(p(), opts(p(), { axisOrder: 'xn' }));
    expect(visualLineCoords(getState().visualLines[0])).toEqual([[20, 10], [40, 30]]);
  });

  it('båda alternativen är namngivna för dialogen', () => {
    expect(AXIS_ORDERS.xe.label).toBe('X → E, Y → N');
    expect(AXIS_ORDERS.xn.label).toBe('X → N, Y → E');
  });
});

// ── Rimlighetskontroll ───────────────────────────────────────────────────────

describe('rimlighetskontroll av georefereringen', () => {
  // Nät i SWEREF 99 15 45: E ≈ 197 000, N ≈ 7 165 000.
  const NÄT = [
    { id: 'A', type: 'known', E: 247000, N: 6165000, H: 0 },
    { id: 'B', type: 'known', E: 247100, N: 6165100, H: 0 },
  ];

  it('tröskeln är en namngiven konstant på 50 km', () => {
    expect(AXIS_SANITY_MAX_DIST_M).toBe(50000);
  });

  it('nätets tyngdpunkt är medelvärdet av punkterna', () => {
    setState({ pts: NÄT });
    expect(netCentroid()).toEqual({ E: 247050, N: 6165050 });
  });

  it('utan nät går ingen kontroll att göra', () => {
    const p = parseDxf(entities(...LINE('A', 0, 0, 1, 1)));
    expect(axisSanity(p.entities, { factor: 1 })).toBeNull();
  });

  it('rätt axelordning är rimlig, den omkastade inte', () => {
    setState({ pts: NÄT });
    // Ritningen är georefererad i SWEREF med X = öst.
    const p = parseDxf(entities(...LINE('A', 247000, 6165000, 247100, 6165100)));
    const s = axisSanity(p.entities, { factor: 1 });
    expect(s.ok.xe).toBe(true);
    expect(s.ok.xn).toBe(false);
    expect(s.xe).toBeLessThan(10);
    // Omkastade axlar ger fel i storleksordning miljoner meter.
    expect(s.xn).toBeGreaterThan(1e6);
  });

  it('en ritning med X = nord ger motsatt utslag', () => {
    setState({ pts: NÄT });
    const p = parseDxf(entities(...LINE('A', 6165000, 247000, 6165100, 247100)));
    const s = axisSanity(p.entities, { factor: 1 });
    expect(s.ok.xe).toBe(false);
    expect(s.ok.xn).toBe(true);
  });

  it('en ritning i lokala koordinater är orimlig åt båda hållen', () => {
    setState({ pts: NÄT });
    const p = parseDxf(entities(...LINE('A', 0, 0, 100, 100)));
    const s = axisSanity(p.entities, { factor: 1 });
    expect(s.ok.xe).toBe(false);
    expect(s.ok.xn).toBe(false);
  });

  it('kontrollen räknar med vald enhet', () => {
    setState({ pts: NÄT });
    // Samma ritning i millimeter: rätt plats bara med rätt faktor.
    const p = parseDxf(entities(...LINE('A', 247000e3, 6165000e3, 247100e3, 6165100e3)));
    expect(axisSanity(p.entities, { factor: 1 }).ok.xe).toBe(false);
    expect(axisSanity(p.entities, { factor: 0.001 }).ok.xe).toBe(true);
  });

  it('kontrollen ser bara de valda lagren', () => {
    setState({ pts: NÄT });
    const p = parseDxf(entities(
      ...LINE('NÄRA', 247000, 6165000, 247100, 6165100),
      ...LINE('LÅNGT', 0, 0, 1, 1)));
    expect(axisSanity(p.entities, { factor: 1, layerFilter: new Set(['NÄRA']) }).ok.xe).toBe(true);
    expect(axisSanity(p.entities, { factor: 1, layerFilter: new Set(['LÅNGT']) }).ok.xe).toBe(false);
  });
});

// ── Lagerstruktur ────────────────────────────────────────────────────────────

describe('lagerstruktur', () => {
  const blandad = () => parseDxf(entities(
    ...LINE('MUR', 0, 0, 10, 0),
    ...LINE('VÄG', 0, 5, 10, 5),
    [0, 'POINT'], [8, 'DUBB'], [10, 1], [20, 1]));

  it('ett visuellt lager per DXF-lager, med ritningens lagernamn', () => {
    const p = blandad();
    const r = applyDxfImport(p, opts(p, { layerStructure: 'per' }));
    expect(r.layerIds).toHaveLength(3);
    expect(getVisualLayers().map(l => l.name).sort()).toEqual(['DUBB', 'MUR', 'VÄG']);
  });

  it('varje lager får sin tilldelade färg och rätt ursprung', () => {
    const p = blandad();
    const färger = assignLayerColors(['DUBB', 'MUR', 'VÄG']);
    const r = applyDxfImport(p, opts(p, { layerColors: färger }));
    const mur = getVisualLayers().find(l => l.name === 'MUR');
    expect(mur.color).toBe(färger['MUR']);
    expect(mur.source).toEqual({ kind: 'dxf', filename: 'Ritning_A.dxf', crs: 'sweref991545' });
    void r;
  });

  it('ett samlat lager med eget namn', () => {
    const p = blandad();
    const r = applyDxfImport(p, opts(p, { layerStructure: 'single', layerName: 'Ritningen' }));
    expect(r.layerIds).toHaveLength(1);
    expect(getVisualLayers()).toHaveLength(1);
    expect(getVisualLayers()[0].name).toBe('Ritningen');
    expect(getState().visualPts.every(pt => pt.layerId === r.layerIds[0])).toBe(true);
  });

  it('avvalda lager importeras inte', () => {
    const p = blandad();
    const r = applyDxfImport(p, opts(p, { selectedLayers: ['MUR'] }));
    expect(getVisualLayers().map(l => l.name)).toEqual(['MUR']);
    expect(r.skippedLayers).toBe(2);
    expect(getState().visualLines).toHaveLength(1);
  });

  it('inget valt lager betyder ingen import och ingen ångra-post', () => {
    const p = blandad();
    const före = getUndoStack().length;
    const r = applyDxfImport(p, opts(p, { selectedLayers: [] }));
    expect(r.layerIds).toEqual([]);
    expect(getVisualLayers()).toEqual([]);
    expect(getUndoStack().length).toBe(före);
  });

  it('ej stödda objekt skapar inget', () => {
    const p = parseDxf(entities([0, 'TEXT'], [8, 'TXT'], [10, 0], [20, 0]));
    const r = applyDxfImport(p, opts(p, { selectedLayers: ['TXT'] }));
    expect(r.linesCreated).toBe(0);
    expect(getState().visualPts).toEqual([]);
  });
});

// ── Geometri ─────────────────────────────────────────────────────────────────

describe('geometri', () => {
  it('POINT blir en visuell punkt med role point', () => {
    const p = parseDxf(entities([0, 'POINT'], [8, 'DUBB'], [10, 5], [20, 7], [30, 2]));
    const r = applyDxfImport(p, opts(p));
    expect(r.visualPts).toBe(1);
    expect(getState().visualPts[0]).toMatchObject({ E: 5, N: 7, H: 2, role: 'point' });
    expect(getState().visualLines).toEqual([]);
  });

  it('LWPOLYLINE blir hörn med role vertex plus en polylinje', () => {
    const p = parseDxf(entities(...LW('A', 0, [0, 0], [10, 0], [10, 10])));
    const r = applyDxfImport(p, opts(p));
    expect(r.verticesCreated).toBe(3);
    expect(r.linesCreated).toBe(1);
    expect(getState().visualLines[0]).toMatchObject({ closed: false });
    expect(visualLineCoords(getState().visualLines[0])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(getState().visualPts.every(v => v.role === 'vertex')).toBe(true);
  });

  it('sluten LWPOLYLINE (flagga 1) blir en sluten polylinje med segmentet sista → första', () => {
    const p = parseDxf(entities(...LW('A', 1, [0, 0], [10, 0], [10, 10], [0, 10])));
    const r = applyDxfImport(p, opts(p));
    expect(r.verticesCreated).toBe(4);
    expect(r.linesCreated).toBe(1);
    expect(getState().visualLines[0].closed).toBe(true);
    expect(visualLineSegments(getState().visualLines[0])[3]).toEqual([[0, 10], [0, 0]]);
  });

  it('POLYLINE med VERTEX ger samma resultat som LWPOLYLINE', () => {
    const lw = parseDxf(entities(...LW('A', 1, [0, 0], [10, 0], [10, 10])));
    const rLw = applyDxfImport(lw, opts(lw));
    const facit = getState().visualLines.map(l => visualLineCoords(l));

    reset();
    const poly = parseDxf(entities(
      [0, 'POLYLINE'], [8, 'A'], [66, 1], [70, 1],
      [0, 'VERTEX'], [8, 'A'], [10, 0], [20, 0],
      [0, 'VERTEX'], [8, 'A'], [10, 10], [20, 0],
      [0, 'VERTEX'], [8, 'A'], [10, 10], [20, 10],
      [0, 'SEQEND'], [8, 'A']));
    const rPoly = applyDxfImport(poly, opts(poly));

    expect(rPoly.verticesCreated).toBe(rLw.verticesCreated);
    expect(rPoly.linesCreated).toBe(rLw.linesCreated);
    expect(getState().visualLines.map(l => visualLineCoords(l))).toEqual(facit);
  });

  it('bågsegment ritas som raka linjer', () => {
    const p = parseDxf(entities(
      [0, 'LWPOLYLINE'], [8, 'A'], [90, 3], [70, 0],
      [10, 0], [20, 0], [42, 1],
      [10, 10], [20, 0],
      [10, 10], [20, 10]));
    const r = applyDxfImport(p, opts(p));
    expect(r.linesCreated).toBe(1);
    expect(visualLineCoords(getState().visualLines[0])).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it('sammanfallande hörn delas inom ett lager', () => {
    // Två linjer som möts i (10,0).
    const p = parseDxf(entities(...LINE('A', 0, 0, 10, 0), ...LINE('A', 10, 0, 10, 10)));
    const r = applyDxfImport(p, opts(p));
    expect(r.verticesCreated).toBe(3);
    expect(r.linesCreated).toBe(2);
  });

  it('dedupliceringen håller sig inom toleransen', () => {
    const d = VERTEX_DEDUP_TOL_M;
    const mk = dy => parseDxf(entities(...LINE('A', 0, 0, 10, 0), ...LINE('A', 10, dy, 10, 10)));
    expect(applyDxfImport(mk(d / 2), opts(mk(0))).verticesCreated).toBe(3);
    reset();
    expect(applyDxfImport(mk(d * 4), opts(mk(0))).verticesCreated).toBe(4);
  });

  it('olika DXF-lager delar inte hörn', () => {
    const p = parseDxf(entities(...LINE('A', 0, 0, 10, 0), ...LINE('B', 10, 0, 10, 10)));
    const r = applyDxfImport(p, opts(p, { layerStructure: 'per' }));
    expect(r.verticesCreated).toBe(4);
  });

  it('men gör det i ett samlat lager', () => {
    const p = parseDxf(entities(...LINE('A', 0, 0, 10, 0), ...LINE('B', 10, 0, 10, 10)));
    const r = applyDxfImport(p, opts(p, { layerStructure: 'single' }));
    expect(r.verticesCreated).toBe(3);
  });

  it('bounds omsluter det importerade i projektkoordinater', () => {
    const p = parseDxf(withUnit(4, ...LINE('A', 0, 0, 10000, 20000)));
    const r = applyDxfImport(p, opts(p));
    expect(r.bounds).toEqual({ minE: 0, maxE: 10, minN: 0, maxN: 20 });
  });
});

// ── Ångra och separation ─────────────────────────────────────────────────────

describe('ångra', () => {
  it('hela importen ångras i ett steg', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }] });
    const p = parseDxf(entities(...LW('A', 1, [0, 0], [10, 0], [10, 10]), ...LINE('B', 0, 0, 1, 1)));
    const före = getUndoStack().length;
    applyDxfImport(p, opts(p));
    expect(getUndoStack().length).toBe(före + 1);
    expect(getVisualLayers().length).toBe(2);

    undo();
    expect(getVisualLayers()).toEqual([]);
    expect(getState().visualPts).toEqual([]);
    expect(getState().visualLines).toEqual([]);
    expect(getState().pts).toEqual([{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }]);
  });
});

describe('separation från simuleringen', () => {
  it('en DXF blir aldrig nätpunkter och ändrar inte simuleringen', () => {
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
    const före = JSON.stringify(getState().simResult);

    const p = parseDxf(entities([0, 'POINT'], [8, 'DUBB'], [10, 25], [20, 25],
      ...LW('KONTUR', 1, [0, 0], [100, 0], [100, 100])));
    applyDxfImport(p, opts(p));
    runSimulation();

    expect(JSON.stringify(getState().simResult)).toBe(före);
    expect(getState().pts).toHaveLength(4);
    expect(getState().meas).toHaveLength(3);
    // Inga hinder heller – en DXF skymmer ingen sikt.
    expect(getState().obstacles).toEqual([]);
  });
});
