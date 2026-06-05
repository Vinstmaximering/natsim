import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, _resetForTest } from '../src/ui/studio-views/net-studio.js';
import { setState, getState } from '../src/state/store.js';

// Leaflet och draw behöver mockas – de körs inte i jsdom
vi.mock('../src/map/leaflet-setup.js', () => ({
  map: null,
  ENtoLatLng: vi.fn((E, N) => [N, E]),
  draw:   vi.fn(),
  resize: vi.fn(),
}));
vi.mock('../src/state/undo.js', () => ({ saveUndo: vi.fn() }));

// ── Testdata ─────────────────────────────────────────────────────────────────

const PTS = [
  { id:'FP1', type:'known',   E:100, N:200, H:10 },
  { id:'S1',  type:'station', E:150, N:250, H:12 },
  { id:'NY1', type:'new',     E:200, N:300, H:14 },
];
const MEAS = [
  { id:'M1', from:'S1', to:'FP1', obsType:'both', sigHz_mgon:0.3, sigDist_mm:1, numSatser:3 },
];

function makeContainers() {
  return {
    sidebar: document.createElement('div'),
    main:    document.createElement('div'),
    footer:  document.createElement('div'),
  };
}

beforeEach(() => {
  _resetForTest();  // återställ modul-scope _sort/_filter/_el
  setState({ pts: PTS, meas: MEAS, selId: null, simResult: null });
});

// ── Render-struktur ──────────────────────────────────────────────────────────

describe('net-studio render', () => {
  it('skapar tabell med class st-table', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.main.querySelector('table.st-table')).not.toBeNull();
  });

  it('visar rätt antal rader för punkterna', () => {
    const c = makeContainers();
    render(c, getState());
    const rows = c.main.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
  });

  it('visar kolumnerna ID, Typ, N, E, H, Mätningar', () => {
    const c = makeContainers();
    render(c, getState());
    const headers = [...c.main.querySelectorAll('thead th')].map(th => th.textContent.trim());
    expect(headers).toContain('ID');
    expect(headers).toContain('Typ');
    expect(headers).toContain('N (m)');
    expect(headers).toContain('E (m)');
    expect(headers).toContain('H (m)');
    expect(headers).toContain('Mätningar');
    // Fixerad ska EJ finnas
    expect(headers).not.toContain('Fixerad');
  });

  it('visar statistik-kort i sidopanelen', () => {
    const c = makeContainers();
    render(c, getState());
    const cards = c.sidebar.querySelectorAll('.studio-stat-card');
    expect(cards.length).toBeGreaterThanOrEqual(5);   // 5 typer
  });

  it('footer visar rätt antal', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.footer.textContent).toMatch(/3.*3/);    // "Visar 3 av 3 punkter"
  });
});

// ── Sortering ─────────────────────────────────────────────────────────────────

describe('net-studio sortering', () => {
  it('klick på N-kolumn sorterar raderna i N-ordning (asc)', () => {
    const c = makeContainers();
    render(c, getState());

    const nHeader = [...c.main.querySelectorAll('thead th')]
      .find(th => th.textContent.trim() === 'N (m)');
    nHeader.click();   // asc

    const cells = [...c.main.querySelectorAll('tbody tr td.editable-coord[data-coord="N"]')]
      .map(td => parseFloat(td.dataset.val));
    expect(cells).toEqual([...cells].sort((a, b) => a - b));
  });

  it('andra klick på samma kolumn byter till desc', () => {
    const c = makeContainers();
    render(c, getState());

    // Re-query efter varje klick – DOM ersätts vid omrendering
    const findN = () => [...c.main.querySelectorAll('thead th')]
      .find(th => th.textContent.trim() === 'N (m)');

    findN().click();   // → asc
    findN().click();   // → desc

    expect(findN().classList.contains('sort-desc')).toBe(true);
  });
});

// ── Filter ────────────────────────────────────────────────────────────────────

describe('net-studio filter', () => {
  it('avmarkerad typ-kryssruta döljer rader av den typen', () => {
    const c = makeContainers();
    render(c, getState());

    // Avmarkera "station" (type=station → S1)
    const stationCb = c.sidebar.querySelector('input[data-type="station"]');
    stationCb.checked = false;
    stationCb.dispatchEvent(new Event('change'));

    const ids = [...c.main.querySelectorAll('tbody tr td:first-child')]
      .map(td => td.textContent);
    expect(ids).not.toContain('S1');
    expect(ids).toContain('FP1');
  });

  it('söktextfält filtrerar rätt', () => {
    const c = makeContainers();
    render(c, getState());

    const inp = c.sidebar.querySelector('#ns-search');
    inp.value = 'FP';
    inp.dispatchEvent(new Event('input'));

    const ids = [...c.main.querySelectorAll('tbody tr td:first-child')]
      .map(td => td.textContent);
    expect(ids).toEqual(['FP1']);
  });
});
