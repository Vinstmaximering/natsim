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
