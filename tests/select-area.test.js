// Lager-verktyg Etapp 4: Markera område.
// – urvalsregler: dra åt höger = helt inuti, åt vänster = inuti eller korsade,
//   för punkt, linje och yta (helt inuti, delvis, utanför)
// – Skift lägger till, Ctrl tar bort, klick utan drag, Esc avmarkerar
// – släckta lager och nätobjekt markeras inte
// – åtgärdsraden: text, flytta, dölj/visa namn, zooma, ta bort – ett ångra-steg
// – mus- och fingerhändelser genom map/interactions.js

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Skärmprojektion x = E, y = −N (norr uppåt, som på kartan).
vi.mock('../src/map/leaflet-setup.js', () => ({
  map: {
    latLngToContainerPoint: ll => Array.isArray(ll) ? { x: ll[1], y: -ll[0] } : { x: ll.lng, y: -ll.lat },
    dragging: { enable: vi.fn(), disable: vi.fn() },
    getContainer: () => ({ style: {} }),
  },
  ENtoLatLng: (E, N) => [N, E],
  latLngToEN: ll => ({ E: ll.lng, N: ll.lat }),
  ptPixel: p => ({ x: p.E, y: -p.N }),
  draw: vi.fn(),
  fitViewToENBounds: vi.fn(),
}));

const LS = await import('../src/map/leaflet-setup.js');
const SEL = await import('../src/state/visual-selection.js');
const SA = await import('../src/map/select-area.js');
const V = await import('../src/state/visual.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo } = await import('../src/state/undo.js');
const { initSelectBar, selectionText } = await import('../src/ui/select-bar.js');
const { initInteractions } = await import('../src/map/interactions.js');
const { setTool } = await import('../src/ui/toolbar.js');
const { _buildSnapshot, _applySnapshot } = await import('../src/io/export-project.js');

const project = (E, N) => ({ x: E, y: -N });
const vis = id => V.makeEndpoint('visual', id);
const net = id => V.makeEndpoint('net', id);

// Skärmrektangel ur plankoordinater: från (E0,N0) till (E1,N1).
const rect = (E0, N0, E1, N1) => ({ x0: E0, y0: -N0, x1: E1, y1: -N1 });

function reset() {
  setState({
    pts: [{ id: 'N1', type: 'known', E: 50, N: 50 }], meas: [], obstacles: [], simResult: null,
    selObsId: null, selId: null, selMId: null, measFrom: null, suggestedMeas: [],
    visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
    nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1, nId: 1,
    tool: 'pan',
  });
  SA.cancelSelectDrag();
  SA.setTouchSelectOp('replace');
}

// Scen: punkt P (6,10), linje L (20,10)–(40,10), yta A 60–80 × 0–20.
// P ligger mer än 10 px (träffradien) från linjens första hörn.
function scen() {
  const lay = V.addVisualLayer({ name: 'Ritning' });
  const P = V.addVisualPt({ E: 6, N: 10, layerId: lay, name: 'P' });
  const l1 = V.addVisualPt({ E: 20, N: 10, layerId: lay, role: 'vertex' });
  const l2 = V.addVisualPt({ E: 40, N: 10, layerId: lay, role: 'vertex' });
  const L = V.addVisualLine({ from: vis(l1), to: vis(l2), layerId: lay });
  const h = [[60, 0], [80, 0], [80, 20], [60, 20]].map(([E, N]) => V.addVisualPt({ E, N, layerId: lay, role: 'vertex' }));
  const A = V.addVisualArea({ vertices: h.map(vis), layerId: lay, name: 'A' });
  return { lay, P, L, A, l1, l2, h };
}

beforeEach(reset);

// ── Rena regler ─────────────────────────────────────────────────────────────

describe('urvalsregler', () => {
  it('riktningen avgör läget', () => {
    expect(SEL.modeFromDrag(0, 10)).toBe('window');
    expect(SEL.modeFromDrag(10, 0)).toBe('crossing');
    expect(SEL.modeFromDrag(5, 5)).toBe('window');
  });

  it('Skift lägger till, Ctrl/Cmd tar bort, annars ersätts', () => {
    expect(SEL.opFromEvent({ shiftKey: true })).toBe('add');
    expect(SEL.opFromEvent({ ctrlKey: true })).toBe('remove');
    expect(SEL.opFromEvent({ metaKey: true })).toBe('remove');
    expect(SEL.opFromEvent({})).toBe('replace');
    expect(SEL.opFromEvent({}, 'add')).toBe('add');                 // pekskärmens växlare
    expect(SEL.opFromEvent({ ctrlKey: true }, 'add')).toBe('remove');
    expect(SEL.applySelection(['a'], ['b'], 'add')).toEqual(['a', 'b']);
    expect(SEL.applySelection(['a', 'b'], ['a'], 'remove')).toEqual(['b']);
    expect(SEL.applySelection(['a'], ['b', 'b'], 'replace')).toEqual(['b']);
  });

  const välj = (r, mode) => SEL.objectsInRect(getState(), r, mode, project);

  it('punkt: inuti, utanför', () => {
    const { P } = scen();
    expect(välj(rect(5, 15, 15, 5), 'window')).toEqual([P]);
    expect(välj(rect(5, 15, 15, 5), 'crossing')).toEqual([P]);
    expect(välj(rect(11, 15, 15, 5), 'window')).toEqual([]);
    expect(välj(rect(11, 15, 15, 5), 'crossing')).toEqual([]);
  });

  it('linje: helt inuti, delvis, korsad utan ändpunkt inuti, utanför', () => {
    const { L } = scen();
    const helt = rect(18, 15, 42, 5), delvis = rect(30, 15, 50, 5), mitt = rect(28, 15, 32, 5), ute = rect(0, 40, 50, 30);
    expect(välj(helt, 'window')).toEqual([L]);
    expect(välj(delvis, 'window')).toEqual([]);
    expect(välj(delvis, 'crossing')).toEqual([L]);
    expect(välj(mitt, 'window')).toEqual([]);
    expect(välj(mitt, 'crossing')).toEqual([L]);
    expect(välj(ute, 'crossing')).toEqual([]);
  });

  it('yta: helt inuti, delvis, rektangeln inuti ytan, utanför', () => {
    const { A } = scen();
    expect(välj(rect(55, 25, 85, -5), 'window')).toEqual([A]);
    expect(välj(rect(70, 25, 90, -5), 'window')).toEqual([]);
    expect(välj(rect(70, 25, 90, -5), 'crossing')).toEqual([A]);
    expect(välj(rect(65, 15, 75, 5), 'window')).toEqual([]);
    expect(välj(rect(65, 15, 75, 5), 'crossing')).toEqual([A]);
    expect(välj(rect(85, 25, 95, -5), 'crossing')).toEqual([]);
  });

  it('hela scenen: punkt, linje och yta – men inga hörn och ingen nätpunkt', () => {
    const { P, L, A } = scen();
    const ids = välj(rect(0, 100, 100, -10), 'window');
    expect(ids).toEqual([P, L, A]);
    expect(ids).not.toContain('N1');   // nätpunkten ligger inuti men markeras inte
    expect(getState().visualPts.filter(p => p.role === 'vertex').some(p => ids.includes(p.id))).toBe(false);
  });

  it('släckta lager markeras inte', () => {
    const { lay } = scen();
    V.updateVisualLayer(lay, { visible: false });
    expect(välj(rect(0, 100, 100, -10), 'crossing')).toEqual([]);
  });

  it('mätningar och hinder markeras inte', () => {
    setState({ meas: [{ id: 'M1', from: 'N1', to: 'N1' }],
               obstacles: [{ id: 'obs_1', type: 'polygon', points: [[0, 0], [10, 0], [10, 10]] }] });
    expect(välj(rect(-10, 100, 100, -10), 'crossing')).toEqual([]);
  });
});

// ── Verktyget ───────────────────────────────────────────────────────────────

describe('dragning och klick', () => {
  const dra = (E0, N0, E1, N1, mods = {}) => {
    SA.beginSelectDrag(E0, -N0);
    SA.updateSelectDrag(E1, -N1);
    return SA.endSelectDrag(mods);
  };

  it('drag ersätter, Skift lägger till, Ctrl tar bort', () => {
    const { P, L, A } = scen();
    expect(dra(5, 15, 15, 5)).toEqual([P]);
    expect(dra(55, 25, 85, -5, { shiftKey: true })).toEqual([P, A]);
    expect(dra(18, 15, 42, 5, { shiftKey: true })).toEqual([P, A, L]);
    expect(dra(5, 15, 15, 5, { ctrlKey: true })).toEqual([A, L]);
    expect(dra(18, 15, 42, 5)).toEqual([L]);
  });

  it('en för kort dragning är ett klick, inte en tom rektangel', () => {
    scen();
    setState({ visualSelection: ['X'] });
    expect(dra(10, 10, 11, 11)).toBeNull();
    expect(getState().visualSelection).toEqual(['X']);
  });

  it('klick markerar ett objekt; klick på ett hörn markerar linjen; klick i tomma intet avmarkerar', () => {
    const { P, L, A } = scen();
    expect(SA.clickSelect(6, -10, {})).toEqual([P]);
    expect(SA.clickSelect(20, -10, {})).toEqual([L]);             // linjens hörn
    expect(SA.clickSelect(70, -10, { shiftKey: true })).toEqual([L, A]);
    expect(SA.clickSelect(70, -10, { ctrlKey: true })).toEqual([L]);
    expect(SA.clickSelect(300, -300, { shiftKey: true })).toEqual([L]);   // miss med Skift ändrar inget
    expect(SA.clickSelect(300, -300, {})).toEqual([]);
  });

  it('markeringen ersätter ett enskilt val (egenskapskortet stängs)', () => {
    const { P, A } = scen();
    setState({ selVisualId: A });
    SA.clickSelect(10, -10, {});
    expect(getState()).toMatchObject({ selVisualId: null, visualSelection: [P] });
  });

  it('rektangeln ritas streckad, olika för de två lägena', () => {
    const dashes = [];
    const ctx = new Proxy({}, { get: (_, k) => k === 'setLineDash' ? d => dashes.push(d) : () => {}, set: () => true });
    SA.beginSelectDrag(0, 0); SA.updateSelectDrag(50, 50); SA.drawSelectRect(ctx);
    SA.beginSelectDrag(50, 0); SA.updateSelectDrag(0, 50); SA.drawSelectRect(ctx);
    SA.cancelSelectDrag();
    expect(dashes).toEqual([[8, 4], [3, 3]]);
  });
});

// ── Mutationer ──────────────────────────────────────────────────────────────

describe('åtgärder på markeringen', () => {
  it('ta bort: objekten, linjens hörn och ytans hörn – ett ångra-steg', async () => {
    const { P, L, A } = scen();
    V.setVisualAreaBlocksSight(A, true);
    const { saveUndo } = await import('../src/state/undo.js');
    saveUndo('ta bort');
    const n = V.removeVisualObjects([P, L, A]);
    expect(n).toEqual({ pts: 1, lines: 1, areas: 1, extraLines: 0 });
    expect(getState().visualPts).toEqual([]);
    expect(getState().obstacles).toEqual([]);
    undo();
    expect(getState().visualPts).toHaveLength(7);
    expect(getState().visualAreas).toHaveLength(1);
    expect(getState().obstacles).toHaveLength(1);
  });

  it('ta bort linje: hörn som är nätpunkter tas aldrig bort, delade hörn stannar', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const a = V.addVisualPt({ E: 0, N: 0, layerId: lay, role: 'vertex' });
    const b = V.addVisualPt({ E: 10, N: 0, layerId: lay, role: 'vertex' });
    const L1 = V.addVisualLine({ from: net('N1'), to: vis(a), layerId: lay });
    const L2 = V.addVisualLine({ from: vis(a), to: vis(b), layerId: lay });
    V.removeVisualObjects([L1]);
    expect(getState().pts.map(p => p.id)).toEqual(['N1']);
    expect(getState().visualPts.map(p => p.id).sort()).toEqual([a, b].sort());   // a används av L2
    V.removeVisualObjects([L2]);
    expect(getState().visualPts).toEqual([]);
  });

  it('ta bort en fri punkt tar med linjer som hänger i den', () => {
    const lay = V.addVisualLayer({ name: 'L' });
    const p = V.addVisualPt({ E: 0, N: 0, layerId: lay });
    const q = V.addVisualPt({ E: 5, N: 0, layerId: lay });
    V.addVisualLine({ from: vis(p), to: vis(q), layerId: lay });
    expect(V.removeVisualObjects([p]).extraLines).toBe(1);
    expect(getState().visualLines).toEqual([]);
  });

  it('flytta till lager: objekten och deras egna hörn, inte delade hörn', () => {
    const { lay, P, L, A, l1, h } = scen();
    const annan = V.addVisualLayer({ name: 'Annat' });
    // En linje i gamla lagret delar hörnet l1.
    const x = V.addVisualPt({ E: 20, N: 30, layerId: lay, role: 'vertex' });
    V.addVisualLine({ from: vis(l1), to: vis(x), layerId: lay });
    expect(V.moveVisualToLayer([P, L, A], annan)).toBe(3);
    const lagerFör = id => (getState().visualPts.find(p => p.id === id)
      || getState().visualLines.find(p => p.id === id) || getState().visualAreas.find(p => p.id === id)).layerId;
    expect([P, L, A].map(lagerFör)).toEqual([annan, annan, annan]);
    expect(h.map(lagerFör)).toEqual([annan, annan, annan, annan]);
    expect(lagerFör(l1)).toBe(lay);    // delat med en linje som stannar
  });

  it('dölj och visa namn: punkter, ytor och hörnen i markerade linjer; sparas i projektet', () => {
    const { P, L, A, l1 } = scen();
    expect(V.anyVisualLabelShown([P, L, A])).toBe(true);
    V.setVisualLabelsHidden([P, L, A], true);
    const pt = id => getState().visualPts.find(p => p.id === id);
    expect(pt(P).hideLabel).toBe(true);
    expect(pt(l1).hideLabel).toBe(true);
    expect(V.findVisualArea(A).hideLabel).toBe(true);
    expect(V.anyVisualLabelShown([P, L, A])).toBe(false);
    expect(V.visualPtShowsLabel(pt(P), { labels: true })).toBe(false);

    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    reset();
    _applySnapshot(snap);
    expect(pt(P).hideLabel).toBe(true);
    expect(V.findVisualArea(A).hideLabel).toBe(true);
    V.setVisualLabelsHidden([P, A], false);
    expect('hideLabel' in pt(P)).toBe(false);
  });
});

// ── Åtgärdsraden ────────────────────────────────────────────────────────────

describe('åtgärdsraden', () => {
  let inited = false;
  const bar = () => document.getElementById('select-bar');
  const knapp = sb => bar().querySelector(`[data-sb="${sb}"]`);
  // initSelectBar kopplar klick på elementet som finns vid init, så raden
  // monteras en gång och återanvänds; den ritas om ur state i varje fall.
  beforeEach(() => {
    if (!inited) {
      document.body.innerHTML = '<div id="select-bar" hidden></div>';
      initSelectBar();
      inited = true;
    }
    vi.restoreAllMocks();
  });

  it('text med antal per typ, dold utan markering', () => {
    const { P, L, A } = scen();
    setState({ visualSelection: [P, L, A] });
    expect(bar().hidden).toBe(false);
    // Böjt efter STOPP 4: "1 yta", inte "1 ytor".
    expect(bar().querySelector('.sb-count').textContent).toBe('3 objekt markerade · 1 pkt · 1 linj. · 1 yta');
    expect([...bar().querySelectorAll('[data-sb]')].map(b => b.textContent.trim()))
      .toEqual(['Flytta till lager ▾', 'Dölj namn', 'Zooma till', 'Ta bort', '× Avmarkera']);
    setState({ visualSelection: [] });
    expect(bar().hidden).toBe(true);
  });

  it('ett släckt lager tar bort sina objekt ur markeringen', () => {
    const { lay, P } = scen();
    const annat = V.addVisualLayer({ name: 'B' });
    const Q = V.addVisualPt({ E: 0, N: 0, layerId: annat });
    setState({ visualSelection: [P, Q] });
    V.updateVisualLayer(lay, { visible: false });
    expect(getState().visualSelection).toEqual([Q]);
  });

  it('Ta bort frågar med antal och hinder, och ångras i ett steg', () => {
    const { P, L, A } = scen();
    V.setVisualAreaBlocksSight(A, true);
    setState({ visualSelection: [P, L, A] });
    const spy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    knapp('delete').click();
    expect(getState().visualAreas).toHaveLength(1);
    expect(spy.mock.calls[0][0]).toContain('1 punkt, 1 linje och 1 yta');
    expect(spy.mock.calls[0][0]).toContain('1 kopplat hinder försvinner');
    knapp('delete').click();
    expect(getState().visualAreas).toEqual([]);
    expect(getState().visualSelection).toEqual([]);
    undo();
    expect(getState().visualAreas).toHaveLength(1);
    expect(getState().visualPts).toHaveLength(7);
  });

  it('Flytta till lager via menyn', () => {
    const { P } = scen();
    const annat = V.addVisualLayer({ name: 'Annat' });
    setState({ visualSelection: [P] });
    knapp('move').click();
    bar().querySelector(`[data-layer="${annat}"]`).click();
    expect(getState().visualPts.find(p => p.id === P).layerId).toBe(annat);
    undo();
    expect(getState().visualPts.find(p => p.id === P).layerId).not.toBe(annat);
  });

  it('Dölj namn blir Visa namn', () => {
    const { P } = scen();
    setState({ visualSelection: [P] });
    knapp('labels').click();
    expect(knapp('labels').textContent).toBe('Visa namn');
    knapp('labels').click();
    expect(knapp('labels').textContent).toBe('Dölj namn');
  });

  it('Zooma till: markeringens utbredning, minst 20 m', () => {
    const { P, A } = scen();
    LS.fitViewToENBounds.mockClear();
    setState({ visualSelection: [P] });
    knapp('zoom').click();
    expect(LS.fitViewToENBounds).toHaveBeenLastCalledWith({ minE: -4, maxE: 16, minN: 0, maxN: 20 });
    setState({ visualSelection: [P, A] });
    knapp('zoom').click();
    expect(LS.fitViewToENBounds).toHaveBeenLastCalledWith({ minE: 6, maxE: 80, minN: 0, maxN: 20 });
  });

  it('× Avmarkera', () => {
    const { P } = scen();
    setState({ visualSelection: [P] });
    knapp('clear').click();
    expect(getState().visualSelection).toEqual([]);
  });

  it('pekskärm: växlaren Ny / Lägg till / Dra ifrån syns med verktyget, också utan markering', () => {
    const orig = window.matchMedia;
    window.matchMedia = q => ({ matches: q === '(pointer: coarse)' });
    try {
      setState({ tool: 'select-area', visualSelection: [] });
      expect(bar().hidden).toBe(false);
      const ops = [...bar().querySelectorAll('[data-op]')];
      // "Dra ifrån", inte "Ta bort" – det heter redan knappen som raderar.
      expect(ops.map(b => b.textContent)).toEqual(['Ny', 'Lägg till', 'Dra ifrån']);
      ops[1].click();
      expect(SA.getTouchSelectOp()).toBe('add');
      expect(bar().querySelector('[data-op="add"]').getAttribute('aria-pressed')).toBe('true');
    } finally { window.matchMedia = orig; SA.setTouchSelectOp('replace'); }
  });

  it('selectionText böjer antal', () => {
    expect(selectionText({ total: 1, pts: [], lines: [], areas: [1] }))
      .toBe('1 objekt markerat · 0 pkt · 0 linj. · 1 yta');
    expect(selectionText({ total: 3, pts: [1], lines: [], areas: [1, 2] }))
      .toBe('3 objekt markerade · 1 pkt · 0 linj. · 2 ytor');
    expect(selectionText({ total: 0, pts: [], lines: [], areas: [] }))
      .toBe('0 objekt markerade · 0 pkt · 0 linj. · 0 ytor');
  });
});

// ── Mus och finger genom interactions.js ────────────────────────────────────

describe('händelser på kartan', () => {
  const handlers = {};
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const fakeMap = {
    on: (ev, fn) => { (handlers[ev] ||= []).push(fn); },
    latLngToContainerPoint: ll => Array.isArray(ll) ? { x: ll[1], y: -ll[0] } : { x: ll.lng, y: -ll.lat },
    dragging: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
    getContainer: () => container,
  };
  initInteractions(fakeMap);
  const fire = (ev, E, N, mods = {}) => (handlers[ev] || []).forEach(fn => fn({
    latlng: { lat: N, lng: E }, originalEvent: { button: 0, preventDefault() {}, ...mods },
  }));
  const touch = (typ, points) => {
    const e = new Event(typ, { cancelable: true });
    Object.defineProperty(e, 'touches', { value: points.map(([E, N]) => ({ clientX: E, clientY: -N })) });
    container.dispatchEvent(e);
    return e;
  };

  it('setTool slår av kartans panorering för Markera område och på igen efteråt', async () => {
    LS.map.dragging.disable.mockClear();
    setTool('select-area');
    await new Promise(r => setTimeout(r, 0));
    expect(LS.map.dragging.disable).toHaveBeenCalled();
    setTool('pan');
    await new Promise(r => setTimeout(r, 0));
    expect(LS.map.dragging.enable).toHaveBeenCalled();
  });

  it('musdrag markerar; klicket efter draget ändrar inget', () => {
    const { P, L } = scen();
    setState({ tool: 'select-area' });
    fire('mousedown', 0, 20); fire('mousemove', 45, 0); fire('mouseup', 45, 0);
    expect(getState().visualSelection).toEqual([P, L]);
    fire('click', 45, 0);
    expect(getState().visualSelection).toEqual([P, L]);
  });

  it('klick utan drag markerar ett objekt; Esc avmarkerar', () => {
    const { P } = scen();
    setState({ tool: 'select-area' });
    fire('mousedown', 6, 10); fire('mouseup', 6, 10); fire('click', 6, 10);
    expect(getState().visualSelection).toEqual([P]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getState().visualSelection).toEqual([]);
  });

  it('Panorera: ett enskilt val tömmer markeringen', () => {
    const { P, A } = scen();
    setState({ tool: 'pan', visualSelection: [P] });
    fire('click', 70, 10);
    expect(getState()).toMatchObject({ selVisualId: A, visualSelection: [] });
  });

  it('ett finger drar en rektangel; två fingrar avbryter (zoom och panorering)', () => {
    const { P, L } = scen();
    setState({ tool: 'select-area' });
    touch('touchstart', [[45, 0]]);
    const mv = touch('touchmove', [[0, 20]]);
    expect(mv.defaultPrevented).toBe(true);         // sidan rullar inte
    touch('touchend', []);
    expect(getState().visualSelection).toEqual([P, L]);   // höger → vänster: korsade

    setState({ visualSelection: [] });
    touch('touchstart', [[0, 20]]);
    touch('touchstart', [[0, 20], [50, 0]]);        // andra fingret
    touch('touchmove', [[45, 0], [60, 0]]);
    touch('touchend', []);
    expect(getState().visualSelection).toEqual([]);
    expect(SA.isSelectDragging()).toBe(false);
  });

  it('fingerdrag med växlaren Lägg till', () => {
    const { P, A } = scen();
    setState({ tool: 'select-area', visualSelection: [A] });
    SA.setTouchSelectOp('add');
    touch('touchstart', [[5, 15]]);
    touch('touchmove', [[15, 5]]);
    touch('touchend', []);
    expect(getState().visualSelection).toEqual([A, P]);
  });

  it('andra verktyg påverkas inte av fingerdrag', () => {
    scen();
    setState({ tool: 'pan' });
    touch('touchstart', [[0, 20]]);
    expect(SA.isSelectDragging()).toBe(false);
  });
});
