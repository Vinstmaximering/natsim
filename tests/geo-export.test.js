// Polylinjer Etapp 3: export av visuella lager och nätpunkter till .geo
// (SBG Object Text v2.01).
//
// tests/fixtures/geo-export/forvantad.geo är skriven för hand, byte för byte:
// CRLF, tabbar, blanksteg efter listnyckelorden, fyra decimaler, tomma
// höjdfält. .gitattributes undantar filen från radslutskonvertering.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const W = await import('../src/io/write-geo.js');
const X = await import('../src/io/export-visual-geo.js');
const V = await import('../src/state/visual.js');
const { parseGeo } = await import('../src/io/parse-geo.js');
const { applyGeoImport, defaultGeoImportOptions } = await import('../src/io/geo-import.js');
const { getState, setState } = await import('../src/state/store.js');
const { APP_VERSION } = await import('../src/core/version.js');
const UI = await import('../src/ui/geo-export.js');

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'geo-export');
const FÖRVÄNTAD = readFileSync(join(dir, 'forvantad.geo'))
  .toString('utf8').replace('NätSim 0.6.0', `NätSim ${APP_VERSION}`);

const E0 = 150000, N0 = 6600000;
const BASE = {
  pts: [
    { id: 'FP1', type: 'known', E: E0 + 30, N: N0 + 20, H: 0 },
    { id: 'FP2', type: 'known', E: E0 + 4,  N: N0 + 5,  H: 12.5 },
  ],
  meas: [], obstacles: [], simResult: null, selObsId: null,
  visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
  nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  activeCRS: 'sweref992015',
};
beforeEach(() => setState({ ...BASE }));

const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

// Blandat lager: två fria punkter (med och utan höjd), en öppen linje med en
// nätpunkt med höjd, en sluten linje med en nätpunkt utan höjd (H = 0) och en
// yta.
function blandatLager() {
  const lay = V.addVisualLayer({ name: 'Testlager' });
  const pt = (E, N, H, extra = {}) => V.addVisualPt({ E: E0 + E, N: N0 + N, H, layerId: lay, ...extra });
  pt(0, 0, 10.25, { name: 'T1', role: 'point' });
  pt(20.1234, 10.5, null, { name: 'T2', role: 'point' });
  const k1 = pt(1, 1, 11, { role: 'vertex' });
  V.addVisualLine({ vertices: [vis(k1), net('FP2')], layerId: lay, name: 'Kantbalk N' });
  const s2 = pt(40, 20, 9, { role: 'vertex' }), s3 = pt(40, 30, null, { role: 'vertex' });
  V.addVisualLine({ vertices: [net('FP1'), vis(s2), vis(s3)], closed: true, layerId: lay, name: 'Sluten' });
  const h = [[50, 50], [60, 50], [60, 60], [50, 60]].map(([E, N]) => pt(E, N, 8, { role: 'vertex' }));
  V.addVisualArea({ vertices: h.map(vis), layerId: lay, name: 'Platta' });
  return lay;
}

describe('skrivaren, byte för byte', () => {
  it('blandat lager ger exakt den förväntade filen', () => {
    const lay = blandatLager();
    const r = X.buildVisualGeo(getState(), { layerIds: [lay] }, 'Testlager');
    expect(r.error).toBeNull();
    expect(r.counts).toEqual({ points: 2, lines: 2, areas: 1 });
    expect(Buffer.from(r.text, 'utf8').equals(Buffer.from(FÖRVÄNTAD, 'utf8'))).toBe(true);
    expect(r.text).toBe(FÖRVÄNTAD);
  });

  it('CRLF överallt, inga ensamma LF, ingen BOM, slutar med "AttributeList " + CRLF', () => {
    const lay = blandatLager();
    const r = X.buildVisualGeo(getState(), { layerIds: [lay] }, 'x');
    expect(r.text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(r.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(r.text.endsWith('AttributeList \r\n')).toBe(true);
    expect(r.text).toContain('\r\nPointList \r\nbegin\r\n');
    expect(r.text).toContain('\r\nLineList \r\nbegin\r\n');
  });

  it('tomma listor: bara nyckelordet, utan begin/end; tom beskrivning utan citattecken', () => {
    const text = W.writeGeo({ info: { application: 'NätSim x', description: '', coordinateSystem: 'Sweref 99 15 45 / RH2000 (SWEN17)' }, points: [], lines: [] });
    expect(text).toBe([
      'FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"', 'begin',
      '\tFileInfo "Application","NätSim x"', '\tFileInfo "Description",',
      '\tFileInfo "Coordinate System","Sweref 99 15 45 / RH2000 (SWEN17)"', 'end',
      'PointList ', 'LineList ', 'AttributeList ', ''].join('\r\n'));
  });

  it('tom höjd är ett tomt fält – sju fält per punkt', () => {
    const text = W.writeGeo({ info: {}, points: [{ name: 'A', N: 1, E: 2, H: null }, { name: 'B', N: 1, E: 2, H: 0 }], lines: [] });
    expect(text).toContain('\tPoint "A",1.0000,2.0000,,,,\r\n');
    expect(text).toContain('\tPoint "B",1.0000,2.0000,0.0000,,,\r\n');
    expect('Point "A",1.0000,2.0000,,,,'.split(',')).toHaveLength(7);
  });

  it('hörnens löpnamn: 01 … 99, 100', () => {
    expect([0, 8, 98, 99].map(W.vertexName)).toEqual(['01', '09', '99', '100']);
  });

  it('namn med citattecken eller radbrytning stoppar exporten med ett tydligt fel', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    V.addVisualPt({ E: 0, N: 0, layerId: lay, name: 'Brunn "A"' });
    const r = X.buildVisualGeo(getState(), { layerIds: [lay] }, 'L');
    expect(r.text).toBeNull();
    expect(r.error).toContain('"Brunn "A""');
    expect(r.error).toContain('citattecken eller radbrytning');
    expect(() => W.writeGeo({ info: {}, points: [], lines: [{ name: 'a\nb', closed: false, vertices: [{ N: 0, E: 0 }, { N: 1, E: 1 }] }] }))
      .toThrow(W.GeoWriteError);
  });
});

describe('koordinatsystemet', () => {
  it('verifierade zoner: 15 45 och 20 15', () => {
    expect(W.geoCoordinateSystem('sweref991545')).toEqual({ text: 'Sweref 99 15 45 / RH2000 (SWEN17)', verified: true });
    expect(W.geoCoordinateSystem('sweref992015')).toEqual({ text: 'Sweref 99 20 15 / RH2000 (SWEN17)', verified: true });
  });

  it('TM och övriga zoner: samma mönster men inte verifierat', () => {
    expect(W.geoCoordinateSystem('sweref99tm')).toEqual({ text: 'Sweref 99 TM / RH2000 (SWEN17)', verified: false });
    expect(W.geoCoordinateSystem('sweref991800')).toEqual({ text: 'Sweref 99 18 00 / RH2000 (SWEN17)', verified: false });
  });

  it('parseGeo känner igen strängen för alla zoner', () => {
    for (const k of ['sweref99tm', 'sweref991200', 'sweref991545', 'sweref992015', 'sweref992315']) {
      const text = W.writeGeo({ info: { coordinateSystem: W.geoCoordinateSystem(k).text }, points: [], lines: [] });
      expect(parseGeo(text).fileInfo.crs).toBe(k);
    }
  });
});

describe('läses tillbaka av parseGeo', () => {
  it('samma punkter, linjer och koordinater', () => {
    const lay = blandatLager();
    const text = X.buildVisualGeo(getState(), { layerIds: [lay] }, 'Testlager').text;
    const p = parseGeo(text);
    expect(p.warnings).toEqual([]);
    expect(p.fileInfo.crs).toBe('sweref992015');
    expect(p.points.map(x => [x.name, x.N, x.E, x.H])).toEqual([
      ['T1', N0, E0, 10.25], ['T2', N0 + 10.5, E0 + 20.1234, null]]);
    expect(p.lines.map(l => l.name)).toEqual(['Kantbalk N', 'Sluten', 'Platta']);
    expect(p.lines[0].vertices.map(v => [v.name, v.E - E0, v.N - N0, v.H])).toEqual([
      ['01', 1, 1, 11], ['02', 4, 5, 12.5]]);
    expect(p.lines[1].vertices.map(v => [v.E - E0, v.N - N0, v.H])).toEqual([
      [30, 20, null], [40, 20, 9], [40, 30, null], [30, 20, null]]);
    expect(p.lines[2].vertices).toHaveLength(5);
  });

  it('import av exporten ger samma polylinjer: sluten linje sluten, yta som yta', () => {
    const lay = blandatLager();
    const text = X.buildVisualGeo(getState(), { layerIds: [lay] }, 'Testlager').text;
    const före = getState().visualLines.map(l => ({ name: l.name, closed: l.closed, c: V.visualLineCoords(l) }));
    const yta = V.visualAreaCoords(getState().visualAreas[0]);

    setState({ ...BASE, pts: [] });
    const parsed = parseGeo(text);
    applyGeoImport(parsed, { ...defaultGeoImportOptions(parsed, 'x.geo', 'sweref992015'), closedAs: 'areas' });
    const st = getState();
    expect(st.visualLines.map(l => ({ name: l.name, closed: l.closed, c: V.visualLineCoords(l) })))
      .toEqual([före[0]]);                       // Sluten blir yta med closedAs 'areas'
    expect(st.visualAreas.map(a => a.name)).toEqual(['Sluten', 'Platta']);
    expect(V.visualAreaCoords(st.visualAreas[1])).toEqual(yta);

    setState({ ...BASE, pts: [] });
    applyGeoImport(parsed, defaultGeoImportOptions(parsed, 'x.geo', 'sweref992015'));
    const linjer = getState().visualLines.map(l => ({ name: l.name, closed: l.closed, c: V.visualLineCoords(l) }));
    expect(linjer.slice(0, 2)).toEqual(före);
    expect(linjer[2]).toEqual({ name: 'Platta', closed: true, c: yta });
  });
});

describe('urval', () => {
  it('bara vissa typer', () => {
    const lay = blandatLager();
    const r = X.collectVisualGeo(getState(), { layerIds: [lay], include: { points: false, lines: true, areas: false } });
    expect(r.points).toEqual([]);
    expect(r.lines.map(l => l.name)).toEqual(['Kantbalk N', 'Sluten']);
  });

  it('endast markerade objekt, oavsett lager', () => {
    const lay = blandatLager();
    const annat = V.addVisualLayer({ name: 'Annat' });
    V.addVisualPt({ E: E0, N: N0, layerId: annat, name: 'X9' });
    const sluten = getState().visualLines[1].id;
    setState({ visualSelection: [sluten], selVisualId: null });
    const r = X.collectVisualGeo(getState(), { objectIds: UI.markedObjectIds() });
    expect(r.points).toEqual([]);
    expect(r.lines.map(l => l.name)).toEqual(['Sluten']);
    expect(X.collectVisualGeo(getState(), { layerIds: [annat] }).points.map(p => p.name)).toEqual(['X9']);
    expect(lay).toBeTruthy();
  });

  it('hörnpunkter hamnar inte i PointList; fri punkt utan namn heter sitt id', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const fri = V.addVisualPt({ E: 0, N: 0, layerId: lay });
    const r = X.collectVisualGeo(getState(), { layerIds: [lay] });
    expect(r.points.map(p => p.name)).toEqual([fri]);
    blandatLager();
    expect(X.collectVisualGeo(getState(), {}).points.map(p => p.name)).toEqual([fri, 'T1', 'T2']);
  });

  it('en linje utan namn heter sitt id', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const a = V.addVisualPt({ E: 0, N: 0, layerId: lay, role: 'vertex' });
    const id = V.addVisualLine({ vertices: [vis(a), net('FP1')], layerId: lay });
    expect(X.collectVisualGeo(getState(), { layerIds: [lay] }).lines[0].name).toBe(id);
  });
});

describe('nätpunkterna använder samma skrivare', () => {
  it('fyra decimaler, zonens namn och tomt höjdfält för H = 0', () => {
    const text = X.buildNetGeo(getState());
    expect(text).toContain('\tFileInfo "Coordinate System","Sweref 99 20 15 / RH2000 (SWEN17)"\r\n');
    expect(text).toContain('\tFileInfo "Description","Nätpunkter"\r\n');
    expect(text).toContain(`\tPoint "FP1",${(N0 + 20).toFixed(4)},${(E0 + 30).toFixed(4)},,,,\r\n`);
    expect(text).toContain(`\tPoint "FP2",${(N0 + 5).toFixed(4)},${(E0 + 4).toFixed(4)},12.5000,,,\r\n`);
    expect(text).toContain('\r\nLineList \r\nAttributeList \r\n');
    expect(parseGeo(text).points.map(p => p.name)).toEqual(['FP1', 'FP2']);
  });
});

describe('vägarna in', () => {
  it('kortet och lagrets meny laddar ner en fil; dialogen räknar och exporterar', async () => {
    const lay = blandatLager();
    const länkar = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const e = orig(tag);
      if (tag === 'a') { e.click = () => länkar.push(e.download); }
      return e;
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();

    UI.exportObjectGeo(getState().visualLines[0].id);
    UI.exportObjectGeo(getState().visualAreas[0].id);
    UI.exportLayerGeo(lay);
    expect(länkar).toEqual(['Kantbalk N.geo', 'Platta.geo', 'Testlager.geo']);

    document.body.innerHTML = '<div id="modal" style="display:none"><div id="mi"></div></div>';
    UI.openVisualGeoExport();
    expect(document.getElementById('gx-sum').textContent).toBe('Tas med: 2 punkter, 2 linjer och 1 yta.');
    document.getElementById('gx-inc-points').click();
    expect(document.getElementById('gx-sum').textContent).toBe('Tas med: 0 punkter, 2 linjer och 1 yta.');
    document.getElementById('gx-ok').click();
    expect(länkar.at(-1)).toBe('Testlager.geo');
    expect(document.getElementById('modal').style.display).toBe('none');
    vi.restoreAllMocks();
  });

  it('dialogen varnar när koordinatsystemets namn inte är verifierat', () => {
    blandatLager();
    setState({ activeCRS: 'sweref99tm' });
    document.body.innerHTML = '<div id="modal" style="display:none"><div id="mi"></div></div>';
    UI.openVisualGeoExport();
    expect(document.getElementById('mi').textContent).toContain(UI.UNVERIFIED_CRS_TEXT);
  });
});
