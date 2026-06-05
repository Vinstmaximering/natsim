import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sortByColumn, filterByText, filterByType, exportToCSV } from '../src/ui/table-utils.js';

// ── sortByColumn ─────────────────────────────────────────────────────────────

describe('sortByColumn', () => {
  const rows = [
    { id:'C', n:3 },
    { id:'A', n:1 },
    { id:'B', n:2 },
  ];

  it('sorterar numeriskt asc', () => {
    const r = sortByColumn(rows, 'n', 'asc');
    expect(r.map(x => x.n)).toEqual([1, 2, 3]);
  });

  it('sorterar numeriskt desc', () => {
    const r = sortByColumn(rows, 'n', 'desc');
    expect(r.map(x => x.n)).toEqual([3, 2, 1]);
  });

  it('sorterar string lexikografiskt asc', () => {
    const r = sortByColumn(rows, 'id', 'asc');
    expect(r.map(x => x.id)).toEqual(['A', 'B', 'C']);
  });

  it('sorterar string lexikografiskt desc', () => {
    const r = sortByColumn(rows, 'id', 'desc');
    expect(r.map(x => x.id)).toEqual(['C', 'B', 'A']);
  });

  it('muterar inte originalarray', () => {
    const orig = [...rows];
    sortByColumn(rows, 'n', 'desc');
    expect(rows).toEqual(orig);
  });

  it('null-värden sorteras som tom sträng (sist vid asc)', () => {
    const withNull = [{ id:'B', n:null }, { id:'A', n:1 }];
    const r = sortByColumn(withNull, 'n', 'asc');
    expect(r[0].n).toBe(1);
  });

  it('asc är default', () => {
    const r = sortByColumn(rows, 'n');
    expect(r[0].n).toBe(1);
  });
});

// ── filterByText ─────────────────────────────────────────────────────────────

describe('filterByText', () => {
  const rows = [
    { id:'S1', type:'station' },
    { id:'FP1', type:'known' },
    { id:'NY1', type:'new' },
  ];

  it('hittar rad vars id-fält matchar', () => {
    expect(filterByText(rows, 'S1', ['id'])).toHaveLength(1);
    expect(filterByText(rows, 'S1', ['id'])[0].id).toBe('S1');
  });

  it('är case-insensitiv', () => {
    expect(filterByText(rows, 'fp', ['id'])).toHaveLength(1);
  });

  it('söker i flera fält', () => {
    expect(filterByText(rows, 'known', ['id','type'])).toHaveLength(1);
  });

  it('returnerar alla rader vid tom query', () => {
    expect(filterByText(rows, '', ['id'])).toHaveLength(3);
  });

  it('returnerar tom array vid ingen träff', () => {
    expect(filterByText(rows, 'ZZZZZ', ['id'])).toHaveLength(0);
  });
});

// ── filterByType ─────────────────────────────────────────────────────────────

describe('filterByType', () => {
  const rows = [
    { id:'A', type:'station' },
    { id:'B', type:'known' },
    { id:'C', type:'new' },
  ];

  it('filtrerar på en typ', () => {
    const r = filterByType(rows, ['station']);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('station');
  });

  it('filtrerar på flera typer', () => {
    const r = filterByType(rows, ['station','known']);
    expect(r).toHaveLength(2);
  });

  it('tom allowedTypes returnerar alla rader', () => {
    expect(filterByType(rows, [])).toHaveLength(3);
  });

  it('stöder anpassat typeKey', () => {
    const r2 = [{ k:'a' }, { k:'b' }];
    expect(filterByType(r2, ['a'], 'k')).toHaveLength(1);
  });
});

// ── exportToCSV ───────────────────────────────────────────────────────────────

describe('exportToCSV', () => {
  // Fånga Blob-innehåll utan att trigga riktig nedladdning
  let blobContent = '';
  let capturedFilename = '';

  beforeEach(() => {
    blobContent = '';
    capturedFilename = '';
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });

    // Spara original createElement och ersätt a-klick med noop
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag !== 'a') return origCreate(tag);
      const a = origCreate('a');
      Object.defineProperty(a, 'download', {
        set(v) { capturedFilename = v; },
        get()  { return capturedFilename; },
        configurable: true,
      });
      a.click = () => {};
      return a;
    });

    // Fånga Blob-innehåll
    const OrigBlob = globalThis.Blob;
    vi.spyOn(globalThis, 'Blob').mockImplementation(function(parts, opts) {
      blobContent = parts[0];
      return new OrigBlob(parts, opts);
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('CSV-innehåll börjar med kolumnrubrik', () => {
    exportToCSV([{ id:'A' }], [{ key:'id', label:'Punkt-ID' }], 'test');
    expect(blobContent).toMatch(/^﻿?Punkt-ID/);
  });

  it('CSV-innehåll innehåller radens värde', () => {
    exportToCSV([{ id:'S1', n:200 }], [
      { key:'id', label:'ID' },
      { key:'n',  label:'N' },
    ], 'test');
    expect(blobContent).toContain('S1');
    expect(blobContent).toContain('200');
  });

  it('escapar komma i cellvärde med citattecken', () => {
    exportToCSV([{ id:'A,B' }], [{ key:'id', label:'ID' }], 'x');
    expect(blobContent).toContain('"A,B"');
  });

  it('lägger till .csv om suffix saknas', () => {
    exportToCSV([], [{ key:'id', label:'ID' }], 'mitt-fil');
    expect(capturedFilename).toBe('mitt-fil.csv');
  });

  it('lägger inte till .csv om suffix redan finns', () => {
    exportToCSV([], [{ key:'id', label:'ID' }], 'mitt-fil.csv');
    expect(capturedFilename).toBe('mitt-fil.csv');
  });
});
