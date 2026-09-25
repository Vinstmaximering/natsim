// Bågtolerans (Polylinjer Etapp 5): hur tätt bågar och cirklar delas i hörn.
//
// En gemensam inställning för rundade offsethörn och cirklar: kordan mellan
// två hörn får avvika högst toleransen från den verkliga bågen. 1 mm är
// förval; 5 och 10 mm ger färre hörn vid stora radier. Sparas per användare
// (localStorage), som snappningen. En cirkel lagras exakt (centrum och radie)
// – toleransen styr bara hur den ritas och exporteras.
const KEY = 'natsim_arc_tol';

export const ARC_TOLERANCES = [
  { value: 0.001, label: '1 mm' },
  { value: 0.005, label: '5 mm' },
  { value: 0.010, label: '10 mm' },
];
export const ARC_TOLERANCE_DEFAULT = 0.001;

const giltig = v => ARC_TOLERANCES.some(t => t.value === v);

function _load() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return giltig(v) ? v : ARC_TOLERANCE_DEFAULT;
  } catch { return ARC_TOLERANCE_DEFAULT; }
}
let _tol = _load();

/** Vald tolerans i meter. */
export const getArcTolerance = () => _tol;

export function setArcTolerance(v) {
  const n = Number(v);
  if (!giltig(n)) return _tol;
  _tol = n;
  try { localStorage.setItem(KEY, String(n)); } catch { /* privat läge m.m. */ }
  return _tol;
}

/** För tester: läs om inställningen ur localStorage. */
export function _reloadArcTolerance() { _tol = _load(); }

/** Vinkelsteget (rad) för en båge med radien r, så att kordan avviker högst tol. */
export function arcStep(r, tol = _tol) {
  if (!(r > tol)) return Math.PI / 2;
  return 2 * Math.acos(1 - tol / r);
}

/** Antal hörn för en hel cirkel med radien r (minst 8). */
export function circleVertexCount(r, tol = _tol) {
  return Math.max(8, Math.ceil((2 * Math.PI) / arcStep(r, tol)));
}

/** <select> med toleranserna, för offsetrutan och cirkeldialogen. */
export function arcToleranceSelectHtml(cls = 'arc-tol') {
  return `<select class="${cls}" title="Bågtolerans: kordans största avvikelse från bågen. Gäller rundade hörn och cirklar; sparas för dig.">
    ${ARC_TOLERANCES.map(t => `<option value="${t.value}" ${t.value === _tol ? 'selected' : ''}>${t.label}</option>`).join('')}
  </select>`;
}
