// DOM-tester för panelernas storleksjusterings-handtag.
// Låser fast att initResize återanvänder de statiska handtagen i index.html
// (#lrh / #rrh) i stället för att skapa nya – tidigare fanns TVÅ .resize-handle
// per sida, varav det statiska var dött (saknade pointer-lyssnare).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initResize, MIN_W, MAX_W } from '../src/ui/panel-resize.js';

// draw() rör Leaflet och körs inte i jsdom
vi.mock('../src/map/leaflet-setup.js', () => ({ draw: vi.fn() }));

// jsdom saknar pointer-capture-API:t
beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

// Speglar strukturen i index.html: lp, lrh, cw, rp, rrh
function buildApp() {
  document.body.innerHTML = `
    <div id="app">
      <div id="lp"></div>
      <div class="resize-handle" id="lrh" title="Dra för att ändra bredd"></div>
      <div id="cw"></div>
      <div id="rp"></div>
      <div class="resize-handle" id="rrh" title="Dra för att ändra bredd"></div>
    </div>`;
}

// jsdom saknar layout – offsetWidth är alltid 0, så vi stubbar startbredden
function stubWidth(el, px) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => px });
}

// MouseEvent bär clientX och räcker som pointer-event i jsdom
function pointer(type, clientX) {
  return new MouseEvent(type, { clientX, bubbles: true, cancelable: true });
}

beforeEach(() => {
  localStorage.clear();
  buildApp();
});

describe('initResize – exakt ett handtag per sida', () => {
  it('skapar inga extra handtag utan återanvänder lrh/rrh', () => {
    initResize('lp', 'right');
    initResize('rp', 'left');
    expect(document.querySelectorAll('.resize-handle')).toHaveLength(2);
    expect(document.getElementById('lrh')).not.toBeNull();
    expect(document.getElementById('rrh')).not.toBeNull();
  });

  it('behåller tooltipen på de kvarvarande handtagen', () => {
    initResize('lp', 'right');
    initResize('rp', 'left');
    expect(document.getElementById('lrh').title).toBe('Dra för att ändra bredd');
    expect(document.getElementById('rrh').title).toBe('Dra för att ändra bredd');
  });
});

describe('initResize – handtaget bär pointer-lyssnaren', () => {
  it('lrh drar vänsterpanelen bredare', () => {
    const lp = document.getElementById('lp');
    stubWidth(lp, 310);
    initResize('lp', 'right');

    const h = document.getElementById('lrh');
    h.dispatchEvent(pointer('pointerdown', 310));
    h.dispatchEvent(pointer('pointermove', 360));

    expect(lp.style.width).toBe('360px');
  });

  it('rrh drar högerpanelen bredare (inverterad riktning)', () => {
    const rp = document.getElementById('rp');
    stubWidth(rp, 380);
    initResize('rp', 'left');

    const h = document.getElementById('rrh');
    h.dispatchEvent(pointer('pointerdown', 900));
    h.dispatchEvent(pointer('pointermove', 850));

    expect(rp.style.width).toBe('430px');
  });

  it('klampar bredden till MIN_W och MAX_W', () => {
    const lp = document.getElementById('lp');
    stubWidth(lp, 310);
    initResize('lp', 'right');

    const h = document.getElementById('lrh');
    h.dispatchEvent(pointer('pointerdown', 310));
    h.dispatchEvent(pointer('pointermove', 3000));
    expect(lp.style.width).toBe(MAX_W + 'px');

    h.dispatchEvent(pointer('pointermove', -3000));
    expect(lp.style.width).toBe(MIN_W + 'px');
  });

  it('sparar bredden i localStorage vid pointerup', () => {
    const lp = document.getElementById('lp');
    stubWidth(lp, 310);
    initResize('lp', 'right');

    const h = document.getElementById('lrh');
    h.dispatchEvent(pointer('pointerdown', 310));
    h.dispatchEvent(pointer('pointermove', 360));
    stubWidth(lp, 360);
    h.dispatchEvent(pointer('pointerup', 360));

    expect(localStorage.getItem('lp_width')).toBe('360');
  });

  it('läser tillbaka sparad bredd vid nästa init', () => {
    localStorage.setItem('lp_width', '420');
    initResize('lp', 'right');
    expect(document.getElementById('lp').style.width).toBe('420px');
  });
});

describe('initResize – hidden-synkronisering', () => {
  it('döljer handtaget när panelen redan är infälld', () => {
    document.getElementById('lp').classList.add('hidden');
    initResize('lp', 'right');
    expect(document.getElementById('lrh').style.display).toBe('none');
  });

  it('döljer och visar handtaget när panelen fälls in/ut', async () => {
    initResize('lp', 'right');
    const lp = document.getElementById('lp');
    const h  = document.getElementById('lrh');

    lp.classList.add('hidden');
    await Promise.resolve();          // MutationObserver är mikrotask-baserad
    expect(h.style.display).toBe('none');

    lp.classList.remove('hidden');
    await Promise.resolve();
    expect(h.style.display).toBe('');
  });
});
