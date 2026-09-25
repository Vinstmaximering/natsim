// Polylinjer Etapp 4: offset i gränssnittet – verktyget O och offset-delen i
// linjens och ytans kort. Skärmprojektion: x = E, y = −N.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const V = await import('../src/state/visual.js');
const T = await import('../src/map/offset-tool.js');
const P = await import('../src/ui/offset-panel.js');
const { renderLineCard } = await import('../src/ui/line-card.js');
const { renderAreaCard } = await import('../src/ui/area-card.js');
const { setTool, MAP_TOOLS } = await import('../src/ui/toolbar.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo, getUndoStack } = await import('../src/state/undo.js');

const vis = id => V.makeEndpoint('visual', id);

beforeEach(() => {
  T.cancelOffsetTool();
  T.clearOffsetPreview();
  P.setOffsetParams({ distance: 2, side: 'right', corners: 'sharp' });
  document.body.innerHTML = '<div id="line-card" hidden></div><div id="area-card" hidden></div>'
    + '<div id="offset-box" hidden></div><div id="mtb"></div><div id="hint"></div>';
  setState({
    tool: 'pan', measFrom: null, pts: [], meas: [], obstacles: [], selObsId: null,
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  });
});

function linje(name = 'Kant') {
  const lay = V.addVisualLayer({ name: 'L' });
  const h = [[0, 0], [100, 0], [100, 100]].map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
  return V.addVisualLine({ vertices: h.map(vis), layerId: lay, name });
}
function yta() {
  const lay = V.addVisualLayer({ name: 'Y' });
  const h = [[200, 0], [260, 0], [260, 40], [200, 40]].map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
  return V.addVisualArea({ vertices: h.map(vis), layerId: lay, name: 'Platta' });
}

describe('offset-delen i linjens kort', () => {
  const öppna = () => {
    const sec = document.querySelector('#line-card .of-sec');
    sec.open = true;
    sec.dispatchEvent(new Event('toggle'));
    return sec;
  };

  it('fälls ut med avstånd, sida (höger/vänster/båda), hörn och förhandsvisning', () => {
    const id = linje();
    setState({ selVisualId: id });
    renderLineCard();
    const sec = öppna();
    expect([...sec.querySelectorAll('input[type=radio][name$="-side"]')].map(i => i.value)).toEqual(['right', 'left', 'both']);
    expect(sec.querySelector('.of-status').textContent).toBe('Skapar "Kant +2,000 H" i aktivt lager.');
    expect(T.getOffsetPreview()).toMatchObject({ owner: 'line-card', sourceId: id, params: { distance: 2, side: 'right' } });
  });

  it('värdet ändras: statusen och förhandsvisningen följer', () => {
    const id = linje();
    setState({ selVisualId: id });
    renderLineCard();
    const sec = öppna();
    const d = sec.querySelector('.of-dist');
    d.value = '0,5';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    sec.querySelector('input[value="both"]').click();
    expect(sec.querySelector('.of-status').textContent).toBe('Skapar "Kant +0,500 H" och "Kant +0,500 V" i aktivt lager.');
    expect(T.getOffsetPreview().params).toMatchObject({ distance: 0.5, side: 'both' });
  });

  it('Skapa: två nya linjer, ett ångra-steg; förhandsvisningen försvinner', () => {
    const id = linje();
    setState({ selVisualId: id });
    renderLineCard();
    const sec = öppna();
    sec.querySelector('input[value="both"]').click();
    const före = getUndoStack().length;
    sec.querySelector('.of-create').click();
    expect(getUndoStack().length).toBe(före + 1);
    expect(getState().visualLines.map(l => l.name)).toEqual(['Kant', 'Kant +2,000 H', 'Kant +2,000 V']);
    expect(T.getOffsetPreview()).toBeNull();
    undo();
    expect(getState().visualLines.map(l => l.name)).toEqual(['Kant']);
  });

  it('ett problem: Skapa är avstängd och statusen säger varför', () => {
    const id = linje();
    setState({ selVisualId: id });
    renderLineCard();
    const sec = öppna();
    const d = sec.querySelector('.of-dist');
    d.value = '0';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    expect(sec.querySelector('.of-create').disabled).toBe(true);
    expect(sec.querySelector('.of-status').textContent).toContain('större än 0');
  });

  it('kortet stängs (avmarkering): förhandsvisningen försvinner', () => {
    const id = linje();
    setState({ selVisualId: id });
    renderLineCard();
    öppna();
    setState({ selVisualId: null });
    renderLineCard();
    expect(T.getOffsetPreview()).toBeNull();
  });
});

describe('offset-delen i ytans kort', () => {
  it('utåt/inåt/båda; Skapa ger en ny yta', () => {
    const id = yta();
    setState({ selVisualId: id });
    renderAreaCard();
    const sec = document.querySelector('#area-card .of-sec');
    sec.open = true;
    sec.dispatchEvent(new Event('toggle'));
    expect([...sec.querySelectorAll('input[name$="-side"]')].map(i => i.value)).toEqual(['out', 'in', 'both']);
    expect(sec.querySelector('input[name$="-side"]:checked').value).toBe('out');   // höger tolkas som utåt
    sec.querySelector('.of-create').click();
    expect(getState().visualAreas.map(a => a.name)).toEqual(['Platta', 'Platta +2,000 ut']);
  });
});

describe('verktyget O', () => {
  const klick = (E, N) => T.handleOffsetClick({ lat: N, lng: E });

  it('finns i verktygsraden och den mobila raden med kortkommandot O', () => {
    expect(MAP_TOOLS.find(t => t.tool === 'offset')).toMatchObject({ key: 'o', btn: 'btn-offset' });
    setTool('offset');
    expect(T.isOffsetTool()).toBe(true);
    P.renderOffsetBox();
    expect(document.getElementById('offset-box').hidden).toBe(false);
    expect(document.getElementById('offset-box').textContent).toContain('Klicka en linje eller yta');
    setTool('pan');
    P.renderOffsetBox();
    expect(document.getElementById('offset-box').hidden).toBe(true);
  });

  it('klick på en linje: rutan visar kontrollerna och förhandsvisningen', () => {
    const id = linje();
    setTool('offset');
    expect(klick(50, 2)).toBe(id);
    P.renderOffsetBox();
    const box = document.getElementById('offset-box');
    expect(box.textContent).toContain('Offset av Kant');
    expect(T.getOffsetPreview()).toMatchObject({ owner: 'tool', sourceId: id });
    expect(getState().selVisualId).toBeNull();          // linjen markeras inte – kortet visas inte
  });

  it('Enter skapar; Esc släpper linjen', () => {
    const id = linje();
    setTool('offset');
    klick(50, 2);
    P.renderOffsetBox();
    expect(P.createFromOffsetBox()).toBe(true);
    expect(getState().visualLines.at(-1).name).toBe('Kant +2,000 H');
    expect(T.getOffsetToolSource()).toBe(id);           // samma linje kan offsetas igen
    expect(T.releaseOffsetSource()).toBe(true);
    expect(T.releaseOffsetSource()).toBe(false);        // nästa Esc lämnar verktyget
  });

  it('en markerad linje blir verktygets val direkt, och kortet stängs', () => {
    const id = linje();
    setState({ selVisualId: id });
    setTool('offset');
    expect(T.getOffsetToolSource()).toBe(id);
    expect(getState().selVisualId).toBeNull();
    P.renderOffsetBox();
    expect(document.getElementById('offset-box').textContent).toContain('Offset av Kant');
  });

  it('klick bredvid: ingen linje vald', () => {
    linje();
    setTool('offset');
    expect(klick(50, 60)).toBeNull();
    expect(T.getOffsetPreview()).toBeNull();
  });

  it('förhandsvisningen ritas streckad; ett problem ritas rött', () => {
    const id = linje();
    const färger = [];
    let färg = null;
    const ctx = new Proxy({}, {
      get: (_, p) => (p === 'stroke' ? () => färger.push(färg) : () => {}),
      set: (_, p, v) => { if (p === 'strokeStyle') färg = v; return true; },
    });
    T.setOffsetPreview('card', id, { distance: 2, side: 'right', corners: 'sharp' });
    T.drawOffsetPreview(ctx);
    expect(färger).toEqual(['#4dd0e1']);
    färger.length = 0;
    T.setOffsetPreview('card', id, { distance: 0, side: 'right', corners: 'sharp' });
    T.drawOffsetPreview(ctx);
    expect(färger).toEqual([]);                         // inget att rita utan avstånd
    const lay = getState().visualLayers[0].id;
    const h = [[0, 200], [0, 210], [2, 210], [2, 200]].map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
    const u = V.addVisualLine({ vertices: h.map(vis), layerId: lay });
    T.setOffsetPreview('card', u, { distance: 3, side: 'right', corners: 'sharp' });
    T.drawOffsetPreview(ctx);
    expect(färger).toEqual(['#ff5050']);
  });
});
