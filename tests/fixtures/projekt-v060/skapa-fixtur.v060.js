// Engångsskript i en worktree på main (v0.6.0): bygger ett projekt med
// v0.6.0:s egen kod och sparar projektfil, autosparning och facit (simulering,
// sikt, ritade segment, etiketter) i tests/fixtures/projekt-v060/ bredvid
// skriptet – i worktreen; därifrån kopieras filerna till repots mapp.
import { it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Relativt skriptet (som ligger i tests/), så att ingen lokal sökväg följer med.
const OUT = fileURLToPath(new URL('./fixtures/projekt-v060/', import.meta.url));

// Påhittade .geo-filer: koordinater på jämna tal kring E 150 000, N 6 600 000
// (Sweref 99 15 45), punktnamn och lagernamn utan koppling till verkliga
// mätningar.
const E0 = 150000, N0 = 6600000;
const pkt = (namn, dE, dN, H = null) =>
  `Point "${namn}",${(N0 + dN).toFixed(3)},${(E0 + dE).toFixed(3)},${H === null ? '' : H.toFixed(3)},,,`;
const linje = (namn, flagga, ...hörn) =>
  [`	Line "${namn}",${flagga},`, '	begin', '		PointList', '		begin',
   ...hörn.map(([n, dE, dN, H]) => `			${pkt(n, dE, dN, H)}`), '		end', '	end'];
const geoFil = (punkter, linjer) => [
  'FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"', 'begin',
  '	FileInfo "Application","Påhittad testfil"',
  '	FileInfo "Coordinate System","Sweref 99 15 45 / RH2000 (SWEN17)"', 'end',
  'PointList', 'begin', ...punkter.map(p => `	${pkt(...p)}`), 'end',
  'LineList', 'begin', ...linjer.flat(), 'end', 'AttributeList', ''].join('\r\n');
const GEO_FILER = [
  ['test_oppna_linjer.geo', 'visual', geoFil(
    [['T1', 0, 0, 10], ['T2', 10, 0], ['T3', 20, 0, 12.5]],
    [linje('A', '', ['01', 0, 5, 10], ['02', 10, 5, 10]),
     linje('B', '', ['01', 20, 5], ['02', 30, 5]),
     linje('C', '', ['01', 0, 15, 11], ['02', 10, 25, 11]),
     linje('D', '', ['01', 20, 15], ['02', 30, 25])])],
  ['test_sluten_linje.geo', 'visual', geoFil([],
    [linje('Platta', '1', ['01', 50, 0, 9], ['02', 60, 0, 9], ['03', 60, 10, 9], ['04', 50, 10, 9])])],
  ['test_vaggar.geo', 'obstacle', geoFil([],
    [linje('V1', '', ['01', 100, 0], ['02', 110, 0], ['03', 110, 10]),
     linje('V2', '', ['01', 110, 10], ['02', 120, 10]),
     linje('V3', '', ['01', 100, 30], ['02', 110, 30]),
     linje('V4', '', ['01', 110, 30], ['02', 120, 30], ['03', 120, 40])])],
];

const { getState, setState } = await import('../src/state/store.js');
const V = await import('../src/state/visual.js');
const D = await import('../src/map/visual-drawing.js');
const { addObstacle } = await import('../src/state/obstacles.js');
const { parseGeo } = await import('../src/io/parse-geo.js');
const { applyGeoImport, defaultGeoImportOptions } = await import('../src/io/geo-import.js');
const { parseDxf } = await import('../src/io/parse-dxf.js');
const { applyDxfImport, defaultDxfImportOptions } = await import('../src/io/dxf-import.js');
const { _buildSnapshot } = await import('../src/io/export-project.js');
const { _buildAutosaveSnapshot } = await import('../src/state/persistence.js');
const { runSimulation } = await import('../src/core/simulation.js');
const { suggestMeasurements } = await import('../src/ui/right-panel.js');
const { findBlockedMeasurements } = await import('../src/core/visibility.js');
const { APP_VERSION } = await import('../src/core/version.js').catch(() => ({ APP_VERSION: '?' }));

const dxf = (...pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
const entities = (...body) => dxf([0, 'SECTION'], [2, 'ENTITIES'], ...body, [0, 'ENDSEC'], [0, 'EOF']);
const LINE = (layer, x1, y1, x2, y2) => [[0, 'LINE'], [8, layer], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]];
const LW = (layer, flags, ...vs) => [[0, 'LWPOLYLINE'], [8, layer], [90, vs.length], [70, flags],
  ...vs.flatMap(([x, y]) => [[10, x], [20, y]])];

const instr = { obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 };

it('bygger v0.6.0-projektet', () => {
  setState({
    pts: [
      { id: 'FP1', type: 'known',   E: 0,   N: 0,   H: 10.5 },
      { id: 'FP2', type: 'known',   E: 200, N: 0,   H: 0 },
      { id: 'FP3', type: 'known',   E: 0,   N: 200, H: 11 },
      { id: 'S1',  type: 'station', E: 100, N: 100, H: 12 },
      { id: 'P1',  type: 'new',     E: 150, N: 60,  H: 0 },
    ],
    meas: [
      { id: 'M1', from: 'S1', to: 'FP1', ...instr },
      { id: 'M2', from: 'S1', to: 'FP2', ...instr },
      { id: 'M3', from: 'S1', to: 'FP3', ...instr },
      { id: 'M4', from: 'S1', to: 'P1',  ...instr },
    ],
    obstacles: [], simResult: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
    suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
    netVisible: true, obstaclesVisible: true,
    activeCRS: 'sweref991545', activeLayerKey: 'osm',
    centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
    symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 5, nId: 1,
  });

  // ── Handritat med ritverktyget (som i appen) ──
  const hand = V.addVisualLayer({ name: 'Handritat', source: { kind: 'manual' } });
  const klick = (E, N) => D.handleVisualMapClick({ lat: N, lng: E });
  D.startVisualLineDraw();
  // Kedja med tre segment.
  klick(10, 10); klick(50, 10); klick(50, 50); klick(90, 50); D.breakVisualChain();
  // Sluten kedja: fyra segment tillbaka till första punkten.
  klick(300, 300); klick(400, 300); klick(400, 400); klick(300, 400); klick(300, 300); D.breakVisualChain();
  // T-korsning: (60,150) har tre segment.
  klick(10, 150); klick(60, 150); klick(110, 150); D.breakVisualChain();
  klick(60, 150); klick(60, 190); D.breakVisualChain();
  // Kedja via nätpunkten FP2.
  klick(250, 5); klick(200, 0); klick(200, -50); D.breakVisualChain();
  // Kedja där mittsegmentet får en egen färg.
  klick(500, 0); klick(550, 0); klick(600, 0); klick(650, 0); D.breakVisualChain();
  // Vägg: första segmentet kopplat till ett hinder, andra inte.
  klick(125, 60); klick(125, 100); klick(125, 130); D.breakVisualChain();
  // Två segment fram och tillbaka mellan samma punkter.
  klick(700, 0); klick(750, 0); klick(700, 0); D.breakVisualChain();
  D.cancelVisualDraw();

  const lines = getState().visualLines;
  const färgad = lines.find(l => V.visualLineCoords(l)[0][0] === 550);
  V.updateVisualLine(färgad.id, { color: '#f06292' });
  const vägg = lines.find(l => {
    const c = V.visualLineCoords(l); return c[0][0] === 125 && c[0][1] === 60;
  });
  const obsId = addObstacle({ type: 'line', label: `Vägg (${vägg.id})`, color: '#8aa8c0',
    source: 'visual', points: V.visualLineCoords(vägg) });
  V.updateVisualLine(vägg.id, { linkedObsId: obsId });
  // Dölj namn på kedjan med tre segment (hörnen är fria punkter här).
  const kedja = lines.filter(l => V.visualLineCoords(l).every(([E, N]) => N <= 50 && E <= 90 && E >= 10 && N >= 10));
  V.setVisualLabelsHidden(kedja.slice(0, 1).map(l => l.id), true);
  // Fria punkter: utan höjd (0) och med höjd.
  V.addVisualPt({ E: 20, N: 80, layerId: hand });
  V.addVisualPt({ E: 30, N: 80, H: 7.25, layerId: hand });
  // En yta som blockerar sikt.
  const h = [[160, 160], [180, 160], [180, 180], [160, 180]].map(([E, N]) => V.addVisualPt({ E, N, layerId: hand, role: 'vertex' }));
  V.addVisualArea({ vertices: h.map(x => V.makeEndpoint('visual', x)), layerId: hand, name: 'Hus', blocksSight: true });

  // ── Import .geo ──
  for (const [fil, lines, text] of GEO_FILER) {
    const parsed = parseGeo(text);
    applyGeoImport(parsed, { ...defaultGeoImportOptions(parsed, fil, 'sweref991545'), lines, changeCRS: false });
  }

  // ── Import DXF ──
  const p = parseDxf(entities(
    ...LINE('Kant', 1000, 0, 1010, 0), ...LINE('Kant', 1010, 0, 1010, 10), ...LINE('Kant', 1020, 20, 1030, 20),
    ...LW('Hus', 1, [1100, 0], [1110, 0], [1110, 10], [1100, 10]),
    ...LW('Hus', 0, [1200, 0], [1210, 0], [1210, 10])));
  applyDxfImport(p, { ...defaultDxfImportOptions(p, 'Ritning.dxf'), useZ: false });

  // ── Facit ──
  runSimulation();
  suggestMeasurements();
  const st = getState();
  const layerById = new Map(st.visualLayers.map(l => [l.id, l]));
  const facit = {
    appVersion: APP_VERSION,
    simResult: st.simResult,
    suggestedMeas: st.suggestedMeas,
    blockedSuggestions: st.blockedSuggestions,
    blocked: findBlockedMeasurements(st.meas, st.pts, st.obstacles),
    obstacles: st.obstacles,
    segments: st.visualLines.filter(l => V.isVisualObjVisible(l)).map(l => ({
      layerId: l.layerId, color: V.visualObjColor(l), linked: !!l.linkedObsId,
      coords: V.visualLineCoords(l),
    })),
    labels: Object.fromEntries(st.visualPts.map(pt => [pt.id, V.visualPtShowsLabel(pt, layerById.get(pt.layerId))])),
    positions: Object.fromEntries(st.visualLayers.map(l => [l.id, V.visualLayerPositions(l.id)])),
    antalSegment: st.visualLines.length,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'projekt.json'), JSON.stringify(_buildSnapshot(), null, 1));
  writeFileSync(join(OUT, 'autosave.json'), JSON.stringify(_buildAutosaveSnapshot(), null, 1));
  writeFileSync(join(OUT, 'facit.json'), JSON.stringify(facit, null, 1));
});
