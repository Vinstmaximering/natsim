// D6: Realtids-kvalitetspanel – rad 800–821 exakt
// Bevaras exakt per krav
import { getState } from '../state/store.js';
import { setAutoSim } from '../state/undo.js';
import { hasLineOfSight } from '../core/visibility.js';

export { setAutoSim };

export function updateQualityPanel() {
  const panel = document.getElementById("qPanel");
  if (!panel) return;
  const { simResult } = getState();
  if (!simResult || !simResult.ok) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  const sr = simResult;

  const k    = sr.K_global;
  const kCol = k > 1.14 ? "#ce93d8" : k >= 0.5 ? "#00ff88" : k >= 0.3 ? "#ffcc00" : k >= 0.1 ? "#ff9900" : "#ff5050";
  document.getElementById("qK").innerHTML  = `<span style="color:${kCol};font-weight:700">${k.toFixed(3)}</span> (${sr.K_class})`;
  document.getElementById("qNu").textContent = `${sr.meas_n}/${sr.unkn_n}`;
  document.getElementById("qF").textContent  = sr.redundancy;

  const minR  = Math.min(sr.rMinDist ?? Infinity, sr.rMinHz ?? Infinity);
  const rCol  = minR >= 0.5 ? "#00ff88" : minR >= 0.3 ? "#ffcc00" : minR >= 0.1 ? "#ff9900" : "#ff5050";
  document.getElementById("qRmin").innerHTML = `<span style="color:${rCol}">${isFinite(minR) ? minR.toFixed(3) : "–"}</span>`;

  const sigPosVals = (sr.allPtResults || []).filter(r => r.type !== "known" && r.sigPos > 0).map(r => r.sigPos * 1000);
  const sMax = sigPosVals.length ? Math.max(...sigPosVals) : 0;
  const sCol = sMax < 5 ? "#00ff88" : sMax < 10 ? "#ffcc00" : "#ff5050";
  document.getElementById("qSmax").innerHTML = sigPosVals.length
    ? `<span style="color:${sCol}">${sMax.toFixed(1)} mm</span>`
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
      const col = blocked > 0 ? "#ff5050" : "#00ff88";
      sightEl.innerHTML = `<span style="color:${col}">${blocked}</span>`;
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
