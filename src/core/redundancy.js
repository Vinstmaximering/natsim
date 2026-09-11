// r-talets etikett och färg. Låg tidigare som två handskrivna trappor kopierade
// ur NätSim_Beta_2.html rad 1399–1400, med trösklarna 0,50 / 0,30 / 0,10 och
// samma fyra ord som k-talets skala använde.
//
// UI-städning Omgång 3 (2026-09-11) flyttade klassificeringen till
// klassificeraRtal() i core/constants.js. Två skäl:
//   • r-talet har ett eget normgolv (0,35, SIS-TS §6.2.2) som saknade band här.
//     En observation med r-tal 0,32 fick etiketten "Acceptabelt" trots att den
//     underkänns av normen.
//   • De fyra orden var identiska med k-talets, som har ett annat golv (0,50).
// Se blockkommentaren KVALITETSSKALOR i core/constants.js.
import { klassificeraRtal } from './constants.js';

/** Kartans linjefärg för en observations r-tal. */
export function rColor(r) { return klassificeraRtal(r).farg; }

/** Etikett för en observations r-tal. */
export function rLabel(r) { return klassificeraRtal(r).klass; }

/** CSS-klass för en observations r-tal. */
export function rClass(r) { return klassificeraRtal(r).cssKlass; }
