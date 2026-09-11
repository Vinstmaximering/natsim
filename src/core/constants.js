// ─────────────────────────────────────────────────────────────────────────────
// Kopierad exakt från NätSim_Beta_2.html rad 400–528 + rad 559.
// Inga numeriska ändringar tillåtna – se STRUCTURE.md "Beräkningskärnan är helig".
// ─────────────────────────────────────────────────────────────────────────────

// SWEREF99-projektioner – 13 st (EPSG:3006–3018)
export const CRS_DEFS = {
  sweref99tm:   { name:"SWEREF 99 TM",    epsg:"EPSG:3006", proj:"+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991200: { name:"SWEREF 99 12 00", epsg:"EPSG:3007", proj:"+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991330: { name:"SWEREF 99 13 30", epsg:"EPSG:3008", proj:"+proj=tmerc +lat_0=0 +lon_0=13.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991415: { name:"SWEREF 99 14 15", epsg:"EPSG:3012", proj:"+proj=tmerc +lat_0=0 +lon_0=14.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991500: { name:"SWEREF 99 15 00", epsg:"EPSG:3009", proj:"+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991545: { name:"SWEREF 99 15 45", epsg:"EPSG:3013", proj:"+proj=tmerc +lat_0=0 +lon_0=15.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991630: { name:"SWEREF 99 16 30", epsg:"EPSG:3010", proj:"+proj=tmerc +lat_0=0 +lon_0=16.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991715: { name:"SWEREF 99 17 15", epsg:"EPSG:3014", proj:"+proj=tmerc +lat_0=0 +lon_0=17.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991800: { name:"SWEREF 99 18 00", epsg:"EPSG:3011", proj:"+proj=tmerc +lat_0=0 +lon_0=18 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref991845: { name:"SWEREF 99 18 45", epsg:"EPSG:3015", proj:"+proj=tmerc +lat_0=0 +lon_0=18.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref992015: { name:"SWEREF 99 20 15", epsg:"EPSG:3016", proj:"+proj=tmerc +lat_0=0 +lon_0=20.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref992145: { name:"SWEREF 99 21 45", epsg:"EPSG:3017", proj:"+proj=tmerc +lat_0=0 +lon_0=21.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
  sweref992315: { name:"SWEREF 99 23 15", epsg:"EPSG:3018", proj:"+proj=tmerc +lat_0=0 +lon_0=23.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs" },
};

// ─────────────────────────────────────────────────────────────────────────────
// PUNKTTYPER – ENDA KÄLLAN FÖR ETIKETTER I HELA UI:T
//
// Kanoniserat i UI-städning Omgång 2 (2026-09-11). Underlag:
// docs/troubleshooting/ui_inventering_20260910.md avsnitt B, punkt 3, som hittade
// SJU parallella uppsättningar etiketter för samma fem typer. Fyra av dem var
// ordagranna kopior av den här tabellen på andra ställen i koden. Alla paneler,
// rapporter och exporter läser nu härifrån i stället.
//
//   l  = full etikett. Knappar, dialoger, listor, rapporter.
//   sl = kort etikett. Smala tabellkolumner och statistikkort.
//   s  = ID-PREFIX, inte en etikett. Används av interactions.js för att
//        generera punkt-ID (FP1, S1, D1 …). Ändra inte – det byter namn på
//        punkter i befintliga projekt.
//   c  = canvas-färg.
//
// TERMVAL: typen heter "Station", inte "Uppställning". Uppställning är den
// operativa handlingen – att instrumentet faktiskt stått på punkten – och det
// ordet är medvetet kvar där det är den innebörden som avses (kärnans
// stationIds(), "Uppställningar (orienteringar)" i nätöversikten, mätbokens
// sidhuvud). En punkt kan ha typen Station utan att vara uppställning i ett
// visst nät, och en känd punkt kan vara uppställning utan att ha typen.
//
// TVÅ TYPER SAKNAR KANONISKT NAMN – se rapporten för Omgång 2:
//   detail      har ingen motsvarighet i den beslutade fyrtypslistan.
//               Behåller "Detaljpunkt" tills beslut fattats.
//   simstation  är INTE ett visuellt objekt: den deltar i utjämningen och får
//               egna felellipser (simStationResults). Det visuella lagret är
//               en annan sak helt – state.visualPts/visualLines. Namnet följer
//               därför Station-kanon i väntan på beslut.
// ─────────────────────────────────────────────────────────────────────────────
export const PT = {
  known:     { l:"Känd punkt",         sl:"Känd",        s:"FP", c:"#00ff88" },
  station:   { l:"Station",            sl:"Station",     s:"S",  c:"#4fc3f7" },
  detail:    { l:"Detaljpunkt",        sl:"Detalj",      s:"D",  c:"#ffb74d" },
  new:       { l:"Nypunkt",            sl:"Nypunkt",     s:"NY", c:"#ce93d8" },
  simstation:{ l:"Simulerad station",  sl:"Sim.station", s:"SS", c:"#ff6090" },
};

/** Full etikett för en punkttyp. Okänd typ returneras oförändrad. */
export const ptLabel      = t => PT[t]?.l  ?? t;
/** Kort etikett för smala kolumner. Okänd typ returneras oförändrad. */
export const ptLabelShort = t => PT[t]?.sl ?? t;

// Instrument-presets – rena värden, inga avrundningsfel
export const INSTRUMENTS = {
  custom:   { l:"Egna värden",                   sigHz:1.0,  sigDmm:1.0, sigDppm:1.5 },
  ts16_1:   { l:"Leica TS16 1″ (0.3mgon)",       sigHz:0.3,  sigDmm:1.0, sigDppm:1.5 },
  ts16_5:   { l:"Leica TS16 5″ (1.5mgon)",       sigHz:1.5,  sigDmm:1.0, sigDppm:1.5 },
  ts60:     { l:"Leica TS60 0.5″ (0.15mgon)",    sigHz:0.15, sigDmm:0.6, sigDppm:1.0 },
  tca2003:  { l:"Leica TCA2003 0.5″ (0.15mgon)", sigHz:0.15, sigDmm:1.0, sigDppm:1.0 },
  ms60:     { l:"Leica MS60 1″ (0.3mgon)",       sigHz:0.3,  sigDmm:1.0, sigDppm:1.5 },
  trimTS7:  { l:"Trimble S7 1″ (0.3mgon)",       sigHz:0.3,  sigDmm:1.0, sigDppm:1.0 },
  trimTS9:  { l:"Trimble S9 0.5″ (0.15mgon)",    sigHz:0.15, sigDmm:0.6, sigDppm:1.0 },
  tcrp1201: { l:"Leica TCRP1201 1″ (0.3mgon)",   sigHz:0.3,  sigDmm:1.0, sigDppm:1.5 },
  tcra1103: { l:"Leica TCRA1103 3″ (1.0mgon)",   sigHz:1.0,  sigDmm:2.0, sigDppm:2.0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MÄTKLASSER – SIS-TS 21143:2016
// Tabell A.9 (nätmätningskrav) kombinerat med Tabell A.1 (totalstationskrav)
//
// Tabell A.1 – Totalstationklasser:
//   T1: σ_Hz=0,15 mgon | σ_D=1mm+1ppm  (G1, G2)
//   T2: σ_Hz=0,30 mgon | σ_D=1mm+2ppm  (G3)
//   T3: σ_Hz=0,60 mgon | σ_D=2mm+3ppm  (G4)
//
// Tabell A.9 – Mätklassernas krav:
//   G1: T1, ≥3 helsatser, spridning ≤0,6mgon/≤2mm, e_c=0,3–1mm
//   G2: T1, ≥3 helsatser, spridning ≤1,2mgon/≤3mm, e_c=1mm
//   G3: T2, ≥2 helsatser, spridning ≤2,0mgon/≤5mm, e_c=2mm
//   G4: T3, ≥2 helsatser, spridning ≤3,0mgon/≤8mm, e_c=3mm
// ─────────────────────────────────────────────────────────────────────────────
export const MATKLASSER = {
  G1: {
    l: "Mätklass G1",
    beskrivning: "Nät för exceptionella anläggningar och hus/industrikonstruktioner med prefabricerade element (betong, stål, glas). Kontrollmätning av exceptionella konstruktioner.",
    totalstation: "Klass T1 – σ_Hz=0,15 mgon, σ_D=1mm+1ppm",
    sigHz_mgon: 0.15,
    sigDist_mm: 1.0,
    sigDist_ppm: 1.0,
    numSatser: 3,
    centerErr: 1.0,
    spridning_hz: 0.6,
    spridning_dist: 2.0,
    avvik_dubbel: "≤2 mm + 1 ppm",
    ref: "SIS-TS 21143:2016 Tabell A.9 + A.1"
  },
  G2: {
    l: "Mätklass G2",
    beskrivning: "Nät för anläggningar med höga krav på lägesnoggrannhet: spåranläggning, broar, fackverksnät i plan för vägar och övriga anläggningar. Rörelsekontroller. Trigonometrisk höjdmätning av bruksnät.",
    totalstation: "Klass T1 – σ_Hz=0,15 mgon, σ_D=1mm+1ppm",
    sigHz_mgon: 0.15,
    sigDist_mm: 1.0,
    sigDist_ppm: 1.0,
    numSatser: 3,
    centerErr: 1.0,
    spridning_hz: 1.2,
    spridning_dist: 3.0,
    avvik_dubbel: "≤3 mm + 3 ppm",
    ref: "SIS-TS 21143:2016 Tabell A.9 + A.1"
  },
  G3: {
    l: "Mätklass G3",
    beskrivning: "Bruksnät för projektering och byggande av anläggningar med tillhörande konstruktioner.",
    totalstation: "Klass T2 – σ_Hz=0,30 mgon, σ_D=1mm+2ppm",
    sigHz_mgon: 0.3,
    sigDist_mm: 1.0,
    sigDist_ppm: 2.0,
    numSatser: 2,
    centerErr: 2.0,
    spridning_hz: 2.0,
    spridning_dist: 5.0,
    avvik_dubbel: "≤5 mm + 3 ppm",
    ref: "SIS-TS 21143:2016 Tabell A.9 + A.1"
  },
  G4: {
    l: "Mätklass G4",
    beskrivning: "Bruksnät för anläggningar med lägre krav på lägesnoggrannhet. GNSS-teknik kan ersätta terrester mätning.",
    totalstation: "Klass T3 – σ_Hz=0,60 mgon, σ_D=2mm+3ppm",
    sigHz_mgon: 0.6,
    sigDist_mm: 2.0,
    sigDist_ppm: 3.0,
    numSatser: 2,
    centerErr: 3.0,
    spridning_hz: 3.0,
    spridning_dist: 8.0,
    avvik_dubbel: "≤8 mm + 3 ppm",
    ref: "SIS-TS 21143:2016 Tabell A.9 + A.1"
  }
};

// Vinkelkonvertering – används av calcM och hela beräkningskärnan
export const R = d => d * Math.PI / 180;
export const D = r => r * 180 / Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// KONTROLLERBARHETSTALET k = f/n – klassificering
//
// k ligger per definition i [0, 1]: k = (n − u)/n med u ≥ 1.
//
// Normens golv för nätet:
//   SIS-TS 21143:2016 §6.2.2       – k > 0,5 för nätet (k > 0,35 för enskild mätning)
//   HMK-Stommätning 2024 §3.2.2 b) – k ≥ 0,5 för triangel- och fackverksnät
//
// HISTORIK: översta gränsen var tidigare hårdkodad till "k > 1,14" på sju
// ställen. 1,14 är maxvärdet för VIKTSENHETENS standardosäkerhet u₀ vid f = 70
// i HMK Tabell 53 – en helt annan storhet, prövad i ett efterberäkningstest på
// residualer (HMK F.3.1). I ett simuleringsverktyg finns inga observationer och
// därmed inga residualer; u₀ ≡ 1 per konstruktion. Gränsen var alltså både fel
// storhet och matematiskt onåbar, vilket gjorde att högsta klassen aldrig kunde
// nås och att nät systematiskt underklassificerades.
// ─────────────────────────────────────────────────────────────────────────────

// Normgolv – nätet underkänns under detta värde. Normstyrt, ändra inte.
export const K_NAT_GOLV = 0.50;

// ─────────────────────────────────────────────────────────────────────────────
// REDUNDANSTALET r_i PER OBSERVATION – bandgränser
//
// r_i säger hur stor del av ett grovfel i observationen som syns i
// residualerna. Låg redundans = grovfelet slår rakt in i koordinaterna.
//
//   r_i < 0,30           Underkänt. Observationen är i praktiken okontrollerad.
//   0,30 ≤ r_i < 0,50    Svag kontroll – valideringen varnar.
//   r_i ≥ 0,50           Godkänd nivå, ingen anmärkning.
//
// Värdena låg tidigare hårdkodade i valideringen och i studio-vyernas
// färgsättning. Etapp E flyttade hit dem så att optimeringen och valideringen
// läser samma trösklar.
//
// Optimeringens krav ligger MELLAN de två (se core/optimizer-criteria.js):
//   hårt krav  r ≥ 0,35  – blockerar leverans, SIS-TS §6.2.2
//   mjukt krav r ≥ 0,50  – rapporteras, HMK Bilaga F.6 = R_OBS_GOD
// Ordningen R_OBS_GOLV < 0,35 < R_OBS_GOD är avsiktlig och måste bevaras: den
// garanterar att ett optimerat nät kan få VARNINGAR i valideringen men aldrig
// FEL. Sänks det hårda kravet under R_OBS_GOLV levererar optimeringen nät som
// produktens egen validering underkänner.
// ─────────────────────────────────────────────────────────────────────────────
export const R_OBS_GOLV = 0.30;   // under detta: fel
export const R_OBS_GOD  = 0.50;   // vid/över detta: ingen anmärkning

// Gräns för det översta bandet. PRODUKTVAL, inte normstyrt – varken SIS-TS
// eller HMK anger någon övre k-gräns. Värdet är satt genom att förlänga den
// befintliga bandstrukturen, som har bandbredden 0,2 ovanför 0,1
// (0,1 → 0,3 → 0,5 → 0,7). Det motsvarar n ≈ 3⅓·u.
// Facittesterna låser medvetet inte värdet, bara att översta bandet är nåbart
// för något k ≤ 1.
//
// NAMNET ÄNDRAT i UI-städning Omgång 3 (2026-09-11): konstanten hette
// K_OVERBESTAMD_PRELIMINAR och bandet hette "Överbestämt". Se KVALITETSSKALOR
// nedan för varför den etiketten togs bort. Det gamla namnet re-exporteras
// längst ned för bakåtkompatibilitet.
export const K_GOD_MARGINAL = 0.70;

// Bandgränser under normgolvet.
const K_BAND_UNDER_NORM = 0.30;
const K_BAND_SVAGT      = 0.10;

// ─────────────────────────────────────────────────────────────────────────────
// KVALITETSSKALOR – HARMONISERADE (UI-städning Omgång 3, 2026-09-11)
//
// Underlag: docs/troubleshooting/ui_inventering_20260910.md avsnitt B, punkt 2,
// som hittade fyra oförenliga kvalitetsskalor. Genomgången inför den här
// omgången hittade ytterligare tre (se commit-meddelandet). Alla läser nu
// härifrån.
//
// ── PROBLEM 1: etiketter som ljög om normen ────────────────────────────────
// "Acceptabelt" användes för k ∈ [0,30, 0,50). Hela det bandet ligger UNDER
// SIS-TS 21143:2016 §6.2.2:s golv – nätet underkänns. Att kalla det acceptabelt
// är att beskriva ett underkänt nät som godtagbart. Heter nu "Under norm".
// (Den här filen erkände problemet i en kommentar sedan tidigare men lämnade
// det olöst med motiveringen att omdöpning var ett produktbeslut.)
//
// "Överbestämt" användes för k ≥ 0,70. Överbestämning betyder n > u och gäller
// varje nät med f > 0, alltså hela intervallet k > 0 – termen beskriver inte
// det bandet utan matematiken i stort. Dessutom finns ingen norm som definierar
// en övre klass. Heter nu "God marginal", som säger vad bandet faktiskt är:
// marginal ovanför golvet, valt av produkten och inte av normen.
//
// ── PROBLEM 2: k-tal och r-tal delade skala ────────────────────────────────
// rLabel() i core/redundancy.js gav SAMMA fyra ord som k-skalan
// (Starkt/Acceptabelt/Svagt/Otillräckligt) men till en ANNAN storhet med ett
// ANNAT normgolv, och saknade band vid 0,35:
//
//   k (nätet)          golv 0,50   SIS-TS §6.2.2
//   r-tal (per obs.)   golv 0,35   SIS-TS §6.2.2, samma paragraf
//
// En observation med r-tal 0,32 fick alltså etiketten "Acceptabelt" trots att
// den underkänns av §6.2.2. De två skalorna har nu SAMMA ORDFÖRRÅD men EGNA
// trösklar, hämtade ur respektive storhets norm. Att tvinga dem till samma
// tröskelvärden vore matematiskt fel.
//
// ── DEN HARMONISERADE TRAPPAN ──────────────────────────────────────────────
//   God marginal    väl över golvet (produktval, ej normstyrt)
//   Uppfyller norm  vid eller över golvet
//   Under norm      under golvet – underkänt
//   Svagt           klart under golvet
//   Otillräckligt   i praktiken okontrollerat
//
// r-talsskalan har fyra band i stället för fem: varje gräns motsvarar en
// konstant som redan styr produktens logik (R_OBS_GOD, R_MIN_HARD via
// SIS_TS_GENERAL_REQS.k_individual_min, R_OBS_GOLV). Den gamla gränsen 0,10 var
// odokumenterad och saknade motsvarighet i både norm och kod – den är borta.
// ─────────────────────────────────────────────────────────────────────────────

// SIS-TS §6.2.2:s golv för ENSKILD observation. Speglar
// SIS_TS_GENERAL_REQS.k_individual_min i data/sis-ts-classes.js; värdet ligger
// där, men skalan nedan behöver det utan att skapa ett importberoende från
// core/ till data/.
export const R_OBS_NORM = 0.35;

/**
 * Kontrollerbarhetstalet k = f/n för NÄTET. Golv 0,50 (SIS-TS §6.2.2).
 * Returnerar { klass, cssKlass, farg, uppfyllerNorm }.
 */
export function klassificeraKtal(k) {
  if (k >= K_GOD_MARGINAL)
    return { klass: "God marginal",   cssKlass: "val-purple",  farg: "#ce93d8", uppfyllerNorm: true  };
  if (k >= K_NAT_GOLV)
    return { klass: "Uppfyller norm", cssKlass: "val-good",    farg: "#00ff88", uppfyllerNorm: true  };
  if (k >= K_BAND_UNDER_NORM)
    return { klass: "Under norm",     cssKlass: "val-caution", farg: "#ffcc00", uppfyllerNorm: false };
  if (k >= K_BAND_SVAGT)
    return { klass: "Svagt",          cssKlass: "val-warn",    farg: "#ff9900", uppfyllerNorm: false };
  return   { klass: "Otillräckligt",  cssKlass: "val-danger",  farg: "#ff5050", uppfyllerNorm: false };
}

/**
 * Redundanstalet r-tal för EN OBSERVATION. Golv 0,35 (SIS-TS §6.2.2);
 * 0,50 är HMK Bilaga F.6:s nivå för ingen anmärkning.
 * Returnerar samma form som klassificeraKtal().
 */
export function klassificeraRtal(r) {
  if (r >= R_OBS_GOD)
    return { klass: "God marginal",   cssKlass: "val-good",    farg: "#00ff88", uppfyllerNorm: true  };
  if (r >= R_OBS_NORM)
    return { klass: "Uppfyller norm", cssKlass: "val-caution", farg: "#ffcc00", uppfyllerNorm: true  };
  if (r >= R_OBS_GOLV)
    return { klass: "Under norm",     cssKlass: "val-warn",    farg: "#ff9900", uppfyllerNorm: false };
  return   { klass: "Otillräckligt",  cssKlass: "val-danger",  farg: "#ff5050", uppfyllerNorm: false };
}

// Banden som datastruktur, för teckenförklaringen i kartan och för tester.
// Ordningen är fallande, samma som klassificerarna prövar i.
export const K_BAND = Object.freeze([
  { min: K_GOD_MARGINAL,     klass: "God marginal"   },
  { min: K_NAT_GOLV,         klass: "Uppfyller norm" },
  { min: K_BAND_UNDER_NORM,  klass: "Under norm"     },
  { min: K_BAND_SVAGT,       klass: "Svagt"          },
  { min: 0,                  klass: "Otillräckligt"  },
]);

export const R_BAND = Object.freeze([
  { min: R_OBS_GOD,  klass: "God marginal"   },
  { min: R_OBS_NORM, klass: "Uppfyller norm" },
  { min: R_OBS_GOLV, klass: "Under norm"     },
  { min: 0,          klass: "Otillräckligt"  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// PUNKTOSÄKERHET σ_pos – EGEN SKALA, EGEN STORHET
//
// σ_pos mäts i mm och har inget normgolv i SIS-TS: kravet sätts per projekt
// (state.sigReq, default 3 mm) eller per mätklass i optimeringen. Skalan nedan
// är alltså ett produktval för FÄRGSÄTTNING, inte en normklassificering, och
// delar medvetet inte ordförråd med k- och r-skalorna.
//
// Omgång 3 harmoniserade en diskrepans: kvalitetspanelen färgade gult över
// 5 mm och rött över 10 mm, medan de tre tabellerna blev röda först vid 20 mm.
// Samma punkt kunde alltså vara gul i en vy och röd i en annan. 20 mm är valt
// som gemensam gräns – det är den som de tre tabellerna använde och den som
// låg i den ursprungliga koden.
// ─────────────────────────────────────────────────────────────────────────────
export const SIG_POS_BRA_MM  = 5;
export const SIG_POS_DALIG_MM = 20;

/** CSS-klass för en punktosäkerhet i mm. */
export function sigPosKlass(mm) {
  if (!Number.isFinite(mm)) return "val-muted";
  if (mm < SIG_POS_BRA_MM)   return "val-good";
  if (mm < SIG_POS_DALIG_MM) return "val-caution";
  return "val-danger";
}

// Bakåtkompatibelt alias. Konstanten hette K_OVERBESTAMD_PRELIMINAR fram till
// Omgång 3; namnet speglade etiketten "Överbestämt" som togs bort.
export const K_OVERBESTAMD_PRELIMINAR = K_GOD_MARGINAL;
