// Steg 1 – Projekt och personal
// Bygger form via innerHTML + addEventListener (inga inline onclick-strängar).
export function render(D, container, vals) {
  const kOk = D.sr.K_global >= 0.5;
  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">📋</div><div><div class="ct">Projekt och personal</div><div class="cd">Grunduppgifter och R2 – Personal</div></div></div>
      <div class="cb">
        <div class="g2">
          <div><div class="lbl">Projektnamn *</div><input id="v_proj" placeholder="t.ex. Projektets namn"></div>
          <div><div class="lbl">Projektnummer</div><input id="v_projnr" placeholder="t.ex. 2024-1234"></div>
          <div><div class="lbl">Beställare</div><input id="v_best" placeholder="t.ex. Beställarens organisation"></div>
          <div><div class="lbl">Utförare</div><input id="v_utf" placeholder="t.ex. Utförarens organisation"></div>
          <div><div class="lbl">Ansvarig mätingenjör</div><input id="v_ans" placeholder="Förnamn Efternamn"></div>
          <div><div class="lbl">Uppdragstyp</div>
            <select id="v_nats">
              <option>Bruksnät i plan (§6.4)</option>
              <option>Anslutningsnät (§6.3)</option>
              <option>Nät för brobyggnad (§6.5.5)</option>
              <option>Nät för tunneldrivning (§6.5.3)</option>
              <option>Nät för rörelsemätning (§6.5.6)</option>
            </select>
          </div>
          <div><div class="lbl">Fältmätningsdatum</div><input id="v_matdat" type="date"></div>
          <div><div class="lbl">Rapportdatum</div><input id="v_rapdat" type="date" value="${D.dag}"></div>
          <div><div class="lbl">Dokument-ID</div><input id="v_docid" placeholder="PM-2024-001 Rev.01"></div>
          <div><div class="lbl">Sekretess</div>
            <select id="v_sek"><option>Öppen</option><option>Begränsad</option><option>Konfidentiell</option></select>
          </div>
        </div>
        <hr class="hr"><div class="sec">R2 – Personal</div>
        <div class="g2">
          <div><div class="lbl">Fältpersonal (en per rad)</div><textarea id="v_falt" rows="3" placeholder="Förnamn Efternamn"></textarea></div>
          <div><div class="lbl">Beräkning / rapportering</div><input id="v_berakn" placeholder="Förnamn Efternamn"></div>
        </div>
        <div><div class="lbl">Kompetenskrav</div><textarea id="v_kompetens" rows="2"></textarea></div>
        <hr class="hr">
        <div class="lbl">Logotyp (valfri)</div>
        <div class="irow" id="logo-row"></div>
        <div class="hint">
          <b>Hämtat från NätSim:</b> KRS: <b>${D.crs}</b> | k=<b class="${kOk ? "rok" : "rerr"}">${D.sr.K_global.toFixed(3)}</b>${D.mkKey ? ` | Mätklass: <b>${D.mkKey}</b>` : ""} | Punkter: <b>${D.allPts.length}</b>
        </div>
        <div class="br"><button class="bp" id="btn-next1">Nästa: Referenssystem →</button></div>
      </div>
    </div>`;

  // Återställ sparade värden
  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById("v_" + k) || document.getElementById(k);
    if (el) el.value = v;
  });

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
