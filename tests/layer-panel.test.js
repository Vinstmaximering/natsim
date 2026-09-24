// Etapp 5: LAGER-sektionen i vänsterpanelen – sedan Lager-verktyg Etapp 1
// Lager-menyn i toolbaren. Innehållet och id:na är desamma.
//
// Panelens hela poäng är skillnaden mellan de två grupperna: BERÄKNING-radernas
// öga döljer bara på kartan, medan VISUELLA-lagren aldrig deltar i någon
// beräkning. Testerna vaktar just den gränsen.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fitSpy = vi.fn();
vi.mock('../src/map/leaflet-setup.js', () => ({
  draw: vi.fn(),
  fitViewToENBounds: (...a) => fitSpy(...a),
}));

const {
  renderLayerPanel, initLayerPanel, layerBounds, closeLayerMenu,
} = await import('../src/ui/layer-panel.js');
const { getState, setState } = await import('../src/state/store.js');
const {
  addVisualLayer, addVisualPt, addVisualLine, makeEndpoint,
  findVisualLayer, getVisualLayers, visualLineCoords, findVisualLine,
} = await import('../src/state/visual.js');
const { addObstacle } = await import('../src/state/obstacles.js');
const { undo } = await import('../src/state/undo.js');
const { runSimulation } = await import('../src/core/simulation.js');
const { findBlockedMeasurements } = await import('../src/core/visibility.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  netVisible: true, obstaclesVisible: true,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
  symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 1, nId: 1,
};

const $ = id => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#layer-list .lyr-vis')];
const calcRow = key => document.querySelector(`#layer-list [data-calc="${key}"]`).closest('.lyr-row');

function mountPanel() {
  document.body.innerHTML = `
    <button type="button" id="active-layer-chip">
      <span id="active-layer-swatch"></span><span id="active-layer-name">–</span></button>
    <div id="layer-list"></div>
    <button class="tbar-item" id="btn-new-layer">+ Nytt visuellt lager</button>
    <button class="tbar-item" id="btn-import-layer">Importera till lager…</button>
    <input type="file" id="lager-fi" accept=".geo,.dxf">
    <div class="ov" id="modal" style="display:none"><div class="mo" id="mi"></div></div>`;
  initLayerPanel();
}

beforeEach(() => {
  closeLayerMenu();
  setState({ ...BASE });
  fitSpy.mockClear();
  mountPanel();
});

// ── Strukturkontrakt mot index.html ─────────────────────────────────────────

describe('index.html: Lager-menyn i toolbaren', () => {
  // Ändrat i Lager-verktyg Etapp 1: sektionen flyttades från #lp till en
  // toppmeny. Kontrakten nedan ersätter "ligger mellan LÄGG TILL och PUNKTER".
  const lp  = HTML.slice(HTML.indexOf('id="lp"'), HTML.indexOf('id="lrh"'));
  const bar = HTML.slice(HTML.indexOf('id="topbar"'), HTML.indexOf('id="app-body"'));
  const pop = HTML.slice(HTML.indexOf('id="mnu-lager"'), HTML.indexOf('id="active-layer-chip"'));

  it('Lager ligger efter Rapport i toolbaren', () => {
    expect(bar.indexOf('id="mnu-rapport-btn"')).toBeGreaterThan(-1);
    expect(bar.indexOf('id="mnu-lager-btn"')).toBeGreaterThan(bar.indexOf('id="mnu-rapport-btn"'));
    expect(HTML).toMatch(/id="mnu-lager-btn"[^>]*aria-controls="mnu-lager"/);
  });

  it('menyn har nål, stängknapp, listan och båda knapparna', () => {
    expect(pop).toContain('id="mnu-lager-pin"');
    expect(pop).toContain('id="mnu-lager-close"');
    expect(pop).toContain('id="layer-list"');
    expect(pop).toContain('id="btn-new-layer"');
    expect(pop).toContain('+ Nytt visuellt lager');
    expect(pop).toContain('id="btn-import-layer"');
    expect(pop).toContain('Importera till lager…');
  });

  it('etiketten för aktivt lager står direkt efter menyn, utanför popupen', () => {
    const efter = bar.slice(bar.indexOf('id="mnu-lager"'));
    expect(efter).toContain('id="active-layer-chip"');
    expect(efter).toContain('id="active-layer-name"');
    expect(pop).not.toContain('id="active-layer-name"');
  });

  it('id:na finns exakt en gång och LAGER är borta ur vänsterpanelen', () => {
    for (const id of ['layer-list', 'btn-new-layer', 'active-layer-name', 'lager-fi']) {
      expect((HTML.match(new RegExp(`id="${id}"`, 'g')) || []).length, id).toBe(1);
    }
    const utan = lp.replace(/<!--[\s\S]*?-->/g, '');
    expect(utan).not.toContain('id="layer-list"');
    expect(utan).not.toContain('>LAGER<');
  });

  // Ändrat i Lager-verktyg Etapp 2: ritknapparna flyttade från vänsterpanelen
  // till verktygsraden på kartan, med id:n i behåll.
  it('ritknapparna ligger i verktygsraden på kartan, inte i vänsterpanelen', () => {
    const verktyg = HTML.slice(HTML.indexOf('id="map-tools"'), HTML.indexOf('id="hint"'));
    const utan = lp.replace(/<!--[\s\S]*?-->/g, '');
    for (const id of ['btn-visual-point', 'btn-visual-line']) {
      expect((HTML.match(new RegExp(`id="${id}"`, 'g')) || []).length).toBe(1);
      expect(verktyg).toContain(`id="${id}"`);
      expect(utan).not.toContain(`id="${id}"`);
      expect(readFileSync(join(root, 'src/ui/toolbar.js'), 'utf8')).toContain(id);
    }
    expect(utan).not.toContain('RITA VISUELLT');
  });

  it('LÄGG TILL har inte kvar de visuella ritknapparna', () => {
    const läggTill = lp.slice(lp.indexOf('LÄGG TILL PUNKT'), lp.indexOf('KOORDINATSYSTEM'));
    expect(läggTill.replace(/<!--[\s\S]*?-->/g, '')).not.toContain('btn-visual-point');
  });
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  it('BERÄKNING visar antal och en grön bock för båda raderna', () => {
    setState({
      pts: [{ id: 'A', type: 'known', E: 0, N: 0 }, { id: 'B', type: 'station', E: 1, N: 1 }],
      meas: [{ id: 'M1', from: 'A', to: 'B' }],
      obstacles: [{ id: 'obs_1', type: 'line', points: [[0, 0], [1, 1]] }],
    });
    renderLayerPanel();
    expect(calcRow('net').textContent).toContain('Nät');
    expect(calcRow('net').textContent).toContain('2 p · 1 m');
    expect(calcRow('obs').textContent).toContain('1 st');
    expect(calcRow('net').querySelector('.lyr-inc').textContent).toBe('✓');
    expect(calcRow('obs').querySelector('.lyr-inc').textContent).toBe('✓');
  });

  // Rubriken ändrad i Lager-verktyg Etapp 1 till uppdragets formulering.
  it('VISUELLA-rubriken säger att lagren inte ingår i beräkningen', () => {
    expect($('layer-list').textContent).toContain('VISUELLA · INGÅR EJ I BERÄKNING');
  });

  // Ändrat i Lager-verktyg Etapp 1: etiketten säger "inget aktivt lager" i
  // stället för att förutsäga lagret "Handritat" (som nu står i title).
  it('tom lista säger att det inte finns några lager', () => {
    expect($('layer-list').querySelector('.lyr-empty')).not.toBeNull();
    expect($('active-layer-name').textContent).toBe('inget aktivt lager');
    expect($('active-layer-chip').title).toContain('Handritat');
    expect($('active-layer-chip').classList.contains('tbar-chip-none')).toBe(true);
    expect($('active-layer-chip').getAttribute('aria-label')).toBe('Inget aktivt lager');
  });

  // Ändrat i Lager-verktyg Etapp 1: antalet visar punkter · linjer · ytor.
  it('varje lager får färgruta, namn och antal punkter/linjer/ytor', () => {
    const a = addVisualLayer({ name: 'Bottenplatta', color: '#4dd0e1' });
    const p1 = addVisualPt({ E: 0, N: 0, layerId: a });
    const p2 = addVisualPt({ E: 10, N: 0, layerId: a });
    addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    renderLayerPanel();

    expect(rows()).toHaveLength(1);
    const r = rows()[0];
    expect(r.textContent).toContain('Bottenplatta');
    expect(r.querySelector('.lyr-count').textContent).toBe('2 · 1 · 0');
    expect(r.querySelector('.lyr-count').title).toBe('2 punkter · 1 linje · 0 ytor');
    expect(r.querySelector('.lyr-swatch').style.background).toBeTruthy();
  });

  it('hörn räknas inte som punkter', () => {
    const a = addVisualLayer({ name: 'Kontur' });
    const p1 = addVisualPt({ E: 0, N: 0, layerId: a, role: 'vertex' });
    const p2 = addVisualPt({ E: 10, N: 0, layerId: a, role: 'vertex' });
    addVisualPt({ E: 5, N: 5, layerId: a });
    addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    renderLayerPanel();
    expect(rows()[0].querySelector('.lyr-count').textContent).toBe('1 · 1 · 0');
  });

  // Ändrat i Lager-verktyg Etapp 1: aktivt lager visas i etiketten i
  // toppraden ("aktivt · namn") i stället för i en rad under listan.
  it('aktivt lager markeras och visas i etiketten med sin färg', () => {
    const a = addVisualLayer({ name: 'A', color: '#4dd0e1' });
    const b = addVisualLayer({ name: 'B' });
    renderLayerPanel();
    expect(rows()[0].classList.contains('lyr-act')).toBe(true);   // A är aktivt
    expect(rows()[1].classList.contains('lyr-act')).toBe(false);
    expect($('active-layer-name').textContent).toBe('aktivt · A');
    expect($('active-layer-chip').classList.contains('tbar-chip-none')).toBe(false);
    expect($('active-layer-chip').getAttribute('aria-label')).toBe('Aktivt lager: A');
    expect($('active-layer-swatch').style.background).toMatch(/4dd0e1|77, 208, 225/i);
    rows()[1].click();
    expect($('active-layer-name').textContent).toBe('aktivt · B');
    void a;
  });

  it('dolt lager visas nedtonat', () => {
    const a = addVisualLayer({ name: 'A' });
    renderLayerPanel();
    rows()[0].querySelector('[data-eye]').click();
    expect(findVisualLayer(a).visible).toBe(false);
    expect(rows()[0].querySelector('.lyr-name').classList.contains('lyr-off')).toBe(true);
  });
});

// ── BERÄKNING-radernas öga: ritning, inget annat ────────────────────────────

describe('BERÄKNING-radernas synlighet rör bara ritningen', () => {
  const NÄT = {
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
  };

  it('att dölja nätet ändrar inte simuleringsresultatet', () => {
    setState(NÄT);
    renderLayerPanel();
    runSimulation();
    const före = JSON.stringify(getState().simResult);

    calcRow('net').querySelector('[data-calc="net"]').click();
    expect(getState().netVisible).toBe(false);
    runSimulation();

    expect(JSON.stringify(getState().simResult)).toBe(före);
    expect(getState().pts).toHaveLength(4);
    expect(getState().meas).toHaveLength(3);
  });

  it('att dölja hindren blockerar sikten precis som förut', () => {
    const pts = [
      { id: 'S1', type: 'station', E: 0,   N: 0 },
      { id: 'P1', type: 'new',     E: 100, N: 0 },
    ];
    setState({ pts, obstacles: [
      { id: 'obs_1', type: 'line', points: [[50, -50], [50, 50]] },
    ] });
    renderLayerPanel();
    const meas = [{ id: 'M1', from: 'S1', to: 'P1' }];
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toHaveLength(1);

    calcRow('obs').querySelector('[data-calc="obs"]').click();
    expect(getState().obstaclesVisible).toBe(false);
    // Hindret finns kvar och skymmer fortfarande – man tittar bort, inget mer.
    expect(getState().obstacles).toHaveLength(1);
    expect(findBlockedMeasurements(meas, pts, getState().obstacles)).toHaveLength(1);
  });

  it('ögonen är oberoende av varandra', () => {
    renderLayerPanel();
    calcRow('net').querySelector('[data-calc="net"]').click();
    expect(getState().netVisible).toBe(false);
    expect(getState().obstaclesVisible).toBe(true);
    calcRow('net').querySelector('[data-calc="net"]').click();
    expect(getState().netVisible).toBe(true);
  });
});

// ── Radinteraktion ──────────────────────────────────────────────────────────

describe('radinteraktion', () => {
  it('klick på raden gör lagret aktivt', () => {
    addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    renderLayerPanel();
    rows()[1].click();
    expect(getState().activeVisualLayerId).toBe(b);
    expect(rows()[1].classList.contains('lyr-act')).toBe(true);
  });

  it('klick på ögat byter inte aktivt lager', () => {
    const a = addVisualLayer({ name: 'A' });
    addVisualLayer({ name: 'B' });
    renderLayerPanel();
    rows()[1].querySelector('[data-eye]').click();
    expect(getState().activeVisualLayerId).toBe(a);
  });

  it('+ Nytt visuellt lager skapar, aktiverar och öppnar inställningarna', () => {
    $('btn-new-layer').click();
    expect(getVisualLayers()).toHaveLength(1);
    expect(getState().activeVisualLayerId).toBe(getVisualLayers()[0].id);
    expect($('modal').style.display).toBe('flex');
    expect($('mi').textContent).toContain('Lagerinställningar');
  });
});

// ── ⋮-menyn ─────────────────────────────────────────────────────────────────

describe('radmenyn', () => {
  const openMenu = i => { rows()[i].querySelector('[data-menu]').click(); return document.querySelector('.lyr-pop'); };

  // Ändrat i Lager-verktyg Etapp 1: valet "Namn på punkter" (labels) tillkom.
  it('har alla sex valen', () => {
    addVisualLayer({ name: 'A' });
    renderLayerPanel();
    const m = openMenu(0);
    expect([...m.querySelectorAll('[data-act]')].map(b => b.dataset.act))
      .toEqual(['rename', 'color', 'labels', 'active', 'zoom', 'delete']);
  });

  it('Namn på punkter slår av och på lagrets labels, går att ångra', () => {
    const a = addVisualLayer({ name: 'A' });
    renderLayerPanel();
    const item = openMenu(0).querySelector('[data-act="labels"]');
    expect(item.getAttribute('aria-checked')).toBe('true');
    item.click();
    expect(findVisualLayer(a).labels).toBe(false);
    expect(document.querySelector('.lyr-pop')).toBeNull();
    expect(openMenu(0).querySelector('[data-act="labels"]').getAttribute('aria-checked')).toBe('false');
    closeLayerMenu();
    undo();
    expect(findVisualLayer(a).labels).toBe(true);
  });

  it('Gör aktivt byter aktivt lager och stänger menyn', () => {
    addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    renderLayerPanel();
    openMenu(1).querySelector('[data-act="active"]').click();
    expect(getState().activeVisualLayerId).toBe(b);
    expect(document.querySelector('.lyr-pop')).toBeNull();
  });

  it('Escape stänger menyn', () => {
    addVisualLayer({ name: 'A' });
    renderLayerPanel();
    openMenu(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lyr-pop')).toBeNull();
  });

  it('Zooma till använder lagrets utbredning', () => {
    const a = addVisualLayer({ name: 'A' });
    addVisualPt({ E: 10, N: 20, layerId: a });
    addVisualPt({ E: 30, N: 5, layerId: a });
    renderLayerPanel();
    openMenu(0).querySelector('[data-act="zoom"]').click();
    expect(fitSpy).toHaveBeenCalledWith({ minE: 10, maxE: 30, minN: 5, maxN: 20 });
  });

  it('Zooma till ett tomt lager gör ingenting', () => {
    addVisualLayer({ name: 'Tomt' });
    renderLayerPanel();
    openMenu(0).querySelector('[data-act="zoom"]').click();
    expect(fitSpy).not.toHaveBeenCalled();
  });
});

describe('layerBounds', () => {
  it('omsluter lagrets punkter och ignorerar andra lager', () => {
    const a = addVisualLayer({ name: 'A' });
    const b = addVisualLayer({ name: 'B' });
    addVisualPt({ E: 0, N: 0, layerId: a });
    addVisualPt({ E: 10, N: 10, layerId: a });
    addVisualPt({ E: 999, N: 999, layerId: b });
    expect(layerBounds(a)).toEqual({ minE: 0, maxE: 10, minN: 0, maxN: 10 });
  });

  it('ger null för ett tomt lager', () => {
    expect(layerBounds(addVisualLayer({ name: 'A' }))).toBeNull();
  });
});

// ── Dialoger ────────────────────────────────────────────────────────────────

describe('lagerinställningar', () => {
  it('sparar nytt namn och ny färg', () => {
    const a = addVisualLayer({ name: 'Gammalt', color: null });
    renderLayerPanel();
    rows()[0].querySelector('[data-menu]').click();
    document.querySelector('[data-act="rename"]').click();

    $('lyr-name').value = 'Nytt namn';
    document.querySelector('#lyr-palette button[data-color="#ffd54f"]').click();
    $('lyr-save').click();

    expect(findVisualLayer(a)).toMatchObject({ name: 'Nytt namn', color: '#ffd54f' });
    expect($('modal').style.display).toBe('none');
    expect(rows()[0].textContent).toContain('Nytt namn');
  });

  it('Avbryt ändrar ingenting', () => {
    const a = addVisualLayer({ name: 'Orört' });
    renderLayerPanel();
    rows()[0].querySelector('[data-menu]').click();
    document.querySelector('[data-act="color"]').click();
    $('lyr-name').value = 'Skräp';
    $('lyr-cancel').click();
    expect(findVisualLayer(a).name).toBe('Orört');
  });

  it('tomt namn behåller det gamla', () => {
    const a = addVisualLayer({ name: 'Behåll' });
    renderLayerPanel();
    rows()[0].querySelector('[data-menu]').click();
    document.querySelector('[data-act="rename"]').click();
    $('lyr-name').value = '   ';
    $('lyr-save').click();
    expect(findVisualLayer(a).name).toBe('Behåll');
  });
});

describe('radera lager', () => {
  // Ett lager med en linje som styr ett hinder – det svåra fallet.
  function lagerMedHinder() {
    const a = addVisualLayer({ name: 'Med vägg' });
    const p1 = addVisualPt({ E: 0, N: 0, layerId: a });
    const p2 = addVisualPt({ E: 10, N: 0, layerId: a });
    const lineId = addVisualLine({ from: makeEndpoint('visual', p1), to: makeEndpoint('visual', p2), layerId: a });
    const obsId = addObstacle({
      type: 'line', source: 'visual', points: visualLineCoords(findVisualLine(lineId)),
    });
    setState({ visualLines: getState().visualLines.map(l => l.id === lineId ? { ...l, linkedObsId: obsId } : l) });
    renderLayerPanel();
    return { a, obsId };
  }

  const öppnaRadera = () => {
    rows()[0].querySelector('[data-menu]').click();
    document.querySelector('[data-act="delete"]').click();
  };

  it('bekräftelsen berättar vad som försvinner, inklusive hindret', () => {
    lagerMedHinder();
    öppnaRadera();
    expect($('modal').style.display).toBe('flex');
    expect($('mi').textContent).toContain('Radera lagret Med vägg');
    // Ändrat i Etapp 3: texten räknar även ytor.
    expect($('mi').textContent).toContain('2 punkter, 1 linjer och 0 ytor');
    expect($('mi').textContent).toContain('1 kopplade hinder');
  });

  it('Avbryt lämnar lagret orört', () => {
    lagerMedHinder();
    öppnaRadera();
    $('lyr-del-cancel').click();
    expect(getVisualLayers()).toHaveLength(1);
    expect(getState().visualPts).toHaveLength(2);
  });

  it('Radera tar bort lagret, objekten och det kopplade hindret', () => {
    const { obsId } = lagerMedHinder();
    öppnaRadera();
    $('lyr-del-ok').click();
    expect(getVisualLayers()).toEqual([]);
    expect(getState().visualPts).toEqual([]);
    expect(getState().visualLines).toEqual([]);
    expect(getState().obstacles.find(o => o.id === obsId)).toBeUndefined();
    expect($('modal').style.display).toBe('none');
  });

  it('raderingen går att ångra i ett steg', () => {
    const { obsId } = lagerMedHinder();
    öppnaRadera();
    $('lyr-del-ok').click();
    undo();
    expect(getVisualLayers()).toHaveLength(1);
    expect(getState().visualPts).toHaveLength(2);
    expect(getState().obstacles.find(o => o.id === obsId)).toBeDefined();
  });

  it('andra lager rörs inte', () => {
    lagerMedHinder();
    const b = addVisualLayer({ name: 'Kvar' });
    addVisualPt({ E: 99, N: 99, layerId: b });
    renderLayerPanel();
    öppnaRadera();
    $('lyr-del-ok').click();
    expect(getVisualLayers().map(l => l.id)).toEqual([b]);
    expect(getState().visualPts).toHaveLength(1);
  });
});

describe('ritsynligheten är sessionsbunden', () => {
  it('sparas inte i projektfilen', async () => {
    const { _buildSnapshot } = await import('../src/io/export-project.js');
    setState({ netVisible: false, obstaclesVisible: false });
    const snap = _buildSnapshot();
    expect('netVisible' in snap).toBe(false);
    expect('obstaclesVisible' in snap).toBe(false);
  });

  it('en laddad projektfil visar allt igen', async () => {
    const { _applySnapshot } = await import('../src/io/export-project.js');
    setState({ netVisible: false, obstaclesVisible: false });
    _applySnapshot({ ver: 3, pts: [], meas: [], obstacles: [] });
    expect(getState().netVisible).toBe(true);
    expect(getState().obstaclesVisible).toBe(true);
  });
});
