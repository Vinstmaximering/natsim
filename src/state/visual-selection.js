// Markering av visuella objekt med rektangel (Lager-verktyg Etapp 4).
//
// Rena funktioner. Rektangeln är i skärmpixlar; project(E,N) → {x,y} är
// kartans projektion, så att samma regler gäller på alla zoomnivåer.
//
//   Dra vänster → höger ('window'):   objekt som ligger HELT inuti.
//   Dra höger → vänster ('crossing'): objekt som ligger inuti ELLER korsas.
//
// Markerbart: fria visuella punkter, visuella linjer och ytor i tända lager.
// Hörnpunkter (role 'vertex') hör till sin linje eller yta och markeras med
// den, inte för sig. Nätpunkter, mätningar och hinder markeras inte i den här
// versionen – de ingår i beräkningen och har egna verktyg.
import { visualLineCoords, visualAreaCoords, isVisualObjVisible, lineSegments,
         visualCircleCoords } from './visual.js';

/** Dragriktningen avgör läget. Ingen horisontell rörelse räknas som 'window'. */
export const modeFromDrag = (x0, x1) => (x1 < x0 ? 'crossing' : 'window');

/**
 * Hur urvalet kombineras med den befintliga markeringen.
 * Skift lägger till, Ctrl/Cmd tar bort, annars ersätts markeringen.
 * touchOp är pekskärmens växlare (Ny/Lägg till/Ta bort), som gäller när
 * ingen modifierare är nedtryckt.
 */
export function opFromEvent(e, touchOp = 'replace') {
  if (e?.shiftKey) return 'add';
  if (e?.ctrlKey || e?.metaKey) return 'remove';
  return touchOp;
}

export function applySelection(current, ids, op) {
  if (op === 'add')    return [...new Set([...(current || []), ...ids])];
  if (op === 'remove') { const bort = new Set(ids); return (current || []).filter(id => !bort.has(id)); }
  return [...new Set(ids)];
}

const norm = r => ({
  x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1),
  y0: Math.min(r.y0, r.y1), y1: Math.max(r.y0, r.y1),
});
const inside = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function segSeg(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x)
                       && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b))
      || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}
function rectEdges(r) {
  const p = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
  return p.map((q, i) => [q, p[(i + 1) % 4]]);
}
const segHitsRect = (a, b, r) => inside(a, r) || inside(b, r) || rectEdges(r).some(([c, d]) => segSeg(a, b, c, d));
function pointInPoly(p, poly) {
  let inne = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

/**
 * Id:n på de objekt som rektangeln väljer, i ordningen punkter, linjer, ytor.
 * @param {object} state
 * @param {{x0,y0,x1,y1}} rect  skärmpixlar
 * @param {'window'|'crossing'} mode
 * @param {(E:number,N:number)=>{x:number,y:number}} project
 */
export function objectsInRect(state, rect, mode, project) {
  const r = norm(rect);
  const out = [];
  const synlig = o => isVisualObjVisible(o, state);

  for (const p of state.visualPts || []) {
    if (p.role === 'vertex' || !synlig(p)) continue;
    if (inside(project(p.E, p.N), r)) out.push(p.id);
  }

  // En polylinje markeras hel: window kräver alla hörn inuti, crossing att
  // något segment ligger i eller korsar rektangeln.
  for (const l of state.visualLines || []) {
    if (!synlig(l)) continue;
    const c = visualLineCoords(l, state);
    if (!c) continue;
    const poly = c.map(([E, N]) => project(E, N));
    const träff = mode === 'window'
      ? poly.every(p => inside(p, r))
      : lineSegments(poly.map(p => [p.x, p.y]), l.closed === true)
          .some(([p, q]) => segHitsRect({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }, r));
    if (träff) out.push(l.id);
  }

  for (const ar of state.visualAreas || []) {
    if (!synlig(ar)) continue;
    const c = visualAreaCoords(ar, state);
    if (!c) continue;
    const poly = c.map(([E, N]) => project(E, N));
    let träff;
    if (mode === 'window') träff = poly.every(p => inside(p, r));
    else {
      träff = poly.some(p => inside(p, r))
        || poly.some((p, i) => segHitsRect(p, poly[(i + 1) % poly.length], r))
        // Rektangeln helt inuti ytan korsar ingen kant men ligger i ytan.
        || pointInPoly({ x: r.x0, y: r.y0 }, poly);
    }
    if (träff) out.push(ar.id);
  }

  // Cirklar (Polylinjer Etapp 5): som en sluten linje; en rektangel helt
  // inuti cirkeln korsar den inte.
  for (const c of state.visualCircles || []) {
    if (!synlig(c)) continue;
    const coords = visualCircleCoords(c, state);
    if (!coords) continue;
    const poly = coords.map(([E, N]) => project(E, N));
    const träff = mode === 'window'
      ? poly.every(p => inside(p, r))
      : poly.some(p => inside(p, r)) || poly.some((p, i) => segHitsRect(p, poly[(i + 1) % poly.length], r));
    if (träff) out.push(c.id);
  }
  return out;
}

/** Antal per typ bland id:na, räknat mot det som finns och syns. */
export function selectionSummary(state, ids) {
  const set = new Set(ids || []);
  const synlig = o => isVisualObjVisible(o, state);
  const pts   = (state.visualPts   || []).filter(o => set.has(o.id) && o.role !== 'vertex' && synlig(o));
  const lines = (state.visualLines || []).filter(o => set.has(o.id) && synlig(o));
  const areas = (state.visualAreas || []).filter(o => set.has(o.id) && synlig(o));
  const circles = (state.visualCircles || []).filter(o => set.has(o.id) && synlig(o));
  return { pts, lines, areas, circles, total: pts.length + lines.length + areas.length + circles.length,
           ids: [...pts, ...lines, ...areas, ...circles].map(o => o.id) };
}
