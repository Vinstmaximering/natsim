// Etapp 4 – de fyra rapportmallarna.
//
// Varje mall prövas mot de rubriker normen kräver, i den ordning paragrafen
// anger, och mot att varje normrubrik bär sin källa. Samma testnät används för
// alla fyra, så skillnaderna i utdata kommer enbart ur mallvalet.

import { describe, it, expect } from 'vitest';
import { buildReport, valjMall } from '../src/pm/report-generator.js';

// ── Testnät ─────────────────────────────────────────────────────────────────

const BAS = {
  sr: {
    K_global: 0.750, meas_n: 6, unkn_n: 3, redundancy: 3, rMean: 0.500,
    rMinDist: 0.479, rMinHz: 0.521, kappa: 2.80, redundTotal: '3.00',
    datumDesc: 'Absolut anslutning', nCoordUnkn: 2, nOrientUnkn: 1,
  },
  redund: [
    { ri: 0.479, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100, mdb: { val: 0.012 }, yt_m: 0.006 },
    { ri: 0.521, type: 'hz',   fromId: 'S1', toId: 'FP1', d: 100, mdb: { val: 0.011 }, yt_m: 0.005 },
    { ri: 0.510, type: 'dist', fromId: 'S1', toId: 'FP2', d: 154, mdb: { val: 0.012 }, yt_m: 0.006 },
  ],
  ptRes: [{ id: 'S1', type: 'station', sigE: 0.00217, sigN: 0.00183, sigPos: 0.00201,
            aSemi: 0.00228, bSemi: 0.00168 }],
  allPts: [
    { id: 'FP1', type: 'known',   N: 6500100, E: 1620400, H: 45.2, markering: 'Dubb i berg', prisma: '' },
    { id: 'FP2', type: 'known',   N: 6500312, E: 1620554, H: 46.1, markering: 'Järn i foderrör', prisma: '' },
    { id: 'FP3', type: 'known',   N: 6500200, E: 1620700, H: 45.8, markering: '', prisma: '' },
    { id: 'S1',  type: 'station', N: 6500200, E: 1620500, H: 45.5, markering: '', prisma: 'Leica GPR1' },
    { id: 'NY1', type: 'new',     N: 6500250, E: 1620600, H: 45.9, markering: '', prisma: '' },
  ],
  knownPts: [
    { id: 'FP1', N: 6500100, E: 1620400, H: 45.2, markering: 'Dubb i berg' },
    { id: 'FP2', N: 6500312, E: 1620554, H: 46.1, markering: 'Järn i foderrör' },
    { id: 'FP3', N: 6500200, E: 1620700, H: 45.8, markering: '' },
  ],
  mk: { beskrivning: 'Bruksnät i plan', totalstation: 'T2', sigHz_mgon: 0.3,
        sigDist_mm: 1, sigDist_ppm: 1.5, numSatser: 3, centerErr: 1 },
  mkKey: 'G3',
  crs: 'SWEREF 99 TM', ins: 'Leica TS16 1″',
  mHz: 0.3, mDm: 1.0, mDp: 1.5, mSt: 3, dag: '2026-09-24', centerErr: 1.0,
  img: '', imgs: {},
};

const GEMENSAMMA_VALS = {
  proj: 'Testprojekt Kungsängen', projnr: 'TEST-2026-001',
  best: 'Beställaren AB', utf: 'Utföraren AB',
  ans: 'Anna Testsson', berakn: 'Anna Testsson', falt: 'Björn Mätare',
  behtyp: 'Geodesi 2', behnr: 'BI-2026-0042',
  rapdat: '2026-09-24', sek: 'Öppen', docid: 'PM-2026-001',
  syfte: 'Etablering av stomnät för projektering och utsättning.',
  anslutning: 'Anslutning till riksnätet via tre kända punkter.',
  genomforande: 'Polär mätning i tre helsatser från varje uppställning.',
  tidstart: '2026-10-01', tidslut: '2026-10-15',
  tidplan: 'Fältarbete vecka 40–41, beräkning vecka 42.',
  plansys: 'SWEREF 99 TM', hoj: 'RH 2000', geo: 'SWEN17_RH2000',
  kordkalla: 'Riksnätet', kordkval: 'Punkterna bedöms som stabila.',
  instr: 'Leica TS16 1″', serienr: '890562', kalib: '2026-03-15',
  tvangutr: 'Leica GZR3', termometer: 'Testo 925', barometer: 'Testo 511',
  swfalt: 'Leica Captivate 7.0', swber: 'NätSim',
  metod: 'Polär mätning med tvångscentrering.',
  krav: '5', kravk: '2', krav2: 'Kontrollmätning av två punkter.',
  leverans: 'Digital leverans .geo + rapport.', levformat: '.geo, PDF',
  markering: {
    FP1: { typkod: 'PP', typ: 'Dubb i berg' },
    NY1: { typkod: 'FIX', typ: 'Järn i foderrör' },
  },
};

const rapport = (verksamhet, nattyp, extra = {}) => buildReport({
  ...BAS,
  vals: { ...GEMENSAMMA_VALS, verksamhet, nattyp, ...extra },
});

// Hjälpare: alla rubriktexter i ordning, och källan som står i rubriken.
const rubriker = html =>
  [...html.matchAll(/<h[12] class="r">([\s\S]*?)<\/h[12]>/g)].map(m =>
    m[1].replace(/<span class="rkalla">[\s\S]*?<\/span>/g, '').trim());

const rubrikMedKalla = (html, text) => {
  const m = [...html.matchAll(/<h[12] class="r">([\s\S]*?)<\/h[12]>/g)]
    .find(x => x[1].includes(text));
  return m ? (m[1].match(/<span class="rkalla">([\s\S]*?)<\/span>/)?.[1] ?? '') : null;
};

/**
 * Står rubriken `a` före rubriken `b`?
 *
 * Jämförelsen görs på RUBRIKERNAS ordning, inte på råa strängpositioner i
 * HTML:en. Ord som "Referenssystem" förekommer också i löptext och tabeller –
 * en indexOf på hela dokumentet hade då mätt fel förekomst.
 */
const fore = (html, a, b) => {
  const rs = rubriker(html);
  const ia = rs.findIndex(r => r.includes(a));
  const ib = rs.findIndex(r => r.includes(b));
  expect(ia, `rubriken "${a}" saknas`).toBeGreaterThan(-1);
  expect(ib, `rubriken "${b}" saknas`).toBeGreaterThan(-1);
  return ia < ib;
};

// ── Mallvalet ───────────────────────────────────────────────────────────────

describe('valjMall', () => {
  it('varje kombination ger rätt mall', () => {
    expect(valjMall('vag', 'bruksnat').mall).toBe('A');
    expect(valjMall('jarnvag', 'bruksnat').mall).toBe('B');
    expect(valjMall('vag', 'bro').mall).toBe('C');
    expect(valjMall('jarnvag', 'bro').mall).toBe('C');
    expect(valjMall('vag', 'tunnel').mall).toBe('C');
    expect(valjMall('jarnvag', 'tunnel').mall).toBe('C');
    expect(valjMall('ej-tv', 'sis-bruksnat').mall).toBe('D');
  });

  it('ovald verksamhet eller nättyp ger ingen mall', () => {
    expect(valjMall('', 'bruksnat')).toBeNull();
    expect(valjMall('vag', '')).toBeNull();
    expect(valjMall('', '')).toBeNull();
    expect(valjMall('vag', 'sis-bruksnat')).toBeNull();
  });

  it('bär med sig nättypens etikett för försättsbladet', () => {
    expect(valjMall('vag', 'bruksnat').nattypLabel).toBe('Bruksnät i plan');
    expect(valjMall('ej-tv', 'sis-rorelse').nattypLabel).toBe('Nät för rörelsemätning (§6.5.6)');
  });
});

// ── Gemensamt för alla mallar ───────────────────────────────────────────────

describe('gemensamt för alla fyra mallar', () => {
  const alla = [
    ['A', rapport('vag', 'bruksnat')],
    ['B', rapport('jarnvag', 'bruksnat')],
    ['C', rapport('vag', 'bro')],
    ['D', rapport('ej-tv', 'sis-bruksnat')],
  ];

  for (const [namn, html] of alla) {
    describe(`mall ${namn}`, () => {
      it('har försättsblad med projekt, verksamhet och nättyp', () => {
        expect(html).toContain('Testprojekt Kungsängen');
        expect(html).toContain('<strong>Verksamhet:</strong>');
        expect(html).toContain('<strong>Nättyp:</strong>');
        expect(html).toContain('TEST-2026-001');
      });

      it('namnger dokumenttypen på försättsbladet', () => {
        const typ = { A: 'Redovisning av planerat stomnät', B: 'Åtgärdsförslag',
                      C: 'Mätningsprogram', D: 'Planering av stomnät' }[namn];
        expect(html).toContain(typ);
      });

      it('anger normen på försättsbladet', () => {
        if (namn === 'D') {
          expect(html).toContain('SIS-TS 21143:2016');
          expect(html).not.toContain('TDOK 2014:0571 version 6.0 ·');
        } else {
          expect(html).toContain('TDOK 2014:0571 version 6.0');
        }
      });

      it('har föreskriftstabellen med korrekta titlar och versioner', () => {
        expect(html).toContain('Byggmätning – Geodetisk mätning, beräkning och ' +
                               'redovisning av byggnadsverk och infrastruktur');
        expect(html).toContain('HMK – Stommätning 2024');
        if (namn !== 'D') {
          expect(html).toContain('Geodetiska mätningsarbeten och geografisk ' +
                                 'lägesbestämning – Väg och järnväg');
          expect(html).toContain('TDOK 2016:0257');
        }
      });

      it('har simuleringsavsnittet', () => {
        expect(html).toContain('Simulering och kvalitetsbedömning');
        expect(html).toContain('Kontrollerbarhet k');
        expect(html).toContain('0,750');
      });

      it('har personal med behörighet enligt §1.1', () => {
        expect(html).toContain('Anna Testsson');
        expect(html).toContain('Behörighetstyp');
        expect(html).toContain('BI-2026-0042');
      });

      it('har referenssystem och geoidmodell', () => {
        expect(html).toContain('SWEREF 99 TM');
        expect(html).toContain('RH 2000');
        expect(html).toContain('SWEN17_RH2000');
      });

      it('har leverans', () => {
        expect(html).toContain('Digital leverans');
      });

      it('varje normrubrik bär en källa', () => {
        const utan = [...html.matchAll(/<h1 class="r">([\s\S]*?)<\/h1>/g)]
          .filter(m => !m[1].includes('rkalla'))
          .map(m => m[1].trim());
        expect(utan, `rubriker utan källa: ${utan.join(', ')}`).toHaveLength(0);
      });

      it('nätbedömningen står på försättsbladet', () => {
        expect(html).toContain('<strong>Nätbedömning:</strong>');
        expect(html).toContain('UPPFYLLER NORMEN');
      });

      it('escapar användardata', () => {
        const xss = buildReport({
          ...BAS,
          vals: { ...GEMENSAMMA_VALS, verksamhet: 'vag', nattyp: 'bruksnat',
                  proj: '<script>alert(1)</script>' },
        });
        expect(xss).not.toContain('<script>alert(1)</script>');
        expect(xss).toContain('&lt;script&gt;');
      });
    });
  }
});

// ── Mall A – Väg, bruksnät (§2.5 K2) ────────────────────────────────────────

describe('mall A – Redovisning av planerat stomnät', () => {
  const html = rapport('vag', 'bruksnat');

  // §2.5 K2 räknar upp vad redovisningen minst ska omfatta.
  const KRAV = [
    ['Sammanfattning av planeringen', 'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Nätets syfte',                  'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Anslutningslösning',            'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Planerat genomförande',         'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Utgångspunkter för anslutning', 'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Planerade nypunkter och markeringstyper', null],
    ['Nätskiss och stommätningsplan', 'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Tidplan',                       'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Instrument, utrustning och programvaror', 'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Programvaror för beräkning och analys',   'TDOK 2014:0571 v6.0 §2.5 K2'],
    ['Simulering och kvalitetsbedömning', null],
    ['Leverans', null],
  ];

  for (const [rubrik, kalla] of KRAV) {
    it(`har rubriken "${rubrik}"`, () => {
      expect(rubriker(html).some(r => r.includes(rubrik)), rubrik).toBe(true);
      if (kalla) expect(rubrikMedKalla(html, rubrik)).toContain(kalla);
    });
  }

  it('följer §2.5 K2:s ordning', () => {
    expect(fore(html, 'Sammanfattning av planeringen', 'Utgångspunkter för anslutning')).toBe(true);
    expect(fore(html, 'Utgångspunkter för anslutning', 'Planerade nypunkter')).toBe(true);
    expect(fore(html, 'Planerade nypunkter', 'Nätskiss och stommätningsplan')).toBe(true);
    expect(fore(html, 'Nätskiss och stommätningsplan', '5. Tidplan')).toBe(true);
    expect(fore(html, '5. Tidplan', 'Instrument, utrustning och programvaror')).toBe(true);
  });

  it('markeringstypen redovisas med typkod ur Tabell 2', () => {
    expect(html).toContain('FIX · Järn i foderrör');
    expect(html).toContain('§2.4.1 K3 Tabell 2');
  });

  it('har raden om godkännande innan markering (§2.8 K11–K12)', () => {
    expect(html).toContain('godkännas av beställaren innan markering');
    expect(html).toContain('§2.8 K11–K12');
  });

  it('har ingen tillståndsbedömning – den gäller järnväg', () => {
    expect(html).not.toContain('Tillståndsbedömning');
  });
});

// ── Mall B – Järnväg, bruksnät (§2.5 K1) ────────────────────────────────────

describe('mall B – Åtgärdsförslag', () => {
  const html = rapport('jarnvag', 'bruksnat', {
    erfprojekt: 'Bandel 512, stomnät 2024.',
    erfmiljo: '15 år i spårmiljö, giltig BASÄVA.',
    tillstand: {
      FP1: { kat: 'Ingen synbar påverkan', sikt: 'Fri sikt', datum: '2026-09-01' },
      FP2: { kat: 'Misstänkt rubbad', sikt: 'Skymd av vegetation', datum: '2026-09-01' },
    },
  });

  // §1.8 K2 räknar upp den mätningstekniska redogörelsens innehåll, i ordning.
  const DEL1 = [
    'Omfattning och syfte',
    'Gällande föreskrifter',
    'Tekniska grundfakta',
    'Instrument, utrustning och programvaror',
    'Personal',
    'Utgångs- och underlagsmaterial',
    'Tidpunkt för genomförande',
    'Genomförande och resultat',
    'Leverans',
  ];

  for (const rubrik of DEL1) {
    it(`Del 1 har rubriken "${rubrik}"`, () => {
      expect(rubriker(html).some(r => r.includes(rubrik)), rubrik).toBe(true);
    });
  }

  it('Del 1 följer §1.8 K2:s ordning', () => {
    for (let i = 0; i < DEL1.length - 1; i++) {
      expect(fore(html, DEL1[i], DEL1[i + 1]), `${DEL1[i]} före ${DEL1[i + 1]}`).toBe(true);
    }
  });

  it('har de tre delarna i rätt ordning', () => {
    expect(fore(html, 'Del 1 – Mätningsteknisk redogörelse', 'Del 2 – Tillståndsbedömning')).toBe(true);
    expect(fore(html, 'Del 2 – Tillståndsbedömning', 'Del 3 – Stommätningsplan')).toBe(true);
  });

  it('Del 2 är tillståndsbedömningen enligt §2.1 K5', () => {
    expect(rubrikMedKalla(html, 'Del 2 – Tillståndsbedömning')).toContain('§2.1');
    expect(html).toContain('Ingen synbar påverkan');
    expect(html).toContain('Misstänkt rubbad');
    expect(html).toContain('Skymd av vegetation');
    expect(html).toContain('2026-09-01');
  });

  it('tillståndstabellen har §2.1 K5:s fyra kolumner', () => {
    for (const k of ['Punktnummer', 'Kategori', 'Siktförhållande', 'Tidpunkt']) {
      expect(html, k).toContain(`<th>${k}</th>`);
    }
  });

  it('Del 3 är stommätningsplanen med planerade observationer', () => {
    expect(html).toContain('Del 3 – Stommätningsplan');
    expect(html).toContain('Planerad observation');
    expect(html).toContain('S1 → FP1');
  });

  it('har raden om godkännande innan fortsatt arbete (§2.8 K9–K10)', () => {
    expect(html).toContain('godkännas av beställaren innan fortsatt arbete');
    expect(html).toContain('§2.8 K9–K10');
  });

  it('redovisar järnvägens erfarenhetskrav enligt §1.1 K2–K3', () => {
    expect(html).toContain('Bandel 512');
    expect(html).toContain('spårmiljö');
    expect(html).toContain('§1.1 K1–K3');
  });
});

// ── Mall C – Bro och tunnel (§1.7 K1) ───────────────────────────────────────

describe('mall C – Mätningsprogram', () => {
  // §1.7 K1 räknar upp vad mätningsprogrammet minst ska innehålla, i ordning.
  const KRAV = [
    'Mätningarnas syfte',
    'Mätningarnas omfattning',
    'Befintliga förutsättningar och underlag',
    'Tider som programmet ska förhålla sig till',
    'Referenssystem',
    'Planerat genomförande',
    'Vad som ska dokumenteras',
    'Vad som ska redovisas',
    'Hur redovisning ska ske',
  ];

  for (const nattyp of ['bro', 'tunnel']) {
    describe(nattyp, () => {
      const html = rapport('vag', nattyp);

      for (const rubrik of KRAV) {
        it(`har rubriken "${rubrik}"`, () => {
          expect(rubriker(html).some(r => r.includes(rubrik)), rubrik).toBe(true);
          expect(rubrikMedKalla(html, rubrik)).toContain('§1.7 K1');
        });
      }

      it('följer §1.7 K1:s ordning', () => {
        for (let i = 0; i < KRAV.length - 1; i++) {
          expect(fore(html, KRAV[i], KRAV[i + 1]), `${KRAV[i]} före ${KRAV[i + 1]}`).toBe(true);
        }
      });

      it('markerar uppräkningen av vad som dokumenteras som produktval', () => {
        expect(html).toContain('rprodukt');
        expect(html).toContain('NätSims eget');
      });
    });
  }

  it('bro hänvisar till SIS-TS §6.5.5 och kräver godkännande innan markering', () => {
    const html = rapport('vag', 'bro');
    expect(html).toContain('SIS-TS 21143:2016 §6.5.5');
    expect(html).toContain('§2.11.2 K6');
    expect(html).toContain('§2.11.2 K7');
    expect(html).toContain('godkännas av beställaren innan markering');
  });

  it('tunnel hänvisar till SIS-TS §6.5.3.2, §6.5.4.2 och riktningskontroll §6.5.3.7', () => {
    const html = rapport('vag', 'tunnel');
    expect(html).toContain('§6.5.3.2');
    expect(html).toContain('§6.5.4.2');
    expect(html).toContain('§6.5.3.7');
    expect(html).toContain('§2.10.2 K1');
    expect(html).toContain('§2.10.2 K4');
  });

  it('bro i järnväg redovisar gemensamma markeringar (§2.11.2 K4)', () => {
    const html = rapport('jarnvag', 'bro', { gemensam: { FP1: true, FP2: true } });
    expect(html).toContain('Gemensamma markeringar med stomnät i plan för järnväg');
    expect(html).toContain('§2.11.2 K4');
  });

  it('bro i väg redovisar inte gemensamma markeringar – kravet gäller järnväg', () => {
    const html = rapport('vag', 'bro', { gemensam: { FP1: true } });
    expect(html).not.toContain('Gemensamma markeringar med stomnät i plan för järnväg');
  });

  // Simuleringen krävs av olika paragrafer för bro och tunnel.
  it('simuleringens källa skiljer bro från tunnel', () => {
    expect(rubrikMedKalla(rapport('vag', 'bro'), 'Simulering och kvalitetsbedömning'))
      .toContain('§2.11.2 K5');
    expect(rubrikMedKalla(rapport('vag', 'tunnel'), 'Simulering och kvalitetsbedömning'))
      .toContain('§2.10.2 K2');
  });
});

// ── Mall D – Ej Trafikverket (SIS-TS Bilaga B kolumn P) ─────────────────────

describe('mall D – Planering av stomnät', () => {
  const html = rapport('ej-tv', 'sis-bruksnat');

  // Kolumn P (planering) i Bilaga B.
  const P_RUBRIKER = [
    'R1.1 Uppdragets omfattning',
    'R1.3 Referenssystem',
    'R1.4 Tidplan',
    'R2 Personal',
    'R3.1 Redogörelse',
    'R3.2 Översiktskarta',
    'R3.3 Nätkarta, nätutformning och markering',
    'R3.4 Anslutningspunkter och kända punkter',
    'R3.5 Mätmetod, mätprogram och instrument',
    'R3.9 Bedömning av kvalitetskrav och toleranser',
    'R3.10 Särskilda kontroller',
    'R3.11 Programvaror',
    'R4.1 Leveransomfattning',
    'R4.2 Leveransformat',
  ];

  for (const rubrik of P_RUBRIKER) {
    it(`har rubriken "${rubrik}"`, () => {
      expect(rubriker(html).some(r => r.includes(rubrik)), rubrik).toBe(true);
    });
  }

  it('rubrikerna står i Bilaga B:s ordning', () => {
    for (let i = 0; i < P_RUBRIKER.length - 1; i++) {
      expect(fore(html, P_RUBRIKER[i], P_RUBRIKER[i + 1]),
             `${P_RUBRIKER[i]} före ${P_RUBRIKER[i + 1]}`).toBe(true);
    }
  });

  // Före Etapp 4 var R3.3 och R3.4 omkastade: nätkartan låg under R3.4 och
  // anslutningspunkterna under R3.3.
  it('R3.3 är nätkartan och R3.4 anslutningspunkterna, inte tvärtom', () => {
    expect(fore(html, 'R3.3 Nätkarta', 'R3.4 Anslutningspunkter')).toBe(true);
    const r33 = html.slice(html.indexOf('R3.3 Nätkarta'), html.indexOf('R3.4 Anslutningspunkter'));
    expect(r33).toContain('Mätgeometri');
    expect(r33).toContain('Felellipser');
    const r34 = html.slice(html.indexOf('R3.4 Anslutningspunkter'), html.indexOf('R3.5 Mätmetod'));
    expect(r34).toContain('Kända anslutningspunkter');
  });

  // Lägesosäkerheterna stod tidigare som R3.12, vilket är Punktbeskrivningar.
  it('lägesosäkerheterna står inte längre som R3.12', () => {
    expect(html).not.toContain('R3.12 Lägesosäkerheter');
    expect(html).not.toMatch(/R3\.12[^)]*Lägesosäkerhet/);
  });

  // Föreskrifterna stod tidigare under R1.4, som är Tidplan.
  it('föreskrifterna står inte under R1.4', () => {
    const r14 = html.slice(html.indexOf('R1.4 Tidplan'), html.indexOf('R2 Personal'));
    expect(r14).not.toContain('Gällande föreskrifter');
    expect(r14).toContain('Tidplan');
  });

  it('säger att strukturvalet är NätSims eget, inte ett krav', () => {
    expect(html).toContain('rprodukt');
    expect(html).toContain('SIS-TS 21143:2016 Bilaga B kolumn P');
  });

  it('nämner inte TDOK som gällande krav', () => {
    expect(html).not.toContain('Geodetiska mätningsarbeten och geografisk lägesbestämning');
  });
});

// ── Utan vald dokumenttyp ───────────────────────────────────────────────────

describe('utan vald verksamhet eller nättyp', () => {
  const html = buildReport({ ...BAS, vals: { ...GEMENSAMMA_VALS, verksamhet: '', nattyp: '' } });

  it('varnar överst att dokumenttypen inte är bestämd', () => {
    expect(html).toContain('Dokumenttypen är inte bestämd');
    expect(html.indexOf('Dokumenttypen är inte bestämd')).toBeLessThan(200);
  });

  it('visar ändå innehållet, så att inget arbete göms', () => {
    expect(html).toContain('Testprojekt Kungsängen');
    expect(html).toContain('Simulering och kvalitetsbedömning');
  });

  it('pekar på steg 1', () => {
    expect(html).toContain('steg 1');
  });

  it('ett migrerat gammalt utkast utan verksamhet kastar inte', () => {
    expect(() => buildReport({ ...BAS, vals: { nattyp: 'bruksnat', nats: 'Bruksnät i plan (§6.4)' } }))
      .not.toThrow();
  });

  it('helt tom vals kastar inte', () => {
    expect(() => buildReport({ ...BAS, vals: {} })).not.toThrow();
  });
});

// ── Föräldralösa tabellnycklar når aldrig rapporten ─────────────────────────

describe('värden för punkter som inte finns i nätet', () => {
  it('markering för en borttagen punkt kommer inte med', () => {
    const html = rapport('vag', 'bruksnat', {
      markering: { ...GEMENSAMMA_VALS.markering,
                   BORTTAGEN: { typkod: 'PP', typ: 'Unikonsol (standard)' } },
    });
    expect(html).not.toContain('BORTTAGEN');
    expect(html).not.toContain('Unikonsol');
  });

  it('tillståndsbedömning för en borttagen punkt kommer inte med', () => {
    const html = rapport('jarnvag', 'bruksnat', {
      tillstand: { RIVEN: { kat: 'Borta, raserad', sikt: 'x', datum: '2026-01-01' } },
    });
    expect(html).not.toContain('RIVEN');
    expect(html).not.toContain('Borta, raserad');
  });

  it('gemensam markering för en borttagen punkt räknas inte', () => {
    const html = rapport('jarnvag', 'bro', { gemensam: { FP1: true, BORTA: true } });
    expect(html).not.toContain('BORTA');
  });
});
