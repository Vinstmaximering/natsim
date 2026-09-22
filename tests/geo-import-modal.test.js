// Etapp 3: importdialogen för .geo – DOM-beteendet.
// Själva importen testas i geo-import.test.js; här testas att dialogen visar
// rätt sammanfattning, speglar valen och aldrig använder alert/confirm.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openGeoImport, closeGeoImport } from '../src/ui/geo-import-modal.js';
import { getState, setState } from '../src/state/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const geo = name => readFileSync(join(HERE, 'fixtures', 'geo', name), 'utf8');

const NORR = geo('exempel_punkter_sluten_linje.geo');
const PALL = geo('exempel_tom_punktlista.geo');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], visualLayers: [], activeVisualLayerId: null,
  nVid: 1, nVlid: 1, nVlyid: 1, selVisualId: null,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
};

const $  = id => document.getElementById(id) || document.querySelector('#' + id);
const box = () => document.querySelector('#gi-box');
const txt = () => box().textContent;

beforeEach(() => { setState({ ...BASE }); document.body.innerHTML = ''; });
afterEach(closeGeoImport);

describe('öppning och sammanfattning', () => {
  it('visar antal punkter, linjer och hörn', () => {
    openGeoImport(NORR, 'exempel_punkter_sluten_linje.geo');
    expect(box()).not.toBeNull();
    expect(txt()).toContain('5');           // punkter
    expect(txt()).toContain('4');           // hörn i den enda linjen
    expect(txt()).toContain('Importera .geo');
    expect(txt()).toContain('exempel_punkter_sluten_linje.geo');
  });

  it('visar filens koordinatsystem och höjdsystem', () => {
    openGeoImport(NORR, 'f.geo');
    expect(txt()).toContain('Sweref 99 15 45');
    expect(txt()).toContain('RH2000 (SWEN17)');
  });

  it('erbjuder CRS-byte i dialogen när systemet avviker – ingen confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const alertSpy   = vi.spyOn(window, 'alert').mockImplementation(() => {});
    openGeoImport(NORR, 'f.geo');
    const cb = $('gi-crs');
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
    expect(txt()).toContain('Byt projektets koordinatsystem');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore(); alertSpy.mockRestore();
  });

  it('inget CRS-val när filens system redan är projektets', () => {
    setState({ activeCRS: 'sweref991545' });
    openGeoImport(NORR, 'f.geo');
    expect($('gi-crs')).toBeNull();
    expect(txt()).toContain('stämmer med projektets koordinatsystem');
  });

  it('varnar för dubbletten i filen', () => {
    openGeoImport(NORR, 'f.geo');
    expect(txt()).toContain('förekommer 2 gånger');
  });

  it('tom punktlista ger en upplysning i stället för punktvalen', () => {
    openGeoImport(PALL, 'exempel_tom_punktlista.geo');
    expect(txt()).toContain('inga punkter');
    expect($('gi-layer-name')).toBeNull();
    expect(txt()).toContain('LINJER (9 st)');
  });
});

describe('val speglas i dialogen', () => {
  beforeEach(() => openGeoImport(NORR, 'exempel_punkter_sluten_linje.geo'));

  const pick = (name, value) => {
    const r = box().querySelector(`input[name="${name}"][value="${value}"]`);
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return r;
  };

  it('visuellt lager är förvalt och lagernamnet är filnamnet utan ändelse', () => {
    expect(box().querySelector('input[name="gi-target"][value="visual"]').checked).toBe(true);
    expect($('gi-layer-name').value).toBe('exempel_punkter_sluten_linje');
    expect($('gi-opts-visual').style.display).toBe('block');
    expect($('gi-opts-net').style.display).toBe('none');
  });

  it('nätpunktsvalet visar punkttyp och ID-krock', () => {
    pick('gi-target', 'net');
    expect($('gi-opts-net').style.display).toBe('block');
    expect($('gi-opts-visual').style.display).toBe('none');
    expect([...$('gi-pt-type').options].map(o => o.value))
      .toEqual(['prefix', 'detail', 'new', 'known']);
    expect([...$('gi-conflict').options].map(o => o.value))
      .toEqual(['skip', 'update', 'rename']);
    expect($('gi-conflict').value).toBe('skip');
  });

  it('knapptexten speglar valet', () => {
    expect($('gi-ok').textContent).toContain('Importera till nytt visuellt lager');

    pick('gi-target', 'net');
    expect($('gi-ok').textContent).toContain('5 nätpunkter');
    expect($('gi-ok').textContent).toContain('1 linjer');

    pick('gi-lines', 'skip');
    expect($('gi-ok').textContent).toBe('✓ Importera 5 nätpunkter');

    pick('gi-target', 'visual');
    expect($('gi-ok').textContent).toBe('✓ Importera till nytt visuellt lager');
  });

  it('linjevalet har tre alternativ med visuella linjer förvalt', () => {
    const vals = [...box().querySelectorAll('input[name="gi-lines"]')].map(r => r.value);
    expect(vals).toEqual(['visual', 'obstacle', 'skip']);
    expect(box().querySelector('input[name="gi-lines"][value="visual"]').checked).toBe(true);
  });

  it('förhandsgranskningen visar de första raderna med ID, N, E och H', () => {
    expect(txt()).toContain('FÖRHANDSGRANSKNING');
    expect(txt()).toContain('6165575,707');   // N för första punkten, decimalkomma
    expect(txt()).toContain('sluten');        // linjen i Norr är sluten
  });

  it('dialogen rör inte projektet förrän Importera klickas', () => {
    pick('gi-target', 'net');
    pick('gi-lines', 'obstacle');
    expect(getState().pts).toEqual([]);
    expect(getState().visualLayers).toEqual([]);
    expect(getState().activeCRS).toBe('sweref99tm');
  });
});

describe('stängning', () => {
  it('Avbryt stänger utan att ändra något', () => {
    openGeoImport(NORR, 'f.geo');
    $('gi-cancel').click();
    expect(box()).toBeNull();
    expect(getState().visualLayers).toEqual([]);
  });

  it('Escape stänger', () => {
    openGeoImport(NORR, 'f.geo');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(box()).toBeNull();
  });

  it('en ny öppning ersätter den förra', () => {
    openGeoImport(NORR, 'a.geo');
    openGeoImport(PALL, 'b.geo');
    expect(document.querySelectorAll('#gi-box')).toHaveLength(1);
    expect(txt()).toContain('b.geo');
  });
});
