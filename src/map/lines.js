// Mätlinje-rendering sker i leaflet-setup.js draw() för att undvika cirkulärt import.
// Denna fil exporterar rColor/rLabel (används av UI-paneler för konsistens) och
// drawBlockedSuggestions för Fas 3 siktlinje-visualisering.
export { rColor, rLabel } from '../core/redundancy.js';

/**
 * Ritar röd streckad linje för varje mät-par blockerat av siktlinje-hinder.
 * Anropas från draw() i leaflet-setup.js när tgb-checkbox är på.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{from:string,to:string}>} blockedPairs
 * @param {Array<{id:string,E:number,N:number}>} pts
 * @param {Function} ptPixel  – konverterar {E,N} → {x,y} canvas-koordinater
 */
export function drawBlockedSuggestions(ctx, blockedPairs, pts, ptPixel) {
  if (!blockedPairs || blockedPairs.length === 0) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.70)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([5, 5]);

  for (const pair of blockedPairs) {
    const p1 = pts.find(p => p.id === pair.from);
    const p2 = pts.find(p => p.id === pair.to);
    if (!p1 || !p2) continue;
    const px1 = ptPixel(p1), px2 = ptPixel(p2);
    ctx.beginPath();
    ctx.moveTo(px1.x, px1.y);
    ctx.lineTo(px2.x, px2.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}
