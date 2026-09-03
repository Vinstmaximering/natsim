// Minimal observable state store.
// All state mutations must go through setState() so future refactors
// (Zustand, Pinia, Redux) can be dropped in without touching call-sites.
let _state = {
  // ── Nätdata ──
  pts: [],
  meas: [],
  obstacles: [],
  simResult: null,
  centerErr: 1.0,
  activeMatklass: null,
  // Maxavstånd (m) för automatiskt föreslagna mätningar. null = obegränsat.
  // Långsträckta nät (tunnlar) fick tidigare förslag på flera km.
  maxSuggestDist: 500,
  suggestedMeas: [],
  blockedSuggestions: [], // [{from, to, blockedBy}] – siktlinje blockerad av hinder

  // ── Visuellt lager (Etapp D) ──
  // Enbart för visuell dokumentation – simuleringen läser aldrig dessa.
  visualPts: [],
  visualLines: [],
  selVisualId: null,
  nVid: 1,
  nVlid: 1,

  // ── Nätoptimering (Etapp E) ──
  // Vikterna styr optimeringens avvägning mellan sänkt punktosäkerhet och
  // höjda redundanstal. Sparas i projektfilen; äldre filer laddas med 50/50.
  // sigma_max_mm = projektets σ_pos-tak; null ⇒ mätklassens default (Fas 2).
  optimizerConfig: { weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null },
  // Sparat förslag från "Behåll som förslag": { meas, simResult, log, ... }.
  // Lever bara i sessionen – ett förslag är inte ett projekttillstånd.
  optimizerProposal: null,
  // Vilket nät kartan och statistiken visar: "original" eller "optimized".
  netView: 'original',

  // ── Hinder-selektion ──
  selObsId: null,

  // ── ID-räknare ──
  nMid: 1,
  nId: 1,

  // ── Verktyg & selektion ──
  tool: "station",
  selId: null,
  selMId: null,
  measFrom: null,
  defaultInstr: "ts16_1",

  // ── Karta ──
  activeCRS: "sweref99tm",
  activeLayerKey: "osm",
  mapLayerVisible: true,

  // ── Renderingsparametrar ──
  symSize: 10,
  ellScale: 50,
  ellipsMode: "1sig",   // "1sig" = 1σ (Geo Professional), "95" = 95%-konfidensellips
  au: "grad",           // vinkelenhet: "grad" (gon) eller "dms"
};

const _listeners = [];

// Registered by main.js via setAutoSimHandler() – avoids circular imports.
// Called by setState when pts or meas change.
let _autoSimHandler = null;

export function getState() {
  return _state;
}

export function setState(partial) {
  _state = { ..._state, ...partial };
  _listeners.forEach(fn => fn(_state));
  // Trigger debounced simulation when pts or meas change
  if (_autoSimHandler && (partial.pts !== undefined || partial.meas !== undefined)) {
    _autoSimHandler();
  }
}

export function subscribe(fn) {
  _listeners.push(fn);
  return () => { const i = _listeners.indexOf(fn); if (i !== -1) _listeners.splice(i, 1); };
}

// Called once from main.js after all modules are loaded – wires up autoSim
// without creating circular imports (store ← undo ← simulation ← store).
export function setAutoSimHandler(fn) { _autoSimHandler = fn; }
