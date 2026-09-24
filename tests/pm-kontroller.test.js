// Etapp 5 – automatiska kontroller, utökad osäkerhet och kravjämförelse.
//
// Kontrollerna är rena funktioner (src/pm/report/kontroller.js) och prövas
// därför direkt, utan att gå via rapporten. Att de når rapporten prövas sist.

import { describe, it, expect } from 'vitest';
import {
  kontroller, sammanfatta, STATUS_TEXT, konvextHolje, inomHolje,
} from '../src/pm/report/kontroller.js';
import { jamforKrav, kravFaktor, kravStorhet } from '../src/pm/report/simulering.js';
import {
  TDOK_TABELL3_JARNVAG, identifieraForval, avvikelserMotTabell3,
} from '../src/data/tdok-apriori.js';
import { buildReport } from '../src/pm/report-generator.js';

// ── Ett ctx som kontrollerna kan läsa ───────────────────────────────────────

const ctx = (o = {}) => ({
  verksamhet: 'vag', nattyp: 'bruksnat',
  sr: { K_global: 0.75, meas_n: 12, unkn_n: 3, redundancy: 9 },
  redund: [
    { ri: 0.60, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100 },
    { ri: 0.55, type: 'hz',   fromId: 'S1', toId: 'FP1', d: 100 },
  ],
  allPts: [{ id: 'FP1' }, { id: 'FP2' }, { id: 'FP3' }, { id: 'S1' }],
  mkKey: 'G3',
  tvangutr: 'Leica GZR3', tvang: '',
  termometer: 'Testo 925', barometer: 'Testo 511',
  mHz: 0.5, mDm: 3, mDp: 3, centerErr: 2,
  nGemensam: 0, byggnadsverk: null, visuellaLager: [],
  kravk: '2', kravSP: null,
  ...o,
});

const hitta = (rader, del) => rader.find(r => r.krav.includes(del));

// ── §2.8 K3 ─────────────────────────────────────────────────────────────────

describe('bruksnät: k-tal och r-tal (§2.8 K3)', () => {
  it('k > 0,50 ger uppfyllt', () => {
    const r = hitta(kontroller(ctx()), 'k-tal för nätet');
    expect(r.status).toBe('ok');
    expect(r.kalla).toContain('§2.8 K3');
    expect(r.resultat).toContain('0,750');
  });

  // Gränsfallen från Etapp 2 ska slå igenom i rapportens kontrolltabell.
  it('k = 0,50 exakt ger ej uppfyllt', () => {
    const r = hitta(kontroller(ctx({ sr: { K_global: 0.50, meas_n: 12, unkn_n: 6, redundancy: 6 } })),
                    'k-tal för nätet');
    expect(r.status).toBe('fel');
  });

  it('k = 0,5001 ger uppfyllt', () => {
    const r = hitta(kontroller(ctx({ sr: { K_global: 0.5001, meas_n: 12, unkn_n: 6, redundancy: 6 } })),
                    'k-tal för nätet');
    expect(r.status).toBe('ok');
  });

  it('r = 0,35 exakt ger ej uppfyllt och pekar ut observationen', () => {
    const r = hitta(kontroller(ctx({
      redund: [{ ri: 0.35, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100 },
               { ri: 0.60, type: 'hz', fromId: 'S1', toId: 'FP2', d: 100 }],
    })), 'Enskilda mätningar');
    expect(r.status).toBe('fel');
    expect(r.resultat).toContain('S1→FP1');
    expect(r.resultat).toContain('1 av 2');
  });

  it('r = 0,3501 ger uppfyllt', () => {
    const r = hitta(kontroller(ctx({
      redund: [{ ri: 0.3501, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100 }],
    })), 'Enskilda mätningar');
    expect(r.status).toBe('ok');
  });

  it('ett nät utan observationer är inte uppfyllt', () => {
    const r = hitta(kontroller(ctx({ redund: [] })), 'Enskilda mätningar');
    expect(r.status).toBe('fel');
  });
});

// ── §2.8 K16, K15, K19 ──────────────────────────────────────────────────────

describe('bruksnät: mätklass och utrustning', () => {
  it('G3 uppfyller §2.8 K16, andra klasser inte', () => {
    expect(hitta(kontroller(ctx()), 'Mätklass G3').status).toBe('ok');
    expect(hitta(kontroller(ctx({ mkKey: 'G2' })), 'Mätklass G3').status).toBe('fel');
    expect(hitta(kontroller(ctx({ mkKey: '' })), 'Mätklass G3').status).toBe('fel');
    expect(hitta(kontroller(ctx()), 'Mätklass G3').kalla).toContain('§2.8 K16');
  });

  it('tvångscentrering (K15) kräver ett ifyllt fält', () => {
    expect(hitta(kontroller(ctx()), 'Tvångscentrering').status).toBe('ok');
    expect(hitta(kontroller(ctx({ tvangutr: '', tvang: '' })), 'Tvångscentrering').status).toBe('fel');
    expect(hitta(kontroller(ctx({ tvangutr: '   ' })), 'Tvångscentrering').status).toBe('fel');
    // Det gamla fältet v_tvang duger också – ett utkast kan ha bara det.
    expect(hitta(kontroller(ctx({ tvangutr: '', tvang: 'Leica GZR3' })), 'Tvångscentrering').status)
      .toBe('ok');
  });

  it('termometer och barometer (K19) kräver båda', () => {
    expect(hitta(kontroller(ctx()), 'Temperatur och lufttryck').status).toBe('ok');
    const utanBar = hitta(kontroller(ctx({ barometer: '' })), 'Temperatur och lufttryck');
    expect(utanBar.status).toBe('fel');
    expect(utanBar.resultat).toContain('barometer');
    const utanBåda = hitta(kontroller(ctx({ termometer: '', barometer: '' })), 'Temperatur och lufttryck');
    expect(utanBåda.resultat).toContain('termometer');
    expect(utanBåda.resultat).toContain('barometer');
  });
});

// ── §2.8 K24 / K25 – viktsättning ───────────────────────────────────────────

describe('viktsättning', () => {
  it('väg: §2.8 K24 kan inte avgöras av programmet', () => {
    const r = hitta(kontroller(ctx({ verksamhet: 'vag' })), 'Viktsättning enligt SIS-TS');
    expect(r.status).toBe('manuell');
    expect(r.kalla).toContain('§2.8 K24');
  });

  it('järnväg: a priori-värdena jämförs mot Tabell 3 (§2.8 K25)', () => {
    const r = hitta(kontroller(ctx({ verksamhet: 'jarnvag' })), 'Viktsättning enligt Tabell 3');
    expect(r.status).toBe('ok');
    expect(r.kalla).toContain('§2.8 K25');
    expect(r.detaljer).toHaveLength(4);
    expect(r.detaljer.every(d => !d.avviker)).toBe(true);
  });

  it('avvikelser pekas ut storhet för storhet', () => {
    const r = hitta(kontroller(ctx({ verksamhet: 'jarnvag', mHz: 0.8, mDm: 5 })),
                    'Viktsättning enligt Tabell 3');
    expect(r.status).toBe('fel');
    const avv = r.detaljer.filter(d => d.avviker).map(d => d.storhet);
    expect(avv).toEqual(['Horisontalvinklar', 'Längder, konstantdel']);
    expect(r.resultat).toContain('2 av 4');
  });

  // Ett bättre värde än tabellens är ingen avvikelse att anmärka på.
  it('noggrannare värden än tabellens är inte avvikelser', () => {
    const r = hitta(kontroller(ctx({ verksamhet: 'jarnvag', mHz: 0.3, mDm: 1, mDp: 1, centerErr: 1 })),
                    'Viktsättning enligt Tabell 3');
    expect(r.status).toBe('ok');
  });
});

// ── Tabell 3 som data ───────────────────────────────────────────────────────

describe('TDOK Tabell 3', () => {
  it('har §2.8 K25:s värden för nät i plan', () => {
    expect(TDOK_TABELL3_JARNVAG.sigHz_mgon).toBe(0.5);
    expect(TDOK_TABELL3_JARNVAG.sigDist_mm).toBe(3.0);
    expect(TDOK_TABELL3_JARNVAG.sigDist_ppm).toBe(3.0);
    expect(TDOK_TABELL3_JARNVAG.centerErr).toBe(2.0);
    expect(TDOK_TABELL3_JARNVAG.kalla).toContain('§2.8 K25');
  });

  // Vertikalvinklar och instrument-/signalhöjder påverkar inte 2D-simuleringen.
  it('redovisar de storheter som inte påverkar ett nät i plan', () => {
    const u = TDOK_TABELL3_JARNVAG.utanforPlan;
    expect(u.map(x => x.storhet)).toEqual(['Vertikalvinklar', 'Instrument- och signalhöjder']);
    expect(TDOK_TABELL3_JARNVAG.beskrivning).toContain('påverkar inte ett nät i plan');
  });

  it('identifieraForval känner igen exakta värden och inget annat', () => {
    expect(identifieraForval({ sigHz_mgon: 0.5, sigDist_mm: 3, sigDist_ppm: 3, centerErr: 2 }))
      .toBe(TDOK_TABELL3_JARNVAG);
    expect(identifieraForval({ sigHz_mgon: 0.3, sigDist_mm: 3, sigDist_ppm: 3, centerErr: 2 }))
      .toBeNull();
    expect(identifieraForval(null)).toBeNull();
  });

  it('avvikelselistan täcker fyra storheter', () => {
    const a = avvikelserMotTabell3({ sigHz_mgon: 0.5, sigDist_mm: 3, sigDist_ppm: 3, centerErr: 2 });
    expect(a).toHaveLength(4);
    expect(a.every(x => !x.avviker)).toBe(true);
    expect(a[0].kravVarde).toBe('0,5 mgon');
  });
});

// ── §2.11.2 – bro ───────────────────────────────────────────────────────────

describe('bro', () => {
  const bro = o => kontroller(ctx({ nattyp: 'bro', ...o }));

  it('minst 4 punkter (K2) räknas automatiskt', () => {
    expect(hitta(bro(), 'Minst 4 punkter').status).toBe('ok');
    const få = bro({ allPts: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] });
    expect(hitta(få, 'Minst 4 punkter').status).toBe('fel');
    expect(hitta(få, 'Minst 4 punkter').resultat).toContain('3 punkter');
  });

  it('utan utpekat byggnadsverk kontrolleras omslutningen manuellt', () => {
    const r = hitta(bro(), 'omsluter byggnadsverket');
    expect(r.status).toBe('manuell');
    expect(r.resultat).toContain('Inget visuellt lager');
  });

  it('med utpekat lager innanför höljet blir kravet uppfyllt', () => {
    const r = hitta(bro({
      allPts: [{ id: 'A', E: 0, N: 0 }, { id: 'B', E: 100, N: 0 },
               { id: 'C', E: 100, N: 100 }, { id: 'D', E: 0, N: 100 }],
      byggnadsverk: { namn: 'Bro', punkter: [{ E: 40, N: 40 }, { E: 60, N: 60 }] },
    }), 'omsluter byggnadsverket');
    expect(r.status).toBe('ok');
    expect(r.resultat).toContain('innanför');
  });

  it('objekt utanför höljet ger ej uppfyllt, med antal', () => {
    const r = hitta(bro({
      allPts: [{ id: 'A', E: 0, N: 0 }, { id: 'B', E: 100, N: 0 },
               { id: 'C', E: 100, N: 100 }, { id: 'D', E: 0, N: 100 }],
      byggnadsverk: { namn: 'Bro', punkter: [{ E: 40, N: 40 }, { E: 300, N: 300 }] },
    }), 'omsluter byggnadsverket');
    expect(r.status).toBe('fel');
    expect(r.resultat).toContain('1 av 2');
  });

  it('nätpunkter på en linje kan inte omsluta något', () => {
    const r = hitta(bro({
      allPts: [{ id: 'A', E: 0, N: 0 }, { id: 'B', E: 50, N: 0 },
               { id: 'C', E: 100, N: 0 }, { id: 'D', E: 150, N: 0 }],
      byggnadsverk: { namn: 'Bro', punkter: [{ E: 75, N: 0 }] },
    }), 'omsluter byggnadsverket');
    expect(r.status).toBe('fel');
  });

  it('K4 gäller bara järnväg', () => {
    expect(hitta(bro({ verksamhet: 'vag' }), 'gemensamma')).toBeUndefined();
    const r = hitta(bro({ verksamhet: 'jarnvag', nGemensam: 2 }), 'gemensamma');
    expect(r.status).toBe('ok');
    expect(r.kalla).toContain('§2.11.2 K4');
    expect(hitta(bro({ verksamhet: 'jarnvag', nGemensam: 1 }), 'gemensamma').status).toBe('fel');
  });

  it('simulering enligt §6.2.5 (K5) redovisas', () => {
    const r = hitta(bro(), 'Simulering utförd');
    expect(r.status).toBe('ok');
    expect(r.kalla).toContain('§2.11.2 K5');
  });

  it('K3 om toleranser kan inte avgöras av programmet', () => {
    expect(hitta(bro(), 'Punktantal och konfiguration').status).toBe('manuell');
  });
});

// ── §2.10.2 – tunnel ────────────────────────────────────────────────────────

describe('tunnel', () => {
  const tunnel = o => kontroller(ctx({ nattyp: 'tunnel', ...o }));

  it('simulering enligt §6.2.5 (K2)', () => {
    const r = hitta(tunnel(), 'Simulering utförd');
    expect(r.status).toBe('ok');
    expect(r.kalla).toContain('§2.10.2 K2');
  });

  // NätSim vet inte vilka punkter som ligger i tunneln.
  it('200 m-kravet kontrolleras alltid manuellt', () => {
    const r = hitta(tunnel(), 'Avstånd mellan stompunkter');
    expect(r.status).toBe('manuell');
    expect(r.kalla).toContain('§2.10.2 K3');
  });

  it('listar nätlinjer längre än 200 m som underlag', () => {
    const r = hitta(tunnel({
      redund: [
        { ri: 0.6, type: 'dist', fromId: 'A', toId: 'B', d: 250 },
        { ri: 0.6, type: 'hz',   fromId: 'A', toId: 'B', d: 250 },
        { ri: 0.6, type: 'dist', fromId: 'B', toId: 'C', d: 180 },
        { ri: 0.6, type: 'dist', fromId: 'C', toId: 'D', d: 410 },
      ],
    }), 'Avstånd mellan stompunkter');
    // Riktning och avstånd för samma par räknas en gång.
    expect(r.langaLinjer).toHaveLength(2);
    expect(r.langaLinjer[0]).toMatchObject({ fran: 'C', till: 'D', d: 410 });
    expect(r.langaLinjer[1]).toMatchObject({ fran: 'A', till: 'B', d: 250 });
    expect(r.resultat).toContain('2 planerade nätlinjer');
  });

  it('utan långa linjer står det fortfarande manuellt', () => {
    const r = hitta(tunnel({
      redund: [{ ri: 0.6, type: 'dist', fromId: 'A', toId: 'B', d: 120 }],
    }), 'Avstånd mellan stompunkter');
    expect(r.status).toBe('manuell');
    expect(r.langaLinjer).toHaveLength(0);
  });
});

// ── Mall D och sammanfattning ───────────────────────────────────────────────

describe('kontrollernas ram', () => {
  it('Ej Trafikverket får inga TDOK-kontroller', () => {
    expect(kontroller(ctx({ verksamhet: 'ej-tv', nattyp: 'sis-bruksnat' }))).toEqual([]);
    expect(kontroller(ctx({ verksamhet: '', nattyp: '' }))).toEqual([]);
  });

  it('sammanfattningen räknar per status', () => {
    const s = sammanfatta([{ status: 'ok' }, { status: 'ok' }, { status: 'fel' },
                           { status: 'manuell' }]);
    expect(s).toEqual({ ok: 2, fel: 1, manuell: 1 });
  });

  it('"Kontrolleras manuellt" är en egen status, inte ett godkännande', () => {
    expect(STATUS_TEXT.manuell).toBe('Kontrolleras manuellt');
    expect(STATUS_TEXT.ok).toBe('Uppfyllt');
    expect(STATUS_TEXT.fel).toBe('Ej uppfyllt');
  });

  it('varje kontroll bär krav, källa, resultat och status', () => {
    for (const nt of ['bruksnat', 'bro', 'tunnel']) {
      for (const r of kontroller(ctx({ nattyp: nt, verksamhet: 'jarnvag' }))) {
        expect(r.krav, nt).toBeTruthy();
        expect(r.kalla, nt).toBeTruthy();
        expect(r.resultat, nt).toBeTruthy();
        expect(['ok', 'fel', 'manuell'], nt).toContain(r.status);
      }
    }
  });
});

// ── Geometrin ───────────────────────────────────────────────────────────────

describe('konvext hölje och punkt-i-polygon', () => {
  const kvadrat = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('höljet av en kvadrat med inre punkt är kvadratens fyra hörn', () => {
    const h = konvextHolje([...kvadrat, { x: 5, y: 5 }]);
    expect(h).toHaveLength(4);
  });

  it('kollineära punkter ger inget hölje att tala om', () => {
    expect(konvextHolje([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]).length).toBeLessThan(3);
  });

  it('punkt innanför, utanför och på randen', () => {
    const h = konvextHolje(kvadrat);
    expect(inomHolje({ x: 5, y: 5 }, h)).toBe(true);
    expect(inomHolje({ x: 15, y: 5 }, h)).toBe(false);
    expect(inomHolje({ x: -1, y: -1 }, h)).toBe(false);
    // På randen räknas som innanför: en nätpunkt i byggnadsverkets hörn
    // omsluter det fortfarande.
    expect(inomHolje({ x: 0, y: 5 }, h)).toBe(true);
    expect(inomHolje({ x: 0, y: 0 }, h)).toBe(true);
  });
});

// ── Kravjämförelsen ─────────────────────────────────────────────────────────

describe('kravjämförelse mot rätt storhet', () => {
  it('täckningsfaktor 2 är förval', () => {
    expect(kravFaktor({ kravk: '2' })).toBe(2);
    expect(kravFaktor({ kravk: undefined })).toBe(2);
    expect(kravFaktor({ kravk: '1' })).toBe(1);
  });

  it('storhetstexten säger vilken som jämförs', () => {
    expect(kravStorhet({ kravk: '1' })).toContain('standardosäkerheten u');
    expect(kravStorhet({ kravk: '2' })).toContain('U = 2·u');
  });

  // u = 3 mm, U = 6 mm, krav 5 mm: utfallet beror helt på täckningsfaktorn.
  it('samma nät och krav ger olika utfall beroende på täckningsfaktor', () => {
    const u1 = jamforKrav({ kravk: '1', kravSP: 5 }, 0.003);
    expect(u1).toMatchObject({ u: 3, U: 6, jamfort: 3, ok: true });

    const u2 = jamforKrav({ kravk: '2', kravSP: 5 }, 0.003);
    expect(u2).toMatchObject({ u: 3, U: 6, jamfort: 6, ok: false });
  });

  it('utan krav görs ingen jämförelse', () => {
    expect(jamforKrav({ kravk: '2', kravSP: null }, 0.003).ok).toBeNull();
  });

  it('exakt på kravet är uppfyllt', () => {
    expect(jamforKrav({ kravk: '2', kravSP: 6 }, 0.003).ok).toBe(true);
    expect(jamforKrav({ kravk: '1', kravSP: 3 }, 0.003).ok).toBe(true);
  });
});

// ── Kontrollerna i rapporten ────────────────────────────────────────────────

describe('kontrolltabellen i rapporten', () => {
  const BAS = {
    sr: { K_global: 0.750, meas_n: 6, unkn_n: 3, redundancy: 3, rMean: 0.5,
          rMinDist: 0.48, rMinHz: 0.52, kappa: 2.8 },
    redund: [{ ri: 0.48, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100,
               mdb: { val: 0.012 }, yt_m: 0.006 }],
    ptRes: [{ id: 'S1', sigE: 0.002, sigN: 0.002, sigPos: 0.003, aSemi: 0.003, bSemi: 0.002 }],
    allPts: [{ id: 'FP1', type: 'known', N: 1, E: 1, H: 0 }, { id: 'FP2', type: 'known', N: 2, E: 2, H: 0 },
             { id: 'FP3', type: 'known', N: 3, E: 1, H: 0 }, { id: 'S1', type: 'station', N: 2, E: 1, H: 0 }],
    knownPts: [{ id: 'FP1', N: 1, E: 1, H: 0 }],
    mk: null, mkKey: 'G3', crs: 'SWEREF 99 TM', ins: 'TS16',
    mHz: 0.5, mDm: 3, mDp: 3, mSt: 3, dag: '2026-09-24', centerErr: 2,
    img: '', imgs: {},
  };
  const rap = (verksamhet, nattyp, v = {}) => buildReport({
    ...BAS,
    vals: { verksamhet, nattyp, tvangutr: 'GZR3', termometer: 'T', barometer: 'B',
            krav: '5', kravk: '2', ...v },
  });

  it('bruksnät får kontrolltabellen med sina krav', () => {
    const h = rap('vag', 'bruksnat');
    expect(h).toContain('Automatiska kontroller mot TDOK 2014:0571 v6.0');
    expect(h).toContain('k-tal för nätet större än 0,50');
    expect(h).toContain('Mätklass G3');
    expect(h).toContain('Tvångscentrering');
    expect(h).toContain('Uppfyllt');
  });

  it('järnvägens Tabell 3-detaljer följer med', () => {
    const h = rap('jarnvag', 'bruksnat');
    expect(h).toContain('Viktsättning enligt Tabell 3');
    expect(h).toContain('Horisontalvinklar');
    expect(h).toContain('0,5 mgon');
  });

  it('tunnelns långa linjer listas som underlag', () => {
    const h = buildReport({
      ...BAS,
      redund: [{ ri: 0.6, type: 'dist', fromId: 'S1', toId: 'FP1', d: 350,
                 mdb: { val: 0.012 }, yt_m: 0.006 }],
      vals: { verksamhet: 'vag', nattyp: 'tunnel' },
    });
    expect(h).toContain('Kontrolleras manuellt');
    expect(h).toContain('S1 → FP1');
    expect(h).toContain('350,0');
  });

  it('mall D har ingen kontrolltabell', () => {
    expect(rap('ej-tv', 'sis-bruksnat')).not.toContain('Automatiska kontroller');
  });

  it('u och U redovisas båda, med källan till täckningsfaktorn', () => {
    const h = rap('vag', 'bruksnat');
    expect(h).toContain('u = σ_pos (mm)');
    expect(h).toContain('U = 2·u (mm)');
    expect(h).toContain('TDOK 2014:0571 v6.0 §1 K2');
    // U = 2 × 3,00 mm
    expect(h).toContain('6,00');
  });

  // TDOK säger ingenting om konfidensnivå för σ_pos, som är en 2D-storhet.
  it('påstår ingen konfidensnivå', () => {
    const h = rap('vag', 'bruksnat');
    expect(h).not.toMatch(/95\s*%/);
    expect(h).not.toMatch(/konfidensnivå för σ_pos är/);
    expect(h).toContain('anger ingen konfidensnivå');
  });

  it('skriver ut vilken storhet kravet jämförts mot', () => {
    expect(rap('vag', 'bruksnat', { kravk: '2' })).toContain('U = 2·u (täckningsfaktor 2)');
    expect(rap('vag', 'bruksnat', { kravk: '1' })).toContain('standardosäkerheten u (täckningsfaktor 1)');
  });

  it('säger standardosäkerhet, inte medelfel', () => {
    const h = rap('vag', 'bruksnat');
    expect(h).toContain('A priori standardosäkerheter');
    expect(h).toContain('Förväntade punktosäkerheter');
    expect(h).not.toMatch(/medelfel/i);
  });

  it('a priori-avsnittet namnger förvalet', () => {
    expect(rap('jarnvag', 'bruksnat')).toContain('TDOK 2014:0571 v6.0 Tabell 3 (järnväg)');
    const eget = buildReport({ ...BAS, mHz: 0.31,
      vals: { verksamhet: 'vag', nattyp: 'bruksnat' } });
    expect(eget).toContain('användardefinierat');
  });

  it('r-tabellen har en bedömningskolumn ur den tregradiga skalan', () => {
    const h = buildReport({
      ...BAS,
      redund: [
        { ri: 0.60, type: 'dist', fromId: 'A', toId: 'B', d: 100, mdb: { val: 0.01 }, yt_m: 0.005 },
        { ri: 0.40, type: 'dist', fromId: 'B', toId: 'C', d: 100, mdb: { val: 0.01 }, yt_m: 0.005 },
        { ri: 0.20, type: 'dist', fromId: 'C', toId: 'D', d: 100, mdb: { val: 0.01 }, yt_m: 0.005 },
      ],
      vals: { verksamhet: 'vag', nattyp: 'bruksnat' },
    });
    expect(h).toContain('<th>Bedömning</th>');
    expect(h).toContain('Ingen anmärkning');
    expect(h).toContain('Uppfyller norm');
    expect(h).toContain('Under norm');
    // Tre färger, inte två: grön, gul och röd ur klassificeraRtal().
    for (const f of ['#00ff88', '#ffcc00', '#ff5050']) expect(h, f).toContain(f);
  });
});
