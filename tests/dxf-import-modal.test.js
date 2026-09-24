// Etapp 6: DXF-dialogens DOM-beteende. Importen testas i dxf-import.test.js.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDxfImport, closeDxfImport } from '../src/ui/dxf-import-modal.js';
import { getState, setState } from '../src/state/store.js';

const dxf = (...pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
const SECTION = n => [[0, 'SECTION'], [2, n]];
const ENDSEC  = [[0, 'ENDSEC']];
const EOF     = [[0, 'EOF']];
const entities = (...body) => dxf(...SECTION('ENTITIES'), ...body, ...ENDSEC, ...EOF);
const withUnit = (kod, ...body) => dxf(
  ...SECTION('HEADER'), [9, '$INSUNITS'], [70, kod], ...ENDSEC,
  ...SECTION('ENTITIES'), ...body, ...ENDSEC, ...EOF);
const LINE = (layer, x1, y1, x2, y2) => [
  [0, 'LINE'], [8, layer], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0],
];

const BLANDAD = entities(
  ...LINE('MUR', 247000, 6165000, 247100, 6165100),
  ...LINE('VÄG', 247000, 6165050, 247100, 6165050),
  [0, 'TEXT'], [8, 'TEXTLAGER'], [10, 0], [20, 0]);

const BASE = {
  pts: [], meas: [], obstacles: [], visualPts: [], visualLines: [],
  visualLayers: [], activeVisualLayerId: null, nVid: 1, nVlid: 1, nVlyid: 1,
  activeCRS: 'sweref991545', activeLayerKey: 'osm',
};

const $   = id => document.getElementById(id);
const box = () => document.querySelector('#dxf-box');
const txt = () => box().textContent;

beforeEach(() => { setState({ ...BASE }); document.body.innerHTML = ''; });
afterEach(closeDxfImport);

describe('öppning och sammanfattning', () => {
  it('rubriken är "Importera .dxf" med filnamn och lagerbesked', () => {
    openDxfImport(BLANDAD, 'Ritning_A.dxf');
    expect(txt()).toContain('Importera .dxf');
    expect(txt()).toContain('Ritning_A.dxf');
    expect(txt()).toContain('importeras alltid som visuellt lager');
    // Inte den gamla arbetsrubriken.
    expect(txt()).not.toContain('Importera ritning');
  });

  it('räknar lager och läsbara objekt', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(txt()).toContain('3');   // lager
    expect(txt()).toContain('2');   // läsbara objekt
  });

  it('visar enheten ur filen när den finns', () => {
    openDxfImport(withUnit(4, ...LINE('A', 0, 0, 1, 1)), 'a.dxf');
    expect(txt()).toContain('Millimeter');
    expect(txt()).toContain('$INSUNITS');
    expect($('dxf-unit').value).toBe('4');
  });

  it('saknad enhet frågas om i dialogen med meter som förval', () => {
    openDxfImport(entities(...LINE('A', 0, 0, 1, 1)), 'a.dxf');
    expect(txt()).toContain('anges inte i filen');
    expect($('dxf-unit').value).toBe('6');
  });

  it('binär DXF ger ett besked i stället för en dialog', () => {
    const r = openDxfImport('AutoCAD Binary DXF\r\n\x1a\x00\x01', 'bin.dxf');
    expect(r).toBeNull();
    expect(box()).toBeNull();
    expect(document.getElementById('toast').textContent).toMatch(/binär DXF/i);
    expect(document.getElementById('toast').textContent).toMatch(/ASCII/);
  });
});

describe('georeferens', () => {
  it('visar projektets CRS och att DXF saknar egen', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(txt()).toContain('SWEREF 99 15 45');
    expect(txt()).toContain('bär ingen egen CRS-information');
  });

  it('X → E är förvalt', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(box().querySelector('input[name="dxf-axis"][value="xe"]').checked).toBe(true);
  });

  it('utan nät sägs det rakt ut att kontrollen inte går att göra', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect($('dxf-sanity').textContent).toContain('Nätet är tomt');
  });

  it('med nät visas avståndet för båda axelordningarna', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 247050, N: 6165050, H: 0 }] });
    openDxfImport(BLANDAD, 'a.dxf');
    const s = $('dxf-sanity').textContent;
    expect(s).toContain('X → E, Y → N');
    expect(s).toContain('X → N, Y → E');
    expect(s).toContain('från nätets tyngdpunkt');
  });

  it('varnar när vald ordning är orimlig men den andra rimlig', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 247050, N: 6165050, H: 0 }] });
    // Ritningen har X = nord, alltså fel för förvalet.
    openDxfImport(entities(...LINE('A', 6165000, 247000, 6165100, 247100)), 'a.dxf');
    expect($('dxf-sanity').textContent).toMatch(/axlarna är troligen omkastade/i);

    // Byt till rätt ordning – varningen ska försvinna.
    const r = box().querySelector('input[name="dxf-axis"][value="xn"]');
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('dxf-sanity').textContent).not.toMatch(/omkastade/i);
  });

  it('varnar när båda ordningarna är orimliga', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 247050, N: 6165050, H: 0 }] });
    openDxfImport(entities(...LINE('A', 0, 0, 100, 100)), 'a.dxf');
    expect($('dxf-sanity').textContent).toMatch(/troligen inte georefererad/i);
  });
});

describe('lagertabellen', () => {
  beforeEach(() => openDxfImport(BLANDAD, 'a.dxf'));

  it('listar alla lager med innehåll och färg', () => {
    const rader = [...box().querySelectorAll('input.dxf-lay')];
    expect(rader.map(r => r.value)).toEqual(['MUR', 'TEXTLAGER', 'VÄG']);
    expect(txt()).toContain('LINE 1');
    expect(txt()).toContain('TEXT 1');
  });

  it('lager med bara ostödda objekt är utgråade och går inte att välja', () => {
    const t = box().querySelector('input.dxf-lay[value="TEXTLAGER"]');
    expect(t.disabled).toBe(true);
    expect(t.checked).toBe(false);
    expect(t.closest('tr').classList.contains('dxf-off')).toBe(true);
  });

  it('stödda lager är förvalda', () => {
    expect(box().querySelector('input.dxf-lay[value="MUR"]').checked).toBe(true);
    expect(box().querySelector('input.dxf-lay[value="VÄG"]').checked).toBe(true);
  });

  it('knapptexten följer valet', () => {
    expect($('dxf-ok').textContent).toContain('2 objekt');
    expect($('dxf-ok').textContent).toContain('2 visuella lager');

    const mur = box().querySelector('input.dxf-lay[value="MUR"]');
    mur.checked = false;
    mur.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('dxf-ok').textContent).toContain('1 objekt');
  });

  it('inget valt lager gör knappen otillgänglig', () => {
    for (const v of ['MUR', 'VÄG']) {
      const cb = box().querySelector(`input.dxf-lay[value="${v}"]`);
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect($('dxf-ok').disabled).toBe(true);
    expect($('dxf-ok').textContent).toContain('inga lager valda');
  });
});

describe('lagerstruktur', () => {
  beforeEach(() => openDxfImport(BLANDAD, 'Ritning_A.dxf'));

  it('ett lager per DXF-lager är förvalt och namnfältet är dolt', () => {
    expect(box().querySelector('input[name="dxf-struct"][value="per"]').checked).toBe(true);
    expect($('dxf-single-name').style.display).toBe('none');
  });

  it('samlat lager visar namnfältet med filnamnet', () => {
    const r = box().querySelector('input[name="dxf-struct"][value="single"]');
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('dxf-single-name').style.display).toBe('block');
    expect($('dxf-layer-name').value).toBe('Ritning_A');
    expect($('dxf-ok').textContent).toContain('ett visuellt lager');
  });

  it('Z-värden används som förval', () => {
    expect($('dxf-usez').checked).toBe(true);
  });
});

describe('varningar och stängning', () => {
  it('parserns varningar visas i rutan', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(txt()).toMatch(/TEXT/);
    expect(txt()).toMatch(/stöds inte/);
  });

  it('dialogen rör inte projektet förrän Importera klickas', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(getState().visualLayers).toEqual([]);
    expect(getState().visualPts).toEqual([]);
  });

  it('Avbryt och Escape stänger', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    $('dxf-cancel').click();
    expect(box()).toBeNull();

    openDxfImport(BLANDAD, 'a.dxf');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(box()).toBeNull();
    expect(getState().visualLayers).toEqual([]);
  });

  it('en ny öppning ersätter den förra', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    openDxfImport(BLANDAD, 'b.dxf');
    expect(document.querySelectorAll('#dxf-box')).toHaveLength(1);
    expect(txt()).toContain('b.dxf');
  });
});

describe('slutna polylinjer som ytor (Lager-verktyg Etapp 3)', () => {
  beforeEach(() => setState({ visualAreas: [], nVaid: 1 }));
  const HUS = entities(
    [0, 'LWPOLYLINE'], [8, 'HUS'], [90, 4], [70, 1],
    [10, 247000], [20, 6165000], [10, 247010], [20, 6165000],
    [10, 247010], [20, 6165010], [10, 247000], [20, 6165010],
    ...LINE('VÄG', 247000, 6165050, 247100, 6165050));
  const radios = () => [...document.querySelectorAll('input[name="dxf-closed"]')];

  it('valet visas med förval linjer', () => {
    openDxfImport(HUS, 'hus.dxf');
    expect(radios().map(r => r.value)).toEqual(['lines', 'areas']);
    expect(radios().find(r => r.checked).value).toBe('lines');
    expect(txt()).toContain('Slutna polylinjer som (1 st)');
  });

  it('"ytor" ger en yta; den öppna linjen förblir linje', () => {
    openDxfImport(HUS, 'hus.dxf');
    const ytor = radios().find(r => r.value === 'areas');
    ytor.checked = true;
    ytor.dispatchEvent(new Event('change'));
    $('dxf-ok').click();
    expect(getState().visualAreas).toHaveLength(1);
    expect(getState().visualLines).toHaveLength(1);
  });

  it('valet visas inte utan slutna polylinjer', () => {
    openDxfImport(BLANDAD, 'a.dxf');
    expect(radios()).toEqual([]);
  });
});
