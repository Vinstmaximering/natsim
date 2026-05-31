// Kopierad exakt från NätSim_Beta_2.html rad 868–1106.
// Strukturella ändringar:
//   – Läser pts/meas/centerErr från store (ej globaler)
//   – Skriver simResult via setState() (ej global mutation)
//   – draw()-anrop borttagna (UI-ansvar, ej kärna)
//   – Omätta kända punkter kontrolleras tidigt (före n_obs<nu) för testbarhet
// Matematiken är oförändrad.
import { INSTRUMENTS } from './constants.js';
import { invertMatrix } from './matrix.js';
import { calcM } from './designmatrix.js';
import { computeEllipse } from './ellipses.js';
import { checkDatumDefect } from './datum-check.js';
import { runSimStations } from './stations.js';
import { getState, setState } from '../state/store.js';

export function runSimulation() {
  const { pts, meas, centerErr } = getState();

  const knownPts = pts.filter(p => p.type === "known");
  const freePts  = pts.filter(p => p.type !== "known");

  // ── Grundläggande kontroller – rad 872–877 ──
  if (pts.length < 2 || meas.length < 1) {
    setState({ simResult: { error: "Minst 2 punkter och 1 mätning krävs." } });
    return;
  }
  if (knownPts.length < 1) {
    setState({ simResult: { error: "Minst 1 känd punkt (fixpunkt) krävs.\n\nMarkera minst en punkt som 'Känd punkt'." } });
    return;
  }

  // ── Tidig kontroll av omätta kända punkter ──
  // Görs före n_obs<nu-checken för att ge specifikt felmeddelande (FP1 etc.).
  // Originalets datum-defekt-block (rad 997–1014) ger samma meddelande men
  // nås aldrig när n_obs<nu (vilket sker i dessa fall). Ordningsändring, ej matematikändring.
  const measuredIdsEarly = new Set();
  meas.forEach(m => { measuredIdsEarly.add(m.from); measuredIdsEarly.add(m.to); });
  const unusedKnownEarly = knownPts.filter(p => !measuredIdsEarly.has(p.id));
  if (unusedKnownEarly.length > 0) {
    setState({ simResult: {
      error: "Nätet har dolda datumdefekter (rotation/translation/skala kan inte bestämmas).\n\n" +
             "ORSAK: Kända punkter ingår inte i några mätningar: " + unusedKnownEarly.map(p => p.id).join(", ") + "\n\n" +
             "ÅTGÄRD: Mät in minst en känd punkt från en uppställning så att nätet anknyts till det kända koordinatsystemet."
    }});
    return;
  }

  // ── Index för obekanta – rad 882–892 ──
  // Block 1: fria punkters koordinater  [0 .. 2*nFree-1]
  // Block 2: orienteringskonstanter     [2*nFree .. 2*nFree+nStn-1]
  const freeIdx = {};
  freePts.forEach((p, i) => { freeIdx[p.id] = i; });
  const nFree = freePts.length;

  const stnIds = [...new Set(meas.map(m => m.from))];
  const stnIdx = {};
  stnIds.forEach((id, i) => { stnIdx[id] = i; });
  const nStn = stnIds.length;

  const nu = nFree * 2 + nStn;

  const obsRows = [];   // { row, sig, type, measId, fromId, toId, d, sigH_mgon_eff }

  // ── Bygg observationsmatris – rad 896–956 ──
  meas.forEach(m => {
    const md = calcM(m, pts);
    if (!md) return;
    const { p1, p2 } = md;
    const pr = INSTRUMENTS[m.instrPreset || "ts16_1"];
    const sDmm  = m.sigDist_mm  != null ? m.sigDist_mm  : pr.sigDmm;
    const sDppm = m.sigDist_ppm != null ? m.sigDist_ppm : pr.sigDppm;
    const sHmg  = m.sigHz_mgon  != null ? m.sigHz_mgon  : pr.sigHz;
    const nSat  = m.numSatser   != null ? m.numSatser   : 3;

    const dE = p2.E - p1.E, dN = p2.N - p1.N;
    const d_m = Math.sqrt(dE * dE + dN * dN) || 1;
    const dist_m = m.measDist != null ? m.measDist : d_m;

    // Centreringsfel – rad 911–913 exakt: e_c = √(e_from²+e_to²)  (ej /√2)
    const e_from = (p1.centerErr != null ? p1.centerErr : centerErr) / 1000;
    const e_to   = (p2.centerErr != null ? p2.centerErr : centerErr) / 1000;
    const e_c    = Math.sqrt(e_from * e_from + e_to * e_to);

    const sigD = Math.sqrt((sDmm / 1000) ** 2 + (dist_m * sDppm * 1e-6) ** 2 + e_c * e_c);
    const sigH_mgon_eff  = sHmg / Math.sqrt(nSat);
    const sigH_c_mgon    = e_c / dist_m * (200000 / Math.PI);
    const sigH_tot_mgon  = Math.sqrt(sigH_mgon_eff ** 2 + sigH_c_mgon ** 2);
    const sigH_rad       = sigH_tot_mgon * 0.001 * (Math.PI / 200);
    const sigH_arc       = dist_m * sigH_rad;

    const ex = dE / d_m, ey = dN / d_m;
    const obsType = m.obsType || "both";
    const addDist = obsType === "both" || obsType === "dist_only";
    const addHz   = obsType === "both" || obsType === "hz_only";

    // ── Avståndsekvation – rad 928–937 ──
    if (addDist) {
      const rowD = new Array(nu).fill(0);
      if (freeIdx[p1.id] !== undefined) {
        const i1 = freeIdx[p1.id]; rowD[i1*2] -= ex; rowD[i1*2+1] -= ey;
      }
      if (freeIdx[p2.id] !== undefined) {
        const i2 = freeIdx[p2.id]; rowD[i2*2] += ex; rowD[i2*2+1] += ey;
      }
      obsRows.push({ row: rowD, sig: sigD, type: "dist", measId: m.id,
        fromId: p1.id, toId: p2.id, d: dist_m, sigH_mgon_eff: sigH_tot_mgon });
    }

    // ── Riktningsekvation (bågmeter) – rad 941–954 ──
    if (addHz) {
      const rowH = new Array(nu).fill(0);
      if (freeIdx[p1.id] !== undefined) {
        const i1 = freeIdx[p1.id]; rowH[i1*2] += ey; rowH[i1*2+1] -= ex;
      }
      if (freeIdx[p2.id] !== undefined) {
        const i2 = freeIdx[p2.id]; rowH[i2*2] -= ey; rowH[i2*2+1] += ex;
      }
      if (stnIdx[p1.id] !== undefined) {
        // Orienteringskonstant z_k: ∂f_hz/∂z_k = -1  – rad 951 exakt (ej -dist_m)
        rowH[nFree * 2 + stnIdx[p1.id]] = -1;
      }
      obsRows.push({ row: rowH, sig: sigH_arc, type: "hz", measId: m.id,
        fromId: p1.id, toId: p2.id, d: dist_m, sigH_mgon_eff: sigH_tot_mgon });
    }
  });

  const n_obs = obsRows.length;

  if (n_obs < nu) {
    setState({ simResult: { error: `Underdeterminerat nät.\nObekanta: ${nu} (${nFree*2} koordinater + ${nStn} orienteringskonstanter)\nObservationer: ${n_obs}\n\nLägg till fler mätningar.` } });
    return;
  }

  // ── Normalmatrisen N = A^T P A – rad 965–973 ──
  const A = obsRows.map(o => o.row);
  const P = obsRows.map(o => 1 / (o.sig * o.sig));

  const Nmat = Array.from({ length: nu }, () => new Array(nu).fill(0));
  for (let i = 0; i < n_obs; i++)
    for (let j = 0; j < nu; j++)
      for (let k = 0; k < nu; k++)
        Nmat[j][k] += A[i][j] * P[i] * A[i][k];

  const Qxx = invertMatrix(Nmat);
  if (!Qxx) {
    setState({ simResult: { error: "Normalmatrisen är singulär.\n\n• Saknar tillräcklig koppling till kända punkter\n• En fri punkt saknar mätningar i ≥2 ej-parallella riktningar\n• En uppställning saknar minst 2 mätningar" } });
    return;
  }

  // ── Datumdefekt-check (Qxx-diagonal) – rad 981–1015 ──
  const { ok: datumOk, message: datumMsg } = checkDatumDefect(Qxx, nu, knownPts, meas);
  if (!datumOk) {
    setState({ simResult: { error: datumMsg } });
    return;
  }

  // ── r_i = 1 - H_ii (HMK F.9/F.10) – rad 1017–1050 ──
  // κ = 2.80 (α=0.05, β=0.80) per HMK F.16: λ_2.5%+λ_20%=1.96+0.84=2.80
  const kappa = 2.80;
  const redund = [];
  for (let i = 0; i < n_obs; i++) {
    const a  = obsRows[i].row;
    const Pi = P[i];
    let hii = 0;
    for (let j = 0; j < nu; j++) {
      let tmp = 0;
      for (let k = 0; k < nu; k++) tmp += Qxx[j][k] * a[k];
      hii += a[j] * tmp;
    }
    hii *= Pi;
    const ri = Math.max(0, Math.min(1, 1 - hii));

    const obs = obsRows[i];
    const mdbVal = ri > 0.001 ? kappa * obs.sig / Math.sqrt(ri) : Infinity;
    const mdb = obs.type === "dist"
      ? { val: mdbVal, unit: "dist" }
      : { val: mdbVal === Infinity ? Infinity : (mdbVal / obs.d) * (200000 / Math.PI), unit: "hz" };

    // YT = (1 - r_i) × MUF per HMK Bilaga F, formel F.14
    const yt_m = mdbVal !== Infinity ? (1 - ri) * mdbVal : Infinity;

    redund.push({ ri, mdb, yt_m, type: obs.type, measId: obs.measId,
      fromId: obs.fromId, toId: obs.toId, sig: obs.sig, d: obs.d,
      sigH_mgon_eff: obs.sigH_mgon_eff });
  }

  // ── Punktosäkerheter 1σ (matchar Geo Professional) – rad 1055–1066 ──
  const k_ell = 1.0;
  const ptResults = freePts.map((p, i) => {
    const Qee = Qxx[i*2][i*2], Qnn = Qxx[i*2+1][i*2+1], Qen = Qxx[i*2][i*2+1];
    const { sigE, sigN, aSemi, bSemi, theta, sigPos } = computeEllipse(Qee, Qnn, Qen, k_ell);
    return { id: p.id, type: p.type, sigE, sigN, sigPos, aSemi, bSemi, theta, E: p.E, N: p.N };
  });

  // ── Kontrollerbarhetstalet k = f/n – rad 1068–1085 ──
  const dof      = n_obs - nu;
  const K_global = n_obs > 0 ? dof / n_obs : 0;
  const K_class  = K_global > 1.14 ? "Överbestämt" : K_global >= 0.5 ? "Starkt" : K_global >= 0.3 ? "Acceptabelt" : K_global >= 0.1 ? "Svagt" : "Otillräckligt";
  const K_col    = K_global > 1.14 ? "#ce93d8" : K_global >= 0.5 ? "#00ff88" : K_global >= 0.3 ? "#ffcc00" : K_global >= 0.1 ? "#ff9900" : "#ff5050";

  const measR    = redund.map(r => r.ri);
  const rMean    = measR.reduce((a, b) => a + b, 0) / measR.length;
  const rDist    = redund.filter(r => r.type === "dist").map(r => r.ri);
  const rHz      = redund.filter(r => r.type === "hz"  ).map(r => r.ri);
  const rMinDist = rDist.length > 0 ? Math.min(...rDist) : null;
  const rMinHz   = rHz.length   > 0 ? Math.min(...rHz)   : null;

  const ptControllability = freePts.map(p => {
    const myR = redund.filter(r => r.fromId === p.id || r.toId === p.id);
    const minR = myR.length > 0 ? Math.min(...myR.map(r => r.ri)) : null;
    return { id: p.id, type: p.type, minR, count: myR.length };
  });

  const result = {
    ok: true,
    datumDesc: `Absolut anslutning – ${knownPts.length} känd(a) punkt(er), ${nStn} orienteringskonstant(er)`,
    ptResults, allPtResults: ptResults,
    redund, meas_n: n_obs, unkn_n: nu,
    nCoordUnkn: nFree * 2, nOrientUnkn: nStn,
    redundancy: dof,
    redundTotal: redund.reduce((a, r) => a + r.ri, 0).toFixed(2),
    K_global, K_class, K_col, rMean, rMinDist, rMinHz,
    ptControllability,
    knownCount: knownPts.length, freeCount: nFree, measCount: meas.length,
    kappa,
    Qxx, freeIds: freePts.map(p => p.id)
  };

  // ── Simulerade uppställningar – rad 1101–1103 ──
  const simStations = pts.filter(p => p.type === "simstation");
  if (simStations.length > 0) {
    result.simStationResults = runSimStations(
      Qxx, freePts.map(p => p.id), knownPts,
      { pts, meas, centerErr }
    );
  }

  setState({ simResult: result });
}
