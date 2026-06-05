import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render } from '../src/ui/studio-views/report-studio.js';
import { setState, getState } from '../src/state/store.js';

vi.mock('../src/map/leaflet-setup.js', () => ({
  map: null, ENtoLatLng: vi.fn(), draw: vi.fn(), resize: vi.fn(),
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
  ],
  simStationResults: [],
  redund: [
    { measId:'M1', fromId:'S1', toId:'FP1', type:'dist', ri:0.45, mdb:{val:0.005}, yt_m:0.003 },
    { measId:'M1', fromId:'S1', toId:'FP1', type:'hz',   ri:0.48, mdb:{val:0.001}, yt_m:0.002 },
  ],
  allPtResults: [{ id:'S1', sigPos:0.002, type:'station' }],
};

const PTS = [
  { id:'FP1', type:'known',   E:100, N:200, H:0 },
  { id:'S1',  type:'station', E:150, N:250, H:0 },
];

function makeContainers() {
  return {
    sidebar: document.createElement('div'),
    main:    document.createElement('div'),
    footer:  document.createElement('div'),
  };
}

beforeEach(() => {
  setState({ pts:PTS, meas:[], simResult:null, ellipsMode:'1sig', sigReq:3 });
});

// ── Utan simResult ─────────────────────────────────────────────────────────────

describe('report-studio utan simResult', () => {
  it('visar placeholder-meddelande i main', () => {
    const c = makeContainers();
    render(c, getState());
    expect(c.main.querySelector('.studio-loading')).not.toBeNull();
    expect(c.main.textContent).toContain('simulering');
  });

  it('sidopanel visar sektionslänkar oavsett om sim finns', () => {
    const c = makeContainers();
    render(c, getState());
    const links = c.sidebar.querySelectorAll('.rs-nav-link');
    expect(links.length).toBeGreaterThanOrEqual(5);
  });
});

// ── Med simResult ──────────────────────────────────────────────────────────────

describe('report-studio med simResult', () => {
  beforeEach(() => setState({ pts:PTS, meas:[], simResult:GOOD_SIM, ellipsMode:'1sig', sigReq:3 }));

  it('renderar minst 5 sektioner med klassen rs-section', () => {
    const c = makeContainers();
    render(c, getState());
    const sections = c.main.querySelectorAll('.rs-section');
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('varje sektion har en kopiera-knapp (.rs-copy-btn)', () => {
    const c = makeContainers();
    render(c, getState());
    const copyBtns = c.main.querySelectorAll('.rs-copy-btn');
    expect(copyBtns.length).toBeGreaterThanOrEqual(5);
  });

  it('kopiera-knapp anropar navigator.clipboard.writeText', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const c = makeContainers();
    render(c, getState());
    document.body.appendChild(c.main); // behövs för innerText
    const btn = c.main.querySelector('.rs-copy-btn');
    await btn?.click();
    // Ger lite tid för async clipboard-anrop
    await new Promise(r => setTimeout(r, 10));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    document.body.removeChild(c.main);
    vi.unstubAllGlobals();
  });

  it('sektionslänk-klick anropar scrollIntoView på rätt element', () => {
    const c = makeContainers();
    render(c, getState());
    // Sätt upp en scroll-spy på sektions-element
    const sec1 = c.main.querySelector('#rs-1');
    if (sec1) {
      const spy = vi.fn();
      sec1.scrollIntoView = spy;
      const link = c.sidebar.querySelector('[data-target="rs-1"]');
      link?.click();
      expect(spy).toHaveBeenCalledWith({ behavior:'smooth', block:'start' });
    }
  });
});
