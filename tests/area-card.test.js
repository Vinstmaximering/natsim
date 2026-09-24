// Lager-verktyg Etapp 3: egenskapskortet för en yta.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn(), fitViewToENBounds: vi.fn() }));

const { renderAreaCard, initAreaCard } = await import('../src/ui/area-card.js');
const V = await import('../src/state/visual.js');
const { getState, setState } = await import('../src/state/store.js');
const { undo } = await import('../src/state/undo.js');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null, selObsId: null,
  visualPts: [], visualLines: [], visualAreas: [], selVisualId: null,
  nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
};
const $ = s => document.querySelector(`#area-card ${s}`);
const card = () => document.getElementById('area-card');

let inited = false;
function setup() {
  setState({ ...BASE });
  document.body.innerHTML = '<div class="area-card" id="area-card" hidden></div>';
  if (!inited) { initAreaCard(); inited = true; }
  const l = V.addVisualLayer({ name: 'Utsättning_bro', color: '#ffd54f' });
  const h = [[0, 0], [40, 0], [40, 30], [0, 30]].map(([E, N]) => V.addVisualPt({ E, N, layerId: l, role: 'vertex' }));
  const id = V.addVisualArea({ vertices: h.map(x => V.makeEndpoint('visual', x)), layerId: l, name: 'Platta' });
  return { l, id, h };
}

beforeEach(() => vi.restoreAllMocks());

describe('egenskapskortet', () => {
  it('dolt tills en yta markeras', () => {
    const { id } = setup();
    expect(card().hidden).toBe(true);
    setState({ selVisualId: id });
    expect(card().hidden).toBe(false);
    setState({ selVisualId: null });
    expect(card().hidden).toBe(true);
  });

  it('visar lager, namn, area, omkrets, hörn, färg, opacitet, mönster och sikt', () => {
    const { id } = setup();
    setState({ selVisualId: id });
    const t = s => $(s).textContent.replace(/\u00a0/g, ' ');
    expect(t('.ac-layer')).toBe('Utsättning_bro');
    expect($('.ac-name').value).toBe('Platta');
    expect(t('.ac-area')).toBe('1 200 m² (plan)');
    expect(t('.ac-perim')).toBe('140,00 m (plan)');
    expect(t('.ac-n')).toBe('4');
    expect($('.ac-opv').textContent).toBe('25 %');
    expect($('.ac-pat').value).toBe('none');
    expect($('.ac-bs').checked).toBe(false);
    expect($('.ac-sw-layer').classList.contains('ac-on')).toBe(true);   // lagrets färg
    expect(card().textContent).toContain('Blockerar sikt (hinder)');
  });

  it('självkorsande yta: varning, ingen area', () => {
    const { id, h } = setup();
    V.updateVisualPt(h[2], { E: 0, N: -30 });    // korsar kanten 0,0 → 40,0
    setState({ selVisualId: id });
    expect($('.ac-warn').hidden).toBe(false);
    expect($('.ac-warn').textContent).toContain('korsar sig själv');
    expect($('.ac-area').textContent).toBe('–');
  });

  it('Blockerar sikt skapar och tar bort hindret, går att ångra', () => {
    const { id } = setup();
    setState({ selVisualId: id });
    $('.ac-bs').checked = true;
    $('.ac-bs').dispatchEvent(new Event('change'));
    expect(getState().obstacles).toHaveLength(1);
    expect($('.ac-bs').checked).toBe(true);
    undo();
    expect(getState().obstacles).toEqual([]);
  });

  it('namn, mönster, färg och opacitet ändras och är ångringsbara', () => {
    const { id } = setup();
    setState({ selVisualId: id });
    $('.ac-name').value = 'Garage';
    $('.ac-name').dispatchEvent(new Event('change'));
    expect(V.findVisualArea(id).name).toBe('Garage');

    $('.ac-pat').value = 'grid';
    $('.ac-pat').dispatchEvent(new Event('change'));
    expect(V.findVisualArea(id).pattern).toBe('grid');

    $('.ac-pal [data-color="#4dd0e1"]').click();
    expect(V.findVisualArea(id).color).toBe('#4dd0e1');

    // Ett drag i reglaget är ett ångra-steg, hur många input-händelser det än ger.
    for (const v of ['40', '55', '70']) {
      $('.ac-op').value = v;
      $('.ac-op').dispatchEvent(new Event('input'));
    }
    $('.ac-op').dispatchEvent(new Event('change'));
    expect(V.findVisualArea(id).fillOpacity).toBe(0.7);
    undo();
    expect(V.findVisualArea(id).fillOpacity).toBe(0.25);
    undo(); undo(); undo();
    expect(V.findVisualArea(id)).toMatchObject({ name: 'Platta', pattern: 'none', color: null });
  });

  it('Ta bort frågar först och går att ångra', () => {
    const { id } = setup();
    setState({ selVisualId: id });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    $('[data-ac="delete"]').click();
    expect(V.findVisualArea(id)).not.toBeNull();
    $('[data-ac="delete"]').click();
    expect(V.findVisualArea(id)).toBeNull();
    expect(card().hidden).toBe(true);
    undo();
    expect(V.findVisualArea(id)).not.toBeNull();
  });

  it('× avmarkerar', () => {
    const { id } = setup();
    setState({ selVisualId: id });
    $('[data-ac="close"]').click();
    expect(getState().selVisualId).toBeNull();
    expect(card().hidden).toBe(true);
  });

  it('dolt lager: kortet visas inte', () => {
    const { id, l } = setup();
    V.updateVisualLayer(l, { visible: false });
    setState({ selVisualId: id });
    renderAreaCard();
    expect(card().hidden).toBe(true);
  });
});

describe('högerklicksmenyn för en yta', () => {
  it('har Egenskaper, Blockerar sikt och Ta bort; Egenskaper markerar ytan', async () => {
    const { openVisualMenu, closeVisualMenu } = await import('../src/ui/visual-modal.js');
    const { id } = setup();
    openVisualMenu(id, 10, 10);
    const acts = [...document.querySelectorAll('.visual-ctx [data-act]')].map(b => b.dataset.act);
    expect(acts).toEqual(['props', 'block', 'delete']);
    document.querySelector('.visual-ctx [data-act="props"]').click();
    expect(getState().selVisualId).toBe(id);
    expect(card().hidden).toBe(false);
    closeVisualMenu();
  });

  it('Blockerar sikt i menyn kopplar hindret', async () => {
    const { openVisualMenu } = await import('../src/ui/visual-modal.js');
    const { id } = setup();
    openVisualMenu(id, 10, 10);
    document.querySelector('.visual-ctx [data-act="block"]').click();
    expect(V.findVisualArea(id).linkedObsId).toBeTruthy();
    expect(getState().obstacles).toHaveLength(1);
  });
});
