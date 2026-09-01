// Redigeringsdialog för hinder (väggar och byggnadslinjer).
// Öppnas från hinder-panelens ✎-knapp. Låter användaren sätta namn och färg
// per hinder-objekt så att olika strukturtyper går att skilja åt i kartan.
import { getState }                     from '../state/store.js';
import { updateObstacle, removeObstacle,
         OBSTACLE_COLORS, normalizeObstacleColor } from '../state/obstacles.js';
import { saveUndo }                     from '../state/undo.js';
import { draw }                         from '../map/leaflet-setup.js';

// Färgen som redigeras just nu. Hålls utanför DOM:en så att palettmarkeringen
// kan ritas om utan att bygga om hela dialogen (namnfältet skulle tappa fokus).
let _editColor = null;
let _editId    = null;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function mi() { return document.getElementById('mi'); }

// Paletten ritas om separat vid varje färgval.
function renderColorSection() {
  const cur = _editColor;
  const swatches = OBSTACLE_COLORS.map(c => {
    const on = cur === c.hex;
    return `<button onclick="window._setObsColor('${c.hex}')" title="${esc(c.label)}"
      style="width:30px;height:30px;padding:0;border-radius:4px;cursor:pointer;background:${c.hex};
             border:2px solid ${on ? '#e8f4fd' : 'transparent'};box-shadow:0 0 0 1px #00000055;"></button>`;
  }).join('');

  return `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
      ${swatches}
      <button onclick="window._setObsColor('')" title="Standardfärg"
        style="width:30px;height:30px;padding:0;font-size:11px;border-radius:4px;cursor:pointer;
               background:transparent;color:#7090a8;
               border:2px solid ${cur === null ? '#e8f4fd' : '#1e3850'};">✕</button>
    </div>`;
}

function refreshColorSection() {
  const el = document.getElementById('obs-color-section');
  if (el) el.innerHTML = renderColorSection();
}

export function openEditObstacle(id) {
  const obs = (getState().obstacles || []).find(o => o.id === id);
  if (!obs) return;
  _editId    = id;
  _editColor = normalizeObstacleColor(obs.color);

  const isPoly = obs.type === 'polygon';
  mi().innerHTML = `
    <div style="font-size:14px;color:#ff9900;margin-bottom:10px;font-weight:bold;">
      ${isPoly ? '🏢' : '━'} Redigera ${isPoly ? 'byggnad' : 'vägg'}
    </div>
    <div style="font-size:11px;color:#7090a8;margin-bottom:8px;">
      ${obs.id} · ${obs.points.length} hörn${obs.source === 'osm' ? ' · från OSM' : ''}
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:2px;">Namn</div>
      <input id="obs-label" type="text" maxlength="60"
        placeholder="ex. Bergvägg norr, Betongvägg..." value="${esc(obs.label)}">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;color:#7090a8;margin-bottom:4px;">
        Färg — ✕ ger standardfärg
      </div>
      <div id="obs-color-section">${renderColorSection()}</div>
    </div>
    <div class="mbs">
      <button class="bs" onclick="window._saveObsEdit()">✓ Spara</button>
      <button class="bd" onclick="window._delObsFromModal()">🗑</button>
      <button class="bc" onclick="window._closeModal()">✕</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

export function initObstacleModal(onChanged) {
  window._openEditObs = openEditObstacle;

  window._setObsColor = hex => {
    _editColor = normalizeObstacleColor(hex);
    refreshColorSection();
  };

  window._saveObsEdit = () => {
    if (!_editId) return;
    const label = document.getElementById('obs-label')?.value.trim() ?? '';
    saveUndo(`Redigera ${_editId}`);
    updateObstacle(_editId, { label, color: _editColor });
    window._closeModal();
    draw();
    onChanged?.();
  };

  window._delObsFromModal = () => {
    if (!_editId) return;
    const obs = (getState().obstacles || []).find(o => o.id === _editId);
    const name = obs?.label || _editId;
    if (!confirm(`Ta bort ${name}?`)) return;
    saveUndo(`Ta bort ${_editId}`);
    removeObstacle(_editId);
    window._closeModal();
    draw();
    onChanged?.();
  };
}
