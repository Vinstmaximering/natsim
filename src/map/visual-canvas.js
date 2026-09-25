// Canvasrendering av det visuella lagret.
// Stilen är medvetet skild från nätpunkter och mätningar: ihåliga cirklar och
// streckade linjer, så att visuella objekt aldrig förväxlas med mätdata.
// Tar kart-hjälpfunktioner som parameter för att undvika cirkulär import.
import { visualLineSegments, visualAreaCoords, visualObjColor, isVisualObjVisible, visualPtLabel,
         visualPtShowsLabel } from '../state/visual.js';
import { areaStats, polygonCentroid, formatPlanArea } from '../state/area-geometry.js';
import { hexToRgba } from '../core/colors.js';

const DASH = [7, 5];

// Färgen kommer ur objektet, annars ur dess lager (Etapp 1).
export const visualColor = (obj, state) => visualObjColor(obj, state);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state      - hela state (behövs för att slå upp endpoints)
 * @param {{map, ENtoLatLng, symSize:number}} helpers
 *
 * Punktnamnen styrs per lager (labels / vertexLabels), inte av Visa-menyns
 * Etiketter – den gäller nätets punkter. Se state/visual.js.
 */
export function drawVisualLayer(ctx, state, helpers) {
  const { map, ENtoLatLng, symSize = 10 } = helpers;
  if (!map) return;

  // Dolda lager ritas inte alls – synlighet per lager ersatte kryssrutan #tgv.
  const pts   = (state.visualPts   || []).filter(p => isVisualObjVisible(p, state));
  const lines = (state.visualLines || []).filter(l => isVisualObjVisible(l, state));
  const areas = (state.visualAreas || []).filter(a => isVisualObjVisible(a, state));
  if (!pts.length && !lines.length && !areas.length) return;

  const sel = state.selVisualId;
  // Markering med Markera område (Etapp 4): accentfärgad gloria runt objektet.
  const marked = new Set(state.visualSelection || []);
  const HALO = 'rgba(79,195,247,0.55)';
  const layerById = new Map((state.visualLayers || []).map(l => [l.id, l]));
  const xy  = (E, N) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  };

  const r = Math.max(3, Math.min(9, symSize * 0.45));

  ctx.save();

  // ── Ytor (under linjer och punkter) ──
  for (const area of areas) {
    const coords = visualAreaCoords(area, state);
    if (!coords) continue;
    const px = coords.map(([E, N]) => xy(E, N));
    const col = visualColor(area, state);
    const isSel = area.id === sel;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(px[0].x, px[0].y);
      for (const p of px.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    };

    path();
    ctx.fillStyle = hexToRgba(col, area.fillOpacity ?? 0.25) || col;
    ctx.fill();
    if (area.pattern === 'hatch' || area.pattern === 'grid') drawPattern(ctx, px, path, col, area.pattern);

    path();
    ctx.strokeStyle = col;
    ctx.lineWidth = isSel ? 3 : 1.6;
    ctx.stroke();
    if (isSel || marked.has(area.id)) {
      path();
      ctx.strokeStyle = marked.has(area.id) ? HALO : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Namn och area i tyngdpunkten, när lagrets namn är tända och ytans namn
    // inte dolts. En självkorsande yta har ingen area – där står en varning.
    const layer = layerById.get(area.layerId);
    if (layer?.labels !== false && area.hideLabel !== true) {
      const st = areaStats(coords);
      const c  = polygonCentroid(coords);
      const p  = xy(c[0], c[1]);
      const rader = [area.name, st.selfIntersecting ? '⚠ självkorsande' : formatPlanArea(st.area)]
        .filter(Boolean);
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      rader.forEach((t, i) => {
        const y = p.y + (i - (rader.length - 1) / 2) * 12;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(7,13,24,0.7)';
        ctx.strokeText(t, p.x, y);
        ctx.fillStyle = st.selfIntersecting && i === rader.length - 1 ? '#ffb74d' : col;
        ctx.fillText(t, p.x, y);
      });
    }
  }

  // ── Linjer (streckade) ──
  // Varje segment stryks för sig, så att streckmönstret börjar om vid varje
  // hörn – precis som när varje segment var en egen linje. En polylinje som
  // migrerats från segment ser då exakt likadan ut.
  for (const line of lines) {
    const segs = visualLineSegments(line, state);
    if (!segs?.length) continue;
    const px = segs.map(([p, q]) => [xy(p[0], p[1]), xy(q[0], q[1])]);
    const isSel = line.id === sel;
    const col = visualColor(line, state);

    ctx.strokeStyle = col;
    ctx.lineWidth   = isSel ? 3 : 1.8;
    ctx.setLineDash(DASH);
    for (const [a, b] of px) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Kopplad till hinder → liten markör mitt på varje segment (ett hinder
    // per segment).
    if (line.linkedObsIds?.length) {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;
      for (const [a, b] of px) ctx.fillText('▨', (a.x + b.x) / 2, (a.y + b.y) / 2);
    }

    if (isSel || marked.has(line.id)) {
      ctx.beginPath();
      for (const [a, b] of px) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.strokeStyle = marked.has(line.id) ? HALO : 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = 6;
      ctx.stroke();
    }
  }

  // ── Punkter (ihåliga cirklar) ──
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const p of pts) {
    const c = xy(p.E, p.N);
    const isSel = p.id === sel;
    const col = visualColor(p, state);

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,13,24,0.55)';   // svag botten så ringen syns mot kartan
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth   = isSel ? 3 : 2;
    ctx.stroke();

    if (isSel || marked.has(p.id)) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = marked.has(p.id) ? HALO : 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = marked.has(p.id) ? 3 : 1.5;
      ctx.stroke();
    }

    // Fria punkter följer lagrets labels, hörn lagrets vertexLabels (förval
    // av – en polygonkontur med ett hundratal "01"/"02" över sig är oläsbar).
    // Etiketten visar originalnamnet ur importfilen när det finns, annars id:t.
    if (visualPtShowsLabel(p, layerById.get(p.layerId))) {
      const label = visualPtLabel(p);
      ctx.font = '10px monospace';
      ctx.lineWidth   = 3;
      ctx.strokeStyle = 'rgba(7,13,24,0.7)';
      ctx.strokeText(label, c.x + r + 3, c.y - r);
      ctx.fillStyle = col;
      ctx.fillText(label, c.x + r + 3, c.y - r);
    }
  }

  ctx.restore();
}

// Mönster i ytan: snedstreck eller rutnät med 8 px mellanrum i skärmen, så
// att det ser likadant ut på alla zoomnivåer.
function drawPattern(ctx, px, path, col, pattern) {
  const xs = px.map(p => p.x), ys = px.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const STEG = 8;
  ctx.save();
  path();
  ctx.clip();
  ctx.beginPath();
  if (pattern === 'hatch') {
    for (let k = x0 - (y1 - y0); k <= x1; k += STEG) { ctx.moveTo(k, y1); ctx.lineTo(k + (y1 - y0), y0); }
  } else {
    for (let x = x0; x <= x1; x += STEG) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += STEG) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  }
  ctx.strokeStyle = hexToRgba(col, 0.9) || col;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

// ── Hit-test ────────────────────────────────────────────────────────────────

const PT_HIT_PX   = 10;
const LINE_HIT_PX = 8;

// Objekt i dolda lager går inte att träffa: det som inte syns ska inte heller
// gå att markera eller dra i.
export function hitTestVisualPt(px, py, state, map, ENtoLatLng) {
  for (const p of state.visualPts || []) {
    if (!isVisualObjVisible(p, state)) continue;
    const c = map.latLngToContainerPoint(ENtoLatLng(p.E, p.N));
    if (Math.hypot(c.x - px, c.y - py) <= PT_HIT_PX) return p;
  }
  return null;
}

// Avståndet i pixlar från (px,py) till segmentet a–b.
function segDistPx(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 < 1 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Träff på något av polylinjens segment ger hela polylinjen.
export function hitTestVisualLine(px, py, state, map, ENtoLatLng) {
  const pix = ([E, N]) => map.latLngToContainerPoint(ENtoLatLng(E, N));
  for (const line of state.visualLines || []) {
    if (!isVisualObjVisible(line, state)) continue;
    const segs = visualLineSegments(line, state);
    if (segs?.some(([p, q]) => segDistPx(px, py, pix(p), pix(q)) <= LINE_HIT_PX)) return line;
  }
  return null;
}

// Träff inuti ytan eller inom LINE_HIT_PX från en kant. Ytor provas sist –
// punkter och linjer ligger ovanpå och ska gå att träffa inuti en yta.
export function hitTestVisualArea(px, py, state, map, ENtoLatLng) {
  const areas = (state.visualAreas || []).filter(a => isVisualObjVisible(a, state));
  // Senast ritade ytan ligger överst.
  for (let k = areas.length - 1; k >= 0; k--) {
    const coords = visualAreaCoords(areas[k], state);
    if (!coords) continue;
    const pts = coords.map(([E, N]) => map.latLngToContainerPoint(ENtoLatLng(E, N)));
    let inne = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inne = !inne;
      if (segDistPx(px, py, a, b) <= LINE_HIT_PX) return areas[k];
    }
    if (inne) return areas[k];
  }
  return null;
}
