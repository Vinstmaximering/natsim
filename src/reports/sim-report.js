// Kopierad exakt från NätSim_Beta_2.html rad 2425–2500 (exportSimReport)
// och rad 2680–2931 (exportCalcReport).
import { getState } from '../state/store.js';
import { CRS_DEFS, INSTRUMENTS, PT } from '../core/constants.js';
import { fG } from '../core/designmatrix.js';

const D = r => r * 180 / Math.PI;

// ── Textbaserad simuleringsrapport – rad 2425–2500 exakt ─────────────────────
export function exportSimReport() {
  const { simResult, activeCRS, sigReq = 3 } = getState();
  if (!simResult || !simResult.ok) { alert("Kör simuleringen först."); return; }
  const sr = simResult;
  const now     = new Date().toLocaleDateString("sv-SE");
  const crsName = CRS_DEFS[activeCRS]?.name || activeCRS;
  const w = 44;
  const SEP = "═".repeat(w), sep = "─".repeat(w);
  const pad  = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);

  let r = `${SEP}\nNÄTSIMULERING\n${SEP}\nDatum:          ${now}\nKoordinatsystem: ${crsName}\nMetod:          Absolut anslutning (MK-utjämning)\n\n`;

  r += `1. NÄTÖVERSIKT\n${sep}\n`;
  r += `Kända punkter:        ${rpad(sr.knownCount, 6)}\n`;
  r += `Fria punkter:         ${rpad(sr.freeCount,  6)}\n`;
  r += `Mätningar:            ${rpad(sr.measCount,  6)}\n`;
  r += `Observationer (n):    ${rpad(sr.meas_n,     6)}\n`;
  r += `Obekanta (u):         ${rpad(sr.unkn_n,     6)}\n`;
  r += `Frihetsgrader (f):    ${rpad(sr.redundancy, 6)}\n`;
  r += `Σ redundansbidrag:    ${rpad(sr.redundTotal, 6)}\n\n`;

  r += `2. KONTROLLERBARHETSTAL  k = f/n\n${sep}\n`;
  r += `k = ${sr.K_global.toFixed(3)}   ${sr.K_class}\n`;
  r += `Medel r_i:   ${sr.rMean.toFixed(3)}\n`;
  if (sr.rMinDist != null) r += `Min r_i (avst): ${sr.rMinDist.toFixed(3)}\n`;
  if (sr.rMinHz   != null) r += `Min r_i (vink): ${sr.rMinHz.toFixed(3)}\n`;
  r += "\n";

  r += `3. PUNKTOSÄKERHETER (95%, k=2.45)\n${sep}\n`;
  r += `${pad("Punkt",7)} ${rpad("σE mm",7)} ${rpad("σN mm",7)} ${rpad("σpos mm",8)} ${rpad("a mm",7)} ${rpad("b mm",7)} θ\n`;
  sr.ptResults.forEach(pr => {
    const sm = (pr.sigPos*1000).toFixed(2);
    r += `${pad(pr.id,7)} ${rpad((pr.sigE*1000).toFixed(2),7)} ${rpad((pr.sigN*1000).toFixed(2),7)} ${rpad(sm,8)} ${rpad((pr.aSemi*1000).toFixed(2),7)} ${rpad((pr.bSemi*1000).toFixed(2),7)} ${fG(D(pr.theta))}\n`;
  });
  r += "\n";

  r += `4. RELIABILITET PER MÄTNING\n${sep}\n`;
  r += `YT = MUF×(1-r) i observationsdomänen (Geos definition)\nKP = Koordinatpåverkan i mm\n\n`;
  r += `${pad("Sträcka",14)} ${pad("Typ",9)} ${rpad("r",6)} ${rpad("MUF",10)} ${rpad("YT",10)} ${rpad("KP mm",8)} Klass\n`;
  const rLabel = r_ => r_ >= 0.5 ? "Starkt" : r_ >= 0.3 ? "Acceptabelt" : r_ >= 0.1 ? "Svagt" : "Otillräckligt";
  sr.redund.forEach(rd => {
    const mufS = rd.mdb.val === Infinity ? "∞" : rd.type==="dist" ? (rd.mdb.val*1000).toFixed(1)+"mm" : rd.mdb.val.toFixed(2)+"mgon";
    const yt   = rd.mdb.val === Infinity ? Infinity : rd.mdb.val * (1-rd.ri);
    const ytS  = yt === Infinity ? "∞" : rd.type==="dist" ? (yt*1000).toFixed(2)+"mm" : yt.toFixed(4)+"gon";
    const kpS  = rd.yt_m === undefined || rd.yt_m === Infinity ? "∞" : (rd.yt_m*1000).toFixed(2);
    r += `${pad((rd.fromId||"?")+"→"+(rd.toId||"?"),14)} ${pad(rd.type==="dist"?"Avst":"Riktning",9)} ${rpad(rd.ri.toFixed(3),6)} ${rpad(mufS,10)} ${rpad(ytS,10)} ${rpad(kpS,8)} ${rLabel(rd.ri)}\n`;
  });
  r += "\n";

  r += `5. PUNKTKVALITET – PRECISION OCH RELIABILITET\n${sep}\n`;
  r += `Krav precision: σ_pos ≤ ${sigReq} mm\n\n`;
  r += `${pad("Punkt",14)} ${rpad("σpos mm",8)} ${rpad("Prec",8)} ${rpad("Obs",4)} ${rpad("r̄",7)} Reliabilitet\n`;
  sr.ptResults.forEach(pr => {
    const sm     = (pr.sigPos*1000).toFixed(2);
    const precOK = pr.sigPos*1000 <= sigReq ? "OK   " : "Ej krav";
    const myR    = sr.redund.filter(rd => rd.fromId===pr.id||rd.toId===pr.id);
    const nObs   = Math.round(myR.length/2);
    const maxR   = myR.length>0 ? Math.max(...myR.map(x=>x.ri)) : 0;
    const rMean_ = myR.length>0 ? myR.reduce((a,b)=>a+b.ri,0)/myR.length : null;
    let rel;
    if (myR.length===0) rel = "Ingen mätning";
    else if (maxR<=0.05) rel = "⚠ Ej kontrollerbar – okänt fel möjligt";
    else if (rMean_<0.15) rel = "Svag";
    else if (rMean_<0.35) rel = "Acceptabel";
    else rel = "God";
    r += `${pad(pr.id,14)} ${rpad(sm,8)} ${rpad(precOK,8)} ${rpad(nObs,4)} ${rpad(rMean_!=null?rMean_.toFixed(3):"–",7)} ${rel}\n`;
  });
  r += `\n${SEP}\n`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([r], { type:"text/plain" }));
  a.download = `nätsim_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}

// ── Detaljerad beräkningsrapport – rad 2680–2931 exakt ───────────────────────
export function exportCalcReport() {
  const { simResult, pts, meas, centerErr, activeCRS } = getState();
  if (!simResult || !simResult.ok) { alert("Kör simuleringen först."); return; }
  const sr      = simResult;
  const crsName = CRS_DEFS[activeCRS]?.name || activeCRS;
  const now     = new Date().toLocaleString("sv-SE");
  const W = 72;
  const SEP = "═".repeat(W), sep = "─".repeat(W);
  const pad  = (s, n) => String(s).padEnd(n);
  const rp   = (s, n) => String(s).padStart(n);
  const f6 = v => v.toFixed(6), f4 = v => v.toFixed(4), f3 = v => v.toFixed(3);
  let r = "";

  r += `${SEP}\nDETALJERED BERÄKNINGSRAPPORT – NÄTSIMULERING\n${SEP}\n`;
  r += `Datum/tid:       ${now}\n`;
  r += `Koordinatsystem: ${crsName}\n`;
  r += `Metod:           Minsta-kvadrat-utjämning, riktningsmodell med orienteringskonstanter\n`;
  r += `κ (MUF-faktor):  ${sr.kappa} (α=0.05, β=0.80, Baarda)\n\n`;

  r += `${SEP}\n1. PUNKTDATA\n${sep}\n`;
  r += `${pad("ID",14)} ${pad("Typ",18)} ${rp("E (m)",14)} ${rp("N (m)",14)} ${rp("e_c (mm)",8)}\n${sep}\n`;
  pts.forEach(p => {
    const ec = p.centerErr != null ? p.centerErr : centerErr;
    r += `${pad(p.id,14)} ${pad(PT[p.type]?.l||p.type,18)} ${rp(f3(p.E),14)} ${rp(f3(p.N),14)} ${rp(ec.toFixed(1),8)}\n`;
  });
  r += "\n";

  const freePts_ = pts.filter(p => p.type !== "known" && p.type !== "simstation");
  const stnIds   = [...new Set(meas.map(m => m.from))];

  r += `${SEP}\n2. OBEKANTA  (totalt ${sr.unkn_n} st)\n${sep}\n`;
  r += `Koordinatobekanta: ${sr.nCoordUnkn} st  (${sr.freeCount} fria punkter × 2)\n`;
  r += `Orienteringskonstanter: ${sr.nOrientUnkn} st  (en per uppställning)\n\n`;
  r += `Index  Obekant          Punkt\n${sep}\n`;
  freePts_.forEach((p, i) => {
    r += `${rp(i*2,   5)}  E_${pad(p.id,14)}   ${p.id}\n`;
    r += `${rp(i*2+1, 5)}  N_${pad(p.id,14)}   ${p.id}\n`;
  });
  stnIds.forEach((id, i) => {
    r += `${rp(freePts_.length*2+i, 5)}  z_${pad(id,14)}   ${id}  (orienteringskonstant)\n`;
  });
  r += "\n";

  r += `${SEP}\n3. OBSERVATIONER, σ-VÄRDEN OCH DESIGNMATRISRADER\n${sep}\n`;
  r += `σ_D  = σ_dist inkl. centreringsfel [m]\nσ_H  = σ_hz effektiv inkl. centrering [mgon]\nσ_arc= d × σ_H_rad\nP    = 1/σ²\na[]  = designmatrisraden (sparsmade)\n\n`;

  let obsIdx = 0;
  meas.forEach(m => {
    const p1 = pts.find(p=>p.id===m.from), p2 = pts.find(p=>p.id===m.to);
    if (!p1||!p2) return;
    const pr      = INSTRUMENTS[m.instrPreset||"ts16_1"];
    const sDmm    = m.sigDist_mm  !=null ? m.sigDist_mm  : pr.sigDmm;
    const sDppm   = m.sigDist_ppm !=null ? m.sigDist_ppm : pr.sigDppm;
    const sHmg    = m.sigHz_mgon  !=null ? m.sigHz_mgon  : pr.sigHz;
    const nSat    = m.numSatser   !=null ? m.numSatser   : 3;
    const obsType = m.obsType||"both";
    const dE=p2.E-p1.E, dN=p2.N-p1.N, d_m=Math.sqrt(dE*dE+dN*dN);
    const dist_m  = m.measDist!=null ? m.measDist : d_m;
    const e_from  = (p1.centerErr!=null?p1.centerErr:centerErr)/1000;
    const e_to    = (p2.centerErr!=null?p2.centerErr:centerErr)/1000;
    // Nota: rapport använder /2-varianten av centreringsfel (rad 2757 exakt)
    const e_c     = Math.sqrt((e_from*e_from+e_to*e_to)/2);
    const sigD    = Math.sqrt((sDmm/1000)**2+(dist_m*sDppm*1e-6)**2+e_c*e_c);
    const sigH_eff = sHmg/Math.sqrt(nSat);
    const sigH_c   = e_c/dist_m*(200000/Math.PI);
    const sigH_tot = Math.sqrt(sigH_eff**2+sigH_c**2);
    const sigH_arc = dist_m*sigH_tot*0.001*(Math.PI/200);
    const ex=dE/d_m, ey=dN/d_m;
    const addDist=obsType==="both"||obsType==="dist_only";
    const addHz  =obsType==="both"||obsType==="hz_only";
    const alpha_deg=(Math.atan2(dE,dN)*180/Math.PI+360)%360;

    r += `${sep}\nMätning ${m.id}: ${m.from} → ${m.to}  [${obsType}]\n`;
    r += `  Geometri: dE=${f3(dE)} m  dN=${f3(dN)} m  d=${f6(dist_m)} m  α=${f6(alpha_deg)}°\n`;
    r += `    ex=${f6(ex)}  ey=${f6(ey)}\n`;
    r += `  Centreringsfel: e_from=${(e_from*1000).toFixed(2)} mm  e_to=${(e_to*1000).toFixed(2)} mm  e_c=√((e²+e²)/2)=${(e_c*1000).toFixed(3)} mm\n`;
    if (addDist) {
      r += `  Avstånd: σ_D=${f4(sigD*1000)} mm  P_D=${f6(1/(sigD*sigD))}\n`;
      const elems=[];
      const i1=freePts_.findIndex(p=>p.id===p1.id), i2=freePts_.findIndex(p=>p.id===p2.id);
      if(i1>=0){elems.push(`a[${i1*2}](E_${p1.id})=${f6(-ex)}`);elems.push(`a[${i1*2+1}](N_${p1.id})=${f6(-ey)}`);}
      if(i2>=0){elems.push(`a[${i2*2}](E_${p2.id})=${f6(+ex)}`);elems.push(`a[${i2*2+1}](N_${p2.id})=${f6(+ey)}`);}
      r += `    Designrad a_D (obs ${obsIdx}): ${elems.join("  ")}\n`;
      obsIdx++;
    }
    if (addHz) {
      r += `  Riktning: σ_Hz=${f6(sigH_eff)} mgon  σ_arc=${f6(sigH_arc)} m  P_Hz=${f6(1/(sigH_arc*sigH_arc))}\n`;
      const e2=[];
      const i1h=freePts_.findIndex(p=>p.id===p1.id), i2h=freePts_.findIndex(p=>p.id===p2.id);
      const sIdx=stnIds.indexOf(p1.id);
      if(i1h>=0){e2.push(`a[${i1h*2}](E_${p1.id})=${f6(+ey)}`);e2.push(`a[${i1h*2+1}](N_${p1.id})=${f6(-ex)}`);}
      if(i2h>=0){e2.push(`a[${i2h*2}](E_${p2.id})=${f6(-ey)}`);e2.push(`a[${i2h*2+1}](N_${p2.id})=${f6(+ex)}`);}
      if(sIdx>=0) e2.push(`a[${freePts_.length*2+sIdx}](z_${p1.id})=${f6(-dist_m)}`);
      r += `    Designrad a_Hz (obs ${obsIdx}): ${e2.join("  ")}\n`;
      obsIdx++;
    }
  });
  r += "\n";

  r += `${SEP}\n4. NORMALMATRIS N och QXX\n${sep}\n`;
  r += `N är en ${sr.unkn_n}×${sr.unkn_n}-matris.\n\n`;
  if (sr.Qxx) {
    const n_ = sr.unkn_n;
    r += `Qxx diagonal [${n_}×${n_}]:\n`;
    for (let i=0; i<n_; i++) {
      let name;
      if (i<freePts_.length*2) { const pi=Math.floor(i/2); name=(i%2===0?"E_":"N_")+freePts_[pi].id; }
      else name="z_"+stnIds[i-freePts_.length*2];
      r += `  Qxx[${rp(i,2)},${rp(i,2)}] (${pad(name,18)}) = ${f6(sr.Qxx[i][i])}  →  σ = ${f4(Math.sqrt(Math.max(0,sr.Qxx[i][i]))*1000)} mm\n`;
    }
    r += "\n";
    r += `Koordinatkovariansblock per punkt:\n${sep}\n`;
    freePts_.forEach((p,i) => {
      const Qee=sr.Qxx[i*2][i*2],Qnn=sr.Qxx[i*2+1][i*2+1],Qen=sr.Qxx[i*2][i*2+1];
      const mean=(Qee+Qnn)/2, disc=Math.sqrt(((Qee-Qnn)/2)**2+Qen*Qen);
      r += `${p.id}:\n  Qee=${f6(Qee)}  Qnn=${f6(Qnn)}  Qen=${f6(Qen)}\n`;
      r += `  σ_E=${f4(Math.sqrt(Math.max(0,Qee))*1000)} mm  σ_N=${f4(Math.sqrt(Math.max(0,Qnn))*1000)} mm\n`;
      r += `  a=${f4(Math.sqrt(mean+disc)*1000)} mm  b=${f4(Math.sqrt(Math.max(0,mean-disc))*1000)} mm  θ=${f4(Math.atan2(2*Qen,Qee-Qnn)*0.5*180/Math.PI)}°\n\n`;
    });
  }

  r += `${SEP}\n5. REDUNDANSBIDRAG  r_i = 1 − H_ii\n${sep}\n`;
  r += `Kontrollsumma: Σr_i = ${sr.redund.reduce((a,b)=>a+b.ri,0).toFixed(6)}  (ska = ${sr.redundancy})\n\n`;
  r += `${pad("Obs",5)} ${pad("Sträcka",14)} ${pad("Typ",9)} ${rp("r_i",8)} ${rp("MUF",12)} ${rp("KP mm",7)}\n${sep}\n`;
  sr.redund.forEach((rd,i) => {
    const mufS=rd.mdb.val===Infinity?"∞":rd.type==="dist"?(rd.mdb.val*1000).toFixed(3)+"mm":rd.mdb.val.toFixed(4)+"mgon";
    const kpS=rd.yt_m===undefined||rd.yt_m===Infinity?"∞":(rd.yt_m*1000).toFixed(3);
    r += `${rp(i,5)} ${pad((rd.fromId||"?")+"→"+(rd.toId||"?"),14)} ${pad(rd.type==="dist"?"Avst":"Riktning",9)} ${rp(rd.ri.toFixed(6),8)} ${rp(mufS,12)} ${rp(kpS,7)}\n`;
  });
  r += "\n";

  r += `${SEP}\nFORMELFÖRTECKNING\n${sep}\n`;
  r += `Designmatris avstånd:   ∂D/∂E_i=-ex, ∂D/∂N_i=-ey, ∂D/∂E_j=+ex, ∂D/∂N_j=+ey\n`;
  r += `Designmatris riktning:  ∂r/∂E_i=+ey, ∂r/∂N_i=-ex, ∂r/∂E_j=-ey, ∂r/∂N_j=+ex, ∂r/∂z_k=-d\n`;
  r += `σ_D  = √(σ_Dmm² + (d×ppm)² + e_c²)\nMUF  = κ × σ / √r_i,   κ=${sr.kappa} (α=0.05, β=0.80)\nYT   = MUF × (1-r_i)\n\n`;
  r += `REFERENSER\n${sep}\n[1] HMK – Stommätning, Appendix F, Lantmäteriet 2021.\n[2] SIS-TS 21143:2016 – Geodesi: Stomnät.\n[3] Baarda 1968, Pope 1976, Mikhail & Gracie 1981.\n${SEP}\n`;

  const a2 = document.createElement("a");
  a2.href = URL.createObjectURL(new Blob([r], { type:"text/plain;charset=utf-8" }));
  a2.download = `nätsim_beräkning_${new Date().toISOString().slice(0,10)}.txt`;
  a2.click();
}
