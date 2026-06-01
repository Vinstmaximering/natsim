// Kopierad exakt från NätSim_Beta_2.html rad 1153–1672.
// Strukturella ändringar:
//   – map exporteras som live binding (ej global/window)
//   – Läser state via getState() (ej globaler)
//   – UI-callbacks (updatePtList, renderTab) registreras via setDrawCallbacks()
//   – drawPt, ptPixel, mppAtCenter definierade här och re-exporteras från markers.js
import L from 'leaflet';
import proj4 from 'proj4';
import { CRS_DEFS, INSTRUMENTS, PT } from '../core/constants.js';
import { d2EN, brgEN, calcM, fG, fD } from '../core/designmatrix.js';
import { rColor } from '../core/redundancy.js';
import { getState, setState } from '../state/store.js';
import { initInteractions } from './interactions.js';

// ── Kartlager – Lantmäteriets WMS + öppna alternativ ──
export const LAYERS = {
  lm_orto:  { name:"Ortofoto (Lantmäteriet)",   url:"https://minkarta.lantmateriet.se/map/ortofoto/?",  type:"wms", layers:"Ortofoto_0.5,Ortofoto_0.4,Ortofoto_0.25,Ortofoto_0.16", format:"image/png", transparent:false },
  lm_topo:  { name:"Topografisk (Lantmäteriet)", url:"https://minkarta.lantmateriet.se/map/topowebb/?", type:"wms", layers:"topowebbkartan", format:"image/png", transparent:false },
  osm:      { name:"OpenStreetMap",   url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", type:"tile", attribution:"© OpenStreetMap" },
  satellite:{ name:"Esri Satellit",   url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", type:"tile", attribution:"© Esri" },
};

// Registrera alla SWEREF99-projektioner i proj4
Object.entries(CRS_DEFS).forEach(([, v]) => proj4.defs(v.epsg, v.proj));

// map exporteras som live binding – importörer ser uppdateringen när initMap() kör
export let map = null;
let activeLayer = null;

// ── UI-callbacks (registrerade av main.js i Fas 7) ──────────────────────────
const drawCb = { updatePtList: null, renderTab: null };
export function setDrawCallbacks(cbs) { Object.assign(drawCb, cbs); }

// ── Koordinatkonvertering ─────────────────────────────────────────────────────
// rad 420–428 exakt
export function ENtoLatLng(E, N) {
  const { activeCRS } = getState();
  const [lng, lat] = proj4(CRS_DEFS[activeCRS].epsg, "EPSG:4326", [E, N]);
  return L.latLng(lat, lng);
}

export function latLngToEN(latlng) {
  const { activeCRS } = getState();
  const [E, N] = proj4("EPSG:4326", CRS_DEFS[activeCRS].epsg, [latlng.lng, latlng.lat]);
  return { E, N };
}

// ── Canvas-hjälpfunktioner ────────────────────────────────────────────────────
// rad 580–588
export function ptPixel(pt) {
  if (!map) return { x: 0, y: 0 };
  const ll = ENtoLatLng(pt.E, pt.N);
  const p  = map.latLngToContainerPoint(ll);
  return { x: p.x, y: p.y };
}

// rad 1584–1588
export function mppAtCenter() {
  const z   = map.getZoom();
  const lat = map.getCenter().lat;
  return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
}

// ── Kartlagerstyrning ─────────────────────────────────────────────────────────
// rad 1205–1221
export function setMapLayer(key) {
  if (activeLayer) map.removeLayer(activeLayer);
  const L_ = LAYERS[key];
  if (L_.type === "wms") {
    activeLayer = L.tileLayer.wms(L_.url, {
      layers: L_.layers, format: L_.format, transparent: L_.transparent,
      version: "1.1.1", attribution: "© Lantmäteriet", maxZoom: 28, maxNativeZoom: 20
    });
  } else {
    activeLayer = L.tileLayer(L_.url, { attribution: L_.attribution, maxZoom: 28, maxNativeZoom: 19 });
  }
  const { mapLayerVisible } = getState();
  if (mapLayerVisible) activeLayer.addTo(map);
}

export function toggleMapLayer() {
  const { mapLayerVisible, activeLayerKey } = getState();
  const next = !mapLayerVisible;
  setState({ mapLayerVisible: next });
  if (next) { setMapLayer(activeLayerKey); }
  else if (activeLayer) { map.removeLayer(activeLayer); }
  const btn = document.getElementById("btn-maplayer");
  if (btn) btn.textContent = `🗺 Bakgrund: ${next ? "PÅ" : "AV"}`;
}

export function buildLayerSel() {
  const sel = document.getElementById("layer-sel");
  if (!sel) return;
  const { activeLayerKey } = getState();
  sel.innerHTML = Object.entries(LAYERS).map(([k, v]) =>
    `<option value="${k}"${k === activeLayerKey ? " selected" : ""}>${v.name}</option>`
  ).join("");
  sel.onchange = e => { setState({ activeLayerKey: e.target.value }); setMapLayer(e.target.value); };
}

export function buildCRSSel() {
  const sel = document.getElementById("crs-sel");
  if (!sel) return;
  const { activeCRS } = getState();
  sel.innerHTML = Object.entries(CRS_DEFS).map(([k, v]) =>
    `<option value="${k}"${k === activeCRS ? " selected" : ""}>${v.name}</option>`
  ).join("");
  sel.onchange = e => { setState({ activeCRS: e.target.value }); updateCRSInfo(); draw(); };
  updateCRSInfo();
}

export function updateCRSInfo() {
  const { activeCRS } = getState();
  const d = CRS_DEFS[activeCRS];
  const el = document.getElementById("crs-info");
  if (el) el.innerHTML = `<b style="color:#4fc3f7">${d.name}</b><br>${d.epsg}`;
}

// ── Storlek & vy ──────────────────────────────────────────────────────────────
export function resizeCanvas() {
  const mc = document.getElementById("map-container");
  const cv = document.getElementById("cv");
  if (mc && cv) { cv.width = mc.offsetWidth; cv.height = mc.offsetHeight; }
  if (map) map.invalidateSize();
}
export function resize() { resizeCanvas(); draw(); }

export function locateMe() {
  if (!navigator.geolocation) { alert("Platsåtkomst ej tillgänglig."); return; }
  navigator.geolocation.getCurrentPosition(
    pos => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
    ()  => alert("Kunde inte hämta plats.")
  );
}

export function resetView() {
  const { pts } = getState();
  if (pts.length === 0) { map.setView([59.33, 18.07], 14); return; }
  try {
    const lls = pts.map(p => ENtoLatLng(p.E, p.N));
    map.fitBounds(L.latLngBounds(lls).pad(0.2));
  } catch { map.setView([59.33, 18.07], 14); }
}

// ── Punkt-rendering ───────────────────────────────────────────────────────────
// rad 1590–1657 exakt
export function drawPt(ctx, pt, sel, showL, labelRects) {
  const { symSize, simResult, selId } = getState();
  const c = PT[pt.type].c;
  const locked = document.getElementById("sym-lock")?.checked || false;
  const mpp = mppAtCenter();
  const baseR = locked ? symSize : (symSize * 0.5 + symSize * 0.5 * (1 / Math.max(0.2, mpp * 0.5)));
  const r = Math.max(4, Math.min(30, baseR)) * (pt.type === "known" ? 1.1 : pt.type === "station" ? 0.9 : 0.7);
  const { x: cx, y: cy } = ptPixel(pt);

  // Simuleringsring
  if (simResult && simResult.ok) {
    const pr = simResult.allPtResults.find(x => x.id === pt.id);
    if (pr) {
      const sigMm = pr.sigPos * 1000;
      const rc = sigMm < 5 ? "#00ff88" : sigMm < 20 ? "#ffcc00" : "#ff5050";
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.strokeStyle = rc + "99"; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  if (sel) {
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = c + "22"; ctx.fill(); ctx.strokeStyle = c + "88"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.lineWidth = sel ? 2.5 : 1.8; ctx.strokeStyle = c; ctx.fillStyle = c + "33";

  if (pt.type === "known") {
    ctx.beginPath(); ctx.moveTo(cx, cy - r*1.5); ctx.lineTo(cx + r*1.3, cy + r*0.9); ctx.lineTo(cx - r*1.3, cy + r*0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + r*0.2, r*0.28, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
  } else if (pt.type === "station") {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r*1.6, cy); ctx.lineTo(cx + r*1.6, cy);
    ctx.moveTo(cx, cy - r*1.6); ctx.lineTo(cx, cy + r*1.6); ctx.lineWidth = 1; ctx.stroke();
  } else if (pt.type === "detail") {
    const s = r * 1.3;
    ctx.beginPath(); ctx.moveTo(cx-s, cy-s); ctx.lineTo(cx+s, cy+s);
    ctx.moveTo(cx+s, cy-s); ctx.lineTo(cx-s, cy+s); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.rect(cx-r, cy-r, r*2, r*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r*0.3, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
  }

  if (!showL) return;

  // Etikett med kollisionsundvikande – rad 1621–1656 exakt
  ctx.font = "bold 13px monospace";
  const tw = ctx.measureText(pt.id).width;
  const lh = 14;
  const offsets = [
    { dx: r*1.6,     dy: -lh*0.4  },
    { dx: -tw-r*1.6, dy: -lh*0.4  },
    { dx: -tw*0.5,   dy: -r*1.8   },
    { dx: -tw*0.5,   dy:  r*1.8+lh },
  ];
  let bx = cx + r*1.6, by = cy - lh*0.4;
  const pad = 2;
  for (const off of offsets) {
    const tx = cx + off.dx, ty = cy + off.dy;
    const rect = { x: tx-pad, y: ty-lh, w: tw+pad*2, h: lh+pad };
    const collision = (labelRects || []).some(r2 =>
      rect.x < r2.x+r2.w && rect.x+rect.w > r2.x && rect.y < r2.y+r2.h && rect.y+rect.h > r2.y
    );
    if (!collision) { bx = tx; by = ty; if (labelRects) labelRects.push(rect); break; }
  }
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(7,13,24,0.7)";
  ctx.strokeText(pt.id, bx, by);
  ctx.fillStyle = "#e8f4fd";
  ctx.fillText(pt.id, bx, by);
  ctx.textAlign = "left";
}

// ── Huvud-rendering ───────────────────────────────────────────────────────────
// rad 1419–1581 exakt; draw() är registrerat som Leaflet map-event callback
export function draw() {
  const cvEl = document.getElementById("cv");
  if (!cvEl || !map) return;
  const ctx = cvEl.getContext("2d");
  const W = cvEl.width, H = cvEl.height;
  ctx.clearRect(0, 0, W, H);

  const state = getState();
  const { pts, meas, simResult, suggestedMeas, selId, selMId, measFrom,
          ellScale, ellipsMode, au } = state;

  const showA = document.getElementById("tga")?.checked ?? true;
  const showD = document.getElementById("tgd")?.checked ?? true;
  const showC = document.getElementById("tgc")?.checked ?? true;
  const showE = document.getElementById("tge")?.checked ?? true;
  const showS = document.getElementById("tgs")?.checked ?? false;
  const showL = document.getElementById("tgl")?.checked ?? true;
  const typeVisible = {
    known:     document.getElementById("tv_known")?.checked     !== false,
    station:   document.getElementById("tv_station")?.checked   !== false,
    new:       document.getElementById("tv_new")?.checked       !== false,
    detail:    document.getElementById("tv_detail")?.checked    !== false,
    simstation:document.getElementById("tv_simstation")?.checked !== false,
  };

  const labelRects = [];
  const fmt = d => au === "grad" ? fG(d) : fD(d);

  // ── Föreslagna mätningar ──
  if (showS && suggestedMeas.length > 0) {
    suggestedMeas.forEach(sg => {
      const p1 = pts.find(p => p.id === sg.from), p2 = pts.find(p => p.id === sg.to);
      if (!p1 || !p2) return;
      const px1 = ptPixel(p1), px2 = ptPixel(p2);
      ctx.beginPath(); ctx.moveTo(px1.x, px1.y); ctx.lineTo(px2.x, px2.y);
      ctx.strokeStyle = "rgba(255,220,50,0.5)"; ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "18px monospace"; ctx.fillStyle = "#ffdc32"; ctx.textAlign = "center";
      ctx.fillText("⚡", (px1.x+px2.x)/2, (px1.y+px2.y)/2);
    });
  }

  // ── Mätningslinjer ──
  if (showC) {
    meas.forEach(m => {
      const md = calcM(m, pts); if (!md) return;
      const { p1, p2, dist } = md;
      if (!typeVisible[p1.type] || !typeVisible[p2.type]) return;
      const isSel = m.id === selMId;
      const hasM  = m.measDist != null || m.measHz != null;
      const obsType = m.obsType || "both";
      const px1 = ptPixel(p1), px2 = ptPixel(p2);

      let lineCol = "rgba(79,195,247,0.5)";
      if (simResult && simResult.ok) {
        const rd = simResult.redund.find(r => r.measId === m.id && r.type === "dist") ||
                   simResult.redund.find(r => r.measId === m.id && r.type === "hz");
        if (rd) lineCol = rColor(rd.ri) + "99";   // ← rColor exakt per krav
      }
      ctx.setLineDash(obsType === "hz_only" ? [8,4] : obsType === "dist_only" ? [2,4] : []);
      ctx.beginPath(); ctx.moveTo(px1.x, px1.y); ctx.lineTo(px2.x, px2.y);
      ctx.strokeStyle = isSel ? "#ffffff" : hasM ? "#ff9900" : lineCol;
      ctx.lineWidth = isSel ? 3 : 2; ctx.stroke(); ctx.setLineDash([]);

      // Riktningspil
      const ang = Math.atan2(px2.y-px1.y, px2.x-px1.x);
      const mx = (px1.x+px2.x)/2, my = (px1.y+px2.y)/2, aw = 9;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(aw,0); ctx.lineTo(0,-aw*0.4); ctx.lineTo(0,aw*0.4); ctx.closePath();
      ctx.fillStyle = isSel ? "#fff" : hasM ? "#ff9900" : "rgba(79,195,247,0.8)"; ctx.fill();
      ctx.restore();

      if (showD) {
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
        ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
        ctx.fillStyle = hasM ? "#ff9900" : "#4fc3f7";
        ctx.strokeStyle = "#00000088"; ctx.lineWidth = 2;
        ctx.strokeText(`${dist.toFixed(3)}m`, 0, -10);
        ctx.fillText(`${dist.toFixed(3)}m`, 0, -10);
        ctx.restore();
      }
      if (showA) {
        const ddx=px2.x-px1.x, ddy=px2.y-px1.y, len=Math.sqrt(ddx*ddx+ddy*ddy)||1, off=16;
        const nx=-ddy/len*off, ny=ddx/len*off;
        ctx.font = "14px monospace"; ctx.fillStyle = "#00ff88"; ctx.textAlign = "center";
        ctx.fillText(fmt(brgEN(p1,p2)), px1.x+ddx*0.28+nx, px1.y+ddy*0.28+ny);
        ctx.fillText(fmt(brgEN(p2,p1)), px2.x-ddx*0.28+nx, px2.y-ddy*0.28+ny);
      }
      if (isSel) {
        ctx.font = "bold 14px monospace"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.fillText(`[${m.id}]`, mx, my+14);
      }
    });
  }

  // ── Felellipser – primärnät ──
  // aSemi/bSemi är i METER; sc = ellScale / mpp ger pixel-skalan
  if (showE && simResult && simResult.ok) {
    const mpp = mppAtCenter();
    const sc = ellScale / mpp;
    const k = (ellipsMode !== "95") ? 1.0 : 2.4477;
    simResult.allPtResults.forEach(pr => {
      if (!typeVisible[pr.type]) return;
      const px = ptPixel(pr);
      const aP = Math.max(pr.aSemi * sc * k, 2);
      const bP = Math.max(pr.bSemi * sc * k, 1);
      const canvasTheta = -pr.theta;
      ctx.save(); ctx.translate(px.x, px.y); ctx.rotate(canvasTheta);
      ctx.beginPath(); ctx.ellipse(0, 0, aP, bP, 0, 0, Math.PI*2);  // ← ctx.ellipse exakt per krav
      ctx.strokeStyle = "#ce93d8"; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      ctx.font = "14px monospace"; ctx.fillStyle = "#ce93d8"; ctx.textAlign = "left";
      ctx.fillText(`σ=${(pr.sigPos*1000*k).toFixed(1)}mm`, px.x+aP+3, px.y);
    });
  }

  // ── Felellipser – simulerade uppställningar ──
  if (showE && simResult && simResult.ok && simResult.simStationResults) {
    const mpp = mppAtCenter();
    const sc = ellScale / mpp;
    const k = (ellipsMode !== "95") ? 1.0 : 2.4477;
    simResult.simStationResults.forEach(ss => {
      if (!ss.ok) return;
      const px = ptPixel(ss);
      const aP = Math.max(ss.aSemi * sc * k, 2);
      const bP = Math.max(ss.bSemi * sc * k, 1);
      const canvasTheta = -ss.theta;
      ctx.save(); ctx.translate(px.x, px.y); ctx.rotate(canvasTheta);
      ctx.beginPath(); ctx.ellipse(0, 0, aP, bP, 0, 0, Math.PI*2);
      ctx.strokeStyle = "#ff6090"; ctx.lineWidth = 2; ctx.setLineDash([6,3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      ctx.font = "bold 14px monospace"; ctx.fillStyle = "#ff6090"; ctx.textAlign = "left";
      ctx.fillText(`σ=${(ss.sigPos*1000*k).toFixed(1)}mm`, px.x+aP+3, px.y);
    });
  }

  // ── measFrom-cirkel ──
  if (measFrom) {
    const fp = pts.find(p => p.id === measFrom);
    if (fp) {
      const px = ptPixel(fp);
      ctx.beginPath(); ctx.arc(px.x, px.y, 22, 0, Math.PI*2);
      ctx.strokeStyle = "#ff9900"; ctx.lineWidth = 2; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ── Punkter ──
  pts.forEach(pt => {
    if (!typeVisible[pt.type]) return;
    drawPt(ctx, pt, pt.id === selId, showL, labelRects);
  });

  // ── Nordpil ──
  ctx.save(); ctx.translate(W-44, 55);
  ctx.strokeStyle="#4fc3f7"; ctx.fillStyle="#4fc3f7"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(0,28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(-7,-10); ctx.lineTo(0,-17); ctx.lineTo(7,-10); ctx.closePath(); ctx.fill();
  ctx.font="bold 20px monospace"; ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.fillText("N",0,-38); ctx.restore();

  // ── Skalstång ──
  const mpp = mppAtCenter();
  const barPx = 100, barM = barPx * mpp;
  const barLabel = barM >= 1000 ? `${(barM/1000).toFixed(1)} km` : `${barM.toFixed(0)} m`;
  ctx.fillStyle="#fff"; ctx.fillRect(16,H-26,barPx,2); ctx.fillRect(16,H-31,2,7); ctx.fillRect(16+barPx,H-31,2,7);
  ctx.font="15px monospace"; ctx.fillStyle="#888"; ctx.textAlign="center"; ctx.fillText(barLabel,16+barPx/2,H-33);

  // UI-callbacks (registreras av main.js i Fas 7)
  if (drawCb.updatePtList) drawCb.updatePtList();
  if (drawCb.renderTab)    drawCb.renderTab();
}

// ── Kartinitalisering ─────────────────────────────────────────────────────────
// rad 1223–1380
export function initMap() {
  map = L.map("leaflet-map", {
    center: [59.33, 18.07], zoom: 14,
    zoomControl: false,
    attributionControl: true,
    doubleClickZoom: false,
    maxZoom: 28
  });

  const { activeLayerKey } = getState();
  setMapLayer(activeLayerKey);

  // Canvas-overlay synkad med kartan
  const cv = document.getElementById("cv");
  function syncCanvas() {
    const mc = document.getElementById("map-container");
    if (mc && cv) { cv.width = mc.offsetWidth; cv.height = mc.offsetHeight; }
    draw();
  }
  map.on("move zoom moveend zoomend", () => requestAnimationFrame(draw));
  map.on("resize", syncCanvas);
  setTimeout(syncCanvas, 100);

  // Koordinatvisning vid musrörelse
  map.on("mousemove", e => {
    const en = latLngToEN(e.latlng);
    const el = document.getElementById("cursor-en");
    if (el) el.textContent = `E: ${en.E.toFixed(2)}  N: ${en.N.toFixed(2)}`;
  });

  // Zoom-visning
  map.on("zoomend", () => {
    const el = document.getElementById("zb");
    if (el) el.textContent = `z${map.getZoom()}`;
  });

  // Registrera alla klick/drag-interaktioner
  initInteractions(map);

  buildLayerSel();
  buildCRSSel();
}
