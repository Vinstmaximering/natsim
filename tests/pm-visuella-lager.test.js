// PM-underlaget för §2.11.2 K2: ett visuellt lagers lägen.
//
// Buggen: main.js jämförde en linjes endpoint-objekt {ref,id} med ett punkt-id,
// så linjernas ändpunkter kom aldrig med i visuellaLager. Ett byggnadsverk
// ritat som linjer vars hörn är nätpunkter eller punkter i ett annat lager
// prövades därför inte, och K2 kunde bli "Uppfyllt" fast konturen låg utanför
// nätet. visualLayerPositions() är den rättade, testbara vägen.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addVisualLayer, addVisualPt, addVisualLine, makeEndpoint, visualLayerPositions,
} from '../src/state/visual.js';
import { getState, setState } from '../src/state/store.js';
import { kontroller } from '../src/pm/report/kontroller.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BASE = {
  pts: [], meas: [], obstacles: [], simResult: null,
  visualPts: [], visualLines: [], selVisualId: null, nVid: 1, nVlid: 1,
  visualLayers: [], activeVisualLayerId: null, nVlyid: 1,
};

// Nätet: en kvadrat 0–100 m.
const NAT = [
  { id: 'A', type: 'known', E: 0,   N: 0 },   { id: 'B', type: 'known', E: 100, N: 0 },
  { id: 'C', type: 'known', E: 100, N: 100 }, { id: 'D', type: 'known', E: 0,   N: 100 },
];

beforeEach(() => setState({ ...BASE, pts: NAT.map(p => ({ ...p })) }));

const vis = id => makeEndpoint('visual', id);
const net = id => makeEndpoint('net', id);

// Samma form som main.js skickar till PM:et.
const pmLager = id => {
  const l = getState().visualLayers.find(x => x.id === id);
  const punkter = visualLayerPositions(id);
  return { id, namn: l.name, antal: punkter.length, punkter };
};

const k2 = byggnadsverk => kontroller({
  verksamhet: 'vag', nattyp: 'bro',
  sr: { K_global: 0.75, meas_n: 12, unkn_n: 3, redundancy: 9 }, redund: [],
  allPts: NAT, mkKey: 'G3', mHz: 0.5, mDm: 3, mDp: 3, centerErr: 2,
  nGemensam: 0, byggnadsverk, visuellaLager: [byggnadsverk], kravk: '2', kravSP: null,
}).find(r => r.krav.includes('omsluter byggnadsverket'));

describe('visualLayerPositions', () => {
  it('ett lager med bara linjer får med linjernas ändpunkter ur ett annat lager', () => {
    const hjalp = addVisualLayer({ name: 'Hjälp' });
    const bro   = addVisualLayer({ name: 'Bro' });
    const a = addVisualPt({ E: 10, N: 10, layerId: hjalp });
    const b = addVisualPt({ E: 20, N: 10, layerId: hjalp });
    const c = addVisualPt({ E: 20, N: 20, layerId: hjalp });
    addVisualLine({ from: vis(a), to: vis(b), layerId: bro });
    addVisualLine({ from: vis(b), to: vis(c), layerId: bro });

    const pos = visualLayerPositions(bro);
    expect(pos).toHaveLength(3);
    expect(pos).toEqual(expect.arrayContaining([
      { E: 10, N: 10 }, { E: 20, N: 10 }, { E: 20, N: 20 }]));
  });

  it('ändpunkter som är nätpunkter tas med', () => {
    const bro = addVisualLayer({ name: 'Bro' });
    addVisualLine({ from: net('A'), to: net('C'), layerId: bro });
    expect(visualLayerPositions(bro)).toEqual([{ E: 0, N: 0 }, { E: 100, N: 100 }]);
  });

  it('ett delat hörn räknas en gång', () => {
    const bro = addVisualLayer({ name: 'Bro' });
    const a = addVisualPt({ E: 10, N: 10, layerId: bro, role: 'vertex' });
    const b = addVisualPt({ E: 20, N: 10, layerId: bro, role: 'vertex' });
    const c = addVisualPt({ E: 20, N: 20, layerId: bro, role: 'vertex' });
    addVisualLine({ from: vis(a), to: vis(b), layerId: bro });
    addVisualLine({ from: vis(b), to: vis(c), layerId: bro });
    expect(visualLayerPositions(bro)).toHaveLength(3);
  });

  it('en nätpunkt och en visuell punkt med samma id är två lägen', () => {
    const bro = addVisualLayer({ name: 'Bro' });
    setState({ visualPts: [{ id: 'A', layerId: bro, E: 50, N: 50, H: 0, color: null }] });
    addVisualLine({ from: vis('A'), to: net('A'), layerId: bro });
    expect(visualLayerPositions(bro)).toHaveLength(2);
  });

  it('andra lagers objekt räknas inte', () => {
    const bro   = addVisualLayer({ name: 'Bro' });
    const annat = addVisualLayer({ name: 'Annat' });
    addVisualPt({ E: 50, N: 50, layerId: bro });
    const x = addVisualPt({ E: 500, N: 500, layerId: annat });
    const y = addVisualPt({ E: 600, N: 500, layerId: annat });
    addVisualLine({ from: vis(x), to: vis(y), layerId: annat });
    expect(visualLayerPositions(bro)).toEqual([{ E: 50, N: 50 }]);
  });

  it('en linje vars ändpunkt saknas bidrar bara med den som finns', () => {
    const bro = addVisualLayer({ name: 'Bro' });
    addVisualLine({ from: net('A'), to: net('FINNS_EJ'), layerId: bro });
    expect(visualLayerPositions(bro)).toEqual([{ E: 0, N: 0 }]);
  });
});

describe('§2.11.2 K2 med ett byggnadsverk ritat som linjer', () => {
  it('en kontur utanför nätet ger ej uppfyllt, fast lagrets fria punkt ligger innanför', () => {
    const hjalp = addVisualLayer({ name: 'Hjälp' });
    const bro   = addVisualLayer({ name: 'Bro' });
    addVisualPt({ E: 50, N: 50, layerId: bro });
    const a = addVisualPt({ E: 300, N: 300, layerId: hjalp });
    const b = addVisualPt({ E: 320, N: 300, layerId: hjalp });
    addVisualLine({ from: vis(a), to: vis(b), layerId: bro });

    const r = k2(pmLager(bro));
    expect(r.status).toBe('fel');
    expect(r.resultat).toContain('2 av 3');
  });

  it('ett lager med bara linjer prövas i stället för att bli manuellt', () => {
    const hjalp = addVisualLayer({ name: 'Hjälp' });
    const bro   = addVisualLayer({ name: 'Bro' });
    const a = addVisualPt({ E: 30, N: 30, layerId: hjalp });
    const b = addVisualPt({ E: 70, N: 30, layerId: hjalp });
    addVisualLine({ from: vis(a), to: vis(b), layerId: bro });

    const lager = pmLager(bro);
    expect(lager.antal).toBe(2);
    expect(k2(lager).status).toBe('ok');
  });

  it('main.js hämtar lagrets lägen via visualLayerPositions', () => {
    const src = readFileSync(join(root, 'src/main.js'), 'utf8');
    const block = src.slice(src.indexOf('visuellaLager:'), src.indexOf('pendingPayload = payload'));
    expect(block).toContain('visualLayerPositions(l.id)');
    expect(block).not.toMatch(/p\.id === ref\b/);
  });
});
