// Ren parser för SBG Object Text (.geo) – Geo Professionals exportformat.
//
// Ingen DOM, inget state, inga sidoeffekter: parseGeo(text) in, ett objekt ut.
// import-geo.js bygger importen ovanpå den här funktionen, och etapp 3:s
// importdialog läser samma resultat.
//
// FORMATET
//   FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"
//   begin
//       FileInfo "Coordinate System","Sweref 99 15 45 / RH2000 (SWEN17)"
//   end
//   PointList
//   begin
//       Point "101",6165575.706,247391.005,341.936,,,
//       begin
//           AttributeList
//           begin
//               Attribute "UB","20200101.100100"
//           end
//       end
//   end
//   LineList
//   begin
//       Line "1",1,
//       begin
//           PointList
//           begin
//               Point "01",6165570.816,247382.844,341.94,,,
//           end
//       end
//   end
//   AttributeList
//
// Läsningen är strukturell, inte ett regex över hela filen: ett `begin` öppnar
// ett block som hör till närmast föregående sats, och `end` stänger det. Det är
// enda sättet att skilja den yttre PointList (mätta punkter) från den PointList
// som ligger inuti en Line (linjens egna hörn med egna koordinater).
//
// TÅL: CRLF och LF, tomma block, PointList helt utan begin/end, saknade
// H-värden, tomma fält i radslutet (",,,") och okända nyckelord. Inget av det
// får kasta – allt avvikande samlas i warnings.
import { CRS_DEFS } from '../core/constants.js';

// Flaggan efter linjens id. HYPOTES (ej verifierad mot SBG:s dokumentation):
// 1 = sluten linje. I Norr-fixturen har Line "1",1 fyra hörn som bildar en
// rektangel utan att första hörnet upprepas sist, vilket stämmer med tolkningen.
// Visar det sig vara fel räcker det att ändra den här konstanten och closed-
// beräkningen nedan.
export const GEO_LINE_FLAG_CLOSED = '1';

// ── Varningar ────────────────────────────────────────────────────────────────
// Koder: unknown-keyword, unexpected-statement, invalid-point, duplicate-point,
//        unbalanced-end, missing-end, unknown-crs, empty-line, missing-header

// ── Hjälpfunktioner ──────────────────────────────────────────────────────────

// Delar en argumentlista på kommatecken utanför citattecken och tar bort
// citattecknen. `"101",6165575.7,247391.0,341.9,,,` → ['101','6165575.7',…,'','','']
function splitArgs(s) {
  const out = [];
  let cur = '', inQuote = false;
  for (const ch of s) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim());
}

// Tomt fält ⇒ null, inte 0: ett utelämnat H är inte höjden noll.
function num(s) {
  if (s === undefined || s === null || s === '') return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

// Namnjämförelse mot CRS_DEFS utan skiftläge och blanksteg. Filernas
// "Sweref 99 15 45" matchar då definitionens "SWEREF 99 15 45".
const normCrsName = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * Slår upp ett koordinatsystem ur strängen i FileInfo "Coordinate System".
 * Plansystemet är delen före '/', höjdsystemet delen efter.
 * @returns {{crs:string|null, crsName:string|null, planeName:string, heightSystem:string|null}}
 */
export function matchGeoCRS(coordinateSystem) {
  const raw = String(coordinateSystem ?? '').trim();
  const slash = raw.indexOf('/');
  const planeName    = (slash === -1 ? raw : raw.slice(0, slash)).trim();
  const heightSystem = slash === -1 ? null : (raw.slice(slash + 1).trim() || null);

  const key = normCrsName(planeName);
  const hit = Object.entries(CRS_DEFS).find(([, def]) => normCrsName(def.name) === key);
  return {
    crs:     hit ? hit[0] : null,
    crsName: hit ? hit[1].name : null,
    planeName,
    heightSystem,
  };
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * @param {string} text  Hela filens innehåll.
 * @returns {{
 *   fileInfo: {header:string[], coordinateSystem:string|null, crs:string|null,
 *              crsName:string|null, planeName:string|null, heightSystem:string|null,
 *              application:string|null, author:string|null, company:string|null,
 *              description:string|null, raw:Object, attrs:Object},
 *   points: Array<{name:string, N:number, E:number, H:number|null, attrs:Object}>,
 *   lines:  Array<{name:string, closed:boolean, vertices:Array<{name:string,N:number,E:number,H:number|null}>}>,
 *   warnings: Array<{code:string, message:string, line:number|null}>
 * }}
 */
export function parseGeo(text) {
  const warnings = [];
  const warn = (code, message, line = null) => warnings.push({ code, message, line });

  const points = [];
  const lines  = [];
  const rawInfo = {};
  const fileAttrs = {};
  let header = [];

  // En kontext är ett öppnat block. `pending` är närmast föregående sats i
  // kontexten – den som ett kommande `begin` hör till.
  const stack = [{ kind: 'root', pending: null }];
  const top = () => stack[stack.length - 1];

  const statements = String(text ?? '').split(/\r\n|\r|\n/);

  statements.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (!line) return;

    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line);
    if (!m) { warn('unknown-keyword', `Rad ${lineNo}: obegriplig rad "${line}"`, lineNo); return; }
    const keyword = m[1];
    const rest    = m[2];

    // ── Blockhantering ──
    if (keyword === 'begin') {
      const p = top().pending;
      // Ett begin utan känd föregående sats öppnar ett block vi hoppar över,
      // men nivåräkningen måste ändå stämma för att resten av filen ska läsas.
      stack.push(p ? { ...p, pending: null } : { kind: 'skip', pending: null });
      return;
    }
    if (keyword === 'end') {
      if (stack.length === 1) {
        warn('unbalanced-end', `Rad ${lineNo}: "end" utan matchande "begin"`, lineNo);
        return;
      }
      stack.pop();
      top().pending = null;
      return;
    }

    const ctx  = top();
    const args = rest === '' ? [] : splitArgs(rest);

    // Allt inuti ett överhoppat block ignoreras, men begin/end räknas ovan.
    if (ctx.kind === 'skip') return;

    switch (ctx.kind) {
      // ── Filnivå ──
      case 'root':
        if (keyword === 'FileHeader')         { header = args; ctx.pending = { kind: 'fileinfo' }; return; }
        if (keyword === 'PointList')          { ctx.pending = { kind: 'pointlist' }; return; }
        if (keyword === 'LineList')           { ctx.pending = { kind: 'linelist' }; return; }
        if (keyword === 'AttributeList')      { ctx.pending = { kind: 'attributelist', node: fileAttrs }; return; }
        break;

      // ── FileHeader-blocket: FileInfo-rader ──
      case 'fileinfo':
        if (keyword === 'FileInfo') {
          if (args[0]) rawInfo[args[0]] = args[1] ?? '';
          ctx.pending = null;
          return;
        }
        break;

      // ── Yttre PointList: mätta punkter ──
      case 'pointlist': {
        if (keyword !== 'Point') break;
        const pt = _makePoint(args, lineNo, warn);
        if (!pt) { ctx.pending = null; return; }
        points.push(pt);
        ctx.pending = { kind: 'object', node: pt };
        return;
      }

      // ── Blocket under en Point eller en hörnpunkt ──
      case 'object':
        if (keyword === 'AttributeList') {
          ctx.node.attrs = ctx.node.attrs || {};
          ctx.pending = { kind: 'attributelist', node: ctx.node.attrs };
          return;
        }
        break;

      case 'attributelist':
        if (keyword === 'Attribute') {
          if (args[0]) ctx.node[args[0]] = args[1] ?? '';
          ctx.pending = null;
          return;
        }
        break;

      // ── LineList ──
      case 'linelist': {
        if (keyword !== 'Line') break;
        const name = args[0] ?? '';
        const ln = { name, closed: (args[1] ?? '') === GEO_LINE_FLAG_CLOSED, vertices: [] };
        lines.push(ln);
        ctx.pending = { kind: 'line', node: ln };
        return;
      }

      // ── Blocket under en Line ──
      case 'line':
        if (keyword === 'PointList')     { ctx.pending = { kind: 'vertexlist', node: ctx.node }; return; }
        if (keyword === 'AttributeList') {
          ctx.node.attrs = ctx.node.attrs || {};
          ctx.pending = { kind: 'attributelist', node: ctx.node.attrs };
          return;
        }
        break;

      // ── Linjens egna hörn. Hörnen är INTE referenser till den yttre
      //    PointList – de bär egna koordinater och lokala, återanvända namn. ──
      case 'vertexlist': {
        if (keyword !== 'Point') break;
        const v = _makePoint(args, lineNo, warn);
        if (!v) { ctx.pending = null; return; }
        delete v.attrs;                 // hörn bär sällan attribut; fältet skapas vid behov
        ctx.node.vertices.push(v);
        ctx.pending = { kind: 'object', node: v };
        return;
      }
    }

    // Känd sats på fel plats, eller ett nyckelord vi inte hanterar. Båda är
    // varningar, aldrig avbrott: filen kan innehålla mer än vi känner till.
    warn(
      keyword === 'Point' || keyword === 'Line' || keyword === 'Attribute' ||
      keyword === 'FileInfo' || keyword === 'PointList' || keyword === 'LineList'
        ? 'unexpected-statement' : 'unknown-keyword',
      `Rad ${lineNo}: "${keyword}" oväntad i ${ctx.kind}`, lineNo);
    ctx.pending = null;
  });

  if (stack.length > 1) {
    warn('missing-end', `Filen slutar med ${stack.length - 1} oavslutat block`, null);
  }
  if (!header.length) {
    warn('missing-header', 'Filen saknar FileHeader – tolkas ändå som SBG Object Text', 1);
  }

  // ── Dubbletter ──
  // Slås medvetet INTE ihop: två rader med samma id och olika koordinater är
  // två mätningar av samma punkt, och vilken som gäller är användarens beslut.
  const seen = new Map();
  for (const p of points) seen.set(p.name, (seen.get(p.name) || 0) + 1);
  for (const [name, n] of seen) {
    if (n > 1) warn('duplicate-point', `Punkt-ID "${name}" förekommer ${n} gånger i filen`, null);
  }

  for (const ln of lines) {
    if (ln.vertices.length < 2) {
      warn('empty-line', `Linje "${ln.name}" har ${ln.vertices.length} hörn och kan inte ritas`, null);
    }
  }

  // ── Koordinatsystem ──
  const coordinateSystem = rawInfo['Coordinate System'] || null;
  const crsHit = matchGeoCRS(coordinateSystem);
  if (coordinateSystem && !crsHit.crs) {
    warn('unknown-crs', `Okänt koordinatsystem i filen: "${coordinateSystem}"`, null);
  }

  return {
    fileInfo: {
      header,
      coordinateSystem,
      crs:          crsHit.crs,
      crsName:      crsHit.crsName,
      planeName:    coordinateSystem ? crsHit.planeName : null,
      // Höjdsystemet sparas och visas i dialogen men påverkar ingenting:
      // NätSim räknar inte om höjder mellan höjdsystem.
      heightSystem: crsHit.heightSystem,
      application:  rawInfo['Application'] || null,
      author:       rawInfo['Author']      || null,
      company:      rawInfo['Company']     || null,
      description:  rawInfo['Description'] || null,
      raw:   rawInfo,
      attrs: fileAttrs,
    },
    points,
    lines,
    warnings,
  };
}

// Point "namn",N,E,H,,,  – N före E, precis som i exporten.
function _makePoint(args, lineNo, warn) {
  const name = args[0] ?? '';
  const N = num(args[1]);
  const E = num(args[2]);
  const H = num(args[3]);
  if (N === null || E === null) {
    warn('invalid-point', `Rad ${lineNo}: punkt "${name}" saknar giltiga koordinater`, lineNo);
    return null;
  }
  return { name, N, E, H, attrs: {} };
}

// ── Utbredning ───────────────────────────────────────────────────────────────

// Omslutande rektangel för allt innehåll i en parsad fil – används av
// importdialogen för att zooma till importen. null om filen är tom.
export function geoBounds(parsed) {
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  const add = p => {
    if (p.E < minE) minE = p.E;
    if (p.E > maxE) maxE = p.E;
    if (p.N < minN) minN = p.N;
    if (p.N > maxN) maxN = p.N;
  };
  (parsed?.points || []).forEach(add);
  (parsed?.lines  || []).forEach(l => (l.vertices || []).forEach(add));
  return Number.isFinite(minE) ? { minE, maxE, minN, maxN } : null;
}
