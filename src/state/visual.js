// Visuellt lager: punkter, linjer och ytor som ritas för hand och ENBART är
// visuella. Helt separata från pts/meas – simuleringen läser aldrig
// visualPts/visualLines/visualAreas. Den enda vägen in i siktberäkningen är ett
// hinder som projiceras ur en linje eller yta (linkedObsId, se nedan).
//
// Datamodell
//   visualLayers: [{ id, name, color, visible, source, labels, vertexLabels }]
//   visualPts:    [{ id, layerId, E, N, H, color, name?, attrs?, role? }]
//   visualLines:  [{ id, layerId, from, to, color, linkedObsId }]
//   visualAreas:  [{ id, layerId, name?, vertices: [{ref,id}, …], color,
//                    fillOpacity, pattern, blocksSight, linkedObsId }]
//
// Ytor (Lager-verktyg Etapp 3) har samma hörnmodell som linjerna: varje hörn
// är en endpoint {ref:'visual'|'net', id}. Ett hörn som ritas fritt blir en
// visuell punkt med role:'vertex' i ytans lager; ett hörn som snappar mot en
// nätpunkt blir {ref:'net'} och följer punkten när den flyttas eller byter
// namn. Polygonen är sluten implicit – sista hörnet upprepas inte.
// blocksSight=true betyder att ytan har ett kopplat polygonhinder
// (linkedObsId) som syncLinkedObstacles() håller i synk, precis som "Använd
// som vägg" för linjer. Area och omkrets räknas i state/area-geometry.js.
//
// Varje visuellt objekt tillhör exakt ett lager (Etapp 1). Lagret bär namn,
// färg och synlighet; objektets egen färg vinner när den är satt. Lagret bär
// också sitt ursprung (source.kind: 'manual' | 'geo' | 'dxf') så att en import
// går att känna igen i lagerpanelen. Lagren är lika osynliga för simuleringen
// som resten av det visuella lagret.
//
// Punktnamn styrs per lager (Lager-menyn):
//   labels       – namn på fria punkter (role saknas eller 'point'). Förval på.
//   vertexLabels – namn på hörn i linjer och ytor (role 'vertex'). Förval av:
//                  en importerad kontur med hundratals "01"/"02" är oläsbar.
// Lager sparade innan fälten fanns laddas med labels=true, vertexLabels=false,
// vilket är precis hur de ritades förut. Den globala kryssrutan Etiketter i
// Visa-menyn styr bara nätets punkter.
//
// p.name är originalnamnet ur en importfil – etiketten visar name ?? id, så att
// ett importerat "8" inte döps om till "V17" på kartan. p.role === 'vertex'
// markerar hörn i linjer (och från etapp 3 ytor); deras etikett styrs av
// lagrets vertexLabels.
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
import { addObstacle }        from './obstacles.js';

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

export function addVisualLayer({ name, color = null, visible = true, source = null,
                                 labels = true, vertexLabels = false } = {}) {
  const { visualLayers = [], nVlyid = 1, activeVisualLayerId } = getState();
  const id = `VLY${nVlyid}`;
  const layer = {
    id,
    name: (typeof name === 'string' && name.trim()) ? name.trim() : `Lager ${nVlyid}`,
    color: normalizeHexColor(color),
    visible: visible !== false,
    source: _normalizeLayerSource(source),
    labels: labels !== false,
    vertexLabels: vertexLabels === true,
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
  if ('labels'       in changes) patch.labels       = changes.labels !== false;
  if ('vertexLabels' in changes) patch.vertexLabels = changes.vertexLabels === true;
  setState({ visualLayers: layers.map(l => l.id === id ? { ...l, ...patch } : l) });
}

// Raderar ett lager med allt innehåll. Objekten tas bort via de vanliga
// mutationsfunktionerna, så att kopplade hinder städas bort på samma väg som
// vid en manuell radering. Bekräftelsedialogen ligger i UI:t, inte här.
export function removeVisualLayer(id) {
  if (!findVisualLayer(id)) return { pts: 0, lines: 0, areas: 0 };
  const st = getState();
  const areaIds = (st.visualAreas || []).filter(a => a.layerId === id).map(a => a.id);
  const lineIds = (st.visualLines || []).filter(l => l.layerId === id).map(l => l.id);

  // Ytorna först: removeVisualArea städar sina egna hörn och sitt hinder.
  areaIds.forEach(removeVisualArea);
  lineIds.forEach(removeVisualLine);
  const ptIds = (getState().visualPts || []).filter(p => p.layerId === id).map(p => p.id);
  // removeVisualPt tar även med sig linjer i andra lager som hänger i punkten –
  // en linje utan ändpunkt kan ändå inte ritas.
  ptIds.forEach(removeVisualPt);

  const rest = getVisualLayers().filter(l => l.id !== id);
  setState({
    visualLayers: rest,
    activeVisualLayerId: getState().activeVisualLayerId === id
      ? (rest[0]?.id ?? null) : getState().activeVisualLayerId,
  });
  return { pts: ptIds.length, lines: lineIds.length, areas: areaIds.length };
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

// Ska punktens namn ritas? Hörn styrs av lagrets vertexLabels, övriga punkter
// av labels. Ett objekt utan känt lager ritas som förut: namn på fria punkter,
// inte på hörn.
export function visualPtShowsLabel(p, layer) {
  if (p?.role === 'vertex') return layer?.vertexLabels === true;
  return layer ? layer.labels !== false : true;
}

// Antal objekt per lager – för Lager-menyn. Hörn räknas inte som punkter:
// de hör till sin linje eller yta, och en importerad kontur med 200 hörn är
// inte 200 punkter för den som läser raden.
export function visualLayerCounts(layerId, state = getState()) {
  return {
    pts:   (state.visualPts   || []).filter(p => p.layerId === layerId && p.role !== 'vertex').length,
    lines: (state.visualLines || []).filter(l => l.layerId === layerId).length,
    areas: (state.visualAreas || []).filter(a => a.layerId === layerId).length,
  };
}

// Alla lägen som tillsammans beskriver lagrets geometri: fria punkter plus
// ändpunkterna på lagrets linjer, också när ändpunkten är en nätpunkt eller en
// punkt i ett annat lager. Varje punkt räknas en gång – ett hörn som både ligger
// i lagret och är ändpunkt på två linjer är ett läge, inte tre.
// Används av PM:ets §2.11.2 K2 (omsluter nätet byggnadsverket?). Tidigare
// jämfördes endpoint-objektet med ett punkt-id, så linjernas ändpunkter kom
// aldrig med och ett byggnadsverk ritat som linjer prövades inte.
export function visualLayerPositions(layerId, state = getState()) {
  const seen = new Set();
  const out  = [];
  const add = (key, pos) => {
    if (!pos || seen.has(key)) return;
    seen.add(key);
    out.push({ E: pos.E, N: pos.N });
  };
  for (const p of state.visualPts || [])
    if (p.layerId === layerId) add(`visual:${p.id}`, p);
  const eps = [];
  for (const l of state.visualLines || []) if (l.layerId === layerId) eps.push(l.from, l.to);
  for (const a of state.visualAreas || []) if (a.layerId === layerId) eps.push(...(a.vertices || []));
  for (const ep of eps)
    if (ep?.id) add(`${ep.ref === 'net' ? 'net' : 'visual'}:${ep.id}`, resolveEndpoint(ep, state));
  return out;
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

// [[E,N], …] för en yta, eller null om ett hörn saknas eller hörnen är färre
// än tre – en yta som inte går att lösa upp ritas inte och projiceras inte.
export function visualAreaCoords(area, state = getState()) {
  const vs = area?.vertices || [];
  if (vs.length < 3) return null;
  const out = [];
  for (const ep of vs) {
    const p = resolveEndpoint(ep, state);
    if (!p) return null;
    out.push([p.E, p.N]);
  }
  return out;
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

export const getVisualAreas = () => getState().visualAreas || [];

export function findVisualPt(id)   { return getVisualPts().find(p => p.id === id) || null; }
export function findVisualLine(id) { return getVisualLines().find(l => l.id === id) || null; }
export function findVisualArea(id) { return getVisualAreas().find(a => a.id === id) || null; }

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

// ── Ytor ─────────────────────────────────────────────────────────────────────

export const AREA_PATTERNS = ['none', 'hatch', 'grid'];
export const AREA_DEFAULT_OPACITY = 0.25;

const _opacity = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : AREA_DEFAULT_OPACITY;
};
const _pattern = v => (AREA_PATTERNS.includes(v) ? v : 'none');
const _ep = e => (e && typeof e.id === 'string')
  ? { ref: e.ref === 'net' ? 'net' : 'visual', id: e.id } : null;

// Skapar en yta. vertices är endpoints ({ref,id}) till punkter som redan finns;
// ritverktyget och importerna skapar hörnpunkterna först. blocksSight kopplar
// ett hinder direkt.
export function addVisualArea({ vertices, layerId = null, name = null, color = null,
                                fillOpacity = AREA_DEFAULT_OPACITY, pattern = 'none',
                                blocksSight = false }) {
  const vs = (vertices || []).map(_ep).filter(Boolean);
  if (vs.length < 3) return null;
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualAreas = [], nVaid = 1 } = getState();
  const id = `VA${nVaid}`;
  const area = {
    id, layerId: lid, vertices: vs, color: normalizeHexColor(color),
    fillOpacity: _opacity(fillOpacity), pattern: _pattern(pattern),
    blocksSight: false, linkedObsId: null,
  };
  if (typeof name === 'string' && name.trim()) area.name = name.trim();
  _commit({ visualAreas: [...visualAreas, area], nVaid: nVaid + 1 });
  if (blocksSight) setVisualAreaBlocksSight(id, true);
  return id;
}

export function updateVisualArea(id, changes) {
  const { visualAreas = [] } = getState();
  const c = {};
  if ('name' in changes) c.name = typeof changes.name === 'string' ? changes.name.trim() : '';
  if ('color' in changes) c.color = normalizeHexColor(changes.color);
  if ('fillOpacity' in changes) c.fillOpacity = _opacity(changes.fillOpacity);
  if ('pattern' in changes) c.pattern = _pattern(changes.pattern);
  if ('vertices' in changes) c.vertices = (changes.vertices || []).map(_ep).filter(Boolean);
  if ('layerId' in changes && findVisualLayer(changes.layerId)) c.layerId = changes.layerId;
  _commit({ visualAreas: visualAreas.map(a => {
    if (a.id !== id) return a;
    const n = { ...a, ...c };
    if (n.name === '') delete n.name;
    return n;
  }) });
  // Hindrets etikett följer ytans namn, så att det går att känna igen i
  // hinder-listan.
  const area = findVisualArea(id);
  if ('name' in c && area?.linkedObsId) {
    const { obstacles = [] } = getState();
    setState({ obstacles: obstacles.map(o => o.id === area.linkedObsId
      ? { ...o, label: `Yta (${area.name || area.id})` } : o) });
  }
}

// Slår av och på "Blockerar sikt (hinder)". På: ett polygonhinder skapas och
// kopplas via linkedObsId – samma mekanism som "Använd som vägg" för linjer.
// Av: hindret tas bort. Ytan kan inte blockera sikt utan sitt hinder, så
// flaggan och kopplingen följs alltid åt.
export function setVisualAreaBlocksSight(id, on) {
  const area = findVisualArea(id);
  if (!area) return false;
  if (on) {
    if (area.linkedObsId) return true;
    const coords = visualAreaCoords(area);
    if (!coords) return false;
    const obsId = addObstacle({
      type: 'polygon',
      label: `Yta (${area.name || area.id})`,
      color: visualObjColor(area),
      source: 'visual',
      points: coords,
    });
    const { visualAreas = [] } = getState();
    _commit({ visualAreas: visualAreas.map(a => a.id === id
      ? { ...a, blocksSight: true, linkedObsId: obsId } : a) });
    return true;
  }
  const obsId = area.linkedObsId;
  const { visualAreas = [] } = getState();
  _commit({ visualAreas: visualAreas.map(a => a.id === id
    ? { ...a, blocksSight: false, linkedObsId: null } : a) });
  _removeObstaclesFor([obsId]);
  return true;
}

// Punkter som ingen linje eller yta längre använder – för att städa bort
// hörnpunkter när deras yta försvinner.
function _unusedVisualPtIds(candidates, state = getState()) {
  const used = new Set();
  for (const l of state.visualLines || [])
    for (const ep of [l.from, l.to]) if (ep?.ref === 'visual') used.add(ep.id);
  for (const a of state.visualAreas || [])
    for (const ep of a.vertices || []) if (ep?.ref === 'visual') used.add(ep.id);
  return candidates.filter(id => !used.has(id));
}

// Tar bort en yta, dess kopplade hinder och de hörnpunkter (role 'vertex') som
// bara den använde. Nätpunkter rörs aldrig, och inte heller en fri punkt som
// ytan snappat mot.
export function removeVisualArea(id) {
  const { visualAreas = [], visualPts = [], selVisualId } = getState();
  const area = visualAreas.find(a => a.id === id);
  if (!area) return;
  _commit({
    visualAreas: visualAreas.filter(a => a.id !== id),
    selVisualId: selVisualId === id ? null : selVisualId,
  });
  _removeObstaclesFor([area.linkedObsId]);
  const hörn = (area.vertices || []).filter(ep => ep.ref === 'visual').map(ep => ep.id)
    .filter(pid => visualPts.find(p => p.id === pid)?.role === 'vertex');
  const bort = new Set(_unusedVisualPtIds(hörn));
  if (bort.size) _commit({ visualPts: getState().visualPts.filter(p => !bort.has(p.id)) });
}

// Tar bort hörnet ref:id ur alla ytor. En yta som då får färre än tre hörn tas
// bort helt (med sitt hinder) – den går inte längre att rita. Returnerar
// { changed, removed } med ytornas id:n.
function _dropVertexFromAreas(ref, id) {
  const { visualAreas = [] } = getState();
  const träff = ep => ep?.ref === ref && ep.id === id;
  const changed = [], removed = [], dropObs = [];
  const next = [];
  for (const a of visualAreas) {
    if (!(a.vertices || []).some(träff)) { next.push(a); continue; }
    const vs = a.vertices.filter(ep => !träff(ep));
    if (vs.length < 3) { removed.push(a.id); dropObs.push(a.linkedObsId); continue; }
    changed.push(a.id);
    next.push({ ...a, vertices: vs });
  }
  if (!changed.length && !removed.length) return { changed, removed };
  const { selVisualId } = getState();
  _commit({ visualAreas: next, selVisualId: removed.includes(selVisualId) ? null : selVisualId });
  _removeObstaclesFor(dropObs);
  return { changed, removed };
}

// ── Nätpunkter som linjer och ytor hänger i ──────────────────────────────────
// Anropas av punktdialogen (ui/modals.js) när en nätpunkt byter namn eller tas
// bort, så att visuella linjer och ytor följer med.

/** Nätpunkten oldId heter nu newId: flytta alla {ref:'net'}-referenser. */
export function renameNetPointInVisual(oldId, newId) {
  const { visualLines = [], visualAreas = [] } = getState();
  const remap = ep => (ep?.ref === 'net' && ep.id === oldId) ? { ...ep, id: newId } : ep;
  setState({
    visualLines: visualLines.map(l => ({ ...l, from: remap(l.from), to: remap(l.to) })),
    visualAreas: visualAreas.map(a => ({ ...a, vertices: (a.vertices || []).map(remap) })),
  });
}

/**
 * Vad som händer med de visuella objekten om nätpunkten id tas bort – för
 * bekräftelsedialogen. Ren läsning, ändrar ingenting.
 *   linesRemoved: linjer som får en ändpunkt för lite och tas bort helt
 *   areasChanged: ytor som tappar hörnet men har minst tre kvar
 *   areasRemoved: ytor som får färre än tre hörn och tas bort helt
 *   obstacles:    kopplade hinder som försvinner med dem
 */
export function netPointVisualImpact(id, state = getState()) {
  const anchored = ep => ep?.ref === 'net' && ep.id === id;
  const linesRemoved = (state.visualLines || []).filter(l => anchored(l.from) || anchored(l.to));
  const areasChanged = [], areasRemoved = [];
  for (const a of state.visualAreas || []) {
    const kvar = (a.vertices || []).filter(ep => !anchored(ep)).length;
    if (kvar === (a.vertices || []).length) continue;
    (kvar < 3 ? areasRemoved : areasChanged).push(a);
  }
  const obstacles = [...linesRemoved, ...areasRemoved].filter(x => x.linkedObsId).length;
  return { linesRemoved, areasChanged, areasRemoved, obstacles };
}

/**
 * Nätpunkten id tas bort. Linjer som hängde i den tas bort (de kan inte ritas
 * med en ändpunkt), och deras hinder med dem. Ytor tappar hörnet; en yta med
 * färre än tre hörn kvar tas bort. Returnerar vad som hände, för dialogen.
 * Anropas INNAN punkten tas bort ur pts – kopplade hinder synkas då mot den
 * nya formen.
 */
export function dropNetPointFromVisual(id) {
  const { visualLines = [], selVisualId } = getState();
  const anchored = ep => ep?.ref === 'net' && ep.id === id;
  const dropped  = visualLines.filter(l => anchored(l.from) || anchored(l.to));
  if (dropped.length) {
    setState({
      visualLines: visualLines.filter(l => !dropped.includes(l)),
      selVisualId: dropped.some(l => l.id === selVisualId) ? null : selVisualId,
    });
    _removeObstaclesFor(dropped.map(l => l.linkedObsId));
  }
  const areas = _dropVertexFromAreas('net', id);
  return { lines: dropped.length, areasChanged: areas.changed.length, areasRemoved: areas.removed.length };
}

// Tar bort en visuell punkt. Linjer som hänger på punkten tas bort med den –
// en linje utan endpoint kan ändå inte ritas. Ytor tappar hörnet (och tas bort
// om färre än tre hörn återstår).
export function removeVisualPt(id) {
  // Ytorna först, medan punkten finns: annars ser syncLinkedObstacles en yta
  // med ett oupplösligt hörn och kastar hindret i stället för att krympa det.
  _dropVertexFromAreas('visual', id);
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

// Projicerar varje kopplad visuell linje och yta på sitt hinder. Körs efter
// varje mutation av det visuella lagret, när en nätpunkt flyttas och efter
// laddning från fil. Kopplingar vars källa eller hinder försvunnit städas bort;
// en yta vars hinder raderats i hinder-panelen blockerar inte längre sikt.
export function syncLinkedObstacles() {
  const state  = getState();
  const lines  = state.visualLines || [];
  const areas  = state.visualAreas || [];
  const linkedLines = lines.filter(l => l.linkedObsId);
  const linkedAreas = areas.filter(a => a.linkedObsId);
  if (!linkedLines.length && !linkedAreas.length) return;

  const obstacles = state.obstacles || [];
  const obsById   = new Map(obstacles.map(o => [o.id, o]));

  const dropObs   = new Set();   // hinder vars källa inte längre går att lösa upp
  const clearLine = new Set();   // linjer vars hinder inte finns kvar
  const clearArea = new Set();   // ytor vars hinder inte finns kvar
  const newPoints = new Map();   // obsId → uppdaterade koordinater

  const samePoints = (p, coords) => Array.isArray(p) && p.length === coords.length
    && coords.every((c, i) => p[i]?.[0] === c[0] && p[i]?.[1] === c[1]);

  const project = (src, coords, clear) => {
    // Hindret raderat i hinder-panelen: källan styr inget längre.
    if (!obsById.has(src.linkedObsId)) { clear.add(src.id); return; }
    // Källan går inte att lösa upp (ett hörn är borta). Projektionen har
    // inget att spegla och tas bort i stället för att bli ett spökhinder.
    if (!coords) { dropObs.add(src.linkedObsId); clear.add(src.id); return; }
    if (!samePoints(obsById.get(src.linkedObsId).points, coords))
      newPoints.set(src.linkedObsId, coords);
  };
  for (const l of linkedLines) project(l, visualLineCoords(l, state), clearLine);
  for (const a of linkedAreas) project(a, visualAreaCoords(a, state), clearArea);

  if (!dropObs.size && !clearLine.size && !clearArea.size && !newPoints.size) return;

  const patch = {};
  if (dropObs.size || newPoints.size) {
    patch.obstacles = obstacles
      .filter(o => !dropObs.has(o.id))
      .map(o => newPoints.has(o.id) ? { ...o, points: newPoints.get(o.id) } : o);
  }
  if (clearLine.size) {
    patch.visualLines = lines.map(l => clearLine.has(l.id) ? { ...l, linkedObsId: null } : l);
  }
  if (clearArea.size) {
    patch.visualAreas = areas.map(a => clearArea.has(a.id)
      ? { ...a, linkedObsId: null, blocksSight: false } : a);
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

// Ytor ur en fil. Hörnen saneras som linjernas endpoints; en yta med färre än
// tre giltiga hörn kastas. blocksSight följer kopplingen – en yta utan
// linkedObsId kan inte blockera sikt, hur flaggan än står i filen.
export function _sanitizeVisualAreas(visualAreas) {
  return (Array.isArray(visualAreas) ? visualAreas : [])
    .filter(a => a && typeof a.id === 'string' && Array.isArray(a.vertices))
    .map(a => {
      const vertices = a.vertices.map(_ep).filter(Boolean);
      const linkedObsId = typeof a.linkedObsId === 'string' ? a.linkedObsId : null;
      const out = {
        id: a.id,
        layerId: typeof a.layerId === 'string' ? a.layerId : null,
        vertices,
        color: normalizeHexColor(a.color),
        fillOpacity: _opacity(a.fillOpacity ?? AREA_DEFAULT_OPACITY),
        pattern: _pattern(a.pattern),
        blocksSight: !!linkedObsId,
        linkedObsId,
      };
      if (typeof a.name === 'string' && a.name.trim()) out.name = a.name.trim();
      return out;
    })
    .filter(a => a.vertices.length >= 3);
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
export function _migrateVisualLayers(visualPts, visualLines, visualLayers, activeVisualLayerId,
                                     visualAreas = []) {
  const layers = (visualLayers || [])
    .filter(l => l && typeof l.id === 'string')
    .map(l => ({
      id: l.id,
      name: (typeof l.name === 'string' && l.name.trim()) ? l.name.trim() : l.id,
      color: normalizeHexColor(l.color),
      visible: l.visible !== false,
      source: _normalizeLayerSource(l.source),
      // Saknas fälten (lager sparade före Lager-menyn) ritas lagret som förut.
      labels: l.labels !== false,
      vertexLabels: l.vertexLabels === true,
    }));

  const pts   = [...(visualPts   || [])];
  const lines = [...(visualLines || [])];
  const areas = [...(visualAreas || [])];
  const known = new Set(layers.map(l => l.id));
  const orphan = o => !(typeof o.layerId === 'string' && known.has(o.layerId));

  let nVlyid = _nextCounter(layers, 'VLY');

  if (pts.some(orphan) || lines.some(orphan) || areas.some(orphan)) {
    // Återanvänd ett befintligt "Handritat" i stället för att skapa ett till.
    let fallback = layers.find(l => l.name === VISUAL_LAYER_FALLBACK_NAME);
    if (!fallback) {
      fallback = {
        id: `VLY${nVlyid++}`,
        name: VISUAL_LAYER_FALLBACK_NAME,
        color: null,
        visible: true,
        source: _normalizeLayerSource({ kind: 'manual' }),
        labels: true,
        vertexLabels: false,
      };
      layers.push(fallback);
      known.add(fallback.id);
    }
    for (const o of pts)   if (orphan(o)) o.layerId = fallback.id;
    for (const o of lines) if (orphan(o)) o.layerId = fallback.id;
    for (const o of areas) if (orphan(o)) o.layerId = fallback.id;
  }

  const active = (typeof activeVisualLayerId === 'string' && known.has(activeVisualLayerId))
    ? activeVisualLayerId : (layers[0]?.id ?? null);

  return { visualPts: pts, visualLines: lines, visualAreas: areas, visualLayers: layers,
           activeVisualLayerId: active, nVlyid };
}
