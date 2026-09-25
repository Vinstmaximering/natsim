// Offset av visuella linjer och ytor (Polylinjer Etapp 4).
//
// Resultatet är en ny polylinje – eller en ny yta när källan är en yta – i
// aktivt lager, med egna nya hörn (role 'vertex', ref 'visual', utan höjd).
// Den är inte kopplad till originalet: flyttas originalet följer offseten
// inte med.
//
// Namn: "<original> +2,000 H" (höger), "V" (vänster), "ut" och "in" (sluten
// linje och yta). Originalets namn är dess namn eller id. "Båda" ger två
// objekt. Har någon sida ett problem (se state/offset-geometry.js) skapas
// ingenting.
import { getState, setState } from './store.js';
import { groupThousands } from './area-geometry.js';
import { offsetPolyline, offsetSides } from './offset-geometry.js';
import { getArcTolerance } from './arc-tolerance.js';
import {
  findVisualLine, findVisualArea, visualLineCoords, visualAreaCoords,
  ensureActiveVisualLayer, addVisualPt, addVisualLine, addVisualArea, makeEndpoint,
} from './visual.js';

export const OFFSET_DEFAULTS = { distance: 2, side: 'right', corners: 'sharp' };

const SUFFIX = { right: 'H', left: 'V', out: 'ut', in: 'in' };
export const SIDE_LABELS = { right: 'höger', left: 'vänster', out: 'utåt', in: 'inåt', both: 'båda' };
export const PROBLEM_TEXT = {
  collapsed: 'Avståndet är för stort för linjens form på den sidan – ett segment försvinner. Minska avståndet.',
  self: 'Offsetlinjen korsar sig själv. Minska avståndet eller välj den andra sidan.',
  few: 'Linjen har för få hörn för offset.',
  distance: 'Ange ett avstånd större än 0.',
};

/** "Kantbalk N +2,000 H". */
export function offsetName(källnamn, distance, key) {
  return `${källnamn} +${groupThousands(distance, 3)} ${SUFFIX[key]}`;
}

/** Källan: en linje eller yta, med koordinater och om den är sluten. */
export function offsetSource(id, state = getState()) {
  const line = (state.visualLines || []).find(l => l.id === id);
  if (line) return { kind: 'line', obj: line, coords: visualLineCoords(line, state), closed: line.closed === true };
  const area = (state.visualAreas || []).find(a => a.id === id);
  if (area) return { kind: 'area', obj: area, coords: visualAreaCoords(area, state), closed: true };
  return null;
}

/**
 * Offsetresultaten för en källa, utan att skapa något.
 * @param {{distance:number, side:string, corners:'sharp'|'round', arcTol?:number}} params
 *   arcTol: bågtolerans för rundade hörn; utan värde gäller användarens inställning.
 *   side: 'right' | 'left' | 'both' för öppen linje, 'out' | 'in' | 'both'
 *   för sluten linje och yta. En öppen sida på en sluten källa (och tvärtom)
 *   tolkas som motsvarande: höger ↔ utåt, vänster ↔ inåt.
 * @returns {{ results: Array<{key, name, coords, closed, kind, problem}>, problem: string|null }}
 */
export function buildOffsets(id, params, state = getState()) {
  const src = offsetSource(id, state);
  if (!src || !src.coords) return { results: [], problem: 'few' };
  const d = Number(params.distance);
  if (!(d > 0) || !Number.isFinite(d)) return { results: [], problem: 'distance' };
  const val = normalizeSide(params.side, src.closed);
  const källnamn = src.obj.name || src.obj.id;
  const results = offsetSides(src.coords, src.closed, val).map(s => {
    const r = offsetPolyline(src.coords, { distance: d, side: s.side, corners: params.corners, closed: src.closed,
                                           arcTol: params.arcTol ?? getArcTolerance() });
    return { key: s.key, name: offsetName(källnamn, d, s.key), coords: r.coords,
             closed: src.closed, kind: src.kind, problem: r.problem };
  });
  return { results, problem: results.find(r => r.problem)?.problem ?? null };
}

/** Sidvalet tolkat för källans form. */
export function normalizeSide(side, closed) {
  if (side === 'both') return 'both';
  if (closed) return side === 'left' || side === 'in' ? 'in' : 'out';
  return side === 'left' || side === 'in' ? 'left' : 'right';
}

/**
 * Skapar offseten i aktivt lager. Ångra-steget sparar anroparen.
 * @returns {{ ok:true, ids:string[] } | { ok:false, problem:string, key?:string }}
 */
export function createOffsets(id, params) {
  const { results, problem } = buildOffsets(id, params);
  if (problem) return { ok: false, problem, key: results.find(r => r.problem)?.key };
  const layerId = ensureActiveVisualLayer();
  const ids = results.map(r => {
    const vertices = r.coords.map(([E, N]) =>
      makeEndpoint('visual', addVisualPt({ E, N, layerId, role: 'vertex' })));
    return r.kind === 'area'
      ? addVisualArea({ vertices, layerId, name: r.name })
      : addVisualLine({ vertices, closed: r.closed, layerId, name: r.name });
  }).filter(Boolean);
  if (ids.length) setState({ selVisualId: ids[ids.length - 1] });
  return { ok: true, ids };
}

// Källan för ett id, för UI:t (finns den?).
export const isOffsetSource = id => !!(findVisualLine(id) || findVisualArea(id));
