// Egenskapskort för en visuell yta (Lager-verktyg Etapp 3).
//
// Kortet visas när en yta är markerad (state.selVisualId) och döljs när
// markeringen försvinner. Det byggs om bara när en annan yta markeras; annars
// uppdateras värdena på plats, så att ett namnfält man skriver i inte tappar
// fokus när kartan ritas om.
//
// Varje ändring är ett eget ångra-steg. Opacitetsreglaget sparar ett steg per
// dragning, inte per pixel. "Blockerar sikt (hinder)" går genom
// setVisualAreaBlocksSight(): ytan projiceras till ett polygonhinder med
// linkedObsId, samma väg som "Använd som vägg" för linjer. Area och omkrets
// räknas i koordinatsystemets projektionsplan och märks "(plan)".
import { getState, setState, subscribe } from '../state/store.js';
import { draw } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import { showToast } from './toast.js';
import {
  VISUAL_COLORS, VISUAL_DEFAULT_COLOR, AREA_PATTERNS,
  findVisualLayer, visualAreaCoords, visualObjColor, isVisualObjVisible,
  updateVisualArea, setVisualAreaBlocksSight, removeVisualArea,
} from '../state/visual.js';
import { areaStats, formatPlanArea, formatPlanLength } from '../state/area-geometry.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const PATTERN_LABELS = { none: 'Inget', hatch: 'Snedstreck', grid: 'Rutnät' };

let _shownId = null;
let _sliding = false;

const el = id => document.getElementById(id);
const $  = sel => el('area-card')?.querySelector(sel);

/** Den markerade ytan, om den finns och syns. */
function selectedArea(state) {
  const a = (state.visualAreas || []).find(x => x.id === state.selVisualId);
  return a && isVisualObjVisible(a, state) ? a : null;
}

export function renderAreaCard(state = getState()) {
  const card = el('area-card');
  if (!card) return;
  const area = selectedArea(state);
  if (!area) {
    card.hidden = true;
    _shownId = null;
    return;
  }
  if (_shownId !== area.id) { build(card, area); _shownId = area.id; }
  card.hidden = false;
  update(area, state);
}

function build(card, area) {
  const swatches = VISUAL_COLORS.map(c => `
    <button type="button" class="ac-sw" data-color="${c.hex}" title="${esc(c.label)}"
            aria-label="${esc(c.label)}" style="background:${c.hex};"></button>`).join('');
  card.innerHTML = `
    <div class="ac-head">
      <span class="ac-title">▱ Yta <span class="ac-id">${esc(area.id)}</span></span>
      <button type="button" class="ac-close" data-ac="close" title="Stäng (avmarkera)" aria-label="Stäng">×</button>
    </div>
    <div class="ac-row"><span class="ac-k">Lager</span>
      <span class="ac-v"><span class="ac-lsw"></span><span class="ac-layer"></span></span></div>
    <label class="ac-row"><span class="ac-k">Namn</span>
      <input type="text" class="ac-name" maxlength="60" placeholder="(inget namn)"></label>
    <div class="ac-row"><span class="ac-k">Area</span><span class="ac-v ac-area"></span></div>
    <div class="ac-row"><span class="ac-k">Omkrets</span><span class="ac-v ac-perim"></span></div>
    <div class="ac-row"><span class="ac-k">Hörn</span><span class="ac-v ac-n"></span></div>
    <div class="ac-warn" hidden></div>
    <div class="ac-sub">Fyllnadsfärg</div>
    <div class="ac-pal">${swatches}
      <button type="button" class="ac-sw ac-sw-layer" data-color="" title="Lagrets färg"
              aria-label="Lagrets färg">✕</button></div>
    <label class="ac-row"><span class="ac-k">Opacitet</span>
      <input type="range" class="ac-op" min="0" max="100" step="5">
      <span class="ac-opv"></span></label>
    <label class="ac-row"><span class="ac-k">Mönster</span>
      <select class="ac-pat">${AREA_PATTERNS.map(p =>
        `<option value="${p}">${PATTERN_LABELS[p]}</option>`).join('')}</select></label>
    <label class="ac-block"><input type="checkbox" class="ac-bs">
      <span>Blockerar sikt (hinder)<span class="ac-hint">Ytan blir ett byggnadshinder i siktberäkningen.</span></span></label>
    <div class="ac-foot">
      <button type="button" class="ac-del" data-ac="delete">🗑 Ta bort</button>
    </div>`;
  wire(card, area.id);
}

function update(area, state) {
  const layer = findVisualLayer(area.layerId, state);
  const coords = visualAreaCoords(area, state);
  const st = areaStats(coords || []);
  const nNet = (area.vertices || []).filter(v => v.ref === 'net').length;

  $('.ac-layer').textContent = layer?.name ?? '–';
  $('.ac-lsw').style.background = layer?.color || VISUAL_DEFAULT_COLOR;
  const name = $('.ac-name');
  if (document.activeElement !== name) name.value = area.name || '';
  $('.ac-area').textContent  = st.selfIntersecting ? '–' : formatPlanArea(st.area);
  $('.ac-perim').textContent = formatPlanLength(st.perimeter);
  $('.ac-n').textContent = `${area.vertices.length}${nNet ? ` (varav ${nNet} nätpunkt${nNet === 1 ? '' : 'er'})` : ''}`;

  const warn = $('.ac-warn');
  warn.hidden = !st.selfIntersecting;
  warn.textContent = st.selfIntersecting
    ? '⚠ Ytan korsar sig själv – ingen area visas. Omkretsen räknas längs kanterna i ritordning.' : '';

  for (const b of el('area-card').querySelectorAll('.ac-sw')) {
    const on = (b.dataset.color || null) === (area.color || null);
    b.classList.toggle('ac-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  const pct = Math.round((area.fillOpacity ?? 0.25) * 100);
  const op = $('.ac-op');
  if (document.activeElement !== op) op.value = String(pct);
  $('.ac-opv').textContent = `${pct} %`;
  $('.ac-pat').value = area.pattern || 'none';
  $('.ac-bs').checked = !!area.linkedObsId;
  el('area-card').style.setProperty('--ac-col', visualObjColor(area, state));
}

function wire(card, id) {
  const label = () => {
    const a = (getState().visualAreas || []).find(x => x.id === id);
    return a?.name || id;
  };
  const commit = (text, fn) => { saveUndo(`${text} ${label()}`); fn(); draw(); };

  card.querySelector('[data-ac="close"]').addEventListener('click', () => {
    setState({ selVisualId: null });
    draw();
  });

  const name = card.querySelector('.ac-name');
  name.addEventListener('change', () => commit('Namnge yta', () => updateVisualArea(id, { name: name.value })));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });

  card.querySelector('.ac-pal').addEventListener('click', e => {
    const b = e.target.closest('button[data-color]');
    if (!b) return;
    commit('Färg på yta', () => updateVisualArea(id, { color: b.dataset.color || null }));
  });

  const op = card.querySelector('.ac-op');
  op.addEventListener('input', () => {
    if (!_sliding) { saveUndo(`Opacitet ${label()}`); _sliding = true; }
    updateVisualArea(id, { fillOpacity: Number(op.value) / 100 });
    draw();
  });
  op.addEventListener('change', () => { _sliding = false; });

  const pat = card.querySelector('.ac-pat');
  pat.addEventListener('change', () => commit('Mönster på yta', () => updateVisualArea(id, { pattern: pat.value })));

  const bs = card.querySelector('.ac-bs');
  bs.addEventListener('change', () => {
    const on = bs.checked;
    commit(on ? 'Yta blockerar sikt:' : 'Yta blockerar inte sikt:', () => {
      if (!setVisualAreaBlocksSight(id, on)) {
        showToast('⚠ Ytans hörn går inte att lösa upp – inget hinder skapades', '#ff5050');
      } else {
        showToast(on ? `▨ ${label()} blockerar sikt – hindret följer ytan`
                     : `${label()} blockerar inte längre sikt`, '#cfd8dc');
      }
    });
  });

  card.querySelector('[data-ac="delete"]').addEventListener('click', () => {
    const a = (getState().visualAreas || []).find(x => x.id === id);
    if (!a) return;
    const hinder = a.linkedObsId ? '\nDess hinder försvinner också – siktberäkningen ändras.' : '';
    if (!confirm(`Ta bort ytan ${label()}?${hinder}`)) return;
    commit('Ta bort yta', () => removeVisualArea(id));
  });
}

export function initAreaCard() {
  subscribe(state => renderAreaCard(state));
  renderAreaCard();
}
