// Kartans överlägg ligger ovanpå kartan.
//
// #leaflet-map (z-index 1) och #cv (z-index 2) är positionerade syskon till
// överläggen i #cw. Ett överlägg utan z-index hamnar under dem och syns inte –
// så låg zoometiketten (.zb) innan den fick z-index.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(root, 'src/styles/map.css'), 'utf8');

// z-index ur första regeln för en selektor, eller null om den saknas.
function zIndex(selector) {
  const esc = selector.replace(/[.#-]/g, '\\$&');
  const m = new RegExp('(^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(CSS);
  if (!m) throw new Error(`hittar inte ${selector}`);
  const z = /z-index:\s*(-?\d+)/.exec(m[2]);
  return z ? Number(z[1]) : null;
}

describe('kartöverläggen ligger över kartan', () => {
  it('kartan och canvasen har de z-index testet utgår från', () => {
    expect(zIndex('#leaflet-map')).toBe(1);
    expect(zIndex('#cv')).toBe(2);
  });

  for (const sel of ['.zb', '.map-top', '.map-zoom-ctrl', '.tpb', '.mfb', '.map-legend']) {
    it(`${sel} har z-index över kartan`, () => {
      const karta = Math.max(zIndex('#leaflet-map'), zIndex('#cv'));
      expect(zIndex(sel), sel).not.toBeNull();
      expect(zIndex(sel)).toBeGreaterThan(karta);
    });
  }
});

describe('zoometiketten och nordpilen', () => {
  // Nordpilen ritas i leaflet-setup.js med ctx.translate(W-44, 55): pilen går
  // från y = 55−28 till 55+28 och bokstaven N står vid y = 55−38.
  it('etiketten står under nordpilen, inte över den', () => {
    const src = readFileSync(join(root, 'src/map/leaflet-setup.js'), 'utf8');
    const [, x, y] = /ctx\.translate\(W-(\d+),\s*(\d+)\)/.exec(src).map(Number);
    const pilensUnderkant = y + 28;
    const top = Number(/\.zb\s*\{[^}]*top:(\d+)px/.exec(CSS)[1]);
    expect(x).toBe(44);
    expect(top).toBeGreaterThan(pilensUnderkant);
  });
});
