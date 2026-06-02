import { draw } from '../map/leaflet-setup.js';

const MIN_W = 240;
const MAX_W = 600;

export function initResize(panelId, side) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const storageKey = panelId + '_width';
  const saved = parseInt(localStorage.getItem(storageKey), 10);
  if (!isNaN(saved) && saved >= MIN_W && saved <= MAX_W) {
    panel.style.width = saved + 'px';
  }

  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  side === 'right' ? panel.after(handle) : panel.before(handle);

  const obs = new MutationObserver(() => {
    handle.style.display = panel.classList.contains('hidden') ? 'none' : '';
  });
  obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
  if (panel.classList.contains('hidden')) handle.style.display = 'none';

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    panel.style.transition = 'none';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const delta = side === 'right' ? e.clientX - startX : startX - e.clientX;
    panel.style.width = Math.min(MAX_W, Math.max(MIN_W, startW + delta)) + 'px';
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    localStorage.setItem(storageKey, panel.offsetWidth);
    draw();
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
