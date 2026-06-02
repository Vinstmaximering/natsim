// Tester för auto-generera-funktionen i step4-images.js.
// Lokal path (white/grid): generateNetImage anropas direkt.
// Tiles path: postMessage skickas till window.opener.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../src/reports/net-image.js', () => ({
  generateNetImage: vi.fn(() => ({
    dataURL: 'data:image/png;base64,automock',
    width: 1200, height: 800, usedFallback: false,
  })),
  setMapRef: vi.fn(),
}));

import { render, _resetImgsMeta } from '../src/pm/steps/step4-images.js';
import { generateNetImage }        from '../src/reports/net-image.js';

// D med activeLayerKey=null → _defaultBg → 'white' (lokal path i test)
const D = {
  allPts:        [{ id: 'FP1', type: 'known', E: 6500100, N: 1620400 }],
  meas:          [],
  imgSimResult:  null,
  activeCRS:     'sweref99tm',
  obstacles:     [],
  activeLayerKey: null,
};

describe('step4-images – auto-generera', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetImgsMeta();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    // Rensa eventuell window.opener-mock
    try { Object.defineProperty(window, 'opener', { value: null, configurable: true, writable: true }); } catch {}
  });

  it('Vit bakgrund anropar generateNetImage direkt och fyller imgs[r32]', () => {
    const imgs = {};
    render(D, container, {}, imgs);
    // Default är 'white' (D.activeLayerKey = null)
    const autoBtn = container.querySelector('[data-auto="r32"]');
    expect(autoBtn, 'Auto-generera-knapp saknas').not.toBeNull();

    autoBtn.click();

    expect(generateNetImage).toHaveBeenCalledOnce();
    expect(generateNetImage).toHaveBeenCalledWith(
      expect.objectContaining({ background: 'white' })
    );
    expect(imgs.r32).toBe('data:image/png;base64,automock');
  });

  it('Koordinatrutnät anropar generateNetImage med background:grid', () => {
    const imgs = {};
    render(D, container, {}, imgs);

    const sel = container.querySelector('#sel-bg');
    expect(sel, '#sel-bg saknas').not.toBeNull();
    sel.value = 'grid';

    container.querySelector('[data-auto="r32"]').click();

    expect(generateNetImage).toHaveBeenCalledWith(
      expect.objectContaining({ background: 'grid' })
    );
  });

  it('Satellit/karta skickar postMessage till window.opener (ingen lokal generateNetImage)', () => {
    const postMock = vi.fn();
    Object.defineProperty(window, 'opener', {
      value: { postMessage: postMock }, configurable: true, writable: true,
    });

    render(D, container, {}, {});
    container.querySelector('#sel-bg').value = 'tiles';
    container.querySelector('[data-auto="r32"]').click();

    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type:    'request-net-image',
        options: expect.objectContaining({ background: 'tiles' }),
      }),
      '*'
    );
    // generateNetImage ska INTE anropas lokalt – genereras i huvudfönstret
    expect(generateNetImage).not.toHaveBeenCalled();
  });

  it('Återskapa-knapp finns för auto-bild, saknas för manuellt uppladdad', () => {
    // r32 = manuell bild (ingen _imgsMeta)
    const imgs = { r32: 'data:image/png;base64,manual' };
    render(D, container, {}, imgs);

    expect(container.querySelector('[data-ater="r32"]')).toBeNull();

    // Auto-generera r33 (vit = lokal path)
    container.querySelector('[data-auto="r33"]').click();

    expect(container.querySelector('[data-ater="r33"]')).not.toBeNull();
  });
});
