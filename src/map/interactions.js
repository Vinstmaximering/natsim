// Kopierad exakt från NätSim_Beta_2.html rad 1251–1380.
// Klick, dubbelklick, högerklick, drag – alla Leaflet map-events.
// UI-callbacks (openEditPt, openMM, buildTools, setTab, showToast) registreras
// via setInteractionCallbacks() av main.js i Fas 7.
import L from 'leaflet';
import { getState, setState } from '../state/store.js';
import { INSTRUMENTS, PT } from '../core/constants.js';
import { saveUndo } from '../state/undo.js';
import { ptPixel, latLngToEN, ENtoLatLng, draw } from './leaflet-setup.js';
import { isDrawing, handleMapClick, completeDraw, cancelDraw, updateMousePos } from './obstacle-drawing.js';

// Touch-detection – används för att lägga till touch-specifika gester
export const isTouch = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// ── Callbacks för UI-funktioner (registreras i Fas 7 via setInteractionCallbacks) ──
const cb = {
  openEditPt: null,   // rad 1362, 1369: dubbelklick + högerklick → openEditPt(id)
  openMM:     null,   // rad 1313: öppna mätningsmodal
  buildTools: null,   // rad 1300–1305: uppdatera toolbarens knappar
  setTab:     null,   // rad 1313: byt flik
  showToast:  null,   // rad 1273, 1333, 1342, 1349: notiser
};
export function setInteractionCallbacks(callbacks) { Object.assign(cb, callbacks); }

// ── near – hitta närmaste punkt inom pixelradie – rad 587–589 exakt ──
export function near(cx, cy, t = 20) {
  const { pts } = getState();
  return pts.find(p => {
    const px = ptPixel(p);
    return Math.abs(px.x - cx) < t && Math.abs(px.y - cy) < t;
  });
}

// ── Registrera alla Leaflet-events på kartinstansen ──
export function initInteractions(map) {
  let dragPt   = null;
  let dragMoved = false;

  // ── Drag – rad 1254–1290 ──
  map.on("mousedown", e => {
    if (isDrawing()) return; // hindra punkt-drag under ritläge
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 18);
    const { tool } = getState();
    if (n && tool !== "measure" && tool !== "pan") {
      dragPt = n.id;
      dragMoved = false;
      map.dragging.disable();
      L.DomEvent.stopPropagation(e);
    }
  });

  map.on("mousemove", e => {
    // Uppdatera förhandsvisning under hinder-ritning
    if (isDrawing()) {
      const px = map.latLngToContainerPoint(e.latlng);
      updateMousePos(e.latlng, px);
      draw();
    }
    if (!dragPt) return;
    if (!dragMoved) {
      const { meas } = getState();
      saveUndo(`Flytta ${dragPt}`);
      const nMeas = meas.filter(m => m.from === dragPt || m.to === dragPt).length;
      if (nMeas > 0 && cb.showToast)
        cb.showToast(`⚠ Flyttar ${dragPt} – ${nMeas} mätning(ar) kopplad(e). Simuleringen nollställs.`, "#ff9900");
    }
    dragMoved = true;
    const en = latLngToEN(e.latlng);
    const { pts } = getState();
    const pt = pts.find(p => p.id === dragPt);
    if (pt) { pt.E = en.E; pt.N = en.N; draw(); }
  });

  map.on("mouseup", () => {
    if (dragPt) {
      map.dragging.enable();
      dragPt = null;
      dragMoved = false;
      setState({ simResult: null });
      draw();
    }
  });

  // ── Klick – rad 1293–1356 ──
  map.on("click", e => {
    if (dragMoved) { dragMoved = false; return; }

    // Hinder-ritning: intercepta klick
    if (isDrawing()) {
      const result = handleMapClick(e.latlng);
      if (result.done) {
        // Linje-ritning klar efter 2:a punkt
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
      }
      draw();
      return;
    }
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 18);
    const { tool, measFrom, meas, pts, defaultInstr, nMid, nId, simResult } = getState();

    if (tool === "measure") {
      if (!n) return;
      if (!measFrom) {
        setState({ measFrom: n.id });
        if (cb.buildTools) cb.buildTools();
        draw();
      } else {
        if (n.id === measFrom) { setState({ measFrom: null }); if (cb.buildTools) cb.buildTools(); draw(); return; }
        if (meas.find(m => m.from === measFrom && m.to === n.id)) {
          alert(`Mätning ${measFrom}→${n.id} finns redan.`);
          setState({ measFrom: null }); if (cb.buildTools) cb.buildTools(); draw(); return;
        }
        const pr = INSTRUMENTS[defaultInstr] || INSTRUMENTS["ts16_1"];
        const nm = { id:`M${nMid}`, from:measFrom, to:n.id, measDist:null, measHz:null,
          instrPreset:defaultInstr, sigDist_mm:pr.sigDmm, sigDist_ppm:pr.sigDppm, sigHz_mgon:pr.sigHz, numSatser:3 };
        saveUndo(`Lägg till mätning ${nm.id}`);
        const newMeas = [...meas, nm];
        setState({ meas: newMeas, nMid: nMid + 1, measFrom: null, selMId: nm.id, simResult: null });
        if (cb.buildTools) cb.buildTools();
        if (cb.setTab) cb.setTab("meas");
        if (cb.openMM) setTimeout(() => cb.openMM(nm.id), 80);
      }
      return;
    }

    if (tool === "pan") {
      if (n) { setState({ selId: n.id }); draw(); }
      return;
    }

    if (n) { setState({ selId: n.id }); draw(); return; }

    // Kontroll: ny punkt nära befintlig med mätningar
    const { pts: ptsNow, meas: measNow } = getState();
    const nearby = ptsNow.find(p => {
      const ppx = ptPixel(p);
      return Math.abs(ppx.x - px.x) < 30 && Math.abs(ppx.y - px.y) < 30;
    });
    if (nearby) {
      const nMeasCount = measNow.filter(m => m.from === nearby.id || m.to === nearby.id).length;
      if (nMeasCount > 0) {
        if (cb.showToast) cb.showToast(`⚠ Klick nära ${nearby.id} (${nMeasCount} mätningar). Valde punkten istället.`, "#ff5050");
        setState({ selId: nearby.id }); draw(); return;
      }
    }

    // Lägg ny punkt på kartkoordinat
    const en = latLngToEN(e.latlng);
    const { nId: nIdNow, pts: ptsCur, tool: toolNow, simResult: srNow } = getState();

    if (toolNow === "simstation") {
      if (!srNow || !srNow.ok) {
        if (cb.showToast) cb.showToast("⚠ Kör simuleringen först innan du lägger till en simulerad uppställning.", "#ff5050");
        return;
      }
      const id = `SS${nIdNow}`;
      saveUndo(`Lägg till simulerad uppställning ${id}`);
      setState({ pts: [...ptsCur, { id, type:"simstation", E:en.E, N:en.N, H:0 }], nId: nIdNow + 1,
                 selId: id, suggestedMeas: [] });
      if (cb.showToast) cb.showToast(`🔴 ${id} tillagd – öppna punkten och lägg till mätningar mot byggnätspunkter`, "#ff6090");
      draw(); return;
    }

    const id = `${PT[toolNow]?.s || "P"}${nIdNow}`;
    saveUndo(`Lägg till ${id}`);
    setState({ pts: [...ptsCur, { id, type:toolNow, E:en.E, N:en.N, H:0 }],
               nId: nIdNow + 1, selId: id, simResult: null, suggestedMeas: [] });
    draw();
  });

  // ── Dubbelklick → avsluta polygon-ritning eller openEditPt ──
  map.on("dblclick", e => {
    if (isDrawing()) {
      const ok = completeDraw();
      if (ok) {
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
      }
      draw();
      return;
    }
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 24);
    if (n && cb.openEditPt) cb.openEditPt(n.id);
  });

  // ── Högerklick → openEditPt – rad 1365–1370 exakt ──
  map.on("contextmenu", e => {
    if (isDrawing()) { cancelDraw(); setState({ tool: 'pan' }); if (cb.buildTools) cb.buildTools(); draw(); return; }
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 24);
    if (n) { e.originalEvent.preventDefault(); if (cb.openEditPt) cb.openEditPt(n.id); }
  });

  // ── Tangentbord: Esc avbryter, Enter slutför hinder-ritning ──
  document.addEventListener('keydown', e => {
    if (!isDrawing()) return;
    if (e.key === 'Escape') {
      cancelDraw();
      setState({ tool: 'pan' });
      if (cb.buildTools) cb.buildTools();
      draw();
    } else if (e.key === 'Enter') {
      const ok = completeDraw();
      if (ok) { setState({ tool: 'pan' }); if (cb.buildTools) cb.buildTools(); }
      draw();
    }
  });

  // ── Touch-gester: double-tap → openEditPt, long-press → openEditPt ──────────
  if (isTouch) {
    const el = map.getContainer();
    let _lpTimer   = null;   // long-press timer
    let _lastTap   = 0;      // tidpunkt för förra tappet
    let _lastTapXY = null;   // position för förra tappet (container-koordinater)
    let _tMoved    = false;  // fingret har rört sig > 10 px

    const _cancelLP = () => { clearTimeout(_lpTimer); _lpTimer = null; };

    el.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) { _cancelLP(); return; }
      const t    = e.touches[0];
      const rect = el.getBoundingClientRect();
      const cx   = t.clientX - rect.left;
      const cy   = t.clientY - rect.top;
      _tMoved = false;

      // ── Long-press (500 ms) → openEditPt, ersätter högerklick/contextmenu ──
      _cancelLP();
      _lpTimer = setTimeout(() => {
        if (_tMoved) return;
        const n = near(cx, cy, 28);
        if (n && cb.openEditPt) cb.openEditPt(n.id);
      }, 500);

      // ── Double-tap (< 300 ms, < 30 px) → openEditPt, ersätter dblclick ────
      const now = Date.now();
      if (_lastTapXY && (now - _lastTap) < 300) {
        const dx = Math.abs(cx - _lastTapXY.cx);
        const dy = Math.abs(cy - _lastTapXY.cy);
        if (dx < 30 && dy < 30) {
          _cancelLP();
          const n = near(cx, cy, 28);
          if (n && cb.openEditPt) cb.openEditPt(n.id);
          _lastTapXY = null; _lastTap = 0;
          return;
        }
      }
      _lastTap   = now;
      _lastTapXY = { cx, cy };
    }, { passive: true });

    el.addEventListener("touchmove", e => {
      if (!_lastTapXY) return;
      const t    = e.touches[0];
      const rect = el.getBoundingClientRect();
      const dx   = Math.abs(t.clientX - rect.left - _lastTapXY.cx);
      const dy   = Math.abs(t.clientY - rect.top  - _lastTapXY.cy);
      if (dx > 10 || dy > 10) { _tMoved = true; _cancelLP(); }
    }, { passive: true });

    el.addEventListener("touchend",    _cancelLP, { passive: true });
    el.addEventListener("touchcancel", _cancelLP, { passive: true });
  }
}
