// ─────────────────────────────────────────────────────────────────────────────
// OBEROENDE REFERENS – Gauss-Markov-utjämning i VINKELparametrisering (mgon)
//
// Skriven från grunden ur standardteorin. Importerar INGENTING från src/core/
// och INGENTING från tests/ref.mjs. Syftet är att stå på egna ben: om den
// bågmeterparameteriserade kärnan och den bågmeterparameteriserade ref.mjs
// båda bär samma fel, ska den här filen ändå ge rätt svar, eftersom den aldrig
// multiplicerar riktningsraden med d.
//
// Förankring:
//   HMK-Stommätning 2024 Bilaga C.1.1  u(φ) = √[(A/√n)² + (C/L·ρ)²]   [mgon]
//   HMK-Stommätning 2024 Bilaga C.1.2  u(L) = √[(A + B·L)² + C²]      [mm]
//   HMK-Stommätning 2024 Formel F.6    k_i (individuellt redundanstal), Σk_i = f
//   Härledning (ej citat): k_i = diag(R), R = Q_vv·P = I − A(AᵀPA)⁻¹AᵀP
//
// Obekantvektor: [E_j, N_j] i METER för varje fri punkt, följt av
//                [z_k] i MGON för varje uppställning med riktningsobservation.
//
// Riktningsobservation φ_ik = t_ik − z_i, t = atan2(ΔE, ΔN):
//   ∂t/∂E_k = +ΔN/d²   ∂t/∂N_k = −ΔE/d²   [rad/m]
//   ∂φ/∂z_i = −1                          [mgon/mgon]
// I mgon per meter: koefficienten = ρ · (azimutens partial), ρ = 200000/π.
// ─────────────────────────────────────────────────────────────────────────────

const RHO = 200000 / Math.PI;   // mgon per radian

function uPhiMgon(A_mgon, nSats, C_mm, L_m) {           // HMK C.1.1
  return Math.hypot(A_mgon / Math.sqrt(nSats), (C_mm / 1000) / L_m * RHO);
}
function uLmm(A_mm, B_ppm, L_m, C_mm) {                 // HMK C.1.2
  return Math.hypot(A_mm + B_ppm * L_m * 1e-3, C_mm);
}

function inv(M) {
  const n = M.length;
  const a = M.map((r, i) => [...r, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let mx = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[mx][c])) mx = r;
    [a[c], a[mx]] = [a[mx], a[c]];
    if (Math.abs(a[c][c]) < 1e-14) return null;
    const p = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map(r => r.slice(n));
}

/**
 * @param orientPartial  ∂φ/∂z i vinkelparametriseringen; tal eller funktion av
 *                       siktlängden d. Referensvärdet är alltid −1.
 *
 *   Parametern finns för att kunna återskapa den bågmeterskalade radens
 *   modellfel inuti den här formuleringen. En bågmeterrad är vinkelraden × d
 *   (och σ_arc = d·σ_rad), och r_i är invariant under radskalning. Sätts
 *   orienteringsledet felaktigt till −1 i bågmeterraden blir raden
 *   [d·c_koord …, −1], vilket dividerat med d är [c_koord …, −1/d]. Alltså:
 *
 *       bågmeter med −1   ≡   vinkel med  d => -1/d
 *
 *   Det är ett per-rad-beroende led, inte en kolumnskalning – och därför
 *   ändrar det r_i så snart siktlängderna skiljer sig åt.
 */
export function referenceAngle(pts, meas, { C_mm = 1.0, orientPartial = -1 } = {}) {
  const free = pts.filter(p => p.type !== 'known' && p.type !== 'simstation');
  const fi = {}; free.forEach((p, i) => (fi[p.id] = i));
  const stn = [...new Set(meas.filter(m => (m.obsType || 'both') !== 'dist_only').map(m => m.from))];
  const si = {}; stn.forEach((id, i) => (si[id] = i));
  const nu = free.length * 2 + stn.length;

  const rows = [];
  for (const m of meas) {
    const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
    const dE = p2.E - p1.E, dN = p2.N - p1.N;
    const d2 = dE * dE + dN * dN, d = Math.sqrt(d2);
    const C1 = p1.centerErr != null ? p1.centerErr : C_mm;
    const C2 = p2.centerErr != null ? p2.centerErr : C_mm;
    const C  = Math.sqrt((C1 * C1 + C2 * C2) / 2);   // EN C-term (HMK C.1.1)
    const t = m.obsType || 'both';

    if (t === 'both' || t === 'dist_only') {
      // Längdrad i METER; ∂L/∂E_k = ΔE/d osv.
      const a = new Array(nu).fill(0);
      const ex = dE / d, ey = dN / d;
      if (fi[p1.id] !== undefined) { a[fi[p1.id] * 2] -= ex; a[fi[p1.id] * 2 + 1] -= ey; }
      if (fi[p2.id] !== undefined) { a[fi[p2.id] * 2] += ex; a[fi[p2.id] * 2 + 1] += ey; }
      rows.push({ a, sig: uLmm(m.sigDist_mm, m.sigDist_ppm, d, C) / 1000, type: 'dist',
                  from: p1.id, to: p2.id, d });
    }
    if (t === 'both' || t === 'hz_only') {
      // Riktningsrad i MGON. Koefficienterna är azimutens partialer × ρ.
      const a = new Array(nu).fill(0);
      const cE = RHO * dN / d2;    // ∂t/∂E_till  [mgon/m]
      const cN = -RHO * dE / d2;   // ∂t/∂N_till  [mgon/m]
      if (fi[p2.id] !== undefined) { a[fi[p2.id] * 2] += cE; a[fi[p2.id] * 2 + 1] += cN; }
      if (fi[p1.id] !== undefined) { a[fi[p1.id] * 2] -= cE; a[fi[p1.id] * 2 + 1] -= cN; }
      if (si[p1.id] !== undefined) {
        a[free.length * 2 + si[p1.id]] =
          typeof orientPartial === 'function' ? orientPartial(d) : orientPartial;
      }
      rows.push({ a, sig: uPhiMgon(m.sigHz_mgon, m.numSatser != null ? m.numSatser : 3, C, d),
                  type: 'hz', from: p1.id, to: p2.id, d });
    }
  }

  const n = rows.length;
  const N = Array.from({ length: nu }, () => new Array(nu).fill(0));
  for (const o of rows) {
    const p = 1 / (o.sig * o.sig);
    for (let j = 0; j < nu; j++) for (let k = 0; k < nu; k++) N[j][k] += o.a[j] * p * o.a[k];
  }
  const Q = inv(N);
  if (!Q) return { singular: true, n, nu };

  // k_i = 1 − h_ii,  h_ii = p_i · a_iᵀ Q a_i    (diagonalen i R = I − A(AᵀPA)⁻¹AᵀP)
  const redund = rows.map(o => {
    let h = 0;
    for (let j = 0; j < nu; j++) {
      let s = 0;
      for (let k = 0; k < nu; k++) s += Q[j][k] * o.a[k];
      h += o.a[j] * s;
    }
    h /= o.sig * o.sig;
    return { ki: 1 - h, type: o.type, from: o.from, to: o.to, d: o.d, sig: o.sig };
  });

  return { singular: false, n, nu, dof: n - nu, redund, Q,
           sumK: redund.reduce((s, x) => s + x.ki, 0) };
}
