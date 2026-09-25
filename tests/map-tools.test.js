// Lager-verktyg Etapp 2: verktygsraden på kartan.
// – markup: plats i kartytan (inte i högerpanelen), ordning, symboler med
//   title/aria-label som anger kortkommandot
// – valt verktyg markeras; samma verktyg igen återgår till Panorera
// – kortkommandon P/L, och när de inte ska slå till
// – S är en växlare för snappningen (Etapp 5)
// – telefon: de visuella verktygen finns i den mobila raden (#mtb)
// – hjälptexten står under verktygsraden

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../src/map/leaflet-setup.js', () => ({
  draw: vi.fn(), resize: vi.fn(), toggleMapLayer: vi.fn(), map: null,
  ENtoLatLng: vi.fn(), latLngToEN: vi.fn(),
}));

const { initMapTools, bindMapToolButtons, shortcutAllowed, toolForKey } = await import('../src/ui/map-tools.js');
const { buildTools, setTool, MAP_TOOLS } = await import('../src/ui/toolbar.js');
const { getState, setState } = await import('../src/state/store.js');
const { getVisualDrawMode } = await import('../src/map/visual-drawing.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');
const CSS  = readFileSync(join(root, 'src/styles/map.css'), 'utf8')
           + readFileSync(join(root, 'src/styles/responsive.css'), 'utf8');
const $ = id => document.getElementById(id);

// Montera kartytan (#cw) ur index.html, plus det som genvägarna tittar på.
let mounted = false;
function mount() {
  const doc = new DOMParser().parseFromString(HTML, 'text/html');
  document.body.innerHTML = '';
  const app = document.createElement('div');
  app.id = 'app';
  app.appendChild(doc.getElementById('cw'));
  document.body.appendChild(app);
  for (const id of ['modal', 'coordview']) document.body.appendChild(doc.getElementById(id));
  const inp = document.createElement('input');
  inp.id = 'fält';
  document.body.appendChild(inp);
  // Tangentlyssnaren sitter på document och registreras en gång; knapparnas
  // lyssnare sitter på #map-tools, som byts vid varje mount.
  if (!mounted) { initMapTools(); mounted = true; }
  else bindMapToolButtons();
}

const key = (k, opts = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

beforeEach(() => {
  setState({ tool: 'pan', measFrom: null, pts: [], meas: [] });
  mount();
  setTool('pan');
});

describe('markup', () => {
  const cw = HTML.slice(HTML.indexOf('id="cw"'), HTML.indexOf('id="rrh"'));
  const bar = HTML.slice(HTML.indexOf('id="map-tools"'), HTML.indexOf('id="hint"'));

  it('ligger i kartytan, inte i högerpanelen', () => {
    expect(cw).toContain('id="map-tools"');
    const rp = HTML.slice(HTML.indexOf('id="rp"'));
    expect(rp).not.toContain('id="map-tools"');
  });

  // Polylinjer Etapp 2: mätverktyget D står bredvid Markera område.
  it('har knapparna i ordning med avgränsare: M D | P L Y | S', () => {
    const ids = [...bar.matchAll(/id="(btn-[a-z-]+)"|class="(mt-sep)"/g)].map(m => m[1] || m[2]);
    expect(ids).toEqual(['btn-select-area', 'btn-measure-dist', 'mt-sep', 'btn-visual-point', 'btn-visual-line',
      'btn-visual-area', 'mt-sep', 'btn-snap']);
  });

  it('bara symboler: varje knapp har svg, title och aria-label med kortkommandot', () => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    const knappar = [...doc.querySelectorAll('#map-tools button')];
    expect(knappar).toHaveLength(6);
    const tangent = { 'btn-select-area': 'M', 'btn-measure-dist': 'D', 'btn-visual-point': 'P', 'btn-visual-line': 'L',
                      'btn-visual-area': 'Y', 'btn-snap': 'S' };
    for (const b of knappar) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.textContent.trim()).toBe('');
      expect(b.title).toContain(`(${tangent[b.id]})`);
      expect(b.getAttribute('aria-label')).toContain(`(${tangent[b.id]})`);
    }
  });

  // Ändrat i Etapp 3–5: alla knappar finns nu.
  it('alla knappar är aktiva', () => {
    for (const id of ['btn-select-area', 'btn-visual-point', 'btn-visual-line', 'btn-visual-area', 'btn-snap'])
      expect($(id).disabled).toBe(false);
  });

  it('hjälptexten står direkt under verktygsraden, i samma högerkolumn', () => {
    const col = $('map-tools').parentElement;
    expect(col.classList.contains('map-top-right')).toBe(true);
    expect($('map-tools').nextElementSibling).toBe($('hint'));
  });

  it('kartkontrollerna och verktygsraden delar överkanten utan att överlappa', () => {
    expect($('lm-ctrl').parentElement).toBe($('map-tools').parentElement.parentElement);
    expect(CSS).toMatch(/\.map-top\s*\{[^}]*display:flex/);
    expect(CSS).toMatch(/\.map-top\s*\{[^}]*right:52px/);   // plats åt .zb och nordpilen
  });

  it('telefon: raden döljs', () => {
    expect(CSS).toMatch(/@media \(max-width: 767px\)[\s\S]*\.map-tools \{ display: none; \}/);
  });
});

describe('val av verktyg', () => {
  it('klick väljer verktyget, startar ritläget och markerar knappen', () => {
    $('btn-visual-point').click();
    expect(getState().tool).toBe('visual-point');
    expect(getVisualDrawMode()).toBe('point');
    expect($('btn-visual-point').classList.contains('act')).toBe(true);
    expect($('btn-visual-point').getAttribute('aria-pressed')).toBe('true');
    expect($('btn-visual-line').getAttribute('aria-pressed')).toBe('false');
  });

  it('klick på valt verktyg återgår till Panorera', () => {
    $('btn-visual-line').click();
    $('btn-visual-line').click();
    expect(getState().tool).toBe('pan');
    expect(getVisualDrawMode()).toBe('idle');
    expect($('btn-visual-line').getAttribute('aria-pressed')).toBe('false');
  });

  it('hjälptexten följer aktivt verktyg', () => {
    $('btn-visual-line').click();
    expect($('hint').textContent).toContain('visuell linje');
    expect($('hint').textContent).toContain('Esc');
  });

  // Ändrat i Etapp 5: snappknappen är en växlare, inget verktyg.
  it('snappknappen byter inte verktyg', () => {
    $('btn-snap').click();
    expect(getState().tool).toBe('pan');
    $('btn-snap').click();
  });
});

describe('kortkommandon', () => {
  it('P och L väljer verktyg, samma tangent igen slår av', () => {
    key('p');
    expect(getState().tool).toBe('visual-point');
    key('l');
    expect(getState().tool).toBe('visual-line');
    key('L');   // Caps Lock
    expect(getState().tool).toBe('pan');
  });

  // Ändrat i Etapp 3 och 4: Y väljer Yta, M väljer Markera område.
  // Ändrat i Etapp 5: S slår av och på snappningen.
  it('S växlar snappningen och byter inte verktyg', () => {
    const på = $('btn-snap').getAttribute('aria-pressed');
    key('s');
    expect(getState().tool).toBe('pan');
    expect($('btn-snap').getAttribute('aria-pressed')).not.toBe(på);
    key('s');
    expect($('btn-snap').getAttribute('aria-pressed')).toBe(på);
  });

  it('M väljer Markera område', () => {
    key('m');
    expect(getState().tool).toBe('select-area');
    expect($('btn-select-area').getAttribute('aria-pressed')).toBe('true');
    key('m');
    expect(getState().tool).toBe('pan');
  });

  it('Y väljer Yta och startar ytläget', () => {
    key('y');
    expect(getState().tool).toBe('visual-area');
    expect(getVisualDrawMode()).toBe('area');
    expect($('btn-visual-area').getAttribute('aria-pressed')).toBe('true');
  });

  it('inte med Ctrl, Alt, Cmd eller Skift', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) key('p', { [mod]: true });
    expect(getState().tool).toBe('pan');
  });

  it('inte när man skriver i ett fält', () => {
    $('fält').focus();
    key('p');
    expect(getState().tool).toBe('pan');
    $('fält').blur();
  });

  it('inte när en dialog är öppen', () => {
    $('modal').style.display = 'flex';
    key('p');
    expect(getState().tool).toBe('pan');
    $('modal').style.display = 'none';
    key('p');
    expect(getState().tool).toBe('visual-point');
  });

  it('inte i studioläget eller koordinatlistan', () => {
    $('app').classList.add('studio-active');
    key('p');
    expect(getState().tool).toBe('pan');
    $('app').classList.remove('studio-active');
    $('coordview').style.display = 'flex';
    key('p');
    expect(getState().tool).toBe('pan');
    $('coordview').style.display = 'none';
  });

  it('upprepad tangent (hålls nedtryckt) byter inte fram och tillbaka', () => {
    key('p');
    key('p', { repeat: true });
    expect(getState().tool).toBe('visual-point');
  });

  it('Esc avbryter ritläget (befintlig hantering i interactions.js)', () => {
    const src = readFileSync(join(root, 'src/map/interactions.js'), 'utf8');
    // Etapp 3: en påbörjad yta kastas först (hasPendingArea), sedan lämnas läget.
    expect(src).toMatch(/e\.key === 'Escape'[\s\S]{0,300}isDrawingVisual\(\)[\s\S]{0,40}cancelVisualDraw\(\)/);
  });

  it('toolForKey och shortcutAllowed som rena hjälpare', () => {
    expect(toolForKey('P').tool).toBe('visual-point');
    expect(toolForKey('x')).toBeNull();
    expect(shortcutAllowed({ key: 'p' })).toBe(true);
    expect(shortcutAllowed({ key: 'p', ctrlKey: true })).toBe(false);
  });

  it('ingen bokstav krockar med ett befintligt kortkommando utan modifierare', () => {
    // De befintliga genvägarna är Ctrl+S, Ctrl+Z och Ctrl+E. Här vaktas att
    // ingen annan modul börjar lyssna på en av verktygsbokstäverna utan
    // modifierare.
    const filer = ['src/ui/topbar.js', 'src/ui/left-panel.js', 'src/ui/studio.js', 'src/map/interactions.js'];
    for (const f of filer) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const k of ['m', 'p', 'l', 'y', 's']) {
        const träffar = [...src.matchAll(new RegExp(`e\\.key === ['"]${k}['"]`, 'gi'))];
        for (const t of träffar) {
          const före = src.slice(Math.max(0, t.index - 60), t.index);
          expect(före, `${f}: ${k}`).toMatch(/ctrlKey|metaKey/);
        }
      }
    }
  });
});

describe('telefon: den mobila verktygsraden', () => {
  it('har visuell punkt och linje, markerade när de är valda', () => {
    const mtb = $('mtb');
    buildTools();
    const knappar = [...mtb.querySelectorAll('button')];
    for (const t of MAP_TOOLS) {
      expect(knappar.some(b => b.getAttribute('onclick')?.includes(`'${t.tool}'`))).toBe(true);
    }
    setTool('visual-line');
    const linje = [...$('mtb').querySelectorAll('button')].find(b => b.getAttribute('onclick')?.includes("'visual-line'"));
    expect(linje.classList.contains('act')).toBe(true);
  });

  it('raden bryter inte längre till en andra rad bakom kartkontrollerna', () => {
    expect(CSS).toMatch(/\.mtb \{ display: flex !important; flex-wrap: nowrap;/);
  });
});
