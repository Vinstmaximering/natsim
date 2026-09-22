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

const MENUS = [
  { btn: 'mnu-data-btn', pop: 'mnu-data' },
  { btn: 'mnu-visa-btn', pop: 'mnu-visa' },
];

let _open = null;   // id:t på den öppna popupen, eller null

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
  if (_open && _open !== popId) closeTopbarMenus();
  const m = menuOf(popId);
  if (!m) return;
  const pop = el(popId), btn = el(m.btn);
  if (!pop || !btn) return;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  _open = popId;
  if (focusFirst) items(pop)[0]?.focus();
}

export const isTopbarMenuOpen = () => _open;

function toggle(popId, focusFirst = false) {
  if (_open === popId) closeTopbarMenus(focusFirst);
  else openTopbarMenu(popId, focusFirst);
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
  'import-xl':  () => el('xl-fi')?.click(),
  'import-osm': () => import('../io/osm-import.js').then(m => m.importOSMForCurrentView()),
  'export-geo': () => import('../io/import-geo.js').then(m => m.exportGeoFile()),
  'save':       () => import('../io/export-project.js').then(m => m.saveProject()),
  'load':       () => el('load-fi')?.click(),
  'template':   () => import('../io/import-csv.js').then(m => m.showExcelTemplate()),
};

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
      if (e.key === 'Escape')         { e.stopPropagation(); closeTopbarMenus(true); }
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

  // Visa-menyn stängs inte av att en kryssruta bockas – då går det inte att
  // ändra två saker i rad. Den stängs med Escape, klick utanför eller knappen.

  // Klick utanför.
  document.addEventListener('click', e => {
    if (!_open) return;
    if (e.target.closest('#topbar')) return;
    closeTopbarMenus();
  });

  // Escape var som helst.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _open) { e.stopPropagation(); closeTopbarMenus(true); }
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
