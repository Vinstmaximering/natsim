// Etapp 5: LAGER-sektionen i vänsterpanelen.
//
// Två grupper med olika innebörd, och skillnaden är hela poängen med panelen:
//
//   BERÄKNING  – nätet och hindren. De deltar i simulering och siktberäkning.
//                Ögat här döljer dem bara på kartan; beräkningen rör sig inte.
//                Den gröna bocken markerar just det: raden ingår i beräkningen.
//
//   VISUELLA   – de visuella lagren. De ingår aldrig i någon beräkning, hur
//                synliga de än är. Ögat här styr både ritning och om objekten
//                går att träffa på kartan (se state/visual.js).
//
// Listan ritas om ur state vid varje draw(); inget tillstånd bor i DOM:en.
import { getState, setState } from '../state/store.js';
import { draw, fitViewToENBounds } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import { showToast } from './toast.js';
import {
  VISUAL_COLORS, VISUAL_DEFAULT_COLOR, VISUAL_LAYER_FALLBACK_NAME,
  getVisualLayers, findVisualLayer, addVisualLayer, updateVisualLayer,
  removeVisualLayer, setActiveVisualLayer, visualLayerCounts,
} from '../state/visual.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const el = id => document.getElementById(id);
const eye = on => on ? '👁' : '🚫';

// ── Rendering ────────────────────────────────────────────────────────────────

export function renderLayerPanel() {
  const list = el('layer-list');
  if (!list) return;
  const st = getState();

  const nPts  = (st.pts  || []).length;
  const nMeas = (st.meas || []).length;
  const nObs  = (st.obstacles || []).length;
  const netOn = st.netVisible !== false;
  const obsOn = st.obstaclesVisible !== false;

  const calcRow = (key, on, namn, detalj) => `
    <div class="lyr-row lyr-calc">
      <button type="button" class="lyr-eye" data-calc="${key}"
              aria-pressed="${on}" title="${on ? 'Dölj på kartan' : 'Visa på kartan'}"
              >${eye(on)}</button>
      <span class="lyr-inc" title="Ingår i beräkning och siktlinjer">✓</span>
      <span class="lyr-name${on ? '' : ' lyr-off'}">${namn}</span>
      <span class="lyr-count">${detalj}</span>
    </div>`;

  const layers = getVisualLayers();
  const active = st.activeVisualLayerId;

  const layerRow = l => {
    const c = visualLayerCounts(l.id, st);
    const on = l.visible !== false;
    return `
      <div class="lyr-row lyr-vis${l.id === active ? ' lyr-act' : ''}" data-layer="${esc(l.id)}"
           title="Klicka för att göra lagret aktivt">
        <button type="button" class="lyr-eye" data-eye="${esc(l.id)}"
                aria-pressed="${on}" title="${on ? 'Dölj lagret' : 'Visa lagret'}"
                >${eye(on)}</button>
        <span class="lyr-swatch" style="background:${l.color || VISUAL_DEFAULT_COLOR};"></span>
        <span class="lyr-name${on ? '' : ' lyr-off'}">${esc(l.name)}</span>
        <span class="lyr-count">${c.pts} p · ${c.lines} l</span>
        <button type="button" class="lyr-menu" data-menu="${esc(l.id)}"
                aria-haspopup="true" aria-expanded="false" title="Fler val">⋮</button>
      </div>`;
  };

  list.innerHTML = `
    <div class="lyr-grp">BERÄKNING</div>
    ${calcRow('net', netOn, 'Nät', `${nPts} p · ${nMeas} m`)}
    ${calcRow('obs', obsOn, 'Hinder', `${nObs} st`)}
    <div class="lyr-grp lyr-grp-vis">VISUELLA <span>(INGÅR EJ I SIMULERING)</span></div>
    ${layers.length
      ? layers.map(layerRow).join('')
      : '<div class="lyr-empty">Inga visuella lager än.</div>'}`;

  const nameEl = el('active-layer-name');
  if (nameEl) {
    const a = findVisualLayer(active, st);
    nameEl.textContent = a ? a.name : `${VISUAL_LAYER_FALLBACK_NAME} (skapas vid första objektet)`;
  }
}

// ── Radmeny (⋮) ──────────────────────────────────────────────────────────────

let _menuEl = null;

export function closeLayerMenu() {
  if (_menuEl) { _menuEl.remove(); _menuEl = null; }
  document.removeEventListener('mousedown', _onDocDown, true);
  document.removeEventListener('keydown', _onMenuKey, true);
  document.querySelectorAll('.lyr-menu[aria-expanded="true"]')
    .forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function _onDocDown(e) { if (_menuEl && !_menuEl.contains(e.target)) closeLayerMenu(); }
function _onMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeLayerMenu(); } }

function openLayerMenu(layerId, btn) {
  closeLayerMenu();
  const l = findVisualLayer(layerId);
  if (!l) return;

  const item = (act, label) => `
    <button type="button" data-act="${act}" class="lyr-mi">${label}</button>`;

  const m = document.createElement('div');
  m.className = 'lyr-pop';
  m.innerHTML = `
    <div class="lyr-pop-head">${esc(l.name)}</div>
    ${item('rename', '✎ Byt namn')}
    ${item('color',  '🎨 Byt färg')}
    ${item('active', '◉ Gör aktivt')}
    ${item('zoom',   '⌖ Zooma till')}
    <div class="lyr-pop-sep"></div>
    ${item('delete', '<span class="lyr-danger">🗑 Radera</span>')}`;
  document.body.appendChild(m);
  _menuEl = m;
  btn.setAttribute('aria-expanded', 'true');

  const r = btn.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth  - mr.width  - 8) + 'px';
  m.style.top  = Math.min(r.bottom + 2, window.innerHeight - mr.height - 8) + 'px';

  m.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    closeLayerMenu();
    if (act === 'rename' || act === 'color') openLayerSettings(layerId, act);
    if (act === 'active') { setActiveVisualLayer(layerId); renderLayerPanel(); draw(); }
    if (act === 'zoom')   zoomToLayer(layerId);
    if (act === 'delete') openLayerDelete(layerId);
  });
  document.addEventListener('mousedown', _onDocDown, true);
  document.addEventListener('keydown', _onMenuKey, true);
  m.querySelector('button')?.focus();
}

// ── Zooma till lagret ────────────────────────────────────────────────────────

export function layerBounds(layerId, state = getState()) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of state.visualPts || []) {
    if (p.layerId !== layerId) continue;
    if (p.E < minE) minE = p.E;
    if (p.E > maxE) maxE = p.E;
    if (p.N < minN) minN = p.N;
    if (p.N > maxN) maxN = p.N;
  }
  return Number.isFinite(minE) ? { minE, maxE, minN, maxN } : null;
}

function zoomToLayer(layerId) {
  const b = layerBounds(layerId);
  if (!b) { showToast('Lagret är tomt – inget att zooma till', '#7090a8'); return; }
  fitViewToENBounds(b);
}

// ── Dialoger ─────────────────────────────────────────────────────────────────
// Samma modal-infrastruktur som punkt- och hinderdialogerna (#modal/#mi).

let _editId = null;
let _editColor = null;

function mi() { return el('mi'); }
function openModal()  { const m = el('modal'); if (m) m.style.display = 'flex'; }
function closeModal() { const m = el('modal'); if (m) m.style.display = 'none'; }

function palette() {
  const sw = VISUAL_COLORS.map(c => `
    <button type="button" data-color="${c.hex}" title="${esc(c.label)}"
      style="width:28px;height:28px;padding:0;border-radius:4px;cursor:pointer;background:${c.hex};
             border:2px solid ${_editColor === c.hex ? 'var(--text-value)' : 'transparent'};
             box-shadow:0 0 0 1px #00000055;"></button>`).join('');
  return `<div id="lyr-palette" style="display:flex;gap:5px;flex-wrap:wrap;">${sw}
    <button type="button" data-color="" title="Standardfärg"
      style="width:28px;height:28px;padding:0;font-size:11px;border-radius:4px;cursor:pointer;
             background:transparent;color:var(--text-muted);
             border:2px solid ${_editColor === null ? 'var(--text-value)' : 'var(--border-strong)'};">✕</button>
  </div>`;
}

// fokus: 'rename' ställer markören i namnfältet, 'color' i paletten.
export function openLayerSettings(layerId, fokus = 'rename') {
  const l = findVisualLayer(layerId);
  if (!l || !mi()) return;
  _editId = layerId;
  _editColor = l.color;

  const c = visualLayerCounts(layerId);
  const src = l.source?.filename
    ? `<div class="val-muted" style="font-size:11px;margin-bottom:8px;">Källa: ${esc(l.source.filename)}</div>` : '';

  mi().innerHTML = `
    <div style="font-size:14px;color:${l.color || VISUAL_DEFAULT_COLOR};font-weight:bold;margin-bottom:2px;">
      Lagerinställningar</div>
    <div class="val-muted" style="font-size:11px;margin-bottom:10px;">
      ${c.pts} punkter · ${c.lines} linjer · ingår inte i simuleringen</div>
    ${src}
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">Namn</div>
    <input type="text" id="lyr-name" maxlength="60" value="${esc(l.name)}">
    <div style="font-size:11px;color:var(--text-muted);margin:6px 0 4px;">
      Färg — används när objektet saknar egen färg</div>
    <div id="lyr-color-section">${palette()}</div>
    <div class="mbs">
      <button class="bs" id="lyr-save">✓ Spara</button>
      <button class="bc" id="lyr-cancel">✕ Avbryt</button>
    </div>`;
  openModal();

  const repaint = () => {
    const sec = el('lyr-color-section');
    if (sec) { sec.innerHTML = palette(); wirePalette(); }
  };
  const wirePalette = () => el('lyr-palette')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-color]');
    if (!b) return;
    _editColor = b.dataset.color || null;
    repaint();
  });
  wirePalette();

  el('lyr-cancel').onclick = closeModal;
  el('lyr-save').onclick = () => {
    const namn = el('lyr-name').value.trim();
    saveUndo(`Lagerinställningar ${l.name}`);
    updateVisualLayer(layerId, { name: namn || l.name, color: _editColor });
    closeModal();
    renderLayerPanel();
    draw();
  };

  const target = fokus === 'color' ? el('lyr-palette')?.querySelector('button') : el('lyr-name');
  setTimeout(() => { target?.focus(); if (fokus === 'rename') el('lyr-name')?.select(); }, 0);
}

export function openLayerDelete(layerId) {
  const l = findVisualLayer(layerId);
  if (!l || !mi()) return;
  const c = visualLayerCounts(layerId);

  // Hinder som är kopplade till lagrets linjer försvinner med dem – säg det
  // rakt ut, eftersom hindren påverkar siktberäkningen.
  const st = getState();
  const lineIds = new Set((st.visualLines || []).filter(x => x.layerId === layerId).map(x => x.id));
  const nObs = (st.visualLines || []).filter(x => lineIds.has(x.id) && x.linkedObsId).length;

  mi().innerHTML = `
    <div style="font-size:14px;color:var(--color-danger);font-weight:bold;margin-bottom:8px;">
      🗑 Radera lagret ${esc(l.name)}?</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;background:var(--bg-card);
                padding:8px 10px;border-radius:3px;margin-bottom:8px;">
      ${c.pts} punkter och ${c.lines} linjer tas bort.
      ${nObs ? `<br><span class="val-warn">⚠ ${nObs} kopplade hinder försvinner också –
        siktberäkningen ändras.</span>` : ''}
      <br><span class="val-muted">Går att ångra.</span>
    </div>
    <div class="mbs">
      <button class="bd" id="lyr-del-ok" style="flex:2;">🗑 Radera lagret</button>
      <button class="bc" id="lyr-del-cancel">✕ Avbryt</button>
    </div>`;
  openModal();

  el('lyr-del-cancel').onclick = closeModal;
  el('lyr-del-ok').onclick = () => {
    saveUndo(`Radera lagret ${l.name}`);
    const n = removeVisualLayer(layerId);
    closeModal();
    renderLayerPanel();
    draw();
    showToast(`🗑 ${l.name} borttaget · ${n.pts} punkter, ${n.lines} linjer`, '#cfd8dc');
  };
}

// ── Koppling ─────────────────────────────────────────────────────────────────

export function initLayerPanel() {
  const list = el('layer-list');
  if (!list) return;

  list.addEventListener('click', e => {
    // Ögat på en beräkningsrad: ritsynlighet, inget annat.
    const calc = e.target.closest('button[data-calc]');
    if (calc) {
      e.stopPropagation();
      const key = calc.dataset.calc;
      const st = getState();
      setState(key === 'net'
        ? { netVisible: st.netVisible === false }
        : { obstaclesVisible: st.obstaclesVisible === false });
      renderLayerPanel();
      draw();
      return;
    }

    const eyeBtn = e.target.closest('button[data-eye]');
    if (eyeBtn) {
      e.stopPropagation();
      const id = eyeBtn.dataset.eye;
      const l = findVisualLayer(id);
      if (l) updateVisualLayer(id, { visible: l.visible === false });
      renderLayerPanel();
      draw();
      return;
    }

    const menuBtn = e.target.closest('button[data-menu]');
    if (menuBtn) {
      e.stopPropagation();
      openLayerMenu(menuBtn.dataset.menu, menuBtn);
      return;
    }

    // Klick på raden i övrigt gör lagret aktivt.
    const row = e.target.closest('.lyr-vis[data-layer]');
    if (row) {
      setActiveVisualLayer(row.dataset.layer);
      renderLayerPanel();
      draw();
    }
  });

  el('btn-new-layer')?.addEventListener('click', () => {
    saveUndo('Nytt visuellt lager');
    const n = getVisualLayers().length + 1;
    const id = addVisualLayer({ name: `Lager ${n}`, source: { kind: 'manual' } });
    setActiveVisualLayer(id);
    renderLayerPanel();
    draw();
    openLayerSettings(id, 'rename');
  });

  renderLayerPanel();
}
