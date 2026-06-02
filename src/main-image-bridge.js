// Tar emot 'request-net-image' från PM-popupen, genererar bilden med Leaflet-tiles
// (resetView → waitForTilesLoaded → generateNetImage) och svarar med 'net-image-result'.
// Visar en overlay i huvudfönstret under generering så kart-panering inte syns.
//
// Känd begränsning – Esri World Imagery vid hög zoom (19+):
//   Esri saknar täckning i många delar av Sverige vid zoom 19+. Saknade tiles
//   visas som tomma rutor i bilden. OSM fungerar bättre som primärt alternativ
//   för detaljerade nätbilder. Lantmäteriet WMS saknar CORS → grid-fallback alltid.
import L from 'leaflet';
import { map as leafletMap, ENtoLatLng } from './map/leaflet-setup.js';
import { generateNetImage }               from './reports/net-image.js';
import { getState }                        from './state/store.js';

// Väntar tills inga tiles-bilder är i laddnings-tillstånd, eller timeout.
function waitForTilesLoaded(map, timeoutMs = 5000) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (!done) { done = true; map.off('tileload tileerror', check); resolve(); }
    };
    const timer = setTimeout(finish, timeoutMs);
    const check = () => {
      if (!map.getContainer().querySelector('img.leaflet-tile-loading')) {
        clearTimeout(timer); finish();
      }
    };
    // Kort fördröjning så tile-requests hinner initieras efter fitBounds
    setTimeout(() => { check(); map.on('tileload tileerror', check); }, 150);
  });
}

function showOverlay() {
  const existing = document.getElementById('image-gen-overlay');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'image-gen-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(13,21,32,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;color:#fff;font-family:"Segoe UI",sans-serif;';
  el.innerHTML = `<div style="text-align:center;padding:24px;background:#1a2030;border-radius:8px;border:1px solid #4fc3f7;">
    <div style="font-size:18px;font-weight:600;margin-bottom:8px;">🎨 Genererar bild...</div>
    <div style="font-size:13px;color:#7090a8;">Förbereder satellitbakgrund</div>
  </div>`;
  document.body.appendChild(el);
  return el;
}

async function generateImageWithSatellite(options) {
  const { pts } = getState();

  if (!leafletMap) return generateNetImage(options);

  // Spara nuvarande vy för återställning i finally
  const savedCenter = leafletMap.getCenter();
  const savedZoom   = leafletMap.getZoom();

  const overlay = showOverlay();
  try {
    const TYPE_VISIBLE = {
      known:      options.showKnown      ?? true,
      station:    options.showStations   ?? true,
      new:        options.showNew        ?? true,
      detail:     options.showDetail     ?? true,
      simstation: options.showSimStations ?? true,
    };
    const visiblePts = pts.filter(p => TYPE_VISIBLE[p.type] ?? true);

    if (visiblePts.length > 0) {
      // Pan till bbox av synliga punkter (+ 20% marginal), animate:false → inget kart-ryck
      const lls    = visiblePts.map(p => ENtoLatLng(p.E, p.N));
      const bounds = L.latLngBounds(lls).pad(0.20);
      leafletMap.fitBounds(bounds, { animate: false });
      await waitForTilesLoaded(leafletMap);
    }

    return generateNetImage(options);
  } finally {
    // Återställ alltid – oavsett fel eller timeout
    overlay.remove();
    leafletMap.setView(savedCenter, savedZoom, { animate: false });
  }
}

export function initImageBridge() {
  window.addEventListener('message', async (e) => {
    if (e.data?.type !== 'request-net-image') return;
    const { requestId, options } = e.data;
    try {
      const result = await generateImageWithSatellite(options);
      e.source?.postMessage({ type: 'net-image-result', requestId, ...result }, '*');
    } catch (_err) {
      // Fel → fallback med vit bakgrund
      const result = generateNetImage({ ...options, background: 'white' });
      e.source?.postMessage({ type: 'net-image-result', requestId, ...result, usedFallback: true }, '*');
    }
  });
}
