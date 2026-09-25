// Egenskapskort för en visuell polylinje (Polylinjer Etapp 2).
//
// Samma plats och stil som ytans kort (ui/area-card.js, CSS-klassen
// area-card): nere till vänster, visas när en linje är markerad
// (state.selVisualId) och döljs när markeringen försvinner. Kortet byggs om
// bara när en annan linje markeras; annars uppdateras värdena på plats, så att
// namnfältet inte tappar fokus när kartan ritas om.
//
// Längder och riktningar räknas i koordinatsystemets projektionsplan och märks
// "(plan)". Riktning i gon, medurs från norr, fyra decimaler; längder i meter
// med tre decimaler. Segmenten namnges med hörnens namn – punktens namn om det
// finns, annars hörnets löpnummer (lineVertexNames).
//
// Varje ändring är ett eget ångra-steg. "Slut linjen → yta" skapar en yta med
// samma hörn och tar bort linjen i ett och samma steg.
import { getState, setState, subscribe } from '../state/store.js';
import { draw } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import { showToast } from './toast.js';
import {
  VISUAL_DEFAULT_COLOR, findVisualLayer, visualLineCoords, visualObjColor, isVisualObjVisible,
  updateVisualLine, removeVisualLine, linkVisualLineObstacles, unlinkVisualLineObstacles,
  lineVertexNames, convertLineToArea,
} from '../state/visual.js';
import { lineStats, formatMeters, formatGon } from '../state/line-geometry.js';
import { exportObjectGeo } from './geo-export.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let _shownId = null;

const el = id => document.getElementById(id);
const $  = sel => el('line-card')?.querySelector(sel);

/** Den markerade linjen, om den finns och syns. */
function selectedLine(state) {
  const l = (state.visualLines || []).find(x => x.id === state.selVisualId);
  return l && isVisualObjVisible(l, state) ? l : null;
}

/**
 * Segmenttabellens rader: "FP1–2", längd och riktning, formaterade.
 * Exporteras för tester.
 */
export function lineCardRows(line, state = getState()) {
  const coords = visualLineCoords(line, state);
  if (!coords) return { length: null, rows: [] };
  const names = lineVertexNames(line, state);
  const st = lineStats(coords, line.closed === true);
  return {
    length: st.length,
    rows: st.segments.map(s => ({
      label: `${names[s.from]}–${names[s.to]}`,
      length: formatMeters(s.length),
      bearing: formatGon(s.bearing),
    })),
  };
}

export function renderLineCard(state = getState()) {
  const card = el('line-card');
  if (!card) return;
  const line = selectedLine(state);
  if (!line) {
    card.hidden = true;
    _shownId = null;
    return;
  }
  // Byggs också om när kortets innehåll saknas (elementet har bytts ut).
  if (_shownId !== line.id || !card.querySelector('.lc-tab')) { build(card, line); _shownId = line.id; }
  card.hidden = false;
  update(line, state);
}

function build(card, line) {
  card.innerHTML = `
    <div class="ac-head">
      <span class="ac-title">⤺ Linje <span class="ac-id">${esc(line.id)}</span></span>
      <button type="button" class="ac-close" data-lc="close" title="Stäng (avmarkera)" aria-label="Stäng">×</button>
    </div>
    <div class="ac-row"><span class="ac-k">Lager</span>
      <span class="ac-v"><span class="ac-lsw"></span><span class="lc-layer"></span></span></div>
    <label class="ac-row"><span class="ac-k">Namn</span>
      <input type="text" class="ac-name" maxlength="60" placeholder="(inget namn)"></label>
    <div class="ac-row"><span class="ac-k">Hörn</span><span class="ac-v lc-n"></span></div>
    <div class="ac-row"><span class="ac-k">Form</span><span class="ac-v lc-form"></span></div>
    <div class="ac-row"><span class="ac-k">Längd</span><span class="ac-v lc-len"></span></div>
    <div class="lc-tabwrap">
      <table class="lc-tab">
        <thead><tr><th>Segment</th><th>Längd (plan)</th><th>Riktning (plan)</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="lc-actions">
      <button type="button" class="lc-btn" data-lc="wall"></button>
      <button type="button" class="lc-btn" data-lc="area" title="Skapar en yta med samma hörn och tar bort linjen">▱ Slut linjen → yta</button>
      <button type="button" class="lc-btn" data-lc="geo" title="Linjen som en .geo-fil (SBG Object Text)">📤 Exportera (.geo)</button>
    </div>
    <div class="ac-foot">
      <button type="button" class="ac-del" data-lc="delete">🗑 Ta bort</button>
    </div>`;
  wire(card, line.id);
}

function update(line, state) {
  const layer = findVisualLayer(line.layerId, state);
  const nNet = line.vertices.filter(v => v.ref === 'net').length;
  const { length, rows } = lineCardRows(line, state);

  $('.lc-layer').textContent = layer?.name ?? '–';
  $('.ac-lsw').style.background = layer?.color || VISUAL_DEFAULT_COLOR;
  const name = $('.ac-name');
  if (document.activeElement !== name) name.value = line.name || '';
  $('.lc-n').textContent = `${line.vertices.length}${nNet ? ` (varav ${nNet} nätpunkt${nNet === 1 ? '' : 'er'})` : ''}`;
  $('.lc-form').textContent = line.closed ? 'Sluten' : 'Öppen';
  $('.lc-len').textContent = length === null ? '–' : `${formatMeters(length)} (plan)`;
  $('.lc-tab tbody').innerHTML = rows.map(r =>
    `<tr><td>${esc(r.label)}</td><td>${esc(r.length)}</td><td>${esc(r.bearing)}</td></tr>`).join('');

  const linked = line.linkedObsIds?.length || 0;
  const wall = $('[data-lc="wall"]');
  wall.textContent = linked ? `⛓ Koppla loss hindren (${linked})` : '━ Använd som vägg';
  wall.title = linked
    ? 'Hindren blir fristående och står kvar i hinderlistan'
    : 'Ett linjehinder per segment – blockerar sikt i beräkningen och följer linjen';
  const area = $('[data-lc="area"]');
  area.disabled = line.vertices.length < 3;
  if (area.disabled) area.title = 'En yta behöver minst tre hörn';
  el('line-card').style.setProperty('--ac-col', visualObjColor(line, state));
}

function wire(card, id) {
  const cur = () => (getState().visualLines || []).find(x => x.id === id);
  const label = () => cur()?.name || id;
  const commit = (text, fn) => { saveUndo(`${text} ${label()}`); fn(); draw(); };

  card.querySelector('[data-lc="close"]').addEventListener('click', () => {
    setState({ selVisualId: null });
    draw();
  });

  const name = card.querySelector('.ac-name');
  name.addEventListener('change', () => commit('Namnge linje', () => updateVisualLine(id, { name: name.value })));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });

  card.querySelector('[data-lc="wall"]').addEventListener('click', () => {
    const l = cur();
    if (!l) return;
    if (l.linkedObsIds?.length) {
      commit('Koppla loss', () => unlinkVisualLineObstacles(id));
      showToast(`${label()} styr inte längre sina hinder`, '#cfd8dc');
      return;
    }
    let n = 0;
    commit('Vägg från', () => { n = linkVisualLineObstacles(id, 'wall'); });
    showToast(n ? `▨ Vägg skapad från ${label()} (${n} segment) – följer linjen`
                : '⚠ Linjens hörn går inte att lösa upp – inget hinder skapades', n ? '#8aa8c0' : '#ff5050');
  });

  card.querySelector('[data-lc="area"]').addEventListener('click', () => {
    const l = cur();
    if (!l || l.vertices.length < 3) return;
    if (l.linkedObsIds?.length &&
        !confirm(`Slut ${label()} till en yta?\nLinjens ${l.linkedObsIds.length} hinder försvinner – siktberäkningen ändras.`)) return;
    commit('Slut linjen till yta:', () => convertLineToArea(id));
  });

  card.querySelector('[data-lc="geo"]').addEventListener('click', () => exportObjectGeo(id));

  card.querySelector('[data-lc="delete"]').addEventListener('click', () => {
    const l = cur();
    if (!l) return;
    const n = l.linkedObsIds?.length || 0;
    const hinder = n ? `\nDess ${n === 1 ? 'hinder' : `${n} hinder`} försvinner också – siktberäkningen ändras.` : '';
    if (!confirm(`Ta bort linjen ${label()}?${hinder}`)) return;
    commit('Ta bort linje', () => removeVisualLine(id));
  });
}

export function initLineCard() {
  subscribe(state => renderLineCard(state));
  renderLineCard();
}
