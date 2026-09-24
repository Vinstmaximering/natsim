// Datamodell för TDOK 2014:0571 version 6.0 (fastställd 2026-06-17).
//
// Ren data och rena funktioner – inga DOM-anrop, ingen import av UI. Modulen
// äger valen som styr hela rapporten (verksamhet + nättyp → dokumenttyp) och
// de uppräkningar normen anger. Allt som står här bär sin paragraf.
//
// AVGRÄNSNING. NätSim simulerar terrestra nät I PLAN. Anslutningsnät (§2.6,
// GNSS/VRS) och nät i höjd (§2.7, §2.9, §2.10.3, §2.11.3) ingår därför inte och
// visas inte som val för Trafikverksuppdrag. Utanför Trafikverket behålls
// SIS-TS-listan oförändrad – där är nättypen användarens eget ansvar, och gamla
// utkast med Anslutningsnät eller Rörelsemätning ska kunna laddas.

// ── Verksamhet ──────────────────────────────────────────────────────────────
// Styr vilka nättyper som erbjuds, vilket kodsystem som förvalts (§1.6), om
// tillståndsbedömning krävs (§2.1) och vilken dokumenttyp rapporten får (§2.5).
export const VERKSAMHETER = Object.freeze([
  { v: 'vag',      l: 'Väg' },
  { v: 'jarnvag',  l: 'Järnväg' },
  { v: 'ej-tv',    l: 'Ej Trafikverket' },
]);

export const arTrafikverket = verksamhet => verksamhet === 'vag' || verksamhet === 'jarnvag';

// ── Nättyper för Trafikverksuppdrag ─────────────────────────────────────────
// `kalla` är paragrafen som definierar nättypen. `dokKalla` är paragrafen som
// kräver just den dokumenttypen – de är olika paragrafer och blandas inte ihop.
export const NATTYPER_TV = Object.freeze([
  {
    v: 'bruksnat',
    l: 'Bruksnät i plan',
    kalla: 'TDOK 2014:0571 v6.0 §2.8',
    // Dokumenttypen skiljer sig mellan väg och järnväg – se dokumenttyp().
    dok: {
      vag:     { typ: 'Redovisning av planerat stomnät', kalla: 'TDOK 2014:0571 v6.0 §2.5 K2' },
      jarnvag: { typ: 'Åtgärdsförslag',                  kalla: 'TDOK 2014:0571 v6.0 §2.5 K1' },
    },
  },
  {
    v: 'bro',
    l: 'Nät i plan för bro och broliknande konstruktion',
    kalla: 'TDOK 2014:0571 v6.0 §2.11.2',
    dok: {
      vag:     { typ: 'Mätningsprogram', kalla: 'TDOK 2014:0571 v6.0 §1.7 K1 · §2.11.2 K6' },
      jarnvag: { typ: 'Mätningsprogram', kalla: 'TDOK 2014:0571 v6.0 §1.7 K1 · §2.11.2 K6' },
    },
  },
  {
    v: 'tunnel',
    l: 'Nät i plan för tunnelbyggnad',
    kalla: 'TDOK 2014:0571 v6.0 §2.10.2',
    dok: {
      vag:     { typ: 'Mätningsprogram', kalla: 'TDOK 2014:0571 v6.0 §1.7 K1 · §2.10.2 K1' },
      jarnvag: { typ: 'Mätningsprogram', kalla: 'TDOK 2014:0571 v6.0 §1.7 K1 · §2.10.2 K1' },
    },
  },
]);

// ── Nättyper utanför Trafikverket ───────────────────────────────────────────
// Den lista PM:et hade före v6-ombyggnaden, oförändrad. Dokumenttypen är
// "Planering av stomnät" med struktur enligt SIS-TS 21143:2016 Bilaga B
// kolumn P. Det är ett PRODUKTVAL för uppdrag utanför Trafikverket, inte ett
// krav ur TDOK – därför en egen källtext.
export const NATTYPER_SIS = Object.freeze([
  { v: 'sis-bruksnat',   l: 'Bruksnät i plan (§6.4)' },
  { v: 'sis-anslutning', l: 'Anslutningsnät (§6.3)' },
  { v: 'sis-bro',        l: 'Nät för brobyggnad (§6.5.5)' },
  { v: 'sis-tunnel',     l: 'Nät för tunneldrivning (§6.5.3)' },
  { v: 'sis-rorelse',    l: 'Nät för rörelsemätning (§6.5.6)' },
]);

export const DOK_SIS = Object.freeze({
  typ:   'Planering av stomnät',
  kalla: 'SIS-TS 21143:2016 Bilaga B kolumn P',
});

/** Nättyperna som ska visas för en verksamhet. */
export function nattyperFor(verksamhet) {
  return arTrafikverket(verksamhet) ? NATTYPER_TV : NATTYPER_SIS;
}

/**
 * Dokumenttypen rapporten ska ha, med den paragraf som kräver den.
 * @returns {{typ:string, kalla:string, mall:'A'|'B'|'C'|'D'}|null}
 */
export function dokumenttyp(verksamhet, nattyp) {
  if (!arTrafikverket(verksamhet)) return { ...DOK_SIS, mall: 'D' };
  const nt = NATTYPER_TV.find(n => n.v === nattyp);
  if (!nt) return null;
  const d = nt.dok[verksamhet];
  if (!d) return null;
  const mall = nattyp === 'bruksnat' ? (verksamhet === 'vag' ? 'A' : 'B') : 'C';
  return { ...d, mall };
}

// ── §2.4.1 K3 Tabell 2 – markeringstyper ────────────────────────────────────
// Typkoden väljs först, markeringstypen ur den kodens lista. Flera typer finns
// under båda koderna (Dubb i berg, Dubb i betong (vertikal), Dubb i sten) och
// valet blir entydigt bara om koden är känd.
export const MARKERINGSTYPER = Object.freeze({
  PP: Object.freeze([
    'Dubb i berg',
    'Dubb i betong (horisontell)',
    'Dubb i betong (vertikal)',
    'Dubb i sten',
    'Markeringsspik i asfalt eller betong',
    'Rör i mark med däcksel',
    'Unikonsol (standard)',
  ]),
  FIX: Object.freeze([
    'Dubb i berg',
    'Dubb i betong (vertikal)',
    'Dubb i sten',
    'Järn i foderrör',
  ]),
});

export const MARKERING_KALLA = 'TDOK 2014:0571 v6.0 §2.4.1 K3 Tabell 2';

// ── §2.1 K2 – kategorier vid tillståndsbedömning ────────────────────────────
export const TILLSTAND_KATEGORIER = Object.freeze([
  'Ingen synbar påverkan',
  'Misstänkt rubbad',
  'Ej återfunnen',
  'Borta, raserad',
  'Bör raseras',
]);

export const TILLSTAND_KALLA = 'TDOK 2014:0571 v6.0 §2.1 K2 · K5';

// §2.1 K3 – siktförhållandet ska bedömas. Normen räknar inte upp några nivåer,
// så fältet är fritext och produkten föreslår ingenting.
export const SIKT_KALLA = 'TDOK 2014:0571 v6.0 §2.1 K3';

// ── §1.6 – kodning ──────────────────────────────────────────────────────────
export const KODSYSTEM = Object.freeze({
  vag:     { l: 'BH 90 del 7 bilaga D.1', kalla: 'TDOK 2014:0571 v6.0 §1.6' },
  jarnvag: { l: 'TDOK 2019:0215',         kalla: 'TDOK 2014:0571 v6.0 §1.6' },
});

/** Förvalt kodsystem för en verksamhet, eller '' utanför Trafikverket. */
export const kodsystemFor = verksamhet => KODSYSTEM[verksamhet]?.l || '';

// ── §1 K2 – täckningsfaktor ─────────────────────────────────────────────────
// "Om inget anges kopplat till uttrycket osäkerhet är det täckningsfaktor 2
// som avses." Förvalet är därför utökad osäkerhet.
export const TACKNINGSFAKTOR = Object.freeze([
  { v: '2', l: 'Utökad osäkerhet (täckningsfaktor 2)' },
  { v: '1', l: 'Standardosäkerhet (täckningsfaktor 1)' },
]);

export const TACKNINGSFAKTOR_FORVAL = '2';

// Förvalet när kravet hämtas från NätSims A PRIORI σ-flik. state.sigReq är ett
// krav på σ_pos, och σ_pos är en standardosäkerhet (1σ) – simuleringen räknar
// inget annat. Täckningsfaktor 1 är därför inte ett antagande utan vad talet
// faktiskt betyder. §1 K2:s förval 2 gäller när täckningsfaktorn är OKÄND,
// alltså när användaren skriver in kravet själv.
export const TACKNINGSFAKTOR_SIGREQ = '1';

export const TACKNINGSFAKTOR_KALLA  = 'TDOK 2014:0571 v6.0 §1 K2';

// ── Migrering av gamla utkast ───────────────────────────────────────────────
// Utkast sparade före v6-ombyggnaden har ett enda fält, v_nats, med etiketten
// som text. Kartan nedan är den uppdraget anger.
//
// Verksamhet: de tre TDOK-nättyperna säger ingenting om verksamhet – ett gammalt
// utkast vet inte om det var väg eller järnväg. Migreringen lämnar därför
// verksamheten OVALD i stället för att gissa, och steg 1 kräver ett val innan
// användaren kan gå vidare. Anslutningsnät och Rörelsemätning finns bara i
// SIS-TS-listan och mappas som uppdraget säger till Ej Trafikverket.
const NATS_MIGRERING = Object.freeze({
  'Bruksnät i plan (§6.4)':         { verksamhet: '',      nattyp: 'bruksnat' },
  'Anslutningsnät (§6.3)':          { verksamhet: 'ej-tv', nattyp: 'sis-anslutning' },
  'Nät för brobyggnad (§6.5.5)':    { verksamhet: '',      nattyp: 'bro' },
  'Nät för tunneldrivning (§6.5.3)': { verksamhet: '',     nattyp: 'tunnel' },
  'Nät för rörelsemätning (§6.5.6)': { verksamhet: 'ej-tv', nattyp: 'sis-rorelse' },
});

/**
 * Migrerar ett gammalt utkasts v_nats till verksamhet + nattyp.
 * Okänd eller saknad text ger tomma värden – steg 1 kräver då ett val.
 * @returns {{verksamhet:string, nattyp:string}}
 */
export function migreraNats(nats) {
  const t = (nats || '').toString().trim();
  if (!t) return { verksamhet: '', nattyp: '' };
  const träff = NATS_MIGRERING[t];
  if (träff) return { ...träff };
  // Utanför listan: texten kan komma från en annan version eller vara
  // handredigerad. Den kastas inte – den blir ett Ej Trafikverket-uppdrag utan
  // vald nättyp, så att användaren ser att valet måste göras om.
  return { verksamhet: '', nattyp: '' };
}

/**
 * Migrerar fritexten i pt.markering till ett Tabell 2-val.
 * Exakt matchning mot tabellen; allt annat behålls som "Annan: <texten>".
 * Typkoden kan inte härledas när samma text finns under både PP och FIX, så
 * en exakt träff som är tvetydig lämnar typkoden tom för användaren att välja.
 * @returns {{typkod:string, typ:string, annan:boolean}}
 */
export function migreraMarkering(text) {
  const t = (text || '').toString().trim();
  if (!t) return { typkod: '', typ: '', annan: false };

  const iPP  = MARKERINGSTYPER.PP.includes(t);
  const iFIX = MARKERINGSTYPER.FIX.includes(t);

  if (iPP && iFIX) return { typkod: '', typ: t, annan: false };  // tvetydig – välj kod
  if (iPP)  return { typkod: 'PP',  typ: t, annan: false };
  if (iFIX) return { typkod: 'FIX', typ: t, annan: false };
  return { typkod: '', typ: `Annan: ${t}`, annan: true };
}

// ── Föräldralösa tabellnycklar ──────────────────────────────────────────────
// vals.markering, vals.tillstand och vals.gemensam är nycklade på punkt-id.
// Tas en punkt bort ur nätet efter att den fått ett värde blir nyckeln kvar.
// Den får inte tyst följa med till rapporten – då redovisas en markeringstyp
// eller en tillståndsbedömning för en punkt som inte finns. Steg 3 visar dem i
// stället som "punkt saknas i nätet" med möjlighet att ta bort, och rapporten
// itererar över nätets punkter så att de aldrig kommer med.

export const TABELLER = Object.freeze(['markering', 'tillstand', 'gemensam']);

/**
 * Nycklar i en tabell som inte motsvarar någon punkt i nätet.
 * @param {object} tabell  t.ex. vals.markering
 * @param {string[]} ptIds punkt-id som finns i nätet
 * @returns {string[]} de föräldralösa nycklarna, i tabellens ordning
 */
export function foraldralosa(tabell, ptIds) {
  if (!tabell) return [];
  const finns = new Set(ptIds || []);
  return Object.keys(tabell).filter(id => !finns.has(id));
}

/**
 * Alla föräldralösa nycklar i ett vals, per tabell.
 * @returns {{markering:string[], tillstand:string[], gemensam:string[]}}
 */
export function foraldralosaTabeller(vals = {}, ptIds = []) {
  const ut = {};
  for (const t of TABELLER) ut[t] = foraldralosa(vals[t], ptIds);
  return ut;
}

/** Sant om någon tabell har en nyckel utan punkt i nätet. */
export function harForaldralosa(vals = {}, ptIds = []) {
  return TABELLER.some(t => foraldralosa(vals[t], ptIds).length > 0);
}

/**
 * Tar bort alla föräldralösa nycklar. Muterar vals – anropas när användaren
 * uttryckligen ber om det i steg 3, aldrig automatiskt: ett borttaget värde
 * går inte att få tillbaka, och punkten kan ha tagits bort av misstag.
 * @returns {number} antal borttagna nycklar
 */
export function rensaForaldralosa(vals = {}, ptIds = []) {
  let n = 0;
  for (const t of TABELLER) {
    if (!vals[t]) continue;
    for (const id of foraldralosa(vals[t], ptIds)) { delete vals[t][id]; n++; }
  }
  return n;
}

/**
 * Migrerar ett helt gammalt utkast. Rör bara de fält v6 ändrar innebörden av;
 * allt annat lämnas orört så att ett utkast aldrig tappar text.
 * Idempotent: ett redan migrerat utkast lämnas som det är.
 */
export function migreraUtkast(vals = {}) {
  const ut = { ...vals };
  if (ut.verksamhet === undefined || ut.nattyp === undefined) {
    const m = migreraNats(ut.nats);
    if (ut.verksamhet === undefined) ut.verksamhet = m.verksamhet;
    if (ut.nattyp === undefined)     ut.nattyp     = m.nattyp;
  }
  // Täckningsfaktorn fanns inte före v6. §1 K2 säger att 2 gäller när inget
  // annat anges, så ett gammalt utkast utan uppgift får förvalet.
  if (ut.kravk === undefined) ut.kravk = TACKNINGSFAKTOR_FORVAL;
  return ut;
}
