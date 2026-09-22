// Visuellt lager: punkter och linjer som ritas för hand och ENBART är visuella.
// Helt separata från pts/meas – simuleringen läser aldrig visualPts/visualLines.
//
// Datamodell
//   visualLayers: [{ id, name, color, visible, source }]
//   visualPts:    [{ id, layerId, E, N, H, color, name?, attrs?, role? }]
//   visualLines:  [{ id, layerId, from, to, color, linkedObsId }]
//
// Varje visuellt objekt tillhör exakt ett lager (Etapp 1). Lagret bär namn,
// färg och synlighet; objektets egen färg vinner när den är satt. Lagret bär
// också sitt ursprung (source.kind: 'manual' | 'geo' | 'dxf') så att en import
// går att känna igen i lagerpanelen. Lagren är lika osynliga för simuleringen
// som resten av det visuella lagret.
//
// p.name är originalnamnet ur en importfil – etiketten visar name ?? id, så att
// ett importerat "8" inte döps om till "V17" på kartan. p.role === 'vertex'
// markerar hörn i importerade linjer; de ritas utan etikett.
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

// ── Visuella lager ───────────────────────────────────────────────────────────
// Lagret som objekt utan eget lager hamnar i – vid migrering av äldre filer och
// när det ritas för hand innan något lager finns.
export const VISUAL_LAYER_FALLBACK_NAME = 'Handritat';

const LAYER_KINDS = ['manual', 'geo', 'dxf'];

// source beskriver var lagret kom ifrån. Okänd kind faller tillbaka på
// 'manual' – ett lager utan känt ursprung är ett handritat lager.
function _normalizeLayerSource(src) {
  return {
    kind:     LAYER_KINDS.includes(src?.kind) ? src.kind : 'manual',
    filename: typeof src?.filename === 'string' ? src.filename : null,
    crs:      typeof src?.crs      === 'string' ? src.crs      : null,
  };
}

export const getVisualLayers = () => getState().visualLayers || [];

export function findVisualLayer(id, state = getState()) {
  if (!id) return null;
  return (state.visualLayers || []).find(l => l.id === id) || null;
}

export function addVisualLayer({ name, color = null, visible = true, source = null } = {}) {
  const { visualLayers = [], nVlyid = 1, activeVisualLayerId } = getState();
  const id = `VLY${nVlyid}`;
  const layer = {
    id,
    name: (typeof name === 'string' && name.trim()) ? name.trim() : `Lager ${nVlyid}`,
    color: normalizeHexColor(color),
    visible: visible !== false,
    source: _normalizeLayerSource(source),
  };
  setState({
    visualLayers: [...visualLayers, layer],
    nVlyid: nVlyid + 1,
    // Första lagret blir aktivt direkt – annars hamnar nästa ritade objekt i ett
    // nyskapat "Handritat" trots att användaren just skapat ett lager.
    activeVisualLayerId: activeVisualLayerId && visualLayers.some(l => l.id === activeVisualLayerId)
      ? activeVisualLayerId : id,
  });
  return id;
}

// Aktivt lager, eller ett nyskapat "Handritat" om inget finns. Anropas av
// varje mutation som skapar objekt, så att layerId aldrig kan bli null.
export function ensureActiveVisualLayer() {
  const { visualLayers = [], activeVisualLayerId } = getState();
  if (activeVisualLayerId && visualLayers.some(l => l.id === activeVisualLayerId))
    return activeVisualLayerId;
  if (visualLayers.length) {
    setState({ activeVisualLayerId: visualLayers[0].id });
    return visualLayers[0].id;
  }
  return addVisualLayer({ name: VISUAL_LAYER_FALLBACK_NAME, source: { kind: 'manual' } });
}

export function setActiveVisualLayer(id) {
  if (!findVisualLayer(id)) return false;
  setState({ activeVisualLayerId: id });
  return true;
}

export function updateVisualLayer(id, changes) {
  const layers = getVisualLayers();
  if (!layers.some(l => l.id === id)) return;
  const patch = {};
  if ('name'    in changes && typeof changes.name === 'string' && changes.name.trim())
    patch.name = changes.name.trim();
  if ('color'   in changes) patch.color   = normalizeHexColor(changes.color);
  if ('visible' in changes) patch.visible = changes.visible !== false;
  if ('source'  in changes) patch.source  = _normalizeLayerSource(changes.source);
  setState({ visualLayers: layers.map(l => l.id === id ? { ...l, ...patch } : l) });
}

// Raderar ett lager med allt innehåll. Objekten tas bort via de vanliga
// mutationsfunktionerna, så att kopplade hinder städas bort på samma väg som
// vid en manuell radering. Bekräftelsedialogen ligger i UI:t, inte här.
export function removeVisualLayer(id) {
  if (!findVisualLayer(id)) return { pts: 0, lines: 0 };
  const st = getState();
  const lineIds = (st.visualLines || []).filter(l => l.layerId === id).map(l => l.id);
  const ptIds   = (st.visualPts   || []).filter(p => p.layerId === id).map(p => p.id);

  lineIds.forEach(removeVisualLine);
  // removeVisualPt tar även med sig linjer i andra lager som hänger i punkten –
  // en linje utan ändpunkt kan ändå inte ritas.
  ptIds.forEach(removeVisualPt);

  const rest = getVisualLayers().filter(l => l.id !== id);
  setState({
    visualLayers: rest,
    activeVisualLayerId: getState().activeVisualLayerId === id
      ? (rest[0]?.id ?? null) : getState().activeVisualLayerId,
  });
  return { pts: ptIds.length, lines: lineIds.length };
}

// Ett dolt lager ritas inte och går inte att träffa på kartan. Objekt vars
// lager saknas behandlas som synliga – hellre synligt än spårlöst borta.
export function isVisualLayerVisible(layerId, state = getState()) {
  const l = findVisualLayer(layerId, state);
  return l ? l.visible !== false : true;
}

export const isVisualObjVisible = (obj, state = getState()) =>
  isVisualLayerVisible(obj?.layerId, state);

// Färgordning: objektets egen färg → lagrets färg → standardfärg.
export function visualObjColor(obj, state = getState()) {
  if (obj?.color) return obj.color;
  return findVisualLayer(obj?.layerId, state)?.color || VISUAL_DEFAULT_COLOR;
}

// Etiketten visar originalnamnet ur importfilen när det finns.
export const visualPtLabel = p => p?.name ?? p?.id ?? '';

// Antal objekt per lager – för lagerpanelen.
export function visualLayerCounts(layerId, state = getState()) {
  return {
    pts:   (state.visualPts   || []).filter(p => p.layerId === layerId).length,
    lines: (state.visualLines || []).filter(l => l.layerId === layerId).length,
  };
}

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

// layerId anges av en import; utan den hamnar objektet i aktivt lager.
// ensureActiveVisualLayer() körs FÖRE getState() nedan eftersom den kan skapa
// ett lager och därmed byta ut state.
export function addVisualPt({ E, N, H = 0, color = null, layerId = null,
                              name = null, attrs = null, role = null }) {
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualPts = [], nVid = 1 } = getState();
  const id = `V${nVid}`;
  const pt = { id, layerId: lid, E, N, H, color: normalizeHexColor(color) };
  // Valfria fält skrivs bara när de har ett värde – en handritad punkt ska se
  // likadan ut i projektfilen som före Etapp 1.
  if (typeof name === 'string' && name !== '') pt.name = name;
  if (attrs && typeof attrs === 'object')      pt.attrs = attrs;
  if (role === 'vertex' || role === 'point')   pt.role = role;
  _commit({ visualPts: [...visualPts, pt], nVid: nVid + 1 });
  return id;
}

export function addVisualLine({ from, to, color = null, layerId = null }) {
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualLines = [], nVlid = 1 } = getState();
  const id = `VL${nVlid}`;
  const line = { id, layerId: lid, from, to, color: normalizeHexColor(color), linkedObsId: null };
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
    .map(p => {
      const out = {
        id: p.id,
        layerId: typeof p.layerId === 'string' ? p.layerId : null,
        E: p.E, N: p.N, H: Number.isFinite(p.H) ? p.H : 0,
        color: normalizeHexColor(p.color),
      };
      if (typeof p.name === 'string' && p.name !== '')    out.name  = p.name;
      if (p.attrs && typeof p.attrs === 'object')         out.attrs = p.attrs;
      if (p.role === 'vertex' || p.role === 'point')      out.role  = p.role;
      return out;
    });

  const ep = e => (e && typeof e.id === 'string')
    ? { ref: e.ref === 'net' ? 'net' : 'visual', id: e.id }
    : null;

  const lines = (visualLines || [])
    .filter(l => l && typeof l.id === 'string' && ep(l.from) && ep(l.to))
    .map(l => ({
      id: l.id,
      layerId: typeof l.layerId === 'string' ? l.layerId : null,
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

// ── Migrering av lager vid laddning ──────────────────────────────────────────

// Kör efter _sanitizeVisual. Sanerar lagerlistan och ser till att varje objekt
// pekar på ett lager som finns. Objekt utan giltigt layerId – varje objekt i en
// projektfil sparad före Etapp 1 – samlas i lagret "Handritat".
// Returnerar hela uppsättningen inklusive nästa lediga lager-räknare.
export function _migrateVisualLayers(visualPts, visualLines, visualLayers, activeVisualLayerId) {
  const layers = (visualLayers || [])
    .filter(l => l && typeof l.id === 'string')
    .map(l => ({
      id: l.id,
      name: (typeof l.name === 'string' && l.name.trim()) ? l.name.trim() : l.id,
      color: normalizeHexColor(l.color),
      visible: l.visible !== false,
      source: _normalizeLayerSource(l.source),
    }));

  const pts   = [...(visualPts   || [])];
  const lines = [...(visualLines || [])];
  const known = new Set(layers.map(l => l.id));
  const orphan = o => !(typeof o.layerId === 'string' && known.has(o.layerId));

  let nVlyid = _nextCounter(layers, 'VLY');

  if (pts.some(orphan) || lines.some(orphan)) {
    // Återanvänd ett befintligt "Handritat" i stället för att skapa ett till.
    let fallback = layers.find(l => l.name === VISUAL_LAYER_FALLBACK_NAME);
    if (!fallback) {
      fallback = {
        id: `VLY${nVlyid++}`,
        name: VISUAL_LAYER_FALLBACK_NAME,
        color: null,
        visible: true,
        source: _normalizeLayerSource({ kind: 'manual' }),
      };
      layers.push(fallback);
      known.add(fallback.id);
    }
    for (const o of pts)   if (orphan(o)) o.layerId = fallback.id;
    for (const o of lines) if (orphan(o)) o.layerId = fallback.id;
  }

  const active = (typeof activeVisualLayerId === 'string' && known.has(activeVisualLayerId))
    ? activeVisualLayerId : (layers[0]?.id ?? null);

  return { visualPts: pts, visualLines: lines, visualLayers: layers,
           activeVisualLayerId: active, nVlyid };
}
