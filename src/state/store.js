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
  suggestedMeas: [],

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
