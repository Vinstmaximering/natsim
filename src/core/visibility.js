// Siktlinjeberäkningar för NätSim – fristående modul utan externa beroenden

const ENDPOINT_TOL = 0.01; // meter – snap-tolerans mot byggnadshörn

/**
 * 2D segment-intersektionstest med parametrisk form och kors-produkt.
 * Ref: Gareth Rees, "Intersection of two line segments in 2-D"
 *
 *   P(t) = p1 + t·(p2−p1),   0 ≤ t ≤ 1
 *   Q(u) = p3 + u·(p4−p3),   0 ≤ u ≤ 1
 *
 *   t = (q−p)×s / (r×s),   u = (q−p)×r / (r×s)
 *   där r = p2−p1, s = p4−p3, × = 2D-kors-produkt (skalär)
 *
 * Endpoint-tolerans: skärning inom ENDPOINT_TOL m från något hörn
 * räknas ej som intersektioner (hanterar station/mål snap till hörn).
 *
 * @param {[number,number]} p1
 * @param {[number,number]} p2
 * @param {[number,number]} p3
 * @param {[number,number]} p4
 * @returns {{intersects: boolean, point?: [number,number], t?: number}}
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const rE = p2[0] - p1[0], rN = p2[1] - p1[1];
  const sE = p4[0] - p3[0], sN = p4[1] - p3[1];

  // r × s  (z-komponent av 3D-kors-produkten)
  const rxs = rE * sN - rN * sE;

  if (Math.abs(rxs) < 1e-10) return { intersects: false }; // parallella

  const qpE = p3[0] - p1[0], qpN = p3[1] - p1[1];

  const t = (qpE * sN - qpN * sE) / rxs; // parameter längs p1-p2
  const u = (qpE * rN - qpN * rE) / rxs; // parameter längs p3-p4

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    const iE = p1[0] + t * rE;
    const iN = p1[1] + t * rN;

    // Endpoint-tolerans: ignorera snappning mot hörn
    for (const ep of [p1, p2, p3, p4]) {
      const dE = iE - ep[0], dN = iN - ep[1];
      if (dE * dE + dN * dN < ENDPOINT_TOL * ENDPOINT_TOL) {
        return { intersects: false };
      }
    }

    return { intersects: true, point: [iE, iN], t };
  }

  return { intersects: false };
}

/**
 * Avgör om en punkt är inuti en polygon med ray-casting-algoritmen.
 * Punkter på polygonkanten returnerar true (dokumenterat val).
 * Ref: W. Randolph Franklin, "PNPOLY", 1987
 *
 * @param {[number,number]|{E:number,N:number}} point
 * @param {Array<[number,number]|{E:number,N:number}>} polygonPoints
 * @returns {boolean}
 */
export function pointInPolygon(point, polygonPoints) {
  const px = Array.isArray(point) ? point[0] : point.E;
  const py = Array.isArray(point) ? point[1] : point.N;
  const n = polygonPoints.length;
  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygonPoints[i], pj = polygonPoints[j];
    const xi = Array.isArray(pi) ? pi[0] : pi.E;
    const yi = Array.isArray(pi) ? pi[1] : pi.N;
    const xj = Array.isArray(pj) ? pj[0] : pj.E;
    const yj = Array.isArray(pj) ? pj[1] : pj.N;

    // Explicit kant-test: punkt på kantlinje → true
    const dx = xj - xi, dy = yj - yi;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 1e-20) {
      // dist² från punkt till linjen = cross² / lenSq
      const cross = (px - xi) * dy - (py - yi) * dx;
      if (cross * cross <= 1e-20 * lenSq) {
        // Kolinjär – kolla att projektionen faller inom segmentet
        const dot = (px - xi) * dx + (py - yi) * dy;
        if (dot >= 0 && dot <= lenSq) return true;
      }
    }

    // Ray-casting: stråle i +E-riktningen
    if ((yi > py) !== (yj > py)) {
      if (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }

  return inside;
}

/**
 * Snabbt överlappningstest (separating axis theorem för AABB).
 *
 * @param {{minE:number,maxE:number,minN:number,maxN:number}} box1
 * @param {{minE:number,maxE:number,minN:number,maxN:number}} box2
 * @returns {boolean}
 */
export function boundingBoxOverlap(box1, box2) {
  return !(box1.maxE < box2.minE || box2.maxE < box1.minE ||
           box1.maxN < box2.minN || box2.maxN < box1.minN);
}

/**
 * Beräknar bounding box för en lista av punkter.
 *
 * @param {Array<[number,number]|{E:number,N:number}>} points
 * @returns {{minE:number,maxE:number,minN:number,maxN:number}}
 */
export function computeBoundingBox(points) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of points) {
    const e = Array.isArray(p) ? p[0] : p.E;
    const n = Array.isArray(p) ? p[1] : p.N;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }
  return { minE, maxE, minN, maxN };
}

/**
 * Beräknar om det finns fri sikt mellan två punkter givet en lista hinder.
 *
 * Obstacle-datamodell:
 *   { id: string, type: 'polygon'|'line', points: [[E,N], ...] }
 *   polygon – 3+ punkter (t.ex. byggnadskontur, slutet område)
 *   line    – exakt 2 punkter (t.ex. vägg, staket)
 *
 * Algoritm per hinder:
 *   1. Bounding-box-test (pre-filter) – skip om hindrets BB ej överlappar
 *      siktlinjens BB.  obs.points åtkomst sker BARA EN GÅNG om skip.
 *   2. Polygon: kontrollera om from/to är inuti + kant-mot-kant-test.
 *   3. Line: kant-mot-kant-test mot det enda segmentet.
 *
 * @param {[number,number]|{E:number,N:number}} from
 * @param {[number,number]|{E:number,N:number}} to
 * @param {Array<{id:string,type:string,points:Array}>} obstacles
 * @returns {{visible:boolean, blockedBy?:string}}
 */
export function hasLineOfSight(from, to, obstacles) {
  const pFrom = Array.isArray(from) ? from : [from.E, from.N];
  const pTo   = Array.isArray(to)   ? to   : [to.E,   to.N];

  const sightBB = computeBoundingBox([pFrom, pTo]);

  for (const obs of obstacles) {
    // Steg 1: bounding-box pre-filter (obs.points åtkomst nr 1)
    if (!boundingBoxOverlap(sightBB, computeBoundingBox(obs.points))) continue;

    // Steg 2+: precis test (obs.points åtkomst nr 2)
    const pts = obs.points;

    if (obs.type === 'polygon') {
      if (pointInPolygon(pFrom, pts) || pointInPolygon(pTo, pts)) {
        return { visible: false, blockedBy: obs.id };
      }
      const n = pts.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        if (segmentIntersection(pFrom, pTo, pts[j], pts[i]).intersects) {
          return { visible: false, blockedBy: obs.id };
        }
      }
    } else if (obs.type === 'line') {
      if (segmentIntersection(pFrom, pTo, pts[0], pts[1]).intersects) {
        return { visible: false, blockedBy: obs.id };
      }
    }
  }

  return { visible: true };
}
