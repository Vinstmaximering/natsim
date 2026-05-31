// Kopierad exakt från NätSim_Beta_2.html rad 3590–3613 + rad 3974 (SAVE_KEY).
// Strukturella ändringar: läser/skriver via store istället för globaler.
import { getState, setState } from './store.js';

export const SAVE_KEY = "stomnät_autosave";   // rad 3974 exakt

let _asTimer = null;

// Throttled autosave – 1500 ms, matchar rad 3592–3604
export function saveAutosave() {
  clearTimeout(_asTimer);
  _asTimer = setTimeout(() => {
    try {
      const { pts, meas, centerErr, nMid } = getState();
      const snapshot = {
        ver: 2,
        pts:  JSON.parse(JSON.stringify(pts)),
        meas: JSON.parse(JSON.stringify(meas)),
        centerErr,
        nMid: nMid ?? 1
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      if (typeof document !== 'undefined') {
        const el = document.getElementById("autosave-status");
        if (el) {
          const t = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          el.textContent = `Autosparat ${t}`;
        }
      }
    } catch (e) {
      console.warn("Autosave misslyckades:", e);
    }
  }, 1500);
}

// Läs autosave vid start – returnerar true om något laddades, false annars.
// Matchar rad 3607–3613 exakt.
export function loadAutosave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || (s.ver !== 2 && s.ver !== 1)) return false;
    setState({
      pts:       s.pts  || [],
      meas:      s.meas || [],
      centerErr: s.centerErr != null ? s.centerErr : 1.0,
      nMid:      s.nMid      ?? 1,
    });
    return true;
  } catch (e) {
    return false;
  }
}
