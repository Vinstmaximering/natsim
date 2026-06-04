// Hinder-flik i högerpanelen: lista, lägg till, ta bort.
// Knapparna "🏢 Byggnad" och "━ Vägg" sätter ritverktyg via setTool().
import { getState, setState } from '../state/store.js';
import { removeObstacle, clearObstacleSelection } from '../state/obstacles.js';
import { draw }               from '../map/leaflet-setup.js';
import { setTool }            from './toolbar.js';

export function renderObstaclePanel() {
  const tc = document.getElementById('tc');
  if (!tc) return;
  const { obstacles = [], selObsId } = getState();

  tc.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:10px;">
      <button class="tb" onclick="window._startObsPolygon()"
        style="font-size:11px;--c:#ff9900;color:#ff9900;">🏢 Byggnad</button>
      <button class="tb" onclick="window._startObsLine()"
        style="font-size:11px;--c:#8aa8c0;color:#8aa8c0;">━ Vägg</button>
      <button class="tb" onclick="window._obsFromOSM()"
        style="font-size:11px;--c:#4fc3f7;color:#4fc3f7;"
        title="Importera byggnader från OpenStreetMap">📡 OSM</button>
    </div>
    ${obstacles.length === 0
      ? `<div style="color:#7090a8;font-size:12px;text-align:center;padding:24px 0;line-height:1.8;">
           Inga hinder ännu.<br>
           Rita en byggnad (polygon) eller<br>vägg (linje) med knapparna ovan.
         </div>`
      : obstacles.map(obs => `
          <div class="lc"
               style="${obs.id === selObsId ? 'border-color:#ff9900;' : ''}cursor:pointer;"
               onclick="window._selObs('${obs.id}')">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#e8f4fd;font-size:13px;">
                ${obs.type === 'polygon' ? '🏢' : '━'}
                <span style="margin-left:4px;">${obs.label || obs.id}</span>
              </span>
              <div style="display:flex;align-items:center;gap:4px;">
                <span style="font-size:10px;color:#6080a0;">${obs.points.length} pt</span>
                <button onclick="event.stopPropagation();window._delObs('${obs.id}')"
                  style="padding:2px 6px;font-size:11px;background:transparent;border:1px solid #3a1010;color:#ff5050;border-radius:2px;cursor:pointer;">🗑</button>
              </div>
            </div>
          </div>`).join('')
    }
    <div style="margin-top:10px;font-size:10px;color:#40607880;line-height:1.6;">
      Obs: hinder påverkar inte simuleringen förrän Fas 3.<br>
      Hinder sparas ej i projekt förrän Fas 5.
    </div>`;
}

export function initObstaclePanel() {
  window._startObsPolygon = () => { setTool('obstacle-polygon'); };
  window._startObsLine    = () => { setTool('obstacle-line'); };
  window._obsFromOSM = () => {
    import('../io/osm-import.js').then(m => m.importOSMForCurrentView());
  };
  window._selObs = id => {
    const { selObsId } = getState();
    if (selObsId === id) { clearObstacleSelection(); }
    else { setState({ selObsId: id }); }
    draw();
    renderObstaclePanel();
  };
  window._delObs = id => {
    removeObstacle(id);
    draw();
    renderObstaclePanel();
  };
}
