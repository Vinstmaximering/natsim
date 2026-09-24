// Simulering och kvalitetsbedömning i PM-rapporten (Etapp 5).
//
// TERMINOLOGI. v6 inför GUM (versionsloggen s. 50), och rubriker och tabeller
// säger därför "standardosäkerhet" där de tidigare sa "medelfel". Symbolerna är
// oförändrade: σ_N, σ_E, σ_pos, σ_a och σ_b är samma storheter som förut.
//
// UTÖKAD OSÄKERHET. §1 K2: "Om inget anges kopplat till uttrycket osäkerhet är
// det täckningsfaktor 2 som avses." Definitionen på s. 8 säger att utökad
// lägesosäkerhet är standardosäkerheten multiplicerad med en täckningsfaktor,
// och att dokumentet använder faktorn 2. Rapporten redovisar därför både
// u (1σ) och U = 2·u.
//
// Vad U INTE är: någon bestämd konfidensnivå för σ_pos. För en normalfördelad
// storhet i EN dimension motsvarar k = 2 ungefär 95 %, men σ_pos är en
// tvådimensionell storhet och relationen är en annan. TDOK säger ingenting om
// konfidensnivå för σ_pos, och rapporten får därför inte heller göra det.

import { nf, komma } from '../../core/format.js';
import { K_R_KALLA, klassificeraRtal } from '../../core/constants.js';
import { rColor } from '../../core/redundancy.js';
import { identifieraForval, TDOK_TABELL3_JARNVAG } from '../../data/tdok-apriori.js';
import { kontroller, sammanfatta, STATUS_TEXT } from './kontroller.js';
import {
  H2, H2opt, esc, mono, stycke, metaTabell, dataTabell,
} from './blocks.js';

// ── Kravets storhet ─────────────────────────────────────────────────────────

/** Täckningsfaktorn kravet avser: 1 (standardosäkerhet) eller 2 (utökad). */
export const kravFaktor = ctx => (ctx.kravk === '1' ? 1 : 2);

/** Storheten kravet jämförs mot, i klartext. */
export const kravStorhet = ctx => (kravFaktor(ctx) === 1
  ? 'standardosäkerheten u (täckningsfaktor 1)'
  : 'den utökade osäkerheten U = 2·u (täckningsfaktor 2)');

/**
 * Jämför en punkts osäkerhet mot kravet – mot RÄTT storhet.
 * @param {object} ctx
 * @param {number} sigPos_m standardosäkerhet i meter
 * @returns {{u:number, U:number, jamfort:number, ok:boolean|null}} mm; ok=null utan krav
 */
export function jamforKrav(ctx, sigPos_m) {
  const u = sigPos_m * 1000;
  const U = 2 * u;
  const jamfort = kravFaktor(ctx) === 1 ? u : U;
  if (ctx.kravSP == null) return { u, U, jamfort, ok: null };
  return { u, U, jamfort, ok: jamfort <= ctx.kravSP };
}

// ── A priori-avsnittet ──────────────────────────────────────────────────────

function aprioriAvsnitt(ctx) {
  // Förvalet identifieras ur de faktiska värdena, inte ur ett sparat val:
  // användaren kan ha ändrat en enskild mätning efter att förvalet tillämpats.
  const forval = identifieraForval({
    sigHz_mgon: ctx.mHz, sigDist_mm: ctx.mDm,
    sigDist_ppm: ctx.mDp, centerErr: ctx.centerErr,
  });

  let h = H2('A priori standardosäkerheter');
  h += dataTabell(['Storhet', 'Standardosäkerhet', 'Helsatser'],
    `<tr><td>Horisontalriktningar</td><td>${nf(ctx.mHz, 3)} mgon</td><td>${ctx.mSt}</td></tr>
     <tr><td>Längder</td><td>${nf(ctx.mDm, 1)} mm + ${nf(ctx.mDp, 1)} ppm</td><td>–</td></tr>
     <tr><td>Centrering i plan</td><td>${nf(ctx.centerErr, 1)} mm</td><td>–</td></tr>`);

  h += `<p class="rnot"><strong>Förval:</strong> ` +
       (forval
         ? `${esc(forval.l)} <span class="rkalla">${esc(forval.kalla)}</span>`
         : 'användardefinierat – värdena motsvarar inget av NätSims förval') +
       `.</p>`;

  // Tabell 3 anger två storheter till. De påverkar inte ett nät i plan, och det
  // ska framgå så att läsaren inte tror att de utelämnats av misstag.
  if (forval?.id === TDOK_TABELL3_JARNVAG.id) {
    const extra = TDOK_TABELL3_JARNVAG.utanforPlan
      .map(u => `${esc(u.storhet.toLowerCase())} ${esc(u.varde)}`).join(' och ');
    h += `<p class="rnot">${esc(TDOK_TABELL3_JARNVAG.kalla)} anger dessutom ${extra}. ` +
         `De påverkar inte ett nät i plan och ingår därför inte i simuleringen.</p>`;
  }
  return h;
}

// ── Kontrolltabellen ────────────────────────────────────────────────────────

export function kontrolltabell(ctx, rubrik, kalla) {
  const rader = kontroller(ctx);
  if (!rader.length) return "";

  const sum = sammanfatta(rader);
  const statusCell = r => {
    const kl = { ok: 'rok', fel: 'rerr', manuell: 'rwrn' }[r.status];
    return `<td class="${kl}">${STATUS_TEXT[r.status]}</td>`;
  };

  let kropp = "";
  for (const r of rader) {
    kropp += `<tr>
      <td>${esc(r.krav)}</td>
      <td class="rkalla-cell">${esc(r.kalla)}</td>
      <td>${esc(r.resultat)}</td>
      ${statusCell(r)}</tr>`;

    // Detaljer till §2.8 K25: vilken storhet som avviker, och med vad.
    if (r.detaljer?.length) {
      kropp += `<tr><td colspan="4" class="rdetalj">
        <table class="r"><tr><th>Storhet</th><th>Tabell 3</th><th>NätSim</th><th>Utfall</th></tr>` +
        r.detaljer.map(d => `<tr><td>${esc(d.storhet)}</td><td>${esc(d.kravVarde)}</td>
          <td>${esc(d.faktisktVarde)}</td>
          <td class="${d.avviker ? 'rerr' : 'rok'}">${d.avviker ? 'Överstiger' : 'Inom'}</td></tr>`).join("") +
        `</table></td></tr>`;
    }

    // Underlag till §2.10.2 K3: nätlinjer längre än 200 m.
    if (r.langaLinjer?.length) {
      kropp += `<tr><td colspan="4" class="rdetalj">
        <table class="r"><tr><th>Nätlinje</th><th>Längd (m)</th></tr>` +
        r.langaLinjer.map(l => `<tr><td>${esc(l.fran)} → ${esc(l.till)}</td>
          <td style="text-align:right;font-family:monospace">${nf(l.d, 1)}</td></tr>`).join("") +
        `</table></td></tr>`;
    }
  }

  return H2opt(rubrik, kalla) +
    `<table class="r"><tr><th>Krav</th><th>Källa</th><th>Resultat</th><th>Utfall</th></tr>${kropp}</table>` +
    `<p class="rnot">Uppfyllt (${sum.ok}) · Ej uppfyllt (${sum.fel}) · ` +
    `Kontrolleras manuellt (${sum.manuell}). "Kontrolleras manuellt" betyder att NätSim ` +
    `saknar underlag för att avgöra kravet – inte att det är uppfyllt.</p>`;
}

// ── Hela simuleringsavsnittet ───────────────────────────────────────────────

export function simulering(ctx, rubrik, kalla) {
  const kOk = ctx.kKlass.uppfyllerNorm;
  const f   = kravFaktor(ctx);

  let h = H2opt(rubrik, kalla);
  h += `<p class="r">Simulering utförd enligt SIS-TS 21143:2016 §6.2.5 och ` +
       `HMK – Stommätning 2024 Bilaga F.</p>`;

  // ── Nätstatistik ──
  h += H2('Nätstatistik') + metaTabell([
    ['Observationer (n)', String(ctx.sr.meas_n)],
    ['Obekanta (u)', String(ctx.sr.unkn_n)],
    ['Redundans f = n − u', String(ctx.sr.redundancy)],
    ['Kontrollerbarhet k = f/n', `${nf(ctx.sr.K_global, 3)} – ${ctx.kKlass.klass}`],
    ['κ (HMK Formel F.16)', komma(ctx.sr.kappa)],
    ['Minsta r-tal (avst.)', nf(ctx.sr.rMinDist, 3)],
    ['Minsta r-tal (riktning)', nf(ctx.sr.rMinHz, 3)],
  ]);
  h += `<div class="rbox ${kOk ? 'bok' : 'berr'}"><strong>Kontrollerbarhet:</strong> ` +
       `Nätet uppfyller ${kOk ? '' : 'inte '}kravet k &gt; 0,50 (${esc(K_R_KALLA)}).</div>`;

  h += aprioriAvsnitt(ctx);

  // ── Punktosäkerheter: u och U ──
  h += H2('Förväntade punktosäkerheter');
  h += `<p class="r">u är standardosäkerheten (täckningsfaktor 1), det simuleringen ` +
       `räknar fram. U är den utökade osäkerheten, U = 2·u, med täckningsfaktor 2 enligt ` +
       `TDOK 2014:0571 v6.0 §1 K2.</p>`;

  h += ctx.kravStr
    ? `<div class="rbox"><strong>Toleranskrav:</strong> ${komma(esc(ctx.kravStr))} mm. ` +
      `Kravet jämförs mot ${esc(kravStorhet(ctx))}.</div>`
    : `<p class="r rtom">Inget toleranskrav angivet. Punktosäkerheterna redovisas utan ` +
      `jämförelse.</p>`;

  const spTab = ctx.ptRes.map(r => {
    const { u, U, ok } = jamforKrav(ctx, r.sigPos);
    const farg = ok == null ? "" : `;color:${ok ? "#006600" : "#cc0000"}`;
    const jamford = v => `<td style="text-align:right;font-family:monospace;font-weight:700${farg}">${v}</td>`;
    return `<tr><td>${esc(r.id)}</td>
      ${mono(nf(r.sigN * 1000, 2))}${mono(nf(r.sigE * 1000, 2))}
      ${f === 1 ? jamford(nf(u, 2)) : mono(nf(u, 2))}
      ${f === 2 ? jamford(nf(U, 2)) : mono(nf(U, 2))}
      ${mono(nf(r.aSemi ? r.aSemi * 1000 : null, 2))}${mono(nf(r.bSemi ? r.bSemi * 1000 : null, 2))}</tr>`;
  }).join("");

  h += dataTabell(
    ['Punkt', 'σ_N (mm)', 'σ_E (mm)', 'u = σ_pos (mm)', 'U = 2·u (mm)', 'σ_a (mm)', 'σ_b (mm)'],
    spTab);
  h += `<p class="rnot">Den fetmarkerade kolumnen är den som jämförts mot kravet. ` +
       `U = 2·u är utökad osäkerhet med täckningsfaktor 2 (TDOK 2014:0571 v6.0 §1 K2). ` +
       `Täckningsfaktorn säger hur u multiplicerats; den anger ingen konfidensnivå för ` +
       `σ_pos, som är en storhet i två dimensioner.</p>`;

  const spvU = ctx.ptRes.map(r => r.sigPos * 2000);
  h += metaTabell([
    ['Medel u', `${ctx.spMean} mm`],
    ['Största u', `${ctx.spMax} mm`],
    ['Största U = 2·u', spvU.length ? `${nf(Math.max(...spvU), 2)} mm` : '–'],
  ]);

  // ── r-tal, MUF, YT ──
  h += H2('Mätningars r-tal, MUF och YT');
  h += `<p class="r">r-tal = observationens redundanstal, i HMK betecknat k_i (HMK Formel F.2) ` +
       `– ej att förväxla med nätets globala k-tal ovan. MUF = minsta upptäckbara fel ` +
       `(HMK Formel F.13). YT = yttre tillförlitlighet.</p>`;

  // Tre nivåer ur klassificeraRtal(), samma skala som kartan, valideringen och
  // legenden under tabellen. Tabellen färgades tidigare i två steg vid 0,50 och
  // motsade därmed sin egen förklaring.
  const rdTab = ctx.redund.map(r => {
    const muf = r.mdb
      ? (r.type === "dist" ? nf(r.mdb.val * 1000, 1) + " mm" : nf(r.mdb.val, 3) + " mgon")
      : "–";
    const yt = r.yt_m != null && r.yt_m !== Infinity
      ? (r.type === "dist" ? nf(r.yt_m * 1000, 1) + " mm"
                           : nf(r.yt_m / r.d * (200000 / Math.PI), 3) + " mgon")
      : (r.yt_m === Infinity ? "∞" : "–");
    return `<tr><td style="font-weight:700">${esc(r.fromId)}→${esc(r.toId)}</td>
      <td>${r.type === "dist" ? "Avstånd" : "Riktning"}</td>
      <td style="text-align:right;font-family:monospace;font-weight:700;color:${rColor(r.ri)}">${nf(r.ri, 3)}</td>
      <td>${esc(klassificeraRtal(r.ri).klass)}</td>
      ${mono(muf)}${mono(yt)}</tr>`;
  }).join("");

  h += dataTabell(['Från → Till', 'Typ', 'r-tal', 'Bedömning', 'MUF', 'YT'], rdTab);
  h += `<p class="rnot">Grön = r-tal ≥ 0,50, ingen anmärkning (HMK Bilaga F.2) · ` +
       `gul = r-tal &gt; 0,35 och &lt; 0,50, uppfyller kravet · röd = r-tal ≤ 0,35, ` +
       `uppfyller inte kravet. Källa: ${esc(K_R_KALLA)}.</p>`;
  h += `<div class="rbox"><strong>Inre tillförlitlighet (MUF):</strong> minsta grova fel som ` +
       `kan detekteras är ${ctx.mufMaxD !== "–" ? `avstånd ≤ ${ctx.mufMaxD} mm ` : ""}` +
       `${ctx.mufMaxH !== "–" ? `riktning ≤ ${ctx.mufMaxH} mgon` : ""}. ` +
       `<strong>YT:</strong> största koordinatpåverkan ${ctx.ytMaxD} mm. ` +
       `<strong>Spridning i r-talen:</strong> σ(r-tal) = ${nf(ctx.rStd, 3)}.</div>`;

  if (ctx.omdome) h += H2('Noteringar') + stycke(ctx.omdome);
  return h;
}
