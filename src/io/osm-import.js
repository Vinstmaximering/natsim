// OSM-import via Overpass API.
// fetchOSMBuildings och parseOSMtoObstacles är rena funktioner utan DOM-beroende
// och importeras av tests/osm-import.test.js direkt.
// importOSMForCurrentView använder dynamiska imports för leaflet/DOM.

import proj4 from 'proj4';
import { CRS_DEFS } from '../core/constants.js';
import { getState } from '../state/store.js';
import { addObstacle } from '../state/obstacles.js';

// Registrera SWEREF99-projektioner en gång (idempotent med proj4.defs)
let _projReady = false;
function _ensureProj() {
  if (_projReady) return;
  Object.entries(CRS_DEFS).forEach(([, v]) => proj4.defs(v.epsg, v.proj));
  _projReady = true;
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT_MS = 30_000;

// ─── Hämtning ────────────────────────────────────────────────────────────────

/**
 * Hämtar byggnader från Overpass API för given bounding box (WGS84).
 * @param {{south:number,west:number,north:number,east:number}} bounds
 * @returns {Promise<object>} Parsad Overpass JSON
 */
export async function fetchOSMBuildings(bounds) {
  const { south, west, north, east } = bounds;
  // Overpass QL – hämtar ways och relations med building-tagg
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

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Konverterar Overpass JSON till obstacle-objekt i aktivt CRS.
 * Hanterar både way och relation (multipolygon, yttre ring).
 *
 * @param {object} osmData   – parsad Overpass-JSON
 * @param {string} activeCRS – CRS-nyckel (t.ex. "sweref99tm")
 * @returns {Array<{type:string,points:Array,label:string,source:string,osmId:number}>}
 */
export function parseOSMtoObstacles(osmData, activeCRS) {
  if (!osmData || !osmData.elements) return [];
  _ensureProj();

  const crsEpsg = CRS_DEFS[activeCRS]?.epsg ?? CRS_DEFS.sweref99tm.epsg;

  // Bygg upp slagnyckel för noder och ways
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
      obstacles.push({
        type:   'polygon',
        points: pts,
        label:  el.tags?.name || 'OSM-byggnad',
        source: 'osm',
        osmId:  el.id,
      });
    } else if (el.type === 'relation') {
      // Multipolygon: använd yttre (outer) ringar
      const outerRefs = (el.members || []).filter(m => m.type === 'way' && m.role === 'outer');
      if (outerRefs.length === 0) continue;

      // Samla punkter från alla outer ways i ordning
      const allPts = [];
      for (const ref of outerRefs) {
        const wayEl = wayMap.get(ref.ref);
        if (!wayEl) continue;
        const pts = _wayToPoints(wayEl, nodeMap, crsEpsg);
        if (pts) allPts.push(...pts);
      }
      if (allPts.length < 3) continue;

      obstacles.push({
        type:   'polygon',
        points: allPts,
        label:  el.tags?.name || 'OSM-byggnad',
        source: 'osm',
        osmId:  el.id,
      });
    }
  }
  return obstacles;
}

/**
 * Konverterar ett way-element till en array av [E,N]-punkter i målCRS.
 * Returnerar null om way har < 3 unika hörn.
 */
function _wayToPoints(wayEl, nodeMap, crsEpsg) {
  if (!wayEl.nodes || wayEl.nodes.length < 3) return null;

  const pts = wayEl.nodes
    .map(nodeId => {
      const n = nodeMap.get(nodeId);
      if (!n) return null;
      const [E, N] = proj4('EPSG:4326', crsEpsg, [n.lon, n.lat]);
      return [E, N];
    })
    .filter(Boolean);

  if (pts.length < 3) return null;

  // Stängd way: om sista punkt ≈ första, ta bort dubbletten
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(last[0] - first[0]) < 0.01 && Math.abs(last[1] - first[1]) < 0.01) {
    pts.pop();
  }

  return pts.length >= 3 ? pts : null;
}

// ─── Orkestrering (DOM/Leaflet-beroende – dynamiska imports) ─────────────────

/**
 * Hämtar byggnader för den aktuella kartvisning, visar bekräftelse-modal
 * och importerar dem som obstacles i nätsimulatorn.
 */
export async function importOSMForCurrentView() {
  const { map, draw } = await import('../map/leaflet-setup.js');
  const { showToast }  = await import('../ui/toast.js');

  if (!map) { showToast('❌ Kartan är inte redo', '#ff5050'); return; }

  const lBounds = map.getBounds();
  const bounds  = {
    south: lBounds.getSouth(),
    west:  lBounds.getWest(),
    north: lBounds.getNorth(),
    east:  lBounds.getEast(),
  };

  _setLoading(true);
  try {
    const osmData = await fetchOSMBuildings(bounds);
    const { activeCRS } = getState();
    const newObs  = parseOSMtoObstacles(osmData, activeCRS);
    _setLoading(false);

    if (newObs.length === 0) {
      showToast('📡 Inga byggnader hittades i aktuell kartvy', '#ff9900');
      return;
    }

    const confirmed = await _showConfirmModal(newObs.length);
    if (!confirmed) return;

    for (const obs of newObs) addObstacle(obs);
    draw();
    showToast(`✓ ${newObs.length} byggnader importerade från OSM`, '#00ff88');

  } catch (err) {
    _setLoading(false);
    showToast(`❌ OSM-import misslyckades: ${err.message}`, '#ff5050');
  }
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function _setLoading(on) {
  let el = document.getElementById('osm-loading-overlay');
  if (!el && on) {
    // Injicera spin-keyframes en gång
    if (!document.getElementById('osm-spin-style')) {
      const s = document.createElement('style');
      s.id = 'osm-spin-style';
      s.textContent = '@keyframes osm-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    el = document.createElement('div');
    el.id = 'osm-loading-overlay';
    el.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.55);',
      'z-index:2000;display:flex;align-items:center;',
      'justify-content:center;flex-direction:column;gap:14px;',
    ].join('');
    el.innerHTML = [
      '<div style="width:38px;height:38px;border:3px solid #4fc3f7;',
      'border-top-color:transparent;border-radius:50%;',
      'animation:osm-spin 0.8s linear infinite;"></div>',
      '<div style="color:#4fc3f7;font-family:monospace;font-size:13px;">',
      'Hämtar byggnader från OSM…</div>',
      '<div style="color:#6080a0;font-size:11px;font-family:monospace;">',
      '(kan ta 5–15 sek beroende på vy)</div>',
    ].join('');
    document.body.appendChild(el);
  }
  if (el) el.style.display = on ? 'flex' : 'none';
}

// ── Bekräftelse-modal ────────────────────────────────────────────────────────

function _showConfirmModal(count) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.60);',
      'z-index:1900;display:flex;align-items:center;justify-content:center;',
    ].join('');

    const box = document.createElement('div');
    box.style.cssText = [
      'background:#0d1e30;border:1px solid #1e3850;border-radius:8px;',
      'padding:22px 26px;min-width:300px;max-width:90vw;',
      'font-family:"Segoe UI",sans-serif;',
    ].join('');
    box.innerHTML = `
      <div style="font-size:15px;color:#4fc3f7;font-weight:700;margin-bottom:10px;">📡 OSM-import</div>
      <div style="font-size:13px;color:#d0e4f8;line-height:1.7;margin-bottom:16px;">
        Hittade <strong style="color:#00ff88;font-size:16px;">${count}</strong> byggnader i aktuell kartvy.
        <br>
        <span style="font-size:11px;color:#7090a8;">
          Importerade hinder märks med&nbsp;<em>source&nbsp;"osm"</em><br>
          och visas i HINDER-fliken.
        </span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="_osmCancel" style="padding:6px 20px;font-size:12px;background:transparent;
          border:1px solid #3a4a60;color:#8aa8c0;border-radius:3px;cursor:pointer;">Avbryt</button>
        <button id="_osmImport" style="padding:6px 20px;font-size:12px;background:#00ff8820;
          border:1px solid #00ff88;color:#00ff88;border-radius:3px;cursor:pointer;font-weight:bold;">
          ✓ Importera ${count} st</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const done = ok => { document.body.removeChild(overlay); resolve(ok); };
    box.querySelector('#_osmImport').onclick = () => done(true);
    box.querySelector('#_osmCancel').onclick = () => done(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}
