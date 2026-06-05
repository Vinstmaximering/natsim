// D6: Realtids-kvalitetspanel – rad 800–821 exakt
// Bevaras exakt per krav
import { getState } from '../state/store.js';
import { setAutoSim } from '../state/undo.js';
import { hasLineOfSight } from '../core/visibility.js';

export { setAutoSim };

// Returnerar CSS-klass baserat på K-tal-nivå.
function kClass(k) {
  return k > 1.14 ? 'val-purple'  // Starkt överbestämt
       : k >= 0.5 ? 'val-good'
       : k >= 0.3 ? 'val-caution'
       : k >= 0.1 ? 'val-warn'
       :             'val-danger';
}

// Returnerar CSS-klass baserat på redundanstal (r_i).
function rClass(r) {
  return r >= 0.5 ? 'val-good'
       : r >= 0.3 ? 'val-caution'
       : r >= 0.1 ? 'val-warn'
       :             'val-danger';
}

// Returnerar CSS-klass baserat på σ_pos (mm).
function sClass(mm) {
  return mm < 5  ? 'val-good'
       : mm < 10 ? 'val-caution'
       :            'val-danger';
}

export function updateQualityPanel() {
  const panel = document.getElementById("qPanel");
  if (!panel) return;
  const { simResult } = getState();
  if (!simResult || !simResult.ok) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  const sr = simResult;

  const k = sr.K_global;
  document.getElementById("qK").innerHTML =
    `<span class="${kClass(k)}" style="font-weight:700">${k.toFixed(3)}</span> (${sr.K_class})`;
  document.getElementById("qNu").textContent = `${sr.meas_n}/${sr.unkn_n}`;
  document.getElementById("qF").textContent  = sr.redundancy;

  const minR = Math.min(sr.rMinDist ?? Infinity, sr.rMinHz ?? Infinity);
  document.getElementById("qRmin").innerHTML =
    `<span class="${rClass(isFinite(minR) ? minR : 0)}">${isFinite(minR) ? minR.toFixed(3) : "–"}</span>`;

  const sigPosVals = (sr.allPtResults || []).filter(r => r.type !== "known" && r.sigPos > 0).map(r => r.sigPos * 1000);
  const sMax = sigPosVals.length ? Math.max(...sigPosVals) : 0;
  document.getElementById("qSmax").innerHTML = sigPosVals.length
    ? `<span class="${sClass(sMax)}">${sMax.toFixed(1)} mm</span>`
    : "–";

  // Mätningar utan sikt (visas bara när hinder finns)
  const { meas = [], pts: ptList = [], obstacles = [] } = getState();
  const sightEl = document.getElementById("qSight");
  if (sightEl) {
    if (obstacles.length === 0) {
      sightEl.textContent = "–";
    } else {
      let blocked = 0;
      for (const m of meas) {
        const p1 = ptList.find(p => p.id === m.from);
        const p2 = ptList.find(p => p.id === m.to);
        if (p1 && p2 && !hasLineOfSight(p1, p2, obstacles).visible) blocked++;
      }
      sightEl.innerHTML =
        `<span class="${blocked > 0 ? 'val-danger' : 'val-good'}">${blocked}</span>`;
    }
  }
}

export function initQualityPanel() {
  const el = document.getElementById("autoSimToggle");
  if (el) el.addEventListener("change", e => setAutoSim(e.target.checked));

  // Touch: tryck på etikett → visa data-tip i #qTip-div (ersätter title-hover)
  if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
    const tip = document.getElementById("qTip");
    if (!tip) return;
    let _hideTimer = null;
    document.querySelectorAll(".qpl[data-tip]").forEach(label => {
      label.addEventListener("touchstart", e => {
        e.stopPropagation();
        clearTimeout(_hideTimer);
        tip.textContent = label.dataset.tip;
        tip.style.display = "block";
        _hideTimer = setTimeout(() => { tip.style.display = "none"; }, 2800);
      }, { passive: true });
    });
  }
}
