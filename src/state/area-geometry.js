// Plangeometri för visuella ytor (Lager-verktyg Etapp 3).
//
// Rena funktioner på [[E,N], …] – koordinatsystemets projektionsplan, samma
// koordinater som resten av NätSim räknar i. Ingen skalfaktor eller
// höjdreduktion: ytan är en planyta, och det står "(plan)" vid varje värde.
//
// Polygonen anges utan upprepat sluthörn; kanten sista → första är implicit.
// Hör inte till src/core/ – ytorna är visuella och deltar aldrig i beräkningen.

const EPS = 1e-12;   // nollarea vid tyngdpunkten

/** Area med tecken (skosnöresformeln): positiv moturs, negativ medurs. */
export function signedArea(c) {
  if (!c.length) return 0;
  // Relativt första hörnet: produkter av sjusiffriga koordinater (~4·10¹³)
  // tappar annars millimeterdecimalerna.
  const [ox, oy] = c[0];
  let s = 0;
  for (let i = 0, n = c.length; i < n; i++) {
    const x1 = c[i][0] - ox, y1 = c[i][1] - oy;
    const x2 = c[(i + 1) % n][0] - ox, y2 = c[(i + 1) % n][1] - oy;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Absolut area – samma för medurs och moturs. */
export const polygonArea = c => Math.abs(signedArea(c));

/** Omkrets inklusive den slutande kanten. */
export function polygonPerimeter(c) {
  let s = 0;
  for (let i = 0, n = c.length; i < n; i++) {
    const [x1, y1] = c[i], [x2, y2] = c[(i + 1) % n];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// Kryssprodukten är translationsoberoende men skalar med kantlängderna, så
// toleransen för "på linjen" gör det också (≈ 1e-9 rad). Ett absolut epsilon
// vore antingen meningslöst litet eller – med sjusiffriga koordinater – grovt.
const REL = 1e-9;
const sgn = (v, tol) => (Math.abs(v) <= tol ? 0 : Math.sign(v));
const within = (p, a, b, tol) =>
  Math.min(a[0], b[0]) - tol <= p[0] && p[0] <= Math.max(a[0], b[0]) + tol &&
  Math.min(a[1], b[1]) - tol <= p[1] && p[1] <= Math.max(a[1], b[1]) + tol;

/** Skär eller berör sträckorna ab och cd varandra (inklusive kollinjär överlapp)? */
export function segmentsTouch(a, b, c, d) {
  const L = Math.max(len(a, b), len(c, d), 1e-12);
  const tol = REL * L * L;
  const s1 = sgn(cross(c, d, a), tol), s2 = sgn(cross(c, d, b), tol);
  const s3 = sgn(cross(a, b, c), tol), s4 = sgn(cross(a, b, d), tol);
  if (s1 * s2 < 0 && s3 * s4 < 0) return true;
  const t = REL * L;
  if (s1 === 0 && within(a, c, d, t)) return true;
  if (s2 === 0 && within(b, c, d, t)) return true;
  if (s3 === 0 && within(c, a, b, t)) return true;
  if (s4 === 0 && within(d, a, b, t)) return true;
  return false;
}

// Grannkanterna o→a och o→b delar hörnet o. De korsar bara om de ligger på
// samma linje och pekar åt samma håll – den andra kanten vänder tillbaka
// längs den första.
function backtracks(o, a, b) {
  const la = len(o, a), lb = len(o, b);
  if (la === 0 || lb === 0) return true;
  const kollinjär = Math.abs(cross(o, a, b)) <= REL * la * lb;
  const sammaHåll = (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]) > 0;
  return kollinjär && sammaHåll;
}

/**
 * Är polygonen självkorsande? Två kanter som inte är grannar får inte röra
 * varandra; två grannkanter får bara dela sitt gemensamma hörn (en kant som
 * vänder tillbaka längs den förra räknas som självkorsning). Ett hörn som
 * förekommer två gånger ger också true – polygonen nuddar sig själv.
 * O(n²), vilket räcker för handritade och importerade ytor.
 */
export function isSelfIntersecting(c) {
  const n = c.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (c[i][0] === c[j][0] && c[i][1] === c[j][1]) return true;

  for (let i = 0; i < n; i++) {
    const a = c[i], b = c[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const p = c[j], q = c[(j + 1) % n];
      if (j === i + 1)            { if (backtracks(b, a, q)) return true; continue; }
      if (i === 0 && j === n - 1) { if (backtracks(a, b, p)) return true; continue; }
      if (segmentsTouch(a, b, p, q)) return true;
    }
  }
  return false;
}

/** Tyngdpunkt (areaviktad). Faller tillbaka på hörnens medelvärde vid nollarea. */
export function polygonCentroid(c) {
  const n = c.length;
  if (!n) return null;
  // Räkna relativt första hörnet – sjusiffriga koordinater i kvadrat tappar
  // annars precision.
  const [ox, oy] = c[0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const x1 = c[i][0] - ox, y1 = c[i][1] - oy;
    const x2 = c[(i + 1) % n][0] - ox, y2 = c[(i + 1) % n][1] - oy;
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < EPS) {
    const m = c.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / n, m[1] / n];
  }
  return [ox + cx / (3 * a), oy + cy / (3 * a)];
}

/**
 * Allt egenskapskortet behöver. area är null när polygonen är självkorsande
 * eller har färre än tre hörn – då finns ingen meningsfull area att visa.
 */
export function areaStats(coords) {
  const n = coords?.length || 0;
  if (n < 3) return { n, area: null, perimeter: n === 2 ? polygonPerimeter(coords) : 0,
                      selfIntersecting: false, tooFew: true };
  const selfIntersecting = isSelfIntersecting(coords);
  return {
    n,
    area: selfIntersecting ? null : polygonArea(coords),
    perimeter: polygonPerimeter(coords),
    selfIntersecting,
    tooFew: false,
  };
}

// ── Formatering ──────────────────────────────────────────────────────────────
// Svensk talform: decimalkomma och hårt mellanslag som tusentalsavgränsare, så
// att "1 214" inte bryts över två rader.
const NBSP = String.fromCharCode(0xa0);

export function groupThousands(value, decimals) {
  const [int, dec] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (value < 0 ? '−' : '') + grouped + (dec ? ',' + dec : '');
}

/** "1 214 m² (plan)". Decimaler efter storlek: under 10 m² två, under 1 000 en. */
export function formatPlanArea(m2) {
  if (m2 === null || m2 === undefined || !Number.isFinite(m2)) return '–';
  const d = m2 < 10 ? 2 : m2 < 1000 ? 1 : 0;
  return `${groupThousands(m2, d)}${NBSP}m² (plan)`;
}

/** "142,35 m (plan)". */
export function formatPlanLength(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '–';
  return `${groupThousands(m, m < 1000 ? 2 : 1)}${NBSP}m (plan)`;
}
