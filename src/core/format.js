// ─────────────────────────────────────────────────────────────────────────────
// SIFFER- OCH VINKELFORMATERING FÖR ALLT SOM VISAS FÖR ANVÄNDAREN
//
// Modulen räknar inte – den formaterar. Den ligger i core/ av samma skäl som
// fG/fD en gång låg i designmatrix.js: paneler, kartan, rapporterna och
// PM-modulen måste alla nå den utan att importera från ui/.
//
// Infördes i UI-städning Omgång 2 (2026-09-11). Underlag:
// docs/troubleshooting/ui_inventering_20260910.md, avsnitt A ("Genomgående
// språkbruksval") och B ("Inkonsistenser mellan UI-ytor").
//
// ── REGEL 1: DECIMALKOMMA ────────────────────────────────────────────────────
// Svensk konvention. Gäller allt en användare läser: paneler, dialoger,
// kartetiketter, PDF- och textrapporter.
//
// UNDANTAG som INTE får kommateras – de är maskinläsbara, inte text:
//   • value-attribut på <input type="number">. Webbläsaren accepterar bara
//     punkt; ett komma gör att fältet renderas tomt och värdet tappas.
//   • data-attribut som läses tillbaka med parseFloat (t.ex. data-val i
//     net-studio.js inline-redigering).
//   • CSV-export (ui/table-utils.js) – kommatecknet är fältavgränsare där.
//   • JSON-projektfiler, filnamn och ISO-datum.
//
// ── REGEL 2: VINKLAR I GON ───────────────────────────────────────────────────
// Alla riktningar och vinklar visas som gon med fyra decimaler. Hybridformatet
// 123g45'67.8" och DMS-växlaren togs bort i Omgång 2 – se designmatrix.js.
//
// Beräkningskärnan räknar fortfarande internt i GRADER (brgEN, calcM().hz,
// measHz i projektfilen). Konverteringen sker här, vid visningen, så att
// kärnan och sparade filer är oförändrade.
// ─────────────────────────────────────────────────────────────────────────────

/** Visas när ett värde saknas eller inte är ändligt. */
export const DASH = '–';

/** 1 gon = 0,9 grader. */
export const DEG_PER_GON = 0.9;

/**
 * Tal med svensk decimalkomma.
 * @param {number|null|undefined} value
 * @param {number} decimals
 */
export function nf(value, decimals = 2) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return DASH;
  return n.toFixed(decimals).replace('.', ',');
}

/**
 * Byter decimalpunkt mot komma i en färdigbyggd sträng. För värden som redan
 * formaterats på annat håll (t.ex. "2.80" ur simResult.kappa.toFixed(2)) eller
 * för sammansatta strängar som "1mm + 1.5ppm".
 * Rör bara punkter som står MELLAN två siffror, så att versionsnummer,
 * paragrafhänvisningar ("§6.2.2") och filändelser lämnas ifred.
 */
export function komma(s) {
  return String(s ?? '').replace(/(\d)\.(?=\d)/g, '$1,');
}

/**
 * Vinkel i gon med decimalkomma. Argumentet är GRADER – samma enhet som
 * brgEN() och calcM().hz levererar.
 * @param {number} deg
 * @param {number} decimals
 */
export function gon(deg, decimals = 4) {
  const n = Number(deg);
  if (deg === null || deg === undefined || !Number.isFinite(n)) return DASH;
  return nf(n / DEG_PER_GON, decimals);
}

/** Som gon(), men med utskriven enhet. För ytor där rubriken inte bär enheten. */
export function gonU(deg, decimals = 4) {
  const v = gon(deg, decimals);
  return v === DASH ? v : `${v} gon`;
}

/**
 * Gon → grader. Används när ett inmatningsfält tar gon men värdet lagras i
 * grader (mätningsmodalens "Uppmätt riktning").
 */
export function gonToDeg(gonValue) {
  const n = Number(String(gonValue).replace(',', '.'));
  return Number.isFinite(n) ? n * DEG_PER_GON : null;
}

/**
 * Grader → gon som RÅTT tal med punkt, för <input type="number">-värden.
 * Se undantagslistan överst: inputfält får inte ha komma.
 */
export function degToGonInput(deg, decimals = 4) {
  const n = Number(deg);
  return Number.isFinite(n) ? Number((n / DEG_PER_GON).toFixed(decimals)) : '';
}
