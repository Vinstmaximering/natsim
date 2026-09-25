// Resultatrutan för mätverktyget D (Polylinjer Etapp 2).
//
// Visas medan verktyget är valt: först en uppmaning, efter två klick S (plan),
// riktning (plan), ΔN, ΔE och ΔH. ΔH visas som "–" när någon av punkterna
// saknar höjd. Punkternas namn visas när snappningen träffat en punkt. Rutan
// är tillfällig – ingenting sparas.
import { subscribe } from '../state/store.js';
import { isMeasuring, getMeasurePoints, getMeasureResult } from '../map/measure-tool.js';
import { formatMeters, formatDelta, formatGon } from '../state/line-geometry.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const punkt = p => (p.name ? esc(p.name) : p.kind === 'line' || p.kind === 'edge' ? 'på linje' : 'fri punkt');

/** Rutans innehåll som HTML, eller null när verktyget inte är valt. Exporteras för tester. */
export function measureBoxHtml() {
  if (!isMeasuring()) return null;
  const { a } = getMeasurePoints();
  const r = getMeasureResult();
  const head = '<div class="mb-head">📐 Mät avstånd</div>';
  if (!r) {
    return `${head}<div class="mb-hint">${a
      ? `Från ${punkt(a)} – klicka den andra punkten`
      : 'Klicka första punkten (snappar mot punkter och linjer)'}</div>`;
  }
  const rad = (k, v) => `<div class="mb-row"><span class="mb-k">${k}</span><span class="mb-v">${v}</span></div>`;
  return head
    + `<div class="mb-pts">${punkt(r.a)} → ${punkt(r.b)}</div>`
    + rad('S (plan)', formatMeters(r.S))
    + rad('Riktning (plan)', formatGon(r.bearing))
    + rad('ΔN', formatDelta(r.dN))
    + rad('ΔE', formatDelta(r.dE))
    + rad('ΔH', formatDelta(r.dH))
    + '<div class="mb-hint">Nytt klick eller Esc: börja om</div>';
}

export function renderMeasureBox() {
  const box = document.getElementById('measure-box');
  if (!box) return;
  const html = measureBoxHtml();
  box.hidden = html === null;
  if (html !== null) box.innerHTML = html;
}

export function initMeasureBox() {
  subscribe(() => renderMeasureBox());
  renderMeasureBox();
}
