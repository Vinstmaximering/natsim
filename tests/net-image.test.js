// Tester för src/reports/net-image.js
// Canvas-rendering körs i jsdom med mock-context eftersom jsdom
// inte implementerar HTMLCanvasElement.getContext('2d').

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateNetImage } from '../src/reports/net-image.js';
import { setState } from '../src/state/store.js';

// ── Canvas-mock-infrastruktur ──────────────────────────────────────────────────

function makeMockCtx() {
  return {
    fillStyle:   '',
    strokeStyle: '',
    lineWidth:   1,
    font:        '',
    textAlign:   '',
    fillRect:    vi.fn(),
    beginPath:   vi.fn(),
    moveTo:      vi.fn(),
    lineTo:      vi.fn(),
    arc:         vi.fn(),
    fill:        vi.fn(),
    stroke:      vi.fn(),
    fillText:    vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    drawImage:   vi.fn(),
    save:        vi.fn(),
    restore:     vi.fn(),
    translate:   vi.fn(),
    rotate:      vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    closePath:   vi.fn(),
    ellipse:     vi.fn(),
  };
}

function makeMockCanvas(toDataURLFn) {
  const ctx = makeMockCtx();
  return {
    width:       0,
    height:      0,
    _ctx:        ctx,
    getContext:  vi.fn(() => ctx),
    toDataURL:   toDataURLFn ?? vi.fn(() => 'data:image/png;base64,mockdata'),
  };
}

// ── Gemensamt state för de flesta tester ──────────────────────────────────────

const EMPTY_STATE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [],
};

// ── Testsviter ────────────────────────────────────────────────────────────────

describe('generateNetImage', () => {
  let canvases;

  beforeEach(() => {
    canvases = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        const c = makeMockCanvas();
        canvases.push(c);
        return c;
      }
      return orig(tag);
    });
    setState(EMPTY_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Geometri ────────────────────────────────────────────────────────────────

  it('tom state returnerar dataURL utan att krascha', () => {
    const result = generateNetImage();
    expect(result.dataURL).toMatch(/^data:image\/png/);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.usedFallback).toBe(false);
  });

  it('3 punkter: returnerar objekt med rätt dimensioner', () => {
    setState({
      pts: [
        { id: 'A', type: 'known',   E: 100, N: 100 },
        { id: 'B', type: 'known',   E: 200, N: 100 },
        { id: 'C', type: 'station', E: 150, N: 200 },
      ],
    });
    const result = generateNetImage({ width: 800, height: 600 });
    expect(result.dataURL).toMatch(/^data:image\/png/);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('1 punkt + autoZoom kraschar inte (noll-spann skyddas av || 1)', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 100, N: 200 }] });
    expect(() => generateNetImage({ autoZoom: true })).not.toThrow();
  });

  // ── Filtrering ──────────────────────────────────────────────────────────────

  it('showKnown:false ritar inte kända punkter (arc-anrop = 1 för stationen)', () => {
    setState({
      pts: [
        { id: 'FP1', type: 'known',   E: 100, N: 100 },
        { id: 'FP2', type: 'known',   E: 200, N: 100 },
        { id: 'S1',  type: 'station', E: 150, N: 150 },
      ],
      meas: [],
    });
    generateNetImage({
      showKnown:        false,
      showMeasurements: false,
      showLabels:       false,
      showLegend:       false,
      showScale:        false,
      showNorth:        false,
      background:       'white',
    });
    // Bara S1 syns → 1 arc-anrop (stationens cirkel, ingen ytterring)
    expect(canvases[0]._ctx.arc.mock.calls.length).toBe(1);
  });

  it('showMeasurements:false → moveTo/lineTo anropas inte för mätlinjer', () => {
    setState({
      pts: [
        { id: 'A', type: 'known', E: 0,   N: 0 },
        { id: 'B', type: 'known', E: 100, N: 0 },
      ],
      meas: [{ id: 'm1', from: 'A', to: 'B' }],
    });
    generateNetImage({
      showMeasurements: false,
      showLabels:       false,
      showLegend:       false,
      showScale:        false,
      showNorth:        false,
      background:       'white',
    });
    expect(canvases[0]._ctx.moveTo).not.toHaveBeenCalled();
    expect(canvases[0]._ctx.lineTo).not.toHaveBeenCalled();
  });

  it('showObstacles:true med polygon-hinder anropar moveTo/lineTo', () => {
    setState({
      pts: [{ id: 'A', type: 'known', E: 0, N: 0 }],
      obstacles: [{
        id: 'obs_1', type: 'polygon',
        points: [[10, 10], [20, 10], [20, 20]],
      }],
    });
    generateNetImage({
      showObstacles:    true,
      showMeasurements: false,
      showLabels:       false,
      showLegend:       false,
      showScale:        false,
      showNorth:        false,
      background:       'white',
    });
    expect(canvases[0]._ctx.moveTo).toHaveBeenCalled();
    expect(canvases[0]._ctx.lineTo).toHaveBeenCalled();
  });

  // ── Bakgrund ────────────────────────────────────────────────────────────────

  it('background:white → moveTo/lineTo anropas inte (inget rutnät)', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 0, N: 0 }] });
    generateNetImage({
      background:       'white',
      showMeasurements: false,
      showObstacles:    false,
      showLabels:       false,
      showLegend:       false,
      showScale:        false,
      showNorth:        false,
    });
    expect(canvases[0]._ctx.moveTo).not.toHaveBeenCalled();
    expect(canvases[0]._ctx.lineTo).not.toHaveBeenCalled();
  });

  it('background:grid → moveTo/lineTo anropas för rutnätslinjerna', () => {
    setState({ pts: [{ id: 'A', type: 'known', E: 0, N: 0 }] });
    generateNetImage({
      background:       'grid',
      showMeasurements: false,
      showLabels:       false,
      showLegend:       false,
      showScale:        false,
      showNorth:        false,
    });
    expect(canvases[0]._ctx.moveTo).toHaveBeenCalled();
    expect(canvases[0]._ctx.lineTo).toHaveBeenCalled();
  });

  it('background:tiles + SecurityError → usedFallback:true, dataURL giltigt', () => {
    // Åsidosätt beforeEach-mocken: första canvas kastar vid toDataURL,
    // andra canvas lyckas (simulerar CORS-taint).
    vi.restoreAllMocks();
    let idx = 0;
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        const canvasIdx = idx++;
        return makeMockCanvas(
          canvasIdx === 0
            ? vi.fn(() => { throw new Error('Canvas tainted by cross-origin data') })
            : vi.fn(() => 'data:image/png;base64,fallbackdata'),
        );
      }
      return orig(tag);
    });

    setState({ pts: [{ id: 'A', type: 'known', E: 100, N: 200 }] });
    const result = generateNetImage({ background: 'tiles' });

    expect(result.usedFallback).toBe(true);
    expect(result.dataURL).toMatch(/^data:image\/png/);
  });

  // ── Returvärde ──────────────────────────────────────────────────────────────

  it('returnerar objekt med dataURL, width, height och usedFallback', () => {
    const result = generateNetImage({ width: 400, height: 300, background: 'white' });
    expect(result.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(typeof result.usedFallback).toBe('boolean');
  });

  it('width/height i options slår igenom på returnerat objekt', () => {
    const result = generateNetImage({ width: 640, height: 480, background: 'white' });
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    // Canvas ska ha satts med rätt dimensioner
    const c = canvases[0];
    expect(c.width).toBe(640);
    expect(c.height).toBe(480);
  });
});
