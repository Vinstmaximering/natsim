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

// Punkttypsdefinitioner – label, ID-prefix, canvas-färg
export const PT = {
  known:     { l:"Känd punkt",             s:"FP", c:"#00ff88" },
  station:   { l:"Uppställning",           s:"S",  c:"#4fc3f7" },
  detail:    { l:"Detaljpunkt",            s:"D",  c:"#ffb74d" },
  new:       { l:"Ny punkt",              s:"NY", c:"#ce93d8" },
  simstation:{ l:"Simulerad uppställning", s:"SS", c:"#ff6090" },
};

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
