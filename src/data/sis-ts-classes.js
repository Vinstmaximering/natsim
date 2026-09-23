// Värden hämtade från SIS-TS 21143:2016 Tabell A.9 - verifierade mot dokument
import { K_NAT_GOLV, R_OBS_NORM } from '../core/constants.js';

export const SIS_TS_CLASSES = {
  G1: {
    name: 'G1',
    usage: 'Nät för exceptionella anläggningar och hus-/industrikonstruktioner med prefabricerade element. Kontrollmätning av exceptionella konstruktioner.',
    totalstation: 'T1',
    spridningHvVv_mgon: 0.6,
    spridningLangd_mm: 2,
    antalHelsatser: 3,
    dubbelmattaLangder: '≤ 2 mm + 1 ppm',
    centreringMedelfel_mm: '0,3 - 1',
    _source: 'SIS-TS 21143:2016 Tabell A.9'
  },
  G2: {
    name: 'G2',
    usage: 'Nät för spåranläggning, broar och övriga anläggningar med höga krav. Fackverksnät. Nät för rörelse- och sättningskontroller. Trigonometrisk höjdmätning av bruksnät.',
    totalstation: 'T1',
    spridningHvVv_mgon: 1.2,
    spridningLangd_mm: 3,
    antalHelsatser: 3,
    dubbelmattaLangder: '≤ 3 mm + 3 ppm',
    centreringMedelfel_mm: 1,
    _source: 'SIS-TS 21143:2016 Tabell A.9'
  },
  G3: {
    name: 'G3',
    usage: 'Bruksnät och nät för projektering och byggande av anläggningar med tillhörande konstruktioner.',
    totalstation: 'T2',
    spridningHvVv_mgon: 2.0,
    spridningLangd_mm: 5,
    antalHelsatser: 2,
    dubbelmattaLangder: '≤ 5 mm + 3 ppm',
    centreringMedelfel_mm: 2,
    _source: 'SIS-TS 21143:2016 Tabell A.9'
  },
  G4: {
    name: 'G4',
    usage: 'Bruksnät och nät för anläggningar av enklare karaktär med lägre krav på lägesnoggrannhet. GNSS-teknik kan ersätta terrester mätning.',
    totalstation: 'T3',
    spridningHvVv_mgon: 3.0,
    spridningLangd_mm: 8,
    antalHelsatser: 2,
    dubbelmattaLangder: '≤ 8 mm + 3 ppm',
    centreringMedelfel_mm: 3,
    _source: 'SIS-TS 21143:2016 Tabell A.9'
  }
};

// Generella krav samma för alla klasser (SIS-TS sek 6.2.2 + HMK Stommätning 2024 sek 3.3.1)
//
// Etapp 2: talen är inte längre skrivna två gånger. De kommer ur
// core/constants.js, som också äger jämförelsen – kravet är STÖRRE ÄN dessa
// värden (TDOK 2014:0571 v6.0 §2.8 K3, SIS-TS §6.2.2), inte minst.
// Suffixet _min är kvar eftersom fälten läses av optimizer-criteria.js.
export const SIS_TS_GENERAL_REQS = {
  k_global_min: K_NAT_GOLV,
  k_individual_min: R_OBS_NORM,
  muf_factor_max: 4,
  yt_factor_max: 2,
  _source: 'SIS-TS 21143:2016 sek 6.2.2, HMK Stommätning 2024 sek 3.3.1'
};
