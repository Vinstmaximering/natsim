// Canvasrendering av hinder (polygoner och linjer).
// Tar kart-hjälpfunktioner som parameter för att undvika cirkulär import.
// Skalning av outline/handtag följer samma formel som drawPt i leaflet-setup.js.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  obstacles  - från state.obstacles
 * @param {string} selObsId   - valt hinder-id eller null
 * @param {{map, ENtoLatLng, mppAtCenter, symSize: number}} helpers
 */
export function drawObstacles(ctx, obstacles, selObsId, helpers) {
  const { map, ENtoLatLng, mppAtCenter, symSize } = helpers;
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
      ctx.fillStyle   = isSel ? 'rgba(255,140,0,0.18)' : 'rgba(80,80,80,0.35)';
      ctx.fill();
      ctx.strokeStyle = isSel ? 'rgba(255,140,0,0.9)' : 'rgba(40,40,40,0.8)';
      ctx.lineWidth   = isSel ? lineW + 0.8 : lineW;
      ctx.stroke();
    } else {
      // line-typ: bara stroke
      ctx.strokeStyle = isSel ? 'rgba(255,140,0,0.9)' : 'rgba(40,40,40,0.8)';
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
}
