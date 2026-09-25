// Polylinjer Etapp 1: migrering av projekt sparade före polylinjerna.
//
// tests/fixtures/projekt-v060/ är skapad med v0.6.0:s egen kod (worktree på
// main, 98d5e2b): projektfil, autosparning och facit – simuleringsresultat,
// sikt, hinder, ritade segment, etiketter och lägen per lager (PM). Ett
// migrerat projekt ska se likadant ut på kartan och ge identiskt resultat.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getState, setState } from '../src/state/store.js';
import * as V from '../src/state/visual.js';
import { _applySnapshot, _buildSnapshot } from '../src/io/export-project.js';
import { loadAutosave, SAVE_KEY, _buildAutosaveSnapshot } from '../src/state/persistence.js';
import { runSimulation } from '../src/core/simulation.js';
import { suggestMeasurements } from '../src/ui/right-panel.js';
import { findBlockedMeasurements } from '../src/core/visibility.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'projekt-v060');
const läs = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const FACIT = läs('facit.json');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], visualAreas: [], selVisualId: null, visualSelection: [],
  nVid: 1, nVlid: 1, nVaid: 1, visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
  suggestedMeas: [], blockedSuggestions: [], selObsId: null, selMId: null,
  netVisible: true, obstaclesVisible: true,
  activeCRS: 'sweref991545', activeLayerKey: 'osm',
  centerErr: 1.0, defaultInstr: 'ts16_1', maxSuggestDist: null,
  symSize: 10, ellScale: 50, ellipsMode: '1sig', nMid: 1, nId: 1,
};
beforeEach(() => setState({ ...BASE }));

// Ett ritat segment utan riktning: färg, hinderkoppling, lager och ändpunkter
// i fast ordning. Samma mängd före och efter betyder samma bild på kartan.
const nyckel = s => {
  const [a, b] = s.coords.map(c => c.join(',')).sort();
  return `${s.layerId}|${s.color}|${s.linked}|${a}|${b}`;
};
const ritadeSegment = st => st.visualLines.filter(l => V.isVisualObjVisible(l, st)).flatMap(l =>
  V.visualLineSegments(l, st).map(coords => ({
    layerId: l.layerId, color: V.visualObjColor(l, st), linked: l.linkedObsIds.length > 0, coords,
  })));
const facitSegment = () => FACIT.segments.map(s => ({ ...s, coords: s.coords }));
const lägen = ps => ps.map(p => `${p.E},${p.N}`).sort();

function kontrolleraMotFacit() {
  const st = getState();
  // Kartan: samma segment, färger och ▨-markörer.
  expect(ritadeSegment(st).map(nyckel).sort()).toEqual(facitSegment().map(nyckel).sort());
  // Samma punktnamn syns.
  const lager = new Map(st.visualLayers.map(l => [l.id, l]));
  expect(Object.fromEntries(st.visualPts.map(p => [p.id, V.visualPtShowsLabel(p, lager.get(p.layerId))])))
    .toEqual(FACIT.labels);
  // PM §2.11.2 K2: samma lägen per lager.
  for (const l of st.visualLayers) expect(lägen(V.visualLayerPositions(l.id))).toEqual(lägen(FACIT.positions[l.id]));
  // Hindren: identiska, och därmed samma sikt.
  expect(st.obstacles).toEqual(FACIT.obstacles);
  expect(findBlockedMeasurements(st.meas, st.pts, st.obstacles)).toEqual(FACIT.blocked);
  runSimulation();
  suggestMeasurements();
  expect(JSON.stringify(getState().simResult)).toBe(JSON.stringify(FACIT.simResult));
  expect(getState().suggestedMeas).toEqual(FACIT.suggestedMeas);
  expect(getState().blockedSuggestions).toEqual(FACIT.blockedSuggestions);
}

const linjeMed = (E, N) => getState().visualLines.find(l =>
  V.visualLineCoords(l).some(([e, n]) => e === E && n === N));

describe('projektfil sparad med v0.6.0', () => {
  beforeEach(() => _applySnapshot(läs('projekt.json')));

  it('42 segment blir 28 polylinjer', () => {
    expect(FACIT.antalSegment).toBe(42);
    expect(läs('projekt.json').visualLines).toHaveLength(42);
    expect(getState().visualLines).toHaveLength(28);
  });

  it('ser likadan ut och ger identiskt simuleringsresultat', () => {
    kontrolleraMotFacit();
  });

  it('kedja ände mot ände blir en polylinje, i ritriktningen, med första segmentets id', () => {
    const l = linjeMed(10, 10);
    expect(l.id).toBe('VL1');
    expect(V.visualLineCoords(l)).toEqual([[10, 10], [50, 10], [50, 50], [90, 50]]);
    expect(l.closed).toBe(false);
  });

  it('sluten kedja blir en sluten polylinje, inte en yta', () => {
    const l = linjeMed(300, 300);
    expect(l.closed).toBe(true);
    expect(V.visualLineCoords(l)).toEqual([[300, 300], [400, 300], [400, 400], [300, 400]]);
    expect(getState().visualAreas).toHaveLength(1);   // bara ytan "Hus" som fanns
  });

  it('tre segment i samma punkt: kedjan bryts där', () => {
    const vid = getState().visualLines.filter(l => V.visualLineCoords(l).some(([e, n]) => e === 60 && n === 150));
    expect(vid).toHaveLength(3);
    expect(vid.every(l => l.vertices.length === 2)).toBe(true);
  });

  it('en nätpunkt kan vara mitthörn', () => {
    const l = linjeMed(250, 5);
    expect(l.vertices[1]).toEqual({ ref: 'net', id: 'FP2' });
    expect(l.vertices).toHaveLength(3);
  });

  it('olika färg eller hinderkoppling slås inte ihop', () => {
    expect(linjeMed(500, 0).vertices).toHaveLength(2);
    expect(linjeMed(650, 0).vertices).toHaveLength(2);
    expect(getState().visualLines.find(l => l.color === '#f06292').vertices).toHaveLength(2);
    const vägg = linjeMed(125, 60);
    expect(vägg.linkedObsIds).toEqual(['obs_1']);
    expect(vägg.vertices).toHaveLength(2);
  });

  it('två segment fram och tillbaka mellan samma punkter förblir två linjer', () => {
    expect(getState().visualLines.filter(l => V.visualLineCoords(l).every(([e]) => e >= 700 && e <= 750))).toHaveLength(2);
  });

  it('importerade linjer som delar hörn slås ihop; hinderkopplade gör det inte', () => {
    const lager = getState().visualLayers.find(l => l.name === 'test_sluten_linje');
    const [sluten] = getState().visualLines.filter(l => l.layerId === lager.id);
    expect(sluten.closed).toBe(true);
    const dxfKant = getState().visualLayers.find(l => l.name === 'Kant');
    expect(getState().visualLines.filter(l => l.layerId === dxfKant.id).map(l => l.vertices.length)).toEqual([3, 2]);
    const hinderLager = getState().visualLayers.find(l => l.name === 'test_vaggar');
    expect(getState().visualLines.filter(l => l.layerId === hinderLager.id)
      .every(l => l.vertices.length === 2 && l.linkedObsIds.length === 1)).toBe(true);
  });

  it('visuella punkter med H = 0 får H = null; övriga höjder och nätpunkter orörda', () => {
    const fil = läs('projekt.json');
    const före = new Map(fil.visualPts.map(p => [p.id, p.H]));
    for (const p of getState().visualPts) expect(p.H).toBe(före.get(p.id) === 0 ? null : före.get(p.id));
    expect(getState().visualPts.some(p => p.H === 7.25)).toBe(true);
    expect(getState().pts).toEqual(fil.pts);
  });

  it('sparas i nya formen och migreras inte igen', () => {
    const snap = JSON.parse(JSON.stringify(_buildSnapshot()));
    expect(snap.visualVer).toBe(V.VISUAL_MODEL_VERSION);
    expect(snap.visualLines.every(l => Array.isArray(l.vertices) && !('from' in l))).toBe(true);
    const förut = getState().visualLines;
    setState({ ...BASE });
    _applySnapshot(snap);
    expect(getState().visualLines).toEqual(förut);
    kontrolleraMotFacit();
  });

  it('nya linjer får id efter de migrerade', () => {
    expect(getState().nVlid).toBe(43);
  });
});

describe('autosparning från v0.6.0', () => {
  it('migreras likadant som projektfilen', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(läs('autosave.json')));
    expect(loadAutosave()).toBe(true);
    expect(getState().visualLines).toHaveLength(28);
    const st = getState();
    expect(ritadeSegment(st).map(nyckel).sort()).toEqual(facitSegment().map(nyckel).sort());
    expect(st.obstacles).toEqual(FACIT.obstacles);
    expect(_buildAutosaveSnapshot().visualVer).toBe(V.VISUAL_MODEL_VERSION);
    localStorage.removeItem(SAVE_KEY);
  });
});

// ── Reglerna, en i taget ─────────────────────────────────────────────────────

const ep = id => ({ ref: 'visual', id });
const seg = (id, a, b, extra = {}) => ({
  id, layerId: 'L', vertices: [ep(a), ep(b)], closed: false, color: null, linkedObsIds: [], ...extra,
});
const form = ls => ls.map(l => `${l.id}:${l.vertices.map(v => v.id).join('')}${l.closed ? '*' : ''}`);

describe('_mergeLegacyLines', () => {
  it('ett segment som pekar åt fel håll vänds', () => {
    expect(form(V._mergeLegacyLines([seg('VL1', 'a', 'b'), seg('VL2', 'c', 'b')]))).toEqual(['VL1:abc']);
  });

  it('kedjan byggs bakåt från det lägsta segmentet', () => {
    expect(form(V._mergeLegacyLines([seg('VL5', 'b', 'c'), seg('VL2', 'c', 'd'), seg('VL9', 'a', 'b')])))
      .toEqual(['VL2:abcd']);
  });

  it('olika lager slås inte ihop – men räknas i förgreningen', () => {
    const r = V._mergeLegacyLines([seg('VL1', 'a', 'b'), seg('VL2', 'b', 'c'), seg('VL3', 'b', 'x', { layerId: 'M' })]);
    expect(form(r)).toEqual(['VL1:ab', 'VL2:bc', 'VL3:bx']);
    expect(form(V._mergeLegacyLines([seg('VL1', 'a', 'b'), seg('VL2', 'b', 'c', { layerId: 'M' })])))
      .toEqual(['VL1:ab', 'VL2:bc']);
  });

  it('samma koordinat men olika punkt-id kopplas inte ihop', () => {
    expect(form(V._mergeLegacyLines([seg('VL1', 'a', 'b'), seg('VL2', 'b2', 'c')]))).toEqual(['VL1:ab', 'VL2:b2c']);
  });

  it('nätpunkt och visuell punkt med samma id är olika punkter', () => {
    const r = V._mergeLegacyLines([seg('VL1', 'a', 'b'),
      { ...seg('VL2', 'x', 'c'), vertices: [{ ref: 'net', id: 'b' }, ep('c')] }]);
    expect(r).toHaveLength(2);
  });

  it('en sluten ring med tre segment', () => {
    expect(form(V._mergeLegacyLines([seg('VL1', 'a', 'b'), seg('VL2', 'b', 'c'), seg('VL3', 'c', 'a')])))
      .toEqual(['VL1:abc*']);
  });

  it('listordningen följer det lägsta segmentets plats', () => {
    const r = V._mergeLegacyLines([seg('VL7', 'x', 'y'), seg('VL1', 'a', 'b'), seg('VL8', 'y', 'z'), seg('VL2', 'b', 'c')]);
    expect(form(r)).toEqual(['VL7:xyz', 'VL1:abc']);
  });

  it('tom lista', () => {
    expect(V._mergeLegacyLines([])).toEqual([]);
    expect(V._mergeLegacyLines(undefined)).toEqual([]);
  });
});
