// "↶ Hörn" i den mobila raden (release 0.6.0, steg 1): pekskärmens motsvarighet
// till Backspace. Tar bort senaste hörnet i pågående linje eller yta och är
// dold när ingen ritning pågår.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const { buildTools, setTool, syncMobileDrawButtons, undoLastVertexFromButton, finishLineFromButton } = await import('../src/ui/toolbar.js');
const D = await import('../src/map/visual-drawing.js');
const { getState, setState } = await import('../src/state/store.js');
const S = await import('../src/map/snap.js');
const { visualLineCoords } = await import('../src/state/visual.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const btn = () => document.getElementById('mtb-undo-vertex');
const klick = (E, N) => D.handleVisualMapClick({ lat: N, lng: E });
const tryck = () => { undoLastVertexFromButton(); syncMobileDrawButtons(); };

beforeEach(() => {
  localStorage.removeItem(S.SNAP_KEY);
  S._reloadSnapSetting();
  setState({
    tool: 'pan', measFrom: null,
    pts: [{ id: 'FP1', type: 'known', E: 0, N: 0 }], meas: [], obstacles: [],
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
  document.body.innerHTML = '<div id="mtb"></div><div id="hint"></div>';
  setTool('pan');
});

describe('synlighet', () => {
  it('finns i den mobila raden men är dold utan ritning', () => {
    buildTools();
    expect(btn()).not.toBeNull();
    expect(btn().textContent).toBe('↶ Hörn');
    expect(btn().hidden).toBe(true);
  });

  it('dold i linjeläget tills första hörnet är satt, sedan synlig', () => {
    setTool('visual-line');
    expect(btn().hidden).toBe(true);
    klick(50, 50);
    syncMobileDrawButtons();
    expect(btn().hidden).toBe(false);
  });

  it('dold igen när ritningen avbryts', () => {
    setTool('visual-area');
    klick(50, 50);
    syncMobileDrawButtons();
    expect(btn().hidden).toBe(false);
    setTool('pan');
    expect(btn().hidden).toBe(true);
  });

  it('synkas vid varje omritning av kartan (main.js)', () => {
    const src = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(src).toMatch(/setDrawCallbacks\(\{[^}]*syncMobileDrawButtons/);
  });
});

describe('yta', () => {
  it('tar bort senaste hörnet, som Backspace', () => {
    setTool('visual-area');
    klick(50, 50); klick(150, 50); klick(150, 150);
    tryck();
    expect(D.getPendingAreaVertices().map(v => [v.E, v.N])).toEqual([[50, 50], [150, 50]]);
    tryck(); tryck();
    expect(D.getPendingAreaVertices()).toEqual([]);
    expect(btn().hidden).toBe(true);
    expect(getState().visualPts).toEqual([]);   // inga lösa hörn efter en yta
  });
});

// Polylinjer Etapp 1: linjen sparas först när den avslutas. "↶ Hörn" tar
// bort senaste hörnet ur den påbörjade linjen; inga punkter finns att städa.
describe('linje', () => {
  it('tar bort senaste hörnet; linjen fortsätter från föregående', () => {
    setTool('visual-line');
    klick(50, 50); klick(150, 50); klick(150, 150);
    tryck();
    expect(D.getPendingLineVertices().map(v => [v.E, v.N])).toEqual([[50, 50], [150, 50]]);
    klick(250, 50);                                   // fortsätter från (150,50)
    D.completeVisualLine();
    expect(visualLineCoords(getState().visualLines[0])).toEqual([[50, 50], [150, 50], [250, 50]]);
  });

  it('första hörnet: inga hörn kvar och knappen döljs', () => {
    setTool('visual-line');
    klick(50, 50);
    tryck();
    expect(D.hasPendingLine()).toBe(false);
    expect(getState().visualPts).toEqual([]);
    expect(btn().hidden).toBe(true);
  });

  it('ett hörn som snappade mot en nätpunkt tas ur linjen, nätpunkten rörs inte', () => {
    setTool('visual-line');
    klick(50, 50); klick(2, 2);                       // snappar mot FP1
    expect(D.getPendingLineVertices()[1]).toMatchObject({ ref: 'net', id: 'FP1' });
    tryck();
    expect(D.getPendingLineVertices()).toHaveLength(1);
    expect(getState().pts.map(p => p.id)).toEqual(['FP1']);
  });

  it('en punkt som en annan linje använder tas inte bort', () => {
    setTool('visual-line');
    klick(50, 50); klick(150, 50);
    D.completeVisualLine();
    klick(150, 150); klick(152, 52);                   // snappar mot (150,50)
    tryck();
    expect(getState().visualPts.map(p => [p.E, p.N])).toContainEqual([150, 50]);
    expect(getState().visualLines).toHaveLength(1);
  });

  it('ingenting att ta bort: gör ingenting', () => {
    setTool('visual-line');
    expect(undoLastVertexFromButton()).toBe(false);
  });
});

describe('✓ Klar', () => {
  const klar = () => document.getElementById('mtb-finish-line');

  it('visas från andra hörnet och avslutar linjen, som dubbelklick', () => {
    setTool('visual-line');
    expect(klar().hidden).toBe(true);
    klick(50, 50);
    syncMobileDrawButtons();
    expect(klar().hidden).toBe(true);
    klick(150, 50);
    syncMobileDrawButtons();
    expect(klar().hidden).toBe(false);
    expect(finishLineFromButton()).toBe(true);
    syncMobileDrawButtons();
    expect(getState().visualLines).toHaveLength(1);
    expect(klar().hidden).toBe(true);
  });

  it('tryck på sista hörnet igen avslutar också linjen (22 px med finger)', () => {
    const orig = window.matchMedia;
    window.matchMedia = q => ({ matches: q === '(pointer: coarse)' });
    try {
      setTool('visual-line');
      klick(50, 50); klick(150, 50);
      klick(165, 60);                                  // 18 px från (150,50)
      expect(getState().visualLines).toHaveLength(1);
      expect(visualLineCoords(getState().visualLines[0])).toEqual([[50, 50], [150, 50]]);
    } finally { window.matchMedia = orig; }
  });

  it('dold i ytläget', () => {
    setTool('visual-area');
    klick(50, 50); klick(150, 50); klick(150, 150);
    syncMobileDrawButtons();
    expect(klar().hidden).toBe(true);
  });
});
