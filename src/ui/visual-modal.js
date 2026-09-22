// Kontextmeny och redigeringsdialog för visuella objekt (Etapp D2/D4).
//
// Kontextmenyn på en visuell linje erbjuder "Använd som vägg" och "Använd som
// blockeringslinje". Båda skapar ett riktigt hinder i det befintliga
// hinder-systemet, kopplat till linjen via linkedObsId. Hindrets koordinater är
// en projektion av linjen – flyttas linjen följer väggen med, se
// syncLinkedObstacles() i state/visual.js.
import { addObstacle }        from '../state/obstacles.js';
import { saveUndo }           from '../state/undo.js';
import { draw }               from '../map/leaflet-setup.js';
import { showToast }          from './toast.js';
import {
  VISUAL_COLORS, visualObjColor,
  findVisualPt, findVisualLine, visualLineCoords, findVisualLayer,
  updateVisualPt, updateVisualLine, removeVisualPt, removeVisualLine,
} from '../state/visual.js';
import { normalizeHexColor } from '../core/colors.js';

// Roller för hinder skapade ur en visuell linje. Båda blockerar sikt likadant –
// hasLineOfSight skiljer inte på dem – men de får olika namn och färg så att de
// går att hålla isär i hinder-listan.
const OBS_ROLES = {
  wall:    { label: 'Vägg',             color: '#8aa8c0' },
  blocker: { label: 'Blockeringslinje', color: '#ef5350' },
};

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

export function openVisualMenu(id, clientX, clientY) {
  closeVisualMenu();
  const obj = findVisual(id);
  if (!obj) return;
  const line = isLine(id);
  const linked = line && obj.linkedObsId;

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
      ${line ? '⤺ Visuell linje' : '○ Visuell punkt'} ${esc(id)}
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
  const line = isLine(id);
  if (!confirm(`Ta bort ${line ? 'visuell linje' : 'visuell punkt'} ${id}?`)) return;
  saveUndo(`Ta bort ${id}`);
  if (line) removeVisualLine(id);
  else {
    const n = removeVisualPt(id);
    if (n > 0) showToast(`○ ${id} borttagen · ${n} linje(r) togs bort med den`, '#cfd8dc');
  }
  draw();
}

// Skapar ett hinder som spårar den visuella linjen.
function _useAsObstacle(id, role) {
  const line = findVisualLine(id);
  if (!line) return;
  const coords = visualLineCoords(line);
  if (!coords) { showToast('⚠ Linjen saknar giltiga ändpunkter', '#ff5050'); return; }

  const cfg = OBS_ROLES[role];
  saveUndo(`${cfg.label} från ${id}`);
  const obsId = addObstacle({
    type: 'line',
    label: `${cfg.label} (${id})`,
    color: cfg.color,
    source: 'visual',
    points: coords,
  });
  updateVisualLine(id, { linkedObsId: obsId });
  showToast(`${cfg.label} skapad från ${id} – följer linjen`, cfg.color);
  draw();
}

function _unlink(id) {
  const line = findVisualLine(id);
  if (!line?.linkedObsId) return;
  const obsId = line.linkedObsId;
  saveUndo(`Koppla loss ${id}`);
  // Hindret blir fristående och behåller sina koordinater.
  updateVisualLine(id, { linkedObsId: null });
  showToast(`${id} styr inte längre ${obsId}`, '#cfd8dc');
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
  const obj = findVisual(id);
  if (!obj) return;
  _editId    = id;
  _editColor = normalizeHexColor(obj.color);
  const line = isLine(id);

  const epLabel = ep => ep.ref === 'net' ? `${ep.id} (nätpunkt)` : `${ep.id} (visuell)`;

  mi().innerHTML = `
    <div style="font-size:14px;color:${visualObjColor(obj)};margin-bottom:4px;font-weight:bold;">
      ${line ? '⤺' : '○'} Redigera ${line ? 'visuell linje' : 'visuell punkt'}
    </div>
    <div style="font-size:11px;color:#7090a8;margin-bottom:10px;">
      ${esc(id)}${obj.name ? ` · "${esc(obj.name)}"` : ''} · lager: ${esc(findVisualLayer(obj.layerId)?.name || '–')} · ingår inte i simuleringen
    </div>
    ${line ? `
      <div style="font-size:11px;color:#7090a8;background:#091424;padding:6px;border-radius:3px;margin-bottom:8px;line-height:1.6;">
        Från: ${esc(epLabel(obj.from))}<br>Till: ${esc(epLabel(obj.to))}
        ${obj.linkedObsId ? `<br><span style="color:#ffd54f;">▨ Styr hindret ${esc(obj.linkedObsId)}</span>` : ''}
      </div>` : `
      ${[['E', 'E-koordinat (m)', obj.E], ['N', 'N-koordinat (m)', obj.N], ['H', 'Höjd (m ö.h.)', obj.H ?? 0]]
        .map(([k, l, v]) => `<div style="margin-bottom:6px;">
          <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">${l}</div>
          <input id="vis_${k}" type="number" step="0.001" value="${Number(v).toFixed(3)}"></div>`).join('')}`}
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
      const E = num('E'), N = num('N'), H = num('H');
      const changes = { color: _editColor };
      if (E !== null) changes.E = E;
      if (N !== null) changes.N = N;
      if (H !== null) changes.H = H;
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
