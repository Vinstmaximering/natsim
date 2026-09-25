// Export av visuella lager till .geo – gränssnittet (Polylinjer Etapp 3).
//
// Tre vägar in, alla via io/export-visual-geo.js och io/write-geo.js:
//   - egenskapskortet (linje eller yta): Exportera (.geo) = det objektet
//   - lagrets ⋮-meny: Exportera lager (.geo)
//   - Data → EXPORTERA → Visuella lager (.geo)…: dialogen nedan, med valda
//     lager eller endast markerade objekt, och vad som tas med.
// Exporten ändrar ingenting i projektet och är inget ångra-steg.
//
// Koordinatsystemets sträng i filen är provad mot Geo för Sweref 99 15 45 och
// 20 15. För övriga zoner och TM skrivs samma mönster, och dialogen och
// kvitteringen varnar för att strängen inte är verifierad.
import { getState } from '../state/store.js';
import { showToast } from './toast.js';
import { antalPunkter, antalLinjer, antalYtor, ochCirklar } from './antal.js';
import { getVisualLayers, findVisualLayer, findVisualLine, findVisualArea, findVisualCircle } from '../state/visual.js';
import { buildVisualGeo, layersDescription, GEO_INCLUDE_ALL } from '../io/export-visual-geo.js';
import { geoCoordinateSystem, downloadGeo, geoFilename } from '../io/write-geo.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const el = id => document.getElementById(id);
const idag = () => new Date().toISOString().slice(0, 10);

export const UNVERIFIED_CRS_TEXT =
  'Koordinatsystemets namn i filen är inte provat mot Geo för den här zonen – kontrollera vid inläsningen.';

/** Markerade objekt: Markera område plus det enskilt markerade. */
export function markedObjectIds(state = getState()) {
  return [...new Set([...(state.visualSelection || []), ...(state.selVisualId ? [state.selVisualId] : [])])];
}

const summa = c => `${antalPunkter(c.points)}, ${antalLinjer(c.lines)} och ${antalYtor(c.areas)}${ochCirklar(c.circles)}`;

/**
 * Bygger och laddar ner filen. Returnerar resultatet (för tester) eller null
 * när det inte fanns något att exportera eller ett namn stoppade exporten.
 */
export function exportVisualGeo(urval, description, filename, state = getState()) {
  const r = buildVisualGeo(state, urval, description);
  if (r.error) { alert(`Exporten stoppades.\n\n${r.error}`); return null; }
  const n = r.counts.points + r.counts.lines + r.counts.areas + (r.counts.circles || 0);
  if (!n) { showToast('Inget att exportera', '#7090a8'); return null; }
  downloadGeo(geoFilename(filename), r.text);
  const varning = r.crsVerified ? '' : ' · ⚠ koordinatsystemets namn ej verifierat';
  const hoppade = r.skipped ? ` · ${r.skipped} utan giltiga hörn hoppades över` : '';
  showToast(`✓ Exporterade ${summa(r.counts)}${hoppade}${varning}`, r.crsVerified ? '#00ff88' : '#ffb74d');
  return r;
}

/** Egenskapskortet: den markerade linjen, ytan eller cirkeln. */
export function exportObjectGeo(id) {
  const o = findVisualLine(id) || findVisualArea(id) || findVisualCircle(id);
  if (!o) return null;
  const namn = o.name || o.id;
  return exportVisualGeo({ objectIds: [id], include: GEO_INCLUDE_ALL }, namn, namn);
}

/** Lagrets ⋮-meny: hela lagret. */
export function exportLayerGeo(layerId) {
  const l = findVisualLayer(layerId);
  if (!l) return null;
  return exportVisualGeo({ layerIds: [layerId], include: GEO_INCLUDE_ALL }, l.name, l.name);
}

// ── Dialogen ─────────────────────────────────────────────────────────────────

function mi() { return el('mi'); }
const openModal  = () => { const m = el('modal'); if (m) m.style.display = 'flex'; };
const closeModal = () => { const m = el('modal'); if (m) m.style.display = 'none'; };

/** Dialogens aktuella val, läst ur formuläret. */
function valIDialogen() {
  const markerat = el('gx-src-marked')?.checked;
  const include = {
    points: !!el('gx-inc-points')?.checked,
    lines:  !!el('gx-inc-lines')?.checked,
    areas:  !!el('gx-inc-areas')?.checked,
    circles: !!el('gx-inc-circles')?.checked,
  };
  const layerIds = [...document.querySelectorAll('#gx-layers input:checked')].map(i => i.value);
  return markerat
    ? { urval: { objectIds: markedObjectIds(), include }, markerat: true, layerIds: [] }
    : { urval: { layerIds, include }, markerat: false, layerIds };
}

function beskrivning(v, state = getState()) {
  return v.markerat ? `Urval: ${markedObjectIds(state).length} markerade objekt` : layersDescription(v.layerIds, state);
}
function filnamn(v, state = getState()) {
  if (v.markerat) return `urval_${idag()}`;
  if (v.layerIds.length === 1) return findVisualLayer(v.layerIds[0], state)?.name || 'lager';
  return `visuella_lager_${idag()}`;
}

function uppdatera() {
  const v = valIDialogen();
  const r = buildVisualGeo(getState(), v.urval, beskrivning(v));
  const n = r.counts.points + r.counts.lines + r.counts.areas + r.counts.circles;
  el('gx-sum').textContent = n ? `Tas med: ${summa(r.counts)}.` : 'Inget att exportera med de här valen.';
  el('gx-err').hidden = !r.error;
  el('gx-err').textContent = r.error || '';
  el('gx-ok').disabled = !n || !!r.error;
  el('gx-layers').classList.toggle('gx-off', v.markerat);
}

/** Data → EXPORTERA → Visuella lager (.geo)… */
export function openVisualGeoExport() {
  if (!mi()) return;
  const st = getState();
  const lager = getVisualLayers();
  if (!lager.length) { showToast('Det finns inga visuella lager att exportera', '#7090a8'); return; }
  const nMarkerat = markedObjectIds(st).length;
  const crs = geoCoordinateSystem(st.activeCRS);

  mi().innerHTML = `<div id="gx">
    <div style="font-size:14px;color:var(--text-value);font-weight:bold;margin-bottom:8px;">
      Exportera visuella lager (.geo)</div>
    <label class="gx-row"><input type="radio" name="gx-src" id="gx-src-layers" checked> Valda lager</label>
    <div id="gx-layers" class="gx-layers">
      ${lager.map(l => `<label class="gx-row"><input type="checkbox" value="${esc(l.id)}" ${l.visible !== false ? 'checked' : ''}>
        ${esc(l.name)}${l.visible === false ? ' <span class="val-muted">(släckt)</span>' : ''}</label>`).join('')}
    </div>
    <label class="gx-row"><input type="radio" name="gx-src" id="gx-src-marked" ${nMarkerat ? '' : 'disabled'}>
      Endast markerade objekt (${nMarkerat})</label>
    <div class="gx-sub">Ta med</div>
    <div class="gx-inc">
      <label class="gx-row"><input type="checkbox" id="gx-inc-points" checked> Punkter</label>
      <label class="gx-row"><input type="checkbox" id="gx-inc-lines" checked> Linjer</label>
      <label class="gx-row"><input type="checkbox" id="gx-inc-areas" checked> Ytor</label>
      <label class="gx-row"><input type="checkbox" id="gx-inc-circles" checked> Cirklar</label>
    </div>
    <div class="gx-sub">Koordinatsystem i filen</div>
    <div class="gx-crs">${esc(crs.text || '–')}</div>
    ${crs.verified ? '' : `<div class="val-warn gx-warn">⚠ ${UNVERIFIED_CRS_TEXT}</div>`}
    <div class="val-muted gx-note">Sluten linje, yta och cirkel skrivs med första hörnet upprepat sist;
      cirkeln med hörn enligt bågtoleransen.
      Hörnen heter 01, 02 … i varje linje. Höjd saknas: tomt fält.</div>
    <div id="gx-sum" class="gx-sum"></div>
    <div id="gx-err" class="val-warn gx-warn" hidden></div>
    <div class="mbs">
      <button class="bs" id="gx-ok">📤 Exportera</button>
      <button class="bc" id="gx-cancel">✕ Avbryt</button>
    </div></div>`;
  openModal();

  el('gx').addEventListener('change', uppdatera);
  el('gx-cancel').onclick = closeModal;
  el('gx-ok').onclick = () => {
    const v = valIDialogen();
    if (exportVisualGeo(v.urval, beskrivning(v), filnamn(v))) closeModal();
  };
  uppdatera();
}
