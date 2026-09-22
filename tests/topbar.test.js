// Etapp 4: toolbaren överst med Data- och Visa-menyerna.
//
// Två slags tester:
//  1. Strukturkontrakt mot index.html. Kryssrutorna och reglagen FLYTTADES –
//     de skrevs inte om – så varje id som leaflet-setup.js eller toolbar.js
//     läser måste finnas kvar, exakt en gång. Det är det testet som fångar om
//     en framtida flytt tappar bort en läsare.
//  2. Menyernas beteende i jsdom: öppna, stänga, aria-expanded, tangentbord.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initTopbar, closeTopbarMenus, isTopbarMenuOpen } from '../src/ui/topbar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const HTML = read('index.html');

// Varje id som läses ur DOM av någon modul, och var det läses.
// Listan är inventeringen från etapp 4 – växer den, ska den växa här också.
const LÄSTA_ID = {
  tgg:             ['(ingen läsare – se testet nedan)'],
  tgc:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tga:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tgd:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tgl:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tge:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tgs:             ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tgb:             ['src/map/leaflet-setup.js', 'src/ui/right-panel.js', 'src/ui/toolbar.js'],
  tv_known:        ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tv_station:      ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tv_new:          ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tv_detail:       ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  tv_simstation:   ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  'sym-size':      ['src/io/export-project.js', 'src/ui/toolbar.js'],
  'sym-val':       ['src/io/export-project.js', 'src/ui/toolbar.js'],
  'sym-lock':      ['src/map/leaflet-setup.js', 'src/ui/toolbar.js'],
  'ell-scale':     ['src/io/export-project.js', 'src/ui/toolbar.js'],
  'ell-val':       ['src/io/export-project.js', 'src/ui/toolbar.js'],
  'autosave-status': ['src/io/export-project.js', 'src/state/persistence.js'],
  'geo-fi':        ['src/main.js', 'src/ui/toolbar.js'],
  'dxf-fi':        ['src/ui/topbar.js', 'src/ui/toolbar.js'],
  'xl-fi':         ['src/ui/toolbar.js'],
  'load-fi':       ['src/ui/toolbar.js'],
  'app-name':      ['src/main.js'],
  'app-version':   ['src/main.js'],
};

describe('strukturkontrakt: flyttade id:n finns kvar', () => {
  it('varje id finns exakt en gång i index.html', () => {
    for (const id of Object.keys(LÄSTA_ID)) {
      const träffar = HTML.match(new RegExp(`id="${id}"`, 'g')) || [];
      expect(träffar.length, `${id} förekommer ${träffar.length} gånger`).toBe(1);
    }
  });

  it('varje utpekad läsare slår fortfarande upp sitt id', () => {
    for (const [id, filer] of Object.entries(LÄSTA_ID)) {
      for (const fil of filer) {
        if (fil.startsWith('(')) continue;
        expect(read(fil), `${fil} läser inte längre ${id}`).toContain(id);
      }
    }
  });

  // #tgg ("Rutnät") har ingen läsare i src/. Det gällde redan före Etapp 4 –
  // kryssrutan flyttades oförändrad. Testet dokumenterar tillståndet så att
  // det syns när rutnätet väl kopplas in.
  it('rutnätsrutan finns men saknar ännu läsare', () => {
    expect(HTML).toContain('id="tgg"');
  });
});

describe('index.html: toolbaren', () => {
  it('toolbaren ligger överst, före panelraden', () => {
    expect(HTML.indexOf('id="topbar"')).toBeGreaterThan(-1);
    expect(HTML.indexOf('id="topbar"')).toBeLessThan(HTML.indexOf('id="app-body"'));
    expect(HTML.indexOf('id="app-body"')).toBeLessThan(HTML.indexOf('id="lp"'));
  });

  it('har appnamn, version och autosave-status', () => {
    const bar = HTML.slice(HTML.indexOf('id="topbar"'), HTML.indexOf('id="app-body"'));
    expect(bar).toContain('id="app-name"');
    expect(bar).toContain('id="app-version"');
    expect(bar).toContain('id="autosave-status"');
  });

  it('Data-menyn har alla poster i rätt grupper', () => {
    const data = HTML.slice(HTML.indexOf('id="mnu-data"'), HTML.indexOf('id="mnu-visa-btn"'));
    expect(data).toContain('IMPORTERA');
    expect(data).toContain('Punkter och linjer (.geo)…');
    expect(data).toContain('DXF (.dxf)…');
    expect(data).toContain('Punkter (Excel/CSV)…');
    expect(data).toContain('Byggnader från OSM (aktuell vy)');
    expect(data).toContain('EXPORTERA');
    expect(data).toContain('Nätpunkter (.geo)');
    expect(data).toContain('PROJEKT');
    expect(data).toContain('Spara projekt');
    expect(data).toContain('Ctrl+S');
    expect(data).toContain('Ladda projekt…');
    expect(data).toContain('Visa Excel-mall');
  });

  it('Visa-menyn har båda kolumnerna och reglagen', () => {
    const visa = HTML.slice(HTML.indexOf('id="mnu-visa"'), HTML.indexOf('id="app-body"'));
    expect(visa).toContain('KARTINNEHÅLL');
    expect(visa).toContain('PUNKTTYPER');
    expect(visa).toContain('SYMBOLSTORLEK');
    expect(visa).toContain('FELELLIPSSKALA');
    // "Visuella objekt" utgick i Etapp 1 och ska inte ha följt med hit.
    expect(visa).not.toContain('id="tgv"');
  });
});

describe('index.html: vänsterpanelen är rensad', () => {
  const lp = HTML.slice(HTML.indexOf('id="lp"'), HTML.indexOf('id="lrh"'));

  it('har inte kvar VISA, SYMBOLSTORLEK eller FELELLIPSSKALA', () => {
    const utanKommentarer = lp.replace(/<!--[\s\S]*?-->/g, '');
    expect(utanKommentarer).not.toContain('SYMBOLSTORLEK');
    expect(utanKommentarer).not.toContain('FELELLIPSSKALA');
    expect(utanKommentarer).not.toMatch(/<div class="sl">VISA<\/div>/);
    expect(utanKommentarer).not.toContain('PUNKTTYPER');
  });

  it('har inte kvar import-, export- eller projektknapparna', () => {
    const utanKommentarer = lp.replace(/<!--[\s\S]*?-->/g, '');
    expect(utanKommentarer).not.toContain('Importera punkter');
    expect(utanKommentarer).not.toContain('Exportera punkter');
    expect(utanKommentarer).not.toContain('Spara projekt');
    expect(utanKommentarer).not.toContain('Ladda projekt');
    expect(utanKommentarer).not.toContain('Visa Excel-mall');
  });

  it('behåller LÄGG TILL, KOORDINATSYSTEM, PUNKTER, Rensa allt och Ångra', () => {
    expect(lp).toContain('LÄGG TILL PUNKT');
    expect(lp).toContain('KOORDINATSYSTEM');
    expect(lp).toContain('id="pth"');
    expect(lp).toContain('Rensa allt');
    expect(lp).toContain('id="btn-undo"');
  });
});

// ── Beteende ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function monteraToolbar() {
  const doc = new DOMParser().parseFromString(HTML, 'text/html');
  document.body.innerHTML = '';
  document.body.appendChild(doc.getElementById('topbar'));
  initTopbar();
}

describe('menyernas beteende', () => {
  beforeEach(() => { closeTopbarMenus(); monteraToolbar(); });

  it('menyerna är stängda från början med aria-expanded false', () => {
    expect($('mnu-data').hidden).toBe(true);
    expect($('mnu-visa').hidden).toBe(true);
    expect($('mnu-data-btn').getAttribute('aria-expanded')).toBe('false');
    expect($('mnu-visa-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('klick på knappen öppnar och stänger', () => {
    $('mnu-data-btn').click();
    expect($('mnu-data').hidden).toBe(false);
    expect($('mnu-data-btn').getAttribute('aria-expanded')).toBe('true');
    $('mnu-data-btn').click();
    expect($('mnu-data').hidden).toBe(true);
    expect($('mnu-data-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('bara en meny åt gången är öppen', () => {
    $('mnu-data-btn').click();
    $('mnu-visa-btn').click();
    expect($('mnu-data').hidden).toBe(true);
    expect($('mnu-visa').hidden).toBe(false);
    expect($('mnu-data-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('klick utanför stänger', () => {
    $('mnu-data-btn').click();
    const utanför = document.createElement('div');
    document.body.appendChild(utanför);
    utanför.click();
    expect($('mnu-data').hidden).toBe(true);
  });

  it('Escape stänger och lämnar fokus på knappen', () => {
    $('mnu-visa-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('mnu-visa').hidden).toBe(true);
    expect(document.activeElement).toBe($('mnu-visa-btn'));
  });

  it('val av menypost stänger Data-menyn', () => {
    $('mnu-data-btn').click();
    // Fil-inputen ligger i toolbaren; klicket på posten når den via ACTIONS.
    $('mnu-data').querySelector('[data-act="import-geo"]').click();
    expect($('mnu-data').hidden).toBe(true);
    expect(isTopbarMenuOpen()).toBeNull();
  });

  // DXF-posten låg avstängd i Etapp 4 och aktiverades i Etapp 6, när parsern
  // och dialogen fanns. Alla poster i Data-menyn är nu valbara.
  it('alla poster i Data-menyn är valbara', () => {
    $('mnu-data-btn').click();
    const poster = [...$('mnu-data').querySelectorAll('.tbar-item')];
    expect(poster.length).toBeGreaterThan(0);
    expect(poster.every(b => !b.disabled)).toBe(true);
  });

  it('Visa-menyn stängs INTE när en kryssruta bockas', () => {
    $('mnu-visa-btn').click();
    $('tgl').click();
    expect($('mnu-visa').hidden).toBe(false);
  });
});

describe('tangentbord', () => {
  beforeEach(() => { closeTopbarMenus(); monteraToolbar(); });

  const key = (el, k) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  it('Pil ned på knappen öppnar och fokuserar första posten', () => {
    key($('mnu-data-btn'), 'ArrowDown');
    expect($('mnu-data').hidden).toBe(false);
    expect(document.activeElement).toBe($('mnu-data').querySelector('[data-act="import-geo"]'));
  });

  it('Enter öppnar menyn', () => {
    key($('mnu-data-btn'), 'Enter');
    expect($('mnu-data').hidden).toBe(false);
  });

  it('Pil upp på knappen öppnar och går till sista posten', () => {
    key($('mnu-data-btn'), 'ArrowUp');
    expect(document.activeElement).toBe($('mnu-data').querySelector('[data-act="template"]'));
  });

  it('pilarna vandrar i menyn och går runt', () => {
    key($('mnu-data-btn'), 'ArrowDown');
    const poster = [...$('mnu-data').querySelectorAll('button:not([disabled])')];
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(poster[1]);
    key(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(poster[0]);
    key(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(poster.at(-1));
  });

  it('Home och End hoppar till ändarna', () => {
    key($('mnu-data-btn'), 'ArrowDown');
    const poster = [...$('mnu-data').querySelectorAll('button:not([disabled])')];
    key(document.activeElement, 'End');
    expect(document.activeElement).toBe(poster.at(-1));
    key(document.activeElement, 'Home');
    expect(document.activeElement).toBe(poster[0]);
  });

  it('Pil höger byter till nästa meny', () => {
    $('mnu-data-btn').click();
    key($('mnu-data-btn'), 'ArrowRight');
    expect(document.activeElement).toBe($('mnu-visa-btn'));
    expect($('mnu-visa').hidden).toBe(false);
    expect($('mnu-data').hidden).toBe(true);
  });

  it('pilnavigeringen följer menyns ordning', () => {
    key($('mnu-data-btn'), 'ArrowDown');
    expect(document.activeElement.dataset.act).toBe('import-geo');
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement.dataset.act).toBe('import-dxf');
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement.dataset.act).toBe('import-xl');
  });
});
