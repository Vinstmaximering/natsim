// Visuellt lager: punkter, linjer och ytor som ritas för hand och ENBART är
// visuella. Helt separata från pts/meas – simuleringen läser aldrig
// visualPts/visualLines/visualAreas. Den enda vägen in i siktberäkningen är ett
// hinder som projiceras ur en linje eller yta (linkedObsIds/linkedObsId, se nedan).
//
// Datamodell
//   visualLayers: [{ id, name, color, visible, source, labels, vertexLabels }]
//   visualPts:    [{ id, layerId, E, N, H, color, name?, attrs?, role? }]
//   visualLines:  [{ id, layerId, name?, vertices: [{ref,id}, …], closed,
//                    color, hideLabel?, linkedObsIds: [] }]
//   visualAreas:  [{ id, layerId, name?, vertices: [{ref,id}, …], color,
//                    fillOpacity, pattern, blocksSight, linkedObsId }]
//   visualCircles: [{ id, layerId, name?, center: {ref,id} | {E,N}, radius,
//                    color, hideLabel? }]            (Polylinjer Etapp 5)
//
// H är null när punkten saknar höjd. Före polylinjerna (visualVer 2) skrevs
// 0 för "ingen höjd"; sådana punkter får null när projektet laddas.
//
// Linjer är polylinjer (Polylinjer Etapp 1): minst två hörn, closed=true
// betyder att sista hörnet förbinds med det första (upprepas inte). Ytor
// (Lager-verktyg Etapp 3) har samma hörnmodell: varje hörn är en endpoint
// {ref:'visual'|'net', id}. Ett hörn som ritas fritt blir en visuell punkt
// med role:'vertex' i objektets lager; ett hörn som snappar mot en nätpunkt
// blir {ref:'net'} och följer punkten när den flyttas eller byter namn.
// Ytans polygon är sluten implicit – sista hörnet upprepas inte.
//
// Projekt sparade före polylinjerna har en linje per segment ({from, to}).
// De slås ihop vid laddning, se _mergeLegacyLines().
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
// linkedObsIds kopplar linjen till hinder skapade via "Använd som vägg" /
// "Använd som blockeringslinje" (Etapp D4). hasLineOfSight (core/) läser bara
// två punkter i ett linjehinder, så polylinjen projiceras på ett linjehinder
// per segment – ett segment, ett hinder, i ordning. Hindrens points är en
// projektion av linjens koordinater – aldrig en oberoende kopia. Alla mutationer av det
// visuella lagret går genom detta modul, och varje sådan mutation avslutas med
// syncLinkedObstacles(), så projektionen kan inte glida isär från källan.
import { getState, setState } from './store.js';
import { normalizeHexColor }  from '../core/colors.js';
import { addObstacle, nextObstacleId } from './obstacles.js';
import { getArcTolerance, circleVertexCount } from './arc-tolerance.js';

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
  if (!findVisualLayer(id)) return { pts: 0, lines: 0, areas: 0, circles: 0 };
  const st = getState();
  const circleIds = (st.visualCircles || []).filter(c => c.layerId === id).map(c => c.id);
  circleIds.forEach(removeVisualCircle);
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
  return { pts: ptIds.length, lines: lineIds.length, areas: areaIds.length, circles: circleIds.length };
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

/**
 * Punktens namn i texter (mätrutan): punktens eget namn när det finns. Ett hörn
 * utan eget namn beskrivs med sin plats – "hörn 3 i Kantbalk N", eller
 * "hörn 3 i VL12" om linjen saknar namn – med samma löpnummer som i
 * egenskapskortets tabell. Ett internt punkt-id som V65 visas aldrig för ett
 * hörn. En fri punkt utan namn heter det som står vid den på kartan.
 */
export function visualPtDisplayName(p, state = getState()) {
  if (!p) return null;
  if (typeof p.name === 'string' && p.name !== '') return p.name;
  if (p.role === 'vertex') {
    const hit = ep => ep?.ref === 'visual' && ep.id === p.id;
    for (const o of [...(state.visualLines || []), ...(state.visualAreas || [])]) {
      const i = (o.vertices || []).findIndex(hit);
      if (i >= 0) return `hörn ${i + 1} i ${o.name || o.id}`;
    }
  }
  return visualPtLabel(p);
}

// Ska punktens namn ritas? Hörn styrs av lagrets vertexLabels, övriga punkter
// av labels. Ett objekt utan känt lager ritas som förut: namn på fria punkter,
// inte på hörn.
export function visualPtShowsLabel(p, layer) {
  // Dolt per objekt med åtgärdsraden "Dölj namn" (Lager-verktyg Etapp 4).
  if (p?.hideLabel === true) return false;
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
    circles: (state.visualCircles || []).filter(c => c.layerId === layerId).length,
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
  for (const l of state.visualLines || []) if (l.layerId === layerId) eps.push(...(l.vertices || []));
  for (const a of state.visualAreas || []) if (a.layerId === layerId) eps.push(...(a.vertices || []));
  for (const ep of eps)
    if (ep?.id) add(`${ep.ref === 'net' ? 'net' : 'visual'}:${ep.id}`, resolveEndpoint(ep, state));
  // Cirklar: hela omkretsen hör till lagrets geometri (polygonens hörn).
  for (const c of state.visualCircles || [])
    if (c.layerId === layerId)
      (visualCircleCoords(c, state) || []).forEach(([E, N], i) => add(`circle:${c.id}:${i}`, { E, N }));
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
  return v ? { E: v.E, N: v.N, H: v.H ?? null } : null;
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

// [[E,N], …] för en polylinje (hörnen i ordning, det första upprepas inte
// när linjen är sluten), eller null om ett hörn saknas eller hörnen är färre
// än två.
export function visualLineCoords(line, state = getState()) {
  const vs = line?.vertices || [];
  if (vs.length < 2) return null;
  const out = [];
  for (const ep of vs) {
    const p = resolveEndpoint(ep, state);
    if (!p) return null;
    out.push([p.E, p.N]);
  }
  return out;
}

/** Segmenten [[E,N],[E,N]] i ordning, med slutsegmentet om linjen är sluten. */
export function lineSegments(coords, closed) {
  if (!coords || coords.length < 2) return [];
  const out = coords.slice(0, -1).map((c, i) => [c, coords[i + 1]]);
  if (closed && coords.length >= 3) out.push([coords[coords.length - 1], coords[0]]);
  return out;
}

export function visualLineSegments(line, state = getState()) {
  const c = visualLineCoords(line, state);
  return c ? lineSegments(c, line.closed === true) : null;
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
export function addVisualPt({ E, N, H = null, color = null, layerId = null,
                              name = null, attrs = null, role = null }) {
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualPts = [], nVid = 1 } = getState();
  const id = `V${nVid}`;
  const pt = { id, layerId: lid, E, N, H: Number.isFinite(H) ? H : null, color: normalizeHexColor(color) };
  // Valfria fält skrivs bara när de har ett värde – en handritad punkt ska se
  // likadan ut i projektfilen som före Etapp 1.
  if (typeof name === 'string' && name !== '') pt.name = name;
  if (attrs && typeof attrs === 'object')      pt.attrs = attrs;
  if (role === 'vertex' || role === 'point')   pt.role = role;
  _commit({ visualPts: [...visualPts, pt], nVid: nVid + 1 });
  return id;
}

// ── Polylinjer ───────────────────────────────────────────────────────────────

const _sameEp = (a, b) => a?.ref === b?.ref && a?.id === b?.id;

// Hörnen städade: giltiga endpoints, inga upprepade grannhörn och – i en
// sluten linje – inte första hörnet upprepat sist. Sluten kräver tre hörn;
// färre ger en öppen linje.
function _normLine(vertices, closed) {
  const vs = [];
  for (const ep of (vertices || []).map(_ep)) if (ep && !_sameEp(vs[vs.length - 1], ep)) vs.push(ep);
  let c = closed === true;
  if (vs.length > 2 && _sameEp(vs[0], vs[vs.length - 1])) { vs.pop(); c = true; }
  return { vertices: vs, closed: c && vs.length >= 3 };
}

/**
 * Skapar en polylinje. vertices är endpoints ({ref,id}) till punkter som redan
 * finns; ritverktyget och importerna skapar hörnpunkterna först. {from, to}
 * är en förkortning för en linje med två hörn. Returnerar id, eller null om
 * färre än två skilda hörn återstår.
 */
export function addVisualLine({ vertices = null, from = null, to = null, closed = false,
                                color = null, layerId = null, name = null }) {
  const n = _normLine(vertices ?? [from, to], closed);
  if (n.vertices.length < 2) return null;
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualLines = [], nVlid = 1 } = getState();
  const id = `VL${nVlid}`;
  const line = { id, layerId: lid, vertices: n.vertices, closed: n.closed,
                 color: normalizeHexColor(color), linkedObsIds: [] };
  if (typeof name === 'string' && name.trim()) line.name = name.trim();
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
  const c = {};
  if ('name' in changes) c.name = typeof changes.name === 'string' ? changes.name.trim() : '';
  if ('color' in changes) c.color = normalizeHexColor(changes.color);
  if ('vertices' in changes || 'closed' in changes) {
    const cur = visualLines.find(l => l.id === id);
    Object.assign(c, _normLine(changes.vertices ?? cur?.vertices, changes.closed ?? cur?.closed));
  }
  if ('layerId' in changes && findVisualLayer(changes.layerId)) c.layerId = changes.layerId;
  if ('hideLabel' in changes) c.hideLabel = changes.hideLabel === true;
  if ('linkedObsIds' in changes)
    c.linkedObsIds = (changes.linkedObsIds || []).filter(x => typeof x === 'string');
  _commit({ visualLines: visualLines.map(l => {
    if (l.id !== id) return l;
    const n = { ...l, ...c };
    if (n.name === '') delete n.name;
    if (n.hideLabel === false) delete n.hideLabel;
    return n;
  }) });
}

// Roller för hinder skapade ur en linje. Båda blockerar sikt likadant –
// hasLineOfSight skiljer inte på dem – men de får olika namn och färg så att
// de går att hålla isär i hinder-listan.
export const LINE_OBSTACLE_ROLES = {
  wall:    { label: 'Vägg',             color: '#8aa8c0' },
  blocker: { label: 'Blockeringslinje', color: '#ef5350' },
};

// Segmenthindrens etiketter: "Vägg (VL3)" för ett segment, annars
// "Vägg (VL3) 2/5". Suffixet tas bort ur en befintlig etikett innan det
// sätts om, när antalet segment ändras.
const _SEG_SUFFIX = / \d+\/\d+$/;
const _segLabel = (base, i, n) => (n === 1 ? base : `${base} ${i + 1}/${n}`);

/**
 * "Använd som vägg" / "Använd som blockeringslinje": ett linjehinder per
 * segment, kopplade till polylinjen via linkedObsIds. Returnerar antalet hinder
 * (0 om linjens hörn inte går att lösa upp). Är linjen redan kopplad händer
 * ingenting.
 */
export function linkVisualLineObstacles(id, role = 'wall') {
  const line = findVisualLine(id);
  if (!line) return 0;
  if (line.linkedObsIds?.length) return line.linkedObsIds.length;
  const segs = visualLineSegments(line);
  if (!segs?.length) return 0;
  const cfg = LINE_OBSTACLE_ROLES[role] || LINE_OBSTACLE_ROLES.wall;
  const base = `${cfg.label} (${id})`;
  const nya = segs.map((points, i) => ({
    type: 'line', label: _segLabel(base, i, segs.length), color: normalizeHexColor(cfg.color),
    source: 'visual', points, id: nextObstacleId(),
  }));
  const { obstacles = [] } = getState();
  setState({ obstacles: [...obstacles, ...nya], selObsId: nya[0].id });
  updateVisualLine(id, { linkedObsIds: nya.map(o => o.id) });
  return nya.length;
}

/**
 * Hörnens namn i egenskapskortets segmenttabell: punktens namn när den har
 * ett (nätpunktens id, en importerad punkts originalnamn), annars hörnets
 * löpnummer i linjen (1, 2, …). En handritad hörnpunkt har bara ett internt
 * id (V17), som inte säger användaren något.
 */
export function lineVertexNames(line, state = getState()) {
  return (line?.vertices || []).map((ep, i) => {
    if (ep.ref === 'net') return ep.id;
    const p = (state.visualPts || []).find(x => x.id === ep.id);
    return p?.name ?? String(i + 1);
  });
}

/**
 * "Slut linjen → yta": en yta med linjens hörn, namn, lager och färg, och
 * linjen tas bort (med sina hinder). Hörnpunkterna delas och tas inte bort.
 * Ångra-steget sparar anroparen. Returnerar ytans id, eller null när linjen
 * har färre än tre hörn.
 */
export function convertLineToArea(id) {
  const line = findVisualLine(id);
  if (!line || (line.vertices || []).length < 3) return null;
  const areaId = addVisualArea({
    vertices: line.vertices, layerId: line.layerId, name: line.name ?? null, color: line.color,
  });
  if (!areaId) return null;
  removeVisualLine(id);
  setState({ selVisualId: areaId });
  return areaId;
}

/** Kopplar loss linjen. Hindren blir fristående och behåller sina koordinater. */
export function unlinkVisualLineObstacles(id) {
  const line = findVisualLine(id);
  if (!line?.linkedObsIds?.length) return false;
  updateVisualLine(id, { linkedObsIds: [] });
  return true;
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
// hörnpunkter när deras linje eller yta försvinner.
function _unusedVisualPtIds(candidates, state = getState()) {
  const used = new Set();
  for (const l of state.visualLines || [])
    for (const ep of l.vertices || []) if (ep?.ref === 'visual') used.add(ep.id);
  for (const a of state.visualAreas || [])
    for (const ep of a.vertices || []) if (ep?.ref === 'visual') used.add(ep.id);
  for (const c of state.visualCircles || []) if (c.center?.ref === 'visual') used.add(c.center.id);
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

// Polylinjen utan hörnen som träff() pekar ut: gapet sluts, upprepade
// grannhörn slås ihop, en sluten linje med färre än tre hörn blir öppen.
// null betyder att färre än två hörn återstår – linjen ska bort.
function _lineWithout(l, träff) {
  if (!(l.vertices || []).some(träff)) return l;
  const n = _normLine(l.vertices.filter(ep => !träff(ep)), l.closed);
  return n.vertices.length < 2 ? null : { ...l, ...n };
}

// Tar bort hörnet ref:id ur alla linjer, enligt _lineWithout. Borttagna
// linjer tar med sig sina hinder; hindren på en ändrad linje följer den nya
// formen (syncLinkedObstacles, via _commit). Returnerar { changed, removed }.
function _dropVertexFromLines(ref, id) {
  const { visualLines = [], selVisualId } = getState();
  const träff = ep => ep?.ref === ref && ep.id === id;
  const changed = [], removed = [], dropObs = [];
  const next = [];
  for (const l of visualLines) {
    const n = _lineWithout(l, träff);
    if (n === l) { next.push(l); continue; }
    if (!n) { removed.push(l.id); dropObs.push(...(l.linkedObsIds || [])); continue; }
    changed.push(l.id);
    next.push(n);
  }
  if (!changed.length && !removed.length) return { changed, removed };
  _commit({ visualLines: next, selVisualId: removed.includes(selVisualId) ? null : selVisualId });
  _removeObstaclesFor(dropObs);
  return { changed, removed };
}

/**
 * Vad händer med linjerna om punkterna ptKeys ('visual:V3', 'net:P1') tas
 * bort? Ren läsning. Linjer i skip räknas inte (de tas bort ändå).
 * @returns {{ linesChanged: object[], linesRemoved: object[] }}
 */
export function linesAfterPointRemoval(ptKeys, state = getState(), skip = new Set()) {
  const keys = new Set(ptKeys);
  const träff = ep => keys.has(`${ep?.ref}:${ep?.id}`);
  const linesChanged = [], linesRemoved = [];
  for (const l of state.visualLines || []) {
    if (skip.has(l.id)) continue;
    const n = _lineWithout(l, träff);
    if (n === l) continue;
    (n ? linesChanged : linesRemoved).push(l);
  }
  return { linesChanged, linesRemoved };
}

// ── Cirklar (Polylinjer Etapp 5) ─────────────────────────────────────────────
// En cirkel lagras exakt: centrum och radie. Centrum är en punkt
// ({ref:'net'|'visual', id} – cirkeln följer punkten) eller en fast
// koordinat ({E, N}). Den ritas och exporteras som en polygon med så många
// hörn att kordan avviker högst bågtoleransen (state/arc-tolerance.js).
// Hörnen börjar i norr och går medurs, som riktningarna i gon.

/** Centrumets läge {E, N, H}, eller null om centrumpunkten saknas. */
export function circleCenter(c, state = getState()) {
  const ce = c?.center;
  if (!ce) return null;
  if (typeof ce.id === 'string') return resolveEndpoint(ce, state);
  return Number.isFinite(ce.E) && Number.isFinite(ce.N) ? { E: ce.E, N: ce.N, H: null } : null;
}

/** Cirkelns polygon [[E,N], …] (utan upprepat sluthörn), eller null. */
export function visualCircleCoords(c, state = getState(), tol = getArcTolerance()) {
  const m = circleCenter(c, state);
  if (!m || !(c.radius > 0)) return null;
  const n = circleVertexCount(c.radius, tol);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    out.push([m.E + c.radius * Math.sin(t), m.N + c.radius * Math.cos(t)]);
  }
  return out;
}

const _center = ce => {
  if (ce && typeof ce.id === 'string') return { ref: ce.ref === 'net' ? 'net' : 'visual', id: ce.id };
  if (ce && Number.isFinite(ce.E) && Number.isFinite(ce.N)) return { E: ce.E, N: ce.N };
  return null;
};

export const getVisualCircles = () => getState().visualCircles || [];
export function findVisualCircle(id) { return getVisualCircles().find(c => c.id === id) || null; }

export function addVisualCircle({ center, radius, layerId = null, name = null, color = null }) {
  const ce = _center(center);
  const r = Number(radius);
  if (!ce || !(r > 0) || !Number.isFinite(r)) return null;
  const lid = (layerId && findVisualLayer(layerId)) ? layerId : ensureActiveVisualLayer();
  const { visualCircles = [], nVcid = 1 } = getState();
  const id = `VC${nVcid}`;
  const circle = { id, layerId: lid, center: ce, radius: r, color: normalizeHexColor(color) };
  if (typeof name === 'string' && name.trim()) circle.name = name.trim();
  _commit({ visualCircles: [...visualCircles, circle], nVcid: nVcid + 1 });
  return id;
}

export function updateVisualCircle(id, changes) {
  const { visualCircles = [] } = getState();
  const c = {};
  if ('name' in changes) c.name = typeof changes.name === 'string' ? changes.name.trim() : '';
  if ('color' in changes) c.color = normalizeHexColor(changes.color);
  if ('radius' in changes && Number(changes.radius) > 0) c.radius = Number(changes.radius);
  if ('center' in changes && _center(changes.center)) c.center = _center(changes.center);
  if ('layerId' in changes && findVisualLayer(changes.layerId)) c.layerId = changes.layerId;
  if ('hideLabel' in changes) c.hideLabel = changes.hideLabel === true;
  _commit({ visualCircles: visualCircles.map(o => {
    if (o.id !== id) return o;
    const n = { ...o, ...c };
    if (n.name === '') delete n.name;
    if (n.hideLabel === false) delete n.hideLabel;
    return n;
  }) });
}

/** Tar bort cirkeln. Centrumpunkten rörs inte. */
export function removeVisualCircle(id) {
  const { visualCircles = [], selVisualId } = getState();
  if (!visualCircles.some(c => c.id === id)) return;
  _commit({
    visualCircles: visualCircles.filter(c => c.id !== id),
    selVisualId: selVisualId === id ? null : selVisualId,
  });
}

// Centrumpunkten ref:id försvinner: cirklarna behåller sitt läge som en fast
// koordinat. Anropas medan punkten finns. Returnerar antalet cirklar.
function _freezeCircleCenters(ref, id, state = getState()) {
  const träff = c => c.center?.ref === ref && c.center?.id === id;
  const berörda = (state.visualCircles || []).filter(träff);
  if (!berörda.length) return 0;
  setState({ visualCircles: state.visualCircles.map(c => {
    if (!träff(c)) return c;
    const m = circleCenter(c, state);
    return m ? { ...c, center: { E: m.E, N: m.N } } : c;
  }) });
  return berörda.length;
}

/**
 * "Gör om till polylinje": en sluten polylinje med cirkelns hörn (enligt
 * bågtoleransen), namn, lager och färg; cirkeln tas bort. Ångra-steget sparar
 * anroparen. Returnerar linjens id.
 */
export function convertCircleToLine(id, tol = getArcTolerance()) {
  const c = findVisualCircle(id);
  const coords = c && visualCircleCoords(c, getState(), tol);
  if (!coords) return null;
  const vertices = coords.map(([E, N]) =>
    makeEndpoint('visual', addVisualPt({ E, N, layerId: c.layerId, role: 'vertex' })));
  const lineId = addVisualLine({ vertices, closed: true, layerId: c.layerId, name: c.name ?? null, color: c.color });
  removeVisualCircle(id);
  setState({ selVisualId: lineId });
  return lineId;
}

const anchoredCircle = id => c => c.center?.ref === 'net' && c.center.id === id;

// ── Åtgärder på en markering (Lager-verktyg Etapp 4) ─────────────────────────
// Varje funktion tar en lista med id:n (punkter, linjer och ytor blandat) och
// går genom samma mutationer som enskilda objekt, så att kopplade hinder
// städas och syncLinkedObstacles körs. Ångra-steget sparar anroparen, en gång
// för hela markeringen.

// Hörnpunkter (role 'vertex', ref 'visual') som linjerna och ytorna använder.
function _vertexPtIdsOf(lines, areas, state = getState()) {
  const vertex = new Set((state.visualPts || []).filter(p => p.role === 'vertex').map(p => p.id));
  const ids = new Set();
  for (const l of lines) for (const ep of l.vertices || []) if (ep?.ref === 'visual' && vertex.has(ep.id)) ids.add(ep.id);
  for (const a of areas) for (const ep of a.vertices || []) if (ep?.ref === 'visual' && vertex.has(ep.id)) ids.add(ep.id);
  return [...ids];
}

/**
 * Tar bort markerade punkter, linjer och ytor. Linjernas och ytornas egna
 * hörnpunkter tas bort när inget annat använder dem; nätpunkter aldrig.
 * En markerad fri punkt som är hörn i en linje tas ur linjen (som när en
 * punkt tas bort ensam). Linjer som då får färre än två hörn tas bort och
 * räknas i extraLines; linjer som bara tappar hörnet i changedLines.
 */
export function removeVisualObjects(ids) {
  const set = new Set(ids || []);
  const st = getState();
  const areas = (st.visualAreas || []).filter(a => set.has(a.id));
  const lines = (st.visualLines || []).filter(l => set.has(l.id));
  const pts   = (st.visualPts   || []).filter(p => set.has(p.id) && p.role !== 'vertex');
  const circles = (st.visualCircles || []).filter(c => set.has(c.id));
  const följd = linesAfterPointRemoval(pts.map(p => `visual:${p.id}`), st, set);
  const hörn = _vertexPtIdsOf(lines, [], st);

  circles.forEach(c => removeVisualCircle(c.id));
  areas.forEach(a => removeVisualArea(a.id));
  lines.forEach(l => removeVisualLine(l.id));
  pts.forEach(p => removeVisualPt(p.id));

  const finns = new Set((getState().visualPts || []).map(p => p.id));
  const bort = new Set(_unusedVisualPtIds(hörn.filter(id => finns.has(id))));
  if (bort.size) _commit({ visualPts: getState().visualPts.filter(p => !bort.has(p.id)) });
  return { pts: pts.length, lines: lines.length, areas: areas.length, circles: circles.length,
           extraLines: följd.linesRemoved.length, changedLines: följd.linesChanged.length };
}

/**
 * Flyttar markerade objekt till lagret layerId. Linjernas och ytornas
 * hörnpunkter följer med när alla objekt som använder hörnet flyttas – ett
 * delat hörn stannar hos det som inte flyttas.
 */
export function moveVisualToLayer(ids, layerId) {
  if (!findVisualLayer(layerId)) return 0;
  const set = new Set(ids || []);
  const st = getState();
  const lines = (st.visualLines || []).filter(l => set.has(l.id));
  const areas = (st.visualAreas || []).filter(a => set.has(a.id));
  const moved = new Set([...lines, ...areas].map(o => o.id));
  const användare = new Map();   // hörn-id → objekt som använder det
  const noter = (o, eps) => eps.forEach(ep => {
    if (ep?.ref !== 'visual') return;
    if (!användare.has(ep.id)) användare.set(ep.id, []);
    användare.get(ep.id).push(o.id);
  });
  for (const l of st.visualLines || []) noter(l, l.vertices || []);
  for (const a of st.visualAreas || []) noter(a, a.vertices || []);
  const följer = new Set(_vertexPtIdsOf(lines, areas, st)
    .filter(id => (användare.get(id) || []).every(o => moved.has(o))));

  let n = 0;
  const flytta = o => { n++; return { ...o, layerId }; };
  _commit({
    visualPts: (st.visualPts || []).map(p =>
      (set.has(p.id) && p.role !== 'vertex') ? flytta(p) : följer.has(p.id) ? { ...p, layerId } : p),
    visualLines: (st.visualLines || []).map(l => set.has(l.id) ? flytta(l) : l),
    visualAreas: (st.visualAreas || []).map(a => set.has(a.id) ? flytta(a) : a),
    visualCircles: (st.visualCircles || []).map(c => set.has(c.id) ? flytta(c) : c),
  });
  return n;
}

/**
 * Döljer (true) eller visar (false) namnen på markerade objekt: fria
 * punkters namn, ytors namn och area, och hörnnamnen i markerade linjer och
 * ytor. Lagrets inställningar gäller fortfarande – ett dolt lager eller ett
 * lager med namnen släckta visar inget, oavsett objektets flagga.
 */
export function setVisualLabelsHidden(ids, hidden) {
  const set = new Set(ids || []);
  const st = getState();
  const lines = (st.visualLines || []).filter(l => set.has(l.id));
  const areas = (st.visualAreas || []).filter(a => set.has(a.id));
  const pts = new Set([
    ...(st.visualPts || []).filter(p => set.has(p.id) && p.role !== 'vertex').map(p => p.id),
    ..._vertexPtIdsOf(lines, areas, st),
  ]);
  const sätt = o => {
    const n = { ...o };
    if (hidden) n.hideLabel = true; else delete n.hideLabel;
    return n;
  };
  _commit({
    visualPts:   (st.visualPts   || []).map(p => pts.has(p.id) ? sätt(p) : p),
    visualLines: (st.visualLines || []).map(l => set.has(l.id) ? sätt(l) : l),
    visualAreas: (st.visualAreas || []).map(a => set.has(a.id) ? sätt(a) : a),
    visualCircles: (st.visualCircles || []).map(c => set.has(c.id) ? sätt(c) : c),
  });
}

/** Har någon av de markerade något namn som syns i dag? För knapptexten. */
export function anyVisualLabelShown(ids, state = getState()) {
  const set = new Set(ids || []);
  const lines = (state.visualLines || []).filter(l => set.has(l.id));
  const areas = (state.visualAreas || []).filter(a => set.has(a.id));
  const pts = new Set([
    ...(state.visualPts || []).filter(p => set.has(p.id) && p.role !== 'vertex').map(p => p.id),
    ..._vertexPtIdsOf(lines, areas, state),
  ]);
  return (state.visualPts || []).some(p => pts.has(p.id) && p.hideLabel !== true)
      || areas.some(a => a.hideLabel !== true)
      || (state.visualCircles || []).some(c => set.has(c.id) && c.hideLabel !== true);
}

// ── Nätpunkter som linjer och ytor hänger i ──────────────────────────────────
// Anropas av punktdialogen (ui/modals.js) när en nätpunkt byter namn eller tas
// bort, så att visuella linjer och ytor följer med.

/** Nätpunkten oldId heter nu newId: flytta alla {ref:'net'}-referenser. */
export function renameNetPointInVisual(oldId, newId) {
  const { visualLines = [], visualAreas = [], visualCircles = [] } = getState();
  const remap = ep => (ep?.ref === 'net' && ep.id === oldId) ? { ...ep, id: newId } : ep;
  setState({
    visualLines: visualLines.map(l => ({ ...l, vertices: (l.vertices || []).map(remap) })),
    visualAreas: visualAreas.map(a => ({ ...a, vertices: (a.vertices || []).map(remap) })),
    visualCircles: visualCircles.map(c => ({ ...c, center: remap(c.center) })),
  });
}

/**
 * Vad som händer med de visuella objekten om nätpunkten id tas bort – för
 * bekräftelsedialogen. Ren läsning, ändrar ingenting.
 *   linesChanged: linjer som tappar hörnet och sluter gapet
 *   linesRemoved: linjer som får färre än två hörn och tas bort helt
 *   areasChanged: ytor som tappar hörnet men har minst tre kvar
 *   areasRemoved: ytor som får färre än tre hörn och tas bort helt
 *   obstacles:    kopplade hinder som försvinner med de borttagna objekten
 */
export function netPointVisualImpact(id, state = getState()) {
  const anchored = ep => ep?.ref === 'net' && ep.id === id;
  const { linesChanged, linesRemoved } = linesAfterPointRemoval([`net:${id}`], state);
  const areasChanged = [], areasRemoved = [];
  for (const a of state.visualAreas || []) {
    const kvar = (a.vertices || []).filter(ep => !anchored(ep)).length;
    if (kvar === (a.vertices || []).length) continue;
    (kvar < 3 ? areasRemoved : areasChanged).push(a);
  }
  const obstacles = linesRemoved.reduce((n, l) => n + (l.linkedObsIds?.length || 0), 0)
    + areasRemoved.filter(x => x.linkedObsId).length;
  // Cirklar med punkten som centrum behåller sitt läge som fast koordinat.
  const circlesFrozen = (state.visualCircles || []).filter(anchoredCircle(id));
  return { linesChanged, linesRemoved, areasChanged, areasRemoved, circlesFrozen, obstacles };
}

/**
 * Nätpunkten id tas bort. Linjer tappar hörnet och sluter gapet; en linje med
 * färre än två hörn kvar tas bort med sina hinder. Ytor tappar hörnet; en yta
 * med färre än tre hörn kvar tas bort. Returnerar vad som hände, för dialogen.
 * Anropas INNAN punkten tas bort ur pts – kopplade hinder synkas då mot den
 * nya formen.
 */
export function dropNetPointFromVisual(id) {
  const circles = _freezeCircleCenters('net', id);
  const lines = _dropVertexFromLines('net', id);
  const areas = _dropVertexFromAreas('net', id);
  return { lines: lines.removed.length, linesChanged: lines.changed.length,
           areasChanged: areas.changed.length, areasRemoved: areas.removed.length, circlesFrozen: circles };
}

// Tar bort en visuell punkt. Linjer och ytor tappar hörnet och sluter gapet;
// en linje med färre än två hörn kvar, eller en yta med färre än tre, tas bort.
// Returnerar antalet linjer som togs bort.
export function removeVisualPt(id) {
  // Linjerna och ytorna först, medan punkten finns: annars ser
  // syncLinkedObstacles ett oupplösligt hörn och kastar hindret i stället för
  // att följa den nya formen.
  _freezeCircleCenters('visual', id);
  _dropVertexFromAreas('visual', id);
  const lines = _dropVertexFromLines('visual', id);
  const { visualPts = [], selVisualId } = getState();
  _commit({
    visualPts:   visualPts.filter(p => p.id !== id),
    selVisualId: selVisualId === id ? null : selVisualId,
  });
  return lines.removed.length;
}

// Tar bort en visuell linje med dess kopplade hinder – hindren är en
// projektion av linjen och har ingen egen existens – och de hörnpunkter
// (role 'vertex') som bara den använde. Nätpunkter och fria punkter rörs inte.
export function removeVisualLine(id) {
  const { visualLines = [], visualPts = [], selVisualId } = getState();
  const line = visualLines.find(l => l.id === id);
  if (!line) return;
  _commit({
    visualLines: visualLines.filter(l => l.id !== id),
    selVisualId: selVisualId === id ? null : selVisualId,
  });
  _removeObstaclesFor(line.linkedObsIds || []);
  const hörn = (line.vertices || []).filter(ep => ep.ref === 'visual').map(ep => ep.id)
    .filter(pid => visualPts.find(p => p.id === pid)?.role === 'vertex');
  const bort = new Set(_unusedVisualPtIds(hörn));
  if (bort.size) _commit({ visualPts: getState().visualPts.filter(p => !bort.has(p.id)) });
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

// Projicerar varje kopplad visuell linje och yta på sina hinder. Körs efter
// varje mutation av det visuella lagret, när en nätpunkt flyttas och efter
// laddning från fil. Kopplingar vars källa eller hinder försvunnit städas bort;
// en yta vars hinder raderats i hinder-panelen blockerar inte längre sikt.
//
// En polylinje har ett linjehinder per segment (linkedObsIds, i ordning).
// Raderas ett av dem i hinder-panelen kopplas linjen loss och de övriga
// segmenthindren tas bort – en vägg med ett hål som ingen bett om vore värre.
// Ändras antalet segment (ett hörn tas bort, linjen sluts) läggs hinder till
// eller tas bort sist i gruppen, med samma färg och etikettens grund.
export function syncLinkedObstacles() {
  const state  = getState();
  const lines  = state.visualLines || [];
  const areas  = state.visualAreas || [];
  const linkedLines = lines.filter(l => l.linkedObsIds?.length);
  const linkedAreas = areas.filter(a => a.linkedObsId);
  if (!linkedLines.length && !linkedAreas.length) return;

  const obstacles = state.obstacles || [];
  const obsById   = new Map(obstacles.map(o => [o.id, o]));

  const dropObs   = new Set();   // hinder vars källa inte längre går att lösa upp
  const clearLine = new Set();   // linjer vars hinder inte finns kvar
  const clearArea = new Set();   // ytor vars hinder inte finns kvar
  const newPoints = new Map();   // obsId → uppdaterade koordinater
  const newLabel  = new Map();   // obsId → ny etikett (antalet segment ändrat)
  const insertAfter = new Map(); // obsId → nya segmenthinder som följer det
  const relink    = new Map();   // linje-id → nya linkedObsIds

  const samePoints = (p, coords) => Array.isArray(p) && p.length === coords.length
    && coords.every((c, i) => p[i]?.[0] === c[0] && p[i]?.[1] === c[1]);
  const setPoints = (obsId, coords) => {
    if (!samePoints(obsById.get(obsId).points, coords)) newPoints.set(obsId, coords);
  };

  for (const l of linkedLines) {
    const ids = l.linkedObsIds;
    // Ett segmenthinder raderat i hinder-panelen: linjen styr inget längre.
    if (ids.some(id => !obsById.has(id))) {
      ids.forEach(id => dropObs.add(id)); clearLine.add(l.id); continue;
    }
    const segs = visualLineSegments(l, state);
    // Källan går inte att lösa upp (ett hörn är borta). Projektionen har
    // inget att spegla och tas bort i stället för att bli ett spökhinder.
    if (!segs?.length) { ids.forEach(id => dropObs.add(id)); clearLine.add(l.id); continue; }
    if (segs.length === ids.length) { ids.forEach((id, i) => setPoints(id, segs[i])); continue; }

    const mall = obsById.get(ids[0]);
    const base = String(mall.label || '').replace(_SEG_SUFFIX, '');
    const kvar = ids.slice(0, segs.length);
    ids.slice(segs.length).forEach(id => dropObs.add(id));
    const nya = segs.slice(kvar.length).map((points, j) => ({
      type: 'line', label: _segLabel(base, kvar.length + j, segs.length),
      color: mall.color ?? null, source: 'visual', points, id: nextObstacleId(),
    }));
    kvar.forEach((id, i) => { setPoints(id, segs[i]); newLabel.set(id, _segLabel(base, i, segs.length)); });
    if (nya.length) insertAfter.set(kvar[kvar.length - 1], nya);
    relink.set(l.id, [...kvar, ...nya.map(o => o.id)]);
  }
  for (const a of linkedAreas) {
    if (!obsById.has(a.linkedObsId)) { clearArea.add(a.id); continue; }
    const coords = visualAreaCoords(a, state);
    if (!coords) { dropObs.add(a.linkedObsId); clearArea.add(a.id); continue; }
    setPoints(a.linkedObsId, coords);
  }

  if (!dropObs.size && !clearLine.size && !clearArea.size && !newPoints.size
      && !newLabel.size && !relink.size) return;

  const patch = {};
  if (dropObs.size || newPoints.size || newLabel.size || insertAfter.size) {
    patch.obstacles = obstacles.filter(o => !dropObs.has(o.id)).flatMap(o => {
      let n = o;
      if (newPoints.has(o.id)) n = { ...n, points: newPoints.get(o.id) };
      if (newLabel.has(o.id) && n.label !== newLabel.get(o.id)) n = { ...n, label: newLabel.get(o.id) };
      return insertAfter.has(o.id) ? [n, ...insertAfter.get(o.id)] : [n];
    });
  }
  if (clearLine.size || relink.size) {
    patch.visualLines = lines.map(l => clearLine.has(l.id) ? { ...l, linkedObsIds: [] }
      : relink.has(l.id) ? { ...l, linkedObsIds: relink.get(l.id) } : l);
  }
  if (clearArea.size) {
    patch.visualAreas = areas.map(a => clearArea.has(a.id)
      ? { ...a, linkedObsId: null, blocksSight: false } : a);
  }
  if (dropObs.has(state.selObsId)) patch.selObsId = null;
  setState(patch);
}

// ── Laddning från fil ────────────────────────────────────────────────────────

// Versionen av det visuella lagrets modell i projektfil och autosparning.
// 2 = polylinjer och H: null för saknad höjd. Saknas fältet är filen äldre:
// linjerna är segment som slås ihop och H = 0 betydde "ingen höjd".
export const VISUAL_MODEL_VERSION = 2;

// Saneras vid laddning: färger normaliseras, endpoints får giltig ref, och
// objekt utan användbara fält kastas hellre än ritas fel. Linjer i den äldre
// formen {from, to} blir polylinjer med två hörn; sammanslagningen sker först
// när lagren är kända (_mergeLegacyLines).
export function _sanitizeVisual(visualPts, visualLines) {
  const pts = (visualPts || [])
    .filter(p => p && typeof p.id === 'string' && Number.isFinite(p.E) && Number.isFinite(p.N))
    .map(p => {
      const out = {
        id: p.id,
        layerId: typeof p.layerId === 'string' ? p.layerId : null,
        E: p.E, N: p.N, H: Number.isFinite(p.H) ? p.H : null,
        color: normalizeHexColor(p.color),
      };
      if (typeof p.name === 'string' && p.name !== '')    out.name  = p.name;
      if (p.attrs && typeof p.attrs === 'object')         out.attrs = p.attrs;
      if (p.role === 'vertex' || p.role === 'point')      out.role  = p.role;
      if (p.hideLabel === true)                           out.hideLabel = true;
      return out;
    });

  const lines = [];
  for (const l of visualLines || []) {
    if (!l || typeof l.id !== 'string') continue;
    const legacy = !Array.isArray(l.vertices);
    let vertices, closed, linkedObsIds;
    if (legacy) {
      // Ett segment kräver båda ändpunkterna, som förut.
      if (!_ep(l.from) || !_ep(l.to)) continue;
      vertices = [_ep(l.from), _ep(l.to)];
      closed = false;
      linkedObsIds = typeof l.linkedObsId === 'string' ? [l.linkedObsId] : [];
    } else {
      vertices = l.vertices.map(_ep).filter(Boolean);
      if (vertices.length < 2) continue;
      closed = l.closed === true && vertices.length >= 3;
      linkedObsIds = (Array.isArray(l.linkedObsIds) ? l.linkedObsIds : [])
        .filter(x => typeof x === 'string');
    }
    const out = {
      id: l.id,
      layerId: typeof l.layerId === 'string' ? l.layerId : null,
      vertices, closed,
      color: normalizeHexColor(l.color),
      linkedObsIds,
    };
    if (typeof l.name === 'string' && l.name.trim()) out.name = l.name.trim();
    if (l.hideLabel === true) out.hideLabel = true;
    lines.push(out);
  }

  return { visualPts: pts, visualLines: lines };
}

/**
 * Slår ihop segment ur en äldre fil (en linje per segment) till polylinjer.
 * Körs efter _migrateVisualLayers, så att lagren är kända. Regler:
 *   - Segment hör ihop när de delar en ändpunkt – samma ref och id, inte bara
 *     samma koordinater. Ett segment får vändas för att passa i kedjan.
 *   - Bara inom samma lager och med samma färg. Ett segment kopplat till ett
 *     hinder, med namn eller med dolt namn slås aldrig ihop: varje sådant
 *     segment har sina egna egenskaper.
 *   - Där tre eller fler segment möts i en punkt bryts kedjan. Alla segment
 *     räknas, också de som inte får slås ihop och de i andra lager: en
 *     förgrening är en förgrening, vilken linje den än tillhör.
 *   - En kedja som sluter sig blir en sluten polylinje (inte en yta).
 *   - Polylinjen får id:t från segmentet med lägst nummer, genomlöps i det
 *     segmentets riktning och hamnar på dess plats i listan. En sluten kedja
 *     börjar i det segmentets from.
 * Ren funktion – indata ändras inte.
 */
export function _mergeLegacyLines(lines) {
  const key = ep => `${ep.ref}:${ep.id}`;
  const nr = id => { const m = /^VL(\d+)$/.exec(id); return m ? Number(m[1]) : Infinity; };
  const list = lines || [];

  const total = new Map();
  for (const l of list) for (const ep of l.vertices) total.set(key(ep), (total.get(key(ep)) || 0) + 1);

  const mergeable = l => l.vertices.length === 2 && !l.closed && !l.linkedObsIds?.length
    && !l.hideLabel && !l.name && key(l.vertices[0]) !== key(l.vertices[1]);

  const out = [];   // { idx, line }
  const groups = new Map();
  list.forEach((l, idx) => {
    if (!mergeable(l)) { out.push({ idx, line: l }); return; }
    const g = `${l.layerId}|${l.color ?? ''}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ idx, line: l });
  });

  for (const edges of groups.values()) {
    const adj = new Map();
    for (const e of edges) for (const ep of e.line.vertices) {
      if (!adj.has(key(ep))) adj.set(key(ep), []);
      adj.get(key(ep)).push(e);
    }
    const inre = k => total.get(k) === 2 && adj.get(k).length === 2;
    const other = (e, k) => (key(e.line.vertices[0]) === k ? e.line.vertices[1] : e.line.vertices[0]);
    const used = new Set();
    edges.sort((a, b) => (nr(a.line.id) - nr(b.line.id)) || (a.idx - b.idx));

    for (const e of edges) {
      if (used.has(e)) continue;
      used.add(e);
      const chain = [e];
      const vs = [...e.line.vertices];
      let closed = false;
      // Framåt i segmentets riktning.
      while (inre(key(vs[vs.length - 1]))) {
        const k = key(vs[vs.length - 1]);
        const next = adj.get(k).find(x => !used.has(x));
        if (!next) break;
        used.add(next); chain.push(next);
        const o = other(next, k);
        if (key(o) === key(vs[0])) { closed = true; break; }
        vs.push(o);
      }
      // Bakåt från första hörnet.
      while (!closed && inre(key(vs[0]))) {
        const k = key(vs[0]);
        const next = adj.get(k).find(x => !used.has(x));
        if (!next) break;
        used.add(next); chain.push(next);
        vs.unshift(other(next, k));
      }
      // Två segment fram och tillbaka mellan samma punkter är ingen ring.
      if (closed && vs.length < 3) { chain.forEach(c => out.push(c)); continue; }
      out.push({ idx: e.idx, line: { ...e.line, vertices: vs, closed } });
    }
  }
  return out.sort((a, b) => a.idx - b.idx).map(o => o.line);
}

/**
 * Det visuella lagret ur en projektfil eller autosparning: sanering,
 * lagermigrering och – för filer sparade före polylinjerna – sammanslagning
 * av segment och H = 0 → null på de visuella punkterna. Nätpunkter rörs inte.
 * @param {object} s  filens innehåll
 */
export function _loadVisual(s) {
  const äldre = !(Number(s?.visualVer) >= VISUAL_MODEL_VERSION);
  const sanitized = _sanitizeVisual(s?.visualPts, s?.visualLines);
  const pts = äldre
    ? sanitized.visualPts.map(p => (p.H === 0 ? { ...p, H: null } : p))
    : sanitized.visualPts;
  const r = _migrateVisualLayers(pts, sanitized.visualLines,
                                 s?.visualLayers, s?.activeVisualLayerId,
                                 _sanitizeVisualAreas(s?.visualAreas),
                                 _sanitizeVisualCircles(s?.visualCircles));
  if (äldre) r.visualLines = _mergeLegacyLines(r.visualLines);
  return r;
}

// Cirklar ur en fil (Etapp 5). Saknas fältet – äldre filer – finns inga
// cirklar. En cirkel utan giltigt centrum eller med radie ≤ 0 kastas.
export function _sanitizeVisualCircles(list) {
  return (Array.isArray(list) ? list : [])
    .filter(c => c && typeof c.id === 'string' && _center(c.center) && Number(c.radius) > 0)
    .map(c => {
      const out = {
        id: c.id,
        layerId: typeof c.layerId === 'string' ? c.layerId : null,
        center: _center(c.center),
        radius: Number(c.radius),
        color: normalizeHexColor(c.color),
      };
      if (typeof c.name === 'string' && c.name.trim()) out.name = c.name.trim();
      if (c.hideLabel === true) out.hideLabel = true;
      return out;
    });
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
      if (a.hideLabel === true) out.hideLabel = true;
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
                                     visualAreas = [], visualCircles = []) {
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
  const circles = [...(visualCircles || [])];
  const known = new Set(layers.map(l => l.id));
  const orphan = o => !(typeof o.layerId === 'string' && known.has(o.layerId));

  let nVlyid = _nextCounter(layers, 'VLY');

  if (pts.some(orphan) || lines.some(orphan) || areas.some(orphan) || circles.some(orphan)) {
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
    for (const o of circles) if (orphan(o)) o.layerId = fallback.id;
  }

  const active = (typeof activeVisualLayerId === 'string' && known.has(activeVisualLayerId))
    ? activeVisualLayerId : (layers[0]?.id ?? null);

  return { visualPts: pts, visualLines: lines, visualAreas: areas, visualCircles: circles, visualLayers: layers,
           activeVisualLayerId: active, nVlyid };
}
