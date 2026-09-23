// Etapp 1: RAPPORT-flikens innehåll flyttat till toppradens Rapport-meny.
//
// Tre slags tester:
//  1. Strukturkontrakt mot index.html – att posterna finns, i rätt grupper,
//     och att menyn ligger efter Visa.
//  2. reportItemBlocker() som ren funktion – vilken post som spärras av vad.
//  3. Beteende i jsdom – öppna/stänga, rätt window-funktion anropad, och att
//     en spärrad post varken går att klicka eller får fokus av piltangenterna.
//
// Att fliken är borta ur högerpanelen prövas sist, tillsammans med att
// renderTab() klarar det gamla flikvärdet utan att kasta.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initTopbar, closeTopbarMenus, isTopbarMenuOpen,
         reportItemBlocker, updateReportMenu, PM_MIN_WIDTH } from '../src/ui/topbar.js';
import { setState } from '../src/state/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const HTML = read('index.html');

const $ = id => document.getElementById(id);

// Alla poster i menyn, i den ordning de ska stå.
const POSTER = [
  ['pm',          'Mätningstekniskt PM…'],
  ['sim-pdf',     'Simuleringsrapport (PDF)'],
  ['sim-txt',     'Simuleringsrapport (.txt)'],
  ['calc-txt',    'Beräkningsrapport (.txt)'],
  ['rep-studio',  'Granska resultat i studioläge'],
  ['meas-book',   'Mätbok A4 (utskrift/PDF)'],
  ['meas-scheme', 'Mätschema (.txt)'],
];

// ── 1. Strukturkontrakt ─────────────────────────────────────────────────────

describe('index.html: Rapport-menyn', () => {
  const meny = HTML.slice(HTML.indexOf('id="mnu-rapport"'), HTML.indexOf('id="app-body"'));

  it('ligger efter Visa i toolbaren', () => {
    expect(HTML.indexOf('id="mnu-visa-btn"')).toBeLessThan(HTML.indexOf('id="mnu-rapport-btn"'));
    expect(HTML.indexOf('id="mnu-rapport-btn"')).toBeLessThan(HTML.indexOf('id="app-body"'));
  });

  it('byggd som Data- och Visa-menyerna', () => {
    const i = HTML.indexOf('id="mnu-rapport-btn"');
    const knapp = HTML.slice(HTML.lastIndexOf('<button', i), HTML.indexOf('id="mnu-rapport"'));
    expect(knapp).toContain('class="tbar-btn"');
    expect(knapp).toContain('aria-haspopup="true"');
    expect(knapp).toContain('aria-expanded="false"');
    expect(knapp).toContain('aria-controls="mnu-rapport"');
    expect(meny).toContain('role="menu"');
    expect(meny).toContain('hidden');
  });

  it('har de tre grupprubrikerna', () => {
    expect(meny).toContain('DOKUMENT');
    expect(meny).toContain('SIMULERING');
    expect(meny).toContain('FÄLTDOKUMENTATION');
  });

  it('har alla poster med rätt benämning och i rätt ordning', () => {
    let pos = -1;
    for (const [act, text] of POSTER) {
      const i = meny.indexOf(`data-act="${act}"`);
      expect(i, `posten ${act} saknas`).toBeGreaterThan(pos);
      pos = i;
      expect(meny).toContain(text);
    }
  });

  // Ctrl+E öppnar studioläget för den AKTIVA fliken. Eftersom 'rep' inte längre
  // kan vara aktiv flik når genvägen aldrig rapportstudion – posten får därför
  // inte utlova den.
  it('studioposten lovar inte Ctrl+E', () => {
    const post = meny.slice(meny.indexOf('data-act="rep-studio"'));
    expect(post.slice(0, 200)).not.toContain('Ctrl+E');
  });
});

// ── 2. Spärrlogiken som ren funktion ────────────────────────────────────────

describe('reportItemBlocker', () => {
  const bred = { simOk: true, measCount: 3, winWidth: 1200 };

  it('släpper igenom allt när nätet är simulerat, har mätningar och skärmen är bred', () => {
    for (const [act] of POSTER) expect(reportItemBlocker(act, bred), act).toBeNull();
  });

  it('utan simulering spärras PM, de tre simuleringsexporterna och studioläget', () => {
    const ctx = { ...bred, simOk: false };
    for (const act of ['pm', 'sim-pdf', 'sim-txt', 'calc-txt', 'rep-studio'])
      expect(reportItemBlocker(act, ctx), act).toBe('Kör simuleringen först');
  });

  it('utan mätningar spärras mätbok och mätschema – oavsett simulering', () => {
    for (const simOk of [true, false])
      for (const act of ['meas-book', 'meas-scheme'])
        expect(reportItemBlocker(act, { ...bred, simOk, measCount: 0 }), act)
          .toBe('Lägg till minst en mätning först');
  });

  it('fältdokumentationen kräver INTE simulering', () => {
    const ctx = { ...bred, simOk: false };
    expect(reportItemBlocker('meas-book', ctx)).toBeNull();
    expect(reportItemBlocker('meas-scheme', ctx)).toBeNull();
  });

  it('smal skärm spärrar bara PM-posten', () => {
    const smal = { ...bred, winWidth: PM_MIN_WIDTH - 1 };
    expect(reportItemBlocker('pm', smal)).toBe(`Kräver bredare skärm (minst ${PM_MIN_WIDTH} px)`);
    for (const act of ['sim-pdf', 'sim-txt', 'calc-txt', 'rep-studio', 'meas-book', 'meas-scheme'])
      expect(reportItemBlocker(act, smal), act).toBeNull();
  });

  it('exakt PM_MIN_WIDTH räcker', () => {
    expect(reportItemBlocker('pm', { ...bred, winWidth: PM_MIN_WIDTH })).toBeNull();
  });
});

// ── 3. Beteende i jsdom ─────────────────────────────────────────────────────

const SIM_OK = { ok: true, K_global: 0.6, redund: [], allPtResults: [] };

function monteraToolbar() {
  const doc = new DOMParser().parseFromString(HTML, 'text/html');
  document.body.innerHTML = '';
  document.body.appendChild(doc.getElementById('topbar'));
  initTopbar();
}

function settBredd(px) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
}

describe('Rapport-menyn i jsdom', () => {
  const ursprungligBredd = window.innerWidth;

  beforeEach(() => {
    closeTopbarMenus();
    settBredd(1200);
    setState({ simResult: SIM_OK, meas: [{ id: 'M1', from: 'A', to: 'B' }] });
    monteraToolbar();
  });

  afterEach(() => {
    settBredd(ursprungligBredd);
    setState({ simResult: null, meas: [] });
    for (const f of ['_openPM', '_exportSimPDF', '_exportRep', '_exportCalcRep',
                     '_openStudio', '_openMeasBook', '_exportMeasScheme'])
      delete window[f];
  });

  it('är stängd från början', () => {
    expect($('mnu-rapport').hidden).toBe(true);
    expect($('mnu-rapport-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('klick på knappen öppnar och stänger', () => {
    $('mnu-rapport-btn').click();
    expect($('mnu-rapport').hidden).toBe(false);
    expect($('mnu-rapport-btn').getAttribute('aria-expanded')).toBe('true');
    $('mnu-rapport-btn').click();
    expect($('mnu-rapport').hidden).toBe(true);
  });

  it('stänger de andra menyerna när den öppnas', () => {
    $('mnu-data-btn').click();
    $('mnu-rapport-btn').click();
    expect($('mnu-data').hidden).toBe(true);
    expect($('mnu-rapport').hidden).toBe(false);
  });

  it('Escape stänger och lämnar fokus på knappen', () => {
    $('mnu-rapport-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('mnu-rapport').hidden).toBe(true);
    expect(document.activeElement).toBe($('mnu-rapport-btn'));
  });

  it('klick utanför stänger', () => {
    $('mnu-rapport-btn').click();
    const utanför = document.createElement('div');
    document.body.appendChild(utanför);
    utanför.click();
    expect($('mnu-rapport').hidden).toBe(true);
  });

  it('Pil ned öppnar och fokuserar första posten', () => {
    $('mnu-rapport-btn').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect($('mnu-rapport').hidden).toBe(false);
    expect(document.activeElement.dataset.act).toBe('pm');
  });

  it('pilnavigeringen följer menyns ordning', () => {
    $('mnu-rapport-btn').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    for (const [act] of POSTER.slice(1)) {
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      expect(document.activeElement.dataset.act).toBe(act);
    }
  });

  // Varje post ska anropa exakt den funktion knappen i RAPPORT-fliken anropade.
  const FÖRVÄNTAT = {
    'pm':          '_openPM',
    'sim-pdf':     '_exportSimPDF',
    'sim-txt':     '_exportRep',
    'calc-txt':    '_exportCalcRep',
    'rep-studio':  '_openStudio',
    'meas-book':   '_openMeasBook',
    'meas-scheme': '_exportMeasScheme',
  };

  for (const [act, fn] of Object.entries(FÖRVÄNTAT)) {
    it(`posten ${act} anropar window.${fn} och stänger menyn`, () => {
      const spion = vi.fn();
      window[fn] = spion;
      $('mnu-rapport-btn').click();
      $('mnu-rapport').querySelector(`[data-act="${act}"]`).click();
      expect(spion).toHaveBeenCalledTimes(1);
      expect($('mnu-rapport').hidden).toBe(true);
      expect(isTopbarMenuOpen()).toBeNull();
    });
  }

  it('studioposten öppnar rapportstudion', () => {
    const spion = vi.fn();
    window._openStudio = spion;
    $('mnu-rapport-btn').click();
    $('mnu-rapport').querySelector('[data-act="rep-studio"]').click();
    expect(spion).toHaveBeenCalledWith('rep');
  });

  it('alla poster är valbara när förutsättningarna finns', () => {
    $('mnu-rapport-btn').click();
    const poster = [...$('mnu-rapport').querySelectorAll('.tbar-item')];
    expect(poster).toHaveLength(POSTER.length);
    expect(poster.every(b => !b.disabled)).toBe(true);
    expect(poster.every(b => !b.hasAttribute('title'))).toBe(true);
  });
});

describe('Rapport-menyns inaktiva val', () => {
  beforeEach(() => { closeTopbarMenus(); settBredd(1200); monteraToolbar(); });
  afterEach(() => { settBredd(1024); setState({ simResult: null, meas: [] }); });

  const post = act => $('mnu-rapport').querySelector(`[data-act="${act}"]`);

  it('utan simulering är simuleringsposterna inaktiva med skälet i title', () => {
    setState({ simResult: null, meas: [{ id: 'M1', from: 'A', to: 'B' }] });
    $('mnu-rapport-btn').click();
    for (const act of ['pm', 'sim-pdf', 'sim-txt', 'calc-txt', 'rep-studio']) {
      expect(post(act).disabled, act).toBe(true);
      expect(post(act).title, act).toBe('Kör simuleringen först');
    }
    expect(post('meas-book').disabled).toBe(false);
    expect(post('meas-scheme').disabled).toBe(false);
  });

  it('utan mätningar är mätbok och mätschema inaktiva', () => {
    setState({ simResult: SIM_OK, meas: [] });
    $('mnu-rapport-btn').click();
    for (const act of ['meas-book', 'meas-scheme']) {
      expect(post(act).disabled, act).toBe(true);
      expect(post(act).title, act).toBe('Lägg till minst en mätning först');
    }
  });

  it('på smal skärm är PM-posten inaktiv', () => {
    setState({ simResult: SIM_OK, meas: [{ id: 'M1', from: 'A', to: 'B' }] });
    settBredd(500);
    $('mnu-rapport-btn').click();
    expect(post('pm').disabled).toBe(true);
    expect(post('pm').title).toBe(`Kräver bredare skärm (minst ${PM_MIN_WIDTH} px)`);
  });

  it('en inaktiv post gör ingenting när den klickas', () => {
    setState({ simResult: null, meas: [] });
    const spion = vi.fn();
    window._exportRep = spion;
    $('mnu-rapport-btn').click();
    post('sim-txt').click();
    expect(spion).not.toHaveBeenCalled();
    expect($('mnu-rapport').hidden).toBe(false);
    delete window._exportRep;
  });

  it('inaktiva poster hoppas över av piltangenterna', () => {
    setState({ simResult: null, meas: [] });
    $('mnu-rapport-btn').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    // Allt är spärrat – då finns ingen post att fokusera och menyn öppnas ändå.
    expect($('mnu-rapport').hidden).toBe(false);
    expect(document.activeElement.dataset.act).toBeUndefined();
  });

  it('spärrarna räknas om vid varje öppning', () => {
    setState({ simResult: null, meas: [] });
    $('mnu-rapport-btn').click();
    expect(post('sim-txt').disabled).toBe(true);
    $('mnu-rapport-btn').click();               // stäng
    setState({ simResult: SIM_OK, meas: [{ id: 'M1', from: 'A', to: 'B' }] });
    $('mnu-rapport-btn').click();               // öppna igen
    expect(post('sim-txt').disabled).toBe(false);
    expect(post('sim-txt').hasAttribute('title')).toBe(false);
  });

  it('updateReportMenu utan monterad meny kastar inte', () => {
    document.body.innerHTML = '';
    expect(() => updateReportMenu()).not.toThrow();
  });
});

// ── 4. Fliken är borta ur högerpanelen ──────────────────────────────────────

describe('högerpanelen efter flytten', () => {
  it('TABS innehåller ingen RAPPORT-flik', async () => {
    const { buildTabs } = await import('../src/ui/right-panel.js');
    document.body.innerHTML = '<div id="tabs"></div>';
    setState({ atab: 'net' });
    buildTabs();
    const html = document.getElementById('tabs').innerHTML;
    expect(html).not.toContain('RAPPORT');
    expect(html).not.toContain("_setTab('rep')");
    expect(html).toContain('SIMULERING');
  });

  it('renderTab() med det gamla flikvärdet lämnar panelen tom utan att kasta', async () => {
    const { renderTab } = await import('../src/ui/right-panel.js');
    document.body.innerHTML = '<div id="tc"></div>';
    setState({ atab: 'rep', pts: [], meas: [], simResult: null });
    expect(() => renderTab()).not.toThrow();
    expect(document.getElementById('tc').innerHTML).toBe('');
  });

  // Rapport-studion nås numera bara via menyn, så vyn och flikvärdet måste
  // finnas kvar i studio-registret.
  it("'rep' är kvar i STUDIO_TABS", async () => {
    const { STUDIO_TABS } = await import('../src/ui/studio.js');
    expect(STUDIO_TABS.has('rep')).toBe(true);
  });

  it('main.js registrerar fortfarande rapportstudion', () => {
    expect(read('src/main.js')).toContain("initStudioForTab('rep'");
  });
});
