// Värden hämtade från SIS-TS 21143:2016 Tabell A.9 - verifierade mot dokument
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
export const SIS_TS_GENERAL_REQS = {
  k_global_min: 0.5,
  k_individual_min: 0.35,
  muf_factor_max: 4,
  yt_factor_max: 2,
  _source: 'SIS-TS 21143:2016 sek 6.2.2, HMK Stommätning 2024 sek 3.3.1'
};
