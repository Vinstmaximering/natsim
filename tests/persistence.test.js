// Persistence-tester för ver:3 JSON-format med obstacles.
// Testar _applySnapshot (ren funktion) och _buildSnapshot (läser state + DOM-fallback).

import { describe, it, expect, beforeEach } from 'vitest';
import { _applySnapshot, _buildSnapshot, _generateDefaultFilename, _sanitizeFilename } from '../src/io/export-project.js';
import { getState, setState } from '../src/state/store.js';
import { addObstacle } from '../src/state/obstacles.js';

// ─── Hjälpdata ────────────────────────────────────────────────────────────────

const BASE_STATE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  blockedSuggestions: [], selObsId: null,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1',
  symSize: 10, ellScale: 50, ellipsMode: '1sig', au: 'grad', nMid: 1,
};

const OBS_POLYGON = {
  id: 'obs_1', type: 'polygon', label: 'Hus A', source: 'manual',
  points: [[100, 200], [200, 200], [200, 300], [100, 300]],
};
const OBS_LINE = {
  id: 'obs_2', type: 'line', label: 'Vägg B', source: 'manual',
  points: [[300, 100], [400, 100]],
};
const OBS_OSM = {
  id: 'obs_3', type: 'polygon', label: 'OSM-byggnad', source: 'osm', osmId: 98765,
  points: [[1000, 2000], [1100, 2000], [1100, 2100]],
};

// Minimalt ver:1-projekt (inga obstacles-fält)
const V1_SNAP = {
  ver: 1, pts: [{ id: 'A', type: 'known', E: 100, N: 200, H: 0 }], meas: [],
  centerErr: 1.0, activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  defaultInstr: 'ts16_1', symSize: 10, ellScale: 50, ellipsMode: '1sig', au: 'grad', nMid: 1,
};

// Minimalt ver:2-projekt (inga obstacles-fält)
const V2_SNAP = { ...V1_SNAP, ver: 2 };

// ─── _buildSnapshot ───────────────────────────────────────────────────────────

describe('_buildSnapshot', () => {
  beforeEach(() => setState(BASE_STATE));

  it('sätter ver: 3', () => {
    const snap = _buildSnapshot();
    expect(snap.ver).toBe(3);
  });

  it('inkluderar obstacles-array', () => {
    setState({ obstacles: [OBS_POLYGON, OBS_LINE] });
    const snap = _buildSnapshot();
    expect(snap.obstacles).toHaveLength(2);
    expect(snap.obstacles[0].id).toBe('obs_1');
    expect(snap.obstacles[1].id).toBe('obs_2');
  });

  it('obstacles deep-kopierade – mutationer påverkar ej state', () => {
    setState({ obstacles: [OBS_POLYGON] });
    const snap = _buildSnapshot();
    snap.obstacles[0].label = 'MUTERAT';
    // Originalet i state ska inte påverkas
    expect(getState().obstacles[0].label).toBe('Hus A');
  });

  it('tom obstacles → tom array i snapshot', () => {
    setState({ obstacles: [] });
    const snap = _buildSnapshot();
    expect(snap.obstacles).toEqual([]);
  });

  it('bevarar befintliga fält oförändrade', () => {
    setState({ pts: [{ id: 'P1', type: 'station', E: 0, N: 0, H: 0 }], nMid: 5 });
    const snap = _buildSnapshot();
    expect(snap.pts[0].id).toBe('P1');
    expect(snap.nMid).toBe(5);
  });
});

// ─── _applySnapshot ───────────────────────────────────────────────────────────

describe('_applySnapshot', () => {
  beforeEach(() => setState(BASE_STATE));

  it('ver:3 → obstacles laddas', () => {
    const snap = { ...V2_SNAP, ver: 3, obstacles: [OBS_POLYGON, OBS_LINE] };
    _applySnapshot(snap);
    expect(getState().obstacles).toHaveLength(2);
  });

  it('ver:2 → obstacles = [] (bakåtkompatibelt)', () => {
    const snap = { ...V2_SNAP, obstacles: [OBS_POLYGON] }; // obstacles-fält ignoreras
    _applySnapshot(snap);
    expect(getState().obstacles).toEqual([]);
  });

  it('ver:1 → obstacles = [] (bakåtkompatibelt)', () => {
    _applySnapshot(V1_SNAP);
    expect(getState().obstacles).toEqual([]);
  });

  it('ver:3 utan obstacles-fält → tom array, ingen krasch', () => {
    const snap = { ...V2_SNAP, ver: 3 }; // inget obstacles-fält
    expect(() => _applySnapshot(snap)).not.toThrow();
    expect(getState().obstacles).toEqual([]);
  });

  it('v1-stil x/y-fält strippas från pts', () => {
    const v1WithXY = {
      ...V1_SNAP,
      pts: [{ id: 'A', type: 'known', E: 100, N: 200, H: 0, x: 300, y: 400 }],
    };
    _applySnapshot(v1WithXY);
    const pt = getState().pts[0];
    expect(pt.x).toBeUndefined();
    expect(pt.y).toBeUndefined();
    expect(pt.E).toBe(100);
    expect(pt.N).toBe(200);
  });

  it('simResult nollställs vid laddning', () => {
    setState({ simResult: { ok: true, K_global: 0.5 } });
    _applySnapshot(V2_SNAP);
    expect(getState().simResult).toBeNull();
  });
});

// ─── Roundtrip ────────────────────────────────────────────────────────────────

describe('Roundtrip: spara → ladda', () => {
  beforeEach(() => setState(BASE_STATE));

  it('2 obstacles bevaras exakt genom JSON-serialisering', () => {
    setState({ obstacles: [OBS_POLYGON, OBS_LINE] });
    const json = JSON.stringify(_buildSnapshot());

    // Rensa state och ladda om
    setState({ obstacles: [] });
    _applySnapshot(JSON.parse(json));

    const obs = getState().obstacles;
    expect(obs).toHaveLength(2);
    expect(obs[0]).toMatchObject(OBS_POLYGON);
    expect(obs[1]).toMatchObject(OBS_LINE);
  });

  it('polygon + linje + OSM-hinder i ver:3 bevaras alla', () => {
    setState({ obstacles: [OBS_POLYGON, OBS_LINE, OBS_OSM] });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ obstacles: [] });
    _applySnapshot(snap);

    const obs = getState().obstacles;
    expect(obs).toHaveLength(3);

    const osmObs = obs.find(o => o.source === 'osm');
    expect(osmObs).toBeDefined();
    expect(osmObs.osmId).toBe(98765);

    const poly = obs.find(o => o.id === 'obs_1');
    expect(poly.type).toBe('polygon');
    expect(poly.points).toEqual([[100, 200], [200, 200], [200, 300], [100, 300]]);

    const wall = obs.find(o => o.id === 'obs_2');
    expect(wall.type).toBe('line');
  });

  it('pts och meas bevaras genom roundtrip', () => {
    setState({
      pts:  [{ id: 'FP1', type: 'known', E: 500100, N: 6580200, H: 45.0 }],
      meas: [{ id: 'M1', from: 'FP1', to: 'S1', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 }],
    });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ pts: [], meas: [] });
    _applySnapshot(snap);
    expect(getState().pts[0].id).toBe('FP1');
    expect(getState().meas[0].id).toBe('M1');
  });
});

// ─── ID-räknare ───────────────────────────────────────────────────────────────

describe('ID-räknare synkas efter laddning', () => {
  beforeEach(() => setState(BASE_STATE));

  it('addObstacle efter laddning får ID efter laddade IDs', () => {
    const snap = { ...V2_SNAP, ver: 3, obstacles: [OBS_POLYGON, OBS_LINE] };
    // OBS_POLYGON har obs_1, OBS_LINE har obs_2
    _applySnapshot(snap);

    // Nästa addObstacle ska inte ge obs_1 eller obs_2
    const newId = addObstacle({ type: 'line', points: [[0, 0], [10, 0]] });
    expect(newId).not.toBe('obs_1');
    expect(newId).not.toBe('obs_2');
    // Ska vara obs_3 eller senare
    const numPart = parseInt(newId.replace('obs_', ''), 10);
    expect(numPart).toBeGreaterThan(2);
  });
});

// ─── _generateDefaultFilename ─────────────────────────────────────────────────

describe('_generateDefaultFilename', () => {
  it('returnerar sträng på formatet stomnät_YYYY-MM-DD_HH-mm', () => {
    expect(_generateDefaultFilename()).toMatch(/^stomnät_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/);
  });

  it('innehåller inte .json-suffix', () => {
    expect(_generateDefaultFilename().endsWith('.json')).toBe(false);
  });
});

// ─── _sanitizeFilename ────────────────────────────────────────────────────────

describe('_sanitizeFilename', () => {
  const DEF = 'stomnät_2025-01-01_12-00';

  it('tar bort otillåtna tecken \\ / : * ? " < > |', () => {
    expect(_sanitizeFilename('fil\\/:*?"<>|namn', DEF)).toBe('filnamn');
  });

  it('trimmar whitespace', () => {
    expect(_sanitizeFilename('  mitt projekt  ', DEF)).toBe('mitt projekt');
  });

  it('tomt input → default-namn', () => {
    expect(_sanitizeFilename('', DEF)).toBe(DEF);
  });

  it('bara otillåtna tecken → default-namn', () => {
    expect(_sanitizeFilename('//\\\\', DEF)).toBe(DEF);
  });

  it('tar bort .json suffix (lowercase)', () => {
    expect(_sanitizeFilename('mitt projekt.json', DEF)).toBe('mitt projekt');
  });

  it('tar bort .JSON suffix (uppercase)', () => {
    expect(_sanitizeFilename('mitt projekt.JSON', DEF)).toBe('mitt projekt');
  });

  it('klipper av vid 100 tecken', () => {
    expect(_sanitizeFilename('a'.repeat(110), DEF)).toHaveLength(100);
  });

  it('bevarar normalt filnamn oförändrat', () => {
    expect(_sanitizeFilename('mätning_2024', DEF)).toBe('mätning_2024');
  });
});

// ─── Bakåtkompatibilitet: simulerade äldre filer ──────────────────────────────

describe('Bakåtkompatibilitet med äldre fil-format', () => {
  beforeEach(() => setState(BASE_STATE));

  it('loadProject med ver:2-JSON returnerar true och sätter korrekt state', () => {
    // Simulera loadProject direkt via _applySnapshot (DOM-delen hoppas över i tester)
    const v2json = JSON.stringify(V2_SNAP);
    const parsed = JSON.parse(v2json);
    expect(parsed.ver).toBe(2);
    _applySnapshot(parsed);
    expect(getState().pts[0].id).toBe('A');
    expect(getState().obstacles).toEqual([]);
  });

  it('ladda ver:1-JSON med x/y-pixelkoordinater → strippade', () => {
    const v1WithPixels = JSON.stringify({
      ver: 1,
      pts: [{ id: 'B', type: 'known', E: 200, N: 300, H: 0, x: 100, y: 200 }],
      meas: [], centerErr: 1.0, activeCRS: 'sweref99tm', activeLayerKey: 'osm',
      defaultInstr: 'ts16_1', symSize: 10, ellScale: 50, ellipsMode: '1sig', au: 'grad', nMid: 1,
    });
    _applySnapshot(JSON.parse(v1WithPixels));
    expect(getState().pts[0].x).toBeUndefined();
    expect(getState().obstacles).toEqual([]);
  });
});
