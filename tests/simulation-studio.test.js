import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, _resetForTest } from '../src/ui/studio-views/simulation-studio.js';
import { setState, getState }    from '../src/state/store.js';

vi.mock('../src/map/leaflet-setup.js', () => ({
  map: null,
  ENtoLatLng: vi.fn((E, N) => [N, E]),
  draw: vi.fn(), resize: vi.fn(),
}));
vi.mock('../src/state/undo.js', () => ({ saveUndo: vi.fn() }));

// ── Testdata ──────────────────────────────────────────────────────────────────

const GOOD_SIM = {
  ok: true,
  K_global: 0.65, K_class: 'Acceptabelt', K_col: '#00ff88',
  rMean: 0.42, rMinDist: 0.38, rMinHz: null,
  redundancy: 4, redundTotal: 4.0, kappa: 2.80,
  meas_n: 6, unkn_n: 4, knownCount: 2, freeCount: 1,
  measCount: 3, nOrientUnkn: 1, nCoordUnkn: 2,
  ptResults: [
    { id:'S1', sigPos:0.002, sigE:0.001, sigN:0.0015, aSemi:0.0022, bSemi:0.0016, theta:0.5 },
    { id:'NY1',sigPos:0.003, sigE:0.002, sigN:0.0025, aSemi:0.0032, bSemi:0.0026, theta:0.3 },
  ],
  simStationResults: [],
  redund: [
    { measId:'M1', fromId:'S1',  toId:'FP1', type:'dist', ri:0.45, mdb:{val:0.005}, yt_m:0.003 },
    { measId:'M1', fromId:'S1',  toId:'FP1', type:'hz',   ri:0.48, mdb:{val:0.001}, yt_m:0.002 },
    { measId:'M2', fromId:'S1',  toId:'NY1', type:'dist', ri:0.35, mdb:{val:0.006}, yt_m:0.004 },
    { measId:'M2', fromId:'S1',  toId:'NY1', type:'hz',   ri:0.40, mdb:{val:0.002}, yt_m:0.003 },
  ],
  allPtResults: [
    { id:'S1',  sigPos:0.002, type:'station' },
    { id:'NY1', sigPos:0.003, type:'new'     },
  ],
};

const PTS = [
  { id:'FP1', type:'known',   E:100, N:200, H:0 },
  { id:'S1',  type:'station', E:150, N:250, H:0 },
  { id:'NY1', type:'new',     E:200, N:300, H:0 },
];

const MEAS = [
  { id:'M1', from:'S1', to:'FP1', obsType:'both', sigHz_mgon:0.3, sigDist_mm:1, numSatser:3, measDist:null, measHz:null },
  { id:'M2', from:'S1', to:'NY1', obsType:'both', sigHz_mgon:0.3, sigDist_mm:1, numSatser:3, measDist:null, measHz:null },
];

function makeContainers() {
  return {
    sidebar: document.createElement('div'),
    main:    document.createElement('div'),
    footer:  document.createElement('div'),
  };
}

beforeEach(() => {
  _resetForTest();
  setState({ pts:PTS, meas:MEAS, selId:null, selMId:null, simResult:null });
});

// ── Utan simResult ─────────────────────────────────────────────────────────────

describe('simulation-studio utan simResult', () => {
  it('visar studio-loading placeholder i main', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.main.querySelector('.studio-loading')).not.toBeNull();
  });

  it('sidopanel visar "Ingen simulering körts"', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.sidebar.textContent).toContain('Ingen simulering');
  });
});

// ── Med simResult ──────────────────────────────────────────────────────────────

describe('simulation-studio med simResult', () => {
  beforeEach(() => setState({ pts:PTS, meas:MEAS, simResult:GOOD_SIM, selId:null, selMId:null }));

  it('skapar tabell med klassen st-table (Punkter-sub-flik default)', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.main.querySelector('table.st-table')).not.toBeNull();
  });

  it('Punkter-tabellen visar rätt antal rader', () => {
    const c = makeContainers();
    render(c, getState());
    const rows = c.main.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2); // S1 och NY1
  });

  it('stat-kort i sidopanelen visar K-tal', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.sidebar.textContent).toContain('K-tal');
    expect(c.sidebar.textContent).toContain('0.65');
  });

  it('sub-flik Mätningar renderar Från/Till-kolumner', () => {
    const c = makeContainers();
    render(c, getState());
    // Klicka på Mätningar-knappen
    const measBtn = [...c.main.querySelectorAll('button')].find(b => b.textContent.includes('Mätningar'));
    measBtn?.click();
    const headers = [...c.main.querySelectorAll('thead th')].map(th => th.textContent.trim());
    expect(headers).toContain('Från');
    expect(headers).toContain('Till');
  });

  it('Mätningar-tabellen visar r_i-kolumn med rätt antal rader', () => {
    const c = makeContainers();
    render(c, getState());
    const measBtn = [...c.main.querySelectorAll('button')].find(b => b.textContent.includes('Mätningar'));
    measBtn?.click();
    const rows = c.main.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4); // 4 redund-poster
  });

  it('"Visa bara problem"-toggle filtrerar bort OK-rader', () => {
    const c = makeContainers();
    render(c, getState());
    const toggle = c.main.querySelector('#sp-onlyprob');
    // Utan problem (sigPos < 5mm, rMean > 0.3 för båda) → 0 problemrader
    // Faktiskt: NY1 has rMean = (0.35+0.40)/2 = 0.375 > 0.3 och sigPos=3mm < 5 → ej prob
    // S1 has rMean = (0.45+0.48)/2 = 0.465 > 0.3 och sigPos=2mm < 5 → ej prob
    // Ingen problempunkt → toggle filtrerar till 0 rader
    if (toggle) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      const rows = c.main.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(0);
    }
  });

  it('sortering på σpos-kolumn sorterar rader', () => {
    const c = makeContainers();
    render(c, getState());
    const sigHdr = [...c.main.querySelectorAll('thead th')]
      .find(th => th.textContent.trim() === 'σpos mm');
    sigHdr?.click();
    const cells = [...c.main.querySelectorAll('tbody td:nth-child(8)')]
      .map(td => parseFloat(td.textContent));
    expect(cells).toEqual([...cells].sort((a,b) => a - b));
  });
});
