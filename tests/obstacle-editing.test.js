import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getState, setState } from '../src/state/store.js'
import { addObstacle, updateObstacle, _syncObstacleCounter, getObstacles, clearObstacleSelection } from '../src/state/obstacles.js'
import {
  HANDLE_HIT_PX,
  EDGE_HIT_PX,
  hitTestHandle,
  hitTestEdge,
  hitTestObstacle,
  getHandlesForObstacle,
  startNodeDrag,
  updateNodeDrag,
  endNodeDrag,
  isDraggingNode,
  getDragSnapTarget,
  insertNode,
  deleteNode,
} from '../src/map/obstacle-editing.js'

// Minimal Leaflet map-mock: latLngToContainerPoint(latlng) → {x, y}
// Vi antar att {E,N} passeras direkt som pixel-koordinater för enkelhets skull.
// ENtoLatLng(E,N) → {lat:N, lng:E}  (enkel pass-through)
// latLngToEN({lat,lng}) → {E:lng, N:lat}
function makeMapMock(scale = 1) {
  return {
    latLngToContainerPoint: ({ lat, lng }) => ({ x: lng * scale, y: lat * scale }),
  };
}
const ENtoLatLng = (E, N) => ({ lat: N, lng: E });
const latLngToEN = ({ lat, lng }) => ({ E: lng, N: lat });

// Kvadrat-polygon med hörn vid (0,0),(100,0),(100,100),(0,100)
function squareObs() {
  return {
    id: 'obs_sq',
    type: 'polygon',
    points: [[0, 0], [100, 0], [100, 100], [0, 100]],
  };
}

// Linje-hinder
function lineObs() {
  return { id: 'obs_ln', type: 'line', points: [[0, 0], [100, 0]] };
}

beforeEach(() => {
  setState({ obstacles: [], selObsId: null });
  _syncObstacleCounter([]);
  endNodeDrag(); // rensa ev. drag-state från förra testet
});

// ── getHandlesForObstacle ─────────────────────────────────────────────────────

describe('getHandlesForObstacle', () => {
  it('returnerar en handle per hörn med korrekt pointIndex', () => {
    const map     = makeMapMock();
    const handles = getHandlesForObstacle(squareObs(), map, ENtoLatLng);
    expect(handles).toHaveLength(4);
    expect(handles[0]).toMatchObject({ x: 0,   y: 0,   pointIndex: 0 });
    expect(handles[1]).toMatchObject({ x: 100, y: 0,   pointIndex: 1 });
    expect(handles[2]).toMatchObject({ x: 100, y: 100, pointIndex: 2 });
    expect(handles[3]).toMatchObject({ x: 0,   y: 100, pointIndex: 3 });
  });

  it('returnerar tom array om map är null', () => {
    expect(getHandlesForObstacle(squareObs(), null, ENtoLatLng)).toEqual([]);
  });
});

// ── hitTestHandle ─────────────────────────────────────────────────────────────

describe('hitTestHandle', () => {
  const map = makeMapMock();

  it('träff exakt på hörn → rätt pointIndex', () => {
    expect(hitTestHandle(0,   0,   squareObs(), map, ENtoLatLng)).toBe(0);
    expect(hitTestHandle(100, 0,   squareObs(), map, ENtoLatLng)).toBe(1);
    expect(hitTestHandle(100, 100, squareObs(), map, ENtoLatLng)).toBe(2);
    expect(hitTestHandle(0,   100, squareObs(), map, ENtoLatLng)).toBe(3);
  });

  it(`träff inom ${HANDLE_HIT_PX}px → returnerar index`, () => {
    // Klick 7px bort från hörn (0,0) – ska träffa
    expect(hitTestHandle(7, 0, squareObs(), map, ENtoLatLng)).toBe(0);
  });

  it('missar utanför tolerans → null', () => {
    // Klick 9px bort (> HANDLE_HIT_PX=8)
    expect(hitTestHandle(9, 0, squareObs(), map, ENtoLatLng)).toBeNull();
  });

  it('klick mitt på kanten → null (ingen handel träffad)', () => {
    expect(hitTestHandle(50, 0, squareObs(), map, ENtoLatLng)).toBeNull();
  });
});

// ── hitTestEdge ───────────────────────────────────────────────────────────────

describe('hitTestEdge', () => {
  const map = makeMapMock();

  it('träff mitt på överkant → edgeIndex=0, insertPoint korrekt', () => {
    // Överkant: (0,0)→(100,0). Mitt = (50,0).
    const result = hitTestEdge(50, 0, squareObs(), map, ENtoLatLng);
    expect(result).not.toBeNull();
    expect(result.edgeIndex).toBe(0);
    expect(result.insertPoint.E).toBeCloseTo(50);
    expect(result.insertPoint.N).toBeCloseTo(0);
  });

  it('träff mitt på stängningskant (sista→första) → edgeIndex=3', () => {
    // Stängningskant: (0,100)→(0,0). Mitt = (0,50).
    const result = hitTestEdge(0, 50, squareObs(), map, ENtoLatLng);
    expect(result).not.toBeNull();
    expect(result.edgeIndex).toBe(3);
  });

  it('miss utanför kanter → null', () => {
    expect(hitTestEdge(50, 50, squareObs(), map, ENtoLatLng)).toBeNull(); // mitt i polygon
    expect(hitTestEdge(200, 0, squareObs(), map, ENtoLatLng)).toBeNull(); // utanför
  });

  it('linje-hinder → null (insert ej tillåtet)', () => {
    expect(hitTestEdge(50, 0, lineObs(), map, ENtoLatLng)).toBeNull();
  });

  it('klick exakt på hörn → räknas som kantträff om inom tolerans', () => {
    // Hörn (0,0) ligger på kant 3→0 och kant 0→1 – något ska returneras
    const result = hitTestEdge(0, 0, squareObs(), map, ENtoLatLng);
    expect(result).not.toBeNull();
  });

  it(`tolerans-regression 5→10px: träff vid ${EDGE_HIT_PX - 2}px, miss vid ${EDGE_HIT_PX + 1}px`, () => {
    // Kant (0,0)→(100,0) vid y=0. Klick vid y=(EDGE_HIT_PX-2) ska träffa.
    expect(hitTestEdge(50, EDGE_HIT_PX - 2, squareObs(), map, ENtoLatLng)).not.toBeNull();
    // Klick vid y=(EDGE_HIT_PX+1) ska missa.
    expect(hitTestEdge(50, EDGE_HIT_PX + 1, squareObs(), map, ENtoLatLng)).toBeNull();
  });
});

// ── hitTestObstacle ───────────────────────────────────────────────────────────

describe('hitTestObstacle', () => {
  const map = makeMapMock();

  it('polygon: punkt inne i kvadraten → true', () => {
    expect(hitTestObstacle(50, 50, squareObs(), map, ENtoLatLng)).toBe(true);
  });

  it('polygon: punkt utanför kvadraten → false', () => {
    expect(hitTestObstacle(150, 50, squareObs(), map, ENtoLatLng)).toBe(false);
  });

  it('polygon: punkt exakt på kanten → true (kant räknas som inuti)', () => {
    // y=0 är överkanten på kvadraten
    expect(hitTestObstacle(50, 0, squareObs(), map, ENtoLatLng)).toBe(true);
  });

  it('linje: punkt nära linjen (≤8px) → true', () => {
    // Linje (0,0)→(100,0). Klick vid (50,6) – 6px bort → ska träffa
    expect(hitTestObstacle(50, 6, lineObs(), map, ENtoLatLng)).toBe(true);
  });

  it('linje: punkt långt från linjen (>8px) → false', () => {
    expect(hitTestObstacle(50, 20, lineObs(), map, ENtoLatLng)).toBe(false);
  });

  it('null map → false (ingen krasch)', () => {
    expect(hitTestObstacle(50, 50, squareObs(), null, ENtoLatLng)).toBe(false);
  });

  it('selObsId sätts korrekt vid klick på hinder-yta (state-test)', () => {
    // Simulerar click-handlerns logik: hitTestObstacle träffar → setState(selObsId)
    setState({ obstacles: [], selObsId: null });
    _syncObstacleCounter([]);
    const id  = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100],[0,100]] });
    clearObstacleSelection(); // börja omarkerat

    const { obstacles } = getState();
    const hit = obstacles.find(obs => hitTestObstacle(50, 50, obs, map, ENtoLatLng));
    if (hit && getState().selObsId !== hit.id) setState({ selObsId: hit.id });

    expect(getState().selObsId).toBe(id);
  });
});

// ── insertNode ────────────────────────────────────────────────────────────────

describe('insertNode', () => {
  it('infogar hörn efter angivet index', () => {
    const id  = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    insertNode(id, 0, { E: 50, N: 0 });
    const obs = getObstacles().find(o => o.id === id);
    expect(obs.points).toHaveLength(4);
    expect(obs.points[1]).toEqual([50, 0]);
  });

  it('infogar efter sista indexet', () => {
    const id  = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    insertNode(id, 2, { E: 0, N: 50 });
    const obs = getObstacles().find(o => o.id === id);
    expect(obs.points[3]).toEqual([0, 50]);
  });

  it('ignorerar okänt obsId utan krasch', () => {
    expect(() => insertNode('obs_999', 0, { E: 0, N: 0 })).not.toThrow();
  });
});

// ── deleteNode ────────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('tar bort hörn vid angivet index', () => {
    const id  = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100],[0,100]] });
    deleteNode(id, 1, () => {});
    const obs = getObstacles().find(o => o.id === id);
    expect(obs.points).toHaveLength(3);
    expect(obs.points[1]).toEqual([100, 100]); // index 2 → 1 efter borttagning
  });

  it('blockerar om polygon skulle få < 3 hörn – visar toast', () => {
    const id     = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    const toasts = [];
    deleteNode(id, 0, (msg) => toasts.push(msg));
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain('minst 3 hörn');
    // Polygon oförändrad
    expect(getObstacles().find(o => o.id === id).points).toHaveLength(3);
  });

  it('linje-hinder går ej att ta bort hörn ifrån', () => {
    const id  = addObstacle({ type: 'line', points: [[0,0],[100,0]] });
    deleteNode(id, 0, () => {});
    expect(getObstacles().find(o => o.id === id).points).toHaveLength(2);
  });

  it('ignorerar okänt obsId utan krasch', () => {
    expect(() => deleteNode('obs_999', 0, () => {})).not.toThrow();
  });
});

// ── Drag-livscykel ────────────────────────────────────────────────────────────

describe('drag-livscykel (startNodeDrag / updateNodeDrag / endNodeDrag)', () => {
  const map = makeMapMock();

  it('isDraggingNode() är false från start', () => {
    expect(isDraggingNode()).toBe(false);
  });

  it('startNodeDrag sätter isDraggingNode() true', () => {
    addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    startNodeDrag('obs_1', 0);
    expect(isDraggingNode()).toBe(true);
    endNodeDrag();
  });

  it('endNodeDrag återställer isDraggingNode() till false', () => {
    startNodeDrag('obs_1', 0);
    endNodeDrag();
    expect(isDraggingNode()).toBe(false);
  });

  it('updateNodeDrag flyttar hörnet till ny position', () => {
    const id  = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    startNodeDrag(id, 0);
    // Flytta hörn 0 till (E=30, N=40)
    // latlng = {lat:40, lng:30}, containerPoint = {x:30, y:40}
    updateNodeDrag({ lat: 40, lng: 30 }, { x: 30, y: 40 }, map, ENtoLatLng, latLngToEN);
    const obs = getObstacles().find(o => o.id === id);
    expect(obs.points[0][0]).toBeCloseTo(30); // E
    expect(obs.points[0][1]).toBeCloseTo(40); // N
    expect(obs.points[1]).toEqual([100, 0]);  // övriga hörn oförändrade
    endNodeDrag();
  });

  it('updateNodeDrag uppdaterar state utan krasch (saveUndo triggas internt)', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    startNodeDrag(id, 0);
    expect(() =>
      updateNodeDrag({ lat: 10, lng: 20 }, { x: 20, y: 10 }, map, ENtoLatLng, latLngToEN)
    ).not.toThrow();
    // Hörn ska ha uppdaterats
    const obs = getObstacles().find(o => o.id === id);
    expect(obs.points[0]).toEqual([20, 10]);
    endNodeDrag();
  });

  it('getDragSnapTarget är null utan snap-mål', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    startNodeDrag(id, 0);
    // Inga andra hinder → ingen snap
    updateNodeDrag({ lat: 50, lng: 50 }, { x: 50, y: 50 }, map, ENtoLatLng, latLngToEN);
    expect(getDragSnapTarget()).toBeNull();
    endNodeDrag();
  });

  it('getDragSnapTarget returnerar snap-mål när annat hinder är nära', () => {
    const id1 = addObstacle({ type: 'polygon', points: [[0,0],[100,0],[100,100]] });
    // Andra hinder med hörn vid (200,200)
    addObstacle({ type: 'polygon', points: [[200,200],[300,200],[300,300]] });
    startNodeDrag(id1, 0);
    // Drag till nära (200,200) – inom SNAP_PX=15px
    updateNodeDrag({ lat: 200, lng: 200 }, { x: 200, y: 200 }, map, ENtoLatLng, latLngToEN);
    expect(getDragSnapTarget()).toEqual({ E: 200, N: 200 });
    endNodeDrag();
  });
});
