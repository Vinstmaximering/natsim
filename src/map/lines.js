// Mätlinje-rendering sker i leaflet-setup.js draw() för att undvika cirkulärt import.
// Denna fil exporterar rColor/rLabel (används av UI-paneler för konsistens) och
// kan i Fas 5+ ta emot den faktiska drawLines-funktionen.
export { rColor, rLabel } from '../core/redundancy.js';
