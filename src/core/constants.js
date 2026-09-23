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
// k räknas ur HELTALEN n och u i simulation.js, inte som Σr_i / n. De två är
// matematiskt lika (Σr_i = f, HMK Formel F.6) men Σr_i är en flyttalssumma
// över alla observationer och landar i allmänhet inte exakt på f. Med en
// strikt gräns skulle ett nät med k = 0,50 exakt annars kunna hamna på endera
// sidan beroende på avrundning. Σr_i redovisas separat som redundTotal.
//
// Normens golv för nätet:
//   TDOK 2014:0571 v6.0 §2.8 K3    – "Bruksnät i plan ska utformas så att k-tal
//                                    för nätet är större än 0,5 och enskilda
//                                    mätningar större än 0,35."
//   SIS-TS 21143:2016 §6.2.2       – samma tal, samma ordalydelse.
//   HMK-Stommätning 2024 §3.2.2 b) – k ≥ 0,5 för triangel- och fackverksnät
//
// GRÄNSERNA ÄR STRIKTA (Etapp 2). Både TDOK v6 §2.8 K3 och SIS-TS §6.2.2 säger
// "större än", inte "minst". Ett nät med k = 0,50 exakt uppfyller alltså INTE
// kravet, och en observation med r = 0,35 exakt gör det inte heller.
// Jämförelserna nedan är därför > och inte >=. HMK:s k ≥ 0,5 ovan gäller en
// annan nättyp och skiljer sig bara i det enda värdet k = 0,50.
//
// HISTORIK: översta gränsen var tidigare hårdkodad till "k > 1,14" på sju
// ställen. 1,14 är maxvärdet för VIKTSENHETENS standardosäkerhet u₀ vid f = 70
// i HMK Tabell 53 – en helt annan storhet, prövad i ett efterberäkningstest på
// residualer (HMK F.3.1). I ett simuleringsverktyg finns inga observationer och
// därmed inga residualer; u₀ ≡ 1 per konstruktion. Gränsen var alltså både fel
// storhet och matematiskt onåbar, vilket gjorde att högsta klassen aldrig kunde
// nås och att nät systematiskt underklassificerades.
// ─────────────────────────────────────────────────────────────────────────────

// Normgolv – nätet underkänns PÅ eller under detta värde. Normstyrt, ändra inte.
export const K_NAT_GOLV = 0.50;

// Källhänvisningen som följer med varje k- och r-gräns ut i UI, rapporter och
// teckenförklaringar. Ett ställe, så att de inte kan börja säga olika saker.
//
// SIS-TS står först eftersom huvudappen inte vet vilken projekttyp nätet
// tillhör. TDOK 2014:0571 v6.0 §2.8 K3 gäller BRUKSNÄT I PLAN hos Trafikverket
// och kan därför inte påstås vara källan för ett godtyckligt nät användaren
// ritar. Kravet är dock detsamma i båda, vilket parentesen säger.
//
// PM:et vet vilken verksamhet och nättyp som gäller och skriver därför ut den
// fulla TDOK-hänvisningen där (Etapp 3–5).
export const K_R_KALLA =
  'SIS-TS 21143:2016 §6.2.2 (samma krav i TDOK 2014:0571 v6.0 §2.8 K3 för bruksnät i plan)';

// ─────────────────────────────────────────────────────────────────────────────
// KVALITETSSKALOR – ENDAST NORMSTÖDDA GRÄNSER
//
// Underlag: docs/troubleshooting/ui_inventering_20260910.md samt beställarens
// beslut 2026-09-13:
//
//   "Vi ska inte ta hänsyn till något som inte har normstöd. Utan stöd för det
//    vi säger ska vi bara ange siffrorna och låta användaren själv bedöma om
//    det är god marginal, accepterat eller dåligt. Vi kan dock flagga om
//    värden går under acceptabel nivå."
//
// Följden: produkten klassificerar INTE kvalitet. Den redovisar talet och
// säger en enda sak om det – om det uppfyller normen eller inte. Varje gräns
// nedan bär en normhänvisning. Band utan sådan är borttagna:
//
//   BORTTAGET   0,70 för k ("God marginal", tidigare "Överbestämt").
//               Varken SIS-TS eller HMK anger någon övre gräns för k.
//   BORTTAGET   0,30 och 0,10 för k ("Under norm"/"Svagt"/"Otillräckligt" som
//               tre steg). Ingen norm graderar HUR långt under golvet ett nät
//               ligger – bara att det är under. Talet visas, användaren dömer.
//   BORTTAGET   0,30 för r-tal. Var produktens egen felgräns; SIS-TS anger
//               0,35. Se R_OBS_NORM nedan.
//   BORTTAGET   5 mm och 20 mm för σ_pos. Rena produktval. σ_pos färgas nu mot
//               projektets EGET krav (state.sigReq), som användaren själv satt.
//
// ── GRÄNSERNA SOM FINNS KVAR, MED KÄLLA ────────────────────────────────────
//   k > 0,50     TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2,
//                nätet. STRIKT – k = 0,50 exakt uppfyller inte kravet.
//   r-tal > 0,35 TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2,
//                enskild observation. STRIKT – r = 0,35 exakt uppfyller inte
//                kravet. Samma värde som SIS_TS_GENERAL_REQS.k_individual_min.
//   r-tal ≥ 0,50 HMK-Stommätning 2024 Bilaga F.2 "Kontrollerbarhet och k-tal"
//                – rekommendation, nivån för ingen anmärkning. Samma tröskel
//                återkommer i HMK §3.3.1 och Tabell 9. Detta är INTE v6-kravet
//                och jämförelsen är därför INTE strikt: HMK:s ordalydelse är
//                inte verifierad, så >= står kvar (beställarens beslut).
//
// r_i säger hur stor del av ett grovfel i observationen som syns i
// residualerna. Lågt r-tal = grovfelet slår rakt in i koordinaterna.
//
// OPTIMERINGEN läser samma värden (core/optimizer-criteria.js): hårt krav
// R_OBS_NORM, mjukt krav R_OBS_GOD. Valideringens felgräns är numera också
// R_OBS_NORM, så ett optimerat nät kan få varningar men aldrig fel – samma
// invariant som förut, men nu med normens tal i stället för produktens.
// ─────────────────────────────────────────────────────────────────────────────

/** TDOK 2014:0571 v6.0 §2.8 K3 · SIS-TS 21143:2016 §6.2.2 – golv för ENSKILD
 *  observation. Kravet är r-tal STÖRRE ÄN detta värde. */
export const R_OBS_NORM = 0.35;

/** HMK-Stommätning 2024 Bilaga F.2 "Kontrollerbarhet och k-tal" – rekommendation. */
export const R_OBS_GOD  = 0.50;

/**
 * Kontrollerbarhetstalet k = f/n för NÄTET.
 * Två utfall, eftersom normen bara definierar ett golv.
 * Returnerar { klass, cssKlass, farg, uppfyllerNorm }.
 */
export function klassificeraKtal(k) {
  // Strikt >: TDOK v6 §2.8 K3 och SIS-TS §6.2.2 säger "större än 0,5".
  return k > K_NAT_GOLV
    ? { klass: "Uppfyller norm", cssKlass: "val-good",   farg: "#00ff88", uppfyllerNorm: true  }
    : { klass: "Under norm",     cssKlass: "val-danger", farg: "#ff5050", uppfyllerNorm: false };
}

/**
 * Redundanstalet r-tal för EN OBSERVATION.
 * Tre utfall: två normgolv finns (SIS-TS och HMK), inget mer.
 */
export function klassificeraRtal(r) {
  if (r >= R_OBS_GOD)
    return { klass: "Ingen anmärkning", cssKlass: "val-good",    farg: "#00ff88", uppfyllerNorm: true  };
  // Strikt >: TDOK v6 §2.8 K3 och SIS-TS §6.2.2 säger "större än 0,35".
  // Raden ovan (R_OBS_GOD) är HMK:s rekommendation och behåller >=.
  if (r > R_OBS_NORM)
    return { klass: "Uppfyller norm",   cssKlass: "val-caution", farg: "#ffcc00", uppfyllerNorm: true  };
  return   { klass: "Under norm",       cssKlass: "val-danger",  farg: "#ff5050", uppfyllerNorm: false };
}

// Banden som datastruktur, för teckenförklaringen i kartan, bandförklaringen i
// högerpanelen och tester. Fallande ordning, samma som klassificerarna prövar i.
// `kalla` är normhänvisningen som visas för användaren.
//
// `exkl: true` betyder att bandets undre gräns är STRIKT – värdet måste vara
// större än `min`, inte minst `min`. Etapp 2 införde flaggan eftersom TDOK v6
// §2.8 K3 och SIS-TS §6.2.2 säger "större än" medan HMK:s rekommendation
// (R_OBS_GOD) inte gör det. Utan flaggan kunde bandtexten i UI inte skilja
// "> 0,50" från "≥ 0,50", och bandIntervall() nedan skulle formulera fel.
// Flaggan MÅSTE spegla jämförelsen i klassificeraKtal/klassificeraRtal.
export const K_BAND = Object.freeze([
  { min: K_NAT_GOLV, exkl: true,  klass: "Uppfyller norm", kalla: K_R_KALLA },
  { min: 0,          exkl: false, klass: "Under norm",     kalla: K_R_KALLA },
]);

export const R_BAND = Object.freeze([
  { min: R_OBS_GOD,  exkl: false, klass: "Ingen anmärkning", kalla: "HMK – Stommätning 2024 Bilaga F.2 (rekommendation)" },
  { min: R_OBS_NORM, exkl: true,  klass: "Uppfyller norm",   kalla: K_R_KALLA },
  { min: 0,          exkl: false, klass: "Under norm",       kalla: K_R_KALLA },
]);

/**
 * Intervalltexten för band nr `i` i `band`, t.ex. "> 0,50", "≥ 0,50",
 * "> 0,35 och < 0,50" eller "≤ 0,50".
 *
 * Bandet ovanför sätter den övre gränsen, och dess `exkl` avgör om den övre
 * gränsen är öppen eller stängd: är bandet ovanför strikt (> m) så tillhör
 * exakt m det här bandet, alltså "≤ m".
 *
 * Fanns tidigare i två handskrivna kopior – bandText() i ui/map-legend.js och
 * bandForklaring() i ui/right-panel.js – som båda antog att alla gränser var
 * inklusiva. Samlad här när gränserna blev strikta, så att de två inte kan
 * beskriva samma skala olika.
 */
export function bandIntervall(band, i, fmt = v => v.toFixed(2).replace('.', ',')) {
  const b     = band[i];
  const nedre = b.exkl ? `> ${fmt(b.min)}` : `≥ ${fmt(b.min)}`;
  if (i === 0) return nedre;                       // översta bandet: ingen övre gräns
  const ovre  = band[i - 1];
  const ovreT = ovre.exkl ? `≤ ${fmt(ovre.min)}` : `< ${fmt(ovre.min)}`;
  if (b.min === 0) return ovreT;                   // understa bandet: ingen undre gräns
  return `${nedre} och ${ovreT}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUNKTOSÄKERHET σ_pos
//
// SIS-TS anger inget golv för σ_pos – kravet sätts per projekt (state.sigReq)
// eller per mätklass i optimeringen. Produkten har därför ingenting att säga om
// ett σ_pos-värde i sig. Färgsättningen mäter mot ANVÄNDARENS EGET krav när ett
// sådant är satt, och är neutral annars.
//
// Tidigare färgade koden mot 5 mm och 20 mm – tal utan källa, och dessutom
// olika i kvalitetspanelen (10 mm) och tabellerna (20 mm).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS-klass för en punktosäkerhet i mm.
 * @param {number} mm
 * @param {number|null} krav  projektets σ_pos-krav i mm. Utelämnat ⇒ neutral.
 */
export function sigPosKlass(mm, krav = null) {
  if (!Number.isFinite(mm)) return "val-muted";
  if (!Number.isFinite(krav) || krav <= 0) return "val-value";
  return mm <= krav ? "val-good" : "val-danger";
}
