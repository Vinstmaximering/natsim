// ─────────────────────────────────────────────────────────────────────────────
// REFERENSIMPLEMENTATION – oberoende orakel för 2D minsta-kvadrat-utjämning
//
// FÖRANKRING: HMK-Stommätning 2024, Bilaga C.1.1 (riktningsosäkerhet),
// C.1.2 (längdosäkerhet), Formel F.16 (δ₀) och Formel F.23 (standardosäkerhet
// i plan). Designmatrisens partialderivator följer lärobokens formler för
// bågmeterparameteriserad riktningsobservation.
//
// ══ FÅR ALDRIG KALIBRERAS MOT KÄRNAN ══
//
// Den här filen har två gånger burit exakt samma fel som src/core/ och därmed
// gett falsk överensstämmelse på < 5e-16 mot fel svar:
//
//   F5  – sigPos räknades som √((Qee+Qnn)/2) i stället för √(Qee+Qnn).
//         Matchade kärnan perfekt. Båda var fel mot HMK F.23.
//   F17 – längd-σ summerades helt kvadratiskt i stället för
//         √[(A + B·L)² + C²]. Matchade kärnan perfekt. Båda var fel mot C.1.2.
//
// I båda fallen upptäcktes felet först när facit härleddes ur standardtexten
// i stället för ur den här filen. En referens som speglar koden kan per
// definition inte fånga kodens fel.
//
// REGEL: när ett värde här avviker från kärnan är standardtexten skiljedomare –
// aldrig kärnan. Ändra aldrig något här för att få kärnan att matcha. Filens
// egen korrekthet vilar på tests/ref-hmk.test.js, som binder varje formel till
// HMK:s publicerade räkneexempel utan att röra src/core/.
// ─────────────────────────────────────────────────────────────────────────────

// ── HMK-förankrade osäkerhetsformler ────────────────────────────────────────

// Radiankonstant: mgon per radian. 1 rad = 200000/π mgon.
export const RHO_MGON = 200000 / Math.PI;

// HMK-Stommätning 2024 Formel F.16 – δ₀ vid α = 5 %, β = 80 %:
//   δ₀ = λ(α/2) + λ(β) = 1,96 + 0,84 = 2,80
// Tabell 55 visar hela risknivåfältet. Baardas 4,13 är α = 0,1 % – en annan
// nivå som HMK medvetet valt bort.
export const DELTA0 = 2.80;

// HMK-Stommätning 2024 Bilaga C.1.2 – längdosäkerhet:
//   u(L) = √[(A + B·L)² + C²]
// A [mm] och B·L [mm] adderas LINJÄRT (TDOK 2014:0571 §4.6.1.2: "adderas");
// först centreringen C kombineras kvadratiskt.
//   A_mm  konstantled, B_ppm  avståndsberoende led, L_m  sikt, C_mm  centrering
// Returnerar mm.
export function uL(A_mm, B_ppm, L_m, C_mm) {
  return Math.hypot(A_mm + B_ppm * L_m * 1e-3, C_mm);
}

// HMK-Stommätning 2024 Bilaga C.1.1 – riktningsosäkerhet:
//   u(φ) = √[(A/√n)² + (C/L · ρ)²]
// A [mgon] instrumentets riktningsosäkerhet, n antal helsatser,
// C [mm] centrering, L [m] sikt. Returnerar mgon.
export function uPhi(A_mgon, nSatser, C_mm, L_m) {
  return Math.hypot(A_mgon / Math.sqrt(nSatser), (C_mm / 1000) / L_m * RHO_MGON);
}

// HMK-Stommätning 2024 Formel F.23 – standardosäkerhet i plan:
//   u(plan) = √[u²(N) + u²(E)]
// Helmerts punktmedelfel. HMK-Ordlistan (april 2022): standardosäkerhet i plan
// = punktmedelfel. Ingen delning med 2.
export function uPlan(sigN, sigE) {
  return Math.hypot(sigN, sigE);
}

// Centreringens C-term för en observation med två ändar. HMK förutsätter samma
// C för instrument och reflektor/signal och låter den ingå EN gång. Vid olika
// värden används deras kvadratiska medelvärde, vilket är exakt C när de är lika.
export function centreringsterm(C1_mm, C2_mm) {
  return Math.sqrt((C1_mm * C1_mm + C2_mm * C2_mm) / 2);
}

// ── Linjär algebra ──────────────────────────────────────────────────────────

// Gauss–Jordan med partiell pivotering. Returnerar null vid singularitet.
export function invert(M) {
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

// ── Utjämning ───────────────────────────────────────────────────────────────
//
// Obekantvektor: [E,N per fri punkt ...] följt av [z per uppställning ...].
// Endast uppställningar med minst en riktningsobservation får en
// orienteringsobekant – annars blir kolumnen identiskt noll och N singulär.
//
// Partialderivator (bågmeterparameteriserade, dvs. raden × d och σ_arc = d·σ_rad):
//   Riktning φ = atan2(dE, dN) − z:
//     ∂/∂E_j = +ey   ∂/∂N_j = −ex   ∂/∂E_i = −ey   ∂/∂N_i = +ex   ∂/∂z_i = −d
//   Längd:
//     ∂/∂E_j = +ex   ∂/∂N_j = +ey   ∂/∂E_i = −ex   ∂/∂N_i = −ey
// med ex = dE/d, ey = dN/d.

export function reference(pts, meas, centerErr = 1.0) {
  const free = pts.filter(p => p.type !== 'known' && p.type !== 'simstation');
  const fi = {}; free.forEach((p, i) => (fi[p.id] = i));
  const stnIds = [...new Set(
    meas.filter(m => (m.obsType || 'both') !== 'dist_only').map(m => m.from)
  )];
  const si = {}; stnIds.forEach((id, i) => (si[id] = i));
  const nu = free.length * 2 + stnIds.length;
  const rows = [];

  for (const m of meas) {
    const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
    if (!p1 || !p2) continue;
    const dE = p2.E - p1.E, dN = p2.N - p1.N;
    const d = Math.sqrt(dE * dE + dN * dN);
    const ex = dE / d, ey = dN / d;
    const nSat = m.numSatser != null ? m.numSatser : 3;
    const C = centreringsterm(
      p1.centerErr != null ? p1.centerErr : centerErr,
      p2.centerErr != null ? p2.centerErr : centerErr
    );

    const sigD   = uL(m.sigDist_mm, m.sigDist_ppm, d, C) / 1000;          // m
    const sigPhi = uPhi(m.sigHz_mgon, nSat, C, d);                        // mgon
    const sigArc = d * sigPhi * 0.001 * (Math.PI / 200);                  // bågmeter

    const t = m.obsType || 'both';
    if (t === 'both' || t === 'dist_only') {
      const a = new Array(nu).fill(0);
      if (fi[p1.id] !== undefined) { a[fi[p1.id] * 2] -= ex; a[fi[p1.id] * 2 + 1] -= ey; }
      if (fi[p2.id] !== undefined) { a[fi[p2.id] * 2] += ex; a[fi[p2.id] * 2 + 1] += ey; }
      rows.push({ a, sig: sigD, type: 'dist', from: p1.id, to: p2.id, d, sigMm: sigD * 1000 });
    }
    if (t === 'both' || t === 'hz_only') {
      const a = new Array(nu).fill(0);
      if (fi[p1.id] !== undefined) { a[fi[p1.id] * 2] -= ey; a[fi[p1.id] * 2 + 1] += ex; }
      if (fi[p2.id] !== undefined) { a[fi[p2.id] * 2] += ey; a[fi[p2.id] * 2 + 1] -= ex; }
      if (si[p1.id] !== undefined) a[free.length * 2 + si[p1.id]] = -d;
      rows.push({ a, sig: sigArc, type: 'hz', from: p1.id, to: p2.id, d, sigMgon: sigPhi });
    }
  }

  const n = rows.length;
  const N = Array.from({ length: nu }, () => new Array(nu).fill(0));
  for (const o of rows) {
    const p = 1 / (o.sig * o.sig);
    for (let j = 0; j < nu; j++) for (let k = 0; k < nu; k++) N[j][k] += o.a[j] * p * o.a[k];
  }
  const Q = invert(N);
  if (!Q) return { singular: true, n, nu };

  const redund = rows.map(o => {
    let h = 0;
    for (let j = 0; j < nu; j++) {
      let t = 0;
      for (let k = 0; k < nu; k++) t += Q[j][k] * o.a[k];
      h += o.a[j] * t;
    }
    h /= o.sig * o.sig;
    const ri = 1 - h;
    // r_i lämnas OKLAMPAT så att ett värde utanför [0, 1] kan upptäckas av
    // tester i stället för att döljas. Tröskeln nedan är enbart en spärr mot
    // flyttalsbrus – en helt okontrollerbar observation ger r_i ≈ 1e-17, och
    // MUF är då obegränsat: ett grovfel i den kan aldrig upptäckas.
    const RI_BRUSGRANS = 1e-12;
    return {
      ri, type: o.type, from: o.from, to: o.to, d: o.d, sig: o.sig,
      sigMm: o.sigMm, sigMgon: o.sigMgon,
      muf: ri > RI_BRUSGRANS ? DELTA0 * o.sig / Math.sqrt(ri) : Infinity,   // HMK F.16
    };
  });

  const ptResults = free.map((p, i) => {
    const Qee = Q[i * 2][i * 2], Qnn = Q[i * 2 + 1][i * 2 + 1], Qen = Q[i * 2][i * 2 + 1];
    const mean = (Qee + Qnn) / 2, disc = Math.sqrt(((Qee - Qnn) / 2) ** 2 + Qen * Qen);
    const sigE = Math.sqrt(Math.max(0, Qee)), sigN = Math.sqrt(Math.max(0, Qnn));
    return {
      id: p.id, sigE, sigN,
      sigPos: uPlan(sigN, sigE),                                  // HMK F.23
      aSemi: Math.sqrt(Math.max(0, mean + disc)),
      bSemi: Math.sqrt(Math.max(0, mean - disc)),
      theta: 0.5 * Math.atan2(2 * Qen, Qee - Qnn),
    };
  });

  return {
    singular: false, n, nu, dof: n - nu, redund, ptResults, Q,
    sumR: redund.reduce((s, x) => s + x.ri, 0),
    kGlobal: n > 0 ? (n - nu) / n : 0,
  };
}
