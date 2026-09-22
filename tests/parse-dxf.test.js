// Etapp 6: ASCII-DXF-parsern.
// Testfilerna är små och handskrivna – formatet är rader i par, så det går att
// skriva läsbara exempel direkt i testet.

import { describe, it, expect } from 'vitest';
import {
  parseDxf, dxfBounds, DxfParseError, DXF_UNITS, DXF_UNIT_CHOICES, DXF_DEFAULT_UNIT,
  DXF_SUPPORTED_TYPES,
} from '../src/io/parse-dxf.js';

// Bygger en DXF ur [kod, värde]-par. Radbrytningarna är LF; CRLF testas separat.
const dxf = (...pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';

const SECTION = n => [[0, 'SECTION'], [2, n]];
const ENDSEC  = [[0, 'ENDSEC']];
const EOF     = [[0, 'EOF']];

const entities = (...body) => dxf(...SECTION('ENTITIES'), ...body, ...ENDSEC, ...EOF);

const LINE = (layer, x1, y1, x2, y2, z1 = 0, z2 = 0) => [
  [0, 'LINE'], [8, layer],
  [10, x1], [20, y1], [30, z1],
  [11, x2], [21, y2], [31, z2],
];

const codes = r => r.warnings.map(w => w.code);

describe('grundstruktur', () => {
  it('läser en LINE med lager och koordinater', () => {
    const r = parseDxf(entities(...LINE('MUR', 1, 2, 3, 4, 10, 11)));
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0]).toEqual({
      type: 'LINE', layer: 'MUR',
      a: { x: 1, y: 2, z: 10 },
      b: { x: 3, y: 4, z: 11 },
    });
  });

  it('läser en POINT', () => {
    const r = parseDxf(entities([0, 'POINT'], [8, 'DUBB'], [10, 100], [20, 200], [30, 5]));
    expect(r.entities[0]).toEqual({ type: 'POINT', layer: 'DUBB', p: { x: 100, y: 200, z: 5 } });
  });

  it('objekt utan lagerkod hamnar på lager 0', () => {
    const r = parseDxf(entities([0, 'POINT'], [10, 1], [20, 2]));
    expect(r.entities[0].layer).toBe('0');
  });

  it('CRLF och LF ger samma resultat', () => {
    const lf = entities(...LINE('A', 0, 0, 1, 1));
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(parseDxf(crlf).entities).toEqual(parseDxf(lf).entities);
  });

  it('innehåll utanför ENTITIES ignoreras', () => {
    const src = dxf(
      ...SECTION('TABLES'), [0, 'LINE'], [8, 'SKAINTELÄSAS'], [10, 9], [20, 9], ...ENDSEC,
      ...SECTION('ENTITIES'), ...LINE('A', 0, 0, 1, 1), ...ENDSEC, ...EOF);
    expect(parseDxf(src).entities.map(e => e.layer)).toEqual(['A']);
  });

  it('tom fil ger tomt resultat utan krasch', () => {
    const r = parseDxf('');
    expect(r.entities).toEqual([]);
    expect(r.layers).toEqual([]);
  });

  it('null och undefined tolereras', () => {
    expect(parseDxf(undefined).entities).toEqual([]);
    expect(parseDxf(null).layers).toEqual([]);
  });

  it('de fyra stödda typerna är de som dokumenteras', () => {
    expect(DXF_SUPPORTED_TYPES).toEqual(['LINE', 'LWPOLYLINE', 'POLYLINE', 'POINT']);
  });
});

describe('binär DXF', () => {
  it('avvisas med ett begripligt felmeddelande', () => {
    const bin = 'AutoCAD Binary DXF\r\n\x1a\x00' + '\x00\x01\x02';
    expect(() => parseDxf(bin)).toThrow(DxfParseError);
    try { parseDxf(bin); } catch (e) {
      expect(e.code).toBe('binary');
      expect(e.message).toMatch(/binär DXF/i);
      expect(e.message).toMatch(/ASCII/);
    }
  });
});

describe('LWPOLYLINE', () => {
  const lw = (flags, ...vs) => [
    [0, 'LWPOLYLINE'], [8, 'KONTUR'], [90, vs.length], [70, flags],
    ...vs.flatMap(([x, y]) => [[10, x], [20, y]]),
  ];

  it('läser hörnen i ordning', () => {
    const r = parseDxf(entities(...lw(0, [0, 0], [10, 0], [10, 10])));
    const e = r.entities[0];
    expect(e.type).toBe('LWPOLYLINE');
    expect(e.vertices.map(v => [v.x, v.y])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(e.closed).toBe(false);
  });

  it('flagga 1 i grupp 70 betyder sluten', () => {
    expect(parseDxf(entities(...lw(1, [0, 0], [1, 0], [1, 1]))).entities[0].closed).toBe(true);
    // Andra bitar är andra egenskaper (128 = plinegen) och sluter inte linjen.
    expect(parseDxf(entities(...lw(128, [0, 0], [1, 0]))).entities[0].closed).toBe(false);
    // Bit 1 satt tillsammans med andra bitar räknas fortfarande som sluten.
    expect(parseDxf(entities(...lw(129, [0, 0], [1, 0]))).entities[0].closed).toBe(true);
  });

  it('elevation (kod 38) blir hörnens z', () => {
    const r = parseDxf(entities(
      [0, 'LWPOLYLINE'], [8, 'A'], [90, 2], [70, 0], [38, 42.5],
      [10, 0], [20, 0], [10, 5], [20, 5]));
    expect(r.entities[0].vertices.every(v => v.z === 42.5)).toBe(true);
  });

  it('bulge räknas och varnas för, men linjen läses ändå', () => {
    const r = parseDxf(entities(
      [0, 'LWPOLYLINE'], [8, 'A'], [90, 3], [70, 0],
      [10, 0], [20, 0], [42, 0.5],
      [10, 5], [20, 0], [42, 0],
      [10, 5], [20, 5]));
    expect(r.entities[0].bulges).toBe(1);
    expect(r.entities[0].vertices).toHaveLength(3);
    expect(codes(r)).toContain('bulge');
    expect(r.warnings.find(w => w.code === 'bulge').message).toMatch(/1 bågsegment/);
  });

  it('fel antal i kod 90 varnar men de lästa hörnen används', () => {
    const r = parseDxf(entities(
      [0, 'LWPOLYLINE'], [8, 'A'], [90, 7], [70, 0], [10, 0], [20, 0], [10, 1], [20, 1]));
    expect(r.entities[0].vertices).toHaveLength(2);
    expect(codes(r)).toContain('vertex-count');
  });
});

describe('POLYLINE / VERTEX / SEQEND', () => {
  const poly = (flags, ...vs) => [
    [0, 'POLYLINE'], [8, 'GAMMAL'], [66, 1], [70, flags],
    ...vs.flatMap(([x, y, z = 0]) => [[0, 'VERTEX'], [8, 'GAMMAL'], [10, x], [20, y], [30, z]]),
    [0, 'SEQEND'], [8, 'GAMMAL'],
  ];

  it('samlar VERTEX-objekten fram till SEQEND', () => {
    const r = parseDxf(entities(...poly(0, [0, 0], [10, 0, 3], [10, 10])));
    expect(r.entities).toHaveLength(1);
    const e = r.entities[0];
    expect(e.type).toBe('POLYLINE');
    expect(e.layer).toBe('GAMMAL');
    expect(e.vertices).toEqual([
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 3 }, { x: 10, y: 10, z: 0 },
    ]);
  });

  it('flagga 1 betyder sluten', () => {
    expect(parseDxf(entities(...poly(1, [0, 0], [1, 0], [1, 1]))).entities[0].closed).toBe(true);
  });

  it('VERTEX räknas inte som egna objekt', () => {
    const r = parseDxf(entities(...poly(0, [0, 0], [1, 1])));
    expect(r.layers.find(l => l.name === 'GAMMAL').counts.VERTEX).toBeUndefined();
    expect(r.layers.find(l => l.name === 'GAMMAL').counts.POLYLINE).toBe(1);
  });

  it('ett objekt efter SEQEND läses normalt', () => {
    const r = parseDxf(entities(...poly(0, [0, 0], [1, 1]), ...LINE('EFTER', 2, 2, 3, 3)));
    expect(r.entities.map(e => e.type)).toEqual(['POLYLINE', 'LINE']);
  });

  it('saknad SEQEND avbryter ändå snyggt', () => {
    const r = parseDxf(entities(
      [0, 'POLYLINE'], [8, 'A'], [70, 0],
      [0, 'VERTEX'], [8, 'A'], [10, 0], [20, 0],
      [0, 'VERTEX'], [8, 'A'], [10, 1], [20, 1],
      ...LINE('B', 5, 5, 6, 6)));
    expect(r.entities[0].vertices).toHaveLength(2);
    expect(r.entities[1].type).toBe('LINE');
  });
});

describe('enheter ($INSUNITS)', () => {
  const header = kod => dxf(
    ...SECTION('HEADER'), [9, '$INSUNITS'], [70, kod], ...ENDSEC,
    ...SECTION('ENTITIES'), ...LINE('A', 0, 0, 1, 1), ...ENDSEC, ...EOF);

  it('kodvärdena stämmer med DXF Reference för de vanliga enheterna', () => {
    expect(DXF_UNITS[1].factor).toBe(0.0254);        // tum
    expect(DXF_UNITS[2].factor).toBe(0.3048);        // fot
    expect(DXF_UNITS[4].factor).toBe(0.001);         // millimeter
    expect(DXF_UNITS[5].factor).toBe(0.01);          // centimeter
    expect(DXF_UNITS[6].factor).toBe(1);             // meter
    expect(DXF_UNITS[7].factor).toBe(1000);          // kilometer
    expect(DXF_UNITS[14].factor).toBe(0.1);          // decimeter
    expect(DXF_UNITS[0].factor).toBeNull();          // enhetslös
    // US survey foot är 1200/3937 m exakt, inte 0,3048.
    expect(DXF_UNITS[21].factor).toBeCloseTo(0.30480060960, 10);
    expect(DXF_UNITS[21].factor).not.toBe(0.3048);
  });

  it('läser enheten ur filen', () => {
    const r = parseDxf(header(4));
    expect(r.header.insunits).toBe(4);
    expect(r.header.unitName).toBe('Millimeter');
    expect(r.header.unitFactor).toBe(0.001);
    expect(codes(r)).not.toContain('no-insunits');
  });

  it('saknad $INSUNITS varnar så att dialogen kan fråga', () => {
    const r = parseDxf(entities(...LINE('A', 0, 0, 1, 1)));
    expect(r.header.insunits).toBeNull();
    expect(codes(r)).toContain('no-insunits');
  });

  it('enhetslös fil varnar', () => {
    const r = parseDxf(header(0));
    expect(codes(r)).toContain('unitless');
    expect(r.header.unitFactor).toBeNull();
  });

  it('okänd kod varnar men stoppar inte läsningen', () => {
    const r = parseDxf(header(99));
    expect(codes(r)).toContain('unknown-insunits');
    expect(r.entities).toHaveLength(1);
  });

  it('valbara enheter i dialogen är de praktiskt användbara, meter först', () => {
    expect(DXF_UNIT_CHOICES[0]).toBe(6);
    expect(DXF_DEFAULT_UNIT).toBe(6);
    for (const k of DXF_UNIT_CHOICES) expect(DXF_UNITS[k]).toBeDefined();
  });
});

describe('lagerlistan', () => {
  const blandad = entities(
    ...LINE('MUR', 0, 0, 1, 1),
    ...LINE('MUR', 1, 1, 2, 2),
    [0, 'POINT'], [8, 'DUBB'], [10, 5], [20, 5],
    [0, 'TEXT'], [8, 'TEXTLAGER'], [10, 0], [20, 0], [1, 'Hej'],
    [0, 'HATCH'], [8, 'TEXTLAGER'],
    [0, 'CIRCLE'], [8, 'MUR'], [10, 0], [20, 0], [40, 5]);

  it('räknar per lager och entitetstyp', () => {
    const r = parseDxf(blandad);
    const mur = r.layers.find(l => l.name === 'MUR');
    expect(mur.counts).toEqual({ LINE: 2, CIRCLE: 1 });
    expect(mur.total).toBe(3);
    expect(mur.supportedTotal).toBe(2);
    expect(mur.supported).toBe(true);
  });

  it('lager med bara ej stödda objekt markeras som ej stödda', () => {
    const r = parseDxf(blandad);
    const t = r.layers.find(l => l.name === 'TEXTLAGER');
    expect(t.counts).toEqual({ TEXT: 1, HATCH: 1 });
    expect(t.supportedTotal).toBe(0);
    expect(t.supported).toBe(false);
  });

  it('lagren kommer i bokstavsordning', () => {
    expect(parseDxf(blandad).layers.map(l => l.name)).toEqual(['DUBB', 'MUR', 'TEXTLAGER']);
  });

  it('ej stödda typer ger en varning som räknar upp dem', () => {
    const r = parseDxf(blandad);
    const w = r.warnings.find(x => x.code === 'unsupported-entity');
    expect(w.message).toMatch(/3 objekt/);
    expect(w.message).toMatch(/CIRCLE/);
    expect(w.message).toMatch(/HATCH/);
    expect(w.message).toMatch(/TEXT/);
  });

  it('INSERT hoppas över precis som övriga ostödda typer', () => {
    const r = parseDxf(entities([0, 'INSERT'], [8, 'BLOCK'], [2, 'SYMBOL'], [10, 0], [20, 0]));
    expect(r.entities).toEqual([]);
    expect(r.layers[0].counts).toEqual({ INSERT: 1 });
    expect(codes(r)).toContain('unsupported-entity');
  });
});

describe('robusthet', () => {
  it('en skadad kodrad hoppas över utan att resten tappas', () => {
    const src = entities(...LINE('A', 0, 0, 1, 1)).replace('\n0\nLINE', '\nSKRÄP\nLINE');
    const r = parseDxf(src);
    expect(codes(r)).toContain('bad-pair');
    // Läsningen fortsätter – filen blir inte tom.
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('en fil utan EOF läses ändå', () => {
    const r = parseDxf(dxf(...SECTION('ENTITIES'), ...LINE('A', 0, 0, 1, 1)));
    expect(r.entities).toHaveLength(1);
  });

  it('samma varning upprepas inte', () => {
    const r = parseDxf(entities(
      [0, 'TEXT'], [8, 'A'], [0, 'TEXT'], [8, 'A'], [0, 'TEXT'], [8, 'A']));
    expect(r.warnings.filter(w => w.code === 'unsupported-entity')).toHaveLength(1);
  });
});

describe('dxfBounds', () => {
  const src = entities(
    ...LINE('A', 0, 0, 10, 20),
    [0, 'POINT'], [8, 'B'], [10, -5], [20, 30]);

  it('omsluter allt innehåll i ritningens egna koordinater', () => {
    const r = parseDxf(src);
    expect(dxfBounds(r.entities)).toEqual({ minX: -5, maxX: 10, minY: 0, maxY: 30 });
  });

  it('kan begränsas till valda lager', () => {
    const r = parseDxf(src);
    expect(dxfBounds(r.entities, new Set(['A']))).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 20 });
  });

  it('ger null utan innehåll', () => {
    expect(dxfBounds([])).toBeNull();
    expect(dxfBounds(null)).toBeNull();
  });
});
