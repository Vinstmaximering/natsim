// Förkonfigurerade presets för auto-generering av nätbilder i PM-steget.
// background:'white' är default för alla presets – ger ett professionellt,
// utskriftsvänligt resultat. Användaren kan byta till 'grid' via toggle i UI.
//
// ETAPP 4. Nycklarna hette tidigare 'R3.2', 'R3.3', 'R3.4' och 'R3.12' efter
// SIS-TS 21143:2016 Bilaga B. Två fel följde av det:
//
//   1. Koderna var omkastade. 'R3.3' producerade en bild med bara kända punkter
//      (= Bilaga B:s R3.4 Anslutningspunkter) och 'R3.4' en med mätningarna
//      (= R3.3 Nätkarta/nätutformning). 'R3.12' är Punktbeskrivningar i Bilaga B,
//      inte lägesosäkerheter.
//   2. Koderna gäller bara mall D (Ej Trafikverket). I mall A–C följer rapporten
//      TDOK 2014:0571 v6.0 och då säger en R-kod ingenting.
//
// Nycklarna är därför neutrala och beskriver vad bilden FÖRESTÄLLER. R-koderna
// sätts av mall D när den placerar bilden. Slot-id:na i imgs och v_-fälten
// (r32/r33/r34/r312) är oförändrade, så gamla utkast och sparade bilder följer
// med – se SLOT_PRESET nedan.
export const IMAGE_PRESETS = {
  oversikt: {
    label: 'Översikt',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: false, showObstacles: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Översikt av nätet',
    },
  },
  anslutning: {
    label: 'Anslutningspunkter',
    options: {
      showKnown: true, showStations: false, showNew: false,
      showDetail: false, showSimStations: false,
      showMeasurements: false, showObstacles: false,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Kända anslutningspunkter',
    },
  },
  natkarta: {
    label: 'Nätkarta och planerade observationer',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: true, showObstacles: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Nätutformning och planerade observationer',
    },
  },
  osakerhet: {
    label: 'Lägesosäkerheter',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: false, showEllipses: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Lägesosäkerheter (1σ felellipser)',
    },
  },
};

// Bildslot → preset. Slot-id:t är det som lagras i imgs och som v_-fälten heter
// (v_r32txt osv.). Det är BEVARAT från före Etapp 4 så att sparade utkast och
// bilder inte tappas; bara etiketten och presetens innehåll är rättade.
//
// Notera kopplingen r33 → anslutning och r34 → natkarta: den speglar vad
// sloten faktiskt innehöll, inte vad den gamla koden påstod.
export const SLOT_PRESET = Object.freeze({
  r32:  'oversikt',
  r33:  'anslutning',
  r34:  'natkarta',
  r312: 'osakerhet',
});

// Ordningen sloten visas i bildsteget och i mall D.
export const SLOTS = Object.freeze(['r32', 'r34', 'r33', 'r312']);

// Etikett per slot, utan normkod. Mall D sätter sina R-koder själv.
export const SLOT_LABEL = Object.freeze({
  r32:  'Översikt',
  r34:  'Nätkarta och planerade observationer',
  r33:  'Kända anslutningspunkter',
  r312: 'Lägesosäkerheter',
});

// SIS-TS 21143:2016 Bilaga B-koder, för mall D (Ej Trafikverket). Rättade mot
// Bilaga B: R3.3 är Nätkarta/nätutformning och markering, R3.4 är
// Anslutningspunkter/kända punkter. Lägesosäkerheterna hör hemma under R3.3,
// som enligt Bilaga B ska redovisa mätningar och felellipser grafiskt.
export const SLOT_R_KOD = Object.freeze({
  r32:  'R3.2',
  r34:  'R3.3',
  r33:  'R3.4',
  r312: 'R3.3',
});
