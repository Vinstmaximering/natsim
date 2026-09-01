// Canvasrendering av hinder (polygoner och linjer).
// Tar kart-hjälpfunktioner som parameter för att undvika cirkulär import.
// Skalning av outline/handtag följer samma formel som drawPt i leaflet-setup.js.
import { hexToRgba } from '../state/obstacles.js';

// Etapp B: hinder utan obs.color ritas med exakt samma färger som tidigare.
// Med färg satt används den för både kontur och (för polygoner) fyllning.
const DEF_STROKE     = 'rgba(40,40,40,0.8)';
const DEF_STROKE_SEL = 'rgba(255,140,0,0.9)';
const DEF_FILL       = 'rgba(80,80,80,0.35)';
const DEF_FILL_SEL   = 'rgba(255,140,0,0.18)';

export function obstacleStroke(obs, isSel) {
  return hexToRgba(obs?.color, isSel ? 1 : 0.85) || (isSel ? DEF_STROKE_SEL : DEF_STROKE);
}

export function obstacleFill(obs, isSel) {
  return hexToRgba(obs?.color, isSel ? 0.3 : 0.25) || (isSel ? DEF_FILL_SEL : DEF_FILL);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  obstacles  - från state.obstacles
 * @param {string} selObsId   - valt hinder-id eller null
 * @param {{map, ENtoLatLng, mppAtCenter, symSize: number}} helpers
 */
export function drawObstacles(ctx, obstacles, selObsId, helpers) {
  const { map, ENtoLatLng, mppAtCenter, symSize, dragSnapTarget } = helpers;
  if (!map || !obstacles || obstacles.length === 0) return;

  // Skala handleradius och linjebredd som drawPt (sym-lock ignoreras för hinder)
  const mpp = mppAtCenter();
  const baseR = symSize * 0.5 + symSize * 0.5 * (1 / Math.max(0.2, mpp * 0.5));
  const handleR = Math.max(3, Math.min(8, baseR * 0.55));
  const lineW   = Math.max(1.5, Math.min(3.5, baseR * 0.18));

  function xyOf([E, N]) {
    const p = map.latLngToContainerPoint(ENtoLatLng(E, N));
    return { x: p.x, y: p.y };
  }

  for (const obs of obstacles) {
    if (!obs.points || obs.points.length < 2) continue;
    const pts = obs.points.map(xyOf);
    const isSel = obs.id === selObsId;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

    if (obs.type === 'polygon') {
      ctx.closePath();
      ctx.fillStyle   = obstacleFill(obs, isSel);
      ctx.fill();
      ctx.strokeStyle = obstacleStroke(obs, isSel);
      ctx.lineWidth   = isSel ? lineW + 0.8 : lineW;
      ctx.stroke();
    } else {
      // line-typ: bara stroke
      ctx.strokeStyle = obstacleStroke(obs, isSel);
      ctx.lineWidth   = isSel ? lineW + 0.8 : lineW;
      ctx.stroke();
    }

    // Hörn-handtag för valt hinder (vita cirklar med svart border)
    if (isSel) {
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, handleR, 0, Math.PI * 2);
        ctx.fillStyle   = 'white';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }
    }
  }

  // Snap-indikator under hörn-drag (grön ring + punkt, identisk med ritnings-preview)
  if (dragSnapTarget) {
    const p = map.latLngToContainerPoint(ENtoLatLng(dragSnapTarget.E, dragSnapTarget.N));
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
  }
}
