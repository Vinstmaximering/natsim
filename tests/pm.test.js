import { describe, it, expect } from 'vitest'
import { buildReport } from '../src/pm/report-generator.js'

// Testdata som representerar ett komplett simuleringsresultat
const testData = {
  vals: {
    proj:     "Testprojekt Kungsängen",
    projnr:   "TEST-2026-001",
    best:     "Trafikverket",
    utf:      "KO Mätteknik AB",
    ans:      "Anna Testsson",
    nats:     "Bruksnät i plan (§6.4)",
    rapdat:   "2026-06-01",
    sek:      "Öppen",
    plansys:  "SWEREF 99 TM",
    hoj:      "RH 2000",
    geo:      "SWEN17_RH2000",
    kordkalla:"Riksnätet",
    instr:    "Leica TS16 1″",
    serienr:  "12345",
    kalib:    "2026-01-01",
    tvang:    "Leica GZR3",
    swfalt:   "Leica Captivate 7.0",
    swber:    "NätSim Beta 2",
    metod:    "Polär mätning med 3 helsatser",
    korr:     "",
    falt:     "Björn Mätare",
    berakn:   "Anna Testsson",
    krav:     "5",
    leverans: "Digital leverans .geo + rapport",
    r32txt:   "",
    r33txt:   "",
    r312txt:  "",
  },
  sr: {
    K_global:    0.750,
    meas_n:      6,
    unkn_n:      3,
    redundancy:  3,
    rMean:       0.500,
    rMinDist:    0.479,
    rMinHz:      0.521,
    kappa:       2.80,
    redundTotal: "3.00",
    datumDesc:   "Absolut anslutning – 3 kända punkter",
    nCoordUnkn:  2,
    nOrientUnkn: 1,
  },
  redund: [
    { ri:0.479, type:"dist", fromId:"S1", toId:"FP1", d:100.0, mdb:{ val:0.01214, unit:"dist" }, yt_m:0.00632 },
    { ri:0.521, type:"hz",   fromId:"S1", toId:"FP1", d:100.0, mdb:{ val:0.01145, unit:"hz"   }, yt_m:0.00548 },
    { ri:0.510, type:"dist", fromId:"S1", toId:"FP2", d:154.0, mdb:{ val:0.01236, unit:"dist" }, yt_m:0.00606 },
    { ri:0.490, type:"hz",   fromId:"S1", toId:"FP2", d:154.0, mdb:{ val:0.01192, unit:"hz"   }, yt_m:0.00607 },
    { ri:0.505, type:"dist", fromId:"S1", toId:"FP3", d:120.0, mdb:{ val:0.01225, unit:"dist" }, yt_m:0.00606 },
    { ri:0.495, type:"hz",   fromId:"S1", toId:"FP3", d:120.0, mdb:{ val:0.01212, unit:"hz"   }, yt_m:0.00612 },
  ],
  ptRes: [
    { id:"S1", type:"station", sigE:0.002166, sigN:0.001832, sigPos:0.002006, aSemi:0.002283, bSemi:0.001684 },
  ],
  allPts: [
    { id:"FP1", type:"known",   N:1620400.000, E:6500100.000, H:45.23,  markering:"Rördubb", prisma:"" },
    { id:"FP2", type:"known",   N:1620554.780, E:6500312.450, H:46.112, markering:"",         prisma:"" },
    { id:"FP3", type:"known",   N:1620480.000, E:6500200.000, H:45.900, markering:"",         prisma:"" },
    { id:"S1",  type:"station", N:1620450.000, E:6500180.000, H:0,      markering:"",         prisma:"Leica Standardprisma" },
  ],
  knownPts: [
    { id:"FP1", N:1620400.000, E:6500100.000, H:45.23,  markering:"Rördubb" },
    { id:"FP2", N:1620554.780, E:6500312.450, H:46.112, markering:""        },
    { id:"FP3", N:1620480.000, E:6500200.000, H:45.900, markering:""        },
  ],
  mk:    null,
  mkKey: "",
  crs:   "SWEREF 99 TM",
  ins:   "Leica TS16 1″",
  mHz:   0.3,
  mDm:   1.0,
  mDp:   1.5,
  mSt:   3,
  dag:   "2026-06-01",
  centerErr: 1.0,
  img:   "",
  imgs:  {},
};

describe('buildReport – rapport-generator', () => {

  it('returnerar en HTML-sträng (ej tom)', () => {
    const html = buildReport(testData);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
  });

  it('innehåller alla 10 numrerade sektioner', () => {
    const html = buildReport(testData);
    for (let i = 1; i <= 10; i++) {
      expect(html, `Sektion ${i} saknas`).toContain(`>${i}.`);
    }
  });

  it('innehåller projektnamn', () => {
    const html = buildReport(testData);
    expect(html).toContain('Testprojekt Kungsängen');
  });

  it('innehåller k-tal formaterat till 3 decimaler', () => {
    const html = buildReport(testData);
    expect(html).toContain('0.750');
  });

  it('innehåller punkt-ID S1 i koordinattabell', () => {
    const html = buildReport(testData);
    expect(html).toContain('S1');
  });

  it('innehåller koordinatsystem', () => {
    const html = buildReport(testData);
    expect(html).toContain('SWEREF 99 TM');
  });

  it('innehåller σ_pos för S1 (2.01 mm)', () => {
    const html = buildReport(testData);
    // sigPos = 0.002006 → 2.01 mm
    expect(html).toContain('2.01');
  });

  it('HTML-escape förhindrar XSS i projektnamn', () => {
    const xssData = { ...testData, vals: { ...testData.vals, proj: '<script>alert(1)</script>' } };
    const html = buildReport(xssData);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('Sektion 7 innehåller k-tal och redundanstabell', () => {
    const html = buildReport(testData);
    expect(html).toContain('>7.');
    expect(html).toContain('Kontrollerbarhet k');
    expect(html).toContain('FP1');
  });

  it('tom vals ger inga undantag', () => {
    const minData = { ...testData, vals: {} };
    expect(() => buildReport(minData)).not.toThrow();
  });

  it('PM URL-konstruktion: BASE_URL + relativ path, ingen dubbel slash', () => {
    // import.meta.env.BASE_URL = '/' i test-env, '/natsim/' i prod
    const base = import.meta.env.BASE_URL;
    const url = `${base}src/pm/pm.html`;
    expect(url).toMatch(/\/src\/pm\/pm\.html$/);
    expect(url).not.toContain('//src');
    expect(url.startsWith(base)).toBe(true);
  });

});