// Etapp 3: importen av ett parsat .geo-innehåll.
// – punkter till visuellt lager eller till nätet, med id-krockhantering
// – linjer till visuella linjer eller till hinder, med hörndeduplicering
// – hela importen är EN ångra-åtgärd
// – det visuella innehållet når aldrig simuleringen

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGeo } from '../src/io/parse-geo.js';
import {
  applyGeoImport, defaultGeoImportOptions, stripExtension, VERTEX_DEDUP_TOL_M,
} from '../src/io/geo-import.js';
import { getState, setState } from '../src/state/store.js';
import {
  getVisualLayers, findVisualLayer, visualLineCoords, updateVisualPt,
} from '../src/state/visual.js';
import { undo, getUndoStack } from '../src/state/undo.js';
import { runSimulation } from '../src/core/simulation.js';
import { findBlockedMeasurements } from '../src/core/visibility.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(HERE, 'fixtures', 'geo', name), 'utf8');

const NORR = parseGeo(fixture('exempel_punkter_sluten_linje.geo'));
const SYD  = parseGeo(fixture('exempel_punkter_oppna_linjer.geo'));
const PALL = parseGeo(fixture('exempel_tom_punktlista.geo'));

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

// Standardval med CRS-bytet avstängt, så att testerna styr en sak i taget.
const opts = (parsed, over = {}) => ({
  ...defaultGeoImportOptions(parsed, 'exempel_punkter_sluten_linje.geo', 'sweref991545'),
  changeCRS: false,
  ...over,
});

describe('standardval', () => {
  it('visuellt lager är förvalt och lagernamnet är filnamnet utan ändelse', () => {
    const o = defaultGeoImportOptions(NORR, 'exempel_tom_punktlista.geo', 'sweref991545');
    expect(o.target).toBe('visual');
    expect(o.layerName).toBe('exempel_tom_punktlista');
    expect(o.lines).toBe('visual');
    expect(o.idConflict).toBe('skip');
    expect(o.netPointType).toBe('prefix');
  });

  it('CRS-byte föreslås bara när filens system avviker från projektets', () => {
    expect(defaultGeoImportOptions(NORR, 'x.geo', 'sweref99tm').changeCRS).toBe(true);
    expect(defaultGeoImportOptions(NORR, 'x.geo', 'sweref991545').changeCRS).toBe(false);
  });

  it('stripExtension tål filnamn utan ändelse och tomma namn', () => {
    expect(stripExtension('a.b.geo')).toBe('a.b');
    expect(stripExtension('utan_andelse')).toBe('utan_andelse');
    expect(stripExtension('')).toBe('Import');
  });
});

describe('punkter till visuellt lager', () => {
  beforeEach(reset);

  it('alla punkter hamnar i ett nytt lager med filens ursprung', () => {
    const r = applyGeoImport(NORR, opts(NORR, { lines: 'skip' }));
    expect(r.visualPts).toBe(5);
    expect(getVisualLayers()).toHaveLength(1);
    const l = findVisualLayer(r.layerId);
    expect(l.name).toBe('exempel_punkter_sluten_linje');
    expect(l.source).toEqual({ kind: 'geo', filename: 'exempel_punkter_sluten_linje.geo', crs: 'sweref991545' });
    expect(getState().visualPts.every(p => p.layerId === r.layerId)).toBe(true);
  });

  it('originalnamn, attribut och roll följer med', () => {
    applyGeoImport(NORR, opts(NORR, { lines: 'skip' }));
    const first = getState().visualPts[0];
    expect(first).toMatchObject({ name: '101', role: 'point' });
    expect(first.attrs.GP_LM).toBe('7');
    expect(first.E).toBe(247391.00528623);
  });

  it('dubbletten "101" blir två visuella punkter – visuella objekt krockar inte', () => {
    applyGeoImport(NORR, opts(NORR, { lines: 'skip' }));
    expect(getState().visualPts.filter(p => p.name === '101')).toHaveLength(2);
  });

  it('nätet lämnas orört', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }] });
    applyGeoImport(NORR, opts(NORR, { lines: 'skip' }));
    expect(getState().pts).toEqual([{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }]);
  });

  it('lagerfärgen sparas på lagret, inte på objekten', () => {
    const r = applyGeoImport(NORR, opts(NORR, { lines: 'skip', layerColor: '#4dd0e1' }));
    expect(findVisualLayer(r.layerId).color).toBe('#4dd0e1');
    expect(getState().visualPts.every(p => p.color === null)).toBe(true);
  });
});

describe('punkter till nätet', () => {
  beforeEach(reset);

  it('punkttyp enligt ID-prefix: rent numeriska ID blir detaljpunkter', () => {
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip' }));
    // Fyra unika ID (101, 102, 103, 104); den andra "101" hoppas över med förvalet.
    expect(r.ptsImported).toBe(4);
    expect(r.ptsSkipped).toBe(1);
    expect(getState().pts.every(p => p.type === 'detail')).toBe(true);
    expect(getState().pts.map(p => p.id)).toEqual(['101', '102', '103', '104']);
  });

  it('fast punkttyp åsidosätter heuristiken', () => {
    applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip', netPointType: 'known' }));
    expect(getState().pts.every(p => p.type === 'known')).toBe(true);
  });

  it('inget visuellt lager skapas när bara nätpunkter importeras', () => {
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip' }));
    expect(r.layerId).toBeNull();
    expect(getVisualLayers()).toEqual([]);
  });

  // ── ID-krock ──
  it('Hoppa över: befintlig punkt behåller sina koordinater', () => {
    setState({ pts: [{ id: '101', type: 'known', E: 1, N: 2, H: 3 }] });
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip', idConflict: 'skip' }));
    expect(r.ptsSkipped).toBe(2);           // båda "101" i filen
    expect(r.ptsImported).toBe(3);
    expect(getState().pts.find(p => p.id === '101')).toMatchObject({ E: 1, N: 2, H: 3, type: 'known' });
  });

  it('Uppdatera koordinater: sista raden i filen vinner', () => {
    setState({ pts: [{ id: '101', type: 'known', E: 1, N: 2, H: 3 }] });
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip', idConflict: 'update' }));
    expect(r.ptsUpdated).toBe(2);
    const sista = NORR.points.filter(p => p.name === '101').pop();
    expect(getState().pts.find(p => p.id === '101').E).toBe(sista.E);
  });

  it('Byt namn: dubbletten får suffix _2 och båda koordinaterna behålls', () => {
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip', idConflict: 'rename' }));
    expect(r.ptsRenamed).toBe(1);
    expect(r.ptsImported).toBe(5);
    const ids = getState().pts.map(p => p.id);
    expect(ids).toContain('101');
    expect(ids).toContain('101_2');
    const [a, b] = NORR.points.filter(p => p.name === '101');
    expect(getState().pts.find(p => p.id === '101').E).toBe(a.E);
    expect(getState().pts.find(p => p.id === '101_2').E).toBe(b.E);
  });

  it('Byt namn räknar vidare när _2 redan är taget', () => {
    setState({ pts: [
      { id: '101', type: 'known', E: 0, N: 0, H: 0 },
      { id: '101_2', type: 'known', E: 0, N: 0, H: 0 },
    ] });
    applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'skip', idConflict: 'rename' }));
    const ids = getState().pts.map(p => p.id);
    expect(ids).toContain('101_3');
    expect(ids).toContain('101_4');
  });

  it('prefix-heuristiken använder originalnamnet, inte det omdöpta', () => {
    setState({ pts: [{ id: 'FP1', type: 'known', E: 0, N: 0, H: 0 }] });
    const parsed = parseGeo('PointList\nbegin\n\tPoint "FP1",100,200,5,,,\nend\n');
    applyGeoImport(parsed, opts(parsed, { target: 'net', idConflict: 'rename' }));
    expect(getState().pts.find(p => p.id === 'FP1_2').type).toBe('known');
  });
});

describe('linjer som visuella linjer', () => {
  beforeEach(reset);

  it('varje segment blir en visuell linje', () => {
    const r = applyGeoImport(SYD, opts(SYD, { lines: 'visual' }));
    // Fyra öppna linjer à 2 hörn = 4 segment, 8 hörn.
    expect(r.linesCreated).toBe(4);
    expect(r.verticesCreated).toBe(8);
    expect(getState().visualLines).toHaveLength(4);
  });

  it('hörnen får role vertex och sitt lokala namn', () => {
    applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'visual' }));
    const vs = getState().visualPts;
    expect(vs.every(p => p.role === 'vertex')).toBe(true);
    expect(vs.map(p => p.name).slice(0, 2)).toEqual(['01', '02']);
  });

  it('segmentens koordinater kommer ur hörnen, inte ur den yttre punktlistan', () => {
    applyGeoImport(SYD, opts(SYD, { lines: 'visual' }));
    const first = SYD.lines[0].vertices;
    expect(visualLineCoords(getState().visualLines[0]))
      .toEqual([[first[0].E, first[0].N], [first[1].E, first[1].N]]);
  });

  it('sluten linje får segmentet sista → första', () => {
    const r = applyGeoImport(NORR, opts(NORR, { target: 'net', lines: 'visual' }));
    // Fyra hörn, sluten ⇒ fyra segment, inte tre.
    expect(NORR.lines[0].closed).toBe(true);
    expect(r.verticesCreated).toBe(4);
    expect(r.linesCreated).toBe(4);
    const last = getState().visualLines[3];
    const v = NORR.lines[0].vertices;
    expect(visualLineCoords(last)).toEqual([[v[3].E, v[3].N], [v[0].E, v[0].N]]);
  });

  it('öppen linje sluts inte', () => {
    const parsed = parseGeo([
      'LineList', 'begin', '\tLine "A",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",0,0,,,,', '\t\t\tPoint "02",0,10,,,,', '\t\t\tPoint "03",10,10,,,,',
      '\t\tend', '\tend', 'end',
    ].join('\n'));
    const r = applyGeoImport(parsed, opts(parsed, { lines: 'visual' }));
    expect(r.linesCreated).toBe(2);
  });

  it('hörn som sammanfaller mellan linjer delas', () => {
    // Den tomma punktlistan har 22 hörn i filen men bara 19 unika: tre par sammanfaller
    // exakt (5:01=6:03, 8:01=9:01, 9:04=11:02). Utan deduplicering blir
    // konturen lösa segment i stället för en sammanhängande kedja.
    const iFilen = PALL.lines.reduce((s, l) => s + l.vertices.length, 0);
    const unika = new Set(PALL.lines.flatMap(l => l.vertices.map(v => `${v.E}|${v.N}|${v.H}`)));
    expect(iFilen).toBe(22);
    expect(unika.size).toBe(19);

    const r = applyGeoImport(PALL, opts(PALL, { lines: 'visual' }));
    expect(r.verticesCreated).toBe(19);
    expect(r.linesCreated).toBe(13);
    expect(getState().visualPts).toHaveLength(19);

    // Varje sammanfallande par pekar på EN visualPt – kedjan hänger ihop.
    for (const [ln, vi] of [[0, 0], [3, 0], [4, 3]]) {
      const v = PALL.lines[ln].vertices[vi];
      const träffar = getState().visualPts.filter(p =>
        Math.abs(p.E - v.E) < 1e-9 && Math.abs(p.N - v.N) < 1e-9);
      expect(träffar).toHaveLength(1);
    }
  });

  it('dedupliceringen håller sig inom toleransen', () => {
    const d = VERTEX_DEDUP_TOL_M;
    expect(d).toBe(0.0005);
    const mk = dE => parseGeo([
      'LineList', 'begin',
      '\tLine "A",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",0,0,0,,,', '\t\t\tPoint "02",0,10,0,,,',
      '\t\tend', '\tend',
      '\tLine "B",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      `\t\t\tPoint "01",0,${dE},0,,,`, '\t\t\tPoint "02",10,10,0,,,',
      '\t\tend', '\tend', 'end',
    ].join('\n'));

    reset();
    expect(applyGeoImport(mk(d / 2), opts(NORR, { lines: 'visual' })).verticesCreated).toBe(3);
    reset();
    expect(applyGeoImport(mk(d * 4), opts(NORR, { lines: 'visual' })).verticesCreated).toBe(4);
  });

  it('hörn på samma plankoordinat men olika höjd slås inte ihop', () => {
    const parsed = parseGeo([
      'LineList', 'begin',
      '\tLine "A",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",0,0,100,,,', '\t\t\tPoint "02",0,10,100,,,',
      '\t\tend', '\tend',
      '\tLine "B",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",0,0,200,,,', '\t\t\tPoint "02",10,10,200,,,',
      '\t\tend', '\tend', 'end',
    ].join('\n'));
    expect(applyGeoImport(parsed, opts(parsed, { lines: 'visual' })).verticesCreated).toBe(4);
  });

  it('linjer kan hoppas över helt', () => {
    const r = applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'skip' }));
    expect(r.linesCreated).toBe(0);
    expect(getState().visualPts).toEqual([]);
    expect(getVisualLayers()).toEqual([]);
  });

  it('linjer kan importeras även när punkterna går till nätet', () => {
    const r = applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'visual' }));
    expect(r.ptsImported).toBe(3);
    expect(r.linesCreated).toBe(4);
    expect(getState().pts).toHaveLength(3);
    expect(findVisualLayer(r.layerId)).not.toBeNull();
  });
});

describe('linjer som hinder', () => {
  beforeEach(reset);

  it('varje visuell linje får ett kopplat hinder', () => {
    const r = applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'obstacle' }));
    expect(r.obstaclesCreated).toBe(4);
    expect(getState().obstacles).toHaveLength(4);
    expect(getState().visualLines.every(l => l.linkedObsId)).toBe(true);
  });

  it('hindret är en projektion av linjen och följer med när hörnet flyttas', () => {
    applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'obstacle' }));
    const line = getState().visualLines[0];
    const obsPoints = () => getState().obstacles.find(o => o.id === line.linkedObsId).points;
    expect(obsPoints()).toEqual(visualLineCoords(line));

    // Flytta hörnet – väggen ska följa med, precis som när linjen ritats för hand.
    updateVisualPt(line.from.id, { E: 999, N: 888 });
    expect(obsPoints()[0]).toEqual([999, 888]);
  });

  it('hindret blockerar sikt på riktigt', () => {
    const parsed = parseGeo([
      'LineList', 'begin', '\tLine "1",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",-50,50,0,,,', '\t\t\tPoint "02",50,50,0,,,',
      '\t\tend', '\tend', 'end',
    ].join('\n'));
    const pts = [
      { id: 'S1', type: 'station', E: 0,   N: 0 },
      { id: 'P1', type: 'new',     E: 100, N: 0 },
    ];
    setState({ pts });
    applyGeoImport(parsed, opts(parsed, { target: 'net', lines: 'obstacle' }));
    const meas = [{ id: 'M1', from: 'S1', to: 'P1' }];
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toHaveLength(1);
  });

  it('som visuella linjer blockerar samma geometri ingenting', () => {
    const parsed = parseGeo([
      'LineList', 'begin', '\tLine "1",,', '\tbegin', '\t\tPointList', '\t\tbegin',
      '\t\t\tPoint "01",-50,50,0,,,', '\t\t\tPoint "02",50,50,0,,,',
      '\t\tend', '\tend', 'end',
    ].join('\n'));
    const pts = [
      { id: 'S1', type: 'station', E: 0,   N: 0 },
      { id: 'P1', type: 'new',     E: 100, N: 0 },
    ];
    setState({ pts });
    applyGeoImport(parsed, opts(parsed, { target: 'net', lines: 'visual' }));
    expect(getState().obstacles).toEqual([]);
    expect(findBlockedMeasurements([{ id: 'M1', from: 'S1', to: 'P1' }], pts, getState().obstacles)).toEqual([]);
  });
});

describe('koordinatsystem', () => {
  beforeEach(reset);

  it('byter projektets CRS när valet är ikryssat', () => {
    const r = applyGeoImport(NORR, opts(NORR, { lines: 'skip', changeCRS: true }));
    expect(r.crsChanged).toBe(true);
    expect(getState().activeCRS).toBe('sweref991545');
  });

  it('lämnar CRS orört annars', () => {
    applyGeoImport(NORR, opts(NORR, { lines: 'skip', changeCRS: false }));
    expect(getState().activeCRS).toBe('sweref99tm');
  });
});

describe('ångra', () => {
  beforeEach(reset);

  it('hela importen ångras i ett steg', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }] });
    applyGeoImport(PALL, opts(PALL, { lines: 'obstacle' }));
    expect(getState().visualLines.length).toBeGreaterThan(0);
    expect(getState().obstacles.length).toBeGreaterThan(0);

    undo();

    expect(getState().visualPts).toEqual([]);
    expect(getState().visualLines).toEqual([]);
    expect(getVisualLayers()).toEqual([]);
    expect(getState().obstacles).toEqual([]);
    expect(getState().pts).toEqual([{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }]);
  });

  it('en import av nätpunkter ångras i ett steg', () => {
    applyGeoImport(SYD, opts(SYD, { target: 'net', lines: 'skip' }));
    expect(getState().pts).toHaveLength(3);
    undo();
    expect(getState().pts).toEqual([]);
  });

  it('en import utan innehåll lägger inget på ångra-stacken', () => {
    const tom = parseGeo('PointList\nbegin\nend\n');
    setState({ pts: [{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }] });
    const före = getUndoStack().length;
    const r = applyGeoImport(tom, opts(tom, { changeCRS: false }));
    expect(r).toMatchObject({ layerId: null, visualPts: 0, linesCreated: 0 });
    expect(getUndoStack().length).toBe(före);
    expect(getState().pts).toEqual([{ id: 'S1', type: 'station', E: 1, N: 2, H: 0 }]);
  });

  it('en import med innehåll lägger exakt en post på stacken', () => {
    const före = getUndoStack().length;
    applyGeoImport(PALL, opts(PALL, { lines: 'visual' }));
    expect(getUndoStack().length).toBe(före + 1);
  });
});

describe('utbredning', () => {
  beforeEach(reset);

  it('bounds omsluter det som importerades', () => {
    const r = applyGeoImport(SYD, opts(SYD, { lines: 'visual' }));
    const allE = [...SYD.points.map(p => p.E), ...SYD.lines.flatMap(l => l.vertices.map(v => v.E))];
    expect(r.bounds.minE).toBe(Math.min(...allE));
    expect(r.bounds.maxE).toBe(Math.max(...allE));
  });

  it('bounds är null när inget importerades', () => {
    const tom = parseGeo('PointList\nbegin\nend\n');
    expect(applyGeoImport(tom, opts(tom)).bounds).toBeNull();
  });
});

describe('separation från simuleringen', () => {
  beforeEach(reset);

  it('en visuell import ändrar inte simuleringsresultatet', () => {
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

    applyGeoImport(PALL, opts(PALL, { lines: 'visual' }));
    runSimulation();

    expect(JSON.stringify(getState().simResult)).toBe(before);
    expect(getState().pts).toHaveLength(4);
    expect(getState().meas).toHaveLength(3);
  });
});
