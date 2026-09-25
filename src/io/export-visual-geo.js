// Export av visuella lager till .geo (Polylinjer Etapp 3).
//
// Bygger skrivarens modell (io/write-geo.js) ur state – rena funktioner – och
// har tre vägar in: egenskapskortet (ett objekt), lagrets ⋮-meny (ett lager)
// och Data-menyns dialog (valda lager eller markerade objekt, och vad som tas
// med).
//
//   - Fria visuella punkter hamnar i filens PointList med name ?? id.
//   - Linjer och ytor hamnar i LineList med namn ?? id. Hörnen har egna
//     koordinater och löpnamnen 01, 02 … – de hamnar inte i PointList.
//   - Sluten linje och yta: första hörnet upprepas sist.
//   - Cirklar (Etapp 5): en sluten linje med hörn enligt bågtoleransen, utan
//     höjd. Indelningspunkter är vanliga fria punkter.
//   - Höjd: en visuell punkt har höjd när H inte är null; en nätpunkt (hörn i
//     en linje eller yta) när H är skild från 0. Annars skrivs ett tomt fält.
import { getState } from '../state/store.js';
import { resolveEndpoint, findVisualLayer, visualCircleCoords } from '../state/visual.js';
import { getArcTolerance } from '../state/arc-tolerance.js';
import { APP_NAME, APP_VERSION } from '../core/version.js';
import { writeGeo, geoCoordinateSystem, GeoWriteError } from './write-geo.js';

export const GEO_INCLUDE_ALL = { points: true, lines: true, areas: true, circles: true };

// Hörnets koordinater med höjd enligt reglerna ovan, eller null.
function hörn(ep, state) {
  const p = resolveEndpoint(ep, state);
  if (!p) return null;
  let H = null;
  if (ep.ref === 'net') {
    const n = (state.pts || []).find(x => x.id === ep.id);
    H = Number.isFinite(n?.H) && n.H !== 0 ? n.H : null;
  } else {
    const v = (state.visualPts || []).find(x => x.id === ep.id);
    H = Number.isFinite(v?.H) ? v.H : null;
  }
  return { E: p.E, N: p.N, H };
}

// En linje eller yta som linje i filen, eller null om ett hörn saknas.
function somLinje(o, closed, state) {
  const vertices = [];
  for (const ep of o.vertices || []) {
    const v = hörn(ep, state);
    if (!v) return null;
    vertices.push(v);
  }
  return vertices.length >= 2 ? { name: o.name || o.id, closed, vertices } : null;
}

/**
 * Filens punkter och linjer.
 * @param {object} state
 * @param {{ layerIds?:string[]|null, objectIds?:string[]|null,
 *           include?:{points:boolean, lines:boolean, areas:boolean} }} urval
 *   layerIds: lagren som tas med. objectIds: bara dessa objekt (markeringen);
 *   när den anges gäller den i stället för layerIds.
 * @returns {{ points:object[], lines:object[], counts:{points:number, lines:number, areas:number, circles:number}, skipped:number }}
 */
export function collectVisualGeo(state, { layerIds = null, objectIds = null, include = GEO_INCLUDE_ALL } = {}) {
  const ids = objectIds ? new Set(objectIds) : null;
  const lager = layerIds ? new Set(layerIds) : null;
  const med = o => (ids ? ids.has(o.id) : (!lager || lager.has(o.layerId)));

  const points = include.points === false ? [] : (state.visualPts || [])
    .filter(p => p.role !== 'vertex' && med(p))
    .map(p => ({ name: p.name ?? p.id, N: p.N, E: p.E, H: Number.isFinite(p.H) ? p.H : null }));

  let skipped = 0;
  const ta = (list, closedOf) => list.map(o => {
    const l = somLinje(o, closedOf(o), state);
    if (!l) skipped++;
    return l;
  }).filter(Boolean);

  const lines = include.lines === false ? []
    : ta((state.visualLines || []).filter(med), l => l.closed === true);
  const areas = include.areas === false ? []
    : ta((state.visualAreas || []).filter(med), () => true);
  const tol = getArcTolerance();
  const circles = include.circles === false ? [] : (state.visualCircles || []).filter(med).map(c => {
    const coords = visualCircleCoords(c, state, tol);
    if (!coords) { skipped++; return null; }
    return { name: c.name || c.id, closed: true, vertices: coords.map(([E, N]) => ({ E, N, H: null })) };
  }).filter(Boolean);

  return {
    points, lines: [...lines, ...areas, ...circles],
    counts: { points: points.length, lines: lines.length, areas: areas.length, circles: circles.length },
    skipped,
  };
}

/**
 * Hela filen för ett urval, med rubrik. description: lagrets namn, lagrens
 * namn eller en beskrivning av urvalet.
 * @returns {{ text:string|null, error:string|null, crsVerified:boolean, counts:object, skipped:number }}
 */
export function buildVisualGeo(state, urval, description) {
  const { points, lines, counts, skipped } = collectVisualGeo(state, urval);
  const crs = geoCoordinateSystem(state.activeCRS);
  const model = {
    info: { application: `${APP_NAME} ${APP_VERSION}`, description, coordinateSystem: crs.text },
    points, lines,
  };
  try {
    return { text: writeGeo(model), error: null, crsVerified: crs.verified, counts, skipped };
  } catch (e) {
    if (!(e instanceof GeoWriteError)) throw e;
    return { text: null, error: e.message, crsVerified: crs.verified, counts, skipped };
  }
}

/** Beskrivningen i filhuvudet för en lista med lager. */
export function layersDescription(layerIds, state = getState()) {
  return (layerIds || []).map(id => findVisualLayer(id, state)?.name).filter(Boolean).join(', ');
}

/** Filen för nätets punkter (Data → Exportera → Nätpunkter). H = 0 skrivs tomt. */
export function buildNetGeo(state) {
  const crs = geoCoordinateSystem(state.activeCRS);
  return writeGeo({
    info: { application: `${APP_NAME} ${APP_VERSION}`, description: 'Nätpunkter', coordinateSystem: crs.text },
    points: (state.pts || []).map(p => ({
      name: p.id, N: p.N || 0, E: p.E || 0, H: Number.isFinite(p.H) && p.H !== 0 ? p.H : null,
    })),
    lines: [],
  });
}
