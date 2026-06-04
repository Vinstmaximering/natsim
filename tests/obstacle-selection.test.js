import { describe, it, expect, beforeEach } from 'vitest'
import { getState, setState } from '../src/state/store.js'
import {
  addObstacle,
  removeObstacle,
  clearObstacleSelection,
  _syncObstacleCounter,
} from '../src/state/obstacles.js'

// Återställ state-relevanata fält mellan tester
beforeEach(() => {
  setState({ obstacles: [], selObsId: null });
  _syncObstacleCounter([]);
});

describe('clearObstacleSelection', () => {

  it('sätter selObsId till null', () => {
    setState({ selObsId: 'obs_1' });
    expect(getState().selObsId).toBe('obs_1');
    clearObstacleSelection();
    expect(getState().selObsId).toBeNull();
  });

  it('är idempotent – anrop utan markering ger ingen krasch', () => {
    expect(getState().selObsId).toBeNull();
    expect(() => clearObstacleSelection()).not.toThrow();
    expect(getState().selObsId).toBeNull();
  });

  it('addObstacle sätter selObsId till det nya hindrets id', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    expect(getState().selObsId).toBe(id);
  });

  it('removeObstacle rensar selObsId om det borttagna var markerat', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    expect(getState().selObsId).toBe(id);
    removeObstacle(id);
    expect(getState().selObsId).toBeNull();
  });

  it('removeObstacle bevarar selObsId om ett annat hinder var markerat', () => {
    const id1 = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    const id2 = addObstacle({ type: 'line',    points: [[2,0],[3,0]] });
    setState({ selObsId: id2 });
    removeObstacle(id1);
    expect(getState().selObsId).toBe(id2);
  });

});

describe('Toggle-logik (simulerar _selObs)', () => {

  // Extraherad toggle-logik identisk med obstacle-panel._selObs
  function selObs(id) {
    const { selObsId } = getState();
    if (selObsId === id) { clearObstacleSelection(); }
    else { setState({ selObsId: id }); }
  }

  it('klick på omarkerat hinder markerar det', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    clearObstacleSelection();
    selObs(id);
    expect(getState().selObsId).toBe(id);
  });

  it('klick igen på samma hinder avmarkerar (toggle)', () => {
    const id = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    setState({ selObsId: id });
    selObs(id);
    expect(getState().selObsId).toBeNull();
  });

  it('klick på annat hinder byter selektion', () => {
    const id1 = addObstacle({ type: 'polygon', points: [[0,0],[1,0],[1,1]] });
    const id2 = addObstacle({ type: 'line',    points: [[2,0],[3,0]] });
    setState({ selObsId: id1 });
    selObs(id2);
    expect(getState().selObsId).toBe(id2);
  });

});

describe('Esc-prioritetsordning (simulerad)', () => {

  it('Esc rensar selektion om inte i ritläge', () => {
    setState({ selObsId: 'obs_1' });
    const isDrawing = () => false;

    // Simulera keydown-handlens logik exakt
    const handleEsc = () => {
      if (isDrawing()) {
        // cancelDraw() – ej relevant här
      } else if (getState().selObsId) {
        clearObstacleSelection();
      }
    };

    handleEsc();
    expect(getState().selObsId).toBeNull();
  });

  it('Esc i ritläge avbryter ritning, rör INTE selObsId', () => {
    setState({ selObsId: 'obs_1' });
    let drawCancelled = false;
    const isDrawing = () => true;

    const handleEsc = () => {
      if (isDrawing()) {
        drawCancelled = true; // simulerar cancelDraw()
      } else if (getState().selObsId) {
        clearObstacleSelection();
      }
    };

    handleEsc();
    expect(drawCancelled).toBe(true);
    // selObsId ska INTE ha rensats
    expect(getState().selObsId).toBe('obs_1');
  });

  it('Esc utan selektion och utan ritläge gör ingenting', () => {
    setState({ selObsId: null });
    let drawCancelled = false;
    const isDrawing = () => false;

    const handleEsc = () => {
      if (isDrawing()) { drawCancelled = true; }
      else if (getState().selObsId) { clearObstacleSelection(); }
    };

    handleEsc();
    expect(drawCancelled).toBe(false);
    expect(getState().selObsId).toBeNull();
  });

});

describe('Klick-utanför-karta (simulerad)', () => {

  it('kartklick rensar selObsId när ett hinder är markerat', () => {
    setState({ selObsId: 'obs_5' });

    // Simulera klick-handlens clear-logik
    const handleMapClick = () => {
      if (getState().selObsId) clearObstacleSelection();
    };

    handleMapClick();
    expect(getState().selObsId).toBeNull();
  });

  it('kartklick utan markerat hinder ger ingen krasch', () => {
    setState({ selObsId: null });
    const handleMapClick = () => {
      if (getState().selObsId) clearObstacleSelection();
    };
    expect(() => handleMapClick()).not.toThrow();
  });

});
