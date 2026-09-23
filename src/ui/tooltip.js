// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIPS FÖR MATEMATISKA FÖRKORTNINGAR
//
// UI-städning Omgång 3 (2026-09-11). Underlag:
// docs/troubleshooting/ui_inventering_20260910.md avsnitt A – förkortningar som
// MUF, YT, σ_pos och r-tal visas utan förklaring. Beslutet är att behålla
// förkortningarna som primärvisning (de är etablerade i svensk mätterminologi)
// och lägga förklaringen i en tooltip.
//
// ── VARFÖR EN EGEN MODUL ────────────────────────────────────────────────────
// Före Omgång 3 fanns två halva lösningar:
//   • title-attributet. Fungerar på desktop-hover men är helt otillgängligt på
//     pekskärm – webbläsaren visar det aldrig vid tryck.
//   • data-tip + en touchstart-lyssnare i ui/quality-panel.js som skrev texten
//     till en fast div (#qTip). Fungerade bara i kvalitetspanelen och bara där
//     den diven fanns.
// NätSim körs på fältdatorer med pekskärm, så förklaringarna måste nå fram där.
// Modulen ger därför EN delegerad lyssnare för hela dokumentet:
//   • desktop: title-attributet behålls (native hover, ingen egen kod)
//   • pekskärm: tryck-och-håll (450 ms) visar en flytande bubbla
//
// ── ANVÄNDNING ──────────────────────────────────────────────────────────────
// I HTML-strängar:  <th ${tipAttr(TIPS.MUF)}>MUF</th>
// I statisk HTML:   title="…" data-tip="…"
// initTooltips() anropas en gång från main.js.
// ─────────────────────────────────────────────────────────────────────────────

import { K_R_KALLA } from '../core/constants.js';

const HALL_MS = 450;     // tryck-och-håll innan bubblan visas
const VISA_MS = 6000;    // bubblan försvinner av sig själv

// ── Texterna ────────────────────────────────────────────────────────────────
// En mening per post. Konkret om vad storheten mäter, med normreferens där
// sådan finns. Ligger samlade här så att samma förkortning inte kan förklaras
// olika på olika ytor. Normgränsernas källa kommer ur K_R_KALLA i
// core/constants.js, så att tooltipen inte kan säga något annat än
// teckenförklaringen och valideringen.
export const TIPS = Object.freeze({
  MUF: 'Minsta upptäckbara fel – det minsta grova felet som statistiskt kan upptäckas i observationen (κ = 2,80, HMK Formel F.16).',

  YT: 'Yttre tillförlitlighet – koordinatpåverkan av ett odetekterat fel av MUF:s storlek.',

  KP: 'Koordinatpåverkan i mm – hur mycket punktens koordinat förskjuts av ett odetekterat fel av MUF:s storlek.',

  SIG_POS: 'Punktstandardosäkerhet efter utjämning – punktens läges­osäkerhet i plan, √(σN² + σE²) enligt HMK Formel F.23.',

  SIG_0: 'Grundmedelfel a posteriori – viktsenhetens standardosäkerhet efter utjämning. I en simulering utan observationer är den 1 per konstruktion.',

  R_TAL: `Kontrollerbarhet per observation (1 minus leverage). Kravet är r-tal > 0,35 enligt ${K_R_KALLA}; 0,50 ger ingen anmärkning enligt HMK Bilaga F.2. HMK Stommätning 2024 Formel F.6 benämner storheten k_i.`,

  K_TAL: `Global kontrollerbarhet f/n = (n − u)/n. Kravet är k > 0,50 enligt ${K_R_KALLA}, gäller alla mätklasser.`,

  H_II: 'Leverage – observationens eget inflytande på den utjämnade lösningen. r-talet är 1 − h_ii.',

  KAPPA: 'Icke-centralitetsparametern κ – hur många standardosäkerheter ett grovfel måste vara för att upptäckas vid α = 5 % och β = 80 % (HMK Formel F.16).',

  THETA: 'Felellipsens rotationsvinkel – storaxelns riktning, räknad från norr i gon.',

  ALFA: 'Riktningsvinkel (bäring) från norr, medsols, i gon.',

  SIGMA_HZ: 'A priori standardosäkerhet för en horisontalriktning, i milligon, efter division med roten ur antalet helsatser.',

  SIGMA_D: 'A priori standardosäkerhet för en längdmätning: konstantdel i mm plus avståndsberoende del i ppm.',

  E_C: 'Centreringsfel – osäkerheten i att ställa instrument och prisma över punkten, sammanvägd enligt HMK Bilaga C.1.1.',

  FRIHETSGRADER: 'Frihetsgrader f = n − u, antalet överskjutande observationer. Fler frihetsgrader ger bättre kontroll.',

  QXX: 'Kofaktormatrisen Q_xx – normalmatrisens invers. Diagonalen ger de utjämnade obekantas varianser.',

  OBS_N: 'Antal observationer n. En mätning ger en eller två observationer beroende på observationstyp.',

  OBEKANTA_U: 'Antal obekanta u – två koordinater per fri punkt plus en orienteringskonstant per uppställning.',
});

/**
 * Attributsträng för användning i HTML-mallar.
 * Ger både title (desktop-hover) och data-tip (pekskärm).
 */
export function tipAttr(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `title="${esc}" data-tip="${esc}"`;
}

// ── Bubblan för pekskärm ────────────────────────────────────────────────────

let _bubbla = null;
let _timer  = null;
let _doljTimer = null;

function bubbla() {
  if (_bubbla) return _bubbla;
  _bubbla = document.createElement('div');
  _bubbla.className = 'tip-bubbla';
  _bubbla.setAttribute('role', 'tooltip');
  document.body.appendChild(_bubbla);
  return _bubbla;
}

function visa(text, x, y) {
  const el = bubbla();
  el.textContent = text;
  el.style.display = 'block';
  // Placera ovanför fingret och håll bubblan innanför fönstret.
  const r = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(x - r.width / 2, window.innerWidth - r.width - 8));
  const top  = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  el.style.left = `${left}px`;
  el.style.top  = `${top}px`;
  clearTimeout(_doljTimer);
  _doljTimer = setTimeout(dolj, VISA_MS);
}

export function dolj() {
  clearTimeout(_timer);
  clearTimeout(_doljTimer);
  if (_bubbla) _bubbla.style.display = 'none';
}

function _onTouchStart(e) {
  const mal = e.target.closest?.('[data-tip]');
  if (!mal) return;
  const t = e.touches?.[0];
  if (!t) return;
  const { clientX, clientY } = t;
  clearTimeout(_timer);
  // Håll-tid innan bubblan visas, så att vanliga tryck inte stör.
  _timer = setTimeout(() => visa(mal.dataset.tip, clientX, clientY), HALL_MS);
}

/**
 * Registrerar tooltip-hanteringen. Anropas en gång från main.js.
 * Säker att anropa flera gånger – lyssnarna registreras bara första gången.
 */
let _initierad = false;
export function initTooltips() {
  if (_initierad || typeof document === 'undefined') return;
  _initierad = true;

  // Pekskärm: tryck-och-håll. Registreras oavsett enhetstyp – hybrider med
  // både mus och touch ska fungera på båda sätten.
  document.addEventListener('touchstart', _onTouchStart, { passive: true });
  document.addEventListener('touchend', dolj, { passive: true });
  document.addEventListener('touchcancel', dolj, { passive: true });
  document.addEventListener('touchmove', dolj, { passive: true });
  document.addEventListener('scroll', dolj, { passive: true, capture: true });
}

/** Endast för tester. */
export function _reset() {
  _initierad = false;
  if (_bubbla) { _bubbla.remove(); _bubbla = null; }
  clearTimeout(_timer);
  clearTimeout(_doljTimer);
}
