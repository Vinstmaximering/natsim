// Felellips-rendering sker i leaflet-setup.js draw() för att undvika cirkulärt import.
// ctx.ellipse(0, 0, aP, bP, 0, 0, Math.PI*2) med sc = ellScale/mpp – se leaflet-setup.js.
// Denna fil är en placeholder för en framtida separation i Fas 5+.
export { drawPt } from './leaflet-setup.js';
