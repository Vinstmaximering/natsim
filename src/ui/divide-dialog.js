// Dialogen Dela in i punkter… (Polylinjer Etapp 5), från linjens, ytans och
// cirkelns egenskapskort. Beräkningen bor i state/divide.js.
//
// Dialogen visar den faktiska delningen – i meter, och för en cirkel även i
// gon – och namnen på punkterna innan de skapas. Skapa är ett ångra-steg.
// Senast använda val kommer ihåg under sessionen.
import { saveUndo } from '../state/undo.js';
import { draw } from '../map/leaflet-setup.js';
import { showToast } from './toast.js';
import { divideSource, divisionPositions, divisionNames, createDivisionPoints } from '../state/divide.js';
import { formatMeters, formatGon } from '../state/line-geometry.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = id => document.getElementById(id);
const tal = s => parseFloat(String(s ?? '').replace(',', '.'));
const komma = v => String(v).replace('.', ',');

let _val = { mode: 'count', count: 8, distance: 10, startGon: 0, includeStart: true, includeEnd: true, prefix: 'P' };
export const getDivideOptions = () => ({ ..._val });

const FEL = {
  count: 'Ange ett helt antal punkter, minst 1.',
  distance: 'Ange ett avstånd större än 0.',
  many: 'För många punkter – högst 10 000.',
  none: 'Inga punkter med de här valen.',
};

/**
 * Kontrollraden: vad Skapa gör, eller varför inget kan skapas. Exporteras för
 * tester. src = divideSource().
 */
export function divideSummary(src, o = _val) {
  const r = divisionPositions(src, o);
  if (r.error) return { ok: false, text: `⚠ ${FEL[r.error]}` };
  const n = r.positions.length;
  const delar = [];
  if (r.spacing !== null) {
    delar.push(src.kind === 'circle'
      ? `delning ${formatGon(r.spacingGon)} (${formatMeters(r.spacing)} båge)`
      : `delning ${formatMeters(r.spacing)}`);
  }
  if (o.mode === 'distance' && r.rest !== null) delar.push(`rest ${formatMeters(r.rest)}`);
  const namn = divisionNames(String(o.prefix ?? '').trim() || 'P', n);
  return { ok: true, text: `${n} ${n === 1 ? 'punkt' : 'punkter'} ${namn}${delar.length ? ` · ${delar.join(' · ')}` : ''}` };
}

function mi() { return el('mi'); }
const openModal  = () => { const m = el('modal'); if (m) m.style.display = 'flex'; };
const closeModal = () => { const m = el('modal'); if (m) m.style.display = 'none'; };

export function openDivideDialog(id) {
  const src = divideSource(id);
  if (!src || !mi()) return;
  const namn = src.obj.name || src.obj.id;
  const typ = { line: src.closed ? 'sluten linje' : 'linje', area: 'yta', circle: 'cirkel' }[src.kind];

  mi().innerHTML = `<div id="dv">
    <div style="font-size:14px;color:var(--text-value);font-weight:bold;margin-bottom:2px;">Dela in i punkter</div>
    <div class="val-muted" style="font-size:11px;margin-bottom:8px;">${esc(typ)} ${esc(namn)} · längd ${formatMeters(src.length)} (plan)</div>
    <label class="gx-row"><input type="radio" name="dv-mode" value="count" ${_val.mode === 'count' ? 'checked' : ''}>
      Antal punkter <input type="text" inputmode="numeric" class="of-dist dv-count" value="${esc(_val.count)}"></label>
    <label class="gx-row"><input type="radio" name="dv-mode" value="distance" ${_val.mode === 'distance' ? 'checked' : ''}>
      Fast avstånd <input type="text" inputmode="decimal" class="of-dist dv-dist" value="${esc(komma(_val.distance))}"> m</label>
    ${src.kind === 'circle'
      ? `<label class="gx-row">Startvinkel <input type="text" inputmode="decimal" class="of-dist dv-start" value="${esc(komma(_val.startGon))}"> gon
         <span class="val-muted" style="font-size:11px;">från centrum, medurs från norr</span></label>`
      : `<div class="gx-row val-muted" style="font-size:11px;">Start: första hörnet${src.closed ? ', runt linjen' : ''}</div>`}
    ${src.closed
      ? '<div class="val-muted gx-note">Sluten: start- och slutpunkt sammanfaller och tas med en gång.</div>'
      : `<label class="gx-row"><input type="checkbox" class="dv-s" ${_val.includeStart ? 'checked' : ''}> Ta med startpunkten</label>
         <label class="gx-row"><input type="checkbox" class="dv-e" ${_val.includeEnd ? 'checked' : ''}> Ta med slutpunkten</label>`}
    <label class="gx-row">Namnprefix <input type="text" class="of-dist dv-prefix" maxlength="20" value="${esc(_val.prefix)}"></label>
    <div class="val-muted gx-note">Punkterna blir fria punkter i aktivt lager, inte hörn.</div>
    <div class="gx-sum dv-sum"></div>
    <div class="mbs">
      <button class="bs" id="dv-ok">⋯ Skapa punkter</button>
      <button class="bc" id="dv-cancel">✕ Avbryt</button>
    </div></div>`;
  openModal();

  const q = s => mi().querySelector(s);
  const läs = () => {
    _val = {
      mode: q('input[name="dv-mode"]:checked')?.value || 'count',
      count: Number(String(q('.dv-count').value).trim()),
      distance: tal(q('.dv-dist').value),
      startGon: q('.dv-start') ? tal(q('.dv-start').value) || 0 : _val.startGon,
      includeStart: q('.dv-s') ? q('.dv-s').checked : _val.includeStart,
      includeEnd: q('.dv-e') ? q('.dv-e').checked : _val.includeEnd,
      prefix: q('.dv-prefix').value,
    };
  };
  const visa = () => {
    läs();
    const s = divideSummary(src, _val);
    q('.dv-sum').textContent = s.text;
    q('.dv-sum').classList.toggle('of-bad', !s.ok);
    el('dv-ok').disabled = !s.ok;
  };
  q('#dv').addEventListener('input', visa);
  q('#dv').addEventListener('change', visa);
  el('dv-cancel').onclick = closeModal;
  el('dv-ok').onclick = () => {
    läs();
    if (!divideSummary(src, _val).ok) return;
    saveUndo(`Dela in ${namn} i punkter`);
    const ids = createDivisionPoints(id, _val, _val.prefix);
    closeModal();
    if (ids?.length) showToast(`⋯ ${ids.length} punkter skapade i aktivt lager`, '#cfd8dc');
    draw();
  };
  visa();
}
