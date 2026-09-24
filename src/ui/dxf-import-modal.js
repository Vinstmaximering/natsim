// Etapp 6: importdialogen för .dxf.
//
// All DOM ligger här. Dialogen skiljer sig från .geo-dialogen på en punkt som
// är värd att vara tydlig med: en DXF bär ingen information om koordinatsystem
// och ofta inte heller om enhet eller axelordning, så georefereringen är
// användarens beslut. Därför importeras en DXF alltid som visuellt lager och
// aldrig som nätpunkter, och därför finns rimlighetskontrollen.
import { getState } from '../state/store.js';
import { CRS_DEFS } from '../core/constants.js';
import { nf } from '../core/format.js';
import { parseDxf, DxfParseError, DXF_UNITS, DXF_UNIT_CHOICES } from '../io/parse-dxf.js';
import {
  applyDxfImport, defaultDxfImportOptions, assignLayerColors, axisSanity,
  unitFactor, AXIS_ORDERS, AXIS_SANITY_MAX_DIST_M,
} from '../io/dxf-import.js';
import { showToast } from './toast.js';
import { isClosedPolyline } from '../io/vertex-index.js';

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let _ov = null, _opts = null, _parsed = null, _colors = null;

export function closeDxfImport() {
  if (_ov) { _ov.remove(); _ov = null; }
  document.removeEventListener('keydown', _onKey, true);
  _opts = null; _parsed = null; _colors = null;
}
function _onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeDxfImport(); } }

const $ = id => _ov?.querySelector('#' + id);

/**
 * Öppnar dialogen för en inläst .dxf-fil.
 * Binär DXF och trasiga filer ger en toast med besked, inte en dialog.
 */
export function openDxfImport(text, filename) {
  closeDxfImport();
  let parsed;
  try {
    parsed = parseDxf(text);
  } catch (err) {
    showToast(err instanceof DxfParseError ? `⚠ ${err.message}` : `⚠ Kunde inte läsa ${filename}`,
      '#ff5050');
    return null;
  }

  _parsed = parsed;
  _opts = defaultDxfImportOptions(parsed, filename);
  _colors = assignLayerColors(parsed.layers.filter(l => l.supported).map(l => l.name));

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.style.zIndex = '210';
  ov.innerHTML = `<div class="mo" id="dxf-box" style="width:min(640px,94vw);">${_body(filename)}</div>`;
  document.body.appendChild(ov);
  _ov = ov;

  ov.addEventListener('click', e => { if (e.target === ov) closeDxfImport(); });
  document.addEventListener('keydown', _onKey, true);
  _wire();
  _sync();
  return ov;
}

// ── Innehåll ────────────────────────────────────────────────────────────────

const _label = txt => `
  <div style="font-size:11px;color:var(--accent);letter-spacing:1.5px;margin:10px 0 5px;">${txt}</div>`;

function _body(filename) {
  return `
    <div style="font-size:14px;color:var(--accent);font-weight:bold;margin-bottom:2px;">📐 Importera .dxf</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">
      ${esc(filename)} · importeras alltid som visuellt lager
    </div>
    ${_summary()}
    ${_georef()}
    ${_layerTable()}
    ${_structure()}
    ${_warnings()}
    <div class="mbs">
      <button class="bs" id="dxf-ok">✓ Importera</button>
      <button class="bc" id="dxf-cancel">✕ Avbryt</button>
    </div>`;
}

function _summary() {
  const p = _parsed;
  const stödda = p.entities.length;
  const totalt = p.layers.reduce((s, l) => s + l.total, 0);
  const enhet = p.header.unitName
    ? `<span class="val-good">${esc(p.header.unitName)}</span> <span class="val-muted">ur filen ($INSUNITS)</span>`
    : '<span class="val-caution">anges inte i filen</span>';
  return `
    <div style="background:var(--bg-card);padding:8px 10px;border-radius:3px;font-size:11px;line-height:1.7;">
      <div><b class="val-value">${p.layers.length}</b> lager ·
           <b class="val-value">${stödda}</b> läsbara objekt
           ${totalt > stödda ? `<span class="val-muted">av ${totalt}</span>` : ''}</div>
      <div style="margin-top:3px;">Enhet: ${enhet}</div>
    </div>`;
}

function _georef() {
  const aktiv = getState().activeCRS;
  const crsNamn = CRS_DEFS[aktiv]?.name || aktiv;

  const enheter = DXF_UNIT_CHOICES.map(k =>
    `<option value="${k}">${esc(DXF_UNITS[k].name)}${k === 0 ? ' (tolkas som meter)' : ''}</option>`).join('');

  const axel = Object.values(AXIS_ORDERS).map(a => `
    <label class="tg" style="align-items:flex-start;">
      <input type="radio" name="dxf-axis" value="${a.id}" style="width:auto;margin:2px 0 0;">
      <span><span style="color:var(--text-value);">${esc(a.label)}</span>
        <span style="color:var(--text-muted);font-size:10px;display:block;">${esc(a.desc)}</span></span>
    </label>`).join('');

  return _label('GEOREFERENS') + `
    <div style="background:var(--bg-card);padding:8px 10px;border-radius:3px;">
      <div style="display:flex;gap:14px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">Enhet i ritningen</div>
          <select id="dxf-unit">${enheter}</select>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">Axelordning</div>
          ${axel}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
        Koordinatsystem: <span class="val-value">${esc(crsNamn)}</span>
        — projektets aktiva. En DXF bär ingen egen CRS-information.
      </div>
      <div id="dxf-sanity" style="margin-top:6px;"></div>
    </div>`;
}

function _layerTable() {
  const rad = l => {
    const innehåll = Object.entries(l.counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, n]) => `${t} ${n}`).join(' · ');
    const färg = _colors[l.name];
    return `
      <tr class="${l.supported ? '' : 'dxf-off'}">
        <td style="padding:3px 4px;">
          <input type="checkbox" class="dxf-lay" value="${esc(l.name)}"
                 ${l.supported ? '' : 'disabled'} style="width:auto;margin:0;">
        </td>
        <td style="padding:3px 4px;color:${l.supported ? 'var(--text-value)' : 'var(--text-muted)'};
                   max-width:150px;overflow:hidden;text-overflow:ellipsis;">${esc(l.name)}</td>
        <td style="padding:3px 4px;color:var(--text-muted);">${esc(innehåll)}</td>
        <td style="padding:3px 4px;">${färg
          ? `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${färg};box-shadow:0 0 0 1px #00000055;"></span>`
          : '<span class="val-muted">–</span>'}</td>
      </tr>`;
  };

  return _label('DXF-LAGER I FILEN') + `
    <div style="background:var(--bg-card);padding:6px 8px;border-radius:3px;max-height:150px;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:10px;font-family:monospace;">
        <tr style="color:var(--text-muted);">
          <th style="text-align:left;padding:2px 4px;width:22px;"></th>
          <th style="text-align:left;padding:2px 4px;">Lager</th>
          <th style="text-align:left;padding:2px 4px;">Innehåll</th>
          <th style="text-align:left;padding:2px 4px;width:28px;">Färg</th>
        </tr>
        ${_parsed.layers.map(rad).join('')}
      </table>
      ${_parsed.layers.some(l => !l.supported)
        ? '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Utgråade lager innehåller bara objekttyper som inte stöds ännu.</div>'
        : ''}
    </div>`;
}

function _structure() {
  const opt = (v, t, d) => `
    <label class="tg" style="align-items:flex-start;">
      <input type="radio" name="dxf-struct" value="${v}" style="width:auto;margin:2px 0 0;">
      <span><span style="color:var(--text-value);">${t}</span>
        <span style="color:var(--text-muted);font-size:10px;display:block;">${d}</span></span>
    </label>`;
  return _label('LAGERSTRUKTUR') + `
    <div style="background:var(--bg-card);padding:7px 9px;border-radius:3px;">
      ${opt('per', 'Ett visuellt lager per DXF-lager', 'Behåller ritningens indelning och färger.')}
      ${opt('single', 'Ett samlat lager', 'Allt i ett lager.')}
      <div id="dxf-single-name" style="margin:2px 0 6px 22px;">
        <input type="text" id="dxf-layer-name" maxlength="60" value="${esc(_opts.layerName)}">
      </div>
      <label class="tg"><input type="checkbox" id="dxf-usez" checked>
        <span>Använd Z-värden som H där de finns</span></label>
      ${_nClosed() ? `
      <div id="dxf-closed" style="margin-top:6px;padding-top:5px;border-top:1px solid var(--border-default);">
        <div style="font-size:11px;color:var(--text-value);margin-bottom:2px;">Slutna polylinjer som (${_nClosed()} st):</div>
        <label class="tg" style="display:inline-flex;margin-right:12px;">
          <input type="radio" name="dxf-closed" value="lines" style="width:auto;margin:0;"> linjer</label>
        <label class="tg" style="display:inline-flex;">
          <input type="radio" name="dxf-closed" value="areas" style="width:auto;margin:0;"> ytor</label>
      </div>` : ''}
    </div>`;
}

// Slutna LWPOLYLINE/POLYLINE i filen – valet visas bara när det finns sådana.
function _nClosed() {
  return (_parsed?.entities || []).filter(e =>
    (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && isClosedPolyline(e.vertices, e.closed)).length;
}

function _warnings() {
  const w = _parsed.warnings;
  if (!w.length) return '';
  const visa = w.slice(0, 5).map(x => `<div>⚠ ${esc(x.message)}</div>`).join('');
  return `
    <div style="background:var(--bg-card);padding:7px 9px;border-radius:3px;margin-top:8px;
                font-size:10px;line-height:1.6;color:var(--color-caution);">
      ${visa}${w.length > 5 ? `<div style="color:var(--text-muted);">… och ${w.length - 5} till</div>` : ''}
    </div>`;
}

// ── Koppling ────────────────────────────────────────────────────────────────

function _wire() {
  $('dxf-unit').value = String(_opts.unitCode);
  $('dxf-unit').addEventListener('change', e => { _opts.unitCode = +e.target.value; _sync(); });

  _ov.querySelectorAll('input[name="dxf-axis"]').forEach(r => {
    r.checked = r.value === _opts.axisOrder;
    r.addEventListener('change', () => { _opts.axisOrder = r.value; _sync(); });
  });
  _ov.querySelectorAll('input[name="dxf-struct"]').forEach(r => {
    r.checked = r.value === _opts.layerStructure;
    r.addEventListener('change', () => { _opts.layerStructure = r.value; _sync(); });
  });
  _ov.querySelectorAll('input[name="dxf-closed"]').forEach(r => {
    r.checked = r.value === _opts.closedAs;
    r.addEventListener('change', () => { _opts.closedAs = r.value; });
  });

  _ov.querySelectorAll('input.dxf-lay').forEach(cb => {
    cb.checked = _opts.selectedLayers.includes(cb.value);
    cb.addEventListener('change', () => {
      const valda = new Set(_opts.selectedLayers);
      cb.checked ? valda.add(cb.value) : valda.delete(cb.value);
      _opts.selectedLayers = [..._parsed.layers.map(l => l.name)].filter(n => valda.has(n));
      _sync();
    });
  });

  $('dxf-layer-name').addEventListener('input', e => { _opts.layerName = e.target.value; });
  $('dxf-usez').addEventListener('change', e => { _opts.useZ = e.target.checked; });

  $('dxf-cancel').addEventListener('click', closeDxfImport);
  $('dxf-ok').addEventListener('click', _doImport);
}

// Speglar valen: rimlighetskontrollen, namnfältets synlighet och knapptexten.
function _sync() {
  const namn = $('dxf-single-name');
  if (namn) namn.style.display = _opts.layerStructure === 'single' ? 'block' : 'none';

  _renderSanity();

  const valda = new Set(_opts.selectedLayers);
  const objekt = _parsed.entities.filter(e => valda.has(e.layer)).length;
  const btn = $('dxf-ok');
  if (btn) {
    btn.disabled = objekt === 0;
    btn.textContent = objekt === 0
      ? '✓ Importera (inga lager valda)'
      : _opts.layerStructure === 'single'
        ? `✓ Importera ${objekt} objekt till ett visuellt lager`
        : `✓ Importera ${objekt} objekt till ${valda.size} visuella lager`;
  }
}

// Avståndet från ritningens utbredning till nätets tyngdpunkt, för båda
// axelordningarna. Varnar bara när det valda alternativet är orimligt OCH det
// andra är rimligt – då är omkastade axlar den troliga förklaringen.
function _renderSanity() {
  const box = $('dxf-sanity');
  if (!box) return;

  const s = axisSanity(_parsed.entities, {
    factor: unitFactor(_opts.unitCode),
    layerFilter: new Set(_opts.selectedLayers),
  });

  if (!s) {
    box.innerHTML = `<div style="font-size:10px;color:var(--text-muted);">
      Nätet är tomt – ingen rimlighetskontroll av georefereringen går att göra.</div>`;
    return;
  }

  const valt = s[_opts.axisOrder], andra = s[_opts.axisOrder === 'xe' ? 'xn' : 'xe'];
  const km = m => m >= 1000 ? `${nf(m / 1000, 1)} km` : `${nf(m, 0)} m`;
  const gräns = km(AXIS_SANITY_MAX_DIST_M);

  const rad = (etikett, v, ok) =>
    `<div><span class="val-muted">${etikett}:</span>
      <span class="${ok ? 'val-good' : 'val-warn'}">${km(v)}</span> från nätets tyngdpunkt</div>`;

  const varning = !s.ok[_opts.axisOrder] && s.ok[_opts.axisOrder === 'xe' ? 'xn' : 'xe']
    ? `<div class="val-warn" style="margin-top:3px;">
         ⚠ Vald axelordning placerar ritningen ${km(valt)} bort, men den andra ordningen
         ger ${km(andra)}. Kontrollera valet – axlarna är troligen omkastade.</div>`
    : (!s.ok.xe && !s.ok.xn
      ? `<div class="val-caution" style="margin-top:3px;">
           ⚠ Båda axelordningarna hamnar längre än ${gräns} från nätet. Ritningen är
           troligen inte georefererad, eller så är enheten fel.</div>`
      : '');

  box.innerHTML = `
    <div style="font-size:10px;line-height:1.6;">
      ${rad(AXIS_ORDERS.xe.label, s.xe, s.ok.xe)}
      ${rad(AXIS_ORDERS.xn.label, s.xn, s.ok.xn)}
      ${varning}
    </div>`;
}

// ── Genomförande ────────────────────────────────────────────────────────────

function _doImport() {
  const parsed = _parsed;
  const opts = { ..._opts, layerColors: { ..._colors } };
  closeDxfImport();

  const r = applyDxfImport(parsed, opts);

  import('../map/leaflet-setup.js').then(ls => {
    ls.draw();
    if (r.bounds) setTimeout(() => ls.fitViewToENBounds(r.bounds), 150);
  });

  const delar = [];
  if (r.layerIds.length)     delar.push(`${r.layerIds.length} lager`);
  if (r.verticesCreated)     delar.push(`${r.verticesCreated} hörn`);
  if (r.linesCreated)        delar.push(`${r.linesCreated} linjer`);
  if (r.areasCreated)        delar.push(`${r.areasCreated} ytor`);
  if (r.visualPts)           delar.push(`${r.visualPts} punkter`);
  showToast(delar.length ? `✓ Importerat: ${delar.join(' · ')}` : '.dxf: inget importerades',
    delar.length ? '#00ff88' : '#7090a8');
}

export function initDxfImportModal() {
  window._openDxfImport = openDxfImport;
}
