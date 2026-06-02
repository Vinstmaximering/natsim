// Bygger A4-rapporten som HTML-sträng.
// buildReport(data) är en PUR FUNKTION – inga DOM-anrop, inga globaler.
// Testad av tests/pm.test.js.
//
// data = { vals, sr, redund, ptRes, allPts, knownPts, mk, mkKey,
//          crs, ins, mHz, mDm, mDp, mSt, dag, centerErr, img, imgs }
//
// 10 sektioner (1-10) identiska med originalet pmPopupHTML/genReport.

export function buildReport(data) {
  const { vals = {}, sr, redund = [], ptRes = [], allPts = [], knownPts = [],
          mk, mkKey = "", crs, ins, mHz, mDm, mDp, mSt, dag, centerErr,
          img = "", imgs = {} } = data;

  const v    = k => (vals[k] || "").toString().trim();
  const proj = v("proj") || "–",  projnr = v("projnr") || "–";
  const best = v("best") || "–",  utf    = v("utf")    || "–";
  const ans  = v("ans")  || "–",  nats   = v("nats")   || "Bruksnät i plan";
  const rapdat = v("rapdat") || dag;
  const sek    = v("sek")    || "Öppen";
  const plansys = v("plansys") || crs;
  const hoj     = v("hoj")    || "RH 2000";
  const geo     = v("geo")    || "SWEN17_RH2000";
  const kordkalla = v("kordkalla") || "–";
  const instrV    = v("instr")     || ins;
  const serienr   = v("serienr")   || "–";
  const kalib     = v("kalib")     || "–";
  const tvang     = v("tvang")     || "–";
  const swfalt    = v("swfalt")    || "–";
  const swber     = v("swber")     || "–";
  const metod     = v("metod");
  const korr      = v("korr");
  const falt      = v("falt")   || "–";
  const berakn    = v("berakn") || "–";
  const omdome    = v("omdome");
  const leverans  = v("leverans");
  const r32txt    = v("r32txt");
  const r33txt    = v("r33txt");
  const r34txt    = v("r34txt");
  const r312txt   = v("r312txt");
  const kravStr   = v("krav");
  const kravSP    = parseFloat(kravStr) || 999;

  const kOk   = sr.K_global >= 0.5;
  const spv   = ptRes.map(r => r.sigPos * 1000);
  const spMax = spv.length ? Math.max(...spv).toFixed(2) : "–";
  const spMean = spv.length ? (spv.reduce((a,b)=>a+b,0)/spv.length).toFixed(2) : "–";
  const allOk = spv.length > 0 && spv.every(v => v <= kravSP);

  const ris   = redund.map(r => r.ri);
  let kstd = 0;
  if (ris.length) {
    const km = ris.reduce((a,b)=>a+b,0)/ris.length;
    kstd = Math.sqrt(ris.reduce((a,b)=>a+(b-km)*(b-km),0)/ris.length);
  }
  const kOmdome  = sr.K_global>=0.5 && (ris.length?Math.min(...ris):0)>=0.3 ? "Starkt kontrollerbart"
                 : sr.K_global>=0.3 ? "Acceptabelt kontrollerbart" : "Otillräcklig kontrollerbarhet";
  const homOmdome = kstd<0.08 ? "Homogent" : kstd<0.15 ? "Acceptabelt homogent" : "Inhomogent";
  const stabCls   = sr.K_global>=0.5&&kstd<0.08 ? "bok" : sr.K_global<0.3 ? "berr" : "bwrn";
  const stabTxt   = sr.K_global>=0.5&&kstd<0.08
    ? "Nätet bedöms som stabilt. Kontrollerbarheten är god och nätet är homogent utformat."
    : sr.K_global<0.3
    ? "Nätet bedöms som instabilt. Kontrollerbarheten är otillräcklig – fler mätningar krävs."
    : "Nätet har viss kontrollerbarhet men homogeniteten bör förbättras.";

  const mufD = redund.filter(r=>r.type==="dist"&&r.mdb).map(r=>r.mdb.val*1000);
  const mufH = redund.filter(r=>r.type==="hz"&&r.mdb).map(r=>r.mdb.val);
  const mufMaxD = mufD.length ? Math.max(...mufD).toFixed(1) : "–";
  const mufMaxH = mufH.length ? Math.max(...mufH).toFixed(3) : "–";
  const ytD = redund.filter(r=>r.type==="dist"&&r.yt_m!=null&&r.yt_m!==Infinity).map(r=>r.yt_m*1000);
  const ytMaxD = ytD.length ? Math.max(...ytD).toFixed(1) : "–";

  const ptTypes = { known:"Känd punkt", station:"Uppställning", new:"Ny punkt", detail:"Detaljpunkt", simstation:"Sim. uppst." };

  const ptTab = allPts.map(p =>
    `<tr><td style="font-weight:${p.type==='known'?'700':'normal'}">${esc(p.id)}</td>
     <td>${ptTypes[p.type]||p.type}</td>
     <td style="text-align:right;font-family:monospace">${p.N.toFixed(4)}</td>
     <td style="text-align:right;font-family:monospace">${p.E.toFixed(4)}</td>
     <td style="text-align:right;font-family:monospace">${p.H?p.H.toFixed(4):"–"}</td>
     <td>${esc(p.markering||"–")}</td>
     <td>${esc(p.prisma||"–")}</td></tr>`
  ).join("");

  const spTab = ptRes.map(r => {
    const sm = (r.sigPos*1000).toFixed(2);
    const ok = r.sigPos*1000 <= kravSP;
    return `<tr><td>${esc(r.id)}</td>
     <td style="text-align:right;font-family:monospace">${(r.sigN*1000).toFixed(2)}</td>
     <td style="text-align:right;font-family:monospace">${(r.sigE*1000).toFixed(2)}</td>
     <td style="text-align:right;font-family:monospace;font-weight:700;color:${ok?"#006600":"#cc0000"}">${sm}</td>
     <td style="text-align:right;font-family:monospace">${r.aSemi?(r.aSemi*1000).toFixed(2):"–"}</td>
     <td style="text-align:right;font-family:monospace">${r.bSemi?(r.bSemi*1000).toFixed(2):"–"}</td></tr>`;
  }).join("");

  const rdTab = redund.map(r => {
    const ok  = r.ri >= 0.5;
    const muf = r.mdb ? (r.type==="dist"?(r.mdb.val*1000).toFixed(1)+" mm":r.mdb.val.toFixed(3)+" mgon") : "–";
    const yt  = r.yt_m!=null&&r.yt_m!==Infinity
      ? (r.type==="dist"?(r.yt_m*1000).toFixed(1)+" mm":(r.yt_m/r.d*(200000/Math.PI)).toFixed(3)+" mgon")
      : (r.yt_m===Infinity?"∞":"–");
    return `<tr><td style="font-weight:700">${esc(r.fromId)}→${esc(r.toId)}</td>
     <td>${r.type==="dist"?"Längd":"Riktning"}</td>
     <td style="text-align:right;font-family:monospace;font-weight:700;color:${ok?"#006600":"#cc0000"}">${r.ri.toFixed(3)}</td>
     <td style="text-align:right;font-family:monospace">${muf}</td>
     <td style="text-align:right;font-family:monospace">${yt}</td></tr>`;
  }).join("");

  const pbTab = allPts.filter(p=>p.markering||p.prisma).map(p =>
    `<tr><td style="font-weight:700">${esc(p.id)}</td><td>${ptTypes[p.type]||p.type}</td>
     <td>${esc(p.markering||"–")}</td><td>${esc(p.prisma||"–")}</td></tr>`
  ).join("");

  const netImg  = imgs.r32 || img;
  const nätImg  = imgs.r33 || img;
  const logoEl  = imgs.logo ? `<img class="rlogo" src="${imgs.logo}" alt="Logo">` : `<div style="height:10mm"></div>`;

  let h = "";

  // ── FÖRSÄTTSBLAD ──────────────────────────────────────────────────────────
  h += `<div class="rc">`;
  h += logoEl;
  h += `<div class="rbg">Mätningsteknisk redovisning – Planering</div>`;
  h += `<div class="rtit">${esc(proj)}</div>`;
  h += `<div class="rsub">Stomnät i plan – Mätningstekniskt PM</div>`;
  h += `<div class="rmet">`;
  h += `<div><strong>Projektnummer:</strong> ${esc(projnr)}</div>`;
  h += `<div><strong>Beställare:</strong> ${esc(best)}</div>`;
  h += `<div><strong>Utförare:</strong> ${esc(utf)}</div>`;
  h += `<div><strong>Uppdragstyp:</strong> ${esc(nats)}</div>`;
  if (mkKey) h += `<div><strong>Mätklass:</strong> ${esc(mkKey)} (SIS-TS 21143:2016 Tab. A.9)</div>`;
  h += `<div><strong>Datum:</strong> ${esc(rapdat)}</div>`;
  const netStab = sr.K_global>=0.5&&kstd<0.08?"rok":sr.K_global<0.3?"rerr":"rwrn";
  const netTxt  = sr.K_global>=0.5&&kstd<0.08?"✓ STABILT OCH KONTROLLERBART":sr.K_global<0.3?"✗ EJ GODKÄNT":"⚠ ACCEPTABELT";
  h += `<div><strong>Nätbedömning:</strong> <span class="${netStab}">${netTxt} (k=${sr.K_global.toFixed(3)})</span></div>`;
  h += `</div>`;
  h += `<div class="rstd">SIS-TS 21143:2016 · HMK Stommätning 2024 · TDOK 2014:0571 | ${esc(sek)}</div>`;
  h += `</div>`;

  // ── 1. Uppdragsbeskrivning ────────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">1. Uppdragsbeskrivning</h1>`;
  h += `<table class="rm">
    <tr><td>Projekt</td><td>${esc(proj)}</td></tr>
    <tr><td>Projektnummer</td><td>${esc(projnr)}</td></tr>
    <tr><td>Beställare</td><td>${esc(best)}</td></tr>
    <tr><td>Utförare</td><td>${esc(utf)}</td></tr>
    <tr><td>Ansvarig</td><td>${esc(ans)}</td></tr>
    <tr><td>Uppdragstyp</td><td>${esc(nats)}</td></tr>
    <tr><td>Datum</td><td>${esc(rapdat)}</td></tr>
    <tr><td>Sekretess</td><td>${esc(sek)}</td></tr>
  </table>`;

  // ── 2. Gällande föreskrifter ──────────────────────────────────────────────
  h += `<h1 class="r">2. Gällande föreskrifter (R1.4)</h1>
  <table class="r">
    <tr><th>Standard</th><th>Titel</th><th>Tillämpning</th></tr>
    <tr><td>SIS-TS 21143:2016</td><td>Geodetisk mätning och beräkning</td><td>Primär standard</td></tr>
    <tr><td>HMK – Stommätning 2024</td><td>Handbok i mät- och kartfrågor</td><td>Grundutföranden</td></tr>
    <tr><td>TDOK 2014:0571</td><td>Trafikverkets krav Geodesi</td><td>Trafikverkets projekt</td></tr>
  </table></div>`;

  // ── 3. Förutsättningar ────────────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">3. Förutsättningar (R1)</h1>`;
  h += `<h2 class="r">3.1 Uppdragets omfattning (R1.1)</h2>
        <p class="r">Etablering av ${esc(nats)} för projekt ${esc(proj)}. Beställare: ${esc(best)}.</p>`;
  h += `<h2 class="r">3.2 Underlagsmaterial (R1.2)</h2>
        <p class="r">Koordinatkälla: ${esc(kordkalla)}</p>
        <table class="r">
          <tr><th>Punkt</th><th>N (m)</th><th>E (m)</th><th>H (m)</th><th>Markering</th></tr>
          ${knownPts.map(p=>`<tr><td style="font-weight:700">${esc(p.id)}</td>
            <td style="text-align:right;font-family:monospace">${p.N.toFixed(4)}</td>
            <td style="text-align:right;font-family:monospace">${p.E.toFixed(4)}</td>
            <td style="text-align:right;font-family:monospace">${p.H?p.H.toFixed(4):"–"}</td>
            <td>${esc(p.markering||"–")}</td></tr>`).join("")}
        </table>`;
  h += `<h2 class="r">3.3 Referenssystem (R1.3)</h2>
        <table class="rm">
          <tr><td>Koordinatsystem</td><td>${esc(plansys)} (${esc(crs)})</td></tr>
          <tr><td>Höjdsystem</td><td>${esc(hoj)}</td></tr>
          <tr><td>Geoidmodell</td><td>${esc(geo)}</td></tr>
        </table>`;
  if (mkKey && mk) {
    h += `<h2 class="r">3.4 Mätklass (SIS-TS Tab. A.9)</h2>
          <div class="rbox">${esc(mk.beskrivning)}</div>
          <table class="r">
            <tr><th>Parameter</th><th>Krav</th></tr>
            <tr><td>Totalstation</td><td>${esc(mk.totalstation)}</td></tr>
            <tr><td>σ riktning</td><td>${mk.sigHz_mgon} mgon</td></tr>
            <tr><td>σ avstånd</td><td>${mk.sigDist_mm} mm + ${mk.sigDist_ppm} ppm</td></tr>
            <tr><td>Helsatser</td><td>≥${mk.numSatser}</td></tr>
            <tr><td>Centrering</td><td>${mk.centerErr} mm</td></tr>
          </table>`;
  }
  h += `</div>`;

  // ── 4. Personal ───────────────────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">4. Personal (R2)</h1>
        <table class="rm">
          <tr><td>Ansvarig</td><td>${esc(ans)}</td></tr>
          <tr><td>Fältpersonal</td><td>${esc(falt).replace(/\n/g,"<br>")}</td></tr>
          <tr><td>Beräkning</td><td>${esc(berakn)}</td></tr>
        </table></div>`;

  // ── 5. Nätutformning ──────────────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">5. Nätutformning (R3.1–R3.4)</h1>`;
  h += `<h2 class="r">5.1 Redogörelse</h2>
        <div class="rbox">Observationer: ${sr.meas_n} | Obekanta: ${sr.unkn_n} | Redundans f=${sr.redundancy} | k=${sr.K_global.toFixed(3)}</div>`;
  h += `<h2 class="r">5.2 Översikt av nätet (R3.2)</h2>`;
  if (r32txt) h += `<p class="r">${esc(r32txt)}</p>`;
  if (netImg) h += `<div class="fig"><img src="${netImg}" style="max-width:155mm"><div class="fcp">Figur. Nätets utbredning.</div></div>`;
  h += `<h2 class="r">5.3 Kända anslutningspunkter (R3.3)</h2>`;
  if (r33txt) h += `<p class="r">${esc(r33txt)}</p>`;
  if (nätImg) h += `<div class="fig"><img src="${nätImg}" style="max-width:155mm"><div class="fcp">Figur. Kända anslutningspunkter.</div></div>`;
  h += `<h2 class="r">5.4 Mätgeometri och planerade observationer (R3.4)</h2>`;
  if (r34txt) h += `<p class="r">${esc(r34txt)}</p>`;
  if (imgs.r34) h += `<div class="fig"><img src="${imgs.r34}" style="max-width:155mm"><div class="fcp">Figur. Planerad mätgeometri och observationer.</div></div>`;
  h += `<h2 class="r">5.5 Planerade punkter</h2>
        <table class="r">
          <tr><th>Punkt</th><th>Typ</th><th>N (m)</th><th>E (m)</th><th>H (m)</th><th>Markering</th><th>Prisma</th></tr>
          ${ptTab}
        </table>`;
  h += `<h2 class="r">5.6 Lägesosäkerheter (R3.12)</h2>`;
  if (r312txt) h += `<p class="r">${esc(r312txt)}</p>`;
  if (imgs.r312) h += `<div class="fig"><img src="${imgs.r312}" style="max-width:155mm"><div class="fcp">Figur. Lägesosäkerheter (1σ felellipser).</div></div>`;
  if (pbTab) {
    h += `<h2 class="r">5.7 Punktbeskrivningar</h2>
          <table class="r">
            <tr><th>Punkt</th><th>Typ</th><th>Markering</th><th>Prisma</th></tr>${pbTab}</table>`;
  }
  h += `</div>`;

  // ── 6. Instrument och mätmetod ────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">6. Instrument och mätmetod (R3.5)</h1>
        <table class="rm">
          <tr><td>Totalstation</td><td>${esc(instrV)}</td></tr>
          ${serienr!=="–"?`<tr><td>Serienummer</td><td>${esc(serienr)}</td></tr>`:""}
          ${kalib!=="–"?`<tr><td>Kalibrering</td><td>${esc(kalib)}</td></tr>`:""}
          ${tvang!=="–"?`<tr><td>Tvångscentriering</td><td>${esc(tvang)}</td></tr>`:""}
          <tr><td>Fältprogramvara</td><td>${esc(swfalt)}</td></tr>
          <tr><td>Beräkningsprogramvara</td><td>${esc(swber)}</td></tr>
        </table>
        <h2 class="r">6.1 A priori standardavvikelse</h2>
        <table class="r">
          <tr><th>Typ</th><th>σ</th><th>Satser</th></tr>
          <tr><td>Riktningar</td><td>${mHz.toFixed(3)} mgon</td><td>${mSt}</td></tr>
          <tr><td>Längder</td><td>${mDm.toFixed(1)} mm + ${mDp.toFixed(1)} ppm</td><td>–</td></tr>
          <tr><td>Centrering</td><td>${centerErr.toFixed(1)} mm</td><td>–</td></tr>
        </table>`;
  if (metod) h += `<h2 class="r">6.2 Mätprogram</h2><p class="r">${esc(metod)}</p>`;
  if (korr)  h += `<h2 class="r">6.3 Korrektioner</h2><p class="r">${esc(korr)}</p>`;
  h += `</div>`;

  // ── 7. Simulering och kvalitetsbedömning ──────────────────────────────────
  h += `<div class="rb"><h1 class="r">7. Simulering och kvalitetsbedömning (R3.9)</h1>
        <p class="r">Simulering utförd enligt SIS-TS 21143:2016 §6.2.5 och HMK Stommätning 2024 Bilaga F.</p>`;
  if (kravStr) h += `<div class="rbox"><strong>Toleranskrav:</strong> σ_pos ≤ ${esc(kravStr)} mm</div>`;
  h += `<h2 class="r">7.1 Nätstatistik</h2>
        <table class="rm">
          <tr><td>Observationer (n)</td><td>${sr.meas_n}</td></tr>
          <tr><td>Obekanta (u)</td><td>${sr.unkn_n}</td></tr>
          <tr><td>Redundans f</td><td>${sr.redundancy}</td></tr>
          <tr><td>Kontrollerbarhet k</td><td class="${kOk?"rok":"rerr"}" style="font-weight:700">${sr.K_global.toFixed(3)} – ${kOmdome}</td></tr>
          <tr><td>κ (HMK F.16)</td><td>${sr.kappa}</td></tr>
          <tr><td>Min k_i (avst.)</td><td>${sr.rMinDist!=null?sr.rMinDist.toFixed(3):"–"}</td></tr>
          <tr><td>Min k_i (riktning)</td><td>${sr.rMinHz!=null?sr.rMinHz.toFixed(3):"–"}</td></tr>
        </table>`;
  h += `<h2 class="r">7.2 Mätningars k_i, MUF och YT</h2>
        <p class="r">k_i = individuellt k-tal (HMK F.2). MUF = Minsta Urskiljbara Fel (HMK F.13). YT = Yttre Tillförlitlighet.</p>
        <table class="r">
          <tr><th>Från → Till</th><th>Typ</th><th>k_i</th><th>MUF</th><th>YT</th></tr>
          ${rdTab}
        </table>
        <p style="font-size:8pt;color:#555;margin-top:1.5mm">Grön = k_i ≥ 0,50 (SIS-TS), röd = under gräns.</p>`;
  h += `<h2 class="r">7.3 Tillförlitlighet och homogenitet</h2>
        <div class="rbox ${stabCls}"><strong>Stabilitetsbedömning:</strong> ${stabTxt}</div>
        <div class="rbox"><strong>Inre tillförlitlighet (MUF):</strong> Det minsta grova fel som kan detekteras är
          ${mufMaxD!=="–"?"avst. ≤"+mufMaxD+" mm ":""}${mufMaxH!=="–"?"riktning ≤"+mufMaxH+" mgon":""}.
          <strong>YT:</strong> Max påverkan ${ytMaxD} mm. <strong>Homogenitet:</strong> ${homOmdome} (σ(k_i)=${kstd.toFixed(3)}).
        </div>`;
  h += `<h2 class="r">7.4 Förväntade punktmedelfel</h2>`;
  if (kravStr) h += `<p class="r">Krav: σ_pos ≤ ${esc(kravStr)} mm. <span class="${allOk?"rok":"rerr"}">${allOk?"✓ Alla nypunkter uppfyller kravet":"✗ En eller flera uppfyller ej kravet"}</span></p>`;
  h += `<table class="r" style="width:auto">
          <tr><th>Punkt</th><th>σ_N mm</th><th>σ_E mm</th><th>σ_pos mm</th><th>σ_a mm</th><th>σ_b mm</th></tr>
          ${spTab}
        </table>
        <table class="rm" style="margin-top:4mm">
          <tr><td>Medel σ_pos</td><td>${spMean} mm</td></tr>
          <tr><td>Max σ_pos</td><td>${spMax} mm</td></tr>
        </table>`;
  if (omdome) h += `<p class="r">${esc(omdome)}</p>`;
  h += `</div>`;

  // ── 8. Programvaror ───────────────────────────────────────────────────────
  h += `<div class="rb"><h1 class="r">8. Programvaror (R3.11)</h1>
        <table class="rm">
          <tr><td>Fält</td><td>${esc(swfalt)}</td></tr>
          <tr><td>Beräkning</td><td>${esc(swber)}</td></tr>
        </table>`;

  // ── 9. Koordinatförteckning ───────────────────────────────────────────────
  h += `<h1 class="r">9. Koordinatförteckning (R3.13)</h1>
        <table class="r">
          <tr><th>Punkt</th><th>Typ</th><th>N (m)</th><th>E (m)</th><th>H (m)</th><th>Markering</th><th>Prisma</th></tr>
          ${ptTab}
        </table>`;

  // ── 10. Leverans ──────────────────────────────────────────────────────────
  h += `<h1 class="r">10. Leverans (R4)</h1>`;
  h += leverans
    ? `<p class="r">${esc(leverans)}</p>`
    : `<p class="r" style="color:#888;font-style:italic">Specificeras vid leverans.</p>`;
  h += `</div>`;

  return h;
}

// HTML-escape för att förhindra XSS i rapporten
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
