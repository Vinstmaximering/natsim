// Etapp 4: toolbaren överst – Data- och Visa-menyerna.
//
// Markupen ligger i index.html, eftersom kryssrutorna och reglagen flyttades
// dit från vänsterpanelen med sina id:n i behåll. leaflet-setup.js och
// ui/toolbar.js läser dem precis som förut; den här filen rör bara menyernas
// öppna/stäng-beteende och kopplar Data-menyns poster till befintliga
// funktioner.
//
// Menyerna stängs vid klick utanför, Escape och vid val av en menypost.
// Tangentbord: Enter/Mellanslag/Pil ned öppnar och går till första posten,
// pilarna vandrar i menyn, Home/End hoppar till ändarna, Escape stänger och
// lämnar tillbaka fokus till knappen, vänster/höger byter meny.
//
// Lager-menyn (Lager-verktyg Etapp 1) kan låsas öppen med nålen i sitt huvud.
// En låst meny räknas inte som "den öppna menyn" (_open): den stängs inte av
// klick utanför eller Escape, och en annan meny kan öppnas bredvid den. Den
// stängs bara av × (som också släpper låset) eller av nålen – att släppa låset
// gör den till en vanlig öppen meny. Låset sparas per användare i
// localStorage, inte i projektet, och används inte på telefon (< 768 px).

import { getState } from '../state/store.js';

const MENUS = [
  { btn: 'mnu-data-btn',    pop: 'mnu-data' },
  { btn: 'mnu-visa-btn',    pop: 'mnu-visa' },
  { btn: 'mnu-rapport-btn', pop: 'mnu-rapport' },
  { btn: 'mnu-lager-btn',   pop: 'mnu-lager' },
];

const LAGER = 'mnu-lager';
export const LAGER_PIN_KEY = 'natsim_lager_pinned';
export const PIN_MIN_WIDTH = 768;

let _open = null;     // id:t på den öppna (olåsta) popupen, eller null
let _pinned = false;  // Lager-menyn är låst öppen

const el = id => document.getElementById(id);
const menuOf = popId => MENUS.find(m => m.pop === popId);

// Fokuserbara poster i en meny. Visa-menyn har kryssrutor och reglage i
// stället för menyposter, så urvalet är brett med flit.
function items(pop) {
  return [...pop.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')];
}

export function closeTopbarMenus(focusBtn = false) {
  if (!_open) return;
  const m = menuOf(_open);
  const pop = el(_open), btn = el(m.btn);
  if (pop) pop.hidden = true;
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  }
  _open = null;
}

export function openTopbarMenu(popId, focusFirst = false) {
  const m = menuOf(popId);
  if (!m) return;
  const pop = el(popId), btn = el(m.btn);
  if (!pop || !btn) return;
  // Den låsta Lager-menyn ligger redan öppen vid sidan av; att "öppna" den
  // rör inte den meny som är öppen för tillfället.
  if (popId === LAGER && _pinned) {
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (focusFirst) items(pop)[0]?.focus();
    return;
  }
  if (_open && _open !== popId) closeTopbarMenus();
  // Rapport-menyns poster beror på nätets tillstånd – räknas om vid varje
  // öppning, innan items() plockar de fokuserbara (disabled räknas inte).
  if (popId === 'mnu-rapport') updateReportMenu();
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  _open = popId;
  if (focusFirst) items(pop)[0]?.focus();
}

export const isTopbarMenuOpen = () => _open;
export const isLagerPinned = () => _pinned;

function toggle(popId, focusFirst = false) {
  // En låst meny stängs bara med nålen eller × – knappen lämnar den öppen.
  if (popId === LAGER && _pinned) { openTopbarMenu(popId, focusFirst); return; }
  if (_open === popId) closeTopbarMenus(focusFirst);
  else openTopbarMenu(popId, focusFirst);
}

// ── Låsning av Lager-menyn ───────────────────────────────────────────────────

const canPin = () => typeof window === 'undefined' || window.innerWidth >= PIN_MIN_WIDTH;

function _savePin(on) {
  try { localStorage.setItem(LAGER_PIN_KEY, on ? '1' : '0'); } catch { /* privat läge m.m. */ }
}
function _loadPin() {
  try { return localStorage.getItem(LAGER_PIN_KEY) === '1'; } catch { return false; }
}

function _paintPin() {
  const pop = el(LAGER), pin = el('mnu-lager-pin');
  pop?.classList.toggle('tbar-pop-pinned', _pinned);
  if (pin) {
    pin.setAttribute('aria-pressed', String(_pinned));
    const t = _pinned ? 'Lås upp menyn' : 'Lås menyn öppen';
    pin.title = t;
    pin.setAttribute('aria-label', t);
  }
}

/** Låser (true) eller släpper (false) Lager-menyn. Låsning öppnar den. */
export function setLagerPinned(on) {
  on = !!on && canPin();
  const pop = el(LAGER), btn = el('mnu-lager-btn');
  _pinned = on;
  _savePin(on);
  if (on) {
    if (_open === LAGER) _open = null;
    if (pop) pop.hidden = false;
    btn?.setAttribute('aria-expanded', 'true');
  } else if (pop && !pop.hidden) {
    // Upplåst men fortfarande öppen: den blir den vanliga öppna menyn, så en
    // annan öppen meny får stänga för den.
    if (_open && _open !== LAGER) closeTopbarMenus();
    _open = LAGER;
  }
  _paintPin();
}

/** ×: stänger Lager-menyn och släpper låset. */
export function closeLagerMenu(focusBtn = false) {
  if (_pinned) { _pinned = false; _savePin(false); _paintPin(); }
  const pop = el(LAGER), btn = el('mnu-lager-btn');
  if (pop) pop.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  if (_open === LAGER) _open = null;
  if (focusBtn) btn?.focus();
}

// Flyttar fokus steg i listan och stannar inte – menyn är cirkulär.
function move(pop, from, delta) {
  const list = items(pop);
  if (!list.length) return;
  const i = list.indexOf(from);
  const next = i === -1 ? 0 : (i + delta + list.length) % list.length;
  list[next].focus();
}

// ── Data-menyns poster ───────────────────────────────────────────────────────
// Varje post pekar på den funktion som redan fanns bakom knappen i
// vänsterpanelen eller i Hinder-fliken – inget nytt beteende införs här.
const ACTIONS = {
  'import-geo': () => el('geo-fi')?.click(),
  'import-dxf': () => el('dxf-fi')?.click(),
  'import-xl':  () => el('xl-fi')?.click(),
  'import-osm': () => import('../io/osm-import.js').then(m => m.importOSMForCurrentView()),
  'export-geo': () => import('../io/import-geo.js').then(m => m.exportGeoFile()),
  // Polylinjer Etapp 3: visuella lager, med dialog.
  'export-visual-geo': () => import('./geo-export.js').then(m => m.openVisualGeoExport()),
  'save':       () => import('../io/export-project.js').then(m => m.saveProject()),
  'load':       () => el('load-fi')?.click(),
  'template':   () => import('../io/import-csv.js').then(m => m.showExcelTemplate()),
};

// ── Rapport-menyns poster ────────────────────────────────────────────────────
// Etapp 1: flyttade hit från högerpanelens RAPPORT-flik. Funktionerna är
// oförändrade – window._exportRep m.fl. sätts av main.js – och exporternas
// innehåll är inte rört. Det enda som är nytt är att en post som ändå skulle
// mötas av ett alert i stället visas inaktiv med skälet i title.
const REPORT_ACTIONS = {
  'pm':          () => window._openPM?.(),
  'sim-pdf':     () => window._exportSimPDF?.(),
  'sim-txt':     () => window._exportRep?.(),
  'calc-txt':    () => window._exportCalcRep?.(),
  'rep-studio':  () => window._openStudio?.('rep'),
  'meas-book':   () => window._openMeasBook?.(),
  'meas-scheme': () => window._exportMeasScheme?.(),
};

// Minsta fönsterbredd för PM-modulen. Samma tal som isMobilePhone() i main.js,
// som annars möter användaren med en toast efter att popupen redan öppnats.
export const PM_MIN_WIDTH = 768;

const SIM_KRAVS  = 'Kör simuleringen först';
const MEAS_KRAVS = 'Lägg till minst en mätning först';

/**
 * Skälet till att en rapportpost inte går att använda, eller null om den gör
 * det. Ren funktion av tillståndet – testbar utan DOM.
 */
export function reportItemBlocker(act, { simOk, measCount, winWidth }) {
  if (act === 'pm' && winWidth < PM_MIN_WIDTH)
    return `Kräver bredare skärm (minst ${PM_MIN_WIDTH} px)`;
  if (act === 'meas-book' || act === 'meas-scheme')
    return measCount > 0 ? null : MEAS_KRAVS;
  return simOk ? null : SIM_KRAVS;
}

/** Slår av/på Rapport-menyns poster och sätter title med skälet. */
export function updateReportMenu() {
  const pop = el('mnu-rapport');
  if (!pop) return;
  const { simResult, meas = [] } = getState();
  const ctx = {
    simOk:     !!simResult?.ok,
    measCount: meas.length,
    winWidth:  typeof window !== 'undefined' ? window.innerWidth : PM_MIN_WIDTH,
  };
  for (const b of pop.querySelectorAll('button[data-act]')) {
    const skal = reportItemBlocker(b.dataset.act, ctx);
    b.disabled = !!skal;
    if (skal) b.title = skal;
    else      b.removeAttribute('title');
  }
}

export function initTopbar() {
  const bar = el('topbar');
  if (!bar) return;

  for (const { btn, pop } of MENUS) {
    const b = el(btn), p = el(pop);
    if (!b || !p) continue;

    b.addEventListener('click', e => { e.stopPropagation(); toggle(pop); });

    b.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); openTopbarMenu(pop, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); openTopbarMenu(pop); items(p).at(-1)?.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = MENUS.findIndex(m => m.btn === btn);
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length;
        e.preventDefault();
        const wasOpen = _open;
        el(MENUS[n].btn)?.focus();
        if (wasOpen) openTopbarMenu(MENUS[n].pop);
      }
    });

    p.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        // En låst meny står kvar; Escape går vidare till kartan.
        if (pop === LAGER && _pinned) return;
        e.stopPropagation(); closeTopbarMenus(true);
      }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(p, document.activeElement, 1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); move(p, document.activeElement, -1); }
      else if (e.key === 'Home')      { e.preventDefault(); items(p)[0]?.focus(); }
      else if (e.key === 'End')       { e.preventDefault(); items(p).at(-1)?.focus(); }
    });

    // Tab ut ur menyn stänger den. focusout hinner före att fokus flyttats,
    // därav relatedTarget.
    p.addEventListener('focusout', e => {
      if (_open !== pop) return;
      const to = e.relatedTarget;
      if (to && (p.contains(to) || to === b)) return;
      closeTopbarMenus();
    });
  }

  // Data-menyns poster: kör åtgärden och stäng menyn.
  el('mnu-data')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    closeTopbarMenus();
    ACTIONS[b.dataset.act]?.();
  });

  // Rapport-menyns poster: samma mönster som Data-menyn.
  el('mnu-rapport')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    closeTopbarMenus();
    REPORT_ACTIONS[b.dataset.act]?.();
  });

  // Visa-menyn stängs inte av att en kryssruta bockas – då går det inte att
  // ändra två saker i rad. Den stängs med Escape, klick utanför eller knappen.

  // ── Lager-menyn: nål, ×, och etiketten för aktivt lager ──
  el('mnu-lager-pin')?.addEventListener('click', e => {
    e.stopPropagation();
    setLagerPinned(!_pinned);
  });
  el('mnu-lager-close')?.addEventListener('click', e => {
    e.stopPropagation();
    closeLagerMenu(true);
  });
  el('active-layer-chip')?.addEventListener('click', e => {
    e.stopPropagation();
    openTopbarMenu(LAGER);
  });
  if (_loadPin() && canPin()) setLagerPinned(true);
  else _paintPin();

  // Klick utanför. composedPath() i stället för target.closest(): Lager-menyns
  // rader ritas om av sin egen klicklyssnare, så target kan vara urkopplat ur
  // dokumentet när klicket når hit. Radens ⋮-meny ligger i body men hör till
  // Lager-menyn.
  document.addEventListener('click', e => {
    if (!_open) return;
    const path = e.composedPath?.() || [];
    if (path.some(n => n.id === 'topbar' || n.classList?.contains('lyr-pop'))) return;
    closeTopbarMenus();
  });

  // Escape var som helst. Är radens ⋮-meny öppen stänger Escape bara den.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_open) return;
    if (document.querySelector('.lyr-pop')) return;
    e.stopPropagation(); closeTopbarMenus(true);
  }, true);

  // Ctrl+S sparar projektet – samma genväg som menyposten visar.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      closeTopbarMenus();
      ACTIONS.save();
    }
  });
}
