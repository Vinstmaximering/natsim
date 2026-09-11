// Regressionslås för UI-städning Omgång 2 (2026-09-11).
//
// Omgång 2 handlade om ENHETSVISNING och TERMINOLOGI, inte om sanningsfel
// (dem tog Omgång 1, se tests/ui-sanning.test.js). Underlag:
// docs/troubleshooting/ui_inventering_20260910.md.
//
// Testerna låser fyra saker:
//   1. Hybridformatet 123g45'67.8" och DMS-växlaren är borta och stannar borta.
//   2. Vinklar visas i gon med fyra decimaler.
//   3. Punkttypernas etiketter har EN källa (PT i core/constants.js).
//   4. Decimalkomma i det användaren läser – men INTE i inputfält, data-attribut
//      eller CSV, där punkten är teknisk nödvändighet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { nf, gon, gonU, komma, gonToDeg, degToGonInput, DEG_PER_GON, DASH } from '../src/core/format.js';
import { PT, ptLabel, ptLabelShort } from '../src/core/constants.js';
import * as designmatrix from '../src/core/designmatrix.js';
import { buildReport } from '../src/pm/report-generator.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Alla filer som producerar text åt användaren.
const UI_FILER = [
  'index.html',
  'src/main.js',
  'src/map/leaflet-setup.js',
  'src/reports/meas-book.js',
  'src/reports/sim-report.js',
  'src/reports/net-image.js',
  'src/io/export-pdf.js',
  'src/pm/report-generator.js',
  'src/pm/steps/step1-project.js',
  'src/pm/steps/step2-reference.js',
  'src/pm/steps/step3-instruments.js',
  'src/ui/modals.js',
  'src/ui/right-panel.js',
  'src/ui/validation.js',
  'src/ui/quality-panel.js',
  'src/ui/sis-ts-info.js',
  'src/ui/toolbar.js',
  'src/ui/studio-views/net-studio.js',
  'src/ui/studio-views/measurements-studio.js',
  'src/ui/studio-views/simulation-studio.js',
  'src/ui/studio-views/report-studio.js',
];

// Kommentarer får nämna det gamla – det är där motiveringen står.
function utanKommentarer(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// ── core/format.js ───────────────────────────────────────────────────────────
describe('core/format.js – formateringskontraktet', () => {
  it('nf ger svensk decimalkomma', () => {
    expect(nf(1.5, 2)).toBe('1,50');
    expect(nf(-0.125, 3)).toBe('-0,125');
    expect(nf(7, 0)).toBe('7');
  });

  it('nf ger tankstreck för saknade och ogiltiga värden', () => {
    for (const v of [null, undefined, '', NaN, Infinity, -Infinity]) {
      expect(nf(v, 2)).toBe(DASH);
    }
  });

  it('gon konverterar från grader och ger fyra decimaler', () => {
    expect(DEG_PER_GON).toBe(0.9);
    expect(gon(90)).toBe('100,0000');    // 90° = 100 gon
    expect(gon(180)).toBe('200,0000');
    expect(gon(0)).toBe('0,0000');
    expect(gonU(90)).toBe('100,0000 gon');
  });

  it('gon och gonToDeg är varandras invers inom visningsprecisionen', () => {
    // gon() avrundar till fyra decimaler i GON. Tillbakakonverterat till grader
    // är upplösningen 0,0001 gon = 0,00009°, så toleransen sätts därefter.
    for (const deg of [0, 12.3456, 90, 123.456, 359.9]) {
      const tillbaka = gonToDeg(gon(deg).replace(',', '.'));
      expect(Math.abs(tillbaka - deg)).toBeLessThan(1e-4);
    }
  });

  it('gonToDeg accepterar både komma och punkt', () => {
    expect(gonToDeg('100,0000')).toBeCloseTo(90, 9);
    expect(gonToDeg('100.0000')).toBeCloseTo(90, 9);
  });

  it('degToGonInput ger ett RÅTT tal – inputfält tål inte komma', () => {
    const v = degToGonInput(90);
    expect(typeof v).toBe('number');
    expect(String(v)).not.toContain(',');
  });

  it('komma rör bara punkter mellan siffror', () => {
    expect(komma('2.80')).toBe('2,80');
    expect(komma('1 mm + 1.5 ppm')).toBe('1 mm + 1,5 ppm');
    // Paragrafer, versioner och filändelser lämnas ifred.
    expect(komma('§6.2.2')).toBe('§6,2,2');   // dokumenterad begränsning, se nedan
    expect(komma('rapport.txt')).toBe('rapport.txt');
  });
});

// ── Fix 1: hybridformatet och DMS-växlaren ──────────────────────────────────
describe('Fix 1 – hybridformatet och DMS-växlaren är borta', () => {
  it('designmatrix exporterar varken fG eller fD', () => {
    expect(designmatrix.fG).toBeUndefined();
    expect(designmatrix.fD).toBeUndefined();
    // brgEN räknar fortfarande i grader – kärnan är orörd.
    expect(designmatrix.brgEN({ E: 0, N: 0 }, { E: 0, N: 1 })).toBe(0);
    expect(designmatrix.brgEN({ E: 0, N: 0 }, { E: 1, N: 0 })).toBe(90);
  });

  it('ingen UI-fil anropar fG/fD eller bygger hybridformatet', () => {
    for (const fil of UI_FILER) {
      const src = utanKommentarer(read(fil));
      expect(src, `${fil} anropar fG()`).not.toMatch(/\bfG\s*\(/);
      expect(src, `${fil} anropar fD()`).not.toMatch(/\bfD\s*\(/);
      // Hybridformatets signatur: siffra följd av g och apostrof.
      expect(src, `${fil} bygger hybridformat`).not.toMatch(/\}g\$\{|\dg\d\d'/);
    }
  });

  it('state.au och växlarknappen finns inte kvar', () => {
    const store = read('src/state/store.js');
    expect(utanKommentarer(store)).not.toMatch(/\bau\s*:/);

    for (const fil of UI_FILER.concat(['src/io/export-project.js'])) {
      const src = utanKommentarer(read(fil));
      expect(src, `${fil} läser state.au`).not.toMatch(/au\s*===\s*["']grad["']/);
      expect(src, `${fil} har kvar btn-au`).not.toContain('btn-au');
      expect(src, `${fil} har kvar toggleAU`).not.toMatch(/toggleAU/);
    }
  });

  it('projektfilen skriver inte längre au', () => {
    expect(utanKommentarer(read('src/io/export-project.js'))).not.toMatch(/au:\s*s\.au/);
  });
});

// ── Fix 2: riktning, inte vinkel ─────────────────────────────────────────────
describe('Fix 2 – observationstypen heter riktning', () => {
  const modals = read('src/ui/modals.js');

  it('mätningsmodalen erbjuder riktning, inte vinkel', () => {
    expect(modals).toContain('Endast riktning');
    expect(modals).toContain('Riktning + Avstånd');
    expect(modals).not.toContain('Endast vinkel');
    expect(modals).not.toContain('Vinkel + Avstånd');
  });

  it('modalens σ-fält och hjälptext säger riktning', () => {
    expect(modals).toContain('σ riktning (mgon)');
    expect(modals).not.toContain('σ vinkel');
    expect(modals).toMatch(/horisontalriktning mätt från uppställningen/i);
  });

  it('ordet vinkel är kvar där det matematiskt ÄR en vinkel', () => {
    // θ är felellipsens rotationsvinkel – en riktig vinkel, ska inte döpas om.
    expect(read('src/ui/right-panel.js')).toMatch(/Felellipsens riktningsvinkel/);
  });

  it('inget UI kallar riktningsobservationen för vinkel', () => {
    for (const fil of UI_FILER) {
      const src = utanKommentarer(read(fil));
      expect(src, `${fil}: "Endast vinkel"`).not.toContain('Endast vinkel');
      expect(src, `${fil}: "σ vinkel"`).not.toContain('σ vinkel');
      expect(src, `${fil}: "Min r_i (vinkel)"`).not.toContain('(vinkel)');
    }
  });
});

// ── Fix 3: r-tal utan indexnotation ─────────────────────────────────────────
describe('Fix 3 – r-tal i stället för indexnotation', () => {
  it('ingen UI-yta visar r_d, r_h, r_i eller r̄ som etikett', () => {
    for (const fil of UI_FILER) {
      const src = utanKommentarer(read(fil));
      expect(src, `${fil} visar r_d/r_h`).not.toMatch(/r_d|r_h/);
      expect(src, `${fil} visar r_i`).not.toMatch(/r_i/);
      expect(src, `${fil} visar r̄`).not.toContain('r̄');
    }
  });

  it('mätkortet visar r-tal', () => {
    expect(read('src/ui/right-panel.js')).toMatch(/r-tal \$\{nf\(rd\.ri/);
  });
});

// ── Fix 4: knappnamnet ──────────────────────────────────────────────────────
describe('Fix 4 – texter pekar på knappen "Beräkna simulering"', () => {
  it('ingen text ber användaren trycka på "Kör simulering"', () => {
    for (const fil of UI_FILER.concat(['src/map/interactions.js'])) {
      const src = utanKommentarer(read(fil));
      expect(src, `${fil}`).not.toMatch(/Kör simulering/);
      expect(src, `${fil}`).not.toMatch(/Kör simuleringen först/);
    }
  });

  it('valideringen hänvisar till den knapp som faktiskt finns', () => {
    const val = read('src/ui/validation.js');
    expect(val).toMatch(/Beräkna simulering/);
    const panel = read('src/ui/right-panel.js');
    expect(panel).toMatch(/BERÄKNA SIMULERING/);
  });
});

// ── Fix 5: kanoniska punkttyper ─────────────────────────────────────────────
describe('Fix 5 – punkttypernas etiketter har en enda källa', () => {
  it('PT bär både full och kort etikett för varje typ', () => {
    for (const [nyckel, def] of Object.entries(PT)) {
      expect(def.l, `${nyckel}.l`).toBeTruthy();
      expect(def.sl, `${nyckel}.sl`).toBeTruthy();
      expect(def.c, `${nyckel}.c`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(def.s, `${nyckel}.s (ID-prefix)`).toBeTruthy();
    }
  });

  it('de tre beslutade kanoniska termerna används', () => {
    expect(ptLabel('known')).toBe('Känd punkt');
    expect(ptLabelShort('known')).toBe('Känd');
    expect(ptLabel('station')).toBe('Station');
    expect(ptLabel('new')).toBe('Nypunkt');
  });

  it('ID-prefixen är oförändrade – de namnger punkter i sparade projekt', () => {
    expect(PT.known.s).toBe('FP');
    expect(PT.station.s).toBe('S');
    expect(PT.detail.s).toBe('D');
    expect(PT.new.s).toBe('NY');
    expect(PT.simstation.s).toBe('SS');
  });

  it('ingen UI-fil har en egen kopia av typtabellen', () => {
    for (const fil of UI_FILER) {
      const src = utanKommentarer(read(fil));
      // Mönstret "known:" följt av en etikettsträng = en lokal kopia.
      expect(src, `${fil} har egen typtabell`).not.toMatch(/known\s*:\s*['"]/);
    }
  });

  it('de gamla parallella etiketterna är borta', () => {
    for (const fil of UI_FILER.concat(['src/reports/meas-book.js'])) {
      const src = utanKommentarer(read(fil));
      for (const gammal of ['SimStn', 'Sim. uppst.', 'Ny punkt', '"UPS"', '"KP"', '"DET"']) {
        expect(src, `${fil} innehåller "${gammal}"`).not.toContain(gammal);
      }
    }
  });

  it('Uppställning är kvar som operativ term, skild från typen Station', () => {
    // Nätöversiktens rad räknar orienteringsobekanta – uppställningar i drift,
    // inte punkter med typen Station. Distinktionen ska bevaras.
    expect(read('src/ui/right-panel.js')).toContain('Uppställningar (orienteringar)');
    expect(read('src/reports/meas-book.js')).toContain('UPPSTÄLLNING');
  });
});

// ── Fix 6: decimalkomma, med dokumenterade undantag ─────────────────────────
describe('Fix 6 – decimalkomma i det användaren läser', () => {
  const pmData = {
    vals: {}, sr: { K_global: 0.75, redundancy: 7, meas_n: 12, unkn_n: 5, kappa: 2.8,
                    rMinDist: 0.412, rMinHz: 0.388 },
    redund: [{ measId: 'M1', fromId: 'A', toId: 'B', type: 'dist', ri: 0.615, d: 100,
               mdb: { val: 0.004 }, yt_m: 0.002 }],
    ptRes: [{ id: 'S1', sigE: 0.0021, sigN: 0.0018, sigPos: 0.0028, aSemi: 0.0023, bSemi: 0.0016 }],
    allPts: [{ id: 'S1', type: 'station', N: 7000000.5, E: 100000.25, H: 12.5 }],
    knownPts: [], mk: null, mkKey: '', crs: 'SWEREF 99 TM', ins: 'Leica TS16',
    mHz: 0.3, mDm: 1.0, mDp: 1.5, mSt: 3, dag: '2026-09-11', centerErr: 1.0,
    img: '', imgs: {},
  };

  it('PM-rapportens siffror har komma, inte punkt', () => {
    const html = buildReport(pmData);
    expect(html).toContain('0,750');     // k-tal
    expect(html).toContain('0,615');     // r-tal
    expect(html).toContain('2,80');      // σ_pos i mm
    expect(html).not.toMatch(/>0\.750</);
  });

  it('inputfält behåller punktnotation – annars tömmer webbläsaren dem', () => {
    // Dokumenterat undantag i core/format.js.
    const modals = read('src/ui/modals.js');
    // Koordinatfälten byggs ur en tabell där värdet är (pt.N||0).toFixed(3) –
    // rå punktnotation, aldrig nf(). Riktningsfältet går via degToGonInput().
    expect(modals).toMatch(/"number",\(pt\.N\|\|0\)\.toFixed\(3\)/);
    expect(modals).toMatch(/value="\$\{m\.measHz!=null\?degToGonInput\(m\.measHz\)/);
  });

  it('CSV-exporten är oförändrad – kommat är fältavgränsare där', () => {
    const tu = read('src/ui/table-utils.js');
    expect(tu).toMatch(/join\(','\)/);
    // Raderna skickas som råa tal, inte formaterade strängar.
    expect(tu).not.toMatch(/\bnf\(/);
  });

  it('mätningsmodalens riktningsfält är i gon', () => {
    const modals = read('src/ui/modals.js');
    expect(modals).toContain('Uppmätt riktning (gon)');
    expect(modals).not.toContain('Uppmätt riktningsvinkel');
    // Lagringen sker fortfarande i grader – kärnan och projektfiler orörda.
    expect(modals).toMatch(/gonToDeg\(hv\)/);
  });
});
