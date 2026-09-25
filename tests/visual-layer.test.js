// Etapp D: visuellt lager – punkter och linjer enbart för visuellt bruk.
// – datamodell, endpoints mot både visuella och vanliga nätpunkter
// – separation från pts/meas (simuleringen får aldrig se lagret)
// – koppling till hinder-systemet: väggen följer den visuella linjen
// – serialisering + bakåtkompatibilitet för filer utan lagret

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VISUAL_COLORS, VISUAL_DEFAULT_COLOR,
  makeEndpoint, resolveEndpoint, visualLineCoords,
  addVisualPt, addVisualLine, updateVisualPt, updateVisualLine,
  removeVisualPt, removeVisualLine,
  findVisualPt, findVisualLine, syncLinkedObstacles,
  _sanitizeVisual, _nextCounter,
} from '../src/state/visual.js';
import { addObstacle } from '../src/state/obstacles.js';
import { getState, setState } from '../src/state/store.js';
import { _buildSnapshot, _applySnapshot } from '../src/io/export-project.js';
import { runSimulation } from '../src/core/simulation.js';
import { suggestMeasurements } from '../src/ui/right-panel.js';
import { findBlockedMeasurements } from '../src/core/visibility.js';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
  symSize: 10, ellScale: 50, ellipsMode: '1sig', au: 'grad', nMid: 1, nId: 1,
};

const reset = () => setState({ ...BASE });

describe('datamodell', () => {
  beforeEach(reset);

  it('addVisualPt ger löpande id och lagrar koordinater', () => {
    const a = addVisualPt({ E: 10, N: 20, H: 5 });
    const b = addVisualPt({ E: 30, N: 40 });
    expect(a).toBe('V1');
    expect(b).toBe('V2');
    expect(findVisualPt('V1')).toMatchObject({ E: 10, N: 20, H: 5, color: null });
    // Polylinjer Etapp 1: saknad höjd är null, inte 0.
    expect(findVisualPt('V2').H).toBeNull();
  });

  it('addVisualLine ger löpande id och saknar koppling från början', () => {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const id = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    expect(id).toBe('VL1');
    expect(findVisualLine(id).linkedObsIds).toEqual([]);
  });

  it('färger normaliseras och kan nollställas', () => {
    const id = addVisualPt({ E: 0, N: 0, color: '#ABC' });
    expect(findVisualPt(id).color).toBe('#aabbcc');
    updateVisualPt(id, { color: 'skräp' });
    expect(findVisualPt(id).color).toBeNull();
  });

  it('VISUAL_COLORS har sex giltiga förval och en standardfärg', () => {
    expect(VISUAL_COLORS).toHaveLength(6);
    expect(VISUAL_DEFAULT_COLOR).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('endpoints', () => {
  beforeEach(reset);

  it('löser upp en visuell punkt', () => {
    const v = addVisualPt({ E: 5, N: 7, H: 2 });
    expect(resolveEndpoint(makeEndpoint('visual', v))).toEqual({ E: 5, N: 7, H: 2 });
  });

  it('löser upp en vanlig nätpunkt', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 100, N: 200, H: 12 }] });
    expect(resolveEndpoint(makeEndpoint('net', 'S1'))).toEqual({ E: 100, N: 200, H: 12 });
  });

  it('skiljer visuell och nätpunkt med samma id', () => {
    setState({ pts: [{ id: 'X', type: 'new', E: 999, N: 999 }] });
    setState({ visualPts: [{ id: 'X', E: 1, N: 2, H: 0, color: null }] });
    expect(resolveEndpoint(makeEndpoint('net', 'X')).E).toBe(999);
    expect(resolveEndpoint(makeEndpoint('visual', 'X')).E).toBe(1);
  });

  it('ger null när målet saknas', () => {
    expect(resolveEndpoint(makeEndpoint('visual', 'FINNS_EJ'))).toBeNull();
    expect(resolveEndpoint(null)).toBeNull();
  });

  it('en linje kan gå mellan en nätpunkt och en visuell punkt', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 0, N: 0 }] });
    const v = addVisualPt({ E: 50, N: 0 });
    const id = addVisualLine({ from: makeEndpoint('net', 'S1'), to: makeEndpoint('visual', v) });
    expect(visualLineCoords(findVisualLine(id))).toEqual([[0, 0], [50, 0]]);
  });

  it('linje med raderad endpoint ger null i stället för fel koordinat', () => {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const id = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    setState({ visualPts: getState().visualPts.filter(p => p.id !== b) });
    expect(visualLineCoords(findVisualLine(id))).toBeNull();
  });
});

describe('separation från simuleringen', () => {
  beforeEach(reset);

  it('visuella objekt ingår inte i pts eller meas', () => {
    addVisualPt({ E: 1, N: 1 });
    addVisualPt({ E: 2, N: 2 });
    expect(getState().pts).toEqual([]);
    expect(getState().meas).toEqual([]);
  });

  it('simuleringen påverkas inte av visuella objekt', () => {
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

    const a = addVisualPt({ E: 25, N: 25 });
    const b = addVisualPt({ E: 75, N: 75 });
    addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    runSimulation();

    expect(JSON.stringify(getState().simResult)).toBe(before);
  });

  it('mätförslag genereras inte till visuella punkter', () => {
    setState({
      pts: [
        { id: 'S1',  type: 'station', E: 0,  N: 0 },
        { id: 'FP1', type: 'known',   E: 50, N: 0 },
      ],
    });
    addVisualPt({ E: 10, N: 10 });
    suggestMeasurements();
    const ids = getState().suggestedMeas.flatMap(s => [s.from, s.to]);
    expect(ids).not.toContain('V1');
  });

  it('en visuell linje blockerar inte sikt av sig själv', () => {
    const pts = [
      { id: 'S1', type: 'station', E: 0,   N: 0 },
      { id: 'P1', type: 'new',     E: 100, N: 0 },
    ];
    setState({ pts });
    const a = addVisualPt({ E: 50, N: -50 });
    const b = addVisualPt({ E: 50, N: 50 });
    addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    const meas = [{ id: 'M1', from: 'S1', to: 'P1' }];
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toEqual([]);
  });
});

describe('borttagning', () => {
  beforeEach(reset);

  it('borttagen punkt tar med sig linjer som hänger på den', () => {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const c = addVisualPt({ E: 20, N: 0 });
    addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    addVisualLine({ from: makeEndpoint('visual', b), to: makeEndpoint('visual', c) });

    const n = removeVisualPt(b);
    expect(n).toBe(2);
    expect(getState().visualLines).toHaveLength(0);
    expect(getState().visualPts.map(p => p.id)).toEqual([a, c]);
  });

  it('borttagen linje lämnar punkterna kvar', () => {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const id = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    removeVisualLine(id);
    expect(getState().visualLines).toHaveLength(0);
    expect(getState().visualPts).toHaveLength(2);
  });
});

// ── D4 ──────────────────────────────────────────────────────────────────────

describe('koppling till hinder-systemet', () => {
  beforeEach(reset);

  // Skapar en visuell linje med ett kopplat hinder, som kontextmenyn gör.
  function linkedLine() {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const lineId = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    const obsId = addObstacle({
      type: 'line', label: 'Vägg (VL1)', color: '#8aa8c0', source: 'visual',
      points: visualLineCoords(findVisualLine(lineId)),
    });
    updateVisualLine(lineId, { linkedObsIds: [obsId] });
    return { a, b, lineId, obsId };
  }

  const obsPoints = id => getState().obstacles.find(o => o.id === id).points;

  it('hindret får linjens koordinater', () => {
    const { obsId } = linkedLine();
    expect(obsPoints(obsId)).toEqual([[0, 0], [10, 0]]);
  });

  it('flyttad endpoint drar med sig väggen', () => {
    const { a, obsId } = linkedLine();
    updateVisualPt(a, { E: -5, N: 3 });
    expect(obsPoints(obsId)).toEqual([[-5, 3], [10, 0]]);
  });

  it('väggen följer även när endpointen är en nätpunkt som flyttas', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 0, N: 0 }] });
    const v = addVisualPt({ E: 20, N: 0 });
    const lineId = addVisualLine({ from: makeEndpoint('net', 'S1'), to: makeEndpoint('visual', v) });
    const obsId = addObstacle({
      type: 'line', points: visualLineCoords(findVisualLine(lineId)), source: 'visual',
    });
    updateVisualLine(lineId, { linkedObsIds: [obsId] });

    setState({ pts: [{ id: 'S1', type: 'station', E: 7, N: 9 }] });
    syncLinkedObstacles();
    expect(obsPoints(obsId)).toEqual([[7, 9], [20, 0]]);
  });

  it('den kopplade väggen blockerar sikt på riktigt', () => {
    reset();
    const pts = [
      { id: 'S1', type: 'station', E: 0,   N: 0 },
      { id: 'P1', type: 'new',     E: 100, N: 0 },
    ];
    setState({ pts });
    const a = addVisualPt({ E: 50, N: -50 });
    const b = addVisualPt({ E: 50, N: 50 });
    const lineId = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    const obsId = addObstacle({
      type: 'line', source: 'visual', points: visualLineCoords(findVisualLine(lineId)),
    });
    updateVisualLine(lineId, { linkedObsIds: [obsId] });

    const meas = [{ id: 'M1', from: 'S1', to: 'P1' }];
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toHaveLength(1);

    // Flytta undan linjen – sikten blir fri utan att röra hindret direkt
    updateVisualPt(a, { E: 500, N: -50 });
    updateVisualPt(b, { E: 500, N: 50 });
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toHaveLength(0);
  });

  it('borttagen linje tar bort det kopplade hindret', () => {
    const { lineId, obsId } = linkedLine();
    removeVisualLine(lineId);
    expect(getState().obstacles.find(o => o.id === obsId)).toBeUndefined();
  });

  it('borttagen endpoint tar bort både linjen och hindret', () => {
    const { a, obsId } = linkedLine();
    removeVisualPt(a);
    expect(getState().visualLines).toHaveLength(0);
    expect(getState().obstacles.find(o => o.id === obsId)).toBeUndefined();
  });

  it('hinder som raderats separat nollställer linjens koppling', () => {
    const { lineId, obsId } = linkedLine();
    setState({ obstacles: getState().obstacles.filter(o => o.id !== obsId) });
    syncLinkedObstacles();
    expect(findVisualLine(lineId).linkedObsIds).toEqual([]);
  });

  it('oupplöslig källa tar bort spökväggen och nollställer kopplingen', () => {
    const { a, lineId, obsId } = linkedLine();
    // Endpointen försvinner utan att gå via removeVisualPt (som filen kan se ut
    // efter en handredigering eller en raderad nätpunkt).
    setState({ visualPts: getState().visualPts.filter(p => p.id !== a) });
    syncLinkedObstacles();
    expect(getState().obstacles.find(o => o.id === obsId)).toBeUndefined();
    expect(findVisualLine(lineId).linkedObsIds).toEqual([]);
  });

  it('okopplade hinder rörs inte av synkningen', () => {
    const fristaende = addObstacle({ type: 'line', points: [[0, 0], [1, 1]] });
    linkedLine();
    updateVisualPt('V1', { E: 99, N: 99 });
    expect(obsPoints(fristaende)).toEqual([[0, 0], [1, 1]]);
  });
});

// ── Serialisering ───────────────────────────────────────────────────────────

describe('nätpunkt som ändpunkt', () => {
  beforeEach(reset);

  // Speglar det savePM/delPt i modals.js gör när en nätpunkt som en visuell
  // linje hänger i byter namn eller raderas.
  it('namnbyte på nätpunkten kan följas av endpointen', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 0, N: 0 }] });
    const v = addVisualPt({ E: 10, N: 0 });
    const lineId = addVisualLine({ from: makeEndpoint('net', 'S1'), to: makeEndpoint('visual', v) });

    const remap = ep => (ep?.ref === 'net' && ep.id === 'S1') ? { ...ep, id: 'NY' } : ep;
    setState({
      pts: [{ id: 'NY', type: 'station', E: 0, N: 0 }],
      visualLines: getState().visualLines.map(l => ({ ...l, vertices: l.vertices.map(remap) })),
    });

    expect(findVisualLine(lineId).vertices[0].id).toBe('NY');
    expect(visualLineCoords(findVisualLine(lineId))).toEqual([[0, 0], [10, 0]]);
  });

  it('raderad nätpunkt gör linjen oupplöslig', () => {
    setState({ pts: [{ id: 'S1', type: 'station', E: 0, N: 0 }] });
    const v = addVisualPt({ E: 10, N: 0 });
    const lineId = addVisualLine({ from: makeEndpoint('net', 'S1'), to: makeEndpoint('visual', v) });
    setState({ pts: [] });
    expect(visualLineCoords(findVisualLine(lineId))).toBeNull();
  });
});

describe('serialisering', () => {
  beforeEach(reset);

  it('visuella objekt följer med i sparad projektfil', () => {
    const a = addVisualPt({ E: 1, N: 2, color: '#ffd54f' });
    const b = addVisualPt({ E: 3, N: 4 });
    addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    const snap = _buildSnapshot();
    expect(snap.visualPts).toHaveLength(2);
    expect(snap.visualLines).toHaveLength(1);
    expect(snap.visualPts[0].color).toBe('#ffd54f');
  });

  it('överlever spara → ladda, inklusive koppling till hinder', () => {
    const a = addVisualPt({ E: 0, N: 0 });
    const b = addVisualPt({ E: 10, N: 0 });
    const lineId = addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b) });
    const obsId = addObstacle({
      type: 'line', source: 'visual', points: visualLineCoords(findVisualLine(lineId)),
    });
    updateVisualLine(lineId, { linkedObsIds: [obsId] });

    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    reset();
    _applySnapshot(snap);

    expect(getState().visualPts).toHaveLength(2);
    expect(findVisualLine(lineId).linkedObsIds).toEqual([obsId]);
    expect(getState().obstacles.find(o => o.id === obsId).points).toEqual([[0, 0], [10, 0]]);
  });

  it('äldre projektfil utan lagret laddas med tomt visuellt lager', () => {
    addVisualPt({ E: 1, N: 1 });
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [] });
    expect(getState().visualPts).toEqual([]);
    expect(getState().visualLines).toEqual([]);
    expect(getState().nVid).toBe(1);
  });

  it('ver:1-fil laddas utan att krascha', () => {
    _applySnapshot({ ver: 1, pts: [], meas: [] });
    expect(getState().visualPts).toEqual([]);
  });

  it('id-räknarna härleds ur innehållet så att nya objekt inte krockar', () => {
    _applySnapshot({
      ver: 3, pts: [], meas: [], obstacles: [],
      visualPts: [{ id: 'V7', E: 0, N: 0 }],
      visualLines: [],
      nVid: 1,   // felaktigt lågt värde i filen
    });
    expect(getState().nVid).toBe(8);
    expect(addVisualPt({ E: 1, N: 1 })).toBe('V8');
  });

  it('laddning rättar hinder-koordinater som avviker från linjen', () => {
    _applySnapshot({
      ver: 3, pts: [], meas: [],
      obstacles: [{ id: 'obs_1', type: 'line', source: 'visual', points: [[99, 99], [88, 88]] }],
      visualPts: [{ id: 'V1', E: 0, N: 0 }, { id: 'V2', E: 10, N: 0 }],
      visualLines: [{ id: 'VL1', from: { ref: 'visual', id: 'V1' }, to: { ref: 'visual', id: 'V2' }, linkedObsId: 'obs_1' }],
    });
    expect(getState().obstacles[0].points).toEqual([[0, 0], [10, 0]]);
  });
});

describe('_sanitizeVisual', () => {
  it('kastar punkter utan giltiga koordinater', () => {
    const { visualPts } = _sanitizeVisual(
      [{ id: 'V1', E: 1, N: 2 }, { id: 'V2', E: 'x', N: 2 }, { E: 1, N: 1 }, null], []);
    expect(visualPts.map(p => p.id)).toEqual(['V1']);
  });

  it('kastar linjer utan giltiga endpoints', () => {
    const { visualLines } = _sanitizeVisual([], [
      { id: 'VL1', from: { ref: 'visual', id: 'V1' }, to: { ref: 'net', id: 'S1' } },
      { id: 'VL2', from: null, to: { ref: 'visual', id: 'V2' } },
      { id: 'VL3' },
    ]);
    expect(visualLines.map(l => l.id)).toEqual(['VL1']);
  });

  it('okänd ref tolkas som visual', () => {
    const { visualLines } = _sanitizeVisual([], [
      { id: 'VL1', from: { ref: 'hittepå', id: 'V1' }, to: { ref: 'net', id: 'S1' } },
    ]);
    expect(visualLines[0].vertices.map(v => v.ref)).toEqual(['visual', 'net']);
  });

  it('tål undefined', () => {
    expect(_sanitizeVisual(undefined, undefined)).toEqual({ visualPts: [], visualLines: [] });
  });
});

describe('_nextCounter', () => {
  it('ger nästa lediga nummer', () => {
    expect(_nextCounter([{ id: 'V1' }, { id: 'V9' }, { id: 'V3' }], 'V')).toBe(10);
  });

  it('ger 1 för tom lista', () => {
    expect(_nextCounter([], 'V')).toBe(1);
    expect(_nextCounter(undefined, 'VL')).toBe(1);
  });

  it('skiljer V från VL', () => {
    expect(_nextCounter([{ id: 'VL5' }], 'V')).toBe(1);
    expect(_nextCounter([{ id: 'VL5' }], 'VL')).toBe(6);
  });
});
