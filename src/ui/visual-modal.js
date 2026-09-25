// Kontextmeny och redigeringsdialog för visuella objekt (Etapp D2/D4).
//
// Kontextmenyn på en visuell linje erbjuder "Använd som vägg" och "Använd som
// blockeringslinje". Båda skapar riktiga hinder i det befintliga
// hinder-systemet – ett linjehinder per segment i polylinjen – kopplade till
// linjen via linkedObsIds. Hindrens koordinater är en projektion av linjen –
// flyttas linjen följer väggen med, se syncLinkedObstacles() i state/visual.js.
import { saveUndo }           from '../state/undo.js';
import { draw }               from '../map/leaflet-setup.js';
import { showToast }          from './toast.js';
import {
  VISUAL_COLORS, visualObjColor,
  findVisualPt, findVisualLine, findVisualArea, findVisualLayer,
  updateVisualPt, updateVisualLine, removeVisualPt, removeVisualLine,
  removeVisualArea, setVisualAreaBlocksSight,
  LINE_OBSTACLE_ROLES, linkVisualLineObstacles, unlinkVisualLineObstacles, visualLineSegments,
} from '../state/visual.js';
import { setState } from '../state/store.js';
import { normalizeHexColor } from '../core/colors.js';

let _editId = null;
let _editColor = null;
let _menuEl = null;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const findVisual = id => findVisualLine(id) || findVisualPt(id);
const isLine     = id => !!findVisualLine(id);

// ── Kontextmeny ─────────────────────────────────────────────────────────────

export function closeVisualMenu() {
  if (_menuEl) { _menuEl.remove(); _menuEl = null; }
  document.removeEventListener('mousedown', _onDocDown, true);
  document.removeEventListener('keydown', _onMenuKey, true);
}

function _onDocDown(e) {
  if (_menuEl && !_menuEl.contains(e.target)) closeVisualMenu();
}
function _onMenuKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeVisualMenu(); }
}

// Ytor (Lager-verktyg Etapp 3): menyn pekar mot egenskapskortet, som har alla
// inställningar; här finns bara de vanligaste valen.
function openAreaMenu(area, clientX, clientY) {
  const item = (label, act, danger) => `
    <button data-act="${act}" class="lyr-mi">${danger ? `<span class="lyr-danger">${label}</span>` : label}</button>`;
  const el = document.createElement('div');
  el.className = 'lyr-pop visual-ctx';
  el.innerHTML = `
    <div class="lyr-pop-head">▱ Yta ${esc(area.name || area.id)}</div>
    ${item('✎ Egenskaper', 'props')}
    ${item(area.linkedObsId ? '☑ Blockerar sikt (hinder)' : '☐ Blockerar sikt (hinder)', 'block')}
    <div class="lyr-pop-sep"></div>
    ${item('🗑 Ta bort', 'delete', true)}`;
  document.body.appendChild(el);
  _menuEl = el;
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(clientX, window.innerWidth  - r.width  - 8) + 'px';
  el.style.top  = Math.min(clientY, window.innerHeight - r.height - 8) + 'px';
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    closeVisualMenu();
    if (b.dataset.act === 'props') openEditVisual(area.id);
    if (b.dataset.act === 'block') {
      saveUndo(`Blockerar sikt ${area.name || area.id}`);
      setVisualAreaBlocksSight(area.id, !area.linkedObsId);
      draw();
    }
    if (b.dataset.act === 'delete') {
      const hinder = area.linkedObsId ? '\nDess hinder försvinner också – siktberäkningen ändras.' : '';
      if (!confirm(`Ta bort ytan ${area.name || area.id}?${hinder}`)) return;
      saveUndo(`Ta bort yta ${area.name || area.id}`);
      removeVisualArea(area.id);
      draw();
    }
  });
  document.addEventListener('mousedown', _onDocDown, true);
  document.addEventListener('keydown', _onMenuKey, true);
}

export function openVisualMenu(id, clientX, clientY) {
  closeVisualMenu();
  const area = findVisualArea(id);
  if (area) { openAreaMenu(area, clientX, clientY); return; }
  const obj = findVisual(id);
  if (!obj) return;
  const line = isLine(id);
  const linked = line && obj.linkedObsIds?.length;

  const item = (label, handler, opts = {}) => `
    <button data-act="${handler}" ${opts.disabled ? 'disabled' : ''}
      style="display:block;width:100%;text-align:left;padding:6px 12px;font-size:12px;
             background:transparent;border:none;cursor:${opts.disabled ? 'not-allowed' : 'pointer'};
             color:${opts.disabled ? '#4a6070' : (opts.danger ? '#ff7070' : '#e8f4fd')};">${label}</button>`;

  const el = document.createElement('div');
  el.className = 'visual-ctx';
  el.style.cssText = `position:fixed;z-index:300;min-width:210px;padding:4px 0;
    background:var(--bg-panel,#0d1b2e);border:1px solid var(--border-strong,#1e3850);
    border-radius:4px;box-shadow:0 6px 20px rgba(0,0,0,0.5);`;
  el.innerHTML = `
    <div style="padding:5px 12px 6px;font-size:11px;color:#7090a8;border-bottom:1px solid #1e3850;">
      ${line ? '⤺ Visuell linje' : '○ Visuell punkt'} ${esc(obj.name || id)}
    </div>
    ${item('✎ Redigera', 'edit')}
    ${item('🗑 Ta bort', 'delete', { danger: true })}
    ${line ? `
      <div style="height:1px;background:#1e3850;margin:4px 0;"></div>
      ${linked
        ? item('⛓ Koppla loss från hindret', 'unlink')
        : item('━ Använd som vägg', 'wall') + item('⛔ Använd som blockeringslinje', 'blocker')}
    ` : ''}`;

  document.body.appendChild(el);
  _menuEl = el;

  // Håll menyn innanför fönstret
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(clientX, window.innerWidth  - r.width  - 8) + 'px';
  el.style.top  = Math.min(clientY, window.innerHeight - r.height - 8) + 'px';

  el.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('mouseenter', () => { if (!b.disabled) b.style.background = 'rgba(79,195,247,0.12)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      closeVisualMenu();
      if (act === 'edit')     openEditVisual(id);
      if (act === 'delete')   _deleteVisual(id);
      if (act === 'wall')     _useAsObstacle(id, 'wall');
      if (act === 'blocker')  _useAsObstacle(id, 'blocker');
      if (act === 'unlink')   _unlink(id);
    });
  });

  document.addEventListener('mousedown', _onDocDown, true);
  document.addEventListener('keydown', _onMenuKey, true);
}

// ── Åtgärder ────────────────────────────────────────────────────────────────

function _deleteVisual(id) {
  const line = findVisualLine(id);
  const hinder = line?.linkedObsIds?.length
    ? `\nDess ${line.linkedObsIds.length === 1 ? 'hinder' : `${line.linkedObsIds.length} hinder`} försvinner också – siktberäkningen ändras.` : '';
  if (!confirm(`Ta bort ${line ? 'visuell linje' : 'visuell punkt'} ${line?.name || id}?${hinder}`)) return;
  saveUndo(`Ta bort ${id}`);
  if (line) removeVisualLine(id);
  else {
    const n = removeVisualPt(id);
    if (n > 0) showToast(`○ ${id} borttagen · ${n} linje(r) togs bort med den`, '#cfd8dc');
  }
  draw();
}

// Skapar hinder – ett per segment – som spårar den visuella linjen.
function _useAsObstacle(id, role) {
  const line = findVisualLine(id);
  if (!line) return;
  if (!visualLineSegments(line)?.length) {
    showToast('⚠ Linjens hörn går inte att lösa upp – inget hinder skapades', '#ff5050');
    return;
  }
  const cfg = LINE_OBSTACLE_ROLES[role];
  saveUndo(`${cfg.label} från ${id}`);
  const n = linkVisualLineObstacles(id, role);
  showToast(`${cfg.label} skapad från ${id}${n > 1 ? ` (${n} segment)` : ''} – följer linjen`, cfg.color);
  draw();
}

function _unlink(id) {
  const line = findVisualLine(id);
  if (!line?.linkedObsIds?.length) return;
  const n = line.linkedObsIds.length;
  saveUndo(`Koppla loss ${id}`);
  // Hindren blir fristående och behåller sina koordinater.
  unlinkVisualLineObstacles(id);
  showToast(`${id} styr inte längre ${n === 1 ? line.linkedObsIds[0] : `sina ${n} hinder`}`, '#cfd8dc');
  draw();
}

// ── Redigeringsdialog ───────────────────────────────────────────────────────

function mi() { return document.getElementById('mi'); }

function renderPalette() {
  const cur = _editColor;
  const swatches = VISUAL_COLORS.map(c => {
    const on = cur === c.hex;
    return `<button onclick="window._setVisualColor('${c.hex}')" title="${esc(c.label)}"
      style="width:30px;height:30px;padding:0;border-radius:4px;cursor:pointer;background:${c.hex};
             border:2px solid ${on ? '#e8f4fd' : 'transparent'};box-shadow:0 0 0 1px #00000055;"></button>`;
  }).join('');
  return `<div style="display:flex;gap:5px;flex-wrap:wrap;">
      ${swatches}
      <button onclick="window._setVisualColor('')" title="Standardfärg"
        style="width:30px;height:30px;padding:0;font-size:11px;border-radius:4px;cursor:pointer;
               background:transparent;color:#7090a8;
               border:2px solid ${cur === null ? '#e8f4fd' : '#1e3850'};">✕</button>
    </div>`;
}

export function openEditVisual(id) {
  // En yta redigeras i sitt egenskapskort, som visas när ytan är markerad.
  if (findVisualArea(id)) { setState({ selVisualId: id }); draw(); return; }
  const obj = findVisual(id);
  if (!obj) return;
  _editId    = id;
  _editColor = normalizeHexColor(obj.color);
  const line = isLine(id);

  const nNet = line ? obj.vertices.filter(v => v.ref === 'net').length : 0;

  mi().innerHTML = `
    <div style="font-size:14px;color:${visualObjColor(obj)};margin-bottom:4px;font-weight:bold;">
      ${line ? '⤺' : '○'} Redigera ${line ? 'visuell linje' : 'visuell punkt'}
    </div>
    <div style="font-size:11px;color:#7090a8;margin-bottom:10px;">
      ${esc(id)}${obj.name ? ` · "${esc(obj.name)}"` : ''} · lager: ${esc(findVisualLayer(obj.layerId)?.name || '–')} · ingår inte i simuleringen
    </div>
    ${line ? `
      <div style="font-size:11px;color:#7090a8;background:#091424;padding:6px;border-radius:3px;margin-bottom:8px;line-height:1.6;">
        ${obj.vertices.length} hörn${nNet ? ` (varav ${nNet} nätpunkt${nNet === 1 ? '' : 'er'})` : ''} · ${obj.closed ? 'sluten' : 'öppen'}
        ${obj.linkedObsIds?.length ? `<br><span style="color:#ffd54f;">▨ Styr ${obj.linkedObsIds.length === 1 ? 'hindret' : 'hindren'} ${esc(obj.linkedObsIds.join(', '))}</span>` : ''}
      </div>` : `
      ${[['E', 'E-koordinat (m)', obj.E], ['N', 'N-koordinat (m)', obj.N], ['H', 'Höjd (m ö.h.) – tomt: ingen höjd', obj.H]]
        .map(([k, l, v]) => `<div style="margin-bottom:6px;">
          <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">${l}</div>
          <input id="vis_${k}" type="number" step="0.001" value="${Number.isFinite(v) ? Number(v).toFixed(3) : ''}"></div>`).join('')}`}
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:4px;">Färg — ✕ ger lagrets färg</div>
      <div id="visual-color-section">${renderPalette()}</div>
    </div>
    <div class="mbs">
      <button class="bs" onclick="window._saveVisualEdit()">✓ Spara</button>
      <button class="bd" onclick="window._delVisualFromModal()">🗑</button>
      <button class="bc" onclick="window._closeModal()">✕</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

export function initVisualModal() {
  window._openVisualMenu = openVisualMenu;
  window._openEditVisual = openEditVisual;

  window._setVisualColor = hex => {
    _editColor = normalizeHexColor(hex);
    const sec = document.getElementById('visual-color-section');
    if (sec) sec.innerHTML = renderPalette();
  };

  window._saveVisualEdit = () => {
    if (!_editId) return;
    saveUndo(`Redigera ${_editId}`);
    if (isLine(_editId)) {
      updateVisualLine(_editId, { color: _editColor });
    } else {
      const num = k => {
        const v = parseFloat(document.getElementById(`vis_${k}`)?.value);
        return Number.isFinite(v) ? v : null;
      };
      const E = num('E'), N = num('N');
      const changes = { color: _editColor };
      if (E !== null) changes.E = E;
      if (N !== null) changes.N = N;
      // Tomt höjdfält betyder ingen höjd (H: null), inte 0.
      changes.H = num('H');
      updateVisualPt(_editId, changes);
    }
    window._closeModal();
    draw();
  };

  window._delVisualFromModal = () => {
    if (!_editId) return;
    const id = _editId;
    window._closeModal();
    _deleteVisual(id);
  };
}
