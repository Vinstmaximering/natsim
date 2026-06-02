// Steg 3 – Instrument och mätmetod
export function render(D, container, vals) {
  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">📡</div><div><div class="ct">Instrument och mätmetod</div><div class="cd">R3.5 – SIS-TS 21143:2016 Bilaga B</div></div></div>
      <div class="cb">
        <div class="hint">
          <b>Hämtat från NätSim:</b> <b>${D.ins}</b> | σ_Hz=<b>${D.mHz.toFixed(3)} mgon</b> |
          σ_D=<b>${D.mDm.toFixed(1)} mm+${D.mDp.toFixed(1)} ppm</b> |
          ${D.mSt} satser | e_c=${D.centerErr.toFixed(1)} mm
        </div>
        <div class="g2">
          <div><div class="lbl">Totalstation</div><input id="v_instr" placeholder="fabrikat/typ" value="${D.ins}"></div>
          <div><div class="lbl">Serienummer</div><input id="v_serienr" placeholder="ex. 890562"></div>
          <div><div class="lbl">Kalibrering / verifikat</div><input id="v_kalib" placeholder="ex. 2024-03-15"></div>
          <div><div class="lbl">Tvångscentriering</div><input id="v_tvang" placeholder="fabrikat/modell"></div>
          <div><div class="lbl">Fältprogramvara</div><input id="v_swfalt" placeholder="fabrikat/version"></div>
          <div><div class="lbl">Beräkningsprogramvara</div><input id="v_swber" placeholder="programvara/version"></div>
        </div>
        <div><div class="lbl">Mätmetod och genomförande</div><textarea id="v_metod" rows="4" placeholder="Beskriv mätmetod, antal helsatser..."></textarea></div>
        <div><div class="lbl">Korrektioner</div><textarea id="v_korr" rows="2" placeholder="ex. Höjdreduktion, atmosfärisk korrektion..."></textarea></div>
        <hr class="hr"><div class="sec">Toleranskrav (R3.9)</div>
        <div class="g2">
          <div><div class="lbl">Krav σ_pos (mm)</div><input id="v_krav" type="number" placeholder="ex. 5" value="${D.kravSp || ''}"></div>
          <div><div class="lbl">Övriga krav</div><input id="v_krav2" placeholder=""></div>
        </div>
        <div><div class="lbl">Omdöme / noteringar</div><textarea id="v_omdome" rows="3" placeholder="Komplettera automatiskt omdöme..."></textarea></div>
        <hr class="hr">
        <div><div class="lbl">Leveransomfattning (R4.1)</div><textarea id="v_leverans" rows="2"></textarea></div>
        <div class="br">
          <button class="bo" id="btn-back3">← Tillbaka</button>
          <button class="bp" id="btn-next3">Nästa: Bilder →</button>
        </div>
      </div>
    </div>`;

  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById("v_" + k);
    if (el && v !== undefined) el.value = v;
  });
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => { vals[el.id.slice(2)] = el.value; });
  return vals;
}
