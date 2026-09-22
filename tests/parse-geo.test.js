// Etapp 2: den rena .geo-parsern (SBG Object Text v2.01).
// Fixturerna är tre skarpa exportfiler ur Geo Professional 2022.1.8.972.
// De testas på antal, struktur och de egenheter som fick den gamla
// regex-läsningen att tappa data: LineList, dubbletter och tom PointList.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGeo, matchGeoCRS, geoBounds, GEO_LINE_FLAG_CLOSED } from '../src/io/parse-geo.js';
import { CRS_DEFS } from '../src/core/constants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(HERE, 'fixtures', 'geo', name), 'utf8');

const NORR = fixture('exempel_punkter_sluten_linje.geo');
const SYD  = fixture('exempel_punkter_oppna_linjer.geo');
const PALL = fixture('exempel_tom_punktlista.geo');

const codes = parsed => parsed.warnings.map(w => w.code);

describe('fixtur: punkter och sluten linje', () => {
  const r = parseGeo(NORR);

  it('läser fem punkter ur den yttre PointList', () => {
    expect(r.points).toHaveLength(5);
    expect(r.points.map(p => p.name)).toEqual(['101', '102', '103', '101', '104']);
  });

  it('första punkten får N, E, H i rätt ordning', () => {
    expect(r.points[0]).toMatchObject({
      name: '101',
      N: 6165575.70688826,
      E: 247391.00528623,
      H: 341.936695977131,
    });
  });

  it('punktattributen följer med', () => {
    expect(r.points[0].attrs).toMatchObject({
      UB: '20200101.100100',
      reference_model: 'exempel.geo',
      GP_LM: '7',
      GP_PR: '2',
    });
  });

  it('dubbletten "101" ger två punkter och en varning – inte en tyst hopslagning', () => {
    const dubbletter = r.points.filter(p => p.name === '101');
    expect(dubbletter).toHaveLength(2);
    expect(dubbletter[0].E).not.toBe(dubbletter[1].E);
    const dup = r.warnings.filter(w => w.code === 'duplicate-point');
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toContain('"101"');
  });

  it('Line "1",1 ger en sluten linje med fyra hörn', () => {
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].name).toBe('1');
    expect(r.lines[0].closed).toBe(true);
    expect(r.lines[0].vertices).toHaveLength(4);
    expect(r.lines[0].vertices.map(v => v.name)).toEqual(['01', '02', '01', '02']);
  });

  it('hörnen bär egna koordinater, inte referenser till den yttre listan', () => {
    const v = r.lines[0].vertices[0];
    expect(v).toMatchObject({ name: '01', N: 6165570.8162459, E: 247382.84418388, H: 341.94 });
    // Inget hörn sammanfaller med punkten "01" i den yttre listan – den finns inte ens.
    expect(r.points.some(p => p.name === '01')).toBe(false);
  });

  it('koordinatsystemet mappas till sweref991545 och höjdsystemet sparas', () => {
    expect(r.fileInfo.coordinateSystem).toBe('Sweref 99 15 45 / RH2000 (SWEN17)');
    expect(r.fileInfo.crs).toBe('sweref991545');
    expect(r.fileInfo.crsName).toBe('SWEREF 99 15 45');
    expect(r.fileInfo.heightSystem).toBe('RH2000 (SWEN17)');
  });

  it('filhuvudet läses', () => {
    expect(r.fileInfo.header[0]).toBe('SBG Object Text v2.01');
    expect(r.fileInfo.application).toContain('Geo Professional');
    expect(r.fileInfo.author).toBe('XX');
    // Tomt Description-fält blir null, inte tom sträng.
    expect(r.fileInfo.description).toBeNull();
  });

  it('enda varningen är dubbletten – inget okänt nyckelord', () => {
    expect(codes(r)).toEqual(['duplicate-point']);
  });
});

describe('fixtur: punkter och öppna linjer', () => {
  const r = parseGeo(SYD);

  it('tre punkter och fyra öppna linjer med två hörn var', () => {
    expect(r.points).toHaveLength(3);
    expect(r.lines).toHaveLength(4);
    expect(r.lines.map(l => l.vertices.length)).toEqual([2, 2, 2, 2]);
    expect(r.lines.every(l => l.closed === false)).toBe(true);
  });

  it('parsas utan varningar', () => {
    expect(r.warnings).toEqual([]);
  });
});

describe('fixtur: tom PointList', () => {
  const r = parseGeo(PALL);

  it('tom PointList utan eget begin/end ger noll punkter utan fel', () => {
    expect(r.points).toEqual([]);
    expect(codes(r)).not.toContain('unknown-keyword');
    expect(codes(r)).not.toContain('unexpected-statement');
  });

  it('nio linjer med rätt antal hörn', () => {
    expect(r.lines).toHaveLength(9);
    expect(r.lines.map(l => l.name)).toEqual(['5', '6', '7', '8', '9', '11', '12', '13', '14']);
    expect(r.lines.map(l => l.vertices.length)).toEqual([3, 3, 2, 2, 4, 2, 2, 2, 2]);
  });

  it('hörn som sammanfaller mellan linjer behålls i båda', () => {
    const l5 = r.lines.find(l => l.name === '5');
    const l6 = r.lines.find(l => l.name === '6');
    expect(l5.vertices[0].E).toBe(l6.vertices[2].E);
    expect(l5.vertices[0].N).toBe(l6.vertices[2].N);
  });

  it('koordinatsystemet läses även när PointList är tom', () => {
    expect(r.fileInfo.crs).toBe('sweref991545');
  });
});

describe('koordinatsystem', () => {
  it('matchar utan hänsyn till skiftläge och blanksteg', () => {
    expect(matchGeoCRS('Sweref 99 15 45 / RH2000 (SWEN17)').crs).toBe('sweref991545');
    expect(matchGeoCRS('SWEREF99TM').crs).toBe('sweref99tm');
    expect(matchGeoCRS('  sweref  99  18 00  ').crs).toBe('sweref991800');
  });

  it('de fyra zoner som saknades i den gamla crsMap matchar nu', () => {
    for (const [key, def] of Object.entries(CRS_DEFS)) {
      expect(matchGeoCRS(def.name).crs).toBe(key);
    }
    expect(matchGeoCRS('Sweref 99 14 15').crs).toBe('sweref991415');
    expect(matchGeoCRS('Sweref 99 15 45').crs).toBe('sweref991545');
    expect(matchGeoCRS('Sweref 99 17 15').crs).toBe('sweref991715');
    expect(matchGeoCRS('Sweref 99 18 45').crs).toBe('sweref991845');
  });

  it('delar upp plan- och höjdsystem på snedstrecket', () => {
    const m = matchGeoCRS('Sweref 99 15 45 / RH2000 (SWEN17)');
    expect(m.planeName).toBe('Sweref 99 15 45');
    expect(m.heightSystem).toBe('RH2000 (SWEN17)');
  });

  it('utan snedstreck finns inget höjdsystem', () => {
    expect(matchGeoCRS('SWEREF 99 TM').heightSystem).toBeNull();
  });

  it('okänt system ger crs null och en varning', () => {
    const r = parseGeo([
      'FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"',
      'begin',
      '\tFileInfo "Coordinate System","RT90 2.5 gon V / RH70"',
      'end',
    ].join('\n'));
    expect(r.fileInfo.crs).toBeNull();
    expect(r.fileInfo.planeName).toBe('RT90 2.5 gon V');
    expect(codes(r)).toContain('unknown-crs');
  });

  it('fil utan FileInfo ger crs null utan varning om okänt system', () => {
    const r = parseGeo('PointList\nbegin\n\tPoint "A",100,200,,,,\nend\n');
    expect(r.fileInfo.crs).toBeNull();
    expect(r.fileInfo.coordinateSystem).toBeNull();
    expect(codes(r)).not.toContain('unknown-crs');
  });
});

describe('robusthet', () => {
  const MINIMAL = [
    'PointList',
    'begin',
    '\tPoint "A",6165000.5,247000.25,100.125,,,',
    '\tPoint "B",6165010,247010,,,,',
    'end',
  ];

  it('samma resultat med CRLF och med LF', () => {
    const lf   = parseGeo(MINIMAL.join('\n'));
    const crlf = parseGeo(MINIMAL.join('\r\n') + '\r\n');
    expect(crlf.points).toEqual(lf.points);
    expect(crlf.points).toHaveLength(2);
  });

  it('saknat H blir null, inte noll', () => {
    const r = parseGeo(MINIMAL.join('\n'));
    expect(r.points[0].H).toBe(100.125);
    expect(r.points[1].H).toBeNull();
  });

  it('tomma block ger tomma listor', () => {
    const r = parseGeo('PointList\nbegin\nend\nLineList\nbegin\nend\nAttributeList\n');
    expect(r.points).toEqual([]);
    expect(r.lines).toEqual([]);
    expect(codes(r)).not.toContain('unexpected-statement');
  });

  it('linje utan hörn ger en varning men ingen krasch', () => {
    const r = parseGeo('LineList\nbegin\n\tLine "1",,\n\tbegin\n\t\tPointList\n\t\tbegin\n\t\tend\n\tend\nend\n');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].vertices).toEqual([]);
    expect(codes(r)).toContain('empty-line');
  });

  it('okänt nyckelord samlas som varning och stoppar inte läsningen', () => {
    const r = parseGeo([
      'PointList',
      'begin',
      '\tPoint "A",1,2,3,,,',
      '\tHittePåSats "x",1',
      '\tPoint "B",4,5,6,,,',
      'end',
    ].join('\n'));
    expect(r.points.map(p => p.name)).toEqual(['A', 'B']);
    expect(codes(r)).toContain('unknown-keyword');
  });

  it('okänt block hoppas över utan att nivåräkningen spårar ur', () => {
    const r = parseGeo([
      'PointList',
      'begin',
      '\tPoint "A",1,2,3,,,',
      '\tOkäntBlock',
      '\tbegin',
      '\t\tPoint "SKAINTELÄSAS",9,9,9,,,',
      '\t\tbegin',
      '\t\tend',
      '\tend',
      '\tPoint "B",4,5,6,,,',
      'end',
    ].join('\n'));
    expect(r.points.map(p => p.name)).toEqual(['A', 'B']);
  });

  it('punkt med skräpkoordinater hoppas över och varnas för', () => {
    const r = parseGeo('PointList\nbegin\n\tPoint "A",abc,2,3,,,\n\tPoint "B",4,5,6,,,\nend\n');
    expect(r.points.map(p => p.name)).toEqual(['B']);
    expect(codes(r)).toContain('invalid-point');
  });

  it('överflödigt end varnar men filen läses klart', () => {
    const r = parseGeo('PointList\nbegin\n\tPoint "A",1,2,3,,,\nend\nend\nLineList\nbegin\n\tLine "1",,\nend\n');
    expect(r.points).toHaveLength(1);
    expect(r.lines).toHaveLength(1);
    expect(codes(r)).toContain('unbalanced-end');
  });

  it('oavslutat block varnar', () => {
    const r = parseGeo('PointList\nbegin\n\tPoint "A",1,2,3,,,\n');
    expect(r.points).toHaveLength(1);
    expect(codes(r)).toContain('missing-end');
  });

  it('tom text ger tomt resultat utan krasch', () => {
    const r = parseGeo('');
    expect(r.points).toEqual([]);
    expect(r.lines).toEqual([]);
    expect(r.fileInfo.crs).toBeNull();
  });

  it('null och undefined tolereras', () => {
    expect(parseGeo(undefined).points).toEqual([]);
    expect(parseGeo(null).lines).toEqual([]);
  });

  it('komma inuti citerat värde delar inte argumentet', () => {
    const r = parseGeo([
      'PointList',
      'begin',
      '\tPoint "A",1,2,3,,,',
      '\tbegin',
      '\t\tAttributeList',
      '\t\tbegin',
      '\t\t\tAttribute "note","tak, vägg och golv"',
      '\t\tend',
      '\tend',
      'end',
    ].join('\n'));
    expect(r.points[0].attrs.note).toBe('tak, vägg och golv');
  });
});

describe('linjeflaggan', () => {
  const line = flag => parseGeo([
    'LineList', 'begin', `\tLine "1",${flag},`, '\tbegin', '\t\tPointList', '\t\tbegin',
    '\t\t\tPoint "01",1,1,,,,', '\t\t\tPoint "02",2,2,,,,',
    '\t\tend', '\tend', 'end',
  ].join('\n')).lines[0];

  it('flaggan 1 betyder sluten linje (hypotes)', () => {
    expect(GEO_LINE_FLAG_CLOSED).toBe('1');
    expect(line('1').closed).toBe(true);
  });

  it('tom flagga betyder öppen linje', () => {
    expect(line('').closed).toBe(false);
  });

  it('andra flaggvärden tolkas som öppen linje', () => {
    expect(line('2').closed).toBe(false);
  });
});

describe('geoBounds', () => {
  it('omsluter både punkter och linjehörn', () => {
    const r = parseGeo(SYD);
    const b = geoBounds(r);
    const allE = [...r.points.map(p => p.E), ...r.lines.flatMap(l => l.vertices.map(v => v.E))];
    expect(b.minE).toBe(Math.min(...allE));
    expect(b.maxE).toBe(Math.max(...allE));
  });

  it('ger null för tomt innehåll', () => {
    expect(geoBounds(parseGeo(''))).toBeNull();
    expect(geoBounds(null)).toBeNull();
  });
});
