// Åtgärdsrad för markerade objekt (Lager-verktyg Etapp 4).
//
// Visas nere på kartan när Markera område har valt något:
//   "N objekt markerade · x pkt · y linj. · z ytor"
//   Flytta till lager ▾ · Dölj namn / Visa namn · Zooma till · Ta bort · × Avmarkera
// På pekskärm visas raden också när verktyget är valt men inget markerat,
// med växlaren Ny / Lägg till / Dra ifrån – där finns ingen Skift eller Ctrl.
// ("Dra ifrån" och inte "Ta bort", som redan är knappen som raderar.)
//
// Varje åtgärd är ett ångra-steg för hela markeringen och går genom de
// vanliga mutationerna i state/visual.js, så att kopplade hinder städas.
// Markeringen rensas från objekt som försvunnit eller vars lager släckts.
import { getState, setState, subscribe } from '../state/store.js';
import { draw, fitViewToENBounds } from '../map/leaflet-setup.js';
import { saveUndo } from '../state/undo.js';
import { showToast } from './toast.js';
import { antalPunkter, antalLinjer, antalYtor } from './antal.js';
import { selectionSummary } from '../state/visual-selection.js';
import { getTouchSelectOp, setTouchSelectOp } from '../map/select-area.js';
import {
  VISUAL_DEFAULT_COLOR, getVisualLayers, visualLineCoords, visualAreaCoords,
  removeVisualObjects, moveVisualToLayer, setVisualLabelsHidden, anyVisualLabelShown,
  linesAfterPointRemoval,
} from '../state/visual.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = id => document.getElementById(id);
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const OPS = [['replace', 'Ny'], ['add', 'Lägg till'], ['remove', 'Dra ifrån']];

/**
 * "3 objekt markerade · 1 pkt · 1 linj. · 1 yta". Förkortningarna pkt och
 * linj. böjs inte; ytor och "markerat/markerade" gör det.
 */
export function selectionText(sum) {
  const n = sum.total;
  return `${n} objekt ${n === 1 ? 'markerat' : 'markerade'} · ${sum.pts.length} pkt · ` +
         `${sum.lines.length} linj. · ${antalYtor(sum.areas.length)}`;
}

// Utbredning, med minst 20 m sida så att en enda punkt inte zoomas till max.
export function selectionBounds(state, sum) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const ta = ([E, N]) => {
    if (E < minE) minE = E; if (E > maxE) maxE = E;
    if (N < minN) minN = N; if (N > maxN) maxN = N;
  };
  sum.pts.forEach(p => ta([p.E, p.N]));
  sum.lines.forEach(l => (visualLineCoords(l, state) || []).forEach(ta));
  sum.areas.forEach(a => (visualAreaCoords(a, state) || []).forEach(ta));
  if (!Number.isFinite(minE)) return null;
  const MIN = 20;
  const pad = (lo, hi) => (hi - lo >= MIN ? [lo, hi] : [(lo + hi) / 2 - MIN / 2, (lo + hi) / 2 + MIN / 2]);
  [minE, maxE] = pad(minE, maxE);
  [minN, maxN] = pad(minN, maxN);
  return { minE, maxE, minN, maxN };
}

let _menuOpen = false;

export function renderSelectBar(state = getState()) {
  const bar = el('select-bar');
  if (!bar) return;
  const sum = selectionSummary(state, state.visualSelection);

  // Rensa bort det som inte längre finns eller syns. setState ritar om raden
  // via prenumerationen, så här slutar vi.
  const sel = state.visualSelection || [];
  if (sum.ids.length !== sel.length) { setState({ visualSelection: sum.ids }); return; }

  const touchMode = coarse() && state.tool === 'select-area';
  if (!sum.total && !touchMode) { bar.hidden = true; _menuOpen = false; bar.innerHTML = ''; return; }
  bar.hidden = false;

  const op = getTouchSelectOp();
  const lager = getVisualLayers();
  const visa = sum.total && !anyVisualLabelShown(sum.ids, state);
  bar.innerHTML = `
    <span class="sb-count" aria-live="polite">${selectionText(sum)}</span>
    ${touchMode ? `<span class="sb-ops" role="group" aria-label="Vid markering">${OPS.map(([v, t]) =>
      `<button type="button" class="sb-op" data-op="${v}" aria-pressed="${op === v}">${t}</button>`).join('')}</span>` : ''}
    ${sum.total ? `
      <span class="sb-move">
        <button type="button" class="sb-btn" data-sb="move" aria-haspopup="true" aria-expanded="${_menuOpen}">Flytta till lager ▾</button>
        <span class="sb-menu" role="menu" ${_menuOpen ? '' : 'hidden'}>${lager.map(l => `
          <button type="button" role="menuitem" class="sb-mi" data-layer="${esc(l.id)}">
            <span class="sb-sw" style="background:${l.color || VISUAL_DEFAULT_COLOR};"></span>${esc(l.name)}</button>`).join('')}
        </span>
      </span>
      <button type="button" class="sb-btn" data-sb="labels">${visa ? 'Visa namn' : 'Dölj namn'}</button>
      <button type="button" class="sb-btn" data-sb="zoom">Zooma till</button>
      <button type="button" class="sb-btn sb-danger" data-sb="delete">Ta bort</button>
      <button type="button" class="sb-btn" data-sb="clear" title="Avmarkera (Esc)">× Avmarkera</button>` : ''}`;
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const st = getState();
  const sum = selectionSummary(st, st.visualSelection);

  if (b.dataset.op) { setTouchSelectOp(b.dataset.op); renderSelectBar(); return; }

  if (b.dataset.layer) {
    const l = getVisualLayers().find(x => x.id === b.dataset.layer);
    _menuOpen = false;
    saveUndo(`Flytta ${sum.total} objekt till ${l?.name}`);
    moveVisualToLayer(sum.ids, b.dataset.layer);
    showToast(`${sum.total} objekt flyttade till ${l?.name}`, '#cfd8dc');
    draw();
    renderSelectBar();
    return;
  }

  switch (b.dataset.sb) {
    case 'move':
      _menuOpen = !_menuOpen;
      renderSelectBar();
      break;
    case 'labels': {
      const dölj = anyVisualLabelShown(sum.ids, st);
      saveUndo(`${dölj ? 'Dölj' : 'Visa'} namn på ${sum.total} objekt`);
      setVisualLabelsHidden(sum.ids, dölj);
      draw();
      break;
    }
    case 'zoom': {
      const bnd = selectionBounds(st, sum);
      if (bnd) fitViewToENBounds(bnd);
      break;
    }
    case 'delete': {
      const hinder = sum.lines.reduce((n, l) => n + (l.linkedObsIds?.length || 0), 0)
        + sum.areas.filter(o => o.linkedObsId).length;
      // Markerade punkter som är hörn i andra linjer: linjen tappar hörnet,
      // eller tas bort om färre än två hörn återstår.
      const följd = linesAfterPointRemoval(sum.pts.map(p => `visual:${p.id}`), st, new Set(sum.ids));
      const följer = följd.linesRemoved.length, ändras = följd.linesChanged.length;
      const rader = [
        `Ta bort ${sum.total} markerade objekt?`,
        `${antalPunkter(sum.pts.length)}, ${antalLinjer(sum.lines.length)} och ${antalYtor(sum.areas.length)}.`,
        ...(ändras ? [`${antalLinjer(ändras)} tappar ett hörn i de markerade punkterna.`] : []),
        ...(följer ? [`${antalLinjer(följer)} som hänger i de markerade punkterna tas också bort – färre än två hörn kvar.`] : []),
        ...(hinder ? [`${hinder} ${hinder === 1 ? 'kopplat hinder' : 'kopplade hinder'} försvinner – siktberäkningen ändras.`] : []),
        'Nätpunkter påverkas inte. Går att ångra.',
      ];
      if (!confirm(rader.join('\n'))) return;
      saveUndo(`Ta bort ${sum.total} objekt`);
      const n = removeVisualObjects(sum.ids);
      setState({ visualSelection: [] });
      showToast(`🗑 ${antalPunkter(n.pts)}, ${antalLinjer(n.lines + n.extraLines)}, ${antalYtor(n.areas)} borttagna`, '#cfd8dc');
      draw();
      break;
    }
    case 'clear':
      setState({ visualSelection: [] });
      draw();
      break;
  }
}

export function initSelectBar() {
  el('select-bar')?.addEventListener('click', onClick);
  subscribe(state => renderSelectBar(state));
  renderSelectBar();
}
