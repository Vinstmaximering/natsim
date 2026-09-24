// Kopierad exakt från NätSim_Beta_2.html rad 1251–1380.
// Klick, dubbelklick, högerklick, drag – alla Leaflet map-events.
// UI-callbacks (openEditPt, openMM, buildTools, setTab, showToast) registreras
// via setInteractionCallbacks() av main.js i Fas 7.
import L from 'leaflet';
import { getState, setState, subscribe } from '../state/store.js';
import { INSTRUMENTS, PT } from '../core/constants.js';
import { saveUndo } from '../state/undo.js';
import { ptPixel, latLngToEN, ENtoLatLng, draw } from './leaflet-setup.js';
import { isDrawing, handleMapClick, completeDraw, cancelDraw, updateMousePos } from './obstacle-drawing.js';
import { clearObstacleSelection, getObstacles } from '../state/obstacles.js';
import {
  isDrawingVisual, handleVisualMapClick, cancelVisualDraw,
  updateVisualMousePos, hasPendingChain, breakVisualChain,
  getVisualDrawMode, hasPendingArea, discardPendingArea, undoLastAreaVertex,
  completeVisualArea,
} from './visual-drawing.js';
import { syncLinkedObstacles, isVisualObjVisible } from '../state/visual.js';
import { hitTestVisualPt, hitTestVisualLine, hitTestVisualArea } from './visual-canvas.js';
import {
  beginSelectDrag, updateSelectDrag, endSelectDrag, cancelSelectDrag,
  isSelectDragging, selectDragMoved, clickSelect,
} from './select-area.js';
import { initPanGestures } from './pan-gestures.js';
import {
  hitTestHandle, hitTestEdge, hitTestObstacle,
  startNodeDrag, updateNodeDrag, endNodeDrag, isDraggingNode,
  insertNode, deleteNode,
} from './obstacle-editing.js';

// Touch-detection – används för att lägga till touch-specifika gester
export const isTouch = (typeof window !== 'undefined') &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// ── Callbacks för UI-funktioner (registreras i Fas 7 via setInteractionCallbacks) ──
const cb = {
  openEditPt:    null,   // rad 1362, 1369: dubbelklick + högerklick → openEditPt(id)
  openMM:        null,   // rad 1313: öppna mätningsmodal
  buildTools:    null,   // rad 1300–1305: uppdatera toolbarens knappar
  setTab:        null,   // rad 1313: byt flik
  showToast:     null,   // rad 1273, 1333, 1342, 1349: notiser
  renderObsPanel: null,  // obstacle-panel re-render efter selektion ändras
  renderTab:     null,   // höger-panel re-render efter mätnings-selektion ändras
  openVisualMenu: null,  // högerklick på visuellt objekt → kontextmeny (Etapp D4)
  openEditVisual: null,  // dubbelklick på visuellt objekt → redigeringsdialog
};

// En sluten yta: varna om den korsar sig själv (Lager-verktyg Etapp 3).
function _areaDone(r) {
  if (r?.ok && r.selfIntersecting && cb.showToast)
    cb.showToast('⚠ Ytan korsar sig själv – ingen area visas. Flytta eller ta bort ett hörn.', '#ffb74d');
  else if (r?.reason === 'few' && cb.showToast)
    cb.showToast('En yta behöver minst tre hörn', '#7090a8');
}
export function setInteractionCallbacks(callbacks) { Object.assign(cb, callbacks); }

// ── near – hitta närmaste punkt inom pixelradie – rad 587–589 exakt ──
export function near(cx, cy, t = 20) {
  const { pts } = getState();
  return pts.find(p => {
    const px = ptPixel(p);
    return Math.abs(px.x - cx) < t && Math.abs(px.y - cy) < t;
  });
}

// ── nearMeas – hitta mätningslinje inom pixel-tröskel (punkt-till-segment) ──
export function nearMeas(cx, cy, t = 8) {
  const { meas, pts } = getState();
  return meas.find(m => {
    const p1 = pts.find(p => p.id === m.from), p2 = pts.find(p => p.id === m.to);
    if (!p1 || !p2) return false;
    const px1 = ptPixel(p1), px2 = ptPixel(p2);
    const dx = px2.x - px1.x, dy = px2.y - px1.y, len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(cx - px1.x, cy - px1.y) < t;
    const u = Math.max(0, Math.min(1, ((cx - px1.x)*dx + (cy - px1.y)*dy) / len2));
    return Math.hypot(cx - (px1.x + u*dx), cy - (px1.y + u*dy)) < t;
  });
}

// ── Registrera alla Leaflet-events på kartinstansen ──
export function initInteractions(map) {
  let dragPt        = null;
  let dragMoved     = false;
  let nodeDragActive = false;  // true när ett hörn-handtag dras
  // Markera område: klicket som följer på en dragning ska inte också tolkas
  // som ett klick på ett objekt. Efter en fingerdragning kommer webbläsarens
  // efterhärmade mushändelser – de spärras en kort stund.
  let selSuppressClick = false;
  let selSuppressUntil = 0;
  const selectTool = () => getState().tool === 'select-area';

  // Mittenknappen och mellanslag + drag panorerar i alla verktyg.
  initPanGestures(map);

  // Slå av Leaflet's dubbelklicks-zoom när ett hinder är markerat,
  // annars blockerar zoomen dblclick → kant-infogning. Samma sak under
  // ytritning (Lager-verktyg Etapp 3): dubbelklicket sluter ytan och ska inte
  // samtidigt zooma kartan.
  subscribe(state => {
    if (state.selObsId || state.tool === 'visual-area') { map.doubleClickZoom?.disable(); }
    else                                                 { map.doubleClickZoom?.enable();  }
  });

  // ── Drag – rad 1254–1290 ──
  map.on("mousedown", e => {
    if (isDrawing() || isDrawingVisual()) return; // hindra drag under ritläge

    // Markera område: vänsterknappen börjar en rektangel. Kartans panorering
    // är redan avslagen av setTool() medan verktyget är valt.
    if (selectTool()) {
      if ((e.originalEvent?.button ?? 0) !== 0 || Date.now() < selSuppressUntil) return;
      const px = map.latLngToContainerPoint(e.latlng);
      beginSelectDrag(px.x, px.y);
      L.DomEvent.stopPropagation(e);
      return;
    }

    // Prioritet 1: hörn-drag på markerat hinder
    const { selObsId } = getState();
    if (selObsId) {
      const obs = getObstacles().find(o => o.id === selObsId);
      if (obs) {
        const px   = map.latLngToContainerPoint(e.latlng);
        const ptIdx = hitTestHandle(px.x, px.y, obs, map, ENtoLatLng);
        if (ptIdx !== null) {
          startNodeDrag(selObsId, ptIdx);
          nodeDragActive = true;
          dragMoved = false;
          map.dragging.disable();
          L.DomEvent.stopPropagation(e);
          return;
        }
      }
    }

    // Prioritet 2: punkt-drag (befintligt beteende)
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
    if (isSelectDragging()) {
      const px = map.latLngToContainerPoint(e.latlng);
      updateSelectDrag(px.x, px.y);
      draw();
      return;
    }

    // Uppdatera förhandsvisning under hinder-ritning
    if (isDrawing()) {
      const px = map.latLngToContainerPoint(e.latlng);
      updateMousePos(e.latlng, px);
      draw();
    }

    // Förhandsvisning under ritning av visuella objekt
    if (isDrawingVisual()) {
      const px = map.latLngToContainerPoint(e.latlng);
      updateVisualMousePos(e.latlng, px);
      draw();
    }

    // Hörn-drag: uppdatera position + snap
    if (nodeDragActive) {
      const px = map.latLngToContainerPoint(e.latlng);
      updateNodeDrag(e.latlng, px, map, ENtoLatLng, latLngToEN);
      dragMoved = true; // förhindra att efterföljande click tolkas som kartklick
      draw();
      return;
    }

    // Cursor-feedback: hover över handtag/kant på markerat hinder
    if (!dragPt) {
      const { selObsId } = getState();
      const cvEl = document.getElementById('cv');
      if (selObsId && cvEl) {
        const obs = getObstacles().find(o => o.id === selObsId);
        if (obs) {
          const px   = map.latLngToContainerPoint(e.latlng);
          const ptIdx = hitTestHandle(px.x, px.y, obs, map, ENtoLatLng);
          if (ptIdx !== null) { cvEl.style.cursor = 'move'; }
          else {
            const edge = hitTestEdge(px.x, px.y, obs, map, ENtoLatLng);
            cvEl.style.cursor = edge ? 'crosshair' : '';
          }
        } else { cvEl.style.cursor = ''; }
      } else if (cvEl) { cvEl.style.cursor = ''; }
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
    if (pt) {
      pt.E = en.E; pt.N = en.N;
      // En visuell linje kan vara fäst i nätpunkten och i sin tur styra en
      // vägg – projektionen måste följa med under draget.
      syncLinkedObstacles();
      draw();
    }
  });

  // Markera område: släppt musknapp avslutar rektangeln. Släpps den utanför
  // kartan når händelsen bara dokumentet – därav båda lyssnarna.
  const endSelect = ev => {
    if (!isSelectDragging()) return;
    if (endSelectDrag(ev)) selSuppressClick = true;
    draw();
  };
  map.on("mouseup", e => endSelect(e.originalEvent));
  document.addEventListener('mouseup', endSelect);

  map.on("mouseup", () => {
    // Avsluta hörn-drag
    if (nodeDragActive) {
      endNodeDrag();
      nodeDragActive = false;
      map.dragging.enable();
      draw();
      return;
    }

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

    // Ritning av visuella objekt: intercepta klick. Läget står kvar tills
    // användaren avslutar med Esc eller högerklick.
    if (isDrawingVisual()) {
      _areaDone(handleVisualMapClick(e.latlng));
      draw();
      return;
    }

    // Markera område: klick utan drag markerar ett enskilt objekt.
    if (selectTool()) {
      if (selSuppressClick || Date.now() < selSuppressUntil) { selSuppressClick = false; return; }
      const cp = map.latLngToContainerPoint(e.latlng);
      clickSelect(cp.x, cp.y, e.originalEvent);
      draw();
      return;
    }

    // Hinder-ritning: intercepta klick
    if (isDrawing()) {
      const result = handleMapClick(e.latlng);
      if (result.done) {
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
      }
      draw();
      return;
    }

    const px  = map.latLngToContainerPoint(e.latlng);
    const n   = near(px.x, px.y, 18);
    const { tool, measFrom, meas, pts, defaultInstr, nMid, nId, simResult, selObsId } = getState();

    // ── Measure-verktyg (kräver träff på mätpunkt) ──
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

    // ── Träff på mätpunkt (högst prioritet för pan och övriga verktyg) ──
    if (n) { setState({ selId: n.id }); draw(); return; }

    // ── Träff på hinder-yta → välj hindret ──
    const hitObs = getObstacles().find(obs => hitTestObstacle(px.x, px.y, obs, map, ENtoLatLng));
    // Ett hinder som projiceras ur en synlig yta ("Blockerar sikt") redigeras
    // genom ytan: klicket markerar ytan och visar dess egenskapskort.
    const ägare = hitObs && (getState().visualAreas || [])
      .find(a => a.linkedObsId === hitObs.id && isVisualObjVisible(a));
    if (ägare) {
      if (selObsId) { clearObstacleSelection(); if (cb.renderObsPanel) cb.renderObsPanel(); }
      setState({ selVisualId: ägare.id, visualSelection: [] });
      draw();
      return;
    }
    if (hitObs) {
      if (selObsId !== hitObs.id) {
        setState({ selObsId: hitObs.id });
        if (cb.renderObsPanel) cb.renderObsPanel();
        draw();
      }
      return;
    }

    // ── Träff på mätningslinje → välj mätning ──
    const hitM = nearMeas(px.x, px.y, 8);
    if (hitM) {
      setState({ selMId: hitM.id });
      if (cb.renderTab) cb.renderTab();
      draw();
      return;
    }

    // ── Träff på visuellt objekt → markera det (lägst prioritet: mätdata går
    // alltid före visuell dokumentation) ──
    const stateNow = getState();
    // Ytor träffas bara i Panorera: med ett punktverktyg ska ett klick inuti
    // en yta lägga punkten, inte markera ytan.
    const hitV = hitTestVisualPt(px.x, px.y, stateNow, map, ENtoLatLng)
              || hitTestVisualLine(px.x, px.y, stateNow, map, ENtoLatLng)
              || (tool === 'pan' ? hitTestVisualArea(px.x, px.y, stateNow, map, ENtoLatLng) : null);
    if (hitV) {
      // Ett enskilt val ersätter en markering från Markera område.
      setState({ selVisualId: stateNow.selVisualId === hitV.id ? null : hitV.id, visualSelection: [] });
      draw();
      return;
    }
    if (stateNow.selVisualId) setState({ selVisualId: null });

    // ── Ingen träff → rensa hinder-selektion ──
    if (selObsId) { clearObstacleSelection(); if (cb.renderObsPanel) cb.renderObsPanel(); }

    // Pan-läge: ingen ny punkt
    if (tool === "pan") return;

    // ── Kontroll: ny punkt nära befintlig med mätningar ──
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

    // ── Lägg ny punkt på kartkoordinat ──
    const en = latLngToEN(e.latlng);
    const { nId: nIdNow, pts: ptsCur, tool: toolNow, simResult: srNow } = getState();

    if (toolNow === "simstation") {
      if (!srNow || !srNow.ok) {
        if (cb.showToast) cb.showToast("⚠ Beräkna simuleringen först innan du lägger till en simulerad station.", "#ff5050");
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

  // ── Dubbelklick → infoga hörn på kant, avsluta ritning, eller openEditPt ──
  map.on("dblclick", e => {
    // Dubbelklick sluter en yta under ritning.
    if (isDrawingVisual()) {
      if (getVisualDrawMode() === 'area') { _areaDone(completeVisualArea()); draw(); }
      return;
    }
    if (isDrawing()) {
      const ok = completeDraw();
      if (ok) {
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
      }
      draw();
      return;
    }
    // Infoga hörn på kant av markerat hinder
    const { selObsId } = getState();
    if (selObsId) {
      const obs = getObstacles().find(o => o.id === selObsId);
      if (obs) {
        const px   = map.latLngToContainerPoint(e.latlng);
        const edge = hitTestEdge(px.x, px.y, obs, map, ENtoLatLng);
        if (edge) {
          insertNode(selObsId, edge.edgeIndex, edge.insertPoint);
          draw();
          return;
        }
      }
    }
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 24);
    if (n && cb.openEditPt) { cb.openEditPt(n.id); return; }

    // Dubbelklick på visuellt objekt → redigeringsdialog
    const st   = getState();
    const hitV = hitTestVisualPt(px.x, px.y, st, map, ENtoLatLng)
              || hitTestVisualLine(px.x, px.y, st, map, ENtoLatLng)
              || hitTestVisualArea(px.x, px.y, st, map, ENtoLatLng);
    if (hitV && cb.openEditVisual) cb.openEditVisual(hitV.id);
  });

  // ── Högerklick → ta bort hörn på hinder, annars openEditPt ──
  map.on("contextmenu", e => {
    if (isDrawing()) { cancelDraw(); setState({ tool: 'pan' }); if (cb.buildTools) cb.buildTools(); draw(); return; }

    // Högerklick avslutar ritläget för visuella objekt. Har en linjekedja
    // påbörjats bryts först kedjan, så att ett andra högerklick lämnar läget.
    if (isDrawingVisual()) {
      e.originalEvent.preventDefault();
      if (hasPendingChain()) { breakVisualChain(); draw(); return; }
      if (hasPendingArea())  { discardPendingArea(); draw(); return; }
      cancelVisualDraw();
      setState({ tool: 'pan' });
      if (cb.buildTools) cb.buildTools();
      draw();
      return;
    }
    // Ta bort hörn på markerat hinder
    const { selObsId } = getState();
    if (selObsId) {
      const obs = getObstacles().find(o => o.id === selObsId);
      if (obs) {
        const px    = map.latLngToContainerPoint(e.latlng);
        const ptIdx = hitTestHandle(px.x, px.y, obs, map, ENtoLatLng);
        if (ptIdx !== null) {
          e.originalEvent.preventDefault();
          deleteNode(selObsId, ptIdx, cb.showToast);
          draw();
          return;
        }
      }
    }
    const px = map.latLngToContainerPoint(e.latlng);
    const n  = near(px.x, px.y, 24);
    if (n) { e.originalEvent.preventDefault(); if (cb.openEditPt) cb.openEditPt(n.id); return; }

    // Högerklick på visuellt objekt → kontextmeny (Etapp D4)
    const st   = getState();
    const hitV = hitTestVisualLine(px.x, px.y, st, map, ENtoLatLng)
              || hitTestVisualPt(px.x, px.y, st, map, ENtoLatLng)
              || hitTestVisualArea(px.x, px.y, st, map, ENtoLatLng);
    if (hitV && cb.openVisualMenu) {
      e.originalEvent.preventDefault();
      setState({ selVisualId: hitV.id });
      draw();
      cb.openVisualMenu(hitV.id, e.originalEvent.clientX, e.originalEvent.clientY);
    }
  });

  // ── Tangentbord: Esc/Enter – prioritetsordning: ritläge > hinder > mätning ──
  document.addEventListener('keydown', e => {
    // Backspace under ytritning tar bort senaste hörnet – inte när man skriver
    // i ett fält, där Backspace ska sudda text.
    if (e.key === 'Backspace' && hasPendingArea()) {
      const a = document.activeElement;
      if (a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable)) return;
      e.preventDefault();
      undoLastAreaVertex();
      draw();
      return;
    }
    if (e.key === 'Escape') {
      // En påbörjad yta kastas först; nästa Escape lämnar ytläget.
      if (isSelectDragging()) {
        cancelSelectDrag();
        draw();
      } else if (hasPendingArea()) {
        discardPendingArea();
        draw();
      } else if (isDrawingVisual()) {
        cancelVisualDraw();
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
        draw();
      } else if (isDrawing()) {
        cancelDraw();
        setState({ tool: 'pan' });
        if (cb.buildTools) cb.buildTools();
        draw();
      } else if ((getState().visualSelection || []).length) {
        // Esc avmarkerar det som Markera område valt.
        setState({ visualSelection: [] });
        draw();
      } else if (getState().selVisualId) {
        setState({ selVisualId: null });
        draw();
      } else if (getState().selObsId) {
        clearObstacleSelection();
        if (cb.renderObsPanel) cb.renderObsPanel();
        draw();
      } else if (getState().selMId) {
        setState({ selMId: null });
        if (cb.renderTab) cb.renderTab();
        draw();
      }
    } else if (e.key === 'Enter' && isDrawing()) {
      const ok = completeDraw();
      if (ok) { setState({ tool: 'pan' }); if (cb.buildTools) cb.buildTools(); }
      draw();
    }
  });

  // ── Markera område med finger ────────────────────────────────────────────
  // Ett finger ritar rektangeln (kartans enfingerpanorering är av medan
  // verktyget är valt); två fingrar avbryter den och lämnas åt Leaflets
  // touchZoom, som både zoomar och flyttar kartan. Ett tryck utan drag blir
  // webbläsarens vanliga klick och markerar ett enskilt objekt.
  {
    const cont = map.getContainer();
    const at = t => { const r = cont.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    cont.addEventListener('touchstart', e => {
      if (!selectTool()) return;
      if (e.touches.length === 1) { const p = at(e.touches[0]); beginSelectDrag(p.x, p.y); }
      else { cancelSelectDrag(); draw(); }
    }, { passive: true });
    cont.addEventListener('touchmove', e => {
      if (!isSelectDragging() || e.touches.length !== 1) return;
      const p = at(e.touches[0]);
      updateSelectDrag(p.x, p.y);
      if (e.cancelable) e.preventDefault();
      draw();
    }, { passive: false });
    const touchEnd = e => {
      if (!isSelectDragging()) return;
      if (selectDragMoved()) {
        endSelectDrag({});
        selSuppressUntil = Date.now() + 700;
        if (e.cancelable) e.preventDefault();
      } else {
        cancelSelectDrag();   // ett tryck – klicket som följer markerar
      }
      draw();
    };
    cont.addEventListener('touchend', touchEnd, { passive: false });
    cont.addEventListener('touchcancel', () => { cancelSelectDrag(); draw(); });
  }

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
