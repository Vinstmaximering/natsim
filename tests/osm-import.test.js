// OSM-import-tester: mockad fetch + parsing-logik
// fetchOSMBuildings och parseOSMtoObstacles importeras direkt (inga DOM-beroenden).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchOSMBuildings, fetchOSMBuildingsWithRetry, parseOSMtoObstacles } from '../src/io/osm-import.js';

// ─── Exempeldata från Overpass ────────────────────────────────────────────────
// Simulerar ett svar med 2 byggnader nära Stockholm (WGS84-koordinater)

const SAMPLE_OSM = {
  version: 0.6,
  elements: [
    // Noder för byggnad A (rektangel)
    { type: 'node', id: 1, lat: 59.3325, lon: 18.0650 },
    { type: 'node', id: 2, lat: 59.3325, lon: 18.0660 },
    { type: 'node', id: 3, lat: 59.3330, lon: 18.0660 },
    { type: 'node', id: 4, lat: 59.3330, lon: 18.0650 },
    // Stängd way (nod[0] == nod[4])
    { type: 'way', id: 100, nodes: [1, 2, 3, 4, 1], tags: { building: 'yes', name: 'Testbyggnad' } },
    // Noder för byggnad B (triangel, inget namn)
    { type: 'node', id: 5, lat: 59.3340, lon: 18.0670 },
    { type: 'node', id: 6, lat: 59.3340, lon: 18.0680 },
    { type: 'node', id: 7, lat: 59.3345, lon: 18.0675 },
    { type: 'way', id: 101, nodes: [5, 6, 7, 5], tags: { building: 'yes' } },
  ],
};

const SAMPLE_BOUNDS = { south: 59.33, west: 18.06, north: 59.34, east: 18.07 };

// ─── fetchOSMBuildings ────────────────────────────────────────────────────────

describe('fetchOSMBuildings', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('gör POST-request till Overpass API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => SAMPLE_OSM,
    });

    const result = await fetchOSMBuildings(SAMPLE_BOUNDS);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(opts.method).toBe('POST');
    expect(opts.body).toContain('building');
    expect(opts.body).toContain('59.33');  // south
    expect(opts.body).toContain('18.07');  // east
    expect(result).toEqual(SAMPLE_OSM);
  });

  it('query innehåller both way och relation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => SAMPLE_OSM,
    });

    await fetchOSMBuildings(SAMPLE_BOUNDS);
    const body = decodeURIComponent(fetch.mock.calls[0][1].body);
    expect(body).toContain('way["building"]');
    expect(body).toContain('relation["building"]');
    expect(body).toContain('[out:json]');
  });

  it('kastar informativt fel vid 429 rate limit', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchOSMBuildings(SAMPLE_BOUNDS)).rejects.toThrow('429');
  });

  it('kastar informativt fel vid 500 server error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchOSMBuildings(SAMPLE_BOUNDS)).rejects.toThrow('500');
  });

  it('kastar informativt fel vid nätverksavbrott', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchOSMBuildings(SAMPLE_BOUNDS)).rejects.toThrow(/Nätverksfel|Failed to fetch/);
  });
});

// ─── parseOSMtoObstacles ─────────────────────────────────────────────────────

describe('parseOSMtoObstacles', () => {
  it('null-input → tom array, ingen krasch', () => {
    expect(parseOSMtoObstacles(null, 'sweref99tm')).toEqual([]);
  });

  it('tomt elements-fält → tom array', () => {
    expect(parseOSMtoObstacles({ elements: [] }, 'sweref99tm')).toEqual([]);
  });

  it('saknat elements-fält → tom array', () => {
    expect(parseOSMtoObstacles({}, 'sweref99tm')).toEqual([]);
  });

  it('konverterar OSM-way till polygon-obstacle', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(obs.length).toBe(2);
    expect(obs[0].type).toBe('polygon');
    expect(obs[0].source).toBe('osm');
    expect(obs[0].osmId).toBe(100);
  });

  it('label sätts till tags.name om det finns', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(obs[0].label).toBe('Testbyggnad');
  });

  it('label är "OSM-byggnad" när name saknas', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(obs[1].label).toBe('OSM-byggnad');
  });

  it('stängd way: sista duplicat-nod tas bort', () => {
    // Way 100 har nodes [1,2,3,4,1] → 4 unika hörn efter popning av avslutande 1
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(obs[0].points.length).toBe(4);
  });

  it('triangel utan avslutande duplikat: 3 hörn bevaras', () => {
    // Way 101: [5,6,7,5] → pop last → 3 hörn
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(obs[1].points.length).toBe(3);
  });

  it('konverterar WGS84 → SWEREF99 TM (rimliga koordinater)', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    for (const [E, N] of obs[0].points) {
      // Stockholm-trakten: E ≈ 655 000–680 000, N ≈ 6 570 000–6 590 000
      expect(E).toBeGreaterThan(600_000);
      expect(E).toBeLessThan(750_000);
      expect(N).toBeGreaterThan(6_500_000);
      expect(N).toBeLessThan(6_700_000);
    }
  });

  it('points är [E, N]-arrayer, inte objekt', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    for (const pt of obs[0].points) {
      expect(Array.isArray(pt)).toBe(true);
      expect(pt.length).toBe(2);
    }
  });

  it('way med < 3 noder ignoreras', () => {
    const data = {
      elements: [
        { type: 'node', id: 1, lat: 59.33, lon: 18.06 },
        { type: 'node', id: 2, lat: 59.34, lon: 18.07 },
        { type: 'way',  id: 300, nodes: [1, 2], tags: { building: 'yes' } },
      ],
    };
    expect(parseOSMtoObstacles(data, 'sweref99tm').length).toBe(0);
  });

  it('way med saknade nod-refs ger inte krasch', () => {
    const data = {
      elements: [
        { type: 'node', id: 1, lat: 59.33, lon: 18.06 },
        // noder 999, 1000 saknas
        { type: 'way', id: 400, nodes: [1, 999, 1000, 1], tags: { building: 'yes' } },
      ],
    };
    expect(() => parseOSMtoObstacles(data, 'sweref99tm')).not.toThrow();
    // Filtrerade noder: [pt1, pt1] → after dedup-closing-pop → [pt1] → < 3 → ignoreras
    expect(parseOSMtoObstacles(data, 'sweref99tm').length).toBe(0);
  });

  it('multipolygon-relation med outer-member → obstacle', () => {
    const data = {
      elements: [
        { type: 'node', id: 1, lat: 59.33,  lon: 18.06  },
        { type: 'node', id: 2, lat: 59.33,  lon: 18.07  },
        { type: 'node', id: 3, lat: 59.34,  lon: 18.07  },
        { type: 'node', id: 4, lat: 59.34,  lon: 18.065 },
        { type: 'node', id: 5, lat: 59.335, lon: 18.06  },
        // Outer way: 5-kant
        { type: 'way', id: 200, nodes: [1, 2, 3, 4, 5, 1] },
        // Relation som refererar outer way
        {
          type: 'relation', id: 500,
          tags: { building: 'yes', type: 'multipolygon', name: 'L-huset' },
          members: [
            { type: 'way', ref: 200, role: 'outer' },
          ],
        },
      ],
    };
    const obs = parseOSMtoObstacles(data, 'sweref99tm');
    const rel = obs.find(o => o.osmId === 500);
    expect(rel).toBeDefined();
    expect(rel.type).toBe('polygon');
    expect(rel.label).toBe('L-huset');
    expect(rel.source).toBe('osm');
    expect(rel.points.length).toBe(5); // stängd → 5 unika
  });

  it('relation utan outer members ignoreras', () => {
    const data = {
      elements: [
        {
          type: 'relation', id: 600,
          tags: { building: 'yes', type: 'multipolygon' },
          members: [{ type: 'way', ref: 999, role: 'inner' }],
        },
      ],
    };
    expect(parseOSMtoObstacles(data, 'sweref99tm').length).toBe(0);
  });

  it('obstacle har osmId som nummer', () => {
    const obs = parseOSMtoObstacles(SAMPLE_OSM, 'sweref99tm');
    expect(typeof obs[0].osmId).toBe('number');
  });
});

// ─── fetchOSMBuildingsWithRetry ───────────────────────────────────────────────

describe('fetchOSMBuildingsWithRetry', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('lyckat första försök → returnerar data utan retry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => SAMPLE_OSM,
    });
    const onRetrying = vi.fn();
    const delayFn    = vi.fn().mockResolvedValue();

    const result = await fetchOSMBuildingsWithRetry(SAMPLE_BOUNDS, { onRetrying, delayFn });

    expect(fetch).toHaveBeenCalledOnce();
    expect(onRetrying).not.toHaveBeenCalled();
    expect(delayFn).not.toHaveBeenCalled();
    expect(result).toEqual(SAMPLE_OSM);
  });

  it('första 429 → onRetrying kallas → delay → andra lyckas', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SAMPLE_OSM });

    const onRetrying = vi.fn();
    const delayFn    = vi.fn().mockResolvedValue();

    const result = await fetchOSMBuildingsWithRetry(SAMPLE_BOUNDS, { onRetrying, delayFn });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onRetrying).toHaveBeenCalledOnce();
    expect(delayFn).toHaveBeenCalledWith(3000);
    expect(result).toEqual(SAMPLE_OSM);
  });

  it('båda försöken ger 429 → kastar Error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const delayFn = vi.fn().mockResolvedValue();

    await expect(
      fetchOSMBuildingsWithRetry(SAMPLE_BOUNDS, { delayFn })
    ).rejects.toThrow('429');

    expect(fetch).toHaveBeenCalledTimes(2); // försökte två gånger
  });

  it('icke-429-fel (500) → ingen retry, kastar direkt', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const onRetrying = vi.fn();
    const delayFn    = vi.fn().mockResolvedValue();

    await expect(
      fetchOSMBuildingsWithRetry(SAMPLE_BOUNDS, { onRetrying, delayFn })
    ).rejects.toThrow('500');

    expect(fetch).toHaveBeenCalledOnce(); // inget retry för 500
    expect(onRetrying).not.toHaveBeenCalled();
    expect(delayFn).not.toHaveBeenCalled();
  });

  it('nätverksfel → ingen retry, kastar direkt', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const onRetrying = vi.fn();
    const delayFn    = vi.fn().mockResolvedValue();

    await expect(
      fetchOSMBuildingsWithRetry(SAMPLE_BOUNDS, { onRetrying, delayFn })
    ).rejects.toThrow(/Nätverksfel|Failed to fetch/);

    expect(fetch).toHaveBeenCalledOnce();
    expect(onRetrying).not.toHaveBeenCalled();
  });
});
