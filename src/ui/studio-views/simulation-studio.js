// SIMULERING studio-vy – punkter + mätningar med sub-flikar och problemmarkering.
import { getState, setState }     from '../../state/store.js';
import { map, ENtoLatLng }        from '../../map/leaflet-setup.js';
import { calcM }                  from '../../core/designmatrix.js';
import { sortByColumn, filterByText, exportToCSV } from '../table-utils.js';

const TYPE_COLOR = { known:'#00ff88', station:'#4fc3f7', new:'#ce93d8', detail:'#ffb74d', simstation:'#ff6090' };
const TYPE_LABEL = { known:'Känd', station:'Station', new:'Ny', detail:'Detalj', simstation:'SimStn' };

const rClass   = r  => r  >= 0.5 ? 'val-good' : r  >= 0.3 ? 'val-caution' : r  >= 0.1 ? 'val-warn' : 'val-danger';
const sigClass = mm => mm <  5   ? 'val-good' : mm <  20  ? 'val-caution' : 'val-danger';
const kClass   = kv => kv > 1.14 ? 'val-purple' : kv >= 0.5 ? 'val-good' : kv >= 0.3 ? 'val-caution' : kv >= 0.1 ? 'val-warn' : 'val-danger';

let _subTab     = 'pts';
let _sortPts    = { key:'id',  dir:'asc' };
let _sortMeas   = { key:'ri',  dir:'asc' };
let _filterPts  = { search:'', onlyProbs:false };
let _filterMeas = { search:'', types:['dist','hz'] };
let _el         = null;

export function _resetForTest() {
  _subTab     = 'pts';
  _sortPts    = { key:'id', dir:'asc' };
  _sortMeas   = { key:'ri', dir:'asc' };
  _filterPts  = { search:'', onlyProbs:false };
  _filterMeas = { search:'', types:['dist','hz'] };
  _el         = null;
}

// ── Radgeneratorer ────────────────────────────────────────────────────────────

function _ptRows(state) {
  const { simResult, pts } = state;
  if (!simResult?.ok) return [];
  return simResult.ptResults.map(pr => {
    const pt   = pts.find(p => p.id === pr.id) || {};
    const myR  = simResult.redund.filter(rd => rd.fromId === pr.id || rd.toId === pr.id);
    const nObs = myR.length;
    const rMean    = nObs > 0 ? myR.reduce((a, b) => a + b.ri, 0) / nObs : null;
    const sigPos_mm = pr.sigPos * 1000;
    return {
      id:         pr.id,
      type:       pt.type || '',
      N:          pt.N ?? 0,
      E:          pt.E ?? 0,
      rMean,
      a_mm:       pr.aSemi * 1000,
      b_mm:       pr.bSemi * 1000,
      sigPos_mm,
      isProb:     (rMean != null && rMean < 0.3) || sigPos_mm > 5,
    };
  });
}

function _measRows(state) {
  const { simResult, pts, meas } = state;
  if (!simResult?.ok) return [];
  return simResult.redund.map(rd => {
    const m   = meas.find(x => x.id === rd.measId) || {};
    const md  = calcM(m, pts);
    const eff = m.sigHz_mgon != null ? m.sigHz_mgon / Math.sqrt(m.numSatser || 1) : null;
    const mufStr = rd.mdb.val === Infinity ? '∞'
      : rd.type === 'dist' ? (rd.mdb.val*1000).toFixed(1)+'mm'
      : rd.mdb.val.toFixed(2)+'mgon';
    const yt    = rd.mdb.val === Infinity ? Infinity : rd.mdb.val * (1 - rd.ri);
    const ytStr = yt === Infinity ? '∞'
      : rd.type === 'dist' ? (yt*1000).toFixed(2)+'mm'
      : yt.toFixed(4)+'gon';
    const kpStr = rd.yt_m == null || rd.yt_m === Infinity ? '∞' : (rd.yt_m*1000).toFixed(2);
    return { id:rd.measId, from:rd.fromId, to:rd.toId, type:rd.type,
             dist:md?.dist??null, sigHz:eff, sigDm:m.sigDist_mm??null,
             ri:rd.ri, mufStr, ytStr, kpStr };
  });
}

// ── Sidopanel ─────────────────────────────────────────────────────────────────

function _sidebar(el, state) {
  const { simResult } = state;
  if (!simResult?.ok) {
    el.innerHTML = '<div class="studio-loading">Ingen simulering körts</div>';
    return;
  }
  const sr    = simResult;
  const minR  = Math.min(sr.rMinDist ?? Infinity, sr.rMinHz ?? Infinity);
  const maxYT = sr.redund.reduce((acc, rd) =>
    Math.max(acc, rd.yt_m == null || rd.yt_m === Infinity ? 0 : rd.yt_m * 1000), 0);
  const sigPosVals = (sr.allPtResults || sr.ptResults || []).map(p => p.sigPos * 1000);
  const maxSig = sigPosVals.length ? Math.max(...sigPosVals) : 0;
  const probs  = _ptRows(state).filter(r => r.isProb);

  const ytCls = maxYT > 20 ? 'val-danger' : maxYT > 10 ? 'val-warn' : 'val-good';

  el.innerHTML = `
    <div class="studio-stat-grid" style="margin-bottom:12px">
      <div class="studio-stat-card">
        <div class="sc-val ${kClass(sr.K_global)}">${sr.K_global.toFixed(3)}</div>
        <div class="sc-lbl">K-tal</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val ${ytCls}">${isFinite(maxYT) ? maxYT.toFixed(1) : '∞'}</div>
        <div class="sc-lbl">Max YT mm</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val ${rClass(isFinite(minR) ? minR : 1)}">${isFinite(minR) ? minR.toFixed(3) : '–'}</div>
        <div class="sc-lbl">Min r_i</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val ${sigClass(maxSig)}">${maxSig.toFixed(1)}</div>
        <div class="sc-lbl">Max σpos mm</div>
      </div>
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Problempunkter (${probs.length})</div>
      ${probs.length === 0
        ? '<div class="val-good" style="font-size:12px;padding:4px 0">✓ Alla punkter inom kvalitetskrav</div>'
        : probs.map(r => {
            const reas = r.sigPos_mm > 5 && (r.rMean == null || r.rMean >= 0.3)
              ? 'Stor osäkerhet'
              : r.rMean != null && r.rMean < 0.3 && r.sigPos_mm <= 5
              ? 'Låg redundans'
              : 'Låg redundans + stor osäkerhet';
            const bcls = r.rMean != null && r.rMean < 0.1 ? 'val-danger'
              : r.sigPos_mm > 20 ? 'val-danger'
              : r.rMean != null && r.rMean < 0.3 ? 'val-warn'
              : 'val-caution';
            return `<div class="studio-filter-row sim-prob-row" data-prob-id="${r.id}"
              style="cursor:pointer;padding:5px 6px;border-left:3px solid currentColor;margin-bottom:4px;border-radius:0 3px 3px 0;background:color-mix(in srgb,currentColor 6%,transparent)">
              <span class="${bcls}">
                <b>${r.id}</b>
                <span style="font-size:11px;margin-left:6px">${reas}</span>
              </span>
            </div>`;
          }).join('')}
    </div>

    <div class="studio-filter-section">
      <div class="sf-head val-muted">Minikarta</div>
      <div style="aspect-ratio:1.5;background:var(--bg-card);border:1px solid var(--border-default);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:22px;">🗺</div>
      <div class="val-muted" style="font-size:10px;text-align:center;margin-top:4px">Mini-karta (implementeras i fas D)</div>
    </div>`;

  el.querySelectorAll('.sim-prob-row').forEach(div =>
    div.addEventListener('click', () => {
      const id = div.dataset.probId;
      const pt = getState().pts.find(p => p.id === id);
      if (pt) {
        setState({ selId: id });
        try { if (map) map.panTo(ENtoLatLng(pt.E, pt.N)); } catch (_) {}
      }
      _el?.main?.querySelector(`tr[data-id="${id}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' });
    })
  );
}

// ── Punkt-sub-flik ─────────────────────────────────────────────────────────────

const PT_COLS = [
  { key:'id',        label:'ID',        align:'left'  },
  { key:'type',      label:'Typ',       align:'left'  },
  { key:'N',         label:'N (m)',     align:'right' },
  { key:'E',         label:'E (m)',     align:'right' },
  { key:'rMean',     label:'r̄',        align:'right' },
  { key:'a_mm',      label:'a mm',      align:'right' },
  { key:'b_mm',      label:'b mm',      align:'right' },
  { key:'sigPos_mm', label:'σpos mm',   align:'right' },
  { key:'_status',   label:'Status',    align:'center', nosort:true },
];

function _renderPts(el, state) {
  let rows = _ptRows(state);
  if (_filterPts.onlyProbs) rows = rows.filter(r => r.isProb);
  rows = filterByText(rows, _filterPts.search, ['id']);
  rows = sortByColumn(rows, _sortPts.key, _sortPts.dir);

  const ths = PT_COLS.map(c => {
    const sc  = !c.nosort && _sortPts.key === c.key ? (_sortPts.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    const ds  = c.nosort ? '' : `data-sort="${c.key}"`;
    return `<th class="val-muted ${sc}" ${ds} style="padding:8px 12px;text-align:${c.align};font-weight:normal;white-space:nowrap;${c.nosort?'':'cursor:pointer'}">${c.label}</th>`;
  }).join('');

  const tbody = rows.map(r => {
    const col  = TYPE_COLOR[r.type] ?? 'var(--text-primary)';
    const sel  = r.id === state.selId ? ' sel-row' : '';
    const bg   = r.isProb ? ';background:color-mix(in srgb,var(--color-danger) 6%,transparent)' : '';
    const rCls = r.rMean != null ? rClass(r.rMean) : 'val-muted';
    const sCls = sigClass(r.sigPos_mm);
    const icon = !r.isProb ? '<span class="val-good">✓</span>'
      : r.sigPos_mm > 5 ? '<span class="val-danger">✕</span>'
      : '<span class="val-warn">⚠</span>';
    return `<tr data-id="${r.id}" class="${sel}" style="border-bottom:1px solid var(--border-default);cursor:pointer${bg}">
      <td style="padding:8px 12px;color:${col};font-weight:bold">${r.id}</td>
      <td style="padding:8px 12px;color:${col}">${TYPE_LABEL[r.type]??r.type}</td>
      <td class="mono val-secondary" style="padding:8px 12px;text-align:right">${r.N.toFixed(3)}</td>
      <td class="mono val-secondary" style="padding:8px 12px;text-align:right">${r.E.toFixed(3)}</td>
      <td class="mono ${rCls}" style="padding:8px 12px;text-align:right;font-weight:bold">${r.rMean!=null?r.rMean.toFixed(3):'–'}</td>
      <td class="mono val-muted" style="padding:8px 12px;text-align:right">${r.a_mm.toFixed(2)}</td>
      <td class="mono val-muted" style="padding:8px 12px;text-align:right">${r.b_mm.toFixed(2)}</td>
      <td class="mono ${sCls}" style="padding:8px 12px;text-align:right;font-weight:bold">${r.sigPos_mm.toFixed(2)}</td>
      <td style="padding:8px 12px;text-align:center">${icon}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-default);flex-shrink:0">
      <input class="studio-search" id="sp-search" placeholder="Sök punkt-ID…"
             value="${_filterPts.search.replace(/"/g,'&quot;')}" style="max-width:200px">
      <label class="studio-filter-row" style="margin-bottom:0;cursor:pointer">
        <input type="checkbox" id="sp-onlyprob" ${_filterPts.onlyProbs?'checked':''} style="accent-color:var(--accent)">
        Visa bara problem
      </label>
    </div>
    <div style="overflow:auto;flex:1">
      <table class="st-table" style="font-size:13px">
        <thead><tr style="border-bottom:2px solid var(--border-strong)">${ths}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  el.querySelector('#sp-search')?.addEventListener('input', e => {
    _filterPts.search = e.target.value; _rerenderMain(getState());
  });
  el.querySelector('#sp-onlyprob')?.addEventListener('change', e => {
    _filterPts.onlyProbs = e.target.checked; _rerenderMain(getState());
  });
  el.querySelectorAll('th[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      _sortPts = _sortPts.key === th.dataset.sort
        ? { key:_sortPts.key, dir:_sortPts.dir==='asc'?'desc':'asc' }
        : { key:th.dataset.sort, dir:'asc' };
      _rerenderMain(getState());
    })
  );
  el.querySelectorAll('tr[data-id]').forEach(tr =>
    tr.addEventListener('click', () => {
      const pt = getState().pts.find(p => p.id === tr.dataset.id);
      if (!pt) return;
      setState({ selId: pt.id });
      try { if (map) map.panTo(ENtoLatLng(pt.E, pt.N)); } catch (_) {}
    })
  );
  return rows.length;
}

// ── Mätnings-sub-flik ──────────────────────────────────────────────────────────

const MEAS_COLS = [
  { key:'id',     label:'ID',        align:'left'  },
  { key:'from',   label:'Från',      align:'left'  },
  { key:'to',     label:'Till',      align:'left'  },
  { key:'type',   label:'Typ',       align:'left'  },
  { key:'dist',   label:'Avst (m)',  align:'right' },
  { key:'sigHz',  label:'σ-Hz',      align:'right' },
  { key:'sigDm',  label:'σ-Dm',      align:'right' },
  { key:'ri',     label:'r_i',       align:'right' },
  { key:'mufStr', label:'MUF',       align:'right' },
  { key:'ytStr',  label:'YT',        align:'right' },
  { key:'kpStr',  label:'KP mm',     align:'right' },
];

function _renderMeas(el, state) {
  let rows = _measRows(state);
  if (_filterMeas.types.length < 2) rows = rows.filter(r => _filterMeas.types.includes(r.type));
  rows = filterByText(rows, _filterMeas.search, ['id','from','to']);
  rows = sortByColumn(rows, _sortMeas.key, _sortMeas.dir);

  const ths = MEAS_COLS.map(c => {
    const sc = _sortMeas.key === c.key ? (_sortMeas.dir==='asc'?'sort-asc':'sort-desc') : '';
    return `<th class="val-muted ${sc}" data-sort="${c.key}"
      style="padding:8px 12px;text-align:${c.align};font-weight:normal;white-space:nowrap;cursor:pointer">${c.label}</th>`;
  }).join('');

  const fmt3 = v => v!=null ? Number(v).toFixed(3) : '–';
  const tbody = rows.map(r => {
    const rcls = rClass(r.ri);
    const sel  = r.id === state.selMId ? ' sel-row' : '';
    return `<tr data-id="${r.id}" class="${sel}" style="border-bottom:1px solid var(--border-default);cursor:pointer">
      <td style="padding:8px 12px;color:var(--color-measure);font-weight:bold">${r.id}</td>
      <td style="padding:8px 12px">${r.from}</td>
      <td style="padding:8px 12px">${r.to}</td>
      <td class="val-info" style="padding:8px 12px">${r.type==='dist'?'Avst':'Riktning'}</td>
      <td class="mono val-secondary" style="padding:8px 12px;text-align:right">${r.dist!=null?r.dist.toFixed(3):'–'}</td>
      <td class="mono val-muted" style="padding:8px 12px;text-align:right">${fmt3(r.sigHz)}</td>
      <td class="mono val-muted" style="padding:8px 12px;text-align:right">${fmt3(r.sigDm)}</td>
      <td class="mono ${rcls}" style="padding:8px 12px;text-align:right;font-weight:bold">${r.ri.toFixed(3)}</td>
      <td class="mono val-muted" style="padding:8px 12px;text-align:right">${r.mufStr}</td>
      <td class="mono val-info"  style="padding:8px 12px;text-align:right">${r.ytStr}</td>
      <td class="mono val-warn"  style="padding:8px 12px;text-align:right">${r.kpStr}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-default);flex-shrink:0">
      <input class="studio-search" id="sm-search" placeholder="Sök mätning…"
             value="${_filterMeas.search.replace(/"/g,'&quot;')}" style="max-width:200px">
      <label class="studio-filter-row" style="margin-bottom:0;cursor:pointer">
        <input type="checkbox" data-obs="dist" ${_filterMeas.types.includes('dist')?'checked':''}
               style="accent-color:var(--accent)"> Avst
      </label>
      <label class="studio-filter-row" style="margin-bottom:0;cursor:pointer">
        <input type="checkbox" data-obs="hz" ${_filterMeas.types.includes('hz')?'checked':''}
               style="accent-color:var(--accent)"> Riktning
      </label>
    </div>
    <div style="overflow:auto;flex:1">
      <table class="st-table" style="font-size:13px">
        <thead><tr style="border-bottom:2px solid var(--border-strong)">${ths}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  el.querySelector('#sm-search')?.addEventListener('input', e => {
    _filterMeas.search = e.target.value; _rerenderMain(getState());
  });
  el.querySelectorAll('[data-obs]').forEach(cb =>
    cb.addEventListener('change', () => {
      const t = cb.dataset.obs;
      _filterMeas.types = cb.checked
        ? [...new Set([..._filterMeas.types, t])]
        : _filterMeas.types.filter(x => x !== t);
      _rerenderMain(getState());
    })
  );
  el.querySelectorAll('th[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      _sortMeas = _sortMeas.key === th.dataset.sort
        ? { key:_sortMeas.key, dir:_sortMeas.dir==='asc'?'desc':'asc' }
        : { key:th.dataset.sort, dir:'asc' };
      _rerenderMain(getState());
    })
  );
  el.querySelectorAll('tr[data-id]').forEach(tr =>
    tr.addEventListener('click', () => {
      setState({ selMId: tr.dataset.id });
      window._openMM?.(tr.dataset.id);
    })
  );
  return rows.length;
}

// ── Huvud-rendering ────────────────────────────────────────────────────────────

function _renderMain(mainEl, state) {
  const { simResult } = state;

  if (!simResult?.ok) {
    mainEl.innerHTML = `<div class="studio-loading" style="flex-direction:column;gap:12px">
      <span>Kör simuleringen först – gå till SIMULERING-fliken och tryck ▶</span>
      <button class="studio-footer-btn" onclick="window._setTab?.('sim')">→ Gå till SIMULERING</button>
    </div>`;
    if (_el?.footer) _el.footer.innerHTML = '';
    return;
  }

  mainEl.innerHTML = '';
  mainEl.style.display  = 'flex';
  mainEl.style.flexDirection = 'column';
  mainEl.style.overflow = 'hidden';

  // Sub-flik-rad
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;border-bottom:1px solid var(--border-default);flex-shrink:0;padding:0 8px';
  ['pts','meas'].forEach(t => {
    const n   = t === 'pts' ? (simResult.ptResults||[]).length : (simResult.redund||[]).length;
    const btn = document.createElement('button');
    btn.className = 'tabt' + (_subTab === t ? ' act' : '');
    btn.textContent = t === 'pts' ? `Punkter (${n})` : `Mätningar (${n})`;
    btn.style.fontSize = '13px';
    btn.addEventListener('click', () => { _subTab = t; _renderMain(mainEl, getState()); });
    bar.appendChild(btn);
  });

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  mainEl.appendChild(bar);
  mainEl.appendChild(content);

  const shown = _subTab === 'pts' ? _renderPts(content, state) : _renderMeas(content, state);
  if (_el?.footer) _renderFooter(_el.footer, state, shown);
}

function _renderFooter(el, state, shown) {
  const { simResult } = state;
  if (!simResult?.ok) { el.innerHTML = ''; return; }
  const total = _subTab === 'pts' ? (simResult.ptResults||[]).length : (simResult.redund||[]).length;
  const lbl   = _subTab === 'pts' ? 'punkter' : 'mätningar';
  el.innerHTML = `
    <span class="studio-footer-stat">Visar ${shown} av ${total} ${lbl}</span>
    <span class="studio-footer-spacer"></span>
    <button class="studio-footer-btn" id="sim-csv">📥 Exportera CSV</button>`;

  el.querySelector('#sim-csv')?.addEventListener('click', () => {
    if (_subTab === 'pts') {
      let rows = _ptRows(state);
      if (_filterPts.onlyProbs) rows = rows.filter(r => r.isProb);
      rows = filterByText(rows, _filterPts.search, ['id']);
      rows = sortByColumn(rows, _sortPts.key, _sortPts.dir);
      exportToCSV(rows, [
        {key:'id',label:'ID'},{key:'type',label:'Typ'},
        {key:'N',label:'N (m)'},{key:'E',label:'E (m)'},
        {key:'rMean',label:'r̄'},{key:'a_mm',label:'a mm'},
        {key:'b_mm',label:'b mm'},{key:'sigPos_mm',label:'σpos mm'},
      ], 'natsim-sim-punkter');
    } else {
      let rows = _measRows(state);
      rows = filterByText(rows, _filterMeas.search, ['id','from','to']);
      rows = sortByColumn(rows, _sortMeas.key, _sortMeas.dir);
      exportToCSV(rows, [
        {key:'id',label:'ID'},{key:'from',label:'Från'},
        {key:'to',label:'Till'},{key:'type',label:'Typ'},
        {key:'ri',label:'r_i'},{key:'mufStr',label:'MUF'},
        {key:'ytStr',label:'YT'},{key:'kpStr',label:'KP mm'},
      ], 'natsim-sim-matningar');
    }
  });
}

// ── Publikt API ────────────────────────────────────────────────────────────────

export function render(containers, state) {
  _el = containers;
  _sidebar(containers.sidebar, state);
  _renderMain(containers.main, state);
}

function _rerenderMain(state) {
  if (!_el) return;
  _renderMain(_el.main, state);
}
