// Cirkeln i gränssnittet (Polylinjer Etapp 5): rutan för verktyget C
// (#circle-box) och egenskapskortet för en markerad cirkel (#circle-card,
// samma plats och stil som ytans och linjens kort).
//
// Kortet: namn, lager, centrum, radie (går att ändra), omkrets (plan), antal
// hörn med vald bågtolerans, och Dela in i punkter…, Exportera (.geo), Gör om
// till polylinje och Ta bort. Varje ändring är ett ångra-steg.
import { getState, setState, subscribe } from '../state/store.js';
import { draw } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import {
  VISUAL_DEFAULT_COLOR, findVisualLayer, visualObjColor, isVisualObjVisible, findVisualPt,
  updateVisualCircle, removeVisualCircle, convertCircleToLine, visualPtDisplayName,
} from '../state/visual.js';
import { formatMeters } from '../state/line-geometry.js';
import { groupThousands } from '../state/area-geometry.js';
import {
  getArcTolerance, setArcTolerance, circleVertexCount, arcToleranceSelectHtml,
} from '../state/arc-tolerance.js';
import { isCircleTool, getCircleCenter, setTypedRadius, previewRadius, createCircle } from '../map/circle-tool.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = id => document.getElementById(id);
const tal = s => parseFloat(String(s ?? '').replace(',', '.'));

/** Centrum som text: punktens namn, eller koordinaten. */
export function centerLabel(center, state = getState()) {
  if (!center) return '–';
  if (center.ref === 'net') return `${center.id} (nätpunkt)`;
  if (center.ref === 'visual') return visualPtDisplayName(findVisualPt(center.id), state) ?? '–';
  return `E ${groupThousands(center.E, 3)} · N ${groupThousands(center.N, 3)}`;
}

/** "Omkrets 62,832 m (plan) · 64 hörn" för radien r. Exporteras för tester. */
export function circleInfo(r, tol = getArcTolerance()) {
  if (!(r > 0)) return '–';
  return `Omkrets ${formatMeters(2 * Math.PI * r)} (plan) · ${circleVertexCount(r, tol)} hörn`;
}

// ── Verktygets ruta ──────────────────────────────────────────────────────────

let _boxCenterKey;

export function renderCircleBox() {
  const box = el('circle-box');
  if (!box) return;
  if (!isCircleTool()) { box.hidden = true; _boxCenterKey = undefined; return; }
  box.hidden = false;
  const c = getCircleCenter();
  const key = c ? `${c.ref || ''}:${c.id || ''}:${c.E}:${c.N}` : null;
  if (key !== _boxCenterKey || !box.firstChild) {
    _boxCenterKey = key;
    box.innerHTML = c
      ? `<div class="mb-head">◯ Cirkel</div>
         <div class="mb-pts">Centrum: ${esc(centerLabel(c))}</div>
         <label class="of-row"><span class="of-k">Radie</span>
           <input type="text" inputmode="decimal" class="of-dist cc-r" placeholder="klicka eller skriv" aria-label="Radie i meter">
           <span class="of-u">m</span></label>
         <label class="of-row"><span class="of-k">Tolerans</span>${arcToleranceSelectHtml('cc-tol')}</label>
         <div class="of-status cc-info"></div>
         <div class="of-foot"><button type="button" class="lc-btn cc-create" disabled>◯ Skapa</button></div>
         <div class="mb-hint">Klicka en punkt på cirkeln eller skriv radien + Enter · Esc: nytt centrum</div>`
      : `<div class="mb-head">◯ Cirkel</div>
         <div class="mb-hint">Klicka centrum (snappar mot punkter och linjer).</div>`;
    if (c) wireBox(box);
  }
  updateCircleInfo();
}

function wireBox(box) {
  const inp = box.querySelector('.cc-r');
  const skapa = () => {
    const r = tal(inp.value);
    if (!(r > 0)) return;
    createCircle(r);
    renderCircleBox();
    draw();
  };
  inp.addEventListener('input', () => { setTypedRadius(tal(inp.value)); updateCircleInfo(); draw(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); skapa(); } });
  box.querySelector('.cc-tol').addEventListener('change', e => { setArcTolerance(e.target.value); updateCircleInfo(); draw(); });
  box.querySelector('.cc-create').addEventListener('click', skapa);
  setTimeout(() => inp.focus(), 0);
}

/** Uppdaterar omkrets och antal hörn i rutan (vid varje musrörelse). */
export function updateCircleInfo() {
  const box = el('circle-box');
  const info = box?.querySelector('.cc-info');
  if (!info) return;
  const r = previewRadius();
  info.textContent = r > 0 ? `Radie ${formatMeters(r)} · ${circleInfo(r)}` : 'Ingen radie ännu.';
  const inp = box.querySelector('.cc-r');
  box.querySelector('.cc-create').disabled = !(tal(inp?.value) > 0);
}

// ── Egenskapskortet ──────────────────────────────────────────────────────────

let _shownId = null;
const $ = sel => el('circle-card')?.querySelector(sel);

function selectedCircle(state) {
  const c = (state.visualCircles || []).find(x => x.id === state.selVisualId);
  return c && isVisualObjVisible(c, state) ? c : null;
}

export function renderCircleCard(state = getState()) {
  const card = el('circle-card');
  if (!card) return;
  const c = selectedCircle(state);
  if (!c) { card.hidden = true; _shownId = null; return; }
  if (_shownId !== c.id || !card.querySelector('.cc-card-r')) { build(card, c); _shownId = c.id; }
  card.hidden = false;
  update(c, state);
}

function build(card, c) {
  card.innerHTML = `
    <div class="ac-head">
      <span class="ac-title">◯ Cirkel <span class="ac-id">${esc(c.id)}</span></span>
      <button type="button" class="ac-close" data-cc="close" title="Stäng (avmarkera)" aria-label="Stäng">×</button>
    </div>
    <div class="ac-row"><span class="ac-k">Lager</span>
      <span class="ac-v"><span class="ac-lsw"></span><span class="cc-layer"></span></span></div>
    <label class="ac-row"><span class="ac-k">Namn</span>
      <input type="text" class="ac-name" maxlength="60" placeholder="(inget namn)"></label>
    <div class="ac-row"><span class="ac-k">Centrum</span><span class="ac-v cc-center"></span></div>
    <label class="ac-row"><span class="ac-k">Radie</span>
      <input type="text" inputmode="decimal" class="ac-name cc-card-r" aria-label="Radie i meter"> <span class="of-u">m</span></label>
    <div class="ac-row"><span class="ac-k">Omkrets</span><span class="ac-v cc-perim"></span></div>
    <div class="ac-row"><span class="ac-k">Hörn</span><span class="ac-v cc-n"></span>${arcToleranceSelectHtml('cc-card-tol')}</div>
    <div class="lc-actions">
      <button type="button" class="lc-btn" data-cc="divide">⋯ Dela in i punkter…</button>
      <button type="button" class="lc-btn" data-cc="geo" title="Cirkeln som en sluten linje i en .geo-fil">📤 Exportera (.geo)</button>
      <button type="button" class="lc-btn" data-cc="line" title="En sluten polylinje med cirkelns hörn ersätter cirkeln">⤺ Gör om till polylinje</button>
    </div>
    <div class="ac-foot">
      <button type="button" class="ac-del" data-cc="delete">🗑 Ta bort</button>
    </div>`;
  wire(card, c.id);
}

function update(c, state) {
  const layer = findVisualLayer(c.layerId, state);
  $('.cc-layer').textContent = layer?.name ?? '–';
  $('.ac-lsw').style.background = layer?.color || VISUAL_DEFAULT_COLOR;
  const name = $('.ac-name');
  if (document.activeElement !== name) name.value = c.name || '';
  $('.cc-center').textContent = centerLabel(c.center, state);
  const r = $('.cc-card-r');
  if (document.activeElement !== r) r.value = groupThousands(c.radius, 3).replace(/ /g, '');
  $('.cc-perim').textContent = `${formatMeters(2 * Math.PI * c.radius)} (plan)`;
  $('.cc-n').textContent = `${circleVertexCount(c.radius)} hörn med tolerans`;
  $('.cc-card-tol').value = String(getArcTolerance());
  el('circle-card').style.setProperty('--ac-col', visualObjColor(c, state));
}

function wire(card, id) {
  const cur = () => (getState().visualCircles || []).find(x => x.id === id);
  const label = () => cur()?.name || id;
  const commit = (text, fn) => { saveUndo(`${text} ${label()}`); fn(); draw(); };

  card.querySelector('[data-cc="close"]').addEventListener('click', () => { setState({ selVisualId: null }); draw(); });
  const name = card.querySelector('.ac-name');
  name.addEventListener('change', () => commit('Namnge cirkel', () => updateVisualCircle(id, { name: name.value })));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });
  const r = card.querySelector('.cc-card-r');
  r.addEventListener('change', () => {
    const v = tal(r.value);
    if (v > 0 && v !== cur()?.radius) commit('Radie på cirkel', () => updateVisualCircle(id, { radius: v }));
    else renderCircleCard();
  });
  r.addEventListener('keydown', e => { if (e.key === 'Enter') r.blur(); });
  card.querySelector('.cc-card-tol').addEventListener('change', e => {
    setArcTolerance(e.target.value); renderCircleCard(); draw();
  });
  card.querySelector('[data-cc="divide"]').addEventListener('click',
    () => import('./divide-dialog.js').then(m => m.openDivideDialog(id)));
  card.querySelector('[data-cc="geo"]').addEventListener('click',
    () => import('./geo-export.js').then(m => m.exportObjectGeo(id)));
  card.querySelector('[data-cc="line"]').addEventListener('click',
    () => commit('Gör om till polylinje:', () => convertCircleToLine(id)));
  card.querySelector('[data-cc="delete"]').addEventListener('click', () => {
    if (!confirm(`Ta bort cirkeln ${label()}?`)) return;
    commit('Ta bort cirkel', () => removeVisualCircle(id));
  });
}

export function initCircleUi() {
  subscribe(state => { renderCircleCard(state); renderCircleBox(); });
  renderCircleCard();
  renderCircleBox();
}
