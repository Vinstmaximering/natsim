// ─────────────────────────────────────────────────────────────────────────────
// TECKENFÖRKLARING FÖR KARTAN
//
// UI-städning Omgång 3 (2026-09-12). Underlag:
// docs/troubleshooting/ui_inventering_20260910.md avsnitt 6, som konstaterade
// att kartan kodar observationstyp i tre linjestilar utan att förklara dem
// någonstans, och att den saknar teckenförklaring helt.
//
// ── PLACERING ───────────────────────────────────────────────────────────────
// Nedre vänstra hörnet, hopfälld som en knapp tills användaren öppnar den.
// Kartans övriga hörn är upptagna: .hint uppe till vänster, .lm-ctrl uppe i
// mitten, .zb och kvalitetspanelen uppe till höger, .map-zoom-ctrl och .tpb
// nere till höger, .mfb nere i mitten. Nere till vänster ligger bara
// canvas-skalstången (de understa ~40 px), så panelen börjar ovanför den.
//
// Hopfälld som default eftersom vana användare inte behöver den varje session,
// men läget sparas i localStorage så att den som vill ha den uppe slipper
// öppna om vid varje sidladdning.
//
// ── INNEHÅLL ────────────────────────────────────────────────────────────────
// Linjestilarna och riktningspilen är det beställningen pekade ut. Linjefärgen
// är med eftersom den bär r-talet – samma skala som Omgång 3 harmoniserade, och
// en teckenförklaring som utelämnade färgen hade förklarat halva linjen.
// Punkttyperna är med eftersom de ritas med fem olika symboler i samma vy och
// tabellen kostar fem rader ur PT.
//
// MEDVETET UTELÄMNAT (eget beslut, se rapporten för Omgång 3): felellipser,
// föreslagna mätningar (⚡), blockerade förslag, hinder och det visuella lagret.
// De har alla en egen på/av-ruta i vänsterpanelen och syns bara när användaren
// själv slagit på dem.
// ─────────────────────────────────────────────────────────────────────────────
import { PT, R_BAND, K_R_KALLA, bandIntervall } from '../core/constants.js';
import { rColor } from '../core/redundancy.js';
import { nf } from '../core/format.js';

const LAGRINGSNYCKEL = 'natsim_legend_open';

// ── Symbolritning ───────────────────────────────────────────────────────────

/** En linje med given streckning, som SVG. dash = [] ⇒ heldragen. */
function linjeSvg(dash, farg = 'var(--accent)') {
  const d = dash.length ? ` stroke-dasharray="${dash.join(' ')}"` : '';
  return `<svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
    <line x1="1" y1="5" x2="33" y2="5" stroke="${farg}" stroke-width="2"${d}/>
  </svg>`;
}

/** Riktningspilen: samma ifyllda triangel som draw() ritar i linjens mitt. */
function pilSvg(farg = 'var(--accent)') {
  return `<svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
    <line x1="1" y1="5" x2="33" y2="5" stroke="${farg}" stroke-width="2" opacity="0.45"/>
    <path d="M14 1.5 L21 5 L14 8.5 Z" fill="${farg}"/>
  </svg>`;
}

/** Punktsymbol – samma former som drawPt() i map/leaflet-setup.js. */
function punktSvg(typ) {
  const c = PT[typ]?.c || '#888';
  const inre = `${c}33`;
  if (typ === 'known') {
    return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <polygon points="9,3 15,13 3,13" fill="${inre}" stroke="${c}" stroke-width="1.6"/>
      <circle cx="9" cy="10.5" r="1.6" fill="${c}"/></svg>`;
  }
  if (typ === 'station') {
    return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="4.5" fill="${inre}" stroke="${c}" stroke-width="1.6"/>
      <line x1="2" y1="9" x2="16" y2="9" stroke="${c}" stroke-width="1"/>
      <line x1="9" y1="2" x2="9" y2="16" stroke="${c}" stroke-width="1"/></svg>`;
  }
  if (typ === 'detail') {
    return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <line x1="3" y1="3" x2="15" y2="15" stroke="${c}" stroke-width="1.8"/>
      <line x1="15" y1="3" x2="3" y2="15" stroke="${c}" stroke-width="1.8"/></svg>`;
  }
  // new och simstation ritas båda som fylld kvadrat med prick, åtskilda av färg.
  return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <rect x="4" y="4" width="10" height="10" fill="${inre}" stroke="${c}" stroke-width="1.6"/>
    <circle cx="9" cy="9" r="1.5" fill="${c}"/></svg>`;
}

/** Färgruta för ett r-talsband. */
function fargSvg(farg) {
  return `<svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
    <line x1="1" y1="5" x2="33" y2="5" stroke="${farg}" stroke-width="3"/></svg>`;
}

// ── Innehåll ────────────────────────────────────────────────────────────────

const rad = (symbol, text) =>
  `<div class="ml-rad"><span class="ml-sym">${symbol}</span><span class="ml-txt">${text}</span></div>`;

const rubrik = t => `<div class="ml-rubrik">${t}</div>`;

// Etapp 2: intervalltexten kommer ur bandIntervall() i core/constants.js.
// Här låg en handskriven variant som skrev "0,35–0,50" om intervallet
// 0,35 < r < 0,50 och "≥ 0,50" om ett golv som lyder "större än".
//
// Texten går in i innerHTML och innehåller nu < och >, som annars börjar en
// tagg och tyst äter resten av raden. Den gamla varianten skrev "&lt;" som
// färdig entitet; formateraren i core/ är HTML-oberoende och maskeras här.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bandText = (band, i) => esc(bandIntervall(band, i, v => nf(v, 2)));

export function legendInnehall() {
  const linjer = [
    rad(linjeSvg([]),     'Riktning + avstånd'),
    rad(linjeSvg([8, 4]), 'Endast riktning'),
    rad(linjeSvg([2, 4]), 'Endast avstånd'),
    rad(pilSvg(),         'Pilen visar mätriktningen från → till'),
  ].join('');

  // Färgen sätts av observationens r-tal. Samma skala som tabellerna och
  // valideringen använder – se klassificeraRtal() i core/constants.js.
  const farger = R_BAND.map((b, i) =>
    rad(fargSvg(rColor(b.min === 0 ? 0 : b.min)), `${b.klass} (${bandText(R_BAND, i)})`)
  ).join('');

  const punkter = Object.keys(PT).map(t =>
    rad(punktSvg(t), PT[t].l)
  ).join('');

  const kalla = `<div class="ml-rad"><span class="ml-txt ml-kalla">${K_R_KALLA}</span></div>`;

  return rubrik('Mätlinjer') + linjer
       + rubrik('Linjefärg = r-tal') + farger + kalla
       + rubrik('Punkttyper') + punkter;
}

// ── Montering ───────────────────────────────────────────────────────────────

function laesOppet() {
  try { return localStorage.getItem(LAGRINGSNYCKEL) === '1'; } catch { return false; }
}
function skrivOppet(v) {
  try { localStorage.setItem(LAGRINGSNYCKEL, v ? '1' : '0'); } catch { /* privat läge */ }
}

export function initMapLegend(container = document.getElementById('cw')) {
  if (!container || container.querySelector('#map-legend')) return null;

  const el = document.createElement('div');
  el.id = 'map-legend';
  el.className = 'map-legend';
  el.innerHTML = `
    <button type="button" class="ml-knapp" id="ml-toggle"
            aria-expanded="false" aria-controls="ml-panel"
            title="Visa vad kartans linjer och symboler betyder">
      <span class="ml-ikon" aria-hidden="true">🗝</span> Teckenförklaring
    </button>
    <div class="ml-panel" id="ml-panel" hidden>${legendInnehall()}</div>`;
  container.appendChild(el);

  const knapp = el.querySelector('#ml-toggle');
  const panel = el.querySelector('#ml-panel');

  const satt = oppet => {
    panel.hidden = !oppet;
    knapp.setAttribute('aria-expanded', String(oppet));
    el.classList.toggle('ml-open', oppet);
  };
  satt(laesOppet());

  knapp.addEventListener('click', () => {
    const nytt = panel.hidden;
    satt(nytt);
    skrivOppet(nytt);
  });

  return el;
}

/** Ritar om innehållet, t.ex. om punkttypernas färger ändras. Endast för tester. */
export function _uppdatera(el = document.getElementById('map-legend')) {
  const panel = el?.querySelector('#ml-panel');
  if (panel) panel.innerHTML = legendInnehall();
}
