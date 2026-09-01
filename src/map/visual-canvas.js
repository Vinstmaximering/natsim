// Canvasrendering av det visuella lagret.
// Stilen är medvetet skild från nätpunkter och mätningar: ihåliga cirklar och
// streckade linjer, så att visuella objekt aldrig förväxlas med mätdata.
// Tar kart-hjälpfunktioner som parameter för att undvika cirkulär import.
import { VISUAL_DEFAULT_COLOR, visualLineCoords } from '../state/visual.js';

const DASH = [7, 5];

export const visualColor = obj => obj?.color || VISUAL_DEFAULT_COLOR;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state      - hela state (behövs för att slå upp endpoints)
 * @param {{map, ENtoLatLng, symSize:number, showLabels:boolean}} helpers
 */
export function drawVisualLayer(ctx, state, helpers) {
  const { map, ENtoLatLng, symSize = 10, showLabels = true } = helpers;
  if (!map) return;

  const pts   = state.visualPts   || [];
  const lines = state.visualLines || [];
  if (!pts.length && !lines.length) return;

  const sel = state.selVisualId;
  const xy  = (E, N) => {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  };

  const r = Math.max(3, Math.min(9, symSize * 0.45));

  ctx.save();

  // ── Linjer (streckade) ──
  for (const line of lines) {
    const coords = visualLineCoords(line, state);
    if (!coords) continue;
    const a = xy(coords[0][0], coords[0][1]);
    const b = xy(coords[1][0], coords[1][1]);
    const isSel = line.id === sel;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = visualColor(line);
    ctx.lineWidth   = isSel ? 3 : 1.8;
    ctx.setLineDash(DASH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Kopplad till ett hinder → liten markör mitt på linjen.
    if (line.linkedObsId) {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = visualColor(line);
      ctx.fillText('▨', (a.x + b.x) / 2, (a.y + b.y) / 2);
    }

    if (isSel) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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
    const col = visualColor(p);

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,13,24,0.55)';   // svag botten så ringen syns mot kartan
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth   = isSel ? 3 : 2;
    ctx.stroke();

    if (isSel) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    if (showLabels) {
      ctx.font = '10px monospace';
      ctx.lineWidth   = 3;
      ctx.strokeStyle = 'rgba(7,13,24,0.7)';
      ctx.strokeText(p.id, c.x + r + 3, c.y - r);
      ctx.fillStyle = col;
      ctx.fillText(p.id, c.x + r + 3, c.y - r);
    }
  }

  ctx.restore();
}

// ── Hit-test ────────────────────────────────────────────────────────────────

const PT_HIT_PX   = 10;
const LINE_HIT_PX = 8;

export function hitTestVisualPt(px, py, state, map, ENtoLatLng) {
  for (const p of state.visualPts || []) {
    const c = map.latLngToContainerPoint(ENtoLatLng(p.E, p.N));
    if (Math.hypot(c.x - px, c.y - py) <= PT_HIT_PX) return p;
  }
  return null;
}

export function hitTestVisualLine(px, py, state, map, ENtoLatLng) {
  for (const line of state.visualLines || []) {
    const coords = visualLineCoords(line, state);
    if (!coords) continue;
    const a = map.latLngToContainerPoint(ENtoLatLng(coords[0][0], coords[0][1]));
    const b = map.latLngToContainerPoint(ENtoLatLng(coords[1][0], coords[1][1]));
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) {
      if (Math.hypot(px - a.x, py - a.y) <= LINE_HIT_PX) return line;
      continue;
    }
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    if (Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)) <= LINE_HIT_PX) return line;
  }
  return null;
}
