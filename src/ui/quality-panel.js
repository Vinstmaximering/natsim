// D6: Realtids-kvalitetspanel – rad 800–821 exakt
// Bevaras exakt per krav
import { getState } from '../state/store.js';
import { viewNet } from '../state/optimizer-proposal.js';
import { setAutoSim } from '../state/undo.js';
import { findBlockedMeasurements } from '../core/visibility.js';
import { klassificeraKtal, sigPosKlass } from '../core/constants.js';
import { rClass } from '../core/redundancy.js';
import { nf } from '../core/format.js';

export { setAutoSim };

// Returnerar CSS-klass baserat på K-tal-nivå – delad klassificering.
const kClass = k => klassificeraKtal(k).cssKlass;

// Omgång 3: rClass och sClass låg som lokala trappor här. sClass använde
// dessutom 10 mm som röd gräns medan de tre tabellerna använde 20 – samma
// punkt kunde vara gul i en vy och röd i en annan. Båda kommer nu ur core/.
const sClass = sigPosKlass;

export function updateQualityPanel() {
  const panel = document.getElementById("qPanel");
  if (!panel) return;
  // Etapp E: panelen följer visningslagret, samma nät som kartan ritar.
  const { simResult } = viewNet();
  if (!simResult || !simResult.ok) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  const sr = simResult;

  const k = sr.K_global;
  document.getElementById("qK").innerHTML =
    `<span class="${kClass(k)}" style="font-weight:700">${nf(k, 3)}</span> (${sr.K_class})`;
  document.getElementById("qNu").textContent = `${sr.meas_n}/${sr.unkn_n}`;
  document.getElementById("qF").textContent  = sr.redundancy;

  const minR = Math.min(sr.rMinDist ?? Infinity, sr.rMinHz ?? Infinity);
  document.getElementById("qRmin").innerHTML =
    `<span class="${rClass(isFinite(minR) ? minR : 0)}">${isFinite(minR) ? nf(minR, 3) : "–"}</span>`;

  const sigPosVals = (sr.allPtResults || []).filter(r => r.type !== "known" && r.sigPos > 0).map(r => r.sigPos * 1000);
  const sMax = sigPosVals.length ? Math.max(...sigPosVals) : 0;
  document.getElementById("qSmax").innerHTML = sigPosVals.length
    ? `<span class="${sClass(sMax)}">${nf(sMax, 1)} mm</span>`
    : "–";

  // Mätningar utan sikt (visas bara när hinder finns)
  const { pts: ptList = [], obstacles = [] } = getState();
  const { meas = [] } = viewNet();
  const sightEl = document.getElementById("qSight");
  if (sightEl) {
    if (obstacles.length === 0) {
      sightEl.textContent = "–";
    } else {
      const blocked = findBlockedMeasurements(meas, ptList, obstacles).length;
      sightEl.innerHTML =
        `<span class="${blocked > 0 ? 'val-danger' : 'val-good'}">${blocked}</span>`;
    }
  }
}

export function initQualityPanel() {
  const el = document.getElementById("autoSimToggle");
  if (el) el.addEventListener("change", e => setAutoSim(e.target.checked));

  // Touch-hanteringen låg tidigare här och fungerade BARA i den här panelen,
  // eftersom den skrev till en fast div (#qTip). Omgång 3 flyttade den till
  // ui/tooltip.js, som täcker hela dokumentet – samma förkortning förklaras
  // nu likadant var den än visas. Se docs/troubleshooting/ui_inventering_20260910.md.
}
