// Etapp 3: importdialogen för .geo.
//
// All DOM ligger här; besluten om vad som faktiskt händer med innehållet ligger
// i io/geo-import.js och läsningen i io/parse-geo.js. Dialogen använder inga
// alert/confirm – avvikande koordinatsystem, id-krockar och varningar från
// parsern visas i rutan och avgörs med de vanliga kontrollerna.
//
// Öppnas i etapp 4 från Data-menyn. Tills dess nås den via den befintliga
// knappen "Importera punkter (.geo)" i vänsterpanelen.
import { getState } from '../state/store.js';
import { CRS_DEFS } from '../core/constants.js';
import { nf } from '../core/format.js';
import { VISUAL_COLORS } from '../state/visual.js';
import { parseGeo } from '../io/parse-geo.js';
import { applyGeoImport, defaultGeoImportOptions, stripExtension } from '../io/geo-import.js';
import { showToast } from './toast.js';

const PREVIEW_ROWS = 6;

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let _ov = null;      // overlay-elementet medan dialogen är öppen
let _opts = null;
let _parsed = null;

export function closeGeoImport() {
  if (_ov) { _ov.remove(); _ov = null; }
  document.removeEventListener('keydown', _onKey, true);
  _opts = null; _parsed = null;
}

function _onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeGeoImport(); }
}

/**
 * Öppnar dialogen för en inläst .geo-fil.
 * @param {string} text      Filens innehåll.
 * @param {string} filename  Originalfilnamnet, används som lagernamn.
 */
export function openGeoImport(text, filename) {
  closeGeoImport();
  const parsed = parseGeo(text);
  const { activeCRS } = getState();
  _parsed = parsed;
  _opts = defaultGeoImportOptions(parsed, filename, activeCRS);

  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.style.zIndex = '210';
  ov.innerHTML = `<div class="mo" id="gi-box" style="width:min(620px,94vw);">${_body(parsed, filename, activeCRS)}</div>`;
  document.body.appendChild(ov);
  _ov = ov;

  ov.addEventListener('click', e => { if (e.target === ov) closeGeoImport(); });
  document.addEventListener('keydown', _onKey, true);
  _wire();
  _sync();
}

// ── Innehåll ────────────────────────────────────────────────────────────────

function _body(parsed, filename, activeCRS) {
  const nPts   = parsed.points.length;
  const nLines = parsed.lines.length;
  return `
    <div style="font-size:14px;color:var(--accent);font-weight:bold;margin-bottom:2px;">📥 Importera .geo</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">${esc(filename)}</div>
    ${_summary(parsed, activeCRS)}
    ${nPts ? _pointsSection(filename) : _emptyNote('Filen innehåller inga punkter i den yttre punktlistan.')}
    ${nLines ? _linesSection(nLines) : _emptyNote('Filen innehåller inga linjer.')}
    ${_preview(parsed)}
    ${_warnings(parsed)}
    <div class="mbs">
      <button class="bs" id="gi-ok">✓ Importera</button>
      <button class="bc" id="gi-cancel">✕ Avbryt</button>
    </div>`;
}

const _emptyNote = txt => `
  <div style="font-size:11px;color:var(--text-muted);background:var(--bg-card);
              padding:6px 8px;border-radius:3px;margin-bottom:8px;">${esc(txt)}</div>`;

const _label = txt => `
  <div style="font-size:11px;color:var(--accent);letter-spacing:1.5px;margin:10px 0 5px;">${txt}</div>`;

function _summary(parsed, activeCRS) {
  const cs = parsed.fileInfo.coordinateSystem;
  const fileCRS = parsed.fileInfo.crs;
  const activeName = CRS_DEFS[activeCRS]?.name || activeCRS;

  let crsRow;
  if (!cs) {
    crsRow = `<span class="val-muted">Filen anger inget koordinatsystem.
      Projektets ${esc(activeName)} används.</span>`;
  } else if (!fileCRS) {
    crsRow = `<span class="val-warn">⚠ Okänt system "${esc(cs)}"</span>
      <span class="val-muted">– projektets ${esc(activeName)} används oförändrat.</span>`;
  } else if (fileCRS === activeCRS) {
    crsRow = `<span class="val-good">✓ ${esc(cs)}</span>
      <span class="val-muted">– stämmer med projektets koordinatsystem.</span>`;
  } else {
    crsRow = `<span class="val-caution">≠ ${esc(cs)}</span>
      <span class="val-muted">– projektet använder ${esc(activeName)}.</span>
      <label class="tg" style="margin-top:4px;">
        <input type="checkbox" id="gi-crs" ${_opts.changeCRS ? 'checked' : ''}>
        <span>Byt projektets koordinatsystem till ${esc(CRS_DEFS[fileCRS]?.name || fileCRS)}</span>
      </label>`;
  }

  const height = parsed.fileInfo.heightSystem
    ? `<div class="val-muted" style="margin-top:3px;">Höjdsystem i filen: ${esc(parsed.fileInfo.heightSystem)}
         <span style="opacity:0.7;">(sparas, räknas inte om)</span></div>` : '';

  return `
    <div style="background:var(--bg-card);padding:8px 10px;border-radius:3px;font-size:11px;line-height:1.7;margin-bottom:6px;">
      <div><b class="val-value">${parsed.points.length}</b> punkter ·
           <b class="val-value">${parsed.lines.length}</b> linjer
           (<b class="val-value">${parsed.lines.reduce((s, l) => s + l.vertices.length, 0)}</b> hörn)</div>
      <div style="margin-top:3px;">${crsRow}</div>
      ${height}
    </div>`;
}

function _card(id, title, desc, checked, inner) {
  return `
    <label id="gi-card-${id}" style="display:block;flex:1;cursor:pointer;padding:8px 9px;border-radius:4px;
           border:1px solid var(--border-strong);background:var(--bg-card);">
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="radio" name="gi-target" value="${id}" ${checked ? 'checked' : ''}
               style="width:auto;margin:0;">
        <span style="font-size:12px;color:var(--text-value);font-weight:bold;">${title}</span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin:3px 0 0 20px;line-height:1.5;">${desc}</div>
      <div id="gi-opts-${id}" style="margin:6px 0 0 20px;">${inner}</div>
    </label>`;
}

function _pointsSection(filename) {
  const visual = `
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">Lagernamn</div>
    <input type="text" id="gi-layer-name" maxlength="60" value="${esc(stripExtension(filename))}"
           style="margin-bottom:5px;">
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">Lagerfärg</div>
    <div id="gi-colors"></div>`;

  const net = `
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">Punkttyp</div>
    <select id="gi-pt-type" style="margin-bottom:5px;">
      <option value="prefix">Enligt ID-prefix (nuvarande heuristik)</option>
      <option value="detail">Alla som Detaljpunkt</option>
      <option value="new">Alla som Nypunkt</option>
      <option value="known">Alla som Känd punkt</option>
    </select>
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">Vid ID-krock</div>
    <select id="gi-conflict">
      <option value="skip">Hoppa över</option>
      <option value="update">Uppdatera koordinater</option>
      <option value="rename">Byt namn (suffix _2)</option>
    </select>`;

  return _label('PUNKTER IMPORTERAS SOM') + `
    <div style="display:flex;gap:6px;align-items:flex-start;">
      ${_card('visual', '○ Visuellt lager', 'Ingår inte i simuleringen. Behåller originalnamn och filattribut.', true, visual)}
      ${_card('net', '▲ Nätpunkter', 'Blir riktiga punkter i nätet och påverkar simuleringen.', false, net)}
    </div>`;
}

function _linesSection(nLines) {
  const opt = (v, t, d) => `
    <label class="tg" style="align-items:flex-start;">
      <input type="radio" name="gi-lines" value="${v}" style="width:auto;margin:2px 0 0;">
      <span><span style="color:var(--text-value);">${t}</span>
        <span style="color:var(--text-muted);font-size:10px;display:block;">${d}</span></span>
    </label>`;
  return _label(`LINJER (${nLines} st)`) + `
    <div style="background:var(--bg-card);padding:7px 9px;border-radius:3px;">
      ${opt('visual', '⤺ Visuella linjer', 'Hörnen blir visuella punkter, varje segment en visuell linje.')}
      ${opt('obstacle', '━ Hinder (väggar, blockerar sikt)', 'Samma linjer, men kopplade som väggar som skymmer sikten.')}
      ${opt('skip', '✕ Hoppa över', 'Linjerna importeras inte.')}
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;line-height:1.5;">
        Linjernas hörn har egna koordinater i filen och är oberoende av punktvalet ovan.
      </div>
    </div>`;
}

function _preview(parsed) {
  const pts = parsed.points.slice(0, PREVIEW_ROWS).map(p => `
    <tr><td style="color:var(--text-value);">${esc(p.name)}</td>
        <td style="text-align:right;">${nf(p.N, 3)}</td>
        <td style="text-align:right;">${nf(p.E, 3)}</td>
        <td style="text-align:right;">${p.H === null ? '–' : nf(p.H, 3)}</td></tr>`).join('');
  const lns = parsed.lines.slice(0, PREVIEW_ROWS).map(l => `
    <div>${esc(l.name)} · ${l.vertices.length} hörn ·
      <span class="${l.closed ? 'val-good' : 'val-muted'}">${l.closed ? 'sluten' : 'öppen'}</span></div>`).join('');

  const more = (n, shown) => n > shown
    ? `<div style="color:var(--text-muted);margin-top:2px;">… och ${n - shown} till</div>` : '';

  return _label('FÖRHANDSGRANSKNING') + `
    <div style="background:var(--bg-card);padding:7px 9px;border-radius:3px;font-size:10px;
                font-family:monospace;color:var(--text-secondary);line-height:1.6;">
      ${pts ? `<table style="width:100%;border-collapse:collapse;">
        <tr style="color:var(--text-muted);"><th style="text-align:left;">ID</th>
          <th style="text-align:right;">N</th><th style="text-align:right;">E</th>
          <th style="text-align:right;">H</th></tr>${pts}</table>
        ${more(parsed.points.length, PREVIEW_ROWS)}` : ''}
      ${lns ? `<div style="margin-top:${pts ? '6px' : '0'};">${lns}${more(parsed.lines.length, PREVIEW_ROWS)}</div>` : ''}
      ${!pts && !lns ? 'Inget innehåll att visa.' : ''}
    </div>`;
}

function _warnings(parsed) {
  // invalid-point och duplicate-point är de som påverkar resultatet; övriga
  // koder är strukturbrus som användaren sällan kan göra något åt.
  const w = parsed.warnings.filter(x => x.code !== 'missing-header');
  if (!w.length) return '';
  const shown = w.slice(0, 5).map(x => `<div>⚠ ${esc(x.message)}</div>`).join('');
  return `
    <div style="background:var(--bg-card);padding:7px 9px;border-radius:3px;margin-top:8px;
                font-size:10px;line-height:1.6;color:var(--color-caution);">
      ${shown}${w.length > 5 ? `<div style="color:var(--text-muted);">… och ${w.length - 5} till</div>` : ''}
    </div>`;
}

function _colorSwatches() {
  const sw = VISUAL_COLORS.map(c => `
    <button type="button" data-color="${c.hex}" title="${esc(c.label)}"
      style="width:22px;height:22px;padding:0;border-radius:3px;cursor:pointer;background:${c.hex};
             border:2px solid ${_opts.layerColor === c.hex ? 'var(--text-value)' : 'transparent'};
             box-shadow:0 0 0 1px #00000055;"></button>`).join('');
  return `<div style="display:flex;gap:4px;flex-wrap:wrap;">${sw}
    <button type="button" data-color="" title="Standardfärg"
      style="width:22px;height:22px;padding:0;font-size:10px;border-radius:3px;cursor:pointer;
             background:transparent;color:var(--text-muted);
             border:2px solid ${_opts.layerColor === null ? 'var(--text-value)' : 'var(--border-strong)'};">✕</button>
  </div>`;
}

// ── Koppling ────────────────────────────────────────────────────────────────

const $ = id => _ov?.querySelector('#' + id);

function _wire() {
  _ov.querySelectorAll('input[name="gi-target"]').forEach(r =>
    r.addEventListener('change', () => { _opts.target = r.value; _sync(); }));
  _ov.querySelectorAll('input[name="gi-lines"]').forEach(r => {
    r.checked = r.value === _opts.lines;
    r.addEventListener('change', () => { _opts.lines = r.value; _sync(); });
  });

  $('gi-layer-name')?.addEventListener('input', e => { _opts.layerName = e.target.value; });
  $('gi-pt-type')?.addEventListener('change', e => { _opts.netPointType = e.target.value; });
  $('gi-conflict')?.addEventListener('change', e => { _opts.idConflict = e.target.value; });
  $('gi-crs')?.addEventListener('change', e => { _opts.changeCRS = e.target.checked; });

  // Klick i ett kort ska välja kortet, men inte när man skriver i namnfältet.
  ['visual', 'net'].forEach(kind => {
    $(`gi-opts-${kind}`)?.addEventListener('click', e => e.stopPropagation());
  });

  $('gi-cancel').addEventListener('click', closeGeoImport);
  $('gi-ok').addEventListener('click', _doImport);
}

// Speglar valen i dialogen: markerar aktivt kort, visar bara dess inställningar
// och sätter knapptexten efter vad som faktiskt kommer att hända.
function _sync() {
  const colors = $('gi-colors');
  if (colors) {
    colors.innerHTML = _colorSwatches();
    colors.querySelectorAll('button[data-color]').forEach(b =>
      b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        _opts.layerColor = b.dataset.color || null;
        _sync();
      }));
  }

  for (const kind of ['visual', 'net']) {
    const card = $(`gi-card-${kind}`);
    const opts = $(`gi-opts-${kind}`);
    if (!card) continue;
    const on = _opts.target === kind;
    card.style.borderColor = on ? 'var(--accent)' : 'var(--border-strong)';
    card.style.background  = on ? 'var(--bg-selected)' : 'var(--bg-card)';
    if (opts) opts.style.display = on ? 'block' : 'none';
  }

  const btn = $('gi-ok');
  if (btn) btn.textContent = '✓ ' + _buttonLabel();
}

function _buttonLabel() {
  const nPts   = _parsed.points.length;
  const nLines = _opts.lines === 'skip' ? 0 : _parsed.lines.length;
  const parts = [];
  if (nPts && _opts.target === 'net') parts.push(`${nPts} nätpunkter`);
  if (nLines) parts.push(`${nLines} linjer`);

  if (nPts && _opts.target === 'visual') {
    return parts.length
      ? `Importera till nytt visuellt lager (+ ${parts.join(' + ')})`
      : 'Importera till nytt visuellt lager';
  }
  if (!parts.length) return 'Importera (inget valt)';
  if (nPts && _opts.target === 'net' && nLines) {
    return `Importera ${nPts} nätpunkter och ${nLines} linjer`;
  }
  return `Importera ${parts.join(' + ')}`;
}

// ── Genomförande ────────────────────────────────────────────────────────────

function _doImport() {
  const parsed = _parsed;
  const opts   = { ..._opts };
  closeGeoImport();

  const r = applyGeoImport(parsed, opts);

  import('../map/leaflet-setup.js').then(ls => {
    if (r.crsChanged) ls.buildCRSSel();
    ls.draw();
    // Kartan hinner rita om innan vyn flyttas – samma fördröjning som
    // loadProject använder för resetView.
    if (r.bounds) setTimeout(() => ls.fitViewToENBounds(r.bounds), 150);
  });

  showToast(_resultText(r), r.crsChanged ? '#ffd54f' : '#00ff88');
}

function _resultText(r) {
  const parts = [];
  if (r.visualPts)       parts.push(`${r.visualPts} visuella punkter`);
  if (r.ptsImported)     parts.push(`${r.ptsImported} nätpunkter`);
  if (r.ptsUpdated)      parts.push(`${r.ptsUpdated} uppdaterade`);
  if (r.ptsRenamed)      parts.push(`${r.ptsRenamed} omdöpta`);
  if (r.ptsSkipped)      parts.push(`${r.ptsSkipped} överhoppade`);
  if (r.linesCreated)    parts.push(`${r.linesCreated} linjer`);
  if (r.obstaclesCreated) parts.push(`${r.obstaclesCreated} hinder`);
  if (!parts.length) return '.geo: inget importerades';
  return `✓ Importerat: ${parts.join(' · ')}`;
}

export function initGeoImportModal() {
  window._openGeoImport = openGeoImport;
}
