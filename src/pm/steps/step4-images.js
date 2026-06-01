// Steg 4 – Bilder (R3.2, R3.3, R3.4, R3.12)
// imgRow byggs via DOM API – inga inline event handlers, inga escape-konkat.
export function render(D, container, vals, imgs) {
  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">🖼️</div><div><div class="ct">Bilder</div><div class="cd">Valfria egna bilder – lämnas tomt = auto-genererade nätbilder</div></div></div>
      <div class="cb">
        <div class="g2">
          <div class="gw"><div class="sec">R3.2 Översiktskarta</div></div>
          <div class="gw"><div class="lbl">Kompletterande text</div><textarea id="v_r32txt" rows="2"></textarea></div>
          <div class="gw" id="row-r32"></div>

          <div class="gw"><div class="sec" style="margin-top:6px">R3.3 Nätkarta</div></div>
          <div class="gw"><div class="lbl">Kompletterande text</div><textarea id="v_r33txt" rows="2"></textarea></div>
          <div class="gw" id="row-r33"></div>

          <div class="gw"><div class="sec" style="margin-top:6px">R3.4 Anslutningspunkter</div></div>
          <div class="gw"><div class="lbl">Kompletterande text</div><textarea id="v_r34txt" rows="2"></textarea></div>
          <div class="gw" id="row-r34"></div>

          <div class="gw"><div class="sec" style="margin-top:6px">R3.12 Punktbeskrivningar</div></div>
          <div class="gw"><div class="lbl">Text R3.12</div><textarea id="v_r312txt" rows="2"></textarea></div>
          <div class="gw" id="row-r312"></div>
        </div>
        <div class="br">
          <button class="bo" id="btn-back4">← Tillbaka</button>
          <button class="bp" id="btn-gen">Generera rapport →</button>
        </div>
      </div>
    </div>`;

  // Bygg bildrad via DOM API för varje bildslot
  ["r32", "r33", "r34", "r312"].forEach(key => {
    const labels = { r32:"Bild R3.2 (ersätter auto-genererad)", r33:"Bild R3.3", r34:"Bild R3.4", r312:"Bild R3.12 (fältfoto)" };
    buildImgRow(key, labels[key], container.querySelector("#row-" + key), imgs);
  });

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

// DOM API-baserad bildrad – kallas även från step1 (logotyp)
export function buildImgRow(imgKey, label, container, imgs) {
  if (!container) return;
  container.innerHTML = "";

  const irow = document.createElement("div");
  irow.className = "irow";

  const lbl = document.createElement("div");
  lbl.className = "lbl";
  lbl.textContent = label;
  container.appendChild(lbl);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "ifup";
  fileInput.id = "if_" + imgKey;
  irow.appendChild(fileInput);

  const pickBtn = document.createElement("button");
  pickBtn.type = "button";
  pickBtn.className = "ifbtn";
  pickBtn.textContent = "📁 Välj bild";
  pickBtn.addEventListener("click", () => fileInput.click());
  irow.appendChild(pickBtn);

  if (imgs[imgKey]) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ifbtn";
    clearBtn.style.color = "#ff6060";
    clearBtn.textContent = "× Ta bort";
    clearBtn.addEventListener("click", () => {
      delete imgs[imgKey];
      buildImgRow(imgKey, label, container, imgs);
    });
    irow.appendChild(clearBtn);
  }

  const status = document.createElement("span");
  status.style.cssText = "font-size:11px;color:#506070";
  status.textContent = imgs[imgKey] ? "✓ Uppladdad" : "Ej vald – auto";
  irow.appendChild(status);
  container.appendChild(irow);

  if (imgs[imgKey]) {
    const prev = document.createElement("img");
    prev.className = "iprev";
    prev.src = imgs[imgKey];
    container.appendChild(prev);
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      imgs[imgKey] = e.target.result;
      buildImgRow(imgKey, label, container, imgs);
    };
    reader.readAsDataURL(f);
  });
}
