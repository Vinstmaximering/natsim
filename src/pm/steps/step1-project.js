// Steg 1 – Projekt, verksamhet, nättyp och personal
// Bygger form via innerHTML + addEventListener (inga inline onclick-strängar).
//
// Etapp 3: verksamhet och nättyp styr hela rapporten – dokumenttyp, mall,
// kodsystem och vilka kontroller som körs. De ligger därför överst, och
// nättypslistan byggs om när verksamheten ändras.
import { nf } from '../../core/format.js';
import { klassificeraKtal } from '../../core/constants.js';
import {
  VERKSAMHETER, nattyperFor, dokumenttyp, arTrafikverket, kodsystemFor,
} from '../tdok-v6.js';

export function render(D, container, vals) {
  // Etapp 2: samma klassificerare som rapporten och huvudappen. Låg tidigare
  // som en egen jämförelse >= 0.5 mot ett krav som lyder "större än 0,5".
  const kOk = klassificeraKtal(D.sr.K_global).uppfyllerNorm;

  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">📋</div><div><div class="ct">Projekt och personal</div><div class="cd">Verksamhet, nättyp och R2 – Personal</div></div></div>
      <div class="cb">

        <div class="sec">Verksamhet och nättyp</div>
        <div class="hint" style="margin-bottom:8px">
          Valen styr dokumenttyp, rubriker och vilka automatiska kontroller som körs.
        </div>
        <div class="g2">
          <div><div class="lbl">Verksamhet *</div>
            <select id="v_verksamhet">
              <option value="">– välj –</option>
              ${VERKSAMHETER.map(v => `<option value="${v.v}">${v.l}</option>`).join("")}
            </select>
          </div>
          <div><div class="lbl">Nättyp *</div>
            <select id="v_nattyp"></select>
          </div>
          <div class="gw" id="dok-info"></div>
        </div>

        <hr class="hr"><div class="sec">Grunduppgifter</div>
        <div class="g2">
          <div><div class="lbl">Projektnamn *</div><input id="v_proj" placeholder="t.ex. Projektets namn"></div>
          <div><div class="lbl">Projektnummer</div><input id="v_projnr" placeholder="t.ex. 2024-1234"></div>
          <div><div class="lbl">Beställare</div><input id="v_best" placeholder="t.ex. Beställarens organisation"></div>
          <div><div class="lbl">Utförare</div><input id="v_utf" placeholder="t.ex. Utförarens organisation"></div>
          <div><div class="lbl">Fältmätningsdatum</div><input id="v_matdat" type="date"></div>
          <div><div class="lbl">Rapportdatum</div><input id="v_rapdat" type="date" value="${D.dag}"></div>
          <div><div class="lbl">Dokument-ID</div><input id="v_docid" placeholder="PM-2024-001 Rev.01"></div>
          <div><div class="lbl">Sekretess</div>
            <select id="v_sek"><option>Öppen</option><option>Begränsad</option><option>Konfidentiell</option></select>
          </div>
        </div>

        <hr class="hr"><div class="sec">Nätets syfte och genomförande <span class="kalla">TDOK 2014:0571 v6.0 §2.5 K2</span></div>
        <div><div class="lbl">Nätets syfte</div><textarea id="v_syfte" rows="2" placeholder="Vad nätet ska användas till"></textarea></div>
        <div style="margin-top:8px"><div class="lbl">Anslutningslösning</div><textarea id="v_anslutning" rows="2" placeholder="Hur nätet ansluts till överordnat nät"></textarea></div>
        <div style="margin-top:8px"><div class="lbl">Planerat genomförande</div><textarea id="v_genomforande" rows="2" placeholder="Hur mätningen ska utföras"></textarea></div>

        <hr class="hr"><div class="sec">Tidplan <span class="kalla">TDOK 2014:0571 v6.0 §2.5 K2 · SIS-TS 21143:2016 Bilaga B R1.4</span></div>
        <div class="g2">
          <div><div class="lbl">Startdatum</div><input id="v_tidstart" type="date"></div>
          <div><div class="lbl">Slutdatum</div><input id="v_tidslut" type="date"></div>
        </div>
        <div style="margin-top:8px"><div class="lbl">Tidplan i text</div><textarea id="v_tidplan" rows="2" placeholder="Etapper, beroenden, tider programmet ska förhålla sig till"></textarea></div>
        <div style="margin-top:8px"><div class="lbl">Sessionsindelning vid GNSS-mätning (om tillämpligt)</div><textarea id="v_gnsssess" rows="2" placeholder="Lämnas tom om GNSS inte används"></textarea></div>

        <hr class="hr"><div class="sec">Personal <span class="kalla">SIS-TS 21143:2016 Bilaga B R2 · TDOK 2014:0571 v6.0 §1.1</span></div>
        <div class="g2">
          <div><div class="lbl">Ansvarig mätingenjör</div><input id="v_ans" placeholder="Förnamn Efternamn"></div>
          <div><div class="lbl">Beräkning / rapportering</div><input id="v_berakn" placeholder="Förnamn Efternamn"></div>
          <div class="gw"><div class="lbl">Fältpersonal (en per rad)</div><textarea id="v_falt" rows="3" placeholder="Förnamn Efternamn"></textarea></div>
        </div>
        <div class="g2" style="margin-top:8px">
          <div><div class="lbl">Behörighetstyp <span class="kalla">§1.1 K1</span></div><input id="v_behtyp" placeholder="Behörighetstyp enligt TDOK 2018:0008"></div>
          <div><div class="lbl">Intygsnummer <span class="kalla">§1.1 K1</span></div><input id="v_behnr" placeholder="Behörighetsintygets nummer"></div>
        </div>
        <div class="hint" style="margin-top:6px">
          §1.1 K1: ansvarig ska ha giltigt behörighetsintyg utfärdat av Trafikverket
          enligt TDOK 2018:0008 med den behörighetstyp som kravställs.
        </div>
        <div id="jvg-erfarenhet"></div>

        <hr class="hr">
        <div><div class="lbl">Kompetenskrav <span class="kalla">SIS-TS 21143:2016 Bilaga B R2</span></div><textarea id="v_kompetens" rows="2" placeholder="Kompetenskrav för uppdraget"></textarea></div>

        <hr class="hr">
        <div class="lbl">Logotyp (valfri)</div>
        <div class="irow" id="logo-row"></div>
        <div class="hint">
          <b>Hämtat från NätSim:</b> CRS: <b>${D.crs}</b> | k=<b class="${kOk ? "rok" : "rerr"}">${nf(D.sr.K_global, 3)}</b>${D.mkKey ? ` | Mätklass: <b>${D.mkKey}</b>` : ""} | Punkter: <b>${D.allPts.length}</b>
        </div>
        <div class="br"><button class="bp" id="btn-next1">Nästa: Referenssystem →</button></div>
      </div>
    </div>`;

  // Återställ sparade värden innan de beroende fälten byggs, så att
  // nättypslistan byggs för rätt verksamhet.
  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById("v_" + k) || document.getElementById(k);
    if (el && v !== undefined) el.value = v;
  });

  const verkEl = document.getElementById("v_verksamhet");
  const natEl  = document.getElementById("v_nattyp");

  // Nättypslistan följer verksamheten. Byter användaren verksamhet behålls
  // nättypen bara om den finns kvar i den nya listan.
  function byggNattyper(behall) {
    const lista = nattyperFor(verkEl.value);
    const foreg = behall ? natEl.value : "";
    natEl.innerHTML = `<option value="">– välj –</option>` +
      lista.map(n => `<option value="${n.v}">${n.l}</option>`).join("");
    natEl.value = lista.some(n => n.v === foreg) ? foreg : "";
  }

  function visaDok() {
    const el = document.getElementById("dok-info");
    if (!el) return;
    const d = dokumenttyp(verkEl.value, natEl.value);
    if (!verkEl.value || !natEl.value || !d) {
      el.innerHTML = `<div class="hint hint-warn">Välj verksamhet och nättyp – de avgör rapportens dokumenttyp.</div>`;
      return;
    }
    const kod = kodsystemFor(verkEl.value);
    el.innerHTML = `<div class="hint">
      <b>Dokumenttyp:</b> ${d.typ} <span class="kalla">${d.kalla}</span>
      ${kod ? `<br><b>Kodsystem:</b> ${kod} <span class="kalla">TDOK 2014:0571 v6.0 §1.6</span>` : ""}
    </div>`;
  }

  // §1.1 K2–K3 gäller järnväg: dokumenterad erfarenhet av likartat
  // järnvägsprojekt och av mätning i järnvägsmiljö.
  function visaJvgErfarenhet() {
    const el = document.getElementById("jvg-erfarenhet");
    if (!el) return;
    if (verkEl.value !== "jarnvag") { el.innerHTML = ""; return; }
    el.innerHTML = `
      <div class="g2" style="margin-top:8px">
        <div class="gw"><div class="lbl">Dokumenterad erfarenhet av likartat järnvägsprojekt <span class="kalla">§1.1 K2</span></div>
          <textarea id="v_erfprojekt" rows="2"></textarea></div>
        <div class="gw"><div class="lbl">Dokumenterad erfarenhet av mätning i järnvägsmiljö <span class="kalla">§1.1 K3</span></div>
          <textarea id="v_erfmiljo" rows="2"></textarea></div>
      </div>`;
    ["erfprojekt", "erfmiljo"].forEach(k => {
      const f = document.getElementById("v_" + k);
      if (f && vals[k] !== undefined) f.value = vals[k];
    });
  }

  byggNattyper(true);
  if (vals.nattyp !== undefined) natEl.value = vals.nattyp;
  visaDok();
  visaJvgErfarenhet();

  verkEl.addEventListener("change", () => {
    byggNattyper(false);
    visaDok();
    visaJvgErfarenhet();
  });
  natEl.addEventListener("change", visaDok);

  // Logotyp-rad via DOM API (ingen inline event handler)
  _buildImgRow("logo", "Logotyp", container.querySelector("#logo-row"), window._pmImgs || {});
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => {
    vals[el.id.slice(2)] = el.value;
  });
  return vals;
}

// imgRow via DOM API – inga inline-scripts, inga escape-hell
function _buildImgRow(imgKey, label, container, imgs) {
  container.innerHTML = "";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "ifup";
  fileInput.id = "if_" + imgKey;
  container.appendChild(fileInput);

  const pickBtn = document.createElement("button");
  pickBtn.className = "ifbtn";
  pickBtn.textContent = "📁 Välj bild";
  pickBtn.addEventListener("click", () => fileInput.click());
  container.appendChild(pickBtn);

  if (imgs[imgKey]) {
    const clearBtn = document.createElement("button");
    clearBtn.className = "ifbtn";
    clearBtn.style.color = "#ff6060";
    clearBtn.textContent = "× Ta bort";
    clearBtn.addEventListener("click", () => {
      delete (window._pmImgs || {})[imgKey];
      _buildImgRow(imgKey, label, container, window._pmImgs || {});
    });
    container.appendChild(clearBtn);

    const img = document.createElement("img");
    img.className = "iprev";
    img.src = imgs[imgKey];
    container.parentElement.appendChild(img);
  }

  const status = document.createElement("span");
  status.style.cssText = "font-size:11px;color:#506070";
  status.textContent = imgs[imgKey] ? "✓ Uppladdad" : "Ej vald";
  container.appendChild(status);

  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      if (!window._pmImgs) window._pmImgs = {};
      window._pmImgs[imgKey] = e.target.result;
      _buildImgRow(imgKey, label, container, window._pmImgs);
    };
    reader.readAsDataURL(f);
  });
}
