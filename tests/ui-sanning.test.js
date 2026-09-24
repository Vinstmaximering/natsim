// Regressionslås för UI-städning Omgång 1 (2026-09-11).
//
// Testerna här skyddar rättelser av SANNINGSFEL – text som beskrev något annat
// än vad koden faktiskt gör. Underlag och motivering finns i
// docs/troubleshooting/ui_inventering_20260910.md.
//
// Syftet är inte att låsa formuleringar (de kan ändras i Omgång 2/3) utan att
// hindra att de felaktiga påståendena återinförs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { klassificeraKtal, K_NAT_GOLV, K_BAND } from '../src/core/constants.js';
import { bandForklaring } from '../src/ui/right-panel.js';
import { renderClassInfo } from '../src/ui/sis-ts-info.js';
import { buildReport } from '../src/pm/report-generator.js';
import { IMAGE_PRESETS, SLOT_PRESET, SLOT_LABEL } from '../src/pm/image-presets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// ── Fix 1: kvalitetspanelens tooltips ────────────────────────────────────────
describe('Fix 1 – kvalitetspanelens k-tooltip beskriver den klassificering som finns', () => {
  const html = read('index.html');

  // Plockar ut title/data-tip för raden vars etikett är exakt ">k<".
  const kRow = html.split('\n').find(l => l.includes('id="qK"'));

  it('k-raden finns kvar i panelen', () => {
    expect(kRow).toBeDefined();
  });

  it('nämner inte längre den borttagna 1,14-gränsen', () => {
    // 1,14 var maxvärdet för viktsenhetens standardosäkerhet u₀ vid f = 70 –
    // en annan storhet än k = f/n, och onåbar eftersom k ∈ [0,1].
    expect(kRow).not.toMatch(/1[.,]14/);
  });

  it('påstår inte att k ≥ 0,3 är godkänt', () => {
    // Normgolvet är 0,50 (SIS-TS §6.2.2). Bandet 0,30–0,50 uppfyller inte kravet.
    expect(klassificeraKtal(0.35).uppfyllerNorm).toBe(false);
    expect(kRow).not.toMatch(/0[.,]3\s*=?\s*godk/i);
  });

  it('anger normgolvet 0,50 och att k är f/n', () => {
    expect(K_NAT_GOLV).toBe(0.5);
    expect(kRow).toMatch(/0,50/);
    expect(kRow).toMatch(/f\/n/);
  });

  it('n/u-tooltipen kallar n observationer, inte mätningar', () => {
    // meas_n (observationer) och measCount (mätlinjer) är olika storheter:
    // en mätning ger 1–2 observationer beroende på obsType.
    const nuRow = html.split('\n').find(l => l.includes('id="qNu"'));
    expect(nuRow).toMatch(/observationer/);
    expect(nuRow).not.toMatch(/[Aa]ntal mätningar \(n\)/);
  });

  it('max σ_pos-tooltipen säger fria punkter, inte nya punkter', () => {
    // quality-panel.js filtrerar på type !== "known", alltså alla fria punkter
    // (station, new, detail) – inte bara punkter av typen "new".
    const sRow = html.split('\n').find(l => l.includes('id="qSmax"'));
    expect(sRow).toMatch(/fria punkter/);
  });
});

describe('Fix 1 (följd) – bandförklaringen speglar klassificeraKtal()', () => {
  // Omgång 3: förklaringen är inte längre en handskriven sträng utan genereras
  // ur K_BAND av bandForklaring(). Testet granskar därför utdata, inte källkod –
  // och låser därmed samma sak fast utan att kunna missa en framtida omskrivning.
  const legend = bandForklaring(K_BAND);

  it('listar alla klasser som klassificeraren kan returnera', () => {
    const klasser = [0.9, 0.6, 0.4, 0.2, 0.05].map(k => klassificeraKtal(k).klass);
    expect(new Set(klasser).size).toBe(K_BAND.length);
    for (const klass of klasser) {
      expect(legend, `bandförklaringen saknar "${klass}"`).toContain(klass);
    }
  });

  it('anger normgolvet som klassificeraren använder', () => {
    // 2026-09-13: skalan har bara normstödda gränser. Den enda gräns som
    // finns för k är SIS-TS §6.2.2:s golv.
    expect(K_NAT_GOLV).toBe(0.5);
    expect(legend).toMatch(/0,50/);
  });
});

// ── Fix 2 + 3: r-tal kontra k-tal ────────────────────────────────────────────
const simResultStub = {
  K_global: 0.75, redundancy: 7, meas_n: 12, unkn_n: 5, kappa: 2.8,
  rMinDist: 0.412, rMinHz: 0.388,
};

const pmData = {
  vals: {}, sr: simResultStub,
  redund: [
    { measId: 'M1', fromId: 'A', toId: 'B', type: 'dist', ri: 0.61, d: 100,
      mdb: { val: 0.004 }, yt_m: 0.002 },
    { measId: 'M2', fromId: 'A', toId: 'B', type: 'hz', ri: 0.42, d: 100,
      mdb: { val: 1.2 }, yt_m: 0.003 },
  ],
  ptRes: [{ id: 'S1', sigE: 0.0021, sigN: 0.0018, sigPos: 0.0028, aSemi: 0.0023, bSemi: 0.0016 }],
  allPts: [{ id: 'S1', type: 'station', N: 7000000, E: 100000, H: 0 }],
  knownPts: [{ id: 'FP1', type: 'known', N: 7000100, E: 100100, H: 0 }],
  mk: null, mkKey: '', crs: 'SWEREF 99 TM', ins: 'Leica TS16',
  mHz: 0.3, mDm: 1.0, mDp: 1.5, mSt: 3, dag: '2026-09-11', centerErr: 1.0,
  img: '', imgs: {},
};

describe('Fix 2 – PM-rapporten kallar observationsvis redundans r-tal', () => {
  const html = buildReport(pmData);

  it('har ingen kolumn- eller radrubrik som heter k_i', () => {
    // k_i är HMK:s beteckning (Formel F.6), men krockade med nätets globala
    // k-tal två rader upp i samma tabell (7.1).
    expect(html).not.toContain('Min k_i');
    expect(html).not.toContain('<th>k_i</th>');
    expect(html).not.toContain('Mätningars k_i');
  });

  // ETAPP 4: rubriknumren kommer ur den mall dokumentet följer, så "7.2" är
  // inte längre en fast plats. Rubriktexten och etiketterna prövas i stället.
  it('använder r-tal i nätstatistiken och tabellrubriken', () => {
    expect(html).toContain('Minsta r-tal (avst.)');
    expect(html).toContain('Minsta r-tal (riktning)');
    expect(html).toContain('Mätningars r-tal, MUF och YT');
    expect(html).toContain('<th>r-tal</th>');
  });

  it('behåller nätets globala k-tal som "k" utan index', () => {
    expect(html).toContain('Kontrollerbarhet k');
  });

  it('behåller kopplingen till HMK:s k_i-beteckning i legenden', () => {
    expect(html).toMatch(/i HMK betecknat k_i/);
  });

  it('attribuerar 0,50-gränsen till HMK, inte till SIS-TS', () => {
    // SIS-TS §6.2.2 anger 0,35 per observation; 0,50 är HMK Bilaga F.2.
    // Färgsättningen i rdTab slår om vid 0,50, alltså HMK:s nivå.
    expect(html).not.toMatch(/≥ 0,50 \(SIS-TS\)/);
    expect(html).toMatch(/HMK Bilaga F\.2/);
  });
});

describe('Fix 3 – mätklassrutan skiljer r-tal från k-tal', () => {
  const html = renderClassInfo('G2');

  it('säger r-tal om den observationsvisa gränsen', () => {
    expect(html).toContain('r-tal');
    expect(html).not.toContain('k-tal enskild');
  });

  it('behåller k-tal för nätets globala krav', () => {
    expect(html).toContain('k-tal nätet');
  });
});

// ── Fix 4: N före E ──────────────────────────────────────────────────────────
describe('Fix 4 – σN står före σE i alla utdataformat', () => {
  // Svensk geodetisk konvention: nord först, öst sedan (som SWEREF-tabeller).
  const ytor = [
    ['src/ui/right-panel.js',               /σN mm[\s\S]{0,400}?σE mm/],
    ['src/ui/studio-views/report-studio.js', /σN mm[\s\S]{0,200}?σE mm/],
    ['src/reports/sim-report.js',            /σN mm[\s\S]{0,200}?σE mm/],
    ['src/io/export-pdf.js',                 /σN mm[\s\S]{0,200}?σE mm/],
    // ETAPP 4: punkttabellen ligger i report/blocks.js sedan rapporten delades
    // i fyra mallar. Kolumnrubrikerna heter "σ_N (mm)" och "σ_E (mm)".
    ['src/pm/report/blocks.js',               /σ_N \(mm\)[\s\S]{0,200}?σ_E \(mm\)/],
  ];

  for (const [fil, ordning] of ytor) {
    it(`${fil} har N före E`, () => {
      expect(read(fil)).toMatch(ordning);
    });

    it(`${fil} har ingen kvarvarande E-före-N-rubrik`, () => {
      const src = read(fil);
      expect(src).not.toMatch(/σE mm[\s\S]{0,200}?σN mm/);
      expect(src).not.toMatch(/σ_E mm[\s\S]{0,200}?σ_N mm/);
    });
  }

  it('PM-rapportens värdeceller följer rubrikordningen', () => {
    const html = buildReport(pmData);
    const rad = html.slice(html.indexOf('>S1<'));
    // Omgång 2: decimalkomma.
    const iN = rad.indexOf('1,80');   // sigN = 0.0018 m
    const iE = rad.indexOf('2,10');   // sigE = 0.0021 m
    expect(iN).toBeGreaterThan(-1);
    expect(iE).toBeGreaterThan(-1);
    expect(iN, 'σN ska stå före σE även i cellerna').toBeLessThan(iE);
  });
});

// ── Fix 5: stavfel ───────────────────────────────────────────────────────────
describe('Fix 5 – stavfel i rubriker', () => {
  it('beräkningsrapporten stavar DETALJERAD rätt', () => {
    const src = read('src/reports/sim-report.js');
    expect(src).not.toContain('DETALJERED');
    expect(src).toContain('DETALJERAD BERÄKNINGSRAPPORT');
  });

  it('PM-steg 1 skriver CRS, inte KRS', () => {
    const src = read('src/pm/steps/step1-project.js');
    expect(src).not.toMatch(/\bKRS\b/);
    expect(src).toContain('CRS:');
  });
});

// ── Fix 6: utvecklingsplatshållare ───────────────────────────────────────────
describe('Fix 6 – inga utvecklingsplatshållare i användarsynlig text', () => {
  it('simuleringsstudion visar ingen tom minikarta', () => {
    const src = read('src/ui/studio-views/simulation-studio.js');
    // Får förekomma i kommentar, men inte i renderad markup.
    const utanKommentarer = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(utanKommentarer).not.toMatch(/Mini-?karta/i);
    expect(utanKommentarer).not.toMatch(/implementeras i fas/i);
  });

  it('studiolägets reservtext nämner ingen utvecklingsetapp', () => {
    const src = read('src/ui/studio.js');
    const utanKommentarer = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(utanKommentarer).not.toMatch(/Etapp B\/C/);
  });
});

// ── Fix 6 (följd): bildetiketterna beskriver rätt bild ───────────────────────
describe('PM-guidens bildetiketter matchar bilden som genereras', () => {
  // ETAPP 4: etiketterna och kopplingen slot → preset bor i image-presets.js,
  // inte längre i step4-images.js, och presetnycklarna är neutrala i stället
  // för SIS-TS-koder. Koderna var dessutom omkastade: den gamla nyckeln 'R3.3'
  // gav en bild med bara kända punkter, vilket är Bilaga B:s R3.4.
  const src = read('src/pm/image-presets.js');

  const kopplingar = Object.entries(SLOT_PRESET);

  for (const [slot, presetKey] of kopplingar) {
    it(`${slot} har en etikett som speglar presetens titel`, () => {
      const preset = IMAGE_PRESETS[presetKey];
      expect(preset).toBeDefined();

      const rad = SLOT_LABEL[slot];
      expect(rad, `etikett för ${slot} saknas`).toBeDefined();

      // Etiketten ska dela minst ett betydelsebärande ord med presetens titel.
      const ord = preset.options.title.toLowerCase().match(/[a-zåäö]{6,}/g) || [];
      expect(ord.length).toBeGreaterThan(0);
      expect(
        ord.some(o => rad.toLowerCase().includes(o.slice(0, 6))),
        `"${rad}" beskriver inte bilden "${preset.options.title}"`
      ).toBe(true);
    });
  }

  it('de tidigare felaktiga etiketterna är borta', () => {
    for (const label of Object.values(SLOT_LABEL)) {
      expect(label).not.toMatch(/^R3\./);
    }
    expect(read('src/pm/steps/step4-images.js')).not.toContain('R3.3 Nätkarta');
    expect(read('src/pm/steps/step4-images.js')).not.toContain('R3.4 Anslutningspunkter');
    expect(read('src/pm/steps/step4-images.js')).not.toContain('R3.12 Punktbeskrivningar');
  });

  // ETAPP 4: kopplingen slot → preset speglar vad sloten FAKTISKT innehöll.
  // r33 var "R3.3" men visade bara kända punkter (= Bilaga B R3.4), och r34
  // var "R3.4" men visade mätningarna (= R3.3). Rättat i image-presets.js.
  it('slot → preset speglar bildens innehåll, inte de gamla koderna', () => {
    expect(IMAGE_PRESETS[SLOT_PRESET.r33].options.showMeasurements).toBeFalsy();
    expect(IMAGE_PRESETS[SLOT_PRESET.r33].options.showNew).toBe(false);
    expect(IMAGE_PRESETS[SLOT_PRESET.r34].options.showMeasurements).toBe(true);
    expect(IMAGE_PRESETS[SLOT_PRESET.r312].options.showEllipses).toBe(true);
  });
});
