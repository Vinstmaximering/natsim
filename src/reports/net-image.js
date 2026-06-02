// Portad från NätSim_Beta_2.html rad 4021-4220
// Datum: 2026-06-02
// Skillnader mot original:
//   - options-objekt med default-värden för att parametrisera bildtyper
//   - returnerar { dataURL, width, height, usedFallback } istället för bara dataURL
//   - filtrerar punkter/mätningar via show*-flaggor
//   - background-alternativ: 'tiles' | 'grid' | 'white'
//   - titel, nordpil, hinder, förslag, felellipser som options
//   - färger hämtas från PT-konstanten (samma som kartan)

import proj4 from 'proj4';
import { getState } from '../state/store.js';
import { PT, CRS_DEFS } from '../core/constants.js';
import { rColor } from '../core/redundancy.js';

// Registrera SWEREF99-projektioner (idempotent – görs också av leaflet-setup.js vid start)
Object.entries(CRS_DEFS).forEach(([, v]) => proj4.defs(v.epsg, v.proj));

// Sätts av main.js via setMapRef(map) efter initMap() – null i test-miljö.
let _mapRef = null;
export function setMapRef(m) { _mapRef = m; }

const DEFAULTS = {
  // Vilka punkter visas
  showKnown:       true,
  showStations:    true,
  showNew:         true,
  showDetail:      true,
  showSimStations: true,

  // Vilka anslutningar visas
  showMeasurements:       true,
  showSuggestions:        false,
  showBlockedSuggestions: false,

  // Extra info
  showEllipses:  false,
  showObstacles: false,
  showLabels:    true,

  // Layout
  showLegend: true,
  showScale:  true,
  showNorth:  true,
  title:      null,

  // Bakgrund
  background: 'tiles',   // 'tiles' | 'grid' | 'white'

  // Vy
  autoZoom: true,
  margin:   0.30,

  // Storlek
  width:  1200,
  height: 800,

  // Ellips-förstoring i bilden (override av state.ellScale; null = använd state)
  ellipseScale: 5000,
};

export function generateNetImage(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const W = opts.width, H = opts.height;
  const { pts, meas, obstacles, simResult, suggestedMeas, blockedSuggestions } = getState();

  const TYPE_VISIBLE = {
    known:      opts.showKnown,
    station:    opts.showStations,
    new:        opts.showNew,
    detail:     opts.showDetail,
    simstation: opts.showSimStations,
  };
  const activePts = pts.filter(p => TYPE_VISIBLE[p.type] ?? true);

  const oc = document.createElement('canvas');
  oc.width = W;
  oc.height = H;
  const ctx = oc.getContext('2d');

  if (!activePts.length) {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, W, H);
    return { dataURL: oc.toDataURL('image/png'), width: W, height: H, usedFallback: false };
  }

  const cx = W / 2, cy = H / 2;

  // ── Vy-parametrar ────────────────────────────────────────────────────────
  // scale: output-pixlar per SWEREF-meter
  // midN, midE: bildcentrum i SWEREF-koordinater
  // _ts: output-pixlar per Leaflet-skärmpixel (sätts vid autoZoom:false + karta tillgänglig)
  let scale, midN, midE;
  let _ts = null;

  if (!opts.autoZoom && _mapRef) {
    // Solution B: "vad du ser är vad du får" – bildgeometrin läses från Leaflets aktiva kartvy.
    try {
      const mc = _mapRef.getContainer();
      const mapCenter = _mapRef.getCenter();
      const crsObj = CRS_DEFS[getState().activeCRS];

      // leafletMPP: SWEREF-meter per Leaflet-skärmpixel vid aktuell zoom
      const p1 = _mapRef.latLngToContainerPoint(mapCenter);
      const ll2 = _mapRef.containerPointToLatLng([p1.x + 100, p1.y]);
      [midE, midN] = proj4('EPSG:4326', crsObj.epsg, [mapCenter.lng, mapCenter.lat]);
      const [e2, n2] = proj4('EPSG:4326', crsObj.epsg, [ll2.lng, ll2.lat]);
      const leafletMPP = Math.hypot(e2 - midE, n2 - midN) / 100;

      // ts = output-pixlar per Leaflet-skärmpixel (dimensionslöst förhållande).
      // Dimensionsalgebra: ts = leafletMPP [m/skärmpx] × scale [outputpx/m]
      //   = [m/skärmpx × outputpx/m] = [outputpx/skärmpx] ✓
      // Med autoZoom:false väljer vi ts = W/mc.offsetWidth (enkelt bildförhållande),
      // vilket ger scale = ts/leafletMPP = W/(mc.offsetWidth × leafletMPP).
      _ts = W / mc.offsetWidth;
      scale = _ts / leafletMPP;
    } catch (_e) {
      _ts = null; // Fallback till bbox om kartan inte svarar
    }
  }

  if (_ts === null) {
    // autoZoom:true eller ingen karta – beräkna bounding box av synliga punkter
    let bbMinN = Infinity, bbMaxN = -Infinity, bbMinE = Infinity, bbMaxE = -Infinity;
    activePts.forEach(p => {
      bbMinN = Math.min(bbMinN, p.N); bbMaxN = Math.max(bbMaxN, p.N);
      bbMinE = Math.min(bbMinE, p.E); bbMaxE = Math.max(bbMaxE, p.E);
    });
    const spanN = bbMaxN - bbMinN || 1, spanE = bbMaxE - bbMinE || 1;
    const mg = opts.margin;
    bbMinN -= spanN * mg; bbMaxN += spanN * mg;
    bbMinE -= spanE * mg; bbMaxE += spanE * mg;
    const pad = 60;
    scale = Math.min((W - pad * 2) / (bbMaxE - bbMinE), (H - pad * 2) / (bbMaxN - bbMinN));
    midN = (bbMinN + bbMaxN) / 2;
    midE = (bbMinE + bbMaxE) / 2;
  }

  // sc: SWEREF(N, E) → canvas-pixel
  const sc = (N, E) => ({ x: cx + (E - midE) * scale, y: cy - (N - midN) * scale });

  let usedFallback = false;

  // ── 1. Bakgrund ───────────────────────────────────────────────────────────
  if (opts.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  } else if (opts.background === 'tiles') {
    let bgOk = false;
    if (_mapRef && getState().mapLayerVisible) {
      try {
        const mc = _mapRef.getContainer();
        const mr = mc.getBoundingClientRect();
        const mcp = _mapRef.latLngToContainerPoint(_mapRef.getCenter());
        const tiles = Array.from(mc.querySelectorAll('img.leaflet-tile-loaded'));
        if (tiles.length > 0) {
          ctx.fillStyle = '#e8eff5';
          ctx.fillRect(0, 0, W, H);
          if (_ts !== null) {
            // autoZoom:false – tx/ty i Leaflet-skärmpixlar, _ts konverterar till output-pixlar.
            // ox=oy=0 eftersom bildcentrum = kartcentrum per konstruktion.
            for (const img of tiles) {
              try {
                const tr = img.getBoundingClientRect();
                const tx = tr.left - mr.left - mcp.x, ty = tr.top - mr.top - mcp.y;
                ctx.drawImage(img, cx + tx * _ts, cy + ty * _ts, tr.width * _ts, tr.height * _ts);
              } catch (_e) {}
            }
          } else {
            // autoZoom:true – originalalgoritm med leafletMPP, ox, oy
            // (kräver att Leaflets kartvy täcker samma yta som bbox)
            const crsObj = CRS_DEFS[getState().activeCRS];
            const lc = _mapRef.getCenter(), lp1 = _mapRef.latLngToContainerPoint(lc);
            const ll2 = _mapRef.containerPointToLatLng([lp1.x + 100, lp1.y]);
            const [le1, ln1] = proj4('EPSG:4326', crsObj.epsg, [lc.lng, lc.lat]);
            const [le2, ln2] = proj4('EPSG:4326', crsObj.epsg, [ll2.lng, ll2.lat]);
            const leafletMPP = Math.hypot(le2 - le1, ln2 - ln1) / 100;
            const ts = leafletMPP * scale;
            const [ml, mlat] = proj4(crsObj.epsg, 'EPSG:4326', [midE, midN]);
            const mpm = _mapRef.latLngToContainerPoint({ lat: mlat, lng: ml });
            const ox = mpm.x - mcp.x, oy = mpm.y - mcp.y;
            for (const img of tiles) {
              try {
                const tr = img.getBoundingClientRect();
                const tx = tr.left - mr.left - mcp.x, ty = tr.top - mr.top - mcp.y;
                ctx.drawImage(img, cx - ox*ts + tx*ts, cy - oy*ts + ty*ts, tr.width*ts, tr.height*ts);
              } catch (_e) {}
            }
          }
          bgOk = true;
        }
      } catch (_e) { bgOk = false; }
    }
    // OBS: Lantmäteriets WMS-lager (lm_orto, lm_topo) saknar CORS-stöd för externa
    // domäner. Deras tiles taintar canvas oavsett crossOrigin-inställning – dessa
    // lager ger alltid grid-fallback vid bildexport. Kan ej åtgärdas från klienten.
    if (!bgOk) drawGrid(ctx, W, H, cx, cy, midN, midE, scale);
  } else {
    // 'grid'
    drawGrid(ctx, W, H, cx, cy, midN, midE, scale);
  }

  // ── 2. Hinder ─────────────────────────────────────────────────────────────
  if (opts.showObstacles && obstacles.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(180,60,60,0.7)';
    ctx.fillStyle   = 'rgba(220,80,80,0.12)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    obstacles.forEach(obs => {
      if (!obs.points || obs.points.length < 2) return;
      ctx.beginPath();
      obs.points.forEach(([E, N], i) => {
        const s = sc(N, E);
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      });
      if (obs.type === 'polygon') ctx.closePath();
      ctx.stroke();
      if (obs.type === 'polygon') ctx.fill();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── 3. Mätlinjer ──────────────────────────────────────────────────────────
  if (opts.showMeasurements) {
    const rMap = {};
    if (simResult?.measResults) {
      simResult.measResults.forEach(mr => { rMap[mr.id] = mr.r_mean ?? mr.r; });
    }
    meas.forEach(m => {
      const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
      if (!p1 || !p2) return;
      const s1 = sc(p1.N, p1.E), s2 = sc(p2.N, p2.E);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      const r = rMap[m.id];
      ctx.strokeStyle = r !== undefined ? rColor(r) : '#1a6090';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  }

  // ── 4. Förslag (gula streckade) ───────────────────────────────────────────
  if (opts.showSuggestions && suggestedMeas?.length) {
    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = '#e6c200';
    ctx.lineWidth = 1.4;
    suggestedMeas.forEach(m => {
      const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
      if (!p1 || !p2) return;
      const s1 = sc(p1.N, p1.E), s2 = sc(p2.N, p2.E);
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── 5. Blockerade förslag (röda streckade) ────────────────────────────────
  if (opts.showBlockedSuggestions && blockedSuggestions?.length) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cc2200';
    ctx.lineWidth = 1.2;
    blockedSuggestions.forEach(m => {
      const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
      if (!p1 || !p2) return;
      const s1 = sc(p1.N, p1.E), s2 = sc(p2.N, p2.E);
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── 6. Punkter ────────────────────────────────────────────────────────────
  activePts.forEach(p => {
    const s = sc(p.N, p.E);
    const col = (PT[p.type] || {}).c || '#666';
    const r = p.type === 'known' ? 9 : 7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (p.type === 'known') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    }
  });

  // ── 7. Felellipser ────────────────────────────────────────────────────────
  // effectiveEllScale: opts.ellipseScale (default 5000) override:ar state.ellScale,
  // ger konsekvent stor visualisering oavsett kartvyns visuella skala.
  if (opts.showEllipses && simResult?.ok) {
    const { ellipsMode = '1sig' } = getState();
    const k = ellipsMode === '95' ? 2.4477 : 1.0;
    const effectiveEllScale = opts.ellipseScale ?? getState().ellScale ?? 50;

    const drawEllipse = (s, aSemi, bSemi, theta, color, dash) => {
      let aPx = aSemi * effectiveEllScale * scale * k;
      let bPx = bSemi * effectiveEllScale * scale * k;
      if (aPx < 8) { const boost = 8 / aPx; aPx = 8; bPx = Math.max(bPx * boost, 1); }
      bPx = Math.max(bPx, 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(-theta);
      ctx.beginPath();
      ctx.ellipse(0, 0, aPx, bPx, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // Primärnätspunkter – lila streckad
    (simResult.allPtResults || []).forEach(pr => {
      if (!pr.aSemi || pr.aSemi <= 0) return;
      drawEllipse(sc(pr.N, pr.E), pr.aSemi, pr.bSemi, pr.theta, '#ce93d8', [4, 3]);
    });

    // Simulerade uppställningar – rosa streckad
    (simResult.simStationResults || []).forEach(ss => {
      if (!ss.ok || !ss.aSemi || ss.aSemi <= 0) return;
      drawEllipse(sc(ss.N, ss.E), ss.aSemi, ss.bSemi, ss.theta, '#ff6090', [6, 3]);
    });

    // Storleks-etiketter "a/b X.X/X.X mm" ovanför varje ellips
    // Samma stil som punkt-etiketter: rgba(255,255,255,.85) bakgrund, #111 text
    if (opts.showLabels) {
      const labelTarget = [
        ...(simResult.allPtResults || []).filter(pr => pr.aSemi > 0),
        ...(simResult.simStationResults || []).filter(ss => ss.ok && ss.aSemi > 0),
      ];
      labelTarget.forEach(pr => {
        const s = sc(pr.N, pr.E);
        let aPx = pr.aSemi * effectiveEllScale * scale * k;
        if (aPx < 8) aPx = 8;
        const lbl = `a/b ${(pr.aSemi * 1000).toFixed(1)}/${(pr.bSemi * 1000).toFixed(1)} mm`;
        ctx.font = '9px Arial';
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillRect(s.x - tw / 2 - 3, s.y - aPx - 18, tw + 6, 14);
        ctx.fillStyle = '#111';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, s.x, s.y - aPx - 7);
      });
    }
  }

  // ── 8. Etiketter ──────────────────────────────────────────────────────────
  if (opts.showLabels) {
    activePts.forEach(p => {
      const s = sc(p.N, p.E);
      const r = p.type === 'known' ? 9 : 7;
      ctx.font = `bold ${p.type === 'known' ? 11 : 10}px Arial`;
      const tw = ctx.measureText(p.id).width;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(s.x + r + 3, s.y - 10, tw + 4, 14);
      ctx.fillStyle = '#111';
      ctx.textAlign = 'left';
      ctx.fillText(p.id, s.x + r + 5, s.y + 1);
    });
  }

  // ── 9. Legend + skalstapel + nordpil ─────────────────────────────────────
  if (opts.showLegend) {
    const typesSeen = [...new Set(activePts.map(p => p.type))].filter(t => PT[t]);
    const legEntries = typesSeen.map(t => ({ col: PT[t].c, lbl: PT[t].l }));
    const ellInfo = (opts.showEllipses && simResult?.ok)
      ? `Felellipser skala: ${opts.ellipseScale ?? getState().ellScale ?? 50}×`
      : null;
    const rows = legEntries.length + (ellInfo ? 1 : 0);
    if (rows > 0) {
      let ly = H - 14;
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillRect(6, H - rows * 20 - 8, 180, rows * 20 + 6);
      if (ellInfo) {
        ctx.fillStyle = '#555';
        ctx.font = 'italic 9px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(ellInfo, 10, ly + 4);
        ly -= 20;
      }
      [...legEntries].reverse().forEach(({ col, lbl }) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(18, ly, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222'; ctx.font = '10px Arial'; ctx.textAlign = 'left';
        ctx.fillText(lbl, 30, ly + 4);
        ly -= 20;
      });
    }
  }

  if (opts.showScale) {
    const rm = 100 / scale;
    const nv = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const nm = nv.reduce((a, b) => Math.abs(b - rm) < Math.abs(a - rm) ? b : a);
    const sp = nm * scale;
    const bx = W - 16, by = H - 14;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(bx - sp - 8, by - 18, sp + 16, 24);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - sp, by); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - sp, by - 5); ctx.lineTo(bx - sp, by + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 3); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    ctx.fillText(`${nm} m`, bx - sp / 2, by - 8);
  }

  if (opts.showNorth) {
    const nx = W - 34, ny = 34;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.beginPath(); ctx.arc(nx, ny, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(nx, ny + 4); ctx.lineTo(nx, ny - 14); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny + 15);
    ctx.restore();
  }

  // ── 10. Titel ─────────────────────────────────────────────────────────────
  if (opts.title) {
    ctx.save();
    ctx.font = 'bold 16px Arial';
    const tw = ctx.measureText(opts.title).width;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(cx - tw / 2 - 10, 6, tw + 20, 28);
    ctx.fillStyle = '#223344'; ctx.textAlign = 'center';
    ctx.fillText(opts.title, cx, 26);
    ctx.restore();
  }

  // ── Export – CORS-fallback vid SecurityError ───────────────────────────────
  try {
    return { dataURL: oc.toDataURL('image/png'), width: W, height: H, usedFallback };
  } catch (_secErr) {
    usedFallback = true;
    const oc2 = document.createElement('canvas');
    oc2.width = W; oc2.height = H;
    const c2 = oc2.getContext('2d');

    drawGrid(c2, W, H, cx, cy, midN, midE, scale);

    if (opts.showMeasurements) {
      meas.forEach(m => {
        const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
        if (!p1 || !p2) return;
        const s1 = sc(p1.N, p1.E), s2 = sc(p2.N, p2.E);
        c2.beginPath(); c2.moveTo(s1.x, s1.y); c2.lineTo(s2.x, s2.y);
        c2.strokeStyle = '#1a6090'; c2.lineWidth = 1.6; c2.stroke();
      });
    }

    activePts.forEach(p => {
      const s = sc(p.N, p.E);
      const col = (PT[p.type] || {}).c || '#666';
      const r = p.type === 'known' ? 9 : 7;
      c2.beginPath(); c2.arc(s.x, s.y, r, 0, Math.PI * 2);
      c2.fillStyle = col; c2.fill();
      c2.strokeStyle = '#fff'; c2.lineWidth = 2; c2.stroke();
      if (p.type === 'known') {
        c2.beginPath(); c2.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
        c2.strokeStyle = col; c2.lineWidth = 1.5; c2.stroke();
      }
    });

    if (opts.showLabels) {
      activePts.forEach(p => {
        const s = sc(p.N, p.E);
        const r = p.type === 'known' ? 9 : 7;
        c2.font = `bold ${p.type === 'known' ? 11 : 10}px Arial`;
        const tw = c2.measureText(p.id).width;
        c2.fillStyle = 'rgba(255,255,255,.85)';
        c2.fillRect(s.x + r + 3, s.y - 10, tw + 4, 14);
        c2.fillStyle = '#111'; c2.textAlign = 'left';
        c2.fillText(p.id, s.x + r + 5, s.y + 1);
      });
    }

    if (opts.showScale) {
      const rm = 100 / scale;
      const nv = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
      const nm = nv.reduce((a, b) => Math.abs(b - rm) < Math.abs(a - rm) ? b : a);
      const sp = nm * scale;
      const bx = W - 16, by = H - 14;
      c2.fillStyle = 'rgba(255,255,255,.88)';
      c2.fillRect(bx - sp - 8, by - 18, sp + 16, 24);
      c2.strokeStyle = '#333'; c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(bx - sp, by); c2.lineTo(bx, by); c2.stroke();
      c2.fillStyle = '#333'; c2.font = 'bold 10px Arial'; c2.textAlign = 'center';
      c2.fillText(`${nm} m`, bx - sp / 2, by - 8);
    }

    return { dataURL: oc2.toDataURL('image/png'), width: W, height: H, usedFallback: true };
  }
}

// Ritar koordinatrutnät (fallback när karttiles ej är tillgängliga)
function drawGrid(ctx, W, H, cx, cy, midN, midE, scale) {
  const mPerPx = 1 / scale;
  const hw = W / 2 * mPerPx, hh = H / 2 * mPerPx;
  const nv = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const gi = nv.reduce((a, b) => Math.abs(b - hw / 3) < Math.abs(a - hw / 3) ? b : a);
  const toXY = (N, E) => ({ x: cx + (E - midE) * scale, y: cy - (N - midN) * scale });

  ctx.fillStyle = '#f2f5f8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8ecf1';
  for (let e = Math.floor((midE - hw) / gi) * gi; e <= midE + hw + gi; e += gi * 2)
    for (let n = Math.floor((midN - hh) / gi) * gi; n <= midN + hh + gi; n += gi * 2) {
      const s0 = toXY(n + gi, e), s1 = toXY(n, e + gi);
      ctx.fillRect(Math.min(s0.x, s1.x), Math.min(s0.y, s1.y), Math.abs(s1.x - s0.x), Math.abs(s1.y - s0.y));
    }

  ctx.strokeStyle = 'rgba(100,130,160,.4)'; ctx.lineWidth = 0.7;
  ctx.fillStyle = '#5a7890'; ctx.font = 'bold 9px Arial';

  for (let e = Math.floor((midE - hw) / gi) * gi; e <= midE + hw + gi; e += gi) {
    const t = toXY(midN + hh, e), b = toXY(midN - hh, e);
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(`E ${e.toFixed(0)}`, t.x, 14);
  }
  for (let n = Math.floor((midN - hh) / gi) * gi; n <= midN + hh + gi; n += gi) {
    const l = toXY(n, midE - hw);
    ctx.beginPath(); ctx.moveTo(0, l.y); ctx.lineTo(W, l.y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(`N ${n.toFixed(0)}`, W - 4, l.y - 3);
  }
}
