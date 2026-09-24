// Automatiska kontroller per nättyp (Etapp 5).
//
// Rena funktioner: ett ctx in, en lista kontrollrader ut. Varje rad är
//
//   { krav, kalla, resultat, status, grund }
//
// status är ett av:
//
//   'ok'      – kravet är uppfyllt
//   'fel'     – kravet är inte uppfyllt
//   'manuell' – programmet kan inte avgöra det; användaren måste kontrollera
//
// 'manuell' är inte ett mellanting mellan ok och fel. Den säger att NätSim
// SAKNAR underlag för att svara, och raden får då aldrig se ut som ett
// godkännande. Det gäller till exempel avståndet mellan stompunkter i tunnel:
// programmet vet inte vilka punkter som ligger i tunneln.
//
// grund säger VARIFRÅN svaret kommer, och är lika viktigt som svaret:
//
//   'beraknad' – programmet har räknat på nätet. k-talet, r-talen, antalet
//                punkter och höljeskontrollen är av det slaget.
//   'angiven'  – svaret bygger enbart på vad användaren fyllt i formuläret.
//                Att fältet för termometer är ifyllt betyder att någon skrivit
//                något där, inte att en kalibrerad termometer kommer att
//                användas. Sådana rader står som "Uppfyllt (enligt angivelse)"
//                och får aldrig läsas som att programmet kontrollerat saken.

import { nf } from '../../core/format.js';
import { klassificeraKtal, klassificeraRtal, K_NAT_GOLV, R_OBS_NORM } from '../../core/constants.js';
import { avvikelserMotTabell3 } from '../../data/tdok-apriori.js';

const TDOK = 'TDOK 2014:0571 v6.0';
const SIS  = 'SIS-TS 21143:2016';

const rad = (krav, kalla, resultat, status, grund = 'beraknad') =>
  ({ krav, kalla, resultat, status, grund });

/** Rad vars svar enbart bygger på vad användaren angett i formuläret. */
const angivenRad = (krav, kalla, resultat, status) =>
  rad(krav, kalla, resultat, status, 'angiven');

/** Fylld sträng eller null. Tomma fält räknas som "inte angivet". */
const ifylld = s => (s || '').toString().trim() || null;

// ── §2.8 K3 – k-tal och r-tal ───────────────────────────────────────────────

function kontrollKTal(ctx) {
  const k = ctx.sr.K_global;
  const ok = klassificeraKtal(k).uppfyllerNorm;
  return rad(
    `k-tal för nätet större än ${nf(K_NAT_GOLV, 2)}`,
    `${TDOK} §2.8 K3 · ${SIS} §6.2.2`,
    `k = ${nf(k, 3)}`,
    ok ? 'ok' : 'fel');
}

function kontrollRTal(ctx) {
  const rs = (ctx.redund || []).map(r => r.ri);
  if (!rs.length) {
    return rad(`Enskilda mätningar större än ${nf(R_OBS_NORM, 2)}`,
      `${TDOK} §2.8 K3 · ${SIS} §6.2.2`, 'Nätet har inga observationer.', 'fel');
  }
  const under = (ctx.redund || []).filter(r => !klassificeraRtal(r.ri).uppfyllerNorm);
  const minR = Math.min(...rs);
  return rad(
    `Enskilda mätningar större än ${nf(R_OBS_NORM, 2)}`,
    `${TDOK} §2.8 K3 · ${SIS} §6.2.2`,
    under.length
      ? `${under.length} av ${rs.length} observationer uppfyller inte kravet. ` +
        `Minsta r-tal ${nf(minR, 3)} (${under.slice(0, 3).map(r => `${r.fromId}→${r.toId}`).join(', ')}` +
        `${under.length > 3 ? ' m.fl.' : ''}).`
      : `Samtliga ${rs.length} observationer uppfyller kravet. Minsta r-tal ${nf(minR, 3)}.`,
    under.length ? 'fel' : 'ok');
}

// ── §2.8 K16 – mätklass G3 ──────────────────────────────────────────────────

function kontrollMatklass(ctx) {
  const vald = ctx.mkKey || null;
  return angivenRad(
    'Mätklass G3',
    `${TDOK} §2.8 K16 · ${SIS} Tabell A.9`,
    vald ? `Vald mätklass: ${vald}.` : 'Ingen mätklass vald i NätSim.',
    vald === 'G3' ? 'ok' : 'fel');
}

// ── §2.8 K15 och K19 – utrustning ───────────────────────────────────────────

function kontrollTvang(ctx) {
  const v = ifylld(ctx.tvangutr) || ifylld(ctx.tvang);
  return angivenRad('Tvångscentrering', `${TDOK} §2.8 K15`,
    v ? `Angiven: ${v}` : 'Ingen tvångscentreringsutrustning angiven.',
    v ? 'ok' : 'fel');
}

function kontrollTermBar(ctx) {
  const t = ifylld(ctx.termometer);
  const b = ifylld(ctx.barometer);
  const saknas = [!t && 'termometer', !b && 'barometer'].filter(Boolean);
  return angivenRad(
    'Temperatur och lufttryck mäts med kalibrerad termometer och barometer',
    `${TDOK} §2.8 K19`,
    saknas.length
      ? `Ingen ${saknas.join(' och ingen ')} angiven.`
      : `Termometer: ${t}. Barometer: ${b}.`,
    saknas.length ? 'fel' : 'ok');
}

// ── §2.8 K24 / K25 – viktsättning ───────────────────────────────────────────

function kontrollViktsattning(ctx) {
  if (ctx.verksamhet === 'jarnvag') {
    // K25: "Värden för standardosäkerhet enligt Tabell 3 ska användas som
    // underlag vid viktsättning." Kravet är att just de värdena ANVÄNDS – inte
    // att de inte överskrids. Ett lägre värde är därför lika mycket en
    // avvikelse som ett högre, och avvikelsen får en riktning.
    const avv = avvikelserMotTabell3({
      sigHz_mgon: ctx.mHz, sigDist_mm: ctx.mDm,
      sigDist_ppm: ctx.mDp, centerErr: ctx.centerErr,
    });
    const avvikande    = avv.filter(a => a.avviker);
    const optimistiska = avv.filter(a => a.riktning === 'optimistisk').length;
    return {
      ...rad('Värden enligt Tabell 3 används som underlag vid viktsättning',
        `${TDOK} §2.8 K25 Tabell 3`,
        avvikande.length
          ? `${avvikande.length} av ${avv.length} storheter avviker från tabellen` +
            (optimistiska
              ? `, varav ${optimistiska} optimistiskt – mindre än tabellen, vilket ger ` +
                `för gynnsamma punktosäkerheter.`
              : ' – samtliga försiktiga, alltså större än tabellen.')
          : 'Samtliga storheter är satta enligt tabellen.',
        avvikande.length ? 'fel' : 'ok'),
      // Detaljraderna redovisas under kontrollen, så att det syns VAD som
      // avviker och åt vilket håll.
      detaljer: avv,
    };
  }
  // K24 (väg): viktsättning enligt SIS-TS §6.2.2. Vilken viktsättning som
  // faktiskt tillämpas avgörs i beräkningsprogrammet, inte i simuleringen.
  return rad('Viktsättning enligt SIS-TS 21143:2016 §6.2.2',
    `${TDOK} §2.8 K24`,
    'NätSim simulerar med angivna a priori-värden. Att viktsättningen i ' +
    'beräkningsprogrammet följer §6.2.2 kan programmet inte avgöra.',
    'manuell');
}

// ── §6.2.5 – simulering utförd ──────────────────────────────────────────────

const kontrollSimulering = (ctx, kalla) => rad(
  'Simulering utförd enligt SIS-TS 21143:2016 §6.2.5',
  kalla,
  `Simulering genomförd: ${ctx.sr.meas_n} observationer, ${ctx.sr.unkn_n} obekanta, ` +
  `redundans ${ctx.sr.redundancy}.`,
  ctx.sr.meas_n > 0 ? 'ok' : 'fel');

// ── §2.11.2 – bro ───────────────────────────────────────────────────────────

function kontrollAntalPunkter(ctx) {
  const n = ctx.allPts.length;
  return rad('Minst 4 punkter', `${TDOK} §2.11.2 K2`,
    `Nätet har ${n} punkter.`, n >= 4 ? 'ok' : 'fel');
}

/**
 * §2.11.2 K2 – punkterna ska omsluta byggnadsverket.
 *
 * Går att avgöra automatiskt bara om användaren pekat ut ett visuellt lager som
 * byggnadsverk. Då prövas om lagrets objekt ligger innanför nätpunkternas
 * konvexa hölje. Utan utpekat lager vet programmet inte var byggnadsverket är,
 * och raden blir 'manuell'.
 */
function kontrollOmsluter(ctx) {
  const KRAV  = 'Punkterna omsluter byggnadsverket';
  const KALLA = `${TDOK} §2.11.2 K2`;

  const lager = ctx.byggnadsverk;
  if (!lager || !lager.punkter?.length) {
    return rad(KRAV, KALLA,
      'Inget visuellt lager är utpekat som byggnadsverk, så läget är okänt för ' +
      'programmet. Kontrollera mot ritning att nätpunkterna omsluter byggnadsverket.',
      'manuell');
  }

  const holje = konvextHolje(ctx.allPts.map(p => ({ x: p.E, y: p.N })));
  if (holje.length < 3) {
    return rad(KRAV, KALLA,
      'Nätpunkterna bildar ingen yta (de ligger på en linje), så inget kan omslutas.',
      'fel');
  }

  const utanfor = lager.punkter.filter(p => !inomHolje({ x: p.E, y: p.N }, holje));
  return rad(KRAV, KALLA,
    utanfor.length
      ? `${utanfor.length} av ${lager.punkter.length} objekt i lagret "${lager.namn}" ` +
        `ligger utanför nätpunkternas konvexa hölje.`
      : `Samtliga ${lager.punkter.length} objekt i lagret "${lager.namn}" ligger ` +
        `innanför nätpunkternas konvexa hölje.`,
    utanfor.length ? 'fel' : 'ok');
}

function kontrollGemensamma(ctx) {
  const n = ctx.nGemensam;
  return angivenRad('Minst 2 markeringar gemensamma med stomnät i plan för järnväg',
    `${TDOK} §2.11.2 K4`,
    `${n} ${n === 1 ? 'punkt är' : 'punkter är'} utpekade som gemensamma.`,
    n >= 2 ? 'ok' : 'fel');
}

function kontrollKonfiguration(ctx) {
  return rad(
    'Punktantal och konfiguration säkerställer att toleranser för detaljmätning ' +
    'och kontrollmätning kan innehållas',
    `${TDOK} §2.11.2 K3`,
    'Toleranserna för detaljmätning och kontrollmätning är projektspecifika och ' +
    'finns inte i NätSim. Bedöm mot projektets toleranskrav.',
    'manuell');
}

// ── §2.10.2 – tunnel ────────────────────────────────────────────────────────

const TUNNEL_MAX_M = 200;

/**
 * §2.10.2 K3 – avstånd mellan stompunkter i tunnel högst 200 m.
 *
 * NätSim vet inte vilka punkter som ligger i tunneln, så kravet kan inte
 * avgöras automatiskt. Raden blir 'manuell', men listar de planerade linjer som
 * är längre än 200 m som underlag för den manuella kontrollen.
 */
function kontrollTunnelAvstand(ctx) {
  const langa = (ctx.redund || [])
    .filter(r => r.type === 'dist' && r.d > TUNNEL_MAX_M)
    // Samma mätning kan förekomma som både riktning och avstånd; unika par.
    .filter((r, i, a) => a.findIndex(x => x.fromId === r.fromId && x.toId === r.toId) === i)
    .map(r => ({ fran: r.fromId, till: r.toId, d: r.d }))
    .sort((a, b) => b.d - a.d);

  return {
    ...rad(`Avstånd mellan stompunkter i tunnel högst ${TUNNEL_MAX_M} m`,
      `${TDOK} §2.10.2 K3`,
      langa.length
        ? `${langa.length} planerade nätlinjer är längre än ${TUNNEL_MAX_M} m. ` +
          `NätSim vet inte vilka punkter som ligger i tunneln – pröva listan nedan ` +
          `mot tunnelns sträckning.`
        : `Ingen planerad nätlinje är längre än ${TUNNEL_MAX_M} m. Kravet gäller ` +
          `punkter i tunnel, vilket programmet inte kan avgöra.`,
      'manuell'),
    langaLinjer: langa,
  };
}

// ── Konvext hölje och punkt-i-polygon ───────────────────────────────────────
// Andrews monotone chain. Rent geometriskt, inga beroenden.

export function konvextHolje(punkter) {
  const p = [...punkter].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const kryss = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bygg = lista => {
    const ut = [];
    for (const q of lista) {
      while (ut.length >= 2 && kryss(ut[ut.length - 2], ut[ut.length - 1], q) <= 0) ut.pop();
      ut.push(q);
    }
    ut.pop();
    return ut;
  };
  return [...bygg(p), ...bygg([...p].reverse())];
}

/** Punkt innanför eller på polygonens rand. Ray casting med randfall. */
export function inomHolje(pt, polygon) {
  const n = polygon.length;
  if (n < 3) return false;
  let inne = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i], b = polygon[j];
    // På randen räknas som innanför: en nätpunkt som sammanfaller med ett
    // hörn av byggnadsverket omsluter det fortfarande.
    const kryss = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    const pa = Math.min(a.x, b.x) - 1e-9 <= pt.x && pt.x <= Math.max(a.x, b.x) + 1e-9 &&
               Math.min(a.y, b.y) - 1e-9 <= pt.y && pt.y <= Math.max(a.y, b.y) + 1e-9;
    if (Math.abs(kryss) < 1e-9 && pa) return true;
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

// ── SIS-TS §6.2.2 utan TDOK-hänvisning (mall D) ─────────────────────────────
// Samma två storheter och samma gränser, men källan är SIS-TS ensamt: ett
// dokument utanför Trafikverket ska inte hänvisa till TDOK.

const SIS_KALLA = `${SIS} §6.2.2`;

const sisKTal = ctx => ({ ...kontrollKTal(ctx), kalla: SIS_KALLA });
const sisRTal = ctx => ({ ...kontrollRTal(ctx), kalla: SIS_KALLA });

// ── Sammanställning per nättyp ──────────────────────────────────────────────

/**
 * Kontrollraderna för ett dokument.
 *
 * Mall D (Ej Trafikverket) får bara de två kontroller SIS-TS 21143:2016 §6.2.2
 * självt ställer – k-talet och r-talen. TDOK:s krav gäller Trafikverkets
 * uppdrag och har ingenting i ett dokument utanför dem att göra.
 *
 * @returns {Array<{krav, kalla, resultat, status, grund, detaljer?, langaLinjer?}>}
 */
export function kontroller(ctx) {
  const { nattyp, verksamhet } = ctx;

  if (verksamhet !== 'vag' && verksamhet !== 'jarnvag') {
    // Utan vald verksamhet är dokumenttypen inte bestämd, och ingen kontroll
    // kan hänföras till rätt norm.
    if (!verksamhet) return [];
    return [sisKTal(ctx), sisRTal(ctx)];
  }

  if (nattyp === 'bruksnat') {
    return [
      kontrollKTal(ctx),
      kontrollRTal(ctx),
      kontrollMatklass(ctx),
      kontrollTvang(ctx),
      kontrollTermBar(ctx),
      kontrollViktsattning(ctx),
    ];
  }

  if (nattyp === 'bro') {
    const ut = [
      kontrollAntalPunkter(ctx),
      kontrollOmsluter(ctx),
      kontrollKonfiguration(ctx),
      kontrollSimulering(ctx, `${TDOK} §2.11.2 K5 · ${SIS} §6.2.5`),
    ];
    // K4 gäller bara järnväg.
    if (verksamhet === 'jarnvag') ut.splice(3, 0, kontrollGemensamma(ctx));
    return ut;
  }

  if (nattyp === 'tunnel') {
    return [
      kontrollSimulering(ctx, `${TDOK} §2.10.2 K2 · ${SIS} §6.2.5`),
      kontrollTunnelAvstand(ctx),
    ];
  }

  return [];
}

/** Sammanfattning: antal per status, och hur många som bygger på angivelse. */
export function sammanfatta(rader) {
  return {
    ok:      rader.filter(r => r.status === 'ok').length,
    fel:     rader.filter(r => r.status === 'fel').length,
    manuell: rader.filter(r => r.status === 'manuell').length,
    angivna: rader.filter(r => r.grund === 'angiven').length,
  };
}

export const STATUS_TEXT = Object.freeze({
  ok:      'Uppfyllt',
  fel:     'Ej uppfyllt',
  manuell: 'Kontrolleras manuellt',
});

/**
 * Utfallstexten för en rad. En kontroll som bara bygger på vad användaren fyllt
 * i får tillägget "(enligt angivelse)" – programmet har inte kontrollerat
 * saken, bara läst ett fält.
 */
export function statusText(r) {
  if (r.status === 'manuell') return STATUS_TEXT.manuell;
  return r.grund === 'angiven'
    ? `${STATUS_TEXT[r.status]} (enligt angivelse)`
    : STATUS_TEXT[r.status];
}
