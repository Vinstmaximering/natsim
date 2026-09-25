// Verktyget Offset (O) och förhandsvisningen av offset (Polylinjer Etapp 4).
//
// Verktyget: klicka en linje eller yta (eller markera den först och tryck O)
// → avstånd, sida och hörn i rutan (ui/offset-panel.js) → streckad
// förhandsvisning medan värdet ändras → Enter eller Skapa. Esc eller högerklick släpper vald linje; utan vald linje
// lämnar Esc verktyget. Samma förhandsvisning används av offset-delen i
// linjens och ytans egenskapskort.
//
// Förhandsvisningen räknas om vid varje omritning ur aktuellt state, så att
// den följer källan. En sida med problem (självkorsning, för stort avstånd)
// ritas röd.
//
// Cirkulär import med leaflet-setup.js är OK – alla värden används i
// funktioner, aldrig vid modul-initialisering.
import { map, ENtoLatLng } from './leaflet-setup.js';
import { getState } from '../state/store.js';
import { buildOffsets, offsetSource } from '../state/offset.js';
import { hitTestVisualLine, hitTestVisualArea } from './visual-canvas.js';

let _tool = false;
let _source = null;               // verktygets valda linje eller yta
let _preview = null;              // { owner:'tool'|'card', sourceId, params }

export const isOffsetTool = () => _tool;
export const getOffsetToolSource = () => _source;

/** source: en redan markerad linje eller yta, som då blir verktygets val direkt. */
export function startOffsetTool(source = null) { _tool = true; _source = source; clearOffsetPreview('tool'); }
export function cancelOffsetTool() { _tool = false; _source = null; clearOffsetPreview('tool'); }

/** Esc: släpper vald linje. Returnerar false när ingen var vald. */
export function releaseOffsetSource() {
  if (!_source) return false;
  _source = null;
  clearOffsetPreview('tool');
  return true;
}

/** Klick i verktyget: väljer linjen eller ytan under klicket (eller ingenting). */
export function handleOffsetClick(latlng) {
  if (!map) return null;
  const p = map.latLngToContainerPoint(latlng);
  const st = getState();
  const hit = hitTestVisualLine(p.x, p.y, st, map, ENtoLatLng) || hitTestVisualArea(p.x, p.y, st, map, ENtoLatLng);
  _source = hit?.id ?? null;
  if (!_source) clearOffsetPreview('tool');
  return _source;
}

/** Visar förhandsvisningen för källan med parametrarna. */
export function setOffsetPreview(owner, sourceId, params) {
  _preview = sourceId ? { owner, sourceId, params: { ...params } } : null;
}

/** Tar bort förhandsvisningen, om den tillhör owner (eller alltid utan owner). */
export function clearOffsetPreview(owner = null) {
  if (_preview && (!owner || _preview.owner === owner)) _preview = null;
}

export const getOffsetPreview = () => (_preview ? { ..._preview } : null);

export function drawOffsetPreview(ctx) {
  if (!map) return;
  const px = ([E, N]) => map.latLngToContainerPoint(ENtoLatLng(E, N));
  // Verktygets valda källa markeras, också innan förhandsvisningen finns.
  if (_tool && _source) {
    const src = offsetSource(_source);
    if (src?.coords) {
      ctx.save();
      ctx.beginPath();
      src.coords.map(px).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (src.closed) ctx.closePath();
      ctx.strokeStyle = 'rgba(77,208,225,0.45)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    }
  }
  if (!_preview) return;
  const { results } = buildOffsets(_preview.sourceId, _preview.params, getState());
  ctx.save();
  for (const r of results) {
    if (r.coords.length < 2) continue;
    ctx.beginPath();
    r.coords.map(px).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (r.closed) ctx.closePath();
    ctx.strokeStyle = r.problem ? '#ff5050' : '#4dd0e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}
