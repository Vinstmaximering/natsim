// Kopierad exakt från NätSim_Beta_2.html rad 3590–3613 + rad 3974 (SAVE_KEY).
// Strukturella ändringar: läser/skriver via store istället för globaler.
import { getState, setState } from './store.js';
import { _sanitizeVisual, _migrateVisualLayers, _nextCounter, syncLinkedObstacles } from './visual.js';
import { _sanitizeObstacleColors, _syncObstacleCounter } from './obstacles.js';
import { showToast } from '../ui/toast.js';

export const SAVE_KEY = "stomnät_autosave";   // rad 3974 exakt

let _asTimer = null;

// Autosparningens innehåll. Fälten efter pts/meas är valfria vid laddning –
// en autosparning gjord innan fältet fanns laddas som förut.
//   visualPts/visualLines/visualLayers (Etapp 1): saknas → tomt visuellt lager
//   obstacles (Lager-verktyg): saknas → inga hinder, vilket var vad en
//     omladdning alltid gav innan hindren togs med
export function _buildAutosaveSnapshot(state = getState()) {
  const { pts, meas, centerErr, nMid, obstacles = [],
          visualPts = [], visualLines = [], visualLayers = [],
          activeVisualLayerId = null, nVid, nVlid, nVlyid } = state;
  return {
    ver: 2,
    savedAt: new Date().toISOString(),
    pts:  JSON.parse(JSON.stringify(pts)),
    meas: JSON.parse(JSON.stringify(meas)),
    centerErr,
    nMid: nMid ?? 1,
    // Hindren låg tidigare utanför autosparningen, så en omladdning tömde
    // siktberäkningen på alla hinder – och kopplingen från visuella linjer
    // till väggar nollades av syncLinkedObstacles när hindret saknades.
    obstacles:           JSON.parse(JSON.stringify(obstacles)),
    visualPts:           JSON.parse(JSON.stringify(visualPts)),
    visualLines:         JSON.parse(JSON.stringify(visualLines)),
    visualLayers:        JSON.parse(JSON.stringify(visualLayers)),
    activeVisualLayerId,
    nVid:   nVid   ?? 1,
    nVlid:  nVlid  ?? 1,
    nVlyid: nVlyid ?? 1,
  };
}

// Webbläsarna namnger felet olika; koderna täcker äldre Safari och Firefox.
export function _isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
              || e.code === 22 || e.code === 1014);
}

// Tidpunkten för senast lyckade autosparning i sessionen. Används i
// felmeddelandet: en omladdning återställer det läget, inte det aktuella.
let _lastOk = null;
// Meddelandet visas som toast en gång per felperiod – autosparningen körs
// efter varje ändring, och en toast varannan sekund går inte att arbeta med.
let _failing = false;

const _hhmm = d => d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function _status(text, title = '') {
  if (typeof document === 'undefined') return;
  const el = document.getElementById("autosave-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('val-warn', !!title);
  el.title = title;
}

/**
 * Skriver autosparningen direkt. Returnerar { ok, bytes } eller
 * { ok:false, quota, bytes, error }. bytes är JSON-strängens längd i tecken.
 */
export function writeAutosaveNow() {
  let json = '';
  try {
    json = JSON.stringify(_buildAutosaveSnapshot());
    localStorage.setItem(SAVE_KEY, json);
  } catch (e) {
    const quota = _isQuotaError(e);
    const sedan = _lastOk ? ` – en omladdning återställer läget från ${_hhmm(_lastOk)}` : '';
    const msg = quota
      ? `⚠ Autosparningen misslyckades: webbläsarens lagring är full. Spara projektet till fil (Ctrl+S)${sedan}.`
      : `⚠ Autosparningen misslyckades. Spara projektet till fil (Ctrl+S)${sedan}.`;
    _status(quota ? '⚠ Autosparning: lagringen full' : '⚠ Autosparning misslyckades', msg);
    if (!_failing) showToast(msg, "#ff5050");
    _failing = true;
    console.warn("Autosave misslyckades:", e);
    return { ok: false, quota, bytes: json.length, error: e };
  }
  _failing = false;
  _lastOk = new Date();
  _status(`Autosparat ${_hhmm(_lastOk)}`);
  return { ok: true, bytes: json.length };
}

// Throttled autosave – 1500 ms, matchar rad 3592–3604
export function saveAutosave() {
  clearTimeout(_asTimer);
  _asTimer = setTimeout(writeAutosaveNow, 1500);
}

// Hinder ur en autosparning: bara sådant som hasLineOfSight kan läsa.
function _sanitizeObstacles(list) {
  return _sanitizeObstacleColors((Array.isArray(list) ? list : []).filter(o =>
    o && typeof o.id === 'string' && (o.type === 'polygon' || o.type === 'line')
    && Array.isArray(o.points)
    && o.points.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))));
}

// Läs autosave vid start – returnerar true om något laddades, false annars.
// Matchar rad 3607–3613 exakt.
export function loadAutosave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || (s.ver !== 2 && s.ver !== 1)) return false;
    // Samma migrering som vid laddning av projektfil: objekt utan layerId
    // samlas i "Handritat".
    const sanitized = _sanitizeVisual(s.visualPts, s.visualLines);
    const { visualPts, visualLines, visualLayers, activeVisualLayerId, nVlyid } =
      _migrateVisualLayers(sanitized.visualPts, sanitized.visualLines,
                           s.visualLayers, s.activeVisualLayerId);
    // Autosparningar från före hindren saknar fältet → inga hinder, som förut.
    const obstacles = _sanitizeObstacles(s.obstacles);
    _syncObstacleCounter(obstacles);
    setState({
      pts:       s.pts  || [],
      meas:      s.meas || [],
      obstacles,
      centerErr: s.centerErr != null ? s.centerErr : 1.0,
      nMid:      s.nMid      ?? 1,
      visualPts, visualLines, visualLayers, activeVisualLayerId,
      nVid:   Math.max(s.nVid  ?? 1, _nextCounter(visualPts,   'V')),
      nVlid:  Math.max(s.nVlid ?? 1, _nextCounter(visualLines, 'VL')),
      nVlyid: Math.max(s.nVlyid ?? 1, nVlyid),
    });
    syncLinkedObstacles();
    return true;
  } catch (e) {
    return false;
  }
}
