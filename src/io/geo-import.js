// Etapp 3: tillämpar ett parsat .geo-innehåll på projektet.
//
// Skild från både parsern (io/parse-geo.js, ingen state) och dialogen
// (ui/geo-import-modal.js, all DOM). Här bor besluten: var punkterna hamnar,
// vad som händer vid id-krock, och hur linjernas hörn blir visuella objekt.
//
// Hela importen är EN ångra-åtgärd: saveUndo körs en gång först, aldrig per
// objekt. Allt går via de vanliga mutationsfunktionerna i state/visual.js, så
// att kopplade hinder städas på samma väg som vid handritning.
import { getState, setState } from '../state/store.js';
import { saveUndo } from '../state/undo.js';
import { addObstacle } from '../state/obstacles.js';
import {
  addVisualLayer, addVisualPt, addVisualLine, updateVisualLine, addVisualArea,
  makeEndpoint, findVisualLine, visualLineCoords,
} from '../state/visual.js';
import { geoPointTypeFromId } from './import-geo.js';
import { VertexIndex, VERTEX_DEDUP_TOL_M, closedRing } from './vertex-index.js';

// Dedupliceringen delas med DXF-importen (Etapp 6) och bor i vertex-index.js.
// Re-exporteras här eftersom .geo-importen var först med den.
export { VERTEX_DEDUP_TOL_M };

// Färg och etikett för hinder skapade ur importerade linjer. Samma värden som
// kontextmenyns "Använd som vägg" i ui/visual-modal.js.
const OBSTACLE_COLOR = '#8aa8c0';

// ── Val ──────────────────────────────────────────────────────────────────────

/** Standardval för dialogen. Visuellt lager är förvalt för punkterna. */
export function defaultGeoImportOptions(parsed, filename, activeCRS) {
  return {
    target:       'visual',        // 'visual' | 'net'
    layerName:    stripExtension(filename),
    layerColor:   null,
    netPointType: 'prefix',        // 'prefix' | 'detail' | 'new' | 'known'
    idConflict:   'skip',          // 'skip' | 'update' | 'rename'
    lines:        'visual',        // 'visual' | 'obstacle' | 'skip'
    // Lager-verktyg Etapp 3: slutna linjer (flagga 1 eller första hörnet
    // upprepat sist) som linjer eller ytor. Förval linjer = som förut.
    closedAs:     'lines',         // 'lines' | 'areas'
    // Avvikande koordinatsystem i filen föreslås, eftersom koordinater ur en
    // annan zon annars hamnar fel på kartan. Användaren kan kryssa av.
    changeCRS:    !!(parsed?.fileInfo?.crs && parsed.fileInfo.crs !== activeCRS),
    filename,
  };
}

export function stripExtension(filename) {
  return String(filename ?? '').replace(/\.[^.\\/]+$/, '') || 'Import';
}

// ── Tillämpning ──────────────────────────────────────────────────────────────

/**
 * @param {object} parsed  Resultatet från parseGeo().
 * @param {object} opts    Se defaultGeoImportOptions().
 * @returns {{layerId:string|null, ptsImported:number, ptsUpdated:number,
 *            ptsSkipped:number, ptsRenamed:number, visualPts:number,
 *            linesCreated:number, verticesCreated:number,
 *            obstaclesCreated:number, bounds:object|null, crsChanged:boolean}}
 */
export function applyGeoImport(parsed, opts) {
  const points = parsed?.points || [];
  const lines  = parsed?.lines  || [];

  const result = {
    layerId: null, ptsImported: 0, ptsUpdated: 0, ptsSkipped: 0, ptsRenamed: 0,
    visualPts: 0, linesCreated: 0, verticesCreated: 0, obstaclesCreated: 0,
    areasCreated: 0, bounds: null, crsChanged: false,
  };

  // Utbredningen av det som faktiskt importerades – dialogen zoomar hit efteråt.
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const extend = (E, N) => {
    if (E < minE) minE = E;
    if (E > maxE) maxE = E;
    if (N < minN) minN = N;
    if (N > maxN) maxN = N;
  };

  const wantLines  = opts.lines !== 'skip' && lines.length > 0;
  const wantVisual = (opts.target === 'visual' && points.length > 0) || wantLines;
  if (!wantVisual && !(opts.target === 'net' && points.length > 0) && !opts.changeCRS) {
    return result;   // ingenting att göra – ingen ångra-post heller
  }

  saveUndo(`Importera ${opts.filename || '.geo'}`);

  if (opts.changeCRS && parsed?.fileInfo?.crs) {
    setState({ activeCRS: parsed.fileInfo.crs });
    result.crsChanged = true;
  }

  // ── Lagret ──
  let layerId = null;
  if (wantVisual) {
    layerId = addVisualLayer({
      name:  opts.layerName,
      color: opts.layerColor,
      source: { kind: 'geo', filename: opts.filename, crs: parsed?.fileInfo?.crs || null },
    });
    result.layerId = layerId;
  }

  // ── Punkter ──
  if (opts.target === 'visual') {
    for (const p of points) {
      addVisualPt({
        E: p.E, N: p.N, H: p.H ?? 0,
        layerId, name: p.name, role: 'point',
        attrs: Object.keys(p.attrs || {}).length ? p.attrs : null,
      });
      extend(p.E, p.N);
      result.visualPts++;
    }
  } else if (points.length) {
    const pts = getState().pts.map(p => ({ ...p }));
    const used = new Set(pts.map(p => p.id));
    for (const p of points) {
      const original = String(p.name).trim();
      const type = opts.netPointType === 'prefix'
        ? geoPointTypeFromId(original) : opts.netPointType;
      const H = p.H ?? 0;
      let id = original;

      if (used.has(id)) {
        if (opts.idConflict === 'skip') { result.ptsSkipped++; continue; }
        if (opts.idConflict === 'update') {
          const ex = pts.find(x => x.id === id);
          ex.E = p.E; ex.N = p.N; ex.H = H; ex.type = type;
          extend(p.E, p.N);
          result.ptsUpdated++;
          continue;
        }
        id = _uniqueId(original, used);
        result.ptsRenamed++;
      }
      pts.push({ id, type, E: p.E, N: p.N, H });
      used.add(id);
      extend(p.E, p.N);
      result.ptsImported++;
    }
    setState({ pts, simResult: null });
  }

  // ── Linjer ──
  if (wantLines) {
    const index = new VertexIndex();
    const createdLineIds = [];

    for (const ln of lines) {
      const vs = ln.vertices || [];
      if (vs.length < 2) continue;

      // Hörnen blir visuella punkter med role:'vertex' – etiketten döljs, men
      // originalnamnet sparas så att hörnet går att känna igen i dialogen.
      const ids = [];
      for (const v of vs) {
        let id = index.find(v.E, v.N, v.H ?? null);
        if (!id) {
          id = addVisualPt({
            E: v.E, N: v.N, H: v.H ?? 0,
            layerId, name: v.name, role: 'vertex',
          });
          index.add(v.E, v.N, v.H ?? null, id);
          result.verticesCreated++;
        }
        ids.push(id);
        extend(v.E, v.N);
      }

      // Slutna linjer som ytor: ringen blir en yta i lagret, med linjens namn.
      // Valet "Hinder" gör ytan till ett byggnadshinder (blocksSight) i
      // stället för väggar längs kanterna.
      const ring = opts.closedAs === 'areas' ? closedRing(ids, ln.closed) : null;
      if (ring) {
        const areaId = addVisualArea({
          vertices: ring.map(id => makeEndpoint('visual', id)), layerId,
          name: ln.name || null, blocksSight: opts.lines === 'obstacle',
        });
        if (areaId) {
          result.areasCreated++;
          if (opts.lines === 'obstacle') result.obstaclesCreated++;
          continue;
        }
      }

      // Sluten linje sluts med segmentet sista → första.
      const pairs = ids.slice(0, -1).map((a, i) => [a, ids[i + 1]]);
      if (ln.closed && ids.length > 2) pairs.push([ids[ids.length - 1], ids[0]]);

      for (const [a, b] of pairs) {
        if (a === b) continue;          // hörnen föll ihop vid dedupliceringen
        createdLineIds.push(addVisualLine({
          from: makeEndpoint('visual', a), to: makeEndpoint('visual', b), layerId,
        }));
        result.linesCreated++;
      }
    }

    // Hinder: väggen är en projektion av den visuella linjen, precis som när
    // den skapas ur kontextmenyn. linkedObsId håller ihop dem.
    if (opts.lines === 'obstacle') {
      for (const lineId of createdLineIds) {
        const coords = visualLineCoords(findVisualLine(lineId));
        if (!coords) continue;
        const obsId = addObstacle({
          type: 'line', label: `Vägg (${lineId})`, color: OBSTACLE_COLOR,
          source: 'visual', points: coords,
        });
        updateVisualLine(lineId, { linkedObsId: obsId });
        result.obstaclesCreated++;
      }
    }
  }

  if (Number.isFinite(minE)) result.bounds = { minE, maxE, minN, maxN };
  return result;
}

// "8" → "8_2", och vidare "8_3", "8_4" om suffixet också är upptaget.
function _uniqueId(base, used) {
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
