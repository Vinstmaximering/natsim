// Steg 4 – Bilder (R3.2, R3.3, R3.4, R3.12)
// Lokala presets + postMessage-bro till huvudfönstret för satellit/karta-bakgrund.
// Vit och rutnät genereras lokalt (snabbt). Satellit/karta skickar request till opener.
import { generateNetImage } from '../../reports/net-image.js';
import { setState }          from '../../state/store.js';
import { IMAGE_PRESETS }     from '../image-presets.js';

// I-session metadata: källa och preset per bildslot.
// Inte persistent – auto-bilder regenereras via "⟲ Återskapa" vid behov.
let _imgsMeta = {};
export function _resetImgsMeta() { _imgsMeta = {}; }

// Välj default-bakgrundsvärde baserat på aktivt kartlager i huvudfönstret.
function _defaultBg(layerKey) {
  return (layerKey === 'satellite' || layerKey === 'osm') ? 'tiles' : 'white';
}

export function render(D, container, vals, imgs) {
  container.innerHTML = `
    <div class="card">
      <div class="ch"><div class="ci">🖼️</div><div><div class="ct">Bilder</div><div class="cd">Auto-generera nätbilder eller ladda upp egna</div></div></div>
      <div class="cb">
        <div style="padding:4px 0 12px;display:flex;align-items:center;gap:8px">
          <label style="font-size:12px;color:#7090a8">Bakgrund:</label>
          <select id="sel-bg" style="font-size:12px;background:#0d1520;color:#c8d8e8;border:1px solid #2a4060;border-radius:3px;padding:2px 6px">
            <option value="tiles">Satellit/karta</option>
            <option value="white">Vit (utskriftsvänlig)</option>
            <option value="grid">Koordinatrutnät</option>
          </select>
        </div>
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

  // Sätt default-bakgrund baserat på aktivt kartlager i huvudfönstret
  const sel = document.getElementById('sel-bg');
  if (sel) sel.value = _defaultBg(D.activeLayerKey);

  const PRESET_MAP = { r32: 'R3.2', r33: 'R3.3', r34: 'R3.4', r312: 'R3.12' };
  const labels = {
    r32:  'R3.2 Översiktskarta',
    r33:  'R3.3 Nätkarta',
    r34:  'R3.4 Anslutningspunkter',
    r312: 'R3.12 Punktbeskrivningar',
  };

  ['r32', 'r33', 'r34', 'r312'].forEach(key => {
    buildImgRow(key, labels[key], container.querySelector('#row-' + key), imgs, PRESET_MAP[key], D);
  });

  Object.entries(vals).forEach(([k, v]) => {
    const el = document.getElementById('v_' + k);
    if (el && v !== undefined) el.value = v;
  });
}

export function collectFormValues() {
  const vals = {};
  document.querySelectorAll("[id^='v_']").forEach(el => { vals[el.id.slice(2)] = el.value; });
  return vals;
}

// Branchar på dropdown-värde: lokal generering (vit/rutnät) eller postMessage (satellit/karta).
function doAutoGenerate(imgKey, label, container, imgs, presetKey, D) {
  const bg = document.getElementById('sel-bg')?.value ?? 'white';
  if (bg === 'white' || bg === 'grid') {
    _doLocalGenerate(imgKey, label, container, imgs, presetKey, D, bg);
  } else {
    _doRemoteGenerate(imgKey, label, container, imgs, presetKey, D, bg);
  }
}

// Lokal generering – synkron, ingen postMessage. Används för 'white' och 'grid'.
function _doLocalGenerate(imgKey, label, container, imgs, presetKey, D, bg) {
  setState({
    pts:       D.allPts       || [],
    meas:      D.meas         || [],
    simResult: D.imgSimResult || null,
    activeCRS: D.activeCRS    || 'sweref99tm',
    obstacles: D.obstacles    || [],
  });
  const result = generateNetImage({ ...IMAGE_PRESETS[presetKey].options, background: bg });
  imgs[imgKey] = result.dataURL;
  _imgsMeta[imgKey] = { source: 'auto', preset: presetKey, usedFallback: result.usedFallback };
  buildImgRow(imgKey, label, container, imgs, presetKey, D);
}

// Remote generering – postMessage till opener för satellit-bakgrund med tiles.
// Timeout 15 s → fallback till lokal vit bakgrund.
function _doRemoteGenerate(imgKey, label, container, imgs, presetKey, D, bg) {
  const requestId = `${imgKey}-${Date.now()}`;
  const options   = { ...IMAGE_PRESETS[presetKey].options, background: bg };

  const loadEl = document.createElement('div');
  loadEl.style.cssText = 'font-size:11px;color:#7090a8;padding:4px 0';
  loadEl.textContent = '⏳ Genererar med satellit...';
  container.appendChild(loadEl);

  const timeoutId = setTimeout(() => {
    window.removeEventListener('message', handler);
    loadEl.remove();
    _doLocalGenerate(imgKey, label, container, imgs, presetKey, D, 'white');
  }, 15000);

  const handler = (e) => {
    if (e.data?.type !== 'net-image-result' || e.data?.requestId !== requestId) return;
    clearTimeout(timeoutId);
    window.removeEventListener('message', handler);
    loadEl.remove();
    imgs[imgKey] = e.data.dataURL;
    _imgsMeta[imgKey] = { source: 'auto', preset: presetKey, usedFallback: e.data.usedFallback };
    buildImgRow(imgKey, label, container, imgs, presetKey, D);
  };
  window.addEventListener('message', handler);
  window.opener?.postMessage({ type: 'request-net-image', requestId, options }, '*');
}

// DOM API-baserad bildrad. presetKey + D aktiverar auto-generera-knappen.
// Anropas även från step1 (logotyp) utan presetKey/D – beter sig då som tidigare.
export function buildImgRow(imgKey, label, container, imgs, presetKey = null, D = null) {
  if (!container) return;
  container.innerHTML = '';
  const meta = _imgsMeta[imgKey] || null;

  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.textContent = label;
  container.appendChild(lbl);

  const irow = document.createElement('div');
  irow.className = 'irow';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'ifup';
  fileInput.id = 'if_' + imgKey;
  irow.appendChild(fileInput);

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'ifbtn';
  pickBtn.textContent = '📁 Välj bild';
  pickBtn.addEventListener('click', () => fileInput.click());
  irow.appendChild(pickBtn);

  if (presetKey && D) {
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'ifbtn';
    autoBtn.textContent = '🎨 Auto-generera';
    autoBtn.dataset.auto = imgKey;
    autoBtn.addEventListener('click', () => doAutoGenerate(imgKey, label, container, imgs, presetKey, D));
    irow.appendChild(autoBtn);
  }

  container.appendChild(irow);

  if (imgs[imgKey]) {
    if (meta?.source === 'auto') {
      // Auto-bild: badge med Återskapa + Rensa
      const badge = document.createElement('div');
      badge.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;color:#7090a8';

      const badgeTxt = document.createElement('span');
      badgeTxt.textContent = '🎨 Auto-genererad';
      badge.appendChild(badgeTxt);

      if (presetKey && D) {
        const aterBtn = document.createElement('button');
        aterBtn.type = 'button';
        aterBtn.className = 'ifbtn-sm';
        aterBtn.textContent = '⟲ Återskapa';
        aterBtn.dataset.ater = imgKey;
        aterBtn.addEventListener('click', () => doAutoGenerate(imgKey, label, container, imgs, presetKey, D));
        badge.appendChild(aterBtn);
      }

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ifbtn-sm';
      clearBtn.style.color = '#ff6060';
      clearBtn.textContent = '🗑 Rensa';
      clearBtn.addEventListener('click', () => {
        delete imgs[imgKey];
        delete _imgsMeta[imgKey];
        buildImgRow(imgKey, label, container, imgs, presetKey, D);
      });
      badge.appendChild(clearBtn);
      container.appendChild(badge);
    } else {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ifbtn';
      clearBtn.style.color = '#ff6060';
      clearBtn.textContent = '× Ta bort';
      clearBtn.addEventListener('click', () => {
        delete imgs[imgKey];
        delete _imgsMeta[imgKey];
        buildImgRow(imgKey, label, container, imgs, presetKey, D);
      });
      container.appendChild(clearBtn);
    }

    const prev = document.createElement('img');
    prev.className = 'iprev';
    prev.src = imgs[imgKey];
    container.appendChild(prev);
  } else {
    const status = document.createElement('span');
    status.style.cssText = 'font-size:11px;color:#506070';
    status.textContent = 'Ej vald';
    container.appendChild(status);
  }

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      imgs[imgKey] = e.target.result;
      _imgsMeta[imgKey] = { source: 'manual' };
      buildImgRow(imgKey, label, container, imgs, presetKey, D);
    };
    reader.readAsDataURL(f);
  });
}
