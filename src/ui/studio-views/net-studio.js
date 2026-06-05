// NÄT studio-vy – punktlista med sortering, filter och inline coord-redigering.
import { getState, setState }     from '../../state/store.js';
import { map, ENtoLatLng, draw }  from '../../map/leaflet-setup.js';
import { saveUndo }               from '../../state/undo.js';
import { PT }                     from '../../core/constants.js';
import { sortByColumn, filterByText, filterByType, exportToCSV } from '../table-utils.js';

const TYPE_LABEL = { known:'Känd', station:'Station', new:'Ny', detail:'Detalj', simstation:'SimStn' };
const TYPE_COLOR = { known:'#00ff88', station:'#4fc3f7', new:'#ce93d8', detail:'#ffb74d', simstation:'#ff6090' };
const COLS = [
  { key:'id',        label:'ID' },
  { key:'type',      label:'Typ' },
  { key:'N',         label:'N (m)' },
  { key:'E',         label:'E (m)' },
  { key:'H',         label:'H (m)' },
  { key:'measCount', label:'Mätningar' },
];

// Modul-scope: bevaras under sessionen, läses/skrivs i sidopanel-lyssnare.
let _sort   = { key:'id', dir:'asc' };
let _filter = { types: Object.keys(TYPE_LABEL), search:'' };
let _el     = null;   // { sidebar, main, footer } – sätts i render()

// ── Hjälpfunktioner ──────────────────────────────────────────────────────────

function _rows(state) {
  const base = state.pts.map(p => ({
    id:        p.id,
    type:      p.type,
    N:         p.N ?? 0,
    E:         p.E ?? 0,
    H:         p.H ?? 0,
    measCount: state.meas.filter(m => m.from === p.id || m.to === p.id).length,
  }));
  let r = filterByType(base, _filter.types, 'type');
  r = filterByText(r, _filter.search, ['id']);
  return sortByColumn(r, _sort.key, _sort.dir);
}

function _counts(pts) {
  return Object.fromEntries(Object.keys(TYPE_LABEL).map(k => [k, pts.filter(p => p.type === k).length]));
}

const fCoord = v => (typeof v === 'number' ? v.toFixed(3) : '–');

// ── Sidopanel ────────────────────────────────────────────────────────────────

function _sidebar(el, state) {
  const c = _counts(state.pts);
  el.innerHTML = `
    <div class="studio-stat-grid">
      ${Object.entries(TYPE_LABEL).map(([k, l]) => `
        <div class="studio-stat-card" style="border-color:${TYPE_COLOR[k]}44">
          <div class="sc-val" style="color:${TYPE_COLOR[k]}">${c[k] ?? 0}</div>
          <div class="sc-lbl">${l}</div>
        </div>`).join('')}
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Visa typer</div>
      ${Object.entries(TYPE_LABEL).map(([k, l]) => `
        <label class="studio-filter-row">
          <input type="checkbox" data-type="${k}" ${_filter.types.includes(k) ? 'checked' : ''}
                 style="accent-color:${TYPE_COLOR[k]}">
          <span style="color:${TYPE_COLOR[k]}">${l}</span>
          <span style="color:var(--text-muted);margin-left:auto">${c[k] ?? 0}</span>
        </label>`).join('')}
    </div>

    <div class="studio-filter-section">
      <div class="sf-head">Sök</div>
      <input class="studio-search" id="ns-search"
             placeholder="Filtrera på Punkt-ID…"
             value="${_filter.search.replace(/"/g, '&quot;')}">
    </div>

    <div class="studio-filter-section">
      <button class="studio-footer-btn" id="ns-new" style="width:100%">
        ➕ Ny punkt
      </button>
    </div>`;

  el.querySelectorAll('input[data-type]').forEach(cb => {
    cb.addEventListener('change', () => {
      const type = cb.dataset.type;
      _filter.types = cb.checked
        ? [...new Set([..._filter.types, type])]
        : _filter.types.filter(t => t !== type);
      _rerenderTable(getState());
    });
  });

  el.querySelector('#ns-search').addEventListener('input', e => {
    _filter.search = e.target.value;
    _rerenderTable(getState());
  });

  el.querySelector('#ns-new').addEventListener('click', () => {
    window.setTool?.('known');
    window.closeStudio?.();
  });
}

// ── Huvudtabell ──────────────────────────────────────────────────────────────

function _main(el, rows, state) {
  const ths = COLS.map(({ key, label }) => {
    const cls = _sort.key === key ? (_sort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return `<th class="${cls}" data-sort="${key}">${label}</th>`;
  }).join('');

  const tbody = rows.map(r => {
    const col = TYPE_COLOR[r.type] ?? 'var(--text-primary)';
    const sel = r.id === state.selId ? ' sel-row' : '';
    return `<tr data-id="${r.id}" class="${sel}">
      <td style="color:${col};font-weight:bold">${r.id}</td>
      <td style="color:${col}">${TYPE_LABEL[r.type] ?? r.type}</td>
      <td class="mono editable-coord" data-pt="${r.id}" data-coord="N" data-val="${r.N}">${fCoord(r.N)}</td>
      <td class="mono editable-coord" data-pt="${r.id}" data-coord="E" data-val="${r.E}">${fCoord(r.E)}</td>
      <td class="mono editable-coord" data-pt="${r.id}" data-coord="H" data-val="${r.H}">${fCoord(r.H)}</td>
      <td class="dim">${r.measCount}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="st-table">
    <thead><tr>${ths}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  // Sortering
  el.querySelectorAll('th[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      _sort = _sort.key === th.dataset.sort
        ? { key: _sort.key, dir: _sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key: th.dataset.sort, dir: 'asc' };
      _rerenderTable(getState());
    })
  );

  // Klick på rad → markera + panorera karta
  el.querySelectorAll('tr[data-id]').forEach(tr =>
    tr.addEventListener('click', e => {
      if (e.target.classList.contains('editable-coord')) return;
      const pt = getState().pts.find(p => p.id === tr.dataset.id);
      if (!pt) return;
      setState({ selId: pt.id });
      try { if (map) map.panTo(ENtoLatLng(pt.E, pt.N)); } catch (_) {}
      _rerenderTable(getState());
    })
  );

  // Inline-redigering av koordinater
  el.addEventListener('dblclick', e => {
    const cell = e.target.closest('.editable-coord');
    if (!cell) return;
    const { pt: ptId, coord, val: origVal } = cell.dataset;

    let done = false;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = '0.001'; inp.value = origVal;
    inp.style.cssText = 'width:100%;padding:2px 4px;font-family:monospace;font-size:inherit;'
      + 'background:var(--bg-input);border:1px solid var(--accent);color:var(--text-value);border-radius:2px;box-sizing:border-box';
    cell.innerHTML = ''; cell.appendChild(inp);
    inp.focus(); inp.select();

    const save = () => {
      if (done) return; done = true;
      const v = parseFloat(inp.value);
      if (isNaN(v)) { cancel(true); return; }
      const { pts } = getState();
      const pt = pts.find(p => p.id === ptId);
      if (!pt) return;
      saveUndo(`Redigera ${coord} för ${ptId}`);
      pt[coord] = v;
      setState({ pts: [...pts], simResult: null });
      draw();
      render(_el, getState());   // full re-render (sidebar-statistik kan ha ändrats)
    };
    const cancel = (force = false) => {
      if (done && !force) return; done = true;
      cell.textContent = fCoord(parseFloat(origVal));
    };

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    inp.addEventListener('blur', () => cancel());
  });
}

// ── Footer ───────────────────────────────────────────────────────────────────

function _footer(el, total, shown) {
  el.innerHTML = `
    <span class="studio-footer-stat">Visar ${shown} av ${total} punkter</span>
    <span class="studio-footer-spacer"></span>
    <button class="studio-footer-btn" id="ns-csv">📥 Exportera CSV</button>`;

  el.querySelector('#ns-csv').addEventListener('click', () =>
    exportToCSV(_rows(getState()), [
      { key:'id',        label:'Punkt-ID' },
      { key:'type',      label:'Typ' },
      { key:'N',         label:'N (m)' },
      { key:'E',         label:'E (m)' },
      { key:'H',         label:'H (m)' },
      { key:'measCount', label:'Mätningar' },
    ], 'natsim-punkter')
  );
}

// ── Publikt API ──────────────────────────────────────────────────────────────

export function _resetForTest() {
  _sort   = { key:'id', dir:'asc' };
  _filter = { types: Object.keys(TYPE_LABEL), search:'' };
  _el     = null;
}

export function render(containers, state) {
  _el = containers;
  _sidebar(containers.sidebar, state);
  const rows = _rows(state);
  _main(containers.main, rows, state);
  _footer(containers.footer, state.pts.length, rows.length);
}

function _rerenderTable(state) {
  if (!_el) return;
  const rows = _rows(state);
  _main(_el.main, rows, state);
  _footer(_el.footer, state.pts.length, rows.length);
}
