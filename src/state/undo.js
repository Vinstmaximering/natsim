// Kopierad exakt från NätSim_Beta_2.html rad 363–395 + 781–797.
// Strukturella ändringar: undoStack lokal (ej global), autoSim exporteras,
// DOM-anrop skyddas med typeof document-check för testmiljö.
import { getState, setState } from './store.js';
import { runSimulation } from '../core/simulation.js';

export const UNDO_MAX = 50;   // rad 364 exakt
let _undoStack = [];

// ── D1/F2: Debounced auto-simulering – rad 783–791 exakt ──
let _autoSimTimer = null;
let _autoSimEnabled = true;

export function autoSim() {
  if (!_autoSimEnabled) return;
  if (_autoSimTimer) clearTimeout(_autoSimTimer);
  _autoSimTimer = setTimeout(() => {
    _autoSimTimer = null;
    runSimulation();
  }, 300);
}

export function setAutoSim(on) {
  _autoSimEnabled = !!on;
  if (typeof document !== 'undefined') {
    const el = document.getElementById('autoSimToggle');
    if (el) el.checked = _autoSimEnabled;
  }
  if (on) autoSim();
}

// ── Undo-stack – rad 367–395 exakt ──
export function saveUndo(label = "") {
  const { pts, meas, nMid, nId } = getState();
  _undoStack.push({
    label,
    pts:  JSON.parse(JSON.stringify(pts)),
    meas: JSON.parse(JSON.stringify(meas)),
    nMid, nId
  });
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
  updateUndoBtn();
  autoSim();   // rad 376: trigga auto-simulering vid varje ändring
}

export function undo() {
  if (_undoStack.length === 0) {
    if (_undoCb.showToast) _undoCb.showToast("Inget att ångra", "#7090a8");
    return;
  }
  const s = _undoStack.pop();
  setState({
    pts: s.pts,
    meas: s.meas,
    nMid: s.nMid ?? getState().nMid,
    nId:  s.nId  ?? getState().nId,
    simResult: null
  });
  updateUndoBtn();
  // rad 385–387 i original: draw() + showToast() efter undo
  if (_undoCb.showToast) _undoCb.showToast(`↩ Ångrade: ${s.label || "senaste åtgärd"}`, "#4fc3f7");
  if (_undoCb.draw) _undoCb.draw();
  if (_undoCb.updateQualityPanel) _undoCb.updateQualityPanel();
}

export function updateUndoBtn() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById("btn-undo");
  if (!btn) return;
  btn.disabled = _undoStack.length === 0;
  btn.style.opacity = _undoStack.length === 0 ? "0.35" : "1";
  btn.title = _undoStack.length > 0
    ? `Ångra: ${_undoStack[_undoStack.length - 1].label}`
    : "Inget att ångra";
}

// ── Bugg 3-fix: UI-callbacks för draw/toast efter undo ──────────────────────
// Samma callback-mönster som autoSim i store.js – registreras av main.js.
const _undoCb = { draw: null, updateQualityPanel: null, showToast: null };
export function setUndoCallbacks(cbs) { Object.assign(_undoCb, cbs); }

// Exponerar stacken för UI (knappstatus etc.)
export function getUndoStack() { return _undoStack; }
