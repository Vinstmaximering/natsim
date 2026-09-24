// Etapp 5 – varje formulärfält når rapporten.
//
// Etapp 0 hittade fem fält som samlades in, sparades i utkastet och aldrig
// skrevs ut: v_kompetens, v_docid, v_matdat, v_kordkval och v_krav2. Ett fält
// användaren fyller i och som sedan försvinner är värre än inget fält alls –
// hen tror att uppgiften finns i dokumentet.
//
// Testet härleder fältlistan ur formulären och prövar varje fält mot alla fyra
// mallarna med ett unikt sentinelvärde. Ett nytt fält som inte skrivs ut
// någonstans får testet att falla, och måste då antingen skrivas ut eller tas
// bort ur formuläret.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from '../src/pm/report-generator.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

/** Alla v_-fält som PM-guidens steg bygger. */
function formularfalt() {
  const falt = new Set();
  for (const f of readdirSync(join(root, 'src/pm/steps'))) {
    const src = read(`src/pm/steps/${f}`);
    for (const m of src.matchAll(/id="v_([A-Za-z0-9_]+)"/g)) falt.add(m[1]);
    // Bildstegets fält byggs i en loop över SLOTS.
    if (/id="v_\$\{slot\}txt"/.test(src)) {
      for (const s of ['r32', 'r33', 'r34', 'r312']) falt.add(s + 'txt');
    }
  }
  return [...falt].sort();
}

const BAS = {
  sr: { K_global: 0.75, meas_n: 6, unkn_n: 3, redundancy: 3, rMean: 0.5,
        rMinDist: 0.48, rMinHz: 0.52, kappa: 2.8 },
  redund: [{ ri: 0.48, type: 'dist', fromId: 'S1', toId: 'FP1', d: 100,
             mdb: { val: 0.01 }, yt_m: 0.005 }],
  ptRes: [{ id: 'S1', sigE: 0.002, sigN: 0.002, sigPos: 0.003, aSemi: 0.003, bSemi: 0.002 }],
  allPts: [{ id: 'FP1', type: 'known', N: 1, E: 1, H: 0 },
           { id: 'S1', type: 'station', N: 2, E: 1, H: 0 }],
  knownPts: [{ id: 'FP1', N: 1, E: 1, H: 0 }],
  mk: null, mkKey: 'G3', crs: 'CRS', ins: 'INS',
  mHz: 0.5, mDm: 3, mDp: 3, mSt: 3, dag: '2026-09-24', centerErr: 2, img: '', imgs: {},
};

const KOMBINATIONER = [
  ['vag', 'bruksnat'], ['jarnvag', 'bruksnat'],
  ['jarnvag', 'bro'], ['vag', 'tunnel'], ['ej-tv', 'sis-bruksnat'],
];

/**
 * Fält som medvetet INTE skrivs ut som sitt eget värde. Båda är styrfält:
 * deras VERKAN syns i rapporten, men det råa värdet skulle inte säga läsaren
 * något. Listan är avsiktligt kort, och varje post bär sitt skäl.
 */
const STYRFALT = {
  kravk:
    'Täckningsfaktorn. Det råa värdet är "1" eller "2"; rapporten skriver i ' +
    'stället ut vilken storhet kravet jämförts mot och varifrån faktorn kommer.',
  byggnadsverkLager:
    'Id för det visuella lager som visar byggnadsverket. Id:t är internt; ' +
    'rapporten redovisar utfallet av §2.11.2 K2-kontrollen och lagrets namn.',
};

describe('varje formulärfält når rapporten', () => {
  const falt = formularfalt();

  it('formulären har fält att pröva', () => {
    expect(falt.length).toBeGreaterThan(40);
  });

  for (const namn of formularfalt()) {
    // verksamhet och nattyp styr mallvalet och prövas av pm-mallar.test.js.
    if (namn === 'verksamhet' || namn === 'nattyp') continue;

    it(`v_${namn}${STYRFALT[namn] ? ' är ett styrfält' : ''}`, () => {
      const sentinel = `ZZ${namn.toUpperCase()}ZZ`;
      const nadd = KOMBINATIONER.some(([v, n]) =>
        buildReport({ ...BAS, vals: { verksamhet: v, nattyp: n, [namn]: sentinel } })
          .includes(sentinel));

      if (STYRFALT[namn]) {
        expect(nadd, `v_${namn} skrivs ut som värde trots att det är ett styrfält`).toBe(false);
      } else {
        expect(nadd, `v_${namn} samlas in men skrivs aldrig ut i någon mall`).toBe(true);
      }
    });
  }

  // De fem fält Etapp 0 pekade ut. Egen assertion, så att de inte kan falla
  // bort igen utan att det syns vad som gick förlorat.
  it('fälten ur Etapp 0:s inventering skrivs ut', () => {
    for (const namn of ['kompetens', 'docid', 'matdat', 'kordkval', 'krav2']) {
      const sentinel = `ZZ${namn.toUpperCase()}ZZ`;
      const nadd = KOMBINATIONER.some(([v, n]) =>
        buildReport({ ...BAS, vals: { verksamhet: v, nattyp: n, [namn]: sentinel } })
          .includes(sentinel));
      expect(nadd, `v_${namn}`).toBe(true);
    }
  });
});
