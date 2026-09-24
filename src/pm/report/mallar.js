// De fyra rapportmallarna (Etapp 4).
//
// Varje mall är en ren funktion ctx → HTML-sträng. Rubrikerna är normens; deras
// ordning följer den paragraf som kräver dokumentet. Varje rubrik bär sin källa.
//
//   A  Väg, bruksnät      Redovisning av planerat stomnät   §2.5 K2
//   B  Järnväg, bruksnät  Åtgärdsförslag                    §2.5 K1
//   C  Bro eller tunnel   Mätningsprogram                   §1.7 K1
//   D  Ej Trafikverket    Planering av stomnät              SIS-TS Bilaga B kolumn P
//
// Mall D är ett PRODUKTVAL för uppdrag utanför Trafikverket – SIS-TS Bilaga B
// kolumn P är normativ som redovisningsstruktur, men att NätSim väljer just den
// för icke-Trafikverksuppdrag är beställarens beslut, inte ett krav. Det står
// utskrivet i mallen.

import {
  H1, H2, esc, stycke, styckeEllerTomt, metaTabell, produktval, godkannande,
  forsattsblad, foreskrifter, personal, referenssystem, kandaPunkter,
  planeradePunkter, allaPunkter, tillstandsbedomning, bild, stommatningsplan,
  tidplan, instrument, programvaror, matklass, genomforande, leverans,
  simulering,
} from './blocks.js';

const TDOK = 'TDOK 2014:0571 v6.0';
const SIS  = 'SIS-TS 21143:2016';

// ── Mall A – Väg, bruksnät i plan ───────────────────────────────────────────
// §2.5 K2: redovisningen av planerat stomnät ska minst omfatta sammanfattning
// av planeringen (nätets syfte, anslutningslösning, planerat genomförande),
// utgångspunkter för anslutning, planerade lägen för nypunkter och
// markeringstyper, nätskiss eller stommätningsplan, tidplan samt eventuell
// sessionsindelning vid GNSS-mätning, instrument, mottagare/antenner och
// kompletterande utrustning, samt programvaror för beräkning och analys.

export function mallA(ctx) {
  let h = forsattsblad(ctx);

  h += `<div class="rb">`;
  h += H1('1. Sammanfattning av planeringen', `${TDOK} §2.5 K2`);
  h += H2('Nätets syfte', `${TDOK} §2.5 K2`);
  h += styckeEllerTomt(ctx.syfte, 'Nätets syfte anges i steg 1.');
  h += H2('Anslutningslösning', `${TDOK} §2.5 K2`);
  h += styckeEllerTomt(ctx.anslutning, 'Anslutningslösningen anges i steg 1.');
  h += genomforande(ctx, 'Planerat genomförande', `${TDOK} §2.5 K2`);
  h += foreskrifter(ctx, `${TDOK} §1`);
  h += personal(ctx, `${TDOK} §1.1`);
  h += referenssystem(ctx, `${TDOK} §1.2 · §1.6`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('2. Utgångspunkter för anslutning', `${TDOK} §2.5 K2`);
  h += kandaPunkter(ctx, 'Kända punkter', `${TDOK} §2.5 K2`);
  h += bild(ctx, 'r33', 'Anslutningspunkternas lägen', `${TDOK} §2.5 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('3. Planerade nypunkter och markeringstyper', `${TDOK} §2.5 K2 · §2.4.1 K3`);
  h += planeradePunkter(ctx, 'Planerade lägen och markeringstyper', `${TDOK} §2.4.1 K3 Tabell 2`);
  h += bild(ctx, 'r32', 'Översikt av nätet', `${TDOK} §2.5 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('4. Nätskiss och stommätningsplan', `${TDOK} §2.5 K2`);
  h += stommatningsplan(ctx, 'Stommätningsplan', `${TDOK} §2.5 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('5. Tidplan och sessionsindelning', `${TDOK} §2.5 K2`);
  h += tidplan(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('6. Instrument, utrustning och programvaror', `${TDOK} §2.5 K2`);
  h += instrument(ctx, 'Instrument, mottagare/antenner och kompletterande utrustning',
                  `${TDOK} §2.5 K2 · §2.8 K15 · K19`);
  h += matklass(ctx, 'Mätklass', `${TDOK} §2.8 K16 · ${SIS} Tabell A.9`);
  h += programvaror(ctx, 'Programvaror för beräkning och analys', `${TDOK} §2.5 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('7. Simulering och kvalitetsbedömning', `${SIS} §6.2.5`);
  h += simulering(ctx, null, null);
  h += bild(ctx, 'r312', 'Lägesosäkerheter', `${SIS} §6.2.5`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('8. Leverans');
  h += produktval('§2.5 K2 räknar inte upp leverans bland det redovisningen ska omfatta. ' +
                  'Avsnittet följer SIS-TS 21143:2016 Bilaga B R4.1 och R4.2 och tas med ' +
                  'för att uppdraget ska kunna avslutas entydigt.');
  h += leverans(ctx, 'Leveransomfattning och format', `${SIS} Bilaga B R4.1 · R4.2`);
  h += godkannande('Redovisningen av planerat stomnät ska godkännas av beställaren innan ' +
                   'markering utförs.', `${TDOK} §2.8 K11–K12`);
  h += allaPunkter(ctx, 'Planerade koordinater (preliminära)', null,
    'Koordinaterna är de planerade punktlägen simuleringen räknat på, inte inmätta ' +
    'värden. Förteckningen tas med som underlag för rekognosering och utsättning.');
  h += `</div>`;
  return h;
}

// ── Mall B – Järnväg, bruksnät i plan ───────────────────────────────────────
// §2.5 K1: åtgärdsförslaget ska minst omfatta mätningsteknisk redogörelse
// enligt §1.8, dokumenterad tillståndsbedömning enligt §2.1 och stommätningsplan.
// Del 1 följer rubrikerna i §1.8 K2 i den ordning paragrafen anger.

export function mallB(ctx) {
  let h = forsattsblad(ctx);

  h += `<div class="rb">`;
  h += H1('Del 1 – Mätningsteknisk redogörelse', `${TDOK} §2.5 K1 · §1.8`);
  h += H2('1.1 Omfattning och syfte', `${TDOK} §1.8 K2`);
  h += styckeEllerTomt(ctx.syfte, 'Nätets syfte anges i steg 1.');
  h += styckeEllerTomt(ctx.anslutning, 'Anslutningslösningen anges i steg 1.');
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.2 Gällande föreskrifter', `${TDOK} §1.8 K2`);
  h += foreskrifter(ctx, `${TDOK} §1.8 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.3 Tekniska grundfakta', `${TDOK} §1.8 K2`);
  h += referenssystem(ctx, `${TDOK} §1.2 · §1.6`);
  h += matklass(ctx, 'Mätklass', `${TDOK} §2.8 K16 · ${SIS} Tabell A.9`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.4 Instrument, utrustning och programvaror', `${TDOK} §1.8 K2`);
  h += instrument(ctx, 'Instrument och kompletterande utrustning',
                  `${TDOK} §1.8 K2 · §2.8 K15 · K19`);
  h += programvaror(ctx, 'Programvaror', `${TDOK} §1.8 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.5 Personal', `${TDOK} §1.8 K2 · §1.1`);
  h += personal(ctx, `${TDOK} §1.1 K1–K3`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.6 Utgångs- och underlagsmaterial', `${TDOK} §1.8 K2`);
  h += kandaPunkter(ctx, 'Kända punkter och koordinatkälla', `${TDOK} §1.8 K2`);
  h += bild(ctx, 'r33', 'Anslutningspunkternas lägen', `${TDOK} §1.8 K2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.7 Tidpunkt för genomförande', `${TDOK} §1.8 K2`);
  h += tidplan(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.8 Genomförande och resultat', `${TDOK} §1.8 K2`);
  h += genomforande(ctx, 'Planerat genomförande', `${TDOK} §1.8 K2`);
  h += planeradePunkter(ctx, 'Planerade nypunkter och markeringstyper',
                        `${TDOK} §2.4.1 K3 Tabell 2`);
  h += bild(ctx, 'r32', 'Översikt av nätet', `${TDOK} §1.8 K2`);
  h += simulering(ctx, 'Simulering och kvalitetsbedömning', `${SIS} §6.2.5`);
  h += bild(ctx, 'r312', 'Lägesosäkerheter', `${SIS} §6.2.5`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H2('1.9 Leverans', `${TDOK} §1.8 K2`);
  h += leverans(ctx, 'Leveransomfattning och format', `${SIS} Bilaga B R4.1 · R4.2`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('Del 2 – Tillståndsbedömning', `${TDOK} §2.5 K1 · §2.1`);
  h += tillstandsbedomning(ctx, 'Bedömning av befintliga stompunkter', `${TDOK} §2.1 K5`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('Del 3 – Stommätningsplan', `${TDOK} §2.5 K1`);
  h += stommatningsplan(ctx, 'Planerade observationer', `${TDOK} §2.5 K1`);
  h += godkannande('Åtgärdsförslaget ska godkännas av beställaren innan fortsatt arbete ' +
                   'med stomnätet.', `${TDOK} §2.8 K9–K10`);
  h += allaPunkter(ctx, 'Planerade koordinater (preliminära)', null,
    'Koordinaterna är de planerade punktlägen simuleringen räknat på, inte inmätta ' +
    'värden. Förteckningen tas med som underlag för rekognosering och utsättning.');
  h += `</div>`;
  return h;
}

// ── Mall C – Bro eller tunnel, mätningsprogram ──────────────────────────────
// §1.7 K1: mätningsprogrammet ska minst innehålla mätningarnas syfte,
// mätningarnas omfattning, befintliga förutsättningar och underlag, tider som
// programmet ska förhålla sig till, referenssystem, planerat genomförande, vad
// som ska dokumenteras, vad som ska redovisas och hur redovisning ska ske.

export function mallC(ctx) {
  const bro = ctx.nattyp === 'bro';
  let h = forsattsblad(ctx);

  h += `<div class="rb">`;
  h += H1('1. Mätningarnas syfte', `${TDOK} §1.7 K1`);
  h += styckeEllerTomt(ctx.syfte, 'Mätningarnas syfte anges i steg 1.');
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('2. Mätningarnas omfattning', `${TDOK} §1.7 K1`);
  h += styckeEllerTomt(ctx.anslutning, 'Omfattning och anslutningslösning anges i steg 1.');
  h += planeradePunkter(ctx, 'Planerade nypunkter och markeringstyper',
                        `${TDOK} §2.4.1 K3 Tabell 2`);
  h += foreskrifter(ctx, `${TDOK} §1.7 K1`);
  h += personal(ctx, `${TDOK} §1.1`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('3. Befintliga förutsättningar och underlag', `${TDOK} §1.7 K1`);
  h += kandaPunkter(ctx, 'Kända punkter och koordinatkälla', `${TDOK} §1.7 K1`);
  h += bild(ctx, 'r33', 'Anslutningspunkternas lägen', `${TDOK} §1.7 K1`);
  if (bro && ctx.verksamhet === 'jarnvag') {
    h += H2('Gemensamma markeringar med stomnät i plan för järnväg', `${TDOK} §2.11.2 K4`);
    const rader = ctx.allPts.filter(p => ctx.gemensam[p.id])
      .map(p => `<tr><td style="font-weight:700">${esc(p.id)}</td></tr>`).join("");
    h += rader
      ? `<table class="r"><tr><th>Punkt</th></tr>${rader}</table>`
      : `<p class="r rtom">Inga punkter är utpekade som gemensamma.</p>`;
    h += `<p class="rnot">§2.11.2 K4 kräver minst 2 markeringar gemensamma med stomnät i ` +
         `plan för järnväg. Antalet kontrolleras i kravtabellen.</p>`;
  }
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('4. Tider som programmet ska förhålla sig till', `${TDOK} §1.7 K1`);
  h += tidplan(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('5. Referenssystem och kodning', `${TDOK} §1.7 K1 · §1.2 · §1.6`);
  h += referenssystem(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('6. Planerat genomförande', `${TDOK} §1.7 K1`);
  h += genomforande(ctx, 'Genomförande', `${TDOK} §1.7 K1`);
  h += bild(ctx, 'r32', 'Nätets utformning', `${TDOK} §1.7 K1`);
  h += stommatningsplan(ctx, 'Stommätningsplan', `${TDOK} §1.7 K1`);
  h += instrument(ctx, 'Instrument och kompletterande utrustning',
                  `${TDOK} §1.7 K1 · §2.8 K15 · K19`);
  h += matklass(ctx, 'Mätklass', `${TDOK} §2.8 K16 · ${SIS} Tabell A.9`);
  h += produktval('§1.7 K1 räknar inte upp programvaror bland mätningsprogrammets ' +
                  'innehåll. Avsnittet följer SIS-TS 21143:2016 Bilaga B R3.11.');
  h += programvaror(ctx, 'Programvaror', `${SIS} Bilaga B R3.11`);
  h += simulering(ctx, 'Simulering och kvalitetsbedömning',
                  bro ? `${TDOK} §2.11.2 K5 · ${SIS} §6.2.5`
                      : `${TDOK} §2.10.2 K2 · ${SIS} §6.2.5`);
  h += bild(ctx, 'r312', 'Lägesosäkerheter', `${SIS} §6.2.5`);

  // Nättypens egna hänvisningar till SIS-TS. Bara avsnittsnummer – SIS-TS är
  // licensierad och ingen normtext återges.
  h += H2('Mätningsprogrammets utformning',
          bro ? `${TDOK} §2.11.2 K6` : `${TDOK} §2.10.2 K1`);
  h += bro
    ? `<p class="r">Mätningsprogrammet utformas enligt ${SIS} §6.5.5 ` +
      `(${TDOK} §2.11.2 K6).</p>`
    : `<p class="r">Mätningsprogrammet utformas enligt ${SIS} §6.5.3.2 och §6.5.4.2, ` +
      `inklusive riktningskontroll enligt §6.5.3.7 (${TDOK} §2.10.2 K1).</p>`;
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('7. Vad som ska dokumenteras', `${TDOK} §1.7 K1`);
  h += `<p class="r">Mätdata, uppställningar, instrument- och signalhöjder, temperatur och ` +
       `lufttryck samt avvikelser från programmet dokumenteras vid genomförandet.</p>`;
  h += produktval('Uppräkningen ovan är NätSims förslag på vad som normalt dokumenteras vid ' +
                  'terrester stommätning i plan; §1.7 K1 kräver att punkten besvaras men ' +
                  'räknar inte upp något innehåll.');
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('8. Vad som ska redovisas', `${TDOK} §1.7 K1`);
  h += leverans(ctx, 'Redovisningens omfattning', `${SIS} Bilaga B R4.1`);
  h += allaPunkter(ctx, 'Planerade koordinater (preliminära)', null,
    'Koordinaterna är de planerade punktlägen simuleringen räknat på, inte inmätta ' +
    'värden. Förteckningen tas med som underlag för rekognosering och utsättning.');
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('9. Hur redovisning ska ske', `${TDOK} §1.7 K1`);
  h += metaTabell([['Leveransformat', ctx.levformat]]);
  h += godkannande(
    bro ? 'Mätningsprogrammet ska godkännas av beställaren innan markering utförs.'
        : 'Mätningsprogrammet ska godkännas av beställaren innan markering utförs.',
    bro ? `${TDOK} §2.11.2 K7` : `${TDOK} §2.10.2 K4`);
  h += `<p class="rnot">§1.7 K2: mätningsprogrammet godkänns av beställaren innan utförande.</p>`;
  h += `</div>`;
  return h;
}

// ── Mall D – Ej Trafikverket, SIS-TS Bilaga B kolumn P ──────────────────────
// Kolumn P (planering) omfattar R1.1, R1.3, R1.4, R2, R3.1, R3.2, R3.3, R3.4,
// R3.5, R3.9, R3.10, R3.11, R4.1 och R4.2. R1.2 är bara D; R3.12 och R3.13 är
// bara R. Koderna nedan är rättade mot Bilaga B – före Etapp 4 var R3.3 och
// R3.4 omkastade, lägesosäkerheterna stod som R3.12 och föreskrifterna som R1.4.

export function mallD(ctx) {
  let h = forsattsblad(ctx);

  h += `<div class="rb">`;
  h += produktval('Dokumentet följer redovisningsstrukturen i SIS-TS 21143:2016 Bilaga B ' +
                  'kolumn P (planering). Att just den strukturen används för uppdrag utanför ' +
                  'Trafikverket är NätSims val.');
  h += H1('R1.1 Uppdragets omfattning', `${SIS} Bilaga B R1.1`);
  h += styckeEllerTomt(ctx.syfte, 'Uppdragets omfattning och nätets syfte anges i steg 1.');
  h += styckeEllerTomt(ctx.anslutning, 'Anslutningslösningen anges i steg 1.');
  h += metaTabell([
    ['Projekt', ctx.proj], ['Projektnummer', ctx.projnr],
    ['Beställare', ctx.best], ['Utförare', ctx.utf],
  ]);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R1.3 Referenssystem och kodning', `${SIS} Bilaga B R1.3`);
  h += referenssystem(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R1.4 Tidplan och sessionsindelning', `${SIS} Bilaga B R1.4`);
  h += tidplan(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R2 Personal', `${SIS} Bilaga B R2`);
  h += personal(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.1 Redogörelse', `${SIS} Bilaga B R3.1`);
  h += foreskrifter(ctx, `${SIS} Bilaga B R3.1`);
  h += genomforande(ctx, 'Planerat genomförande', `${SIS} Bilaga B R3.1`);
  h += `<div class="rbox">Observationer: ${ctx.sr.meas_n} | Obekanta: ${ctx.sr.unkn_n} | ` +
       `Redundans f = ${ctx.sr.redundancy} | k = ${esc(String(ctx.sr.K_global.toFixed(3)).replace('.', ','))}</div>`;
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.2 Översiktskarta', `${SIS} Bilaga B R3.2`);
  h += bild(ctx, 'r32', null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  // Bilaga B R3.3 för kolumn P: planerade punktlägen; ska grafiskt redovisa
  // mätningar och felellipser. Därför ligger både nätkartan och
  // lägesosäkerheterna här, inte under R3.12 som de gjorde före Etapp 4.
  h += H1('R3.3 Nätkarta, nätutformning och markering', `${SIS} Bilaga B R3.3`);
  h += planeradePunkter(ctx, 'Planerade punktlägen och markering', `${SIS} Bilaga B R3.3`);
  h += bild(ctx, 'r34', 'Mätgeometri – planerade observationer', `${SIS} Bilaga B R3.3`);
  h += bild(ctx, 'r312', 'Felellipser', `${SIS} Bilaga B R3.3`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.4 Anslutningspunkter och kända punkter', `${SIS} Bilaga B R3.4`);
  h += kandaPunkter(ctx, 'Inventering, plan och koordinater', `${SIS} Bilaga B R3.4`);
  h += bild(ctx, 'r33', 'Kända anslutningspunkter', `${SIS} Bilaga B R3.4`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.5 Mätmetod, mätprogram och instrument', `${SIS} Bilaga B R3.5`);
  h += instrument(ctx, null, null);
  h += matklass(ctx, 'Mätklass', `${SIS} Tabell A.9`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.9 Bedömning av kvalitetskrav och toleranser', `${SIS} Bilaga B R3.9`);
  h += simulering(ctx, 'Simulering och kvalitetsbedömning', `${SIS} §6.2.5`);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.10 Särskilda kontroller', `${SIS} Bilaga B R3.10`);
  h += styckeEllerTomt(ctx.krav2, 'Inga särskilda kontroller angivna.');
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R3.11 Programvaror inklusive version', `${SIS} Bilaga B R3.11`);
  h += programvaror(ctx, null, null);
  h += `</div>`;

  h += `<div class="rb">`;
  h += H1('R4.1 Leveransomfattning', `${SIS} Bilaga B R4.1`);
  h += styckeEllerTomt(ctx.leverans, 'Leveransomfattningen anges i steg 4.');
  h += H1('R4.2 Leveransformat', `${SIS} Bilaga B R4.2`);
  h += styckeEllerTomt(ctx.levformat, 'Leveransformatet anges i steg 4.');
  h += allaPunkter(ctx, 'Koordinatförteckning', null,
    'R3.13 Koordinatförteckning hör till Bilaga B:s kolumn R (redovisning), inte till ' +
    'kolumn P (planering) som det här dokumentet följer. Förteckningen tas med som ' +
    'underlag, med planerade punktlägen.');
  h += `</div>`;
  return h;
}

export const MALLAR = { A: mallA, B: mallB, C: mallC, D: mallD };
