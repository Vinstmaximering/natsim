// Etapp B: färg per vägg-/byggnadsobjekt.
// – normalisering av hex-värden
// – rendering faller tillbaka på tidigare standardfärger utan obs.color
// – serialisering + bakåtkompatibilitet för projektfiler utan fältet

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OBSTACLE_COLORS,
  normalizeObstacleColor,
  hexToRgba,
  addObstacle,
  updateObstacle,
} from '../src/state/obstacles.js';
import { obstacleStroke, obstacleFill } from '../src/map/obstacles-canvas.js';
import { getState, setState } from '../src/state/store.js';
import { _buildSnapshot, _applySnapshot } from '../src/io/export-project.js';

// Färgerna som gällde före Etapp B – rendering utan obs.color måste matcha exakt.
const DEF_STROKE     = 'rgba(40,40,40,0.8)';
const DEF_STROKE_SEL = 'rgba(255,140,0,0.9)';
const DEF_FILL       = 'rgba(80,80,80,0.35)';
const DEF_FILL_SEL   = 'rgba(255,140,0,0.18)';

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null,
  activeCRS: 'sweref99tm', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1',
  symSize: 10, ellScale: 50, ellipsMode: '1sig', au: 'grad', nMid: 1,
};

const WALL = { type: 'line', label: 'Vägg', points: [[0, 0], [10, 0]] };

describe('normalizeObstacleColor', () => {
  it('normaliserar till #rrggbb i gemener', () => {
    expect(normalizeObstacleColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeObstacleColor('#8d6e63')).toBe('#8d6e63');
  });

  it('accepterar hex utan brädgård', () => {
    expect(normalizeObstacleColor('8d6e63')).toBe('#8d6e63');
  });

  it('expanderar kortform', () => {
    expect(normalizeObstacleColor('#abc')).toBe('#aabbcc');
    expect(normalizeObstacleColor('f00')).toBe('#ff0000');
  });

  it('trimmar omgivande blanksteg', () => {
    expect(normalizeObstacleColor('  #abc  ')).toBe('#aabbcc');
  });

  it('ger null för ogiltiga värden', () => {
    const bad = ['', '#12', '#12345', '#gggggg', 'rött', '#1234567', null, undefined, 42, {}];
    bad.forEach(v => expect(normalizeObstacleColor(v)).toBeNull());
  });
});

describe('hexToRgba', () => {
  it('konverterar hex till rgba med angiven alfa', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(hexToRgba('#8d6e63', 1)).toBe('rgba(141,110,99,1)');
  });

  it('ger null för ogiltig hex så att anroparen kan falla tillbaka', () => {
    expect(hexToRgba('inte en färg', 1)).toBeNull();
    expect(hexToRgba(null, 1)).toBeNull();
  });
});

describe('rendering – bakåtkompatibilitet', () => {
  it('hinder utan färg ritas med exakt tidigare standardfärger', () => {
    const obs = { type: 'polygon', points: [] };
    expect(obstacleStroke(obs, false)).toBe(DEF_STROKE);
    expect(obstacleStroke(obs, true)).toBe(DEF_STROKE_SEL);
    expect(obstacleFill(obs, false)).toBe(DEF_FILL);
    expect(obstacleFill(obs, true)).toBe(DEF_FILL_SEL);
  });

  it('obs.color = null behandlas som standardfärg', () => {
    expect(obstacleStroke({ color: null }, false)).toBe(DEF_STROKE);
  });

  it('ogiltig färg faller tillbaka på standardfärgen i stället för att krascha', () => {
    expect(obstacleStroke({ color: 'lila' }, false)).toBe(DEF_STROKE);
    expect(obstacleFill({ color: 'lila' }, false)).toBe(DEF_FILL);
  });

  it('satt färg används för både kontur och fyllning', () => {
    const obs = { color: '#ff0000' };
    expect(obstacleStroke(obs, false)).toBe('rgba(255,0,0,0.85)');
    expect(obstacleStroke(obs, true)).toBe('rgba(255,0,0,1)');
    expect(obstacleFill(obs, false)).toBe('rgba(255,0,0,0.25)');
    expect(obstacleFill(obs, true)).toBe('rgba(255,0,0,0.3)');
  });
});

describe('färg i state-strukturen', () => {
  beforeEach(() => setState({ ...BASE, obstacles: [] }));

  it('addObstacle sätter color: null när ingen färg anges', () => {
    const id = addObstacle({ ...WALL });
    expect(getState().obstacles.find(o => o.id === id).color).toBeNull();
  });

  it('addObstacle saneras – ogiltig färg blir null', () => {
    const id = addObstacle({ ...WALL, color: 'inte-hex' });
    expect(getState().obstacles.find(o => o.id === id).color).toBeNull();
  });

  it('addObstacle behåller giltig färg normaliserad', () => {
    const id = addObstacle({ ...WALL, color: '#ABC' });
    expect(getState().obstacles.find(o => o.id === id).color).toBe('#aabbcc');
  });

  it('updateObstacle sätter färg per objekt utan att påverka andra', () => {
    const a = addObstacle({ ...WALL });
    const b = addObstacle({ ...WALL });
    updateObstacle(a, { color: '#8d6e63' });
    const obs = getState().obstacles;
    expect(obs.find(o => o.id === a).color).toBe('#8d6e63');
    expect(obs.find(o => o.id === b).color).toBeNull();
  });

  it('updateObstacle kan nollställa till standardfärg', () => {
    const id = addObstacle({ ...WALL, color: '#ff0000' });
    updateObstacle(id, { color: '' });
    expect(getState().obstacles.find(o => o.id === id).color).toBeNull();
  });

  it('updateObstacle utan color-fält lämnar färgen orörd', () => {
    const id = addObstacle({ ...WALL, color: '#ff0000' });
    updateObstacle(id, { label: 'Nytt namn' });
    const o = getState().obstacles.find(x => x.id === id);
    expect(o.color).toBe('#ff0000');
    expect(o.label).toBe('Nytt namn');
  });
});

describe('färg – serialisering', () => {
  beforeEach(() => setState({ ...BASE, obstacles: [] }));

  it('färgen följer med i sparad projektfil', () => {
    setState({ obstacles: [{ id: 'obs_1', ...WALL, color: '#8d6e63' }] });
    expect(_buildSnapshot().obstacles[0].color).toBe('#8d6e63');
  });

  it('överlever spara → ladda', () => {
    setState({ obstacles: [{ id: 'obs_1', ...WALL, color: '#ba68c8' }] });
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    setState({ obstacles: [] });
    _applySnapshot(snap);
    expect(getState().obstacles[0].color).toBe('#ba68c8');
  });

  it('äldre projektfil utan color laddas och ritas med standardfärg', () => {
    _applySnapshot({
      ver: 3, pts: [], meas: [],
      obstacles: [{ id: 'obs_1', type: 'line', label: 'Gammal vägg', points: [[0, 0], [5, 5]] }],
    });
    const obs = getState().obstacles[0];
    expect(obs.label).toBe('Gammal vägg');
    expect(obstacleStroke(obs, false)).toBe(DEF_STROKE);
  });

  it('ogiltig färg i filen saneras till standardfärg', () => {
    _applySnapshot({
      ver: 3, pts: [], meas: [],
      obstacles: [{ id: 'obs_1', type: 'line', points: [[0, 0], [5, 5]], color: 'blå' }],
    });
    expect(getState().obstacles[0].color).toBeNull();
  });

  it('ver:2-fil ger tom hinderlista precis som förut', () => {
    _applySnapshot({ ver: 2, pts: [], meas: [], obstacles: [{ id: 'x' }] });
    expect(getState().obstacles).toEqual([]);
  });
});

describe('OBSTACLE_COLORS', () => {
  it('har sex förval', () => {
    expect(OBSTACLE_COLORS).toHaveLength(6);
  });

  it('alla förval är giltiga och normaliserade', () => {
    OBSTACLE_COLORS.forEach(c => {
      expect(normalizeObstacleColor(c.hex)).toBe(c.hex);
      expect(c.label).toBeTruthy();
    });
  });
});
