// Verktygsraden på kartan (Lager-verktyg Etapp 2): klick och kortkommandon.
//
// Markupen ligger i index.html (#map-tools) och markeringen av valt verktyg
// sätts av buildTools() i ui/toolbar.js, precis som för vänsterpanelens
// verktyg. Här kopplas bara händelserna.
//
// Kortkommandon (en bokstav, utan Ctrl/Alt/Cmd/Skift):
//   P visuell punkt · L visuell linje
//   M markera område (etapp 4) · Y yta (etapp 3) · S snappning (etapp 5)
//   Esc avbryter pågående ritning (hanteras i map/interactions.js)
// Inga av bokstäverna var upptagna; de befintliga genvägarna är Ctrl+S,
// Ctrl+Z och Ctrl+E, som alla har modifierare och därför inte krockar.
// Genvägarna gäller inte när man skriver i ett fält, när en dialog är öppen,
// i studioläget eller i koordinatlistan.
//
// Att välja det verktyg som redan är valt – med knappen eller bokstaven –
// återgår till Panorera, så att samma tangent slår av och på.
import { getState } from '../state/store.js';
import { setTool, MAP_TOOLS } from './toolbar.js';

const el = id => document.getElementById(id);

const shown = node => !!node && node.style.display !== 'none' && !node.hidden
  && (typeof getComputedStyle !== 'function' || getComputedStyle(node).display !== 'none');

/** Är ett kortkommando med en bokstav tillåtet just nu? Ren läsning av DOM:en. */
export function shortcutAllowed(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  if (e.repeat || e.defaultPrevented) return false;
  const a = document.activeElement;
  if (a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable)) return false;
  // Dialoger: projektdialogen (#modal) och de som skapar en egen .ov.
  if ([...document.querySelectorAll('.ov')].some(shown)) return false;
  if (el('app')?.classList.contains('studio-active')) return false;
  if (shown(el('coordview'))) return false;
  return true;
}

/** Verktyget som en tangent väljer, eller null. */
export function toolForKey(key) {
  const k = String(key || '').toLowerCase();
  return MAP_TOOLS.find(t => t.key === k) || null;
}

/** Väljer verktyget, eller återgår till Panorera om det redan är valt. */
export function selectMapTool(tool) {
  setTool(getState().tool === tool ? 'pan' : tool);
}

/** Kopplar klick på verktygsradens knappar. */
export function bindMapToolButtons(bar = el('map-tools')) {
  bar?.addEventListener('click', e => {
    const b = e.target.closest('button[data-tool]');
    if (!b || b.disabled) return;
    selectMapTool(b.dataset.tool);
  });
}

export function initMapTools() {
  if (!el('map-tools')) return;
  bindMapToolButtons();

  document.addEventListener('keydown', e => {
    const t = toolForKey(e.key);
    if (!t || !shortcutAllowed(e)) return;
    const b = el(t.btn);
    if (b?.disabled) return;
    e.preventDefault();
    selectMapTool(t.tool);
  });
}
