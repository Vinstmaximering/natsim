// Regressionslås för UI-städning Omgång 3 (2026-09-12).
//
// Omgång 1 tog sanningsfel, Omgång 2 enheter och terminologi. Omgång 3 tar
// strukturella sanningsproblem: kvalitetsskalor som motsade normen, fyra
// oförenliga skalor, versionsangivelser som pekade åt tre håll, oförklarade
// matematiska förkortningar och en karta utan teckenförklaring.
// Underlag: docs/troubleshooting/ui_inventering_20260910.md.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  klassificeraKtal, klassificeraRtal, K_BAND, R_BAND,
  K_NAT_GOLV, K_GOD_MARGINAL, R_OBS_GOLV, R_OBS_NORM, R_OBS_GOD,
  sigPosKlass, SIG_POS_BRA_MM, SIG_POS_DALIG_MM, PT,
} from '../src/core/constants.js';
import { rLabel, rColor, rClass } from '../src/core/redundancy.js';
import { SIS_TS_GENERAL_REQS } from '../src/data/sis-ts-classes.js';
import { APP_VERSION, APP_VERSION_LABEL, APP_NAME } from '../src/core/version.js';
import { TIPS, tipAttr, initTooltips, _reset as _resetTips } from '../src/ui/tooltip.js';
import { legendInnehall, initMapLegend } from '../src/ui/map-legend.js';
import { buildReport } from '../src/pm/report-generator.js';
import pkg from '../package.json';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Ord som beskriver ett underkänt värde som godtagbart. De får inte finnas
// som KLASS i någon normskala – bara som fritext där ingen norm finns.
const SKONMALANDE = ['Acceptabelt', 'Acceptabel', 'Starkt', 'Överbestämt'];

// ── Fix 1: etiketter som ljög om normen ─────────────────────────────────────
describe('Fix 1 – kvalitetsetiketterna beskriver relationen till normen', () => {
  it('ingen k-klass använder ett skönmålande ord', () => {
    for (const b of K_BAND) {
      expect(SKONMALANDE, `k-bandet "${b.klass}"`).not.toContain(b.klass);
    }
  });

  it('ingen r-klass använder ett skönmålande ord', () => {
    for (const b of R_BAND) {
      expect(SKONMALANDE, `r-bandet "${b.klass}"`).not.toContain(b.klass);
    }
  });

  it('bandet under normgolvet heter något som säger att det är under norm', () => {
    // Det var här "Acceptabelt" satt: k ∈ [0,30, 0,50), alltså underkänt.
    const under = klassificeraKtal(0.40);
    expect(under.uppfyllerNorm).toBe(false);
    expect(under.klass).toMatch(/under norm/i);
  });

  it('översta k-bandet påstår inte att nätet är "överbestämt"', () => {
    // Överbestämning gäller varje nät med f > 0, inte bara k ≥ 0,70.
    const topp = klassificeraKtal(0.95);
    expect(topp.klass).not.toMatch(/överbestäm/i);
    expect(topp.uppfyllerNorm).toBe(true);
  });

  it('varje klass som uppfyller normen ligger på eller över sitt golv', () => {
    for (const k of [0, 0.1, 0.29, 0.3, 0.49, 0.5, 0.7, 1]) {
      expect(klassificeraKtal(k).uppfyllerNorm, `k=${k}`).toBe(k >= K_NAT_GOLV);
    }
    for (const r of [0, 0.1, 0.29, 0.3, 0.34, 0.35, 0.5, 1]) {
      expect(klassificeraRtal(r).uppfyllerNorm, `r=${r}`).toBe(r >= R_OBS_NORM);
    }
  });

  it('constants.js har ingen kvarvarande självanklagelse om missvisande text', () => {
    const src = read('src/core/constants.js');
    // Filen erkände tidigare i en kommentar att "Acceptabelt" var missvisande
    // men lämnade det olöst. Den lappen ska inte finnas kvar olöst.
    expect(src).not.toMatch(/missvisande mot normen[\s\S]{0,200}gjordes inte här/);
    expect(src).not.toMatch(/VÄNTAR PÅ BESTÄLLARENS BESLUT/);
  });
});

// ── Fix 2: harmoniserade skalor ─────────────────────────────────────────────
describe('Fix 2 – k-tal och r-tal delar ordförråd men har egna trösklar', () => {
  it('k-skalans golv är SIS-TS §6.2.2:s 0,50', () => {
    expect(K_NAT_GOLV).toBe(0.50);
    expect(K_BAND.some(b => b.min === K_NAT_GOLV)).toBe(true);
  });

  it('r-skalans golv är SIS-TS §6.2.2:s 0,35 för enskild observation', () => {
    // Den gamla r-skalan saknade band här helt: r-tal 0,32 fick etiketten
    // "Acceptabelt" trots att normen underkänner observationen.
    expect(R_OBS_NORM).toBe(SIS_TS_GENERAL_REQS.k_individual_min);
    expect(R_BAND.some(b => b.min === R_OBS_NORM)).toBe(true);
    expect(klassificeraRtal(0.32).uppfyllerNorm).toBe(false);
    expect(klassificeraRtal(0.36).uppfyllerNorm).toBe(true);
  });

  it('varje r-bandgräns motsvarar en konstant som styr produktens logik', () => {
    const granser = R_BAND.map(b => b.min).filter(m => m > 0).sort((a, b) => a - b);
    expect(granser).toEqual([R_OBS_GOLV, R_OBS_NORM, R_OBS_GOD]);
  });

  it('bandtabellerna och klassificerarna kan inte divergera', () => {
    // Upptäckt vid regressionskontrollen av Omgång 3: en ändring i
    // klassificeraKtal() utan motsvarande ändring i K_BAND hade passerat
    // obemärkt, och bandförklaringen i UI:t hade då beskrivit fel skala.
    for (const [fn, band] of [[klassificeraKtal, K_BAND], [klassificeraRtal, R_BAND]]) {
      for (const b of band) {
        // Precis på gränsen ska klassificeraren ge bandets egen klass.
        expect(fn(b.min).klass, `vid ${b.min}`).toBe(b.klass);
        // Strax under gränsen ska den ge ett annat (lägre) band.
        if (b.min > 0) expect(fn(b.min - 1e-9).klass, `strax under ${b.min}`).not.toBe(b.klass);
      }
      // Tabellen ska täcka exakt de klasser klassificeraren kan returnera.
      const franFn = new Set();
      for (let v = 0; v <= 1.0000001; v += 0.001) franFn.add(fn(v).klass);
      expect([...franFn].sort()).toEqual(band.map(b => b.klass).sort());
    }
  });

  it('skalorna delar ordförråd', () => {
    const kOrd = new Set(K_BAND.map(b => b.klass));
    for (const b of R_BAND) expect(kOrd, `r-klassen "${b.klass}"`).toContain(b.klass);
  });

  it('men tvingas INTE till samma trösklar – storheterna har olika golv', () => {
    expect(K_NAT_GOLV).not.toBe(R_OBS_NORM);
    // Samma tal ger olika omdöme, vilket är matematiskt riktigt.
    expect(klassificeraKtal(0.40).uppfyllerNorm).toBe(false);
    expect(klassificeraRtal(0.40).uppfyllerNorm).toBe(true);
  });

  it('båda skalorna är monotona och totala', () => {
    for (const [fn, band] of [[klassificeraKtal, K_BAND], [klassificeraRtal, R_BAND]]) {
      const rang = [...band].reverse().map(b => b.klass);
      let forra = -1;
      for (let v = 0; v <= 1.0000001; v += 0.005) {
        const res = fn(v);
        expect(typeof res.klass).toBe('string');
        expect(typeof res.cssKlass).toBe('string');
        expect(typeof res.farg).toBe('string');
        const i = rang.indexOf(res.klass);
        expect(i, `okänd klass vid ${v.toFixed(3)}`).toBeGreaterThanOrEqual(0);
        expect(i, `klassen sjönk vid ${v.toFixed(3)}`).toBeGreaterThanOrEqual(forra);
        forra = i;
      }
    }
  });

  it('rLabel/rColor/rClass kommer ur r-skalan', () => {
    for (const r of [0, 0.2, 0.32, 0.4, 0.6, 1]) {
      expect(rLabel(r)).toBe(klassificeraRtal(r).klass);
      expect(rColor(r)).toBe(klassificeraRtal(r).farg);
      expect(rClass(r)).toBe(klassificeraRtal(r).cssKlass);
    }
  });

  it('ingen UI-fil har en egen trappa för r-tal eller σ_pos', () => {
    const filer = [
      'src/ui/right-panel.js', 'src/ui/quality-panel.js',
      'src/ui/studio-views/simulation-studio.js',
      'src/ui/studio-views/report-studio.js',
      'src/reports/sim-report.js', 'src/io/export-pdf.js',
    ];
    for (const f of filer) {
      const src = read(f).replace(/^\s*\/\/.*$/gm, '');
      // Handskrivna trappor på formen  r >= 0.5 ? ... : r >= 0.3 ? ...
      expect(src, `${f} har egen r-trappa`).not.toMatch(/>=\s*0\.5\s*\?[\s\S]{0,80}>=\s*0\.3\s*\?/);
      // ... och på formen  mm < 5 ? ... : mm < 20 ? ...
      expect(src, `${f} har egen σ_pos-trappa`).not.toMatch(/mm\s*<\s*5\s+\?[\s\S]{0,60}mm\s*<\s*\d\d\s*\?/);
    }
  });

  it('σ_pos har EN skala – kvalitetspanelen och tabellerna använde 10 mot 20', () => {
    expect(SIG_POS_BRA_MM).toBe(5);
    expect(SIG_POS_DALIG_MM).toBe(20);
    expect(sigPosKlass(3)).toBe('val-good');
    expect(sigPosKlass(12)).toBe('val-caution');   // var röd i kvalitetspanelen
    expect(sigPosKlass(25)).toBe('val-danger');
    expect(sigPosKlass(NaN)).toBe('val-muted');
  });

  it('PM-rapporten kallar aldrig ett underkänt nät acceptabelt', () => {
    const bas = {
      vals: {}, redund: [{ measId:'M1', fromId:'A', toId:'B', type:'dist', ri:0.61,
                           d:100, mdb:{ val:0.004 }, yt_m:0.002 }],
      ptRes: [{ id:'S1', sigE:0.002, sigN:0.002, sigPos:0.003, aSemi:0.002, bSemi:0.001 }],
      allPts: [{ id:'S1', type:'station', N:7000000, E:100000, H:0 }],
      knownPts: [], mk:null, mkKey:'', crs:'SWEREF 99 TM', ins:'Leica TS16',
      mHz:0.3, mDm:1, mDp:1.5, mSt:3, dag:'2026-09-12', centerErr:1, img:'', imgs:{},
    };
    // k = 0,40 ligger under normgolvet.
    const under = buildReport({ ...bas, sr: { K_global:0.40, redundancy:3, meas_n:8,
      unkn_n:5, kappa:2.8, rMinDist:0.4, rMinHz:0.4 } });
    expect(under).not.toMatch(/ACCEPTABELT/);
    expect(under).toMatch(/UPPFYLLER INTE NORMEN/);

    const over = buildReport({ ...bas, sr: { K_global:0.80, redundancy:9, meas_n:12,
      unkn_n:3, kappa:2.8, rMinDist:0.6, rMinHz:0.6 } });
    expect(over).toMatch(/UPPFYLLER NORMEN/);
  });
});

// ── Fix 3: versionsangivelsen ───────────────────────────────────────────────
describe('Fix 3 – versionen kommer ur package.json', () => {
  it('APP_VERSION är exakt package.json:s version', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION_LABEL).toBe(`v${pkg.version}`);
    expect(APP_NAME).toBe('NätSim');
  });

  it('inget UI hårdkodar ett versionsnummer', () => {
    for (const fil of ['index.html', 'src/ui/onboarding.js', 'src/main.js']) {
      const src = read(fil).replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${fil} har kvar "v4.0"`).not.toMatch(/v4\.0/);
      expect(src, `${fil} har kvar "Beta 2"`).not.toMatch(/Beta\s*2/);
    }
  });

  it('panelhuvudet har en plats som main.js fyller i', () => {
    expect(read('index.html')).toContain('id="app-version"');
    expect(read('src/main.js')).toMatch(/app-version/);
  });
});

// ── Fix 4: tooltips ─────────────────────────────────────────────────────────
describe('Fix 4 – matematiska förkortningar har tooltips', () => {
  it('varje tooltip är en mening med innehåll', () => {
    for (const [nyckel, text] of Object.entries(TIPS)) {
      expect(typeof text, nyckel).toBe('string');
      expect(text.length, nyckel).toBeGreaterThan(30);
      expect(text.trim().endsWith('.'), `${nyckel} saknar punkt`).toBe(true);
    }
  });

  it('de förkortningar beställningen räknade upp är täckta', () => {
    expect(TIPS.MUF).toMatch(/[Mm]insta upptäckbara fel/);
    expect(TIPS.YT).toMatch(/[Yy]ttre tillförlitlighet/);
    expect(TIPS.SIG_POS).toMatch(/[Pp]unktstandardosäkerhet/);
    expect(TIPS.SIG_0).toMatch(/[Gg]rundmedelfel/);
    expect(TIPS.R_TAL).toMatch(/k_i/);           // kopplingen till HMK-beteckningen
    expect(TIPS.K_TAL).toMatch(/f\/n/);
  });

  it('normreferenser anges där sådana finns', () => {
    expect(TIPS.K_TAL).toMatch(/SIS-TS 21143:2016 §6\.2\.2/);
    expect(TIPS.R_TAL).toMatch(/SIS-TS 21143:2016 §6\.2\.2/);
    expect(TIPS.R_TAL).toMatch(/HMK/);
    expect(TIPS.MUF).toMatch(/HMK/);
  });

  it('tipAttr ger både title (hover) och data-tip (pekskärm)', () => {
    const a = tipAttr('Ett "citat" & <tagg>');
    expect(a).toMatch(/^title="/);
    expect(a).toMatch(/data-tip="/);
    expect(a).not.toMatch(/<tagg>/);        // escapad
    expect(a).toContain('&quot;');
  });

  it('tryck-och-håll visar en bubbla på pekskärm', async () => {
    _resetTips();
    document.body.innerHTML = `<span id="m" ${tipAttr(TIPS.MUF)}>MUF</span>`;
    initTooltips();
    const mal = document.getElementById('m');
    mal.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, touches: [{ clientX: 50, clientY: 50 }],
    }));
    await new Promise(r => setTimeout(r, 550));
    const bubbla = document.querySelector('.tip-bubbla');
    expect(bubbla, 'ingen bubbla efter tryck-och-håll').toBeTruthy();
    expect(bubbla.style.display).toBe('block');
    expect(bubbla.textContent).toBe(TIPS.MUF);
    _resetTips();
  });

  it('kvalitetspanelen har ingen egen touch-hantering kvar', () => {
    const src = read('src/ui/quality-panel.js');
    expect(src).not.toMatch(/addEventListener\(["']touchstart/);
  });
});

// ── Fix 5: kartans teckenförklaring ─────────────────────────────────────────
describe('Fix 5 – kartan har en teckenförklaring', () => {
  const html = legendInnehall();

  it('förklarar alla tre linjestilarna', () => {
    expect(html).toContain('Riktning + avstånd');
    expect(html).toContain('Endast riktning');
    expect(html).toContain('Endast avstånd');
    // Streckmönstren ska motsvara draw() i map/leaflet-setup.js.
    expect(html).toContain('stroke-dasharray="8 4"');
    expect(html).toContain('stroke-dasharray="2 4"');
    // Heldragen = en linje helt utan dasharray.
    expect(html).toMatch(/<line [^>]*stroke-width="2"\/>/);
  });

  it('förklarar riktningspilen', () => {
    expect(html).toMatch(/[Pp]ilen visar mätriktningen/);
  });

  it('förklarar att linjefärgen är r-talet, med samma band som skalan', () => {
    expect(html).toMatch(/Linjefärg = r-tal/);
    for (const b of R_BAND) expect(html, `bandet ${b.klass}`).toContain(b.klass);
  });

  it('förklarar punkttyperna med etiketterna ur PT', () => {
    for (const t of Object.keys(PT)) expect(html, t).toContain(PT[t].l);
  });

  it('monteras hopfälld och går att fälla ut', () => {
    document.body.innerHTML = '<div id="cw"></div>';
    const el = initMapLegend(document.getElementById('cw'));
    expect(el).toBeTruthy();
    const knapp = el.querySelector('#ml-toggle');
    const panel = el.querySelector('#ml-panel');
    expect(panel.hidden, 'ska vara hopfälld från början').toBe(true);
    expect(knapp.getAttribute('aria-expanded')).toBe('false');
    knapp.click();
    expect(panel.hidden).toBe(false);
    expect(knapp.getAttribute('aria-expanded')).toBe('true');
    knapp.click();
    expect(panel.hidden).toBe(true);
  });

  it('monteras bara en gång', () => {
    document.body.innerHTML = '<div id="cw"></div>';
    const cw = document.getElementById('cw');
    initMapLegend(cw);
    initMapLegend(cw);
    expect(cw.querySelectorAll('#map-legend')).toHaveLength(1);
  });
});
