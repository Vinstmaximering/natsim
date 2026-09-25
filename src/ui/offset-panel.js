// Offset-kontrollerna (Polylinjer Etapp 4): avstånd, sida och hörn, en rad
// som säger vad som skapas (eller varför inget kan skapas), och Skapa.
//
// Används på två ställen: rutan för verktyget Offset (O, #offset-box) och
// offset-delen i linjens och ytans egenskapskort. Senast använda värden
// kommer ihåg under sessionen, så att nästa offset börjar där förra slutade.
// Skapa – eller Enter i avståndsfältet – är ett ångra-steg. Avståndet är ett
// textfält med decimaltangentbord: både "0,5" och "0.5" läses som 0,5 m,
// vilket ett nummerfält inte gör i alla webbläsare.
import { getState, subscribe } from '../state/store.js';
import { draw } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import { showToast } from './toast.js';
import {
  OFFSET_DEFAULTS, SIDE_LABELS, PROBLEM_TEXT, buildOffsets, createOffsets, offsetSource,
} from '../state/offset.js';
import { MITER_LIMIT } from '../state/offset-geometry.js';
import { arcToleranceSelectHtml, setArcTolerance } from '../state/arc-tolerance.js';
import {
  isOffsetTool, getOffsetToolSource, setOffsetPreview, clearOffsetPreview,
} from '../map/offset-tool.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let _params = { ...OFFSET_DEFAULTS };
export const getOffsetParams = () => ({ ..._params });
export function setOffsetParams(p) { _params = { ..._params, ...p }; }

/** Sidovalen för källans form. */
const sidor = closed => (closed ? ['out', 'in', 'both'] : ['right', 'left', 'both']);

// Sidvalet översatt till källans form: höger ↔ utåt, vänster ↔ inåt.
function sidaFör(closed) {
  const s = _params.side;
  if (s === 'both') return 'both';
  if (closed) return s === 'left' || s === 'in' ? 'in' : 'out';
  return s === 'left' || s === 'in' ? 'left' : 'right';
}

/** Statusraden: vad Skapa gör, eller varför inget kan skapas. Exporteras för tester. */
export function offsetStatus(sourceId, params = _params, state = getState()) {
  const { results, problem } = buildOffsets(sourceId, params, state);
  if (problem) {
    const r = results.find(x => x.problem);
    const sida = r && results.length > 1 ? ` (${SIDE_LABELS[r.key]})` : '';
    return { ok: false, text: `⚠ ${PROBLEM_TEXT[problem]}${sida}` };
  }
  const hörn = r => `${r.coords.length} hörn`;
  return { ok: true, text: `Skapar ${results.map(r => `"${r.name}" (${hörn(r)})`).join(' och ')} i aktivt lager.` };
}

/**
 * Bygger kontrollerna i container för källan sourceId.
 * owner: 'tool' eller 'card' – vem förhandsvisningen tillhör.
 * preview: om förhandsvisningen ska slås på direkt.
 */
export function renderOffsetControls(container, sourceId, { owner, preview = true } = {}) {
  const src = offsetSource(sourceId);
  if (!src) { container.innerHTML = ''; return; }
  const sida = sidaFör(src.closed);
  const namn = `off-${owner}`;
  container.innerHTML = `
    <label class="of-row"><span class="of-k">Avstånd</span>
      <input type="text" inputmode="decimal" class="of-dist" value="${esc(String(_params.distance).replace('.', ','))}"
        aria-label="Avstånd i meter"> <span class="of-u">m</span></label>
    <div class="of-row"><span class="of-k">Sida</span>
      ${sidor(src.closed).map(s => `<label class="of-opt"><input type="radio" name="${namn}-side" value="${s}"
        ${s === sida ? 'checked' : ''}> ${SIDE_LABELS[s]}</label>`).join('')}</div>
    <div class="of-row"><span class="of-k">Hörn</span>
      <label class="of-opt" title="Kanterna förlängs; spetsigare än 29° fasas av (högst ${MITER_LIMIT} × avståndet)">
        <input type="radio" name="${namn}-corners" value="sharp" ${_params.corners !== 'round' ? 'checked' : ''}> skarpa</label>
      <label class="of-opt" title="Bågar, med hörn inom bågtoleransen">
        <input type="radio" name="${namn}-corners" value="round" ${_params.corners === 'round' ? 'checked' : ''}> rundade</label>
      <label class="of-opt" title="Bågtolerans">inom ${arcToleranceSelectHtml('of-tol')}</label></div>
    <div class="of-status"></div>
    <div class="of-foot"><button type="button" class="lc-btn of-create">⇉ Skapa</button></div>`;

  // Bågtoleransen är användarens gemensamma inställning (också för cirklar).
  container.querySelector('.of-tol').addEventListener('change', e => setArcTolerance(e.target.value));

  const läs = () => {
    const d = parseFloat(String(container.querySelector('.of-dist').value).replace(',', '.'));
    _params = {
      distance: Number.isFinite(d) ? d : 0,
      side: container.querySelector(`input[name="${namn}-side"]:checked`)?.value ?? sida,
      corners: container.querySelector(`input[name="${namn}-corners"]:checked`)?.value ?? 'sharp',
    };
  };
  const visa = () => {
    const s = offsetStatus(sourceId);
    const st = container.querySelector('.of-status');
    st.textContent = s.text;
    st.classList.toggle('of-bad', !s.ok);
    container.querySelector('.of-create').disabled = !s.ok;
    setOffsetPreview(owner, sourceId, _params);
    draw();
  };
  const skapa = () => {
    läs();
    if (!offsetStatus(sourceId).ok) { visa(); return; }
    const källa = offsetSource(sourceId);
    saveUndo(`Offset ${källa.obj.name || källa.obj.id}`);
    const r = createOffsets(sourceId, _params);
    clearOffsetPreview(owner);
    if (r.ok) showToast(`⇉ ${r.ids.length === 1 ? 'Offsetlinje skapad' : `${r.ids.length} offsetlinjer skapade`} i aktivt lager`, '#4dd0e1');
    draw();
  };

  container.addEventListener('input', () => { läs(); visa(); });
  container.addEventListener('change', () => { läs(); visa(); });
  container.querySelector('.of-dist').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); skapa(); }
  });
  container.querySelector('.of-create').addEventListener('click', skapa);
  if (preview) visa();
  else {
    const s = offsetStatus(sourceId);
    container.querySelector('.of-status').textContent = s.text;
    container.querySelector('.of-create').disabled = !s.ok;
  }
  return { create: skapa };
}

// ── Verktygets ruta (#offset-box) ────────────────────────────────────────────

let _boxSource = undefined;
let _boxCtl = null;

export function renderOffsetBox() {
  const box = document.getElementById('offset-box');
  if (!box) return;
  if (!isOffsetTool()) { box.hidden = true; _boxSource = undefined; _boxCtl = null; return; }
  box.hidden = false;
  const src = getOffsetToolSource();
  if (src === _boxSource && box.firstChild) return;
  _boxSource = src;
  const källa = src && offsetSource(src);
  if (!källa) {
    _boxCtl = null;
    box.innerHTML = `<div class="mb-head">⇉ Offset</div>
      <div class="mb-hint">Klicka en linje eller yta.</div>`;
    return;
  }
  box.innerHTML = `<div class="mb-head">⇉ Offset av ${esc(källa.obj.name || källa.obj.id)}</div>
    <div class="of-ctl"></div>
    <div class="mb-hint">Enter: skapa · Esc: välj en annan linje</div>`;
  _boxCtl = renderOffsetControls(box.querySelector('.of-ctl'), src, { owner: 'tool' });
  setTimeout(() => box.querySelector('.of-dist')?.select(), 0);
}

/** Enter i verktyget, när fokus inte står i ett fält. */
export function createFromOffsetBox() {
  if (!_boxCtl) return false;
  _boxCtl.create();
  return true;
}

export function initOffsetBox() {
  subscribe(() => renderOffsetBox());
  renderOffsetBox();
}
