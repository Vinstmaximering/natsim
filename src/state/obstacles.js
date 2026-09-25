// CRUD-operationer för hinder.
// addObstacle/removeObstacle kallar setState vilket triggar draw via subscribers.
// AutoSim-koppling till simulering sker i Fas 3.
import { getState, setState } from './store.js';
import { normalizeHexColor, hexToRgba } from '../core/colors.js';

let _nObs = 1;

// ── Färg per hinder-objekt (Etapp B) ─────────────────────────────────────────
// obs.color är en hex-sträng "#rrggbb" eller null/saknad = standardfärg.
// Bakåtkompatibilitet: äldre projektfiler saknar fältet och ritas som förut.

// Palett i hinder-dialogen. Vald för att skilja vanliga strukturtyper åt.
export const OBSTACLE_COLORS = [
  { hex: '#8aa8c0', label: 'Standard' },
  { hex: '#8d6e63', label: 'Bergvägg' },
  { hex: '#9e9e9e', label: 'Betongvägg' },
  { hex: '#ff9900', label: 'Byggnad' },
  { hex: '#66bb6a', label: 'Planerad struktur' },
  { hex: '#ba68c8', label: 'Övrigt' },
];

// Hex-hanteringen är gemensam med det visuella lagret och bor i core/colors.js.
// Aliaset behålls för hinder-specifika anropsställen och tester.
export const normalizeObstacleColor = normalizeHexColor;
export { hexToRgba };

export function addObstacle(obs) {
  const id = `obs_${_nObs++}`;
  const o = { type: 'polygon', label: '', ...obs, id };
  o.color = normalizeObstacleColor(o.color);
  const { obstacles } = getState();
  setState({ obstacles: [...obstacles, o], selObsId: id });
  return id;
}

// Nästa lediga hinder-id, för hinder som byggs utan addObstacle – de kopplade
// segmenthindren till en polylinje (state/visual.js), som läggs in i ett svep
// och inte ska ändra markeringen.
export function nextObstacleId() {
  return `obs_${_nObs++}`;
}

export function removeObstacle(id) {
  const { obstacles, selObsId } = getState();
  setState({
    obstacles: obstacles.filter(o => o.id !== id),
    selObsId: selObsId === id ? null : selObsId,
  });
}

export function updateObstacle(id, changes) {
  const { obstacles } = getState();
  const c = 'color' in changes ? { color: normalizeObstacleColor(changes.color) } : null;
  setState({ obstacles: obstacles.map(o => o.id === id ? { ...o, ...changes, ...c } : o) });
}

// Saneras vid laddning från fil: ogiltig färg blir null = standardfärg.
export function _sanitizeObstacleColors(obstacles) {
  return (obstacles || []).map(o =>
    'color' in o ? { ...o, color: normalizeObstacleColor(o.color) } : o);
}

export function getObstacles() {
  return getState().obstacles || [];
}

export function clearObstacleSelection() {
  setState({ selObsId: null });
}

// Synkar den interna ID-räknaren efter att obstacles laddats från fil.
// Förhindrar ID-kollision mellan laddade hinder och framtida addObstacle-anrop.
export function _syncObstacleCounter(obstacles) {
  if (!obstacles || obstacles.length === 0) { _nObs = 1; return; }
  const max = obstacles.reduce((m, o) => {
    const hit = /^obs_(\d+)$/.exec(o.id || '');
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
  _nObs = max + 1;
}
