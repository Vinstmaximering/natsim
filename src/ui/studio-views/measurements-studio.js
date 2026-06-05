// MÄTNINGAR studio-vy – mätningstabell med sortering, filter och residual-kolumn.
import { getState, setState }    from '../../state/store.js';
import { calcM }                 from '../../core/designmatrix.js';
import { sortByColumn, filterByText, filterByType, exportToCSV } from '../table-utils.js';

const OBS_LABEL = { both:'Hz+Dm', hz_only:'Hz', dist_only:'Dm' };
const OBS_COLOR = { both:'var(--color-success)', hz_only:'var(--accent)', dist_only:'var(--color-measure)' };

// Modul-scope filter/sort – bevaras under sessionen.
let _sort   = { key:'id', dir:'asc' };
let _filter = { types: ['both','hz_only','dist_only'], station:'all', search:'' };
let _el     = null;

// ── Hjälpfunktioner ──────────────────────────────────────────────────────────

function _rows(state) {
  const { pts, meas, simResult } = state;
  let base = meas.map(m => {
    const md  = calcM(m, pts);
    const rd  = simResult?.ok ? simResult.redund?.find(r => r.measId === m.id && r.type === 'dist') : null;
    const rh  = simResult?.ok ? simResult.redund?.find(r => r.measId === m.id && r.type === 'hz')   : null;
    const eff = m.sigHz_mgon != null ? m.sigHz_mgon / Math.sqrt(m.numSatser || 1) : null;
    return {
      id:       m.id,
      from:     m.from,
      to:       m.to,
      type:     m.obsType || 'both',
      dist:     md?.dist ?? null,
      sigHz:    eff,
      sigDm:    m.sigDist_mm ?? null,
      hasInput: m.measDist != null || m.measHz != null,
      ri:       rd?.ri ?? rh?.ri ?? null,
    };
  });

  base = filterByType(base, _filter.types, 'type');
  if (_filter.station !== 'all') base = base.filter(r => r.from === _filter.station);
  base = filterByText(base, _filter.search, ['id','from','to']);
  return sortByColumn(base, _sort.key, _sort.dir);
}

function _avgSig(meas, field) {
  const vals = meas.map(m => m[field]).filter(v => v != null);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

const fmt3 = v => v != null ? Number(v).toFixed(3) : '–';

// ── Sidopanel ────────────────────────────────────────────────────────────────

function _sidebar(el, state) {
  const { meas } = state;
  const tot   = meas.length;
  const nBoth = meas.filter(m => (m.obsType || 'both') === 'both').length;
  const nHz   = meas.filter(m => (m.obsType || 'both') === 'hz_only').length;
  const nDm   = meas.filter(m => (m.obsType || 'both') === 'dist_only').length;

  // Effektiv medelosäkerhet
  const meanHz = _avgSig(meas.map(m => ({
    sigHz: m.sigHz_mgon != null ? m.sigHz_mgon / Math.sqrt(m.numSatser || 1) : null
  })), 'sigHz');
  const meanDm = _avgSig(meas.map(m => ({ sigDm: m.sigDist_mm ?? null })), 'sigDm');

  // Unika från-stationer
  const stations = ['all', ...[...new Set(meas.map(m => m.from))].sort()];

  el.innerHTML = `
    <div class="studio-stat-grid">
      <div class="studio-stat-card">
        <div class="sc-val" style="color:var(--accent)">${tot}</div>
        <div class="sc-lbl">Totalt</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val" style="color:var(--color-success)">${nBoth}</div>
        <div class="sc-lbl">Hz+Dm</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val" style="color:var(--accent)">${nHz}</div>
        <div class="sc-lbl">Enbart Hz</div>
      </div>
      <div class="studio-stat-card">
        <div class="sc-val" style="color:var(--color-measure)">${nDm}</div>
        <div class="sc-lbl">Enbart Dm</div>
      </div>
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Observationstyp</div>
      ${Object.entries(OBS_LABEL).map(([k, l]) => `
        <label class="studio-filter-row">
          <input type="checkbox" data-obs="${k}" ${_filter.types.includes(k) ? 'checked' : ''}
                 style="accent-color:${OBS_COLOR[k]}">
          <span style="color:${OBS_COLOR[k]}">${l}</span>
        </label>`).join('')}
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Från-station</div>
      <select class="studio-search" id="ms-station" style="font-family:monospace">
        ${stations.map(s => `<option value="${s}" ${s === _filter.station ? 'selected' : ''}>${s === 'all' ? '— Alla —' : s}</option>`).join('')}
      </select>
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Sök</div>
      <input class="studio-search" id="ms-search"
             placeholder="Filtrera på ID, Från, Till…"
             value="${_filter.search.replace(/"/g, '&quot;')}">
    </div>

    ${meanHz != null || meanDm != null ? `
    <div class="studio-filter-section">
      <div class="sf-head">Medel σ (effektiv)</div>
      ${meanHz != null ? `<div class="studio-filter-row" style="cursor:default">σ-Hz: <span style="color:var(--text-value);margin-left:auto;font-family:monospace">${fmt3(meanHz)} mgon</span></div>` : ''}
      ${meanDm != null ? `<div class="studio-filter-row" style="cursor:default">σ-Dm: <span style="color:var(--text-value);margin-left:auto;font-family:monospace">${fmt3(meanDm)} mm</span></div>` : ''}
    </div>` : ''}`;

  el.querySelectorAll('input[data-obs]').forEach(cb =>
    cb.addEventListener('change', () => {
      const t = cb.dataset.obs;
      _filter.types = cb.checked
        ? [...new Set([..._filter.types, t])]
        : _filter.types.filter(x => x !== t);
      _rerenderTable(getState());
    })
  );

  el.querySelector('#ms-station').addEventListener('change', e => {
    _filter.station = e.target.value;
    _rerenderTable(getState());
  });

  el.querySelector('#ms-search').addEventListener('input', e => {
    _filter.search = e.target.value;
    _rerenderTable(getState());
  });
}

// ── Huvudtabell ──────────────────────────────────────────────────────────────

const COLS = [
  { key:'id',       label:'ID' },
  { key:'from',     label:'Från' },
  { key:'to',       label:'Till' },
  { key:'type',     label:'Typ' },
  { key:'dist',     label:'Avst kalk (m)' },
  { key:'sigHz',    label:'σ-Hz (mgon)' },
  { key:'sigDm',    label:'σ-Dm (mm)' },
  { key:'hasInput', label:'Inmatat' },
  { key:'ri',       label:'r_i' },
];

function _main(el, rows, state) {
  const ths = COLS.map(({ key, label }) => {
    const cls = _sort.key === key ? (_sort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return `<th class="${cls}" data-sort="${key}">${label}</th>`;
  }).join('');

  const tbody = rows.map(r => {
    const tc  = OBS_COLOR[r.type] ?? 'var(--text-primary)';
    const sel = r.id === state.selMId ? ' sel-row' : '';
    const riCls = r.ri == null ? '' : r.ri < 0.1 ? ' err-row' : r.ri < 0.3 ? ' warn-row' : '';
    return `<tr data-id="${r.id}" class="${sel}${riCls}">
      <td style="color:var(--color-measure);font-weight:bold">${r.id}</td>
      <td>${r.from}</td>
      <td>${r.to}</td>
      <td style="color:${tc}">${OBS_LABEL[r.type] ?? r.type}</td>
      <td class="mono">${fmt3(r.dist)}</td>
      <td class="mono">${fmt3(r.sigHz)}</td>
      <td class="mono">${fmt3(r.sigDm)}</td>
      <td style="text-align:center">${r.hasInput ? '✓' : ''}</td>
      <td class="mono" style="color:${r.ri != null ? (r.ri < 0.1 ? 'var(--color-danger)' : r.ri < 0.3 ? 'var(--color-warning-text)' : 'var(--color-success)') : 'var(--text-muted)'}">${r.ri != null ? r.ri.toFixed(3) : '–'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="st-table">
    <thead><tr>${ths}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  el.querySelectorAll('th[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      _sort = _sort.key === th.dataset.sort
        ? { key: _sort.key, dir: _sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key: th.dataset.sort, dir: 'asc' };
      _rerenderTable(getState());
    })
  );

  el.querySelectorAll('tr[data-id]').forEach(tr =>
    tr.addEventListener('click', () => {
      setState({ selMId: tr.dataset.id });
      window._openMM?.(tr.dataset.id);
    })
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function _footer(el, total, shown) {
  el.innerHTML = `
    <span class="studio-footer-stat">${shown} av ${total} mätningar</span>
    <span class="studio-footer-spacer"></span>
    <button class="studio-footer-btn" id="ms-new">📏 Ny mätning</button>
    <button class="studio-footer-btn" id="ms-csv">📥 Exportera CSV</button>`;

  el.querySelector('#ms-new').addEventListener('click', () => {
    window.closeStudio?.();
    window.setTool?.('measure');
  });

  el.querySelector('#ms-csv').addEventListener('click', () =>
    exportToCSV(_rows(getState()), [
      { key:'id',    label:'Mätnings-ID' },
      { key:'from',  label:'Från' },
      { key:'to',    label:'Till' },
      { key:'type',  label:'Typ' },
      { key:'dist',  label:'Avst kalk (m)' },
      { key:'sigHz', label:'σ-Hz (mgon)' },
      { key:'sigDm', label:'σ-Dm (mm)' },
      { key:'ri',    label:'r_i' },
    ], 'natsim-matningar')
  );
}

// ── Publikt API ──────────────────────────────────────────────────────────────

export function render(containers, state) {
  _el = containers;
  _sidebar(containers.sidebar, state);
  const rows = _rows(state);
  _main(containers.main, rows, state);
  _footer(containers.footer, state.meas.length, rows.length);
}

function _rerenderTable(state) {
  if (!_el) return;
  const rows = _rows(state);
  _main(_el.main, rows, state);
  _footer(_el.footer, state.meas.length, rows.length);
}
