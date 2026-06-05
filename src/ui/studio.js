// Studioläge – split-vy för NÄT, MÄTNINGAR, SIMULERING, RAPPORT.
import { getState }              from '../state/store.js';
import { isDrawing, cancelDraw } from '../map/obstacle-drawing.js';
import { showToast }             from './toast.js';
import { draw, resize }          from '../map/leaflet-setup.js';

export const STUDIO_TABS = new Set(['net', 'meas', 'sim', 'rep']);

const TAB_LABELS = { net: 'NÄT', meas: 'MÄTNINGAR', sim: 'SIMULERING', rep: 'RAPPORT' };

// Registrerade vyer per flik (fylls på i Etapp B/C via initStudioForTab).
const _views = {};

let _activeTab = null;

export function getActiveStudio() { return _activeTab; }

// Registrera en studio-vy för en specifik flik.
export function initStudioForTab(tabId, config) {
  _views[tabId] = config;
}

export function openStudio(tabId) {
  if (!STUDIO_TABS.has(tabId)) return;

  if (isDrawing()) {
    cancelDraw();
    showToast('Ritning avbruten – studioläge aktiverat');
  }

  _activeTab = tabId;
  document.getElementById('app')?.classList.add('studio-active');

  const overlay = document.getElementById('studio-overlay');
  if (!overlay) return;
  overlay.style.display = '';          // styrs av CSS via #app.studio-active

  // Uppdatera topprad
  const titleEl = overlay.querySelector('.studio-title');
  if (titleEl) titleEl.textContent = `Studioläge — ${TAB_LABELS[tabId] ?? tabId}`;

  // Rensa och rendera (skelett om ingen vy registrerad ännu)
  const sidebar = document.getElementById('studio-sidebar');
  const main    = document.getElementById('studio-main');
  const footer  = document.getElementById('studio-footer');

  const view = _views[tabId];
  if (view?.render) {
    view.render({ sidebar, main, footer }, getState());
  } else {
    if (sidebar) sidebar.innerHTML = '<div class="studio-loading">…</div>';
    if (main)    main.innerHTML    = '<div class="studio-loading">Vy laddas i Etapp B/C</div>';
    if (footer)  footer.innerHTML  = '';
  }

  // Leaflet måste räkna om kartstorlek efter layout-ändring
  setTimeout(() => { try { resize(); draw(); } catch (_) {} }, 60);
}

export function closeStudio() {
  if (!_activeTab) return;
  _activeTab = null;
  document.getElementById('app')?.classList.remove('studio-active');
  // Overlay döljs via CSS (display:none utan studio-active)
  setTimeout(() => { try { resize(); draw(); } catch (_) {} }, 60);
}

// Ctrl+E: öppna/stäng för tillåtna flikar. Esc: stäng (ej i ritläge).
export function bindKeyboardShortcut() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      if (_activeTab) {
        closeStudio();
      } else {
        const { atab } = getState();
        if (STUDIO_TABS.has(atab)) openStudio(atab);
      }
      return;
    }
    if (e.key === 'Escape' && _activeTab && !isDrawing()) {
      closeStudio();
    }
  });
}
