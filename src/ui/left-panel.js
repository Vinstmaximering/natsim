// rad 3240–3262: updatePtList + left-panel IO-knappar
import { getState, setState } from '../state/store.js';
import { PT } from '../core/constants.js';
import { draw, ENtoLatLng } from '../map/leaflet-setup.js';
import { openEditPt } from './modals.js';

export function updatePtList() {
  const { pts, meas, selId } = getState();
  const pth  = document.getElementById("pth");
  const list = document.getElementById("ptl");
  if (!pth || !list) return;
  pth.textContent = `PUNKTER (${pts.length})`;
  [...list.querySelectorAll(".pti")].forEach(e => e.remove());
  pts.forEach(pt => {
    const c  = PT[pt.type]?.c || "#888";
    const mc = meas.filter(m => m.from === pt.id || m.to === pt.id).length;
    const d  = document.createElement("div");
    d.className = "pti" + (pt.id === selId ? " sel" : "");
    d.style.borderLeftColor = pt.id === selId ? c : "transparent";
    const typeLabel = (PT[pt.type]?.l || pt.type) + (pt.type === "known" && pt.isStation ? " + uppst." : "");
    d.innerHTML = `<span><span style="color:${c};margin-right:4px;">●</span><b style="font-size:12px">${pt.id}</b><span style="font-size:11px;color:#6080a0;margin-left:4px">${typeLabel}</span></span><span style="font-size:11px;color:#8aa8c0">${mc ? mc+"×" : ""}</span>`;
    d.onclick = () => {
      setState({ selId: pt.id });
      import('../map/leaflet-setup.js').then(({ map: m }) => {
        if (m) { try { m.setView(ENtoLatLng(pt.E, pt.N), m.getZoom()); } catch {} }
      });
      draw();
    };
    d.ondblclick = () => openEditPt(pt.id);
    list.appendChild(d);
  });
}

export function initLeftPanel() {
  // Exportera .geo
  document.querySelector("button[onclick*='exportGeoFile']")?.addEventListener
    ? null : null; // hanteras av IO-moduler i Fas 6

  // Ctrl+Z – globalt
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      if (["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      import('../state/undo.js').then(m => m.undo());
    }
  });
}
