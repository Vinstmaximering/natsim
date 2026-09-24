// Lager-verktyg Etapp 1: Lager-menyn i toppraden.
// – öppnas och stängs som Data/Visa/Rapport
// – nålen låser den öppen: klick utanför och Escape stänger den inte, andra
//   menyer kan öppnas bredvid, × stänger och släpper låset
// – låset sparas per användare i localStorage (tål att lagringen saknas)
// – etiketten för aktivt lager öppnar menyn
// – punktnamn per lager: labels (fria punkter) och vertexLabels (hörn),
//   migrering, projektfil och samspelet med Visa → Etiketter

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const {
  initTopbar, closeTopbarMenus, openTopbarMenu, isTopbarMenuOpen,
  setLagerPinned, closeLagerMenu, isLagerPinned, LAGER_PIN_KEY,
} = await import('../src/ui/topbar.js');
const { initLayerPanel, renderLayerPanel } = await import('../src/ui/layer-panel.js');
const { getState, setState } = await import('../src/state/store.js');
const {
  addVisualLayer, addVisualPt, addVisualLine, makeEndpoint, findVisualLayer,
  updateVisualLayer, visualPtShowsLabel, _migrateVisualLayers,
} = await import('../src/state/visual.js');
const { drawVisualLayer } = await import('../src/map/visual-canvas.js');
const { _buildSnapshot, _applySnapshot } = await import('../src/io/export-project.js');
const { undo } = await import('../src/state/undo.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');
const $ = id => document.getElementById(id);

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
};

function mount() {
  const doc = new DOMParser().parseFromString(HTML, 'text/html');
  document.body.innerHTML = '';
  document.body.appendChild(doc.getElementById('topbar'));
  const modal = doc.getElementById('modal');
  if (modal) document.body.appendChild(modal);
  const map = document.createElement('div');
  map.id = 'kartan';
  document.body.appendChild(map);
  initTopbar();
  initLayerPanel();
}

const outside = () => $('kartan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
const escape  = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const lagerOpen = () => !$('mnu-lager').hidden;

beforeEach(() => {
  closeLagerMenu();
  closeTopbarMenus();
  localStorage.clear();
  setState({ ...BASE });
  window.innerWidth = 1280;
  mount();
});
afterEach(() => vi.restoreAllMocks());

describe('Lager-menyn öppnas och stängs som de andra', () => {
  it('är stängd från början och öppnas med knappen', () => {
    expect(lagerOpen()).toBe(false);
    $('mnu-lager-btn').click();
    expect(lagerOpen()).toBe(true);
    expect($('mnu-lager-btn').getAttribute('aria-expanded')).toBe('true');
    $('mnu-lager-btn').click();
    expect(lagerOpen()).toBe(false);
  });

  it('olåst: klick utanför och Escape stänger', () => {
    $('mnu-lager-btn').click();
    outside();
    expect(lagerOpen()).toBe(false);
    $('mnu-lager-btn').click();
    escape();
    expect(lagerOpen()).toBe(false);
  });

  it('att öppna en annan meny stänger en olåst Lager-meny', () => {
    $('mnu-lager-btn').click();
    $('mnu-data-btn').click();
    expect(lagerOpen()).toBe(false);
    expect($('mnu-data').hidden).toBe(false);
  });

  it('pil vänster från Lager går till Rapport', () => {
    $('mnu-lager-btn').focus();
    $('mnu-lager-btn').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe($('mnu-rapport-btn'));
  });

  it('klick på en rad som ritar om listan stänger inte menyn', () => {
    addVisualLayer({ name: 'A' });
    addVisualLayer({ name: 'B' });
    renderLayerPanel();
    $('mnu-lager-btn').click();
    // Ögat ritar om #layer-list – klickets target är urkopplat när det når
    // dokumentets lyssnare.
    document.querySelectorAll('#layer-list [data-eye]')[1].click();
    expect(lagerOpen()).toBe(true);
    document.querySelectorAll('#layer-list .lyr-vis')[1].click();
    expect(lagerOpen()).toBe(true);
    expect(getState().activeVisualLayerId).toBe('VLY2');
  });

  it('klick i radens ⋮-meny stänger inte Lager-menyn', () => {
    addVisualLayer({ name: 'A' });
    renderLayerPanel();
    $('mnu-lager-btn').click();
    document.querySelector('#layer-list [data-menu]').click();
    const pop = document.querySelector('.lyr-pop');
    pop.querySelector('.lyr-pop-head').click();
    expect(lagerOpen()).toBe(true);
  });

  it('Escape med ⋮-menyn öppen stänger bara ⋮-menyn', () => {
    addVisualLayer({ name: 'A' });
    renderLayerPanel();
    $('mnu-lager-btn').click();
    document.querySelector('#layer-list [data-menu]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lyr-pop')).toBeNull();
    expect(lagerOpen()).toBe(true);
  });
});

describe('låsning med nålen', () => {
  it('nålen låser, öppnar och ger kanten', () => {
    $('mnu-lager-pin').click();
    expect(isLagerPinned()).toBe(true);
    expect(lagerOpen()).toBe(true);
    expect($('mnu-lager').classList.contains('tbar-pop-pinned')).toBe(true);
    expect($('mnu-lager-pin').getAttribute('aria-pressed')).toBe('true');
  });

  it('låst: klick utanför, Escape och Lager-knappen stänger inte', () => {
    $('mnu-lager-btn').click();
    $('mnu-lager-pin').click();
    outside();
    escape();
    $('mnu-lager-btn').click();
    expect(lagerOpen()).toBe(true);
    // Den låsta menyn är inte "den öppna menyn".
    expect(isTopbarMenuOpen()).toBeNull();
  });

  it('andra menyer kan öppnas och stängas medan Lager är låst', () => {
    setLagerPinned(true);
    $('mnu-data-btn').click();
    expect($('mnu-data').hidden).toBe(false);
    expect(lagerOpen()).toBe(true);
    $('mnu-visa-btn').click();
    expect($('mnu-data').hidden).toBe(true);
    expect($('mnu-visa').hidden).toBe(false);
    outside();
    expect($('mnu-visa').hidden).toBe(true);
    expect(lagerOpen()).toBe(true);
  });

  it('× stänger och släpper låset', () => {
    setLagerPinned(true);
    $('mnu-lager-close').click();
    expect(lagerOpen()).toBe(false);
    expect(isLagerPinned()).toBe(false);
    expect(localStorage.getItem(LAGER_PIN_KEY)).toBe('0');
  });

  it('nålen igen släpper låset; menyn blir en vanlig öppen meny', () => {
    setLagerPinned(true);
    $('mnu-data-btn').click();
    $('mnu-lager-pin').click();
    expect(isLagerPinned()).toBe(false);
    expect(lagerOpen()).toBe(true);
    expect($('mnu-data').hidden).toBe(true);   // bara en olåst meny åt gången
    expect($('mnu-lager').classList.contains('tbar-pop-pinned')).toBe(false);
    outside();
    expect(lagerOpen()).toBe(false);
  });

  it('låset sparas per användare och återställs vid start', () => {
    setLagerPinned(true);
    expect(localStorage.getItem(LAGER_PIN_KEY)).toBe('1');
    closeTopbarMenus();
    mount();
    expect(isLagerPinned()).toBe(true);
    expect(lagerOpen()).toBe(true);
  });

  it('låset sparas inte i projektfilen', () => {
    setLagerPinned(true);
    expect(JSON.stringify(_buildSnapshot())).not.toMatch(/pinned|natsim_lager/);
  });

  it('en lagring som kastar ger ingen krasch', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('privat läge'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('privat läge'); });
    expect(() => setLagerPinned(true)).not.toThrow();
    expect(isLagerPinned()).toBe(true);
    closeLagerMenu();
    expect(() => mount()).not.toThrow();
    expect(isLagerPinned()).toBe(false);
  });

  it('telefon (< 768 px): ingen låsning, ett sparat lås används inte', () => {
    localStorage.setItem(LAGER_PIN_KEY, '1');
    window.innerWidth = 390;
    mount();
    expect(isLagerPinned()).toBe(false);
    expect(lagerOpen()).toBe(false);
    setLagerPinned(true);
    expect(isLagerPinned()).toBe(false);
  });
});

describe('etiketten för aktivt lager', () => {
  it('klick öppnar menyn', () => {
    $('active-layer-chip').click();
    expect(lagerOpen()).toBe(true);
  });

  it('visar "inget aktivt lager" utan lager, annars färg och namn', () => {
    renderLayerPanel();
    expect($('active-layer-name').textContent).toBe('inget aktivt lager');
    addVisualLayer({ name: 'Utsättning_bro', color: '#ffd54f' });
    renderLayerPanel();
    expect($('active-layer-name').textContent).toBe('aktivt · Utsättning_bro');
    expect($('active-layer-chip').classList.contains('tbar-chip-none')).toBe(false);
  });
});

describe('importknappen', () => {
  it('öppnar filväljaren för .geo/.dxf', () => {
    const spy = vi.spyOn($('lager-fi'), 'click').mockImplementation(() => {});
    $('btn-import-layer').click();
    expect(spy).toHaveBeenCalled();
    expect($('lager-fi').getAttribute('accept')).toBe('.geo,.dxf');
  });
});

describe('hörnnamn: knappen Aa på lagerraden', () => {
  it('förval av; knappen slår på vertexLabels och går att ångra', () => {
    const a = addVisualLayer({ name: 'A' });
    renderLayerPanel();
    const btn = () => document.querySelector(`#layer-list [data-vlabels="${a}"]`);
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    btn().click();
    expect(findVisualLayer(a).vertexLabels).toBe(true);
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    // Klicket gör inte lagret aktivt av misstag och rör inte labels.
    expect(findVisualLayer(a).labels).toBe(true);
    undo();
    expect(findVisualLayer(a).vertexLabels).toBe(false);
  });
});

describe('punktnamn per lager – datamodell', () => {
  it('nya lager: labels på, vertexLabels av', () => {
    const a = addVisualLayer({ name: 'A' });
    expect(findVisualLayer(a)).toMatchObject({ labels: true, vertexLabels: false });
  });

  it('migrering: lager utan fälten får labels=true, vertexLabels=false', () => {
    const { visualLayers } = _migrateVisualLayers([], [], [{ id: 'VLY1', name: 'Gammalt' }], null);
    expect(visualLayers[0]).toMatchObject({ labels: true, vertexLabels: false });
  });

  it('migrering: "Handritat" skapat för föräldralösa objekt får samma förval', () => {
    const { visualLayers } = _migrateVisualLayers([{ id: 'V1', E: 0, N: 0 }], [], [], null);
    expect(visualLayers[0]).toMatchObject({ labels: true, vertexLabels: false });
  });

  it('projektfilen bär båda fälten fram och tillbaka', () => {
    const a = addVisualLayer({ name: 'A' });
    updateVisualLayer(a, { labels: false, vertexLabels: true });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ ...BASE });
    _applySnapshot(snap);
    expect(findVisualLayer(a)).toMatchObject({ labels: false, vertexLabels: true });
  });

  it('projektfil från före Lager-menyn laddas med dagens beteende', () => {
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [],
      visualLayers: [{ id: 'VLY1', name: 'Import', visible: true }],
      visualPts: [{ id: 'V1', layerId: 'VLY1', E: 0, N: 0 }] });
    expect(findVisualLayer('VLY1')).toMatchObject({ labels: true, vertexLabels: false });
  });

  it('visualPtShowsLabel: fria punkter följer labels, hörn vertexLabels', () => {
    const L = (labels, vertexLabels) => ({ labels, vertexLabels });
    expect(visualPtShowsLabel({}, L(true, false))).toBe(true);
    expect(visualPtShowsLabel({ role: 'point' }, L(false, true))).toBe(false);
    expect(visualPtShowsLabel({ role: 'vertex' }, L(true, false))).toBe(false);
    expect(visualPtShowsLabel({ role: 'vertex' }, L(false, true))).toBe(true);
    // Okänt lager: som före Lager-menyn – namn på fria punkter, inte på hörn.
    expect(visualPtShowsLabel({}, null)).toBe(true);
    expect(visualPtShowsLabel({ role: 'vertex' }, null)).toBe(false);
  });
});

describe('punktnamn per lager – ritning', () => {
  const ritadeNamn = state => {
    const texts = [];
    const noop = () => {};
    const ctx = new Proxy({}, {
      get: (_, k) => k === 'fillText' ? (t => texts.push(t)) : noop,
      set: () => true,
    });
    const map = { latLngToContainerPoint: ([N, E]) => ({ x: E, y: N }) };
    drawVisualLayer(ctx, state, { map, ENtoLatLng: (E, N) => [N, E], symSize: 10 });
    return texts;
  };

  function kontur(labels, vertexLabels) {
    const a = addVisualLayer({ name: 'A', labels, vertexLabels });
    addVisualPt({ E: 50, N: 50, layerId: a, name: 'FRI' });
    const h1 = addVisualPt({ E: 0, N: 0, layerId: a, name: 'H1', role: 'vertex' });
    const h2 = addVisualPt({ E: 10, N: 0, layerId: a, name: 'H2', role: 'vertex' });
    addVisualLine({ from: makeEndpoint('visual', h1), to: makeEndpoint('visual', h2), layerId: a });
    return a;
  }

  it('förval: fria punkter får namn, hörn inte (som före Lager-menyn)', () => {
    kontur(true, false);
    expect(ritadeNamn(getState()).sort()).toEqual(['FRI']);
  });

  it('vertexLabels på: hörnen får namn', () => {
    kontur(true, true);
    expect(ritadeNamn(getState()).sort()).toEqual(['FRI', 'H1', 'H2']);
  });

  it('labels av, vertexLabels på: bara hörnen', () => {
    kontur(false, true);
    expect(ritadeNamn(getState()).sort()).toEqual(['H1', 'H2']);
  });

  it('Visa → Etiketter påverkar inte lagrens namn (den gäller nätet)', () => {
    kontur(true, false);
    const tgl = document.createElement('input');
    tgl.type = 'checkbox'; tgl.id = 'tgl'; tgl.checked = false;
    document.body.appendChild(tgl);
    expect(ritadeNamn(getState())).toEqual(['FRI']);
  });

  it('leaflet-setup skickar inte längre showLabels till det visuella lagret', () => {
    const src = readFileSync(join(root, 'src/map/leaflet-setup.js'), 'utf8');
    const anrop = src.slice(src.indexOf('drawVisualLayer(ctx'), src.indexOf('drawVisualPreview(ctx)'));
    expect(anrop).not.toContain('showLabels');
  });
});
