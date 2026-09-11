// RAPPORT studio-vy – simuleringsdata i läsbart fullskärmsformat med sektionsnavigering.
import { getState, setState } from '../../state/store.js';
import { CRS_DEFS, klassificeraKtal, sigPosKlass, PT } from '../../core/constants.js';
import { rLabel, rClass }   from '../../core/redundancy.js';
import { nf, gon }           from '../../core/format.js';
import { TIPS, tipAttr }     from '../tooltip.js';

// Omgång 3: skalorna kommer ur core/. Här låg lokala kopior.
const sigClass = sigPosKlass;
const kClass   = kv => klassificeraKtal(kv).cssKlass;
// Omgång 1 noterade att detta var en lokal kopia av core/redundancy.js rLabel.
// Importeras nu därifrån så att de två inte kan divergera.

const D        = r  => r * 180 / Math.PI;

let _el = null;

// ── Sektionsdefinitioner ───────────────────────────────────────────────────────

const SECTIONS = [
  { id:'rs-1', title:'1. Nätöversikt' },
  { id:'rs-2', title:'2. Kontrollerbarhetstal' },
  { id:'rs-3', title:'3. Punktosäkerheter' },
  { id:'rs-4', title:'4. Reliabilitet per mätning' },
  { id:'rs-5', title:'5. Punktkvalitet' },
];

// ── Kopiera-knapp ─────────────────────────────────────────────────────────────

async function _copySection(contentEl) {
  const text = contentEl.innerText || contentEl.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (__) {}
    document.body.removeChild(ta);
  }
}

// ── Sektion-wrapper ───────────────────────────────────────────────────────────

function _sec(id, title, innerHtml) {
  return `
    <div class="rs-section" id="${id}">
      <div class="rs-sec-header">
        <h2 class="rs-title">${title}</h2>
        <button class="studio-footer-btn rs-copy-btn" data-for="${id}-content">📋 Kopiera</button>
      </div>
      <div id="${id}-content">${innerHtml}</div>
    </div>`;
}

// ── Rapport-HTML-generator ─────────────────────────────────────────────────────

function _buildReportHTML(state) {
  const { simResult, activeCRS, ellipsMode = '1sig', sigReq = 3 } = state;
  if (!simResult?.ok) return '';

  const sr      = simResult;
  const k       = ellipsMode !== '95' ? 1.0 : 2.4477;
  const crsName = CRS_DEFS[activeCRS]?.name || activeCRS;
  const now     = new Date();
  const datStr  = now.toLocaleDateString('sv-SE') + ' ' + now.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});

  // Tabellhjälpare (återanvänder val-klasser)
  const TR = (label, val, cls) =>
    `<tr><td class="val-secondary rs-td-lbl">${label}</td><td class="rs-td-val ${cls||'val-value'}">${val}</td></tr>`;

  // ── SEK 1: Nätöversikt ──
  const s1 = `
    <div class="rs-meta val-muted">${datStr} · ${crsName}</div>
    <table class="rs-tbl">
      ${TR('Kända punkter (fixerade)', sr.knownCount, 'val-good')}
      ${TR('Fria punkter', sr.freeCount, 'val-info')}
      ${TR('Uppställningar', sr.nOrientUnkn ?? '–', 'val-warn')}
      ${TR('Mätningar (linjer)', sr.measCount)}
      ${TR('Observationer (n)', sr.meas_n)}
      <tr><td colspan="2" class="rs-sep"></td></tr>
      ${TR('Koordinatobekanta', sr.nCoordUnkn ?? sr.unkn_n, 'val-info')}
      ${TR('Frihetsgrader f', sr.redundancy, sr.redundancy > 0 ? 'val-good' : 'val-danger')}
      ${TR('Σ redundansbidrag', sr.redundTotal)}
      ${TR('κ (MUF-faktor)', sr.kappa != null ? nf(sr.kappa, 2) : '2,80')}
    </table>`;

  // ── SEK 2: Kontrollerbarhetstal ──
  const s2 = `
    <div class="rs-k-box" style="border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)">
      <span class="${kClass(sr.K_global)} rs-k-val">k = ${nf(sr.K_global, 3)}</span>
      <span class="${kClass(sr.K_global)} rs-k-cls">${sr.K_class}</span>
    </div>
    <table class="rs-tbl">
      ${TR('Medel r-tal',            nf(sr.rMean, 3),    rClass(sr.rMean))}
      ${sr.rMinDist!=null ? TR('Minsta r-tal (avstånd)',  nf(sr.rMinDist, 3), rClass(sr.rMinDist)) : ''}
      ${sr.rMinHz  !=null ? TR('Minsta r-tal (riktning)', nf(sr.rMinHz, 3),   rClass(sr.rMinHz))   : ''}
    </table>`;

  // ── SEK 3: Punktosäkerheter ──
  const ptCols = `<th>Punkt</th><th>σN mm</th><th>σE mm</th>`
    + `<th ${tipAttr(TIPS.SIG_POS)}>σ_pos mm</th><th>a mm</th><th>b mm</th>`
    + `<th ${tipAttr(TIPS.THETA)}>θ gon</th>`;
  const ptRows = sr.ptResults.map(pr => {
    const sm = pr.sigPos * 1000 * k;
    const { pts } = state;
    const pt = (pts || []).find(p => p.id === pr.id);
    // Omgång 2: färgen ur PT. Här låg en egen kopia av färgtabellen.
    const c  = PT[pt?.type]?.c || 'var(--text-primary)';
    return `<tr class="rs-row">
      <td style="color:${c};font-weight:bold">${pr.id}</td>
      <td class="val-warn">${nf(pr.sigN*1000, 2)}</td>
      <td class="val-purple">${nf(pr.sigE*1000, 2)}</td>
      <td class="${sigClass(sm)}" style="font-weight:bold">${nf(sm, 2)}</td>
      <td class="val-muted">${nf(pr.aSemi*1000*k, 2)}</td>
      <td class="val-muted">${nf(pr.bSemi*1000*k, 2)}</td>
      <td class="val-muted" style="font-size:12px">${gon(D(pr.theta))}</td>
    </tr>`;
  }).join('');
  const s3 = `<div style="overflow-x:auto"><table class="rs-tbl rs-tbl-full">
    <thead><tr class="rs-th">${ptCols}</tr></thead><tbody>${ptRows}</tbody>
  </table></div>
  <div class="val-muted rs-note">Felellipsskala: ${ellipsMode==='95'?'95 % (k=2,45)':'1σ (Geo)'}</div>`;

  // ── SEK 4: Reliabilitet ──
  const relCols = `<th>Sträcka</th><th>Typ</th><th ${tipAttr(TIPS.R_TAL)}>r-tal</th>`
    + `<th ${tipAttr(TIPS.MUF)}>MUF</th><th class="val-info" ${tipAttr(TIPS.YT)}>YT</th>`
    + `<th class="val-warn" ${tipAttr(TIPS.KP)}>KP mm</th><th>Klass</th>`;
  const relRows = sr.redund.map(rd => {
    const mufStr = rd.mdb.val===Infinity?'∞':rd.type==='dist'?nf(rd.mdb.val*1000, 1)+' mm':nf(rd.mdb.val, 2)+' mgon';
    const yt     = rd.mdb.val===Infinity?Infinity:rd.mdb.val*(1-rd.ri);
    // YT ärver MUF:s enhet: mgon för riktningar (HMK F.4.1).
    const ytStr  = yt===Infinity?'∞':rd.type==='dist'?nf(yt*1000, 2)+' mm':nf(yt, 4)+' mgon';
    const kpStr  = rd.yt_m==null||rd.yt_m===Infinity?'∞':nf(rd.yt_m*1000, 2);
    return `<tr class="rs-row">
      <td class="val-secondary">${rd.fromId}→${rd.toId}</td>
      <td class="val-muted">${rd.type==='dist'?'Avstånd':'Riktning'}</td>
      <td class="${rClass(rd.ri)}" style="font-weight:bold">${nf(rd.ri, 3)}</td>
      <td class="val-muted">${mufStr}</td>
      <td class="val-info">${ytStr}</td>
      <td class="val-warn">${kpStr}</td>
      <td class="${rClass(rd.ri)}">${rLabel(rd.ri)}</td>
    </tr>`;
  }).join('');
  const s4 = `<div class="val-muted rs-note">r-tal = redundansbidrag per observation | MUF = Minsta Urskiljbara Fel (κ=${nf(sr.kappa||2.80, 2)})</div>
  <div style="overflow-x:auto"><table class="rs-tbl rs-tbl-full">
    <thead><tr class="rs-th">${relCols}</tr></thead><tbody>${relRows}</tbody>
  </table></div>`;

  // ── SEK 5: Punktkvalitet ──
  const qCols = `<th>Punkt</th><th ${tipAttr(TIPS.SIG_POS)}>σ_pos mm</th><th>Precision</th>`
    + `<th ${tipAttr(TIPS.OBS_N)}>Obs</th><th ${tipAttr(TIPS.R_TAL)}>Medel r-tal</th><th>Reliabilitet</th>`;
  const qRows = sr.ptResults.map(pr => {
    const sm      = pr.sigPos * 1000;
    const precOK  = sm <= sigReq;
    const pcls    = sm < sigReq*0.5 ? 'val-good' : sm <= sigReq ? 'val-caution' : 'val-danger';
    const myR     = sr.redund.filter(rd => rd.fromId===pr.id||rd.toId===pr.id);
    const nObs    = myR.length;
    const rMean   = nObs>0 ? myR.reduce((a,b)=>a+b.ri,0)/nObs : null;
    const maxR    = nObs>0 ? Math.max(...myR.map(r=>r.ri)) : 0;
    const hasRed  = maxR > 0.05;
    // Omgång 3: samma r-talsskala som högerpanelen och kartan.
    const REL_IKON = { 'God marginal':'✓', 'Uppfyller norm':'◇',
                       'Under norm':'△', 'Otillräckligt':'✕' };
    let relText, relIcon, rcls;
    if (!nObs)        { rcls='val-danger'; relText='Ingen mätning';    relIcon='⛔'; }
    else if (!hasRed) { rcls='val-danger'; relText='Ej kontrollerbar'; relIcon='⚠'; }
    else { relText = rLabel(rMean); rcls = rClass(rMean); relIcon = REL_IKON[relText] ?? '◇'; }
    const { pts } = state;
    const pt = (pts||[]).find(p=>p.id===pr.id);
    const c  = PT[pt?.type]?.c || 'var(--text-primary)';
    return `<tr class="rs-row">
      <td style="color:${c};font-weight:bold">${pr.id}</td>
      <td class="${pcls}" style="font-weight:bold">${nf(sm, 2)}</td>
      <td class="${pcls}">${precOK?'✓ OK':'✗ Uppfyller ej'}</td>
      <td class="val-secondary">${Math.round(nObs/2)}</td>
      <td class="${rcls}">${nf(rMean, 3)}</td>
      <td class="${rcls}">${relIcon} ${relText}</td>
    </tr>`;
  }).join('');
  const s5 = `<div class="val-muted rs-note">Krav σ_pos ≤ <b>${nf(sigReq, 1)} mm</b></div>
  <div style="overflow-x:auto"><table class="rs-tbl rs-tbl-full">
    <thead><tr class="rs-th">${qCols}</tr></thead><tbody>${qRows}</tbody>
  </table></div>`;

  return [
    _sec('rs-1','1. Nätöversikt', s1),
    _sec('rs-2','2. Kontrollerbarhetstal  k = f/n', s2),
    _sec('rs-3','3. Punktosäkerheter', s3),
    _sec('rs-4','4. Reliabilitet per mätning', s4),
    _sec('rs-5','5. Punktkvalitet  σ_pos + Reliabilitet', s5),
  ].join('');
}

// ── Sidopanel ─────────────────────────────────────────────────────────────────

function _sidebar(el, state) {
  const { ellipsMode = '1sig', sigReq = 3, simResult } = state;

  el.innerHTML = `
    <div class="studio-filter-section">
      <div class="sf-head">Sektioner</div>
      ${SECTIONS.map(s =>
        `<div class="studio-filter-row rs-nav-link" data-target="${s.id}"
          style="cursor:pointer;padding:5px 3px;border-left:2px solid transparent;">
          <span class="val-secondary" style="font-size:12px">${s.title}</span>
        </div>`
      ).join('')}
    </div>

    <div class="dv" style="margin:8px 0"></div>

    <div class="studio-filter-section">
      <div class="sf-head">Inställningar</div>
      <div class="studio-filter-row val-secondary" style="font-size:12px;cursor:default;margin-bottom:6px">Felellipsskala</div>
      <div style="display:flex;gap:4px;margin-bottom:8px">
        <button class="studio-footer-btn ${ellipsMode!=='95'?'':'val-muted'}" id="rs-1sig" style="flex:1;font-size:11px">1σ (Geo)</button>
        <button class="studio-footer-btn ${ellipsMode==='95' ?'':'val-muted'}" id="rs-95"  style="flex:1;font-size:11px">95%</button>
      </div>
      <div class="studio-filter-row val-secondary" style="font-size:12px;cursor:default;margin-bottom:4px">Krav σ_pos ≤</div>
      <div style="display:flex;align-items:center;gap:6px">
        <input id="rs-sigreq" type="number" step="0.5" min="0.5" value="${sigReq}"
          class="studio-search" style="width:70px">
        <span class="val-muted" style="font-size:11px">mm</span>
      </div>
    </div>`;

  // Sektionsnavigering
  el.querySelectorAll('.rs-nav-link').forEach(link =>
    link.addEventListener('click', () => {
      const tgt = _el?.main?.querySelector(`#${link.dataset.target}`);
      if (tgt) tgt.scrollIntoView({ behavior:'smooth', block:'start' });
    })
  );

  // Felellipsskala
  el.querySelector('#rs-1sig')?.addEventListener('click', () => {
    setState({ ellipsMode: '1sig' });
    render(_el, getState());
  });
  el.querySelector('#rs-95')?.addEventListener('click', () => {
    setState({ ellipsMode: '95' });
    render(_el, getState());
  });

  // σ_pos-krav
  el.querySelector('#rs-sigreq')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (v > 0) { setState({ sigReq: v }); render(_el, getState()); }
  });
}

// ── Huvudvy ────────────────────────────────────────────────────────────────────

function _renderMain(mainEl, state) {
  const { simResult } = state;
  if (!simResult?.ok) {
    mainEl.innerHTML = `<div class="studio-loading" style="flex-direction:column;gap:12px">
      <span>Ingen simulering har beräknats. Gå till fliken SIMULERING och tryck ▶ Beräkna simulering</span>
      <button class="studio-footer-btn" onclick="window._setTab?.('sim')">→ Gå till SIMULERING</button>
    </div>`;
    return;
  }

  const html = _buildReportHTML(state);
  mainEl.innerHTML = `<div class="rs-wrapper">${html}</div>`;

  // Kopiera-knappar
  mainEl.querySelectorAll('.rs-copy-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const contentEl = mainEl.querySelector(`#${btn.dataset.for}`);
      if (contentEl) await _copySection(contentEl);
    })
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function _renderFooter(el) {
  el.innerHTML = `<span class="studio-footer-stat val-muted">Simuleringsrapport</span>
    <span class="studio-footer-spacer"></span>
    <button class="studio-footer-btn" onclick="window._exportRep?.()">📄 Exportera .txt</button>
    <button class="studio-footer-btn" onclick="window._exportSimPDF?.()">🖨 Exportera PDF</button>`;
}

// ── Publikt API ────────────────────────────────────────────────────────────────

export function render(containers, state) {
  _el = containers;
  _sidebar(containers.sidebar, state);
  _renderMain(containers.main, state);
  _renderFooter(containers.footer);
}
