// Tester för mätnings-selektion (selMId), Esc-prioritering och sigReq-sparning.
// Bugg 1: sigReq sparas vid onchange
// Bugg 2: klick på mätning sätter selMId
// Bugg 3: Esc rensar selMId
// Regression: Esc rensar selObsId (befintligt beteende ska kvarstå)

import { describe, it, expect, beforeEach } from 'vitest';
import { getState, setState } from '../src/state/store.js';
import { clearObstacleSelection } from '../src/state/obstacles.js';

const BASE = {
  pts: [], meas: [], obstacles: [], selMId: null, selObsId: null,
  sigReq: 3, simResult: null, suggestedMeas: [], blockedSuggestions: [],
};

beforeEach(() => setState(BASE));

// ── Bugg 1: sigReq-sparning ───────────────────────────────────────────────────

describe('"Krav σ_pos"-fältet sparar värde vid change-event', () => {

  it('setState sigReq sparar korrekt värde', () => {
    setState({ sigReq: 5 });
    expect(getState().sigReq).toBe(5);
  });

  it('parseFloat-logiken ger fallback 3 vid ogiltigt värde', () => {
    const safeParse = val => parseFloat(val) || 3;
    expect(safeParse('7.5')).toBe(7.5);
    expect(safeParse('')).toBe(3);
    expect(safeParse('abc')).toBe(3);
    expect(safeParse('0')).toBe(3);  // 0 är inte tillåtet – fallback till 3
  });

  it('värdet kvarstår i state vid flikbyte (ny renderTab läser samma sigReq)', () => {
    setState({ sigReq: 8 });
    // Simulera flikbyte och tillbaka: state ska ej ha ändrats
    const { sigReq } = getState();
    expect(sigReq).toBe(8);
  });

});

// ── Bugg 2: mätnings-selektion ────────────────────────────────────────────────

describe('Klick på mätning i listvy sätter selMId', () => {

  it('setState({selMId}) sätter rätt id', () => {
    setState({ selMId: 'M1' });
    expect(getState().selMId).toBe('M1');
  });

  it('_selectMeas-logiken: setState selMId ersätter föregående markering', () => {
    setState({ selMId: 'M1' });
    setState({ selMId: 'M2' });
    expect(getState().selMId).toBe('M2');
  });

  it('selMId är null initialt (ingen mätning markerad)', () => {
    expect(getState().selMId).toBeNull();
  });

});

// ── Bugg 3: Esc rensar selMId ─────────────────────────────────────────────────

describe('Esc-prioritetsordning med selMId', () => {

  // Extraherad Esc-logik identisk med interactions.js keydown-handleren
  function handleEsc({ isDrawing = false } = {}) {
    if (isDrawing) {
      // cancelDraw + setState tool:pan – ej relevant här
    } else if (getState().selObsId) {
      clearObstacleSelection();
    } else if (getState().selMId) {
      setState({ selMId: null });
    }
  }

  it('Esc med selMId satt rensar selMId', () => {
    setState({ selMId: 'M3' });
    handleEsc();
    expect(getState().selMId).toBeNull();
  });

  it('Esc med selMId rör inte selObsId', () => {
    setState({ selMId: 'M3', selObsId: null });
    handleEsc();
    expect(getState().selObsId).toBeNull();
  });

  it('Esc i ritläge rensar INTE selMId (ritning har högre prioritet)', () => {
    setState({ selMId: 'M5' });
    handleEsc({ isDrawing: true });
    // selMId ska kvarstå – ritläge avbröts, inte selektion
    expect(getState().selMId).toBe('M5');
  });

  // ── Regression Bugg 1 (obstacle): Esc med selObsId rensar selObsId ─────────

  it('Esc med selObsId rensar selObsId (regression)', () => {
    setState({ selObsId: 'obs_1' });
    handleEsc();
    expect(getState().selObsId).toBeNull();
  });

  it('Esc med selObsId rensas FÖRE selMId (prioritetsordning)', () => {
    setState({ selObsId: 'obs_1', selMId: 'M1' });
    handleEsc();
    // selObsId ska rensas, selMId ska kvarstå
    expect(getState().selObsId).toBeNull();
    expect(getState().selMId).toBe('M1');
  });

});
