// OSM-import via Overpass API.
// fetchOSMBuildings och parseOSMtoObstacles är rena funktioner utan DOM-beroende.
// fetchOSMBuildingsWithRetry innehåller retry-logik (testbar via injicerad delayFn).
// importOSMForCurrentView använder dynamiska imports för leaflet/DOM.

import proj4 from 'proj4';
import { CRS_DEFS } from '../core/constants.js';
import { getState } from '../state/store.js';
import { addObstacle } from '../state/obstacles.js';

let _projReady = false;
function _ensureProj() {
  if (_projReady) return;
  Object.entries(CRS_DEFS).forEach(([, v]) => proj4.defs(v.epsg, v.proj));
  _projReady = true;
}

const OVERPASS_URL     = 'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS   = 3_000;

// ─── Hämtning ────────────────────────────────────────────────────────────────

/**
 * Hämtar byggnader från Overpass API. Kastar Error vid alla fel (429, 500, timeout, nät).
 * @param {{south:number,west:number,north:number,east:number}} bounds  WGS84
 * @returns {Promise<object>}
 */
export async function fetchOSMBuildings(bounds) {
  const { south, west, north, east } = bounds;
  const query = [
    '[out:json][timeout:25];',
    '(',
    `  way["building"](${south},${west},${north},${east});`,
    `  relation["building"](${south},${west},${north},${east});`,
    ');',
    'out body;',
    '>;',
    'out skel qt;',
  ].join('\n');

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  controller.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') {
      throw new Error('Timeout: Overpass API svarade inte inom 30 sekunder. Välj ett mindre kartutsnitt och försök igen.');
    }
    throw new Error(`Nätverksfel: ${e.message || 'Kontrollera din internetanslutning.'}`);
  }
  clearTimeout(tid);

  if (resp.status === 429) {
    throw new Error('Overpass API: för många förfrågningar (429 Rate Limit). Vänta en minut och försök igen.');
  }
  if (!resp.ok) {
    throw new Error(`Overpass API svarade med fel ${resp.status}. Försök igen om en stund.`);
  }
  return resp.json();
}

/**
 * Hämtar med automatisk retry vid 429: väntar RETRY_DELAY_MS och försöker en gång till.
 * Ren funktion utan DOM-beroende – DOM-callbacks och delay injiceras som options.
 *
 * @param {{south,west,north,east}} bounds
 * @param {{
 *   onRetrying?: () => void,          – kallas precis innan retry
 *   delayFn?: (ms: number) => Promise – default: riktigt setTimeout
 * }} options
 */
export async function fetchOSMBuildingsWithRetry(bounds, options = {}) {
  const {
    onRetrying,
    delayFn = ms => new Promise(r => setTimeout(r, ms)),
  } = options;

  try {
    return await fetchOSMBuildings(bounds);
  } catch (firstErr) {
    if (!firstErr.message.includes('429')) throw firstErr;

    // 429 – vänta och försök igen (max 1 retry)
    if (onRetrying) onRetrying();
    await delayFn(RETRY_DELAY_MS);
    return await fetchOSMBuildings(bounds); // kastar vidare om fortfarande fel
  }
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Konverterar Overpass JSON → obstacle-objekt i aktivt CRS.
 * Hanterar way och relation (multipolygon, yttre ring).
 */
export function parseOSMtoObstacles(osmData, activeCRS) {
  if (!osmData || !osmData.elements) return [];
  _ensureProj();

  const crsEpsg = CRS_DEFS[activeCRS]?.epsg ?? CRS_DEFS.sweref99tm.epsg;

  const nodeMap = new Map();
  const wayMap  = new Map();
  for (const el of osmData.elements) {
    if (el.type === 'node') nodeMap.set(el.id, el);
    if (el.type === 'way')  wayMap.set(el.id, el);
  }

  const obstacles = [];

  for (const el of osmData.elements) {
    if (el.type === 'way') {
      const pts = _wayToPoints(el, nodeMap, crsEpsg);
      if (!pts) continue;
      obstacles.push({ type: 'polygon', points: pts,
        label: el.tags?.name || 'OSM-byggnad', source: 'osm', osmId: el.id });

    } else if (el.type === 'relation') {
      const outerRefs = (el.members || []).filter(m => m.type === 'way' && m.role === 'outer');
      if (outerRefs.length === 0) continue;

      const allPts = [];
      for (const ref of outerRefs) {
        const wayEl = wayMap.get(ref.ref);
        if (!wayEl) continue;
        const pts = _wayToPoints(wayEl, nodeMap, crsEpsg);
        if (pts) allPts.push(...pts);
      }
      if (allPts.length < 3) continue;

      obstacles.push({ type: 'polygon', points: allPts,
        label: el.tags?.name || 'OSM-byggnad', source: 'osm', osmId: el.id });
    }
  }
  return obstacles;
}

function _wayToPoints(wayEl, nodeMap, crsEpsg) {
  if (!wayEl.nodes || wayEl.nodes.length < 3) return null;

  const pts = wayEl.nodes
    .map(id => {
      const n = nodeMap.get(id);
      if (!n) return null;
      const [E, N] = proj4('EPSG:4326', crsEpsg, [n.lon, n.lat]);
      return [E, N];
    })
    .filter(Boolean);

  if (pts.length < 3) return null;

  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(last[0] - first[0]) < 0.01 && Math.abs(last[1] - first[1]) < 0.01) pts.pop();

  return pts.length >= 3 ? pts : null;
}

// ─── Orkestrering (DOM/Leaflet – dynamiska imports) ──────────────────────────

export async function importOSMForCurrentView() {
  const { map, draw } = await import('../map/leaflet-setup.js');

  if (!map) { _showErrorModal('Kartan är inte redo.', null); return; }

  const lBounds = map.getBounds();
  const bounds  = {
    south: lBounds.getSouth(), west: lBounds.getWest(),
    north: lBounds.getNorth(), east: lBounds.getEast(),
  };

  _setLoading(true, 'Hämtar byggnader från OSM…');
  try {
    const osmData = await fetchOSMBuildingsWithRetry(bounds, {
      onRetrying: () => _setLoading(true, `Försöker igen om ${RETRY_DELAY_MS / 1000} sek…`),
    });
    const { activeCRS } = getState();
    const newObs = parseOSMtoObstacles(osmData, activeCRS);
    _setLoading(false);

    if (newObs.length === 0) {
      const { showToast } = await import('../ui/toast.js');
      showToast('📡 Inga byggnader hittades i aktuell kartvy', '#ff9900');
      return;
    }

    const confirmed = await _showConfirmModal(newObs.length);
    if (!confirmed) return;

    for (const obs of newObs) addObstacle(obs);
    draw();
    const { showToast } = await import('../ui/toast.js');
    showToast(`✓ ${newObs.length} byggnader importerade från OSM`, '#00ff88');

  } catch (err) {
    _setLoading(false);
    // Felmeddelandet visas i en persistent modal med Försök igen-knapp
    const retry = await _showErrorModal(err.message, importOSMForCurrentView);
    if (retry) retry(); // knappen löser det via sin onclick
  }
}

// ── Spinner med uppdaterbart meddelande ──────────────────────────────────────

function _setLoading(on, msg = null) {
  let el = document.getElementById('osm-loading-overlay');
  if (!el && on) {
    if (!document.getElementById('osm-spin-style')) {
      const s = document.createElement('style');
      s.id = 'osm-spin-style';
      s.textContent = '@keyframes osm-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    el = document.createElement('div');
    el.id = 'osm-loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;';
    el.innerHTML = [
      '<div style="width:38px;height:38px;border:3px solid #4fc3f7;border-top-color:transparent;',
      'border-radius:50%;animation:osm-spin 0.8s linear infinite;"></div>',
      '<div data-osm-msg style="color:#4fc3f7;font-family:monospace;font-size:13px;">',
      'Hämtar byggnader från OSM…</div>',
      '<div style="color:#6080a0;font-size:11px;font-family:monospace;">(kan ta 5–15 sek beroende på vy)</div>',
    ].join('');
    document.body.appendChild(el);
  }
  if (!el) return;
  el.style.display = on ? 'flex' : 'none';
  if (msg !== null) {
    const msgEl = el.querySelector('[data-osm-msg]');
    if (msgEl) msgEl.textContent = msg;
  }
}

// ── Bekräftelse-modal (N byggnader) ─────────────────────────────────────────

function _showConfirmModal(count) {
  return new Promise(resolve => {
    const overlay = _createOverlay(1900);
    const box = document.createElement('div');
    box.style.cssText = 'background:#0d1e30;border:1px solid #1e3850;border-radius:8px;padding:22px 26px;min-width:300px;max-width:90vw;font-family:"Segoe UI",sans-serif;';
    box.innerHTML = `
      <div style="font-size:15px;color:#4fc3f7;font-weight:700;margin-bottom:10px;">📡 OSM-import</div>
      <div style="font-size:13px;color:#d0e4f8;line-height:1.7;margin-bottom:16px;">
        Hittade <strong style="color:#00ff88;font-size:16px;">${count}</strong> byggnader i aktuell kartvy.
        <br><span style="font-size:11px;color:#7090a8;">
          Importerade hinder märks med <em>source "osm"</em> och visas i HINDER-fliken.
        </span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_osmCancel" style="padding:6px 20px;font-size:12px;background:transparent;border:1px solid #3a4a60;color:#8aa8c0;border-radius:3px;cursor:pointer;">Avbryt</button>
        <button id="_osmImport" style="padding:6px 20px;font-size:12px;background:#00ff8820;border:1px solid #00ff88;color:#00ff88;border-radius:3px;cursor:pointer;font-weight:bold;">✓ Importera ${count} st</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const done = ok => { document.body.removeChild(overlay); resolve(ok); };
    box.querySelector('#_osmImport').onclick = () => done(true);
    box.querySelector('#_osmCancel').onclick = () => done(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}

// ── Persistent felmodal med Försök igen-knapp ────────────────────────────────

/**
 * Visar ett permanent felmeddelande (inte försvinnande toast).
 * @param {string} message   – feltext
 * @param {Function|null} onRetry – om satt, visas "Försök igen"-knapp
 * @returns {Promise<false>} – löser alltid false (stäng); retry sker via knapp
 */
export function _showErrorModal(message, onRetry) {
  return new Promise(resolve => {
    const overlay = _createOverlay(1900);
    const box = document.createElement('div');
    box.style.cssText = 'background:#0d1e30;border:1px solid #3a1010;border-radius:8px;padding:20px 24px;min-width:300px;max-width:90vw;font-family:"Segoe UI",sans-serif;';
    box.innerHTML = `
      <div style="font-size:15px;color:#ff5050;font-weight:700;margin-bottom:10px;">❌ OSM-import misslyckades</div>
      <div style="font-size:12px;color:#d0a0a0;line-height:1.7;margin-bottom:16px;word-break:break-word;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_osmErrClose" style="padding:6px 20px;font-size:12px;background:transparent;border:1px solid #3a4a60;color:#8aa8c0;border-radius:3px;cursor:pointer;">Stäng</button>
        ${onRetry ? '<button id="_osmErrRetry" style="padding:6px 20px;font-size:12px;background:#ff505018;border:1px solid #ff5050;color:#ff9090;border-radius:3px;cursor:pointer;">🔄 Försök igen</button>' : ''}
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => { document.body.removeChild(overlay); resolve(false); };
    box.querySelector('#_osmErrClose').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const retryBtn = box.querySelector('#_osmErrRetry');
    if (retryBtn && onRetry) {
      retryBtn.onclick = () => { close(); onRetry(); };
    }
  });
}

function _createOverlay(zIndex) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.60);z-index:${zIndex};display:flex;align-items:center;justify-content:center;`;
  return el;
}
