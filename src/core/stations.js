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
  // δ₀ = 2,80 enligt HMK-Stommätning 2024 Formel F.16 (α = 5 %, β = 80 %).
  // Identisk med runSimulation – se kommentaren där. Ändra inte till 4,13.
  const kappa = 2.80;

  return simStations.map(stn => {
    const stnMeas = meas.filter(m => m.from === stn.id);
    if (stnMeas.length < 2) {
      return { id: stn.id, error: "Minst 2 mätningar krävs", E: stn.E, N: stn.N };
    }

    // Obekanta: [E_stn, N_stn, z_k]
    const N_obs = [[0,0,0],[0,0,0],[0,0,0]];   // enbart observationerna
    const N_tot = [[0,0,0],[0,0,0],[0,0,0]];   // inkl. anslutningsosäkerhet
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

      // Centreringen enligt HMK-Stommätning 2024 Bilaga C.1.1 / C.1.2 –
      // en enda C-term, identiskt med simulation.js. Se kommentaren där.
      const e_from = (stn.centerErr != null ? stn.centerErr : centerErr) / 1000;
      const e_to   = (p2.centerErr  != null ? p2.centerErr  : centerErr) / 1000;
      const e_c    = Math.sqrt((e_from * e_from + e_to * e_to) / 2);

      // u(L) = √[(A + B·L)² + C²] enligt HMK Bilaga C.1.2 – identiskt med
      // simulation.js. Se kommentaren där.
      const sigD = Math.hypot((sDmm / 1000) + (dist_m * sDppm * 1e-6), e_c);
      const sigH_c_mgon = e_c / dist_m * (200000 / Math.PI);
      const sigH_tot    = Math.sqrt((sHmg / Math.sqrt(nSat)) ** 2 + sigH_c_mgon ** 2);
      const sigH_arc    = dist_m * sigH_tot * 0.001 * (Math.PI / 200);

      const ex = dE / d_m, ey = dN / d_m;

      // ── Anslutningspunktens osäkerhet – felfortplantning till observationen ──
      // Osäkerheten hos den punkt vi siktar mot FÖRSÄMRAR observationen. Korrekt
      // felfortplantning inflaterar därför observationens varians:
      //     σ²_eff = σ²_obs + aᵀ Q_k a
      // där a är observationens partialderivata mot MÅLPUNKTENS koordinater och
      // Q_k målpunktens 2×2-kofaktorblock ur primärnätet. Kända målpunkter har
      // inget block i Q_k och bidrar därmed inte alls.
      //
      // Tidigare byggdes i stället en separat normalmatris N_prop som ADDERADES
      // till N_obs. Normalmatrisaddition modellerar TILLFÖRD information, så
      // resultatet kunde bara bli bättre – med två omöjliga gränsvärden:
      // perfekt anslutning gav σ_pos → 0, och usel anslutning mättade mot
      // observationernas bästafall i stället för att växa obegränsat.
      let varAddD = 0, varAddH = 0;
      if (freeIdxPrim[p2.id] !== undefined) {
        const i2  = freeIdxPrim[p2.id];
        const q11 = Qxx_prim[i2*2][i2*2],     q12 = Qxx_prim[i2*2][i2*2+1];
        const q21 = Qxx_prim[i2*2+1][i2*2],   q22 = Qxx_prim[i2*2+1][i2*2+1];
        // Kvadratformen aᵀ Q_k a – projektionen av punktosäkerheten på
        // observationens riktning.
        const kvadratform = (a1, a2) =>
          a1 * (q11 * a1 + q12 * a2) + a2 * (q21 * a1 + q22 * a2);
        varAddD = kvadratform(ex,  ey);   // längd: radiell komponent
        varAddH = kvadratform(ey, -ex);   // riktning i bågmeter: tvärkomponent
      }
      const sigD_eff   = Math.sqrt(sigD * sigD + varAddD);
      const sigArc_eff = Math.sqrt(sigH_arc * sigH_arc + varAddH);

      // ── Designmatrisrad för SIMSTATIONEN [E_stn, N_stn, z_k] ──
      // N_obs bär enbart observationernas bidrag och ger bästafallet
      // (sigPos_obs). N_tot har samma rader men vikter från σ_eff, dvs. med
      // anslutningsosäkerheten inräknad.
      if (obsType === "both" || obsType === "dist_only") {
        const aD = [-ex, -ey, 0];
        const PD = 1 / (sigD * sigD), PD_eff = 1 / (sigD_eff * sigD_eff);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          N_obs[r][c] += PD     * aD[r] * aD[c];
          N_tot[r][c] += PD_eff * aD[r] * aD[c];
        }
        nObs++;
      }
      if (obsType === "both" || obsType === "hz_only") {
        const aH = [ey, -ex, -dist_m];
        const PH = 1 / (sigH_arc * sigH_arc), PH_eff = 1 / (sigArc_eff * sigArc_eff);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          N_obs[r][c] += PH     * aH[r] * aH[c];
          N_tot[r][c] += PH_eff * aH[r] * aH[c];
        }
        nObs++;
      }
      measUsed.push(m.id);
    });

    if (nObs < 3) {
      return { id: stn.id, error: "Minst 2 mätningar (vinkel+avstånd) krävs för positionsbestämning", E: stn.E, N: stn.N };
    }

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
