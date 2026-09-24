// Etapp 6: tillämpar en parsad DXF-ritning på projektet.
//
// En DXF bär ingen information om koordinatsystem, och ofta inte heller om
// enhet eller axelordning. Det som avgör var ritningen hamnar på kartan är
// därför användarens val i dialogen – inte något filen säger. All den
// osäkerheten är skälet till att en DXF ALLTID blir ett visuellt lager:
// den får aldrig tyst bli nätpunkter som räknas på.
//
// Skild från parsern (io/parse-dxf.js, ingen state) och dialogen
// (ui/dxf-import-modal.js, all DOM). Hela importen är EN ångra-åtgärd.
import { getState } from '../state/store.js';
import { saveUndo } from '../state/undo.js';
import { addVisualLayer, addVisualPt, addVisualLine, addVisualArea, makeEndpoint } from '../state/visual.js';
import { VISUAL_COLORS } from '../state/visual.js';
import { VertexIndex, closedRing } from './vertex-index.js';
import { DXF_UNITS, DXF_DEFAULT_UNIT, dxfBounds } from './parse-dxf.js';

// Rimlighetsgräns för georefereringen: ligger ritningens mittpunkt längre än
// så från nätets tyngdpunkt är något fel – oftast att axelordningen är
// omkastad, eftersom E och N i SWEREF skiljer sig med miljoner meter.
// 50 km är valt för att rymma ett projekt som sträcker sig över en hel kommun
// utan att någonsin råka acceptera ett axelbyte (som ger fel i storleksordning
// 7 000 km i SWEREF 99).
export const AXIS_SANITY_MAX_DIST_M = 50000;

export const AXIS_ORDERS = {
  xe: { id: 'xe', label: 'X → E, Y → N', desc: 'Vanligast. Ritningens X är öst.' },
  xn: { id: 'xn', label: 'X → N, Y → E', desc: 'För ritningar där X är nord.' },
};

// ── Omräkning ────────────────────────────────────────────────────────────────

/** Ritningskoordinat → projektkoordinat. */
export function dxfToEN({ x, y, z }, { factor, axisOrder, useZ }) {
  const f = factor;
  const E = (axisOrder === 'xn' ? y : x) * f;
  const N = (axisOrder === 'xn' ? x : y) * f;
  const H = useZ ? (z ?? 0) * f : 0;
  return { E, N, H };
}

export function unitFactor(unitCode) {
  const u = DXF_UNITS[unitCode];
  // Enhetslös (factor null) räknas som meter: talen tas som de står.
  return u && u.factor !== null ? u.factor : 1;
}

// ── Rimlighetskontroll ───────────────────────────────────────────────────────

// Nätets tyngdpunkt, eller null om nätet är tomt.
export function netCentroid(state = getState()) {
  const pts = state.pts || [];
  if (!pts.length) return null;
  return {
    E: pts.reduce((s, p) => s + p.E, 0) / pts.length,
    N: pts.reduce((s, p) => s + p.N, 0) / pts.length,
  };
}

/**
 * Avståndet från ritningens mittpunkt till nätets tyngdpunkt, för BÅDA
 * axelordningarna. Utan nät går det inte att bedöma – då returneras null.
 * @returns {{xe:number, xn:number, ok:{xe:boolean,xn:boolean}}|null}
 */
export function axisSanity(entities, opts, state = getState()) {
  const c = netCentroid(state);
  const b = dxfBounds(entities, opts.layerFilter || null);
  if (!c || !b) return null;

  const mitt = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: 0 };
  const avst = order => {
    const p = dxfToEN(mitt, { factor: opts.factor, axisOrder: order, useZ: false });
    return Math.hypot(p.E - c.E, p.N - c.N);
  };
  const xe = avst('xe'), xn = avst('xn');
  return {
    xe, xn,
    ok: { xe: xe <= AXIS_SANITY_MAX_DIST_M, xn: xn <= AXIS_SANITY_MAX_DIST_M },
  };
}

// ── Val ──────────────────────────────────────────────────────────────────────

export function stripExtension(filename) {
  return String(filename ?? '').replace(/\.[^.\\/]+$/, '') || 'Ritning';
}

/** Standardval för dialogen. */
export function defaultDxfImportOptions(parsed, filename) {
  const koder = Object.keys(DXF_UNITS).map(Number);
  const unitCode = (parsed?.header?.insunits !== null
    && koder.includes(parsed.header.insunits)
    && DXF_UNITS[parsed.header.insunits].factor !== null)
    ? parsed.header.insunits : DXF_DEFAULT_UNIT;

  return {
    unitCode,
    axisOrder: 'xe',
    useZ: true,
    layerStructure: 'per',                 // 'per' | 'single'
    layerName: stripExtension(filename),   // används vid 'single'
    // Lager-verktyg Etapp 3: slutna LWPOLYLINE/POLYLINE som linjer eller ytor.
    // Förval linjer = som förut.
    closedAs: 'lines',                     // 'lines' | 'areas'
    // Förvalt: alla lager som innehåller något vi kan rita.
    selectedLayers: (parsed?.layers || []).filter(l => l.supported).map(l => l.name),
    filename,
  };
}

// Färg per DXF-lager, tagen ur paletten i tur och ordning så att lagren går
// att skilja åt på kartan. Deterministiskt: samma fil ger samma färger.
export function assignLayerColors(names) {
  const out = {};
  (names || []).forEach((n, i) => { out[n] = VISUAL_COLORS[i % VISUAL_COLORS.length].hex; });
  return out;
}

// ── Tillämpning ──────────────────────────────────────────────────────────────

/**
 * @param {object} parsed  Resultatet från parseDxf().
 * @param {object} opts    Se defaultDxfImportOptions(), plus valfri layerColors.
 * @returns {{layerIds:string[], visualPts:number, verticesCreated:number,
 *            linesCreated:number, bounds:object|null, skippedLayers:number}}
 */
export function applyDxfImport(parsed, opts) {
  const result = {
    layerIds: [], visualPts: 0, verticesCreated: 0, linesCreated: 0, areasCreated: 0,
    bounds: null, skippedLayers: 0,
  };

  const valda = new Set(opts.selectedLayers || []);
  const ritbara = (parsed?.entities || []).filter(e => valda.has(e.layer));
  result.skippedLayers = (parsed?.layers || []).filter(l => !valda.has(l.name)).length;
  if (!ritbara.length) return result;

  saveUndo(`Importera ${opts.filename || '.dxf'}`);

  const tr = {
    factor: unitFactor(opts.unitCode),
    axisOrder: opts.axisOrder === 'xn' ? 'xn' : 'xe',
    useZ: opts.useZ !== false,
  };
  const färger = opts.layerColors || assignLayerColors([...valda]);

  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const extend = (E, N) => {
    if (E < minE) minE = E;
    if (E > maxE) maxE = E;
    if (N < minN) minN = N;
    if (N > maxN) maxN = N;
  };

  // Ett visuellt lager per DXF-lager, eller ett samlat. Lagren skapas i
  // ritningens lagerordning så att listan i panelen blir förutsägbar.
  const lagerIdFör = new Map();
  const nyttLager = (namn, färg) => addVisualLayer({
    name: namn, color: färg || null,
    source: { kind: 'dxf', filename: opts.filename, crs: getState().activeCRS || null },
  });

  let samlatId = null;
  const lagerFör = dxfLayer => {
    if (opts.layerStructure === 'single') {
      if (!samlatId) {
        samlatId = nyttLager(opts.layerName || stripExtension(opts.filename), opts.layerColor || null);
        result.layerIds.push(samlatId);
      }
      return samlatId;
    }
    if (!lagerIdFör.has(dxfLayer)) {
      const id = nyttLager(dxfLayer, färger[dxfLayer]);
      lagerIdFör.set(dxfLayer, id);
      result.layerIds.push(id);
    }
    return lagerIdFör.get(dxfLayer);
  };

  // Dedupliceringen är per visuellt lager: två ritningslager som råkar dela en
  // koordinat ska inte knytas ihop till en kedja.
  const index = new Map();
  const idxFör = lid => {
    if (!index.has(lid)) index.set(lid, new VertexIndex());
    return index.get(lid);
  };

  const hörn = (lid, punkt, roll) => {
    const { E, N, H } = dxfToEN(punkt, tr);
    const idx = idxFör(lid);
    let id = idx.find(E, N, tr.useZ ? H : null);
    if (!id) {
      id = addVisualPt({ E, N, H, layerId: lid, role: roll });
      idx.add(E, N, tr.useZ ? H : null, id);
      if (roll === 'vertex') result.verticesCreated++;
      else result.visualPts++;
    }
    extend(E, N);
    return id;
  };

  const segment = (lid, a, b) => {
    if (a === b) return;
    addVisualLine({ from: makeEndpoint('visual', a), to: makeEndpoint('visual', b), layerId: lid });
    result.linesCreated++;
  };

  for (const e of ritbara) {
    const lid = lagerFör(e.layer);

    if (e.type === 'POINT') {
      const { E, N, H } = dxfToEN(e.p, tr);
      addVisualPt({ E, N, H, layerId: lid, role: 'point' });
      extend(E, N);
      result.visualPts++;
      continue;
    }

    if (e.type === 'LINE') {
      segment(lid, hörn(lid, e.a, 'vertex'), hörn(lid, e.b, 'vertex'));
      continue;
    }

    // LWPOLYLINE och POLYLINE: hörn + segment, sluten linje sluts med
    // segmentet sista → första. Bågsegment (bulge) ritas som raka linjer;
    // parsern har redan varnat för dem.
    const vs = e.vertices || [];
    if (vs.length < 2) continue;
    const ids = vs.map(v => hörn(lid, v, 'vertex'));
    // Sluten polylinje (grupp 70 bit 1, eller första hörnet upprepat sist)
    // som yta, om det valts.
    const ring = opts.closedAs === 'areas' ? closedRing(ids, e.closed) : null;
    if (ring && addVisualArea({ vertices: ring.map(id => makeEndpoint('visual', id)), layerId: lid })) {
      result.areasCreated++;
      continue;
    }
    for (let i = 0; i < ids.length - 1; i++) segment(lid, ids[i], ids[i + 1]);
    if (e.closed && ids.length > 2) segment(lid, ids[ids.length - 1], ids[0]);
  }

  if (Number.isFinite(minE)) result.bounds = { minE, maxE, minN, maxN };
  return result;
}
