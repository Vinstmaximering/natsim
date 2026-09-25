// Verktygsraden på kartan (Lager-verktyg Etapp 2): klick och kortkommandon.
//
// Markupen ligger i index.html (#map-tools) och markeringen av valt verktyg
// sätts av buildTools() i ui/toolbar.js, precis som för vänsterpanelens
// verktyg. Här kopplas bara händelserna.
//
// Kortkommandon (en bokstav, utan Ctrl/Alt/Cmd/Skift):
//   P visuell punkt · L visuell linje · Y yta · M markera område
//   D mät avstånd (Polylinjer Etapp 2) · O offset (Etapp 4)
//   S snappning av/på (en växlare, inget verktyg; sparas per användare)
//   Esc avbryter pågående ritning (hanteras i map/interactions.js)
//   Alt nedtryckt stänger tillfälligt av snappningen medan man ritar. Alt:s
//   keydown och keyup stoppas då (preventDefault), så att Windows-webbläsarna
//   inte flyttar fokus till sin meny när Alt släpps.
// Inga av bokstäverna var upptagna; de befintliga genvägarna är Ctrl+S,
// Ctrl+Z och Ctrl+E, som alla har modifierare och därför inte krockar.
// Genvägarna gäller inte när man skriver i ett fält, när en dialog är öppen,
// i studioläget eller i koordinatlistan.
//
// Att välja det verktyg som redan är valt – med knappen eller bokstaven –
// återgår till Panorera, så att samma tangent slår av och på.
import { getState } from '../state/store.js';
import { setTool, buildTools, MAP_TOOLS } from './toolbar.js';
import { toggleSnap, setAltHeld, isAltHeld } from '../map/snap.js';
import { isDrawingVisual, refreshVisualSnap } from '../map/visual-drawing.js';
import { isMeasuring } from '../map/measure-tool.js';
import { draw } from '../map/leaflet-setup.js';

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

/** Snappning av/på (knappen och S). */
export function toggleSnapping() {
  toggleSnap();
  refreshVisualSnap();
  buildTools();
  draw();
}

/** Kopplar klick på verktygsradens knappar. */
export function bindMapToolButtons(bar = el('map-tools')) {
  bar?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.id === 'btn-snap') { toggleSnapping(); return; }
    if (b.dataset.tool) selectMapTool(b.dataset.tool);
  });
}

// Alt: tillfälligt utan snappning, bara medan ett ritverktyg är valt – i
// övrigt rör sidan inte Alt. Returnerar true om händelsen hanterades.
export function handleAltKey(e) {
  if (e.key !== 'Alt') return false;
  const ner = e.type === 'keydown';
  if (!isDrawingVisual() && !isMeasuring()) { if (!ner) setAltHeld(false); return false; }
  e.preventDefault();
  if (isAltHeld() !== ner) { setAltHeld(ner); refreshVisualSnap(); draw(); }
  return true;
}

export function initMapTools() {
  if (!el('map-tools')) return;
  bindMapToolButtons();
  window._toggleSnap = toggleSnapping;

  document.addEventListener('keydown', handleAltKey);
  document.addEventListener('keyup', handleAltKey);
  // Fönstret tappar fokus med Alt nere (t.ex. Alt+Tab): inget keyup kommer.
  window.addEventListener('blur', () => { if (isAltHeld()) { setAltHeld(false); refreshVisualSnap(); } });

  document.addEventListener('keydown', e => {
    if ((e.key === 's' || e.key === 'S') && shortcutAllowed(e)) {
      e.preventDefault();
      toggleSnapping();
      return;
    }
    const t = toolForKey(e.key);
    if (!t || !shortcutAllowed(e)) return;
    const b = el(t.btn);
    if (b?.disabled) return;
    e.preventDefault();
    selectMapTool(t.tool);
  });
}
