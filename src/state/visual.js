// Visuellt lager: punkter och linjer som ritas för hand och ENBART är visuella.
// Helt separata från pts/meas – simuleringen läser aldrig visualPts/visualLines.
//
// Datamodell
//   visualPts:   [{ id, E, N, H, color }]
//   visualLines: [{ id, from, to, color, linkedObsId }]
//
// En linjes endpoint är {ref, id} där ref är 'visual' (en visualPt) eller
// 'net' (en vanlig NätSim-punkt i pts). Explicit ref i stället för att slå upp
// id:t i båda listorna: punkt-id:n är användarredigerbara och kan kollidera.
//
// linkedObsId kopplar linjen till ett hinder skapat via "Använd som vägg" /
// "Använd som blockeringslinje" (Etapp D4). Hindrets points är en projektion av
// linjens koordinater – aldrig en oberoende kopia. Alla mutationer av det
// visuella lagret går genom detta modul, och varje sådan mutation avslutas med
// syncLinkedObstacles(), så projektionen kan inte glida isär från källan.
import { getState, setState } from './store.js';
import { normalizeHexColor }  from '../core/colors.js';

// Standardfärger när objektet saknar egen färg.
export const VISUAL_DEFAULT_COLOR = '#cfd8dc';

// Palett i redigeringsdialogen för visuella objekt.
export const VISUAL_COLORS = [
  { hex: '#cfd8dc', label: 'Standard' },
  { hex: '#ffd54f', label: 'Vägkant' },
  { hex: '#4dd0e1', label: 'Ritningskontur' },
  { hex: '#f06292', label: 'Planerat objekt' },
  { hex: '#aed581', label: 'Terräng' },
  { hex: '#b39ddb', label: 'Övrigt' },
];

// ── Endpoints ────────────────────────────────────────────────────────────────

export function makeEndpoint(ref, id) {
  return { ref: ref === 'net' ? 'net' : 'visual', id };
}

// Slår upp en endpoints koordinater. Returnerar null om målet saknas – en
// linje vars endpoint raderats ska hoppas över, inte ritas på fel plats.
export function resolveEndpoint(ep, state = getState()) {
  if (!ep || !ep.id) return null;
  if (ep.ref === 'net') {
    const p = (state.pts || []).find(x => x.id === ep.id);
    return p ? { E: p.E, N: p.N, H: p.H ?? 0 } : null;
  }
  const v = (state.visualPts || []).find(x => x.id === ep.id);
  return v ? { E: v.E, N: v.N, H: v.H ?? 0 } : null;
}

// [[E,N],[E,N]] för en visuell linje, eller null om någon endpoint saknas.
export function visualLineCoords(line, state = getState()) {
  const a = resolveEndpoint(line?.from, state);
  const b = resolveEndpoint(line?.to, state);
  if (!a || !b) return null;
  return [[a.E, a.N], [b.E, b.N]];
}

// ── Läsning ──────────────────────────────────────────────────────────────────

export const getVisualPts   = () => getState().visualPts   || [];
export const getVisualLines = () => getState().visualLines || [];

export function findVisualPt(id)   { return getVisualPts().find(p => p.id === id) || null; }
export function findVisualLine(id) { return getVisualLines().find(l => l.id === id) || null; }

// ── Mutationer ───────────────────────────────────────────────────────────────
// Samtliga går via _commit() så att kopplade hinder alltid synkas.

function _commit(partial) {
  setState(partial);
  syncLinkedObstacles();
}

export function addVisualPt({ E, N, H = 0, color = null }) {
  const { visualPts = [], nVid = 1 } = getState();
  const id = `V${nVid}`;
  const pt = { id, E, N, H, color: normalizeHexColor(color) };
  _commit({ visualPts: [...visualPts, pt], nVid: nVid + 1 });
  return id;
}

export function addVisualLine({ from, to, color = null }) {
  const { visualLines = [], nVlid = 1 } = getState();
  const id = `VL${nVlid}`;
  const line = { id, from, to, color: normalizeHexColor(color), linkedObsId: null };
  _commit({ visualLines: [...visualLines, line], nVlid: nVlid + 1 });
  return id;
}

export function updateVisualPt(id, changes) {
  const { visualPts = [] } = getState();
  const c = 'color' in changes ? { color: normalizeHexColor(changes.color) } : null;
  _commit({ visualPts: visualPts.map(p => p.id === id ? { ...p, ...changes, ...c } : p) });
}

export function updateVisualLine(id, changes) {
  const { visualLines = [] } = getState();
  const c = 'color' in changes ? { color: normalizeHexColor(changes.color) } : null;
  _commit({ visualLines: visualLines.map(l => l.id === id ? { ...l, ...changes, ...c } : l) });
}

// Tar bort en visuell punkt. Linjer som hänger på punkten tas bort med den –
// en linje utan endpoint kan ändå inte ritas.
export function removeVisualPt(id) {
  const { visualPts = [], visualLines = [], selVisualId } = getState();
  const orphaned = visualLines.filter(l =>
    (l.from?.ref === 'visual' && l.from.id === id) ||
    (l.to?.ref   === 'visual' && l.to.id   === id));
  const orphanIds = new Set(orphaned.map(l => l.id));

  _commit({
    visualPts:   visualPts.filter(p => p.id !== id),
    visualLines: visualLines.filter(l => !orphanIds.has(l.id)),
    selVisualId: selVisualId === id || orphanIds.has(selVisualId) ? null : selVisualId,
  });
  // Hinder som projicerade de borttagna linjerna har inget kvar att spåra.
  _removeObstaclesFor(orphaned.map(l => l.linkedObsId));
  return orphaned.length;
}

// Tar bort en visuell linje. Ett kopplat hinder försvinner med den: hindret är
// en projektion av linjen och har ingen egen existens.
export function removeVisualLine(id) {
  const { visualLines = [], selVisualId } = getState();
  const line = visualLines.find(l => l.id === id);
  _commit({
    visualLines: visualLines.filter(l => l.id !== id),
    selVisualId: selVisualId === id ? null : selVisualId,
  });
  _removeObstaclesFor([line?.linkedObsId]);
}

function _removeObstaclesFor(obsIds) {
  const ids = new Set(obsIds.filter(Boolean));
  if (!ids.size) return;
  const { obstacles = [], selObsId } = getState();
  setState({
    obstacles: obstacles.filter(o => !ids.has(o.id)),
    selObsId:  ids.has(selObsId) ? null : selObsId,
  });
}

// ── Koppling till hinder-systemet (Etapp D4) ─────────────────────────────────

// Projicerar varje kopplad visuell linje på sitt hinder. Körs efter varje
// mutation av det visuella lagret och efter laddning från fil.
// Kopplingar vars linje eller hinder försvunnit städas bort.
export function syncLinkedObstacles() {
  const state  = getState();
  const lines  = state.visualLines || [];
  const linked = lines.filter(l => l.linkedObsId);
  if (!linked.length) return;

  const obstacles = state.obstacles || [];
  const obsById   = new Map(obstacles.map(o => [o.id, o]));

  const dropObs   = new Set();   // hinder vars källinje inte längre går att lösa upp
  const clearLink = new Set();   // linjer vars hinder inte finns kvar
  const newPoints = new Map();   // obsId → uppdaterade koordinater

  for (const l of linked) {
    // Hindret raderat i hinder-panelen: linjen styr inget längre.
    if (!obsById.has(l.linkedObsId)) { clearLink.add(l.id); continue; }

    const coords = visualLineCoords(l, state);
    // Källan går inte att lösa upp (en endpoint är borta). Projektionen har
    // inget att spegla och tas bort i stället för att bli en spökvägg.
    if (!coords) { dropObs.add(l.linkedObsId); clearLink.add(l.id); continue; }

    const p = obsById.get(l.linkedObsId).points;
    const same = p?.[0]?.[0] === coords[0][0] && p?.[0]?.[1] === coords[0][1]
              && p?.[1]?.[0] === coords[1][0] && p?.[1]?.[1] === coords[1][1];
    if (!same) newPoints.set(l.linkedObsId, coords);
  }

  if (!dropObs.size && !clearLink.size && !newPoints.size) return;

  const patch = {};
  if (dropObs.size || newPoints.size) {
    patch.obstacles = obstacles
      .filter(o => !dropObs.has(o.id))
      .map(o => newPoints.has(o.id) ? { ...o, points: newPoints.get(o.id) } : o);
  }
  if (clearLink.size) {
    patch.visualLines = lines.map(l => clearLink.has(l.id) ? { ...l, linkedObsId: null } : l);
  }
  if (dropObs.has(state.selObsId)) patch.selObsId = null;
  setState(patch);
}

// ── Laddning från fil ────────────────────────────────────────────────────────

// Saneras vid laddning: färger normaliseras, endpoints får giltig ref, och
// objekt utan användbara fält kastas hellre än ritas fel.
export function _sanitizeVisual(visualPts, visualLines) {
  const pts = (visualPts || [])
    .filter(p => p && typeof p.id === 'string' && Number.isFinite(p.E) && Number.isFinite(p.N))
    .map(p => ({
      id: p.id,
      E: p.E, N: p.N, H: Number.isFinite(p.H) ? p.H : 0,
      color: normalizeHexColor(p.color),
    }));

  const ep = e => (e && typeof e.id === 'string')
    ? { ref: e.ref === 'net' ? 'net' : 'visual', id: e.id }
    : null;

  const lines = (visualLines || [])
    .filter(l => l && typeof l.id === 'string' && ep(l.from) && ep(l.to))
    .map(l => ({
      id: l.id,
      from: ep(l.from), to: ep(l.to),
      color: normalizeHexColor(l.color),
      linkedObsId: typeof l.linkedObsId === 'string' ? l.linkedObsId : null,
    }));

  return { visualPts: pts, visualLines: lines };
}

// Nästa lediga id-räknare efter laddning, så att nya objekt inte krockar.
export function _nextCounter(items, prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const max = (items || []).reduce((m, it) => {
    const hit = re.exec(it?.id || '');
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
  return max + 1;
}
