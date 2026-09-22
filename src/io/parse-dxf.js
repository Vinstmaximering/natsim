// Ren parser för ASCII-DXF (Drawing Interchange Format).
//
// Ingen DOM, inget state. ui/dxf-import-modal.js sköter dialogen och
// io/dxf-import.js tillämpar resultatet på projektet.
//
// FORMATET
//   En ASCII-DXF är en följd av PAR: en rad med en gruppkod (heltal) följd av
//   en rad med värdet. Filen delas i sektioner:
//       0 / SECTION
//       2 / HEADER          ← rubrikvariabler, bl.a. $INSUNITS
//       ...
//       0 / ENDSEC
//       0 / SECTION
//       2 / ENTITIES        ← ritobjekten
//       ...
//       0 / ENDSEC
//       0 / EOF
//   Inom ENTITIES inleder varje 0/<TYP> ett nytt objekt, som äger alla
//   följande par fram till nästa 0.
//
// STÖDDA OBJEKT i första versionen: LINE, LWPOLYLINE, POLYLINE/VERTEX/SEQEND
// och POINT. Allt annat (INSERT, HATCH, TEXT, MTEXT, DIMENSION, ARC, CIRCLE,
// SPLINE …) räknas per lager och hoppas över med en varning, så att dialogen
// kan visa vad som inte kom med.

// ── Enheter ──────────────────────────────────────────────────────────────────
// $INSUNITS i HEADER-sektionen. Kodvärdena är kontrollerade mot Autodesks
// DXF Reference (HEADER Section Group Codes, $INSUNITS) och mot ezdxf:s
// InsertUnits-enum, https://ezdxf.readthedocs.io/en/stable/concepts/units.html
// (hämtad 2026-09-22), som speglar samma tabell.
//
// Faktorerna är omräkning TILL METER. De exakta definitionerna:
//   tum = 25,4 mm exakt · fot = 12 tum · yard = 3 fot · mile = 1760 yard
//   US survey foot = 1200/3937 m exakt (lantmäterifoten, inte 0,3048)
export const DXF_UNITS = {
  0:  { name: 'Enhetslös',          factor: null },
  1:  { name: 'Tum',                factor: 0.0254 },
  2:  { name: 'Fot',                factor: 0.3048 },
  3:  { name: 'Mile',               factor: 1609.344 },
  4:  { name: 'Millimeter',         factor: 0.001 },
  5:  { name: 'Centimeter',         factor: 0.01 },
  6:  { name: 'Meter',              factor: 1 },
  7:  { name: 'Kilometer',          factor: 1000 },
  8:  { name: 'Mikrotum',           factor: 2.54e-8 },
  9:  { name: 'Mil (tusendels tum)', factor: 2.54e-5 },
  10: { name: 'Yard',               factor: 0.9144 },
  11: { name: 'Ångström',           factor: 1e-10 },
  12: { name: 'Nanometer',          factor: 1e-9 },
  13: { name: 'Mikrometer',         factor: 1e-6 },
  14: { name: 'Decimeter',          factor: 0.1 },
  15: { name: 'Dekameter',          factor: 10 },
  16: { name: 'Hektometer',         factor: 100 },
  17: { name: 'Gigameter',          factor: 1e9 },
  18: { name: 'Astronomisk enhet',  factor: 149597870700 },
  19: { name: 'Ljusår',             factor: 9.4607304725808e15 },
  20: { name: 'Parsec',             factor: 3.0856775814913673e16 },
  21: { name: 'US survey foot',     factor: 1200 / 3937 },
  22: { name: 'US survey inch',     factor: 1 / 39.37 },
  23: { name: 'US survey yard',     factor: 3600 / 3937 },
  24: { name: 'US survey mile',     factor: 6336000 / 3937 },
};

// De enheter som är rimliga att välja i dialogen. Resten finns i DXF_UNITS för
// att kunna tolka en fil som råkar ange dem, men bjuds inte ut.
export const DXF_UNIT_CHOICES = [6, 4, 5, 14, 7, 2, 1, 0];

// Enhet när filen inte säger något och användaren inte väljer.
export const DXF_DEFAULT_UNIT = 6;   // meter

export const DXF_SUPPORTED_TYPES = ['LINE', 'LWPOLYLINE', 'POLYLINE', 'POINT'];

// Binär DXF inleds med den här signaturen (Autodesk DXF Reference, "Binary
// DXF Files"). Den går inte att läsa som text och avvisas med besked.
const BINARY_SENTINEL = 'AutoCAD Binary DXF';

export class DxfParseError extends Error {
  constructor(message, code) { super(message); this.name = 'DxfParseError'; this.code = code; }
}

// ── Tokenisering ─────────────────────────────────────────────────────────────

// Radpar → [{code, value}]. Värdet behålls som sträng; tolkningen sker per
// gruppkod, eftersom samma kod betyder olika saker för olika objekt.
function tokenize(text, warn) {
  const lines = String(text).split(/\r\n|\r|\n/);
  const pairs = [];
  let trasiga = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const rå = lines[i].trim();
    if (rå === '') continue;                 // tomrader mellan par förekommer
    const code = Number(rå);
    if (!Number.isInteger(code)) {
      // Inte en gruppkod. Hoppa en rad och försök igen i stället för att ge
      // upp – en enda skadad rad ska inte kosta hela filen.
      trasiga++;
      continue;
    }
    pairs.push({ code, value: (lines[++i] ?? '').trim() });
  }
  if (trasiga) warn('bad-pair', `${trasiga} rader kunde inte läsas som gruppkod och hoppades över`);
  return pairs;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * @param {string} text  Hela DXF-filens innehåll.
 * @returns {{
 *   header: {insunits:number|null, unitName:string|null, unitFactor:number|null},
 *   layers: Array<{name:string, counts:Object, total:number,
 *                  supportedTotal:number, supported:boolean}>,
 *   entities: Array<object>,
 *   warnings: Array<{code:string, message:string}>
 * }}
 * @throws {DxfParseError} för binär DXF.
 */
export function parseDxf(text) {
  const src = String(text ?? '');
  if (src.startsWith(BINARY_SENTINEL)) {
    throw new DxfParseError(
      'Filen är en binär DXF. NätSim läser bara ASCII-DXF. ' +
      'Spara om ritningen som "AutoCAD ASCII DXF" och försök igen.',
      'binary');
  }

  const warnings = [];
  const seenWarn = new Set();
  const warn = (code, message) => {
    const key = code + '|' + message;
    if (seenWarn.has(key)) return;
    seenWarn.add(key);
    warnings.push({ code, message });
  };

  const pairs = tokenize(src, warn);
  const header = { insunits: null, unitName: null, unitFactor: null };
  const entities = [];
  const skipped = new Map();   // "lager\u0000TYP" → antal

  let section = null;
  let i = 0;

  while (i < pairs.length) {
    const p = pairs[i];

    if (p.code === 0 && p.value === 'SECTION') {
      section = pairs[i + 1]?.code === 2 ? pairs[i + 1].value : null;
      i += 2;
      continue;
    }
    if (p.code === 0 && (p.value === 'ENDSEC' || p.value === 'EOF')) {
      section = null; i++; continue;
    }

    if (section === 'HEADER') {
      // 9/$VARIABEL följt av variabelns egna gruppkoder.
      if (p.code === 9 && p.value === '$INSUNITS') {
        const v = pairs[i + 1];
        if (v && v.code === 70) header.insunits = parseInt(v.value, 10);
      }
      i++; continue;
    }

    if (section === 'ENTITIES' && p.code === 0) {
      const typ = p.value;
      // Samla objektets egna par fram till nästa 0.
      const body = [];
      let j = i + 1;
      while (j < pairs.length && pairs[j].code !== 0) body.push(pairs[j++]);

      if (typ === 'LINE' || typ === 'POINT' || typ === 'LWPOLYLINE') {
        entities.push(buildSimple(typ, body, warn));
        i = j; continue;
      }
      if (typ === 'POLYLINE') {
        // POLYLINE äger de VERTEX-objekt som följer, fram till SEQEND.
        const { ent, next } = buildPolyline(body, pairs, j);
        entities.push(ent);
        i = next; continue;
      }
      if (typ === 'VERTEX' || typ === 'SEQEND') {
        // Hamnar vi här är de föräldralösa – räkna dem som överhoppade.
        räkna(skipped, layerOf(body), typ);
        i = j; continue;
      }

      räkna(skipped, layerOf(body), typ);
      i = j; continue;
    }

    i++;
  }

  // ── Lagerlista ──
  // Härleds ur objekten i stället för ur TABLES: ett lager som inte innehåller
  // något är inget att importera, och TABLES saknas i förenklade filer.
  const layers = new Map();
  const rad = name => {
    if (!layers.has(name)) layers.set(name, { name, counts: {}, total: 0, supportedTotal: 0 });
    return layers.get(name);
  };
  for (const e of entities) {
    const r = rad(e.layer);
    r.counts[e.type] = (r.counts[e.type] || 0) + 1;
    r.total++; r.supportedTotal++;
  }
  for (const [key, n] of skipped) {
    const [name, typ] = key.split('\u0000');
    const r = rad(name);
    r.counts[typ] = (r.counts[typ] || 0) + n;
    r.total += n;
  }
  const lagerLista = [...layers.values()]
    .map(r => ({ ...r, supported: r.supportedTotal > 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const överhoppade = [...skipped.entries()].reduce((s, [, n]) => s + n, 0);
  if (överhoppade) {
    const typer = [...new Set([...skipped.keys()].map(k => k.split('\u0000')[1]))].sort();
    warn('unsupported-entity',
      `${överhoppade} objekt av typerna ${typer.join(', ')} stöds inte och hoppades över`);
  }

  // ── Enhet ──
  const u = header.insunits !== null ? DXF_UNITS[header.insunits] : undefined;
  if (header.insunits === null) {
    warn('no-insunits', 'Filen anger ingen enhet ($INSUNITS saknas) – välj enhet i dialogen');
  } else if (!u) {
    warn('unknown-insunits', `Okänd enhetskod $INSUNITS=${header.insunits} – välj enhet i dialogen`);
  } else {
    header.unitName = u.name;
    header.unitFactor = u.factor;
    if (u.factor === null) warn('unitless', 'Filen är enhetslös – välj enhet i dialogen');
  }

  const bulgar = entities.reduce((s, e) => s + (e.bulges || 0), 0);
  if (bulgar) {
    warn('bulge',
      `${bulgar} bågsegment (bulge) ritas som raka linjer i den här versionen`);
  }

  return { header, layers: lagerLista, entities, warnings };
}

function räkna(map, layer, typ) {
  const k = `${layer}\u0000${typ}`;
  map.set(k, (map.get(k) || 0) + 1);
}

const layerOf = body => body.find(p => p.code === 8)?.value || '0';

// LINE, POINT och LWPOLYLINE.
function buildSimple(typ, body, warn) {
  const layer = layerOf(body);

  if (typ === 'LINE') {
    const g = c => body.find(p => p.code === c);
    return {
      type: 'LINE', layer,
      a: { x: num(g(10)?.value), y: num(g(20)?.value), z: num(g(30)?.value) },
      b: { x: num(g(11)?.value), y: num(g(21)?.value), z: num(g(31)?.value) },
    };
  }

  if (typ === 'POINT') {
    const g = c => body.find(p => p.code === c);
    return {
      type: 'POINT', layer,
      p: { x: num(g(10)?.value), y: num(g(20)?.value), z: num(g(30)?.value) },
    };
  }

  // LWPOLYLINE: hörnen ligger som upprepade 10/20-par i läsordning. 38 är
  // polylinjens elevation (den är plan – hörnen har ingen egen z), 42 är
  // bågsegmentets bulge och 70 bit 1 betyder sluten.
  const flags = parseInt(body.find(p => p.code === 70)?.value ?? '0', 10) || 0;
  const elev  = num(body.find(p => p.code === 38)?.value ?? '0');
  const vertices = [];
  let bulges = 0;
  for (const p of body) {
    if (p.code === 10) vertices.push({ x: num(p.value), y: 0, z: elev });
    else if (p.code === 20 && vertices.length) vertices[vertices.length - 1].y = num(p.value);
    else if (p.code === 42 && num(p.value) !== 0) bulges++;
  }
  const antal = parseInt(body.find(p => p.code === 90)?.value ?? '', 10);
  if (Number.isInteger(antal) && antal !== vertices.length) {
    warn('vertex-count',
      `En LWPOLYLINE anger ${antal} hörn men ${vertices.length} lästes – de lästa används`);
  }
  return { type: 'LWPOLYLINE', layer, closed: (flags & 1) === 1, vertices, bulges };
}

// POLYLINE + följande VERTEX-objekt, avslutade av SEQEND.
function buildPolyline(body, pairs, start) {
  const flags = parseInt(body.find(p => p.code === 70)?.value ?? '0', 10) || 0;
  const ent = {
    type: 'POLYLINE', layer: layerOf(body),
    closed: (flags & 1) === 1, vertices: [], bulges: 0,
  };

  let i = start;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code !== 0) { i++; continue; }
    if (p.value === 'SEQEND') { i++; break; }
    if (p.value !== 'VERTEX') break;           // saknad SEQEND – sluta ändå

    const vBody = [];
    let j = i + 1;
    while (j < pairs.length && pairs[j].code !== 0) vBody.push(pairs[j++]);
    const g = c => vBody.find(q => q.code === c);
    ent.vertices.push({ x: num(g(10)?.value), y: num(g(20)?.value), z: num(g(30)?.value) });
    if (num(g(42)?.value) !== 0) ent.bulges++;
    i = j;
  }
  return { ent, next: i };
}

// ── Utbredning ───────────────────────────────────────────────────────────────

// Omslutande rektangel i ritningens EGNA koordinater (x/y, före enhets- och
// axelomräkning). Dialogens rimlighetskontroll räknar om den själv.
export function dxfBounds(entities, layerFilter = null) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of entities || []) {
    if (layerFilter && !layerFilter.has(e.layer)) continue;
    if (e.type === 'LINE')  { add(e.a); add(e.b); }
    else if (e.type === 'POINT') add(e.p);
    else (e.vertices || []).forEach(add);
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}
