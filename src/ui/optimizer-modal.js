// Dialogen för "Optimera nät" (Etapp E).
//
// Tre delar enligt beställningen:
//   1. Konfiguration – mätklassen och de acceptanskriterier den ger (läses ur
//      projektet, inte redigerbara här), maxavståndet från Etapp A, och
//      viktningen mellan σ_pos-förbättring och r-talshöjning.
//   2. Körning      – knapp + progress med aktuell iteration och status.
//   3. Resultat     – beslutsspårningslogg, jämförelsetabell och de tre
//      utgångarna Tillämpa / Behåll som förslag / Avbryt.
import { getState, setState } from '../state/store.js';
import { criteriaForClass, describeCriteria } from '../core/optimizer-criteria.js';
import { runOptimization, shouldUseWorker } from '../core/optimizer-runner.js';
import { createProposal, storeProposal, applyProposal, comparisonRows } from '../state/optimizer-proposal.js';
import { normalizeMaxSuggestDist } from './right-panel.js';
import { showToast } from './toast.js';

let _ov = null;        // overlay-elementet, null när dialogen är stängd
let _result = null;    // senaste optimeringsresultat
let _running = false;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Delrenderare ─────────────────────────────────────────────────────────────

function _configHtml(state) {
  const cfg  = state.optimizerConfig || { weightSigma: 0.5, weightR: 0.5, sigma_max_mm: null };
  const criteria = criteriaForClass(state.activeMatklass, { sigmaMaxMm: cfg.sigma_max_mm });
  const maxD = normalizeMaxSuggestDist(state.maxSuggestDist);
  const pct  = Math.round(cfg.weightSigma * 100);

  return `
    <div class="opt-sec">1. KONFIGURATION</div>
    <div class="opt-box">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="val-secondary" style="font-size:11px;">Mätklass (styr kraven)</span>
        <span class="val-good" style="font-family:monospace;font-weight:bold;">${criteria.klass}</span>
      </div>
      ${criteria.assumedClass
        ? `<div class="val-warn" style="font-size:11px;margin-top:3px;">
             Ingen mätklass vald i projektet – ${criteria.klass}:s krav används som utgångspunkt.
             Välj klass under fliken NÄT för att styra kraven.</div>`
        : ''}
      <div style="margin-top:6px;font-size:11px;" class="val-secondary">Acceptanskriterier</div>
      <ul id="opt-crit-list" style="margin:3px 0 0 16px;padding:0;font-size:11px;line-height:1.7;" class="val-value">
        ${describeCriteria(criteria).map(t => `<li>${esc(t)}</li>`).join('')}
      </ul>
      <div style="display:flex;align-items:center;gap:6px;margin-top:7px;">
        <span class="val-secondary" style="font-size:11px;white-space:nowrap;">Största σ_pos</span>
        <input id="opt-sigmax" type="number" min="0.1" step="0.1" inputmode="decimal"
               value="${cfg.sigma_max_mm != null ? cfg.sigma_max_mm : ''}"
               placeholder="${criteria.sigmaMaxDefaultMm} (klassens default)"
               title="Punktstandardosäkerhet σ_pos (1σ) efter utjämning. Tomt fält = klassens default."
               style="flex:1;min-width:0;padding:4px;font-size:12px;background:var(--bg-input);border:1px solid var(--border-strong);color:var(--text-value);border-radius:3px;">
        <span class="val-muted" style="font-size:12px;">mm</span>
      </div>
      <div class="val-muted" style="font-size:10px;margin-top:2px;">
        Produktval, inte normcitat: σ_pos efter utjämning är en annan storhet än
        Tabell A.9:s spridning mellan dubbelmätta längder. Sparas i projektfilen.
      </div>
      <div class="val-muted" style="font-size:10px;margin-top:4px;">Ref: ${esc(criteria.source)}</div>
    </div>

    <div class="opt-box">
      <div style="font-size:11px;" class="val-secondary">Maxavstånd för nya mätningar</div>
      ${maxD == null
        ? '<div class="val-value" style="font-size:12px;">Obegränsat – alla siktlinjer får föreslås.</div>'
        : `<div class="val-value" style="font-size:12px;">${maxD} m – respekteras av optimeringen.</div>
           <div class="val-muted" style="font-size:10px;margin-top:2px;">
             Mätningar längre än gränsen föreslås aldrig, även om de skulle förbättra nätet.
           </div>`}
      <div class="val-muted" style="font-size:10px;margin-top:2px;">
        Siktlinjer som blockeras av hinder utesluts på samma sätt.
      </div>
    </div>

    <div class="opt-box">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span class="val-secondary" style="font-size:11px;">Viktning</span>
        <span class="val-value" style="font-family:monospace;font-size:11px;" id="opt-w-lbl">
          σ_pos ${pct} / r-tal ${100 - pct}
        </span>
      </div>
      <input id="opt-weight" type="range" min="0" max="100" step="5" value="${pct}"
             style="width:100%;margin:4px 0 0;accent-color:var(--accent);">
      <div class="val-muted" style="font-size:10px;">
        Styr vad optimeringen premierar: sänkt punktosäkerhet eller höjda redundanstal.
        Sparas i projektfilen.
      </div>
    </div>`;
}

function _runHtml() {
  const n = getState().meas.length;
  return `
    <div class="opt-sec">2. KÖRNING</div>
    <button id="opt-run" ${_running ? 'disabled' : ''}
      style="width:100%;padding:8px;font-size:13px;font-weight:bold;border-radius:3px;cursor:pointer;
             background:color-mix(in srgb,var(--accent) 12%,transparent);
             border:1px solid var(--accent);color:var(--accent);${_running ? 'opacity:.5;cursor:progress;' : ''}">
      ${_running ? '⏳ Optimerar…' : '▶ Kör optimering'}
    </button>
    <div id="opt-progress" class="val-muted" style="font-size:11px;min-height:16px;margin-top:5px;
         font-family:monospace;">${shouldUseWorker(getState())
           ? `Nätet har ${n} mätningar – körs i bakgrundstråd.` : ''}</div>`;
}

function _logHtml(log) {
  if (!log.length) return '<div class="val-muted" style="font-size:11px;">Inga operationer.</div>';
  return `<div style="max-height:190px;overflow:auto;border:1px solid var(--border-default);
                border-radius:3px;padding:5px 7px;background:var(--bg-card);">
    ${log.map(e => {
      const cls = e.action === 'add' ? 'val-good' : e.action === 'remove' ? 'val-warn' : 'val-muted';
      return `<div class="${cls}" style="font-size:11px;line-height:1.6;margin-bottom:3px;">${esc(e.text)}</div>`;
    }).join('')}
  </div>`;
}

function _tableHtml(res) {
  const rows = comparisonRows(res.baseMetrics, res.finalMetrics, res.criteria);
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px;">
    <tr style="border-bottom:1px solid var(--border-strong);">
      <th class="val-muted" style="text-align:left;font-weight:normal;padding:2px 0;">Storhet</th>
      <th class="val-muted" style="text-align:right;font-weight:normal;">Original</th>
      <th class="val-muted" style="text-align:right;font-weight:normal;">Optimerat</th>
      <th class="val-muted" style="text-align:right;font-weight:normal;">Krav</th>
    </tr>
    ${rows.map(r => `<tr style="border-bottom:1px solid var(--border-default);">
      <td class="val-secondary" style="padding:2px 0;">${esc(r.label)}</td>
      <td class="val-value" style="text-align:right;font-family:monospace;">${esc(r.base)}</td>
      <td class="${r.ok ? 'val-good' : 'val-danger'}" style="text-align:right;font-family:monospace;font-weight:bold;">${esc(r.opt)}</td>
      <td class="val-muted" style="text-align:right;font-family:monospace;">${esc(r.krav)}</td>
    </tr>`).join('')}
  </table>`;
}

function _resultHtml() {
  if (!_result) {
    return `<div class="opt-sec">3. RESULTAT</div>
      <div class="val-muted" style="font-size:11px;">Kör optimeringen för att se beslutsspårningen.</div>`;
  }
  if (!_result.ok) {
    const e = _result.error;
    return `<div class="opt-sec">3. RESULTAT</div>
      <div class="val-danger" style="font-size:12px;padding:8px;border-radius:3px;line-height:1.6;
           background:color-mix(in srgb,var(--color-danger) 10%,var(--bg-card));
           border:1px solid color-mix(in srgb,var(--color-danger) 40%,transparent);">
        <b>⚠ ${esc(e.message)}</b>
        ${e.violations.length ? `<div style="margin-top:6px;">Kriterier som inte kunde uppfyllas:</div>
          <ul style="margin:2px 0 0 16px;padding:0;">${e.violations.map(v => `<li>${esc(v.text)}</li>`).join('')}</ul>` : ''}
        ${e.suggestions.length ? `<div style="margin-top:6px;">Föreslagna åtgärder:</div>
          <ul style="margin:2px 0 0 16px;padding:0;">${e.suggestions.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      </div>
      <div style="margin-top:6px;" class="val-muted">Nätet är oförändrat.</div>
      ${_logHtml(_result.log)}
      <div class="mbs"><button class="bc" id="opt-cancel">✕ Stäng</button></div>`;
  }

  const added = _result.addedIds.length, removed = _result.removedIds.length;
  const noChange = added === 0 && removed === 0;
  return `<div class="opt-sec">3. RESULTAT</div>
    <div class="opt-box" style="display:flex;gap:14px;font-size:12px;">
      <span class="val-good">Fas 1: +${added} mätningar</span>
      <span class="val-warn">Fas 2: −${removed} mätningar</span>
      <span class="val-muted">${_result.iterations} iterationer</span>
    </div>
    ${_tableHtml(_result)}
    <div class="val-secondary" style="font-size:11px;margin-bottom:3px;">Beslutsspårning</div>
    ${_logHtml(_result.log)}
    ${noChange ? `<div class="val-good" style="font-size:11px;margin-top:6px;">
        Nätet är redan optimalt för kravnivån – ingen mätning behövde läggas till eller tas bort.</div>` : ''}
    <div class="mbs" style="flex-wrap:wrap;">
      <button class="bs" id="opt-apply" ${noChange ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>✓ Tillämpa</button>
      <button class="bs" id="opt-keep" ${noChange ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}
        style="background:color-mix(in srgb,var(--color-measure) 10%,transparent);border-color:var(--color-measure);color:var(--color-measure);">
        👁 Behåll som förslag</button>
      <button class="bc" id="opt-cancel">✕ Avbryt</button>
    </div>`;
}

function _render() {
  if (!_ov) return;
  const mo = _ov.querySelector('.mo');
  const state = getState();
  mo.innerHTML = `
    <div style="font-size:14px;color:var(--accent);margin-bottom:4px;font-weight:bold;">🧮 Optimera nät</div>
    <div class="val-muted" style="font-size:11px;margin-bottom:10px;line-height:1.5;">
      Second-order design: mätningskonfigurationen optimeras mot projektets acceptanskriterier
      med girig iterativ sökning (Cross 1994, Kuang 1996).
    </div>
    ${_configHtml(state)}
    ${_runHtml()}
    ${_resultHtml()}`;
  _wire();
}

// ── Händelser ────────────────────────────────────────────────────────────────

function _wire() {
  const mo = _ov.querySelector('.mo');

  const slider = mo.querySelector('#opt-weight');
  if (slider) {
    slider.oninput = () => {
      const pct = Number(slider.value);
      const lbl = mo.querySelector('#opt-w-lbl');
      if (lbl) lbl.textContent = `σ_pos ${pct} / r-tal ${100 - pct}`;
      const cur = getState().optimizerConfig || {};
      setState({ optimizerConfig: { ...cur, weightSigma: pct / 100, weightR: (100 - pct) / 100 } });
    };
  }

  const sig = mo.querySelector('#opt-sigmax');
  if (sig) {
    sig.oninput = () => {
      const v = parseFloat(String(sig.value).replace(',', '.'));
      const val = Number.isFinite(v) && v > 0 ? v : null;
      const cur = getState().optimizerConfig || {};
      setState({ optimizerConfig: { ...cur, sigma_max_mm: val } });
      // Uppdatera bara kravlistan – att rendera om hela dialogen skulle ta
      // fokus ur fältet mitt i inskrivningen (samma skäl som maxavståndet).
      const list = mo.querySelector('#opt-crit-list');
      if (list) {
        const c = criteriaForClass(getState().activeMatklass, { sigmaMaxMm: val });
        list.innerHTML = describeCriteria(c).map(t => `<li>${esc(t)}</li>`).join('');
      }
    };
  }

  const run = mo.querySelector('#opt-run');
  if (run) run.onclick = () => _run();

  mo.querySelector('#opt-cancel') && (mo.querySelector('#opt-cancel').onclick = () => closeOptimizerDialog());
  mo.querySelector('#opt-apply')  && (mo.querySelector('#opt-apply').onclick  = () => _apply());
  mo.querySelector('#opt-keep')   && (mo.querySelector('#opt-keep').onclick   = () => _keep());
}

async function _run() {
  if (_running) return;
  const state = getState();
  const cfg = state.optimizerConfig || { weightSigma: 0.5, weightR: 0.5 };
  _running = true; _result = null;
  _render();

  const prog = _ov?.querySelector('#opt-progress');
  const onProgress = p => {
    if (!prog) return;
    if (p.kind === 'operation') prog.textContent = `Iteration ${p.iteration}: ${p.entry.text}`.slice(0, 120);
    else if (p.kind === 'search') prog.textContent = `Iteration ${p.iteration} – ${p.message}`;
    else if (p.kind === 'candidate') prog.textContent = `Iteration ${p.iteration} – kandidat ${p.index}/${p.total}`;
  };

  try {
    _result = await runOptimization({
      pts: state.pts, meas: state.meas, centerErr: state.centerErr,
      obstacles: state.obstacles || [],
      maxSuggestDist: normalizeMaxSuggestDist(state.maxSuggestDist),
      matklass: state.activeMatklass,
      sigmaMaxMm: cfg.sigma_max_mm,
      weights: { sigma: cfg.weightSigma, r: cfg.weightR },
      defaultInstr: state.defaultInstr,
      nextMeasId: state.nMid ?? 1,
    }, { onProgress });
  } catch (e) {
    _result = { ok: false, log: [], error: { message: 'Optimeringen kunde inte köras: ' + (e?.message || e),
                violations: [], suggestions: [] } };
  } finally {
    _running = false;
  }
  _render();
}

function _apply() {
  if (!_result?.ok) return;
  // Räkna ut texten före close() – den nollar _result.
  const summary = `+${_result.addedIds.length} / −${_result.removedIds.length}`;
  applyProposal(createProposal(_result, getState()));
  closeOptimizerDialog();
  showToast(`✓ Optimerat nät tillämpat (${summary})`, '#00ff88');
  _refreshUI();
}

function _keep() {
  if (!_result?.ok) return;
  storeProposal(createProposal(_result, getState()));
  closeOptimizerDialog();
  showToast('👁 Sparat som förslag – växla vy i fliken MÄTNINGAR', '#4fc3f7');
  _refreshUI();
}

// Kartan och panelerna laddas dynamiskt: modulen ska gå att testa utan Leaflet.
function _refreshUI() {
  import('../map/leaflet-setup.js').then(m => m.draw()).catch(() => {});
  import('./right-panel.js').then(m => m.renderTab()).catch(() => {});
}

// ── Publikt API ──────────────────────────────────────────────────────────────

export function openOptimizerDialog() {
  if (_ov) return;
  const { pts, meas } = getState();
  if (pts.length < 2 || meas.length < 1) {
    showToast('Optimering kräver minst 2 punkter och 1 mätning', '#ff9900');
    return;
  }
  _result = null; _running = false;

  _ov = document.createElement('div');
  _ov.className = 'ov';
  _ov.id = 'opt-overlay';
  _ov.style.zIndex = '200';
  const mo = document.createElement('div');
  mo.className = 'mo';
  mo.style.width = 'min(620px, 94vw)';
  _ov.appendChild(mo);
  document.body.appendChild(_ov);

  _ov.addEventListener('click', e => { if (e.target === _ov && !_running) closeOptimizerDialog(); });
  document.addEventListener('keydown', _onKey);
  _render();
}

export function closeOptimizerDialog() {
  if (!_ov) return;
  document.removeEventListener('keydown', _onKey);
  _ov.remove();
  _ov = null;
  _result = null;
  _running = false;
}

function _onKey(e) {
  if (e.key === 'Escape' && !_running) closeOptimizerDialog();
}

// Endast för tester.
export function _getResult() { return _result; }
export function _isOpen()    { return _ov !== null; }
