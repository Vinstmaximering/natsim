// CRUD-operationer för hinder.
// addObstacle/removeObstacle kallar setState vilket triggar draw via subscribers.
// AutoSim-koppling till simulering sker i Fas 3.
import { getState, setState } from './store.js';

let _nObs = 1;

export function addObstacle(obs) {
  const id = `obs_${_nObs++}`;
  const o = { type: 'polygon', label: '', ...obs, id };
  const { obstacles } = getState();
  setState({ obstacles: [...obstacles, o], selObsId: id });
  return id;
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
  setState({ obstacles: obstacles.map(o => o.id === id ? { ...o, ...changes } : o) });
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
