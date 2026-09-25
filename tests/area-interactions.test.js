// Lager-verktyg Etapp 3: kartans händelser för ytor (map/interactions.js).
// En låtsaskarta samlar Leaflet-lyssnarna så att klick, dubbelklick och
// tangenter kan köras utan Leaflet. Skärmprojektion: x = E, y = −N.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Kartan tar både [N,E] (ENtoLatLng) och {lat,lng} (Leaflet-händelser).
// vi.mock hissas upp före px, därför står projektionen två gånger.
const px = ll => Array.isArray(ll) ? { x: ll[1], y: -ll[0] } : { x: ll.lng, y: -ll.lat };

vi.mock('../src/map/leaflet-setup.js', () => ({
  map: {
    latLngToContainerPoint: ll => Array.isArray(ll) ? { x: ll[1], y: -ll[0] } : { x: ll.lng, y: -ll.lat },
    dragging: { enable() {}, disable() {} },
    getContainer: () => ({ style: {} }),
  },
  ENtoLatLng: (E, N) => [N, E],
  latLngToEN: ll => ({ E: ll.lng, N: ll.lat }),
  ptPixel: p => ({ x: p.E, y: -p.N }),
  draw: vi.fn(), fitViewToENBounds: vi.fn(),
}));

const { initInteractions } = await import('../src/map/interactions.js');
const V = await import('../src/state/visual.js');
const D = await import('../src/map/visual-drawing.js');
const { getState, setState } = await import('../src/state/store.js');
const { setTool } = await import('../src/ui/toolbar.js');

const handlers = {};
const fakeMap = {
  on: (ev, fn) => { handlers[ev] = fn; },
  latLngToContainerPoint: px,
  dragging: { enable: vi.fn(), disable: vi.fn() },
  doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
  getContainer: () => document.body,
};
initInteractions(fakeMap);

const at = (E, N) => ({ latlng: { lat: N, lng: E }, originalEvent: { preventDefault() {}, clientX: 0, clientY: 0 } });
const klick = (E, N) => handlers.click(at(E, N));
const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  D.cancelVisualDraw();
  setState({
    pts: [], meas: [], obstacles: [], simResult: null, selObsId: null, selId: null, selMId: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, nVid: 1, nVlid: 1, nVaid: 1,
    visualLayers: [], activeVisualLayerId: null, nVlyid: 1, nId: 1, tool: 'pan',
    suggestedMeas: [], measFrom: null,
  });
  document.body.innerHTML = '';
});

function yta(blocks = false) {
  const l = V.addVisualLayer({ name: 'L' });
  const h = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
  const id = V.addVisualArea({ vertices: h.map(x => V.makeEndpoint('visual', x)), layerId: l });
  if (blocks) V.setVisualAreaBlocksSight(id, true);
  setState({ selObsId: null });
  return id;
}

describe('klick på ytor', () => {
  it('Panorera: klick inuti ytan markerar den', () => {
    const id = yta();
    klick(50, 50);
    expect(getState().selVisualId).toBe(id);
  });

  it('en blockerande ytas hinder markerar ytan, inte hindret', () => {
    const id = yta(true);
    klick(50, 50);
    expect(getState().selVisualId).toBe(id);
    expect(getState().selObsId).toBeNull();
  });

  it('ett punktverktyg lägger punkten inuti ytan i stället för att markera den', () => {
    yta();
    setState({ tool: 'station' });
    klick(50, 50);
    expect(getState().selVisualId).toBeNull();
    expect(getState().pts).toHaveLength(1);
    expect(getState().pts[0]).toMatchObject({ E: 50, N: 50, type: 'station' });
  });
});

describe('ritning av yta', () => {
  it('dubbelklickszoomen är av medan ytverktyget är valt', () => {
    fakeMap.doubleClickZoom.disable.mockClear();
    setTool('visual-area');
    expect(fakeMap.doubleClickZoom.disable).toHaveBeenCalled();
  });

  it('dubbelklick sluter ytan', () => {
    setTool('visual-area');
    klick(0, 0); klick(100, 0); klick(100, 100);
    handlers.dblclick(at(100, 100));
    expect(getState().visualAreas).toHaveLength(1);
    expect(getState().visualAreas[0].vertices).toHaveLength(3);
  });

  it('Backspace tar bort senaste hörnet, men inte när man skriver i ett fält', () => {
    setTool('visual-area');
    klick(0, 0); klick(100, 0); klick(100, 100);
    key('Backspace');
    expect(D.getPendingAreaVertices()).toHaveLength(2);
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    inp.focus();
    key('Backspace');
    expect(D.getPendingAreaVertices()).toHaveLength(2);
    inp.blur();
  });

  it('Esc kastar en påbörjad yta; nästa Esc lämnar ytläget', () => {
    setTool('visual-area');
    klick(0, 0); klick(100, 0);
    key('Escape');
    expect(D.getPendingAreaVertices()).toEqual([]);
    expect(getState().tool).toBe('visual-area');
    key('Escape');
    expect(getState().tool).toBe('pan');
    expect(getState().visualPts).toEqual([]);
  });

  it('högerklick kastar en påbörjad yta', () => {
    setTool('visual-area');
    klick(0, 0); klick(100, 0);
    handlers.contextmenu(at(50, 50));
    expect(D.getPendingAreaVertices()).toEqual([]);
    expect(getState().tool).toBe('visual-area');
  });
});

// Efter STOPP 1 inför 0.6.0: Backspace tar bort senaste hörnet även i linjer,
// med samma regler som pekskärmens "↶ Hörn". Polylinjer Etapp 1: linjen
// sparas först när den avslutas, så Backspace rör bara hörnen under ritning.
describe('Backspace i linjer', () => {
  it('tar bort senaste hörnet; linjen fortsätter från föregående', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0); klick(100, 100);
    key('Backspace');
    expect(D.getPendingLineVertices().map(v => [v.E, v.N])).toEqual([[0, 0], [100, 0]]);
    klick(0, 100);
    D.completeVisualLine();
    expect(V.visualLineCoords(getState().visualLines[0])).toEqual([[0, 0], [100, 0], [0, 100]]);
  });

  it('snappade punkter och nätpunkter tas aldrig bort', () => {
    setState({ pts: [{ id: 'N1', type: 'known', E: 200, N: 0 }] });
    const l = V.addVisualLayer({ name: 'L' });
    const fri = V.addVisualPt({ E: 0, N: 200, layerId: l });
    setTool('visual-line');
    klick(1, 199);           // snappar mot den fria punkten
    klick(201, 1);           // snappar mot nätpunkten
    key('Backspace');
    key('Backspace');
    expect(getState().visualLines).toEqual([]);
    expect(getState().pts.map(p => p.id)).toEqual(['N1']);
    expect(getState().visualPts.map(p => p.id)).toEqual([fri]);
    expect(D.hasPendingLine()).toBe(false);
  });

  it('inte när fokus är i ett fält', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    inp.focus();
    key('Backspace');
    expect(D.getPendingLineVertices()).toHaveLength(2);
    inp.blur();
    key('Backspace');
    expect(D.getPendingLineVertices()).toHaveLength(1);
  });

  it('utan påbörjad linje gör Backspace ingenting (och stoppas inte)', () => {
    setTool('visual-line');
    const e = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

// Polylinjer Etapp 1: hur en linje avslutas, avbryts och sluts.
describe('polylinje: avsluta, avbryta, sluta', () => {
  it('dubbelklick avslutar linjen utan ett extra hörn', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    // Ett dubbelklick är två klick på samma ställe följda av dblclick.
    klick(100, 100); klick(100, 100); handlers.dblclick(at(100, 100));
    expect(getState().visualLines).toHaveLength(1);
    const l = getState().visualLines[0];
    expect(V.visualLineCoords(l)).toEqual([[0, 0], [100, 0], [100, 100]]);
    expect(l.closed).toBe(false);
    expect(getState().visualPts).toHaveLength(3);
    expect(D.hasPendingLine()).toBe(false);
    expect(getState().tool).toBe('visual-line');      // läget står kvar
  });

  it('nya hörn får role vertex; linjen markeras', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0); handlers.dblclick(at(100, 0));
    expect(getState().visualPts.every(p => p.role === 'vertex' && p.H === null)).toBe(true);
    expect(getState().selVisualId).toBe(getState().visualLines[0].id);
  });

  it('en färdig linje är ett ångra-steg', async () => {
    const { undo, getUndoStack } = await import('../src/state/undo.js');
    const före = getUndoStack().length;
    setTool('visual-line');
    klick(0, 0); klick(100, 0); klick(100, 100);
    expect(getUndoStack().length).toBe(före);          // inget sparat under ritning
    key('Enter');
    expect(getUndoStack().length).toBe(före + 1);
    expect(getState().visualLines).toHaveLength(1);
    undo();
    expect(getState().visualLines).toEqual([]);
    expect(getState().visualPts).toEqual([]);
  });

  it('Enter avslutar linjen', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    key('Enter');
    expect(getState().visualLines).toHaveLength(1);
  });

  it('Esc kastar en påbörjad linje; nästa Esc lämnar linjeläget', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    key('Escape');
    expect(D.getPendingLineVertices()).toEqual([]);
    expect(getState().visualLines).toEqual([]);
    expect(getState().visualPts).toEqual([]);
    expect(getState().tool).toBe('visual-line');
    key('Escape');
    expect(getState().tool).toBe('pan');
  });

  it('högerklick avslutar linjen; ett ensamt hörn kastas; tomt läge lämnas', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    handlers.contextmenu(at(50, 50));
    expect(getState().visualLines).toHaveLength(1);
    klick(0, 50);
    handlers.contextmenu(at(50, 50));
    expect(getState().visualLines).toHaveLength(1);
    expect(D.hasPendingLine()).toBe(false);
    handlers.contextmenu(at(50, 50));
    expect(getState().tool).toBe('pan');
  });

  it('klick på första hörnet sluter linjen (minst tre hörn); den blir ingen yta', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0); klick(100, 100);
    klick(2, 1);
    const [l] = getState().visualLines;
    expect(l.closed).toBe(true);
    expect(l.vertices).toHaveLength(3);
    expect(getState().visualAreas).toEqual([]);
  });

  it('med två hörn sluter ett klick på första hörnet inte linjen', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    klick(1, 1);
    expect(getState().visualLines).toEqual([]);
    expect(D.getPendingLineVertices()).toHaveLength(3);
  });

  it('byte av verktyg avbryter linjen', () => {
    setTool('visual-line');
    klick(0, 0); klick(100, 0);
    setTool('pan');
    expect(getState().visualLines).toEqual([]);
    expect(getState().visualPts).toEqual([]);
  });

  it('en handritad visuell punkt är ett ångra-steg', async () => {
    const { undo, getUndoStack } = await import('../src/state/undo.js');
    const före = getUndoStack().length;
    setTool('visual-point');
    klick(10, 10); klick(20, 20);
    expect(getUndoStack().length).toBe(före + 2);
    expect(getState().visualPts[0].H).toBeNull();
    undo();
    expect(getState().visualPts).toHaveLength(1);
  });

  it('dubbelklick zoomar inte i linjeläget', () => {
    setTool('visual-line');
    fakeMap.doubleClickZoom.disable.mockClear();
    setState({ tool: 'visual-line' });
    expect(fakeMap.doubleClickZoom.disable).toHaveBeenCalled();
  });
});
