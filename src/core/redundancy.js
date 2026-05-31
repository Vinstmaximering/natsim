// Kopierad exakt från NätSim_Beta_2.html rad 1399–1400.
// Används av map/lines.js för färgkodning av mätlinjer.
export function rColor(r) { return r >= 0.5 ? "#00ff88" : r >= 0.3 ? "#ffcc00" : r >= 0.1 ? "#ff9900" : "#ff5050"; }
export function rLabel(r) { return r >= 0.5 ? "Starkt" : r >= 0.3 ? "Acceptabelt" : r >= 0.1 ? "Svagt" : "Otillräckligt"; }
