// Skrivare för SBG Object Text v2.01 (.geo) – Polylinjer Etapp 3.
//
// Ren funktion: en modell in, filens text ut. Används av exporten av
// nätpunkter (io/import-geo.js) och av exporten av visuella lager
// (io/export-visual-geo.js). Formatet är verifierat mot riktiga exporter
// från Geo och mot inläsning i Geo:
//
//   - UTF-8 utan BOM (Blob av en sträng ger det), CRLF, ett tabbsteg per nivå,
//     begin/end på egna rader.
//   - Ordning: FileHeader med block → PointList → LineList → AttributeList.
//     Filen slutar med "AttributeList " + CRLF.
//   - Listnyckelorden skrivs med ett blanksteg efter: "PointList ",
//     "LineList ", "AttributeList ". En tom lista skrivs bara som
//     nyckelordet, utan begin/end.
//   - Point "id",N,E,H,,, – sju fält, N före E, punkt som decimaltecken och
//     fyra decimaler. Saknad höjd är ett tomt fält: Point "id",N,E,,,,
//   - Line "namn",,, – linjens hörn har egna koordinater och löpnamnen
//     01, 02, … En sluten linje (och en yta) upprepar första hörnet sist;
//     flaggfältet lämnas tomt.
//   - Tomt värde i FileInfo skrivs utan citattecken: FileInfo "Description",
//
// Formatet har ingen escapning av citattecken. Ett namn med " eller en
// radbrytning stoppas därför med ett fel som räknar upp namnen, i stället för
// att tyst ändras.
import { CRS_DEFS } from '../core/constants.js';

const CRLF = '\r\n';
const DECIMALER = 4;

/** Fel som exporten visar för användaren. */
export class GeoWriteError extends Error {
  constructor(message, names = []) {
    super(message);
    this.name = 'GeoWriteError';
    this.names = names;
  }
}

// Koordinatsystem vars sträng är provad mot riktiga Geo-filer.
export const VERIFIED_GEO_CRS = ['sweref991545', 'sweref992015'];

/**
 * "Sweref 99 20 15 / RH2000 (SWEN17)" ur projektets koordinatsystem.
 * verified är false för zoner vars sträng inte provats mot Geo – samma
 * mönster skrivs ändå, men exporten varnar.
 * @returns {{ text:string, verified:boolean }}
 */
export function geoCoordinateSystem(crsKey) {
  const namn = CRS_DEFS[crsKey]?.name;
  if (!namn) return { text: '', verified: false };
  const plan = namn.replace(/^SWEREF/i, 'Sweref');
  return { text: `${plan} / RH2000 (SWEN17)`, verified: VERIFIED_GEO_CRS.includes(crsKey) };
}

const tal = v => v.toFixed(DECIMALER);
const höjd = H => (Number.isFinite(H) ? tal(H) : '');
const punktRad = (namn, p) => `Point "${namn}",${tal(p.N)},${tal(p.E)},${höjd(p.H)},,,`;

// Löpnamn för linjens hörn: 01, 02, … 99, 100, …
export const vertexName = i => String(i + 1).padStart(2, '0');

const felaktigt = s => /["\r\n]/.test(String(s ?? ''));

/**
 * Namn som formatet inte kan bära (citattecken eller radbrytning), för
 * dialogen. Tomt när allt går att skriva.
 */
export function invalidGeoNames(model) {
  const fel = [];
  for (const p of model.points || []) if (felaktigt(p.name)) fel.push(p.name);
  for (const l of model.lines || []) if (felaktigt(l.name)) fel.push(l.name);
  for (const v of Object.values(model.info || {})) if (felaktigt(v)) fel.push(v);
  return fel;
}

/**
 * @param {{
 *   info: { application:string, description?:string, coordinateSystem:string },
 *   points: Array<{ name:string, N:number, E:number, H:number|null }>,
 *   lines:  Array<{ name:string, closed:boolean, vertices:Array<{N:number,E:number,H:number|null}> }>,
 * }} model
 * @returns {string} filens innehåll
 * @throws {GeoWriteError} när ett namn innehåller " eller en radbrytning
 */
export function writeGeo(model) {
  const fel = invalidGeoNames(model);
  if (fel.length) {
    const visa = fel.slice(0, 5).map(n => `"${String(n).replace(/[\r\n]+/g, '↵')}"`).join(', ');
    throw new GeoWriteError(
      `${fel.length === 1 ? 'Ett namn' : `${fel.length} namn`} innehåller citattecken eller radbrytning, ` +
      `som .geo-formatet inte kan bära: ${visa}${fel.length > 5 ? ' …' : ''}. Byt namn och exportera igen.`, fel);
  }

  const rader = [];
  const info = (nyckel, värde) => rader.push(
    `\tFileInfo "${nyckel}",${värde === '' || värde === null || värde === undefined ? '' : `"${värde}"`}`);

  rader.push('FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"', 'begin');
  info('Application', model.info?.application ?? '');
  info('Description', model.info?.description ?? '');
  info('Coordinate System', model.info?.coordinateSystem ?? '');
  rader.push('end');

  const points = model.points || [];
  rader.push('PointList ');
  if (points.length) {
    rader.push('begin');
    for (const p of points) rader.push(`\t${punktRad(p.name, p)}`);
    rader.push('end');
  }

  const lines = (model.lines || []).filter(l => (l.vertices || []).length >= 2);
  rader.push('LineList ');
  if (lines.length) {
    rader.push('begin');
    for (const l of lines) {
      const vs = l.closed ? [...l.vertices, l.vertices[0]] : l.vertices;
      rader.push(`\tLine "${l.name}",,,`, '\tbegin', '\t\tPointList ', '\t\tbegin');
      vs.forEach((v, i) => rader.push(`\t\t\t${punktRad(vertexName(i), v)}`));
      rader.push('\t\tend', '\tend');
    }
    rader.push('end');
  }

  rader.push('AttributeList ');
  return rader.join(CRLF) + CRLF;
}

/** Laddar ner texten som en fil. UTF-8 utan BOM. */
export function downloadGeo(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Ett filnamn utan tecken som Windows inte tillåter. */
export function geoFilename(base) {
  const s = String(base ?? '').replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || 'export';
  return s.toLowerCase().endsWith('.geo') ? s : `${s}.geo`;
}
