// Kopierad exakt från NätSim_Beta_2.html rad 620–764.
// Strukturella ändringar: ctx-parameter istället för globaler, returnerar array.
// Matematiken är oförändrad.
import { INSTRUMENTS } from './constants.js';
import { invertMatrix } from './matrix.js';
import { computeEllipse } from './ellipses.js';

// ctx = { pts, meas, centerErr }
// Returnerar array av simstations-resultat (muterar ej simResult).
export function runSimStations(Qxx_prim, freeIds_prim, knownPts, ctx) {
  const { pts, meas, centerErr } = ctx;

  const simStations = pts.filter(p => p.type === "simstation");
  if (!simStations.length) return [];

  const freeIdxPrim = {};
  freeIds_prim.forEach((id, i) => { freeIdxPrim[id] = i; });
  const kappa = 2.80;   // identisk med runSimulation – originalet: simResult?.kappa||2.80

  return simStations.map(stn => {
    const stnMeas = meas.filter(m => m.from === stn.id);
    if (stnMeas.length < 2) {
      return { id: stn.id, error: "Minst 2 mätningar krävs", E: stn.E, N: stn.N };
    }

    // Obekanta: [E_stn, N_stn, z_k]
    const N_obs  = [[0,0,0],[0,0,0],[0,0,0]];
    const N_prop = [[0,0,0],[0,0,0],[0,0,0]];
    let nObs = 0;
    const measUsed = [];

    stnMeas.forEach(m => {
      const p2 = pts.find(p => p.id === m.to);
      if (!p2) return;
      const pr = INSTRUMENTS[m.instrPreset || "ts16_1"];
      const sDmm  = m.sigDist_mm  != null ? m.sigDist_mm  : pr.sigDmm;
      const sDppm = m.sigDist_ppm != null ? m.sigDist_ppm : pr.sigDppm;
      const sHmg  = m.sigHz_mgon  != null ? m.sigHz_mgon  : pr.sigHz;
      const nSat  = m.numSatser   != null ? m.numSatser   : 3;
      const obsType = m.obsType || "both";

      const dE = p2.E - stn.E, dN = p2.N - stn.N;
      const d_m = Math.sqrt(dE * dE + dN * dN) || 1;
      const dist_m = m.measDist != null ? m.measDist : d_m;

      // Centreringsfel – rad 661 exakt: e_c = √(e_from²+e_to²)
      const e_from = (stn.centerErr != null ? stn.centerErr : centerErr) / 1000;
      const e_to   = (p2.centerErr  != null ? p2.centerErr  : centerErr) / 1000;
      const e_c    = Math.sqrt(e_from * e_from + e_to * e_to);

      const sigD = Math.sqrt((sDmm / 1000) ** 2 + (dist_m * sDppm * 1e-6) ** 2 + e_c * e_c);
      const sigH_c_mgon = e_c / dist_m * (200000 / Math.PI);
      const sigH_tot    = Math.sqrt((sHmg / Math.sqrt(nSat)) ** 2 + sigH_c_mgon ** 2);
      const sigH_arc    = dist_m * sigH_tot * 0.001 * (Math.PI / 200);

      const ex = dE / d_m, ey = dN / d_m;

      // ── Designmatrisrad för SIMSTATIONEN [E_stn, N_stn, z_k] – rad 674–683 ──
      if (obsType === "both" || obsType === "dist_only") {
        const aD = [-ex, -ey, 0];
        const PD = 1 / (sigD * sigD);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) N_obs[r][c] += PD * aD[r] * aD[c];
        nObs++;
      }
      if (obsType === "both" || obsType === "hz_only") {
        const aH = [ey, -ex, -dist_m];
        const PH = 1 / (sigH_arc * sigH_arc);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) N_obs[r][c] += PH * aH[r] * aH[c];
        nObs++;
      }

      // ── Felfortplantning från anslutningspunktens osäkerhet – rad 691–728 ──
      if (freeIdxPrim[p2.id] !== undefined) {
        const idx2 = freeIdxPrim[p2.id];
        const Qk = [
          [Qxx_prim[idx2*2][idx2*2],     Qxx_prim[idx2*2][idx2*2+1]],
          [Qxx_prim[idx2*2+1][idx2*2],   Qxx_prim[idx2*2+1][idx2*2+1]]
        ];
        const det = Qk[0][0] * Qk[1][1] - Qk[0][1] * Qk[1][0];
        if (Math.abs(det) < 1e-30) return;
        const Qk_inv = [[Qk[1][1]/det, -Qk[0][1]/det], [-Qk[1][0]/det, Qk[0][0]/det]];

        const aPt_rows = [];
        if (obsType === "both" || obsType === "dist_only") aPt_rows.push({ a: [ex, ey],   P: 1/(sigD*sigD) });
        if (obsType === "both" || obsType === "hz_only")   aPt_rows.push({ a: [-ey, ex],  P: 1/(sigH_arc*sigH_arc) });

        aPt_rows.forEach(({ a }) => {
          const v = a[0] * (Qk_inv[0][0]*a[0] + Qk_inv[0][1]*a[1]) +
                    a[1] * (Qk_inv[1][0]*a[0] + Qk_inv[1][1]*a[1]);
          let aStn;
          if (Math.abs(a[0] - ex) < 0.01 && Math.abs(a[1] - ey) < 0.01) {
            aStn = [-ex, -ey, 0];
          } else {
            aStn = [ey, -ex, -dist_m];
          }
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) N_prop[r][c] += v * aStn[r] * aStn[c];
        });
      }
      measUsed.push(m.id);
    });

    if (nObs < 3) {
      return { id: stn.id, error: "Minst 2 mätningar (vinkel+avstånd) krävs för positionsbestämning", E: stn.E, N: stn.N };
    }

    const N_tot = N_obs.map((row, r) => row.map((v, c) => v + N_prop[r][c]));
    const Qss = invertMatrix(N_tot);
    if (!Qss) {
      return { id: stn.id, error: "Singulär matris – förbättra geometrin", E: stn.E, N: stn.N };
    }

    const Qee = Qss[0][0], Qnn = Qss[1][1], Qen = Qss[0][1];
    const { sigE, sigN, aSemi, bSemi, theta, sigPos } = computeEllipse(Qee, Qnn, Qen);

    const Qss_obs = invertMatrix(N_obs);
    const sigPos_obs = Qss_obs ? Math.sqrt(Math.max(0, Qss_obs[0][0] + Qss_obs[1][1])) : null;

    return {
      id: stn.id, E: stn.E, N: stn.N,
      sigE, sigN, sigPos, aSemi, bSemi, theta,
      sigPos_obs,
      nObs, measUsed, ok: true
    };
  });
}
