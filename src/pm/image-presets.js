// Förkonfigurerade presets för auto-generering av nätbilder i PM-steget.
// background:'white' är default för alla presets – ger ett professionellt,
// utskriftsvänligt resultat. Användaren kan byta till 'grid' via toggle i UI.
export const IMAGE_PRESETS = {
  'R3.2': {
    label: 'Översikt',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: false, showObstacles: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Översikt av nätet',
    },
  },
  'R3.3': {
    label: 'Kända punkter',
    options: {
      showKnown: true, showStations: false, showNew: false,
      showDetail: false, showSimStations: false,
      showMeasurements: false, showObstacles: false,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Kända anslutningspunkter',
    },
  },
  'R3.4': {
    label: 'Mätgeometri',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: true, showObstacles: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Mätgeometri',
    },
  },
  'R3.12': {
    label: 'Felellipser',
    options: {
      showKnown: true, showStations: true, showNew: true,
      showDetail: true, showSimStations: true,
      showMeasurements: false, showEllipses: true,
      showLabels: true, showLegend: true, showScale: true, showNorth: true,
      title: 'Lägesosäkerheter (1σ felellipser)',
    },
  },
};
