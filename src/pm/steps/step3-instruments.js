// Steg 3 – Instrument och mätmetod
import { nf } from '../../core/format.js';
import { TACKNINGSFAKTOR, TACKNINGSFAKTOR_FORVAL, TACKNINGSFAKTOR_KALLA } from '../tdok-v6.js';

export function render(D, container, vals) {
  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">📡</div><div><div class="ct">Instrument och mätmetod</div><div class="cd">Instrument, utrustning, metod och toleranskrav</div></div></div>
      <div class="cb">
        <div class="hint">
          <!-- Omgång 2: "σ riktning"/"σ avstånd" i stället för σ_Hz/σ_D, samma
               ord som mätningsmodalen och studiovyerna. Se Fix 2. -->
          <b>Hämtat från NätSim:</b> <b>${D.ins}</b> | σ riktning=<b>${nf(D.mHz, 3)} mgon</b> |
          σ avstånd=<b>${nf(D.mDm, 1)} mm + ${nf(D.mDp, 1)} ppm</b> |
          ${D.mSt} helsatser | centreringsfel=${nf(D.centerErr, 1)} mm
        </div>
        <div class="g2">
          <div><div class="lbl">Totalstation</div><input id="v_instr" placeholder="fabrikat/typ" value="${D.ins}"></div>
          <div><div class="lbl">Serienummer</div><input id="v_serienr" placeholder="ex. 890562"></div>
          <div><div class="lbl">Kalibrering / verifikat</div><input id="v_kalib" placeholder="ex. 2024-03-15"></div>
          <div><div class="lbl">Tvångscentriering</div><input id="v_tvang" placeholder="fabrikat/modell"></div>
          <div><div class="lbl">Fältprogramvara</div><input id="v_swfalt" placeholder="fabrikat/version"></div>
          <div><div class="lbl">Beräkningsprogramvara</div><input id="v_swber" placeholder="programvara/version"></div>
        </div>
        <hr class="hr">
        <div class="sec">Kompletterande utrustning <span class="kalla">TDOK 2014:0571 v6.0 §2.5 K2 · §2.8 K15 · K19</span></div>
        <div class="hint">
          §2.8 K15 kräver tvångscentrering. §2.8 K19 kräver att temperatur och lufttryck
          mäts med kalibrerad termometer och barometer. Fälten kontrolleras automatiskt
          i rapportens kravtabell.
        </div>
        <div class="g2">
          <div><div class="lbl">Termometer <span class="kalla">§2.8 K19</span></div><input id="v_termometer" placeholder="fabrikat/modell, kalibrering"></div>
          <div><div class="lbl">Barometer <span class="kalla">§2.8 K19</span></div><input id="v_barometer" placeholder="fabrikat/modell, kalibrering"></div>
          <div class="gw"><div class="lbl">Tvångscentreringsutrustning <span class="kalla">§2.8 K15</span></div><input id="v_tvangutr" placeholder="fabrikat/modell"></div>
          <div class="gw"><div class="lbl">GNSS-mottagare och antenner (om tillämpligt)</div><input id="v_gnssutr" placeholder="Lämnas tom om GNSS inte används"></div>
        </div>
        <hr class="hr">
        <div><div class="lbl">Mätmetod och genomförande</div><textarea id="v_metod" rows="4" placeholder="Beskriv mätmetod, antal helsatser..."></textarea></div>
        <div><div class="lbl">Korrektioner</div><textarea id="v_korr" rows="2" placeholder="ex. Höjdreduktion, atmosfärisk korrektion..."></textarea></div>
        <hr class="hr"><div class="sec">Toleranskrav <span class="kalla">SIS-TS 21143:2016 Bilaga B R3.9</span></div>
        <div class="hint">
          ${TACKNINGSFAKTOR_KALLA}: "Om inget anges kopplat till uttrycket osäkerhet är det
          täckningsfaktor 2 som avses." Förvalet är därför utökad osäkerhet. Valet styr vilken
          storhet rapporten jämför kravet mot – u (1σ) eller U = 2·u.
        </div>
        <div class="g2">
          <div><div class="lbl">Krav σ_pos (mm)</div><input id="v_krav" type="number" placeholder="ex. 5" value="${D.sigReq ?? ''}"></div>
          <div><div class="lbl">Kravet avser <span class="kalla">§1 K2</span></div>
            <select id="v_kravk">
              ${TACKNINGSFAKTOR.map(t => `<option value="${t.v}">${t.l}</option>`).join("")}
            </select>
          </div>
          <div class="gw"><div class="lbl">Övriga krav</div><input id="v_krav2" placeholder="Toleranser utöver σ_pos"></div>
        </div>
        <div><div class="lbl">Omdöme / noteringar</div><textarea id="v_omdome" rows="3" placeholder="Komplettera automatiskt omdöme..."></textarea></div>
        <hr class="hr">
        <div class="g2">
          <div class="gw"><div class="lbl">Leveransomfattning <span class="kalla">SIS-TS 21143:2016 Bilaga B R4.1</span></div><textarea id="v_leverans" rows="2"></textarea></div>
          <div class="gw"><div class="lbl">Leveransformat <span class="kalla">SIS-TS 21143:2016 Bilaga B R4.2</span></div><input id="v_levformat" placeholder="t.ex. .geo, PDF, DWG"></div>
        </div>
        <div class="br">
          <button class="bo" id="btn-back4">← Tillbaka</button>
          <button class="bp" id="btn-next4">Nästa: Bilder →</button>
        </div>
      </div>
    </div>`;

  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById("v_" + k);
    if (el && v !== undefined) el.value = v;
  });

  // §1 K2: täckningsfaktor 2 gäller när inget annat anges. Ett utkast utan
  // uppgift – och ett nytt PM – får därför utökad osäkerhet.
  const kEl = document.getElementById("v_kravk");
  if (kEl && !vals.kravk) kEl.value = TACKNINGSFAKTOR_FORVAL;
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => { vals[el.id.slice(2)] = el.value; });
  return vals;
}
