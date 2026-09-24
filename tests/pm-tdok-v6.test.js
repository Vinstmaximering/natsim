// Etapp 3 – verksamhet, nättyp, datamodell och migrering av gamla utkast.
//
// Modulen src/pm/tdok-v6.js är ren data och rena funktioner. Testerna låser
// uppräkningarna mot normtexten och migreringen mot den karta uppdraget anger.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VERKSAMHETER, NATTYPER_TV, NATTYPER_SIS, DOK_SIS,
  MARKERINGSTYPER, MARKERING_KALLA, TILLSTAND_KATEGORIER, TILLSTAND_KALLA,
  KODSYSTEM, TACKNINGSFAKTOR, TACKNINGSFAKTOR_FORVAL,
  arTrafikverket, nattyperFor, dokumenttyp, kodsystemFor,
  migreraNats, migreraMarkering, migreraUtkast,
  TABELLER, foraldralosa, foraldralosaTabeller, harForaldralosa, rensaForaldralosa,
  TACKNINGSFAKTOR_SIGREQ,
} from '../src/pm/tdok-v6.js';

// ── Verksamhet och nättyp ───────────────────────────────────────────────────

describe('verksamhet', () => {
  it('har de tre valen uppdraget anger', () => {
    expect(VERKSAMHETER.map(v => v.v)).toEqual(['vag', 'jarnvag', 'ej-tv']);
    expect(VERKSAMHETER.map(v => v.l)).toEqual(['Väg', 'Järnväg', 'Ej Trafikverket']);
  });

  it('bara väg och järnväg är Trafikverksuppdrag', () => {
    expect(arTrafikverket('vag')).toBe(true);
    expect(arTrafikverket('jarnvag')).toBe(true);
    expect(arTrafikverket('ej-tv')).toBe(false);
    expect(arTrafikverket('')).toBe(false);
    expect(arTrafikverket(undefined)).toBe(false);
  });
});

describe('nättyper', () => {
  // NätSim simulerar terrestra nät i plan. Anslutningsnät (§2.6, GNSS/VRS) och
  // nät i höjd (§2.7, §2.9, §2.10.3, §2.11.3) ska inte erbjudas för
  // Trafikverksuppdrag – de ligger utanför det produkten kan simulera.
  it('Trafikverkslistan har exakt de tre nät i plan uppdraget anger', () => {
    expect(NATTYPER_TV.map(n => n.v)).toEqual(['bruksnat', 'bro', 'tunnel']);
    expect(NATTYPER_TV.map(n => n.l)).toEqual([
      'Bruksnät i plan',
      'Nät i plan för bro och broliknande konstruktion',
      'Nät i plan för tunnelbyggnad',
    ]);
  });

  it('Trafikverkslistan erbjuder varken anslutningsnät eller nät i höjd', () => {
    const text = JSON.stringify(NATTYPER_TV).toLowerCase();
    expect(text).not.toContain('anslutningsnät');
    expect(text).not.toContain('höjd');
    expect(text).not.toContain('rörelse');
  });

  it('varje Trafikverksnättyp bär sin definierande paragraf', () => {
    expect(NATTYPER_TV.find(n => n.v === 'bruksnat').kalla).toBe('TDOK 2014:0571 v6.0 §2.8');
    expect(NATTYPER_TV.find(n => n.v === 'bro').kalla).toBe('TDOK 2014:0571 v6.0 §2.11.2');
    expect(NATTYPER_TV.find(n => n.v === 'tunnel').kalla).toBe('TDOK 2014:0571 v6.0 §2.10.2');
  });

  it('SIS-TS-listan är de fem gamla valen, oförändrade', () => {
    expect(NATTYPER_SIS.map(n => n.l)).toEqual([
      'Bruksnät i plan (§6.4)',
      'Anslutningsnät (§6.3)',
      'Nät för brobyggnad (§6.5.5)',
      'Nät för tunneldrivning (§6.5.3)',
      'Nät för rörelsemätning (§6.5.6)',
    ]);
  });

  it('listan som visas följer verksamheten', () => {
    expect(nattyperFor('vag')).toBe(NATTYPER_TV);
    expect(nattyperFor('jarnvag')).toBe(NATTYPER_TV);
    expect(nattyperFor('ej-tv')).toBe(NATTYPER_SIS);
    expect(nattyperFor('')).toBe(NATTYPER_SIS);
  });
});

// ── Dokumenttyp per kombination ─────────────────────────────────────────────

describe('dokumenttyp', () => {
  it('väg + bruksnät ger Redovisning av planerat stomnät (§2.5 K2), mall A', () => {
    const d = dokumenttyp('vag', 'bruksnat');
    expect(d.typ).toBe('Redovisning av planerat stomnät');
    expect(d.kalla).toBe('TDOK 2014:0571 v6.0 §2.5 K2');
    expect(d.mall).toBe('A');
  });

  it('järnväg + bruksnät ger Åtgärdsförslag (§2.5 K1), mall B', () => {
    const d = dokumenttyp('jarnvag', 'bruksnat');
    expect(d.typ).toBe('Åtgärdsförslag');
    expect(d.kalla).toBe('TDOK 2014:0571 v6.0 §2.5 K1');
    expect(d.mall).toBe('B');
  });

  it('bro ger Mätningsprogram (§1.7 K1 · §2.11.2 K6), mall C, för båda verksamheterna', () => {
    for (const v of ['vag', 'jarnvag']) {
      const d = dokumenttyp(v, 'bro');
      expect(d.typ, v).toBe('Mätningsprogram');
      expect(d.kalla, v).toBe('TDOK 2014:0571 v6.0 §1.7 K1 · §2.11.2 K6');
      expect(d.mall, v).toBe('C');
    }
  });

  it('tunnel ger Mätningsprogram (§1.7 K1 · §2.10.2 K1), mall C', () => {
    for (const v of ['vag', 'jarnvag']) {
      const d = dokumenttyp(v, 'tunnel');
      expect(d.typ, v).toBe('Mätningsprogram');
      expect(d.kalla, v).toBe('TDOK 2014:0571 v6.0 §1.7 K1 · §2.10.2 K1');
      expect(d.mall, v).toBe('C');
    }
  });

  it('Ej Trafikverket ger Planering av stomnät (SIS-TS Bilaga B kolumn P), mall D', () => {
    for (const nt of NATTYPER_SIS.map(n => n.v)) {
      const d = dokumenttyp('ej-tv', nt);
      expect(d.typ, nt).toBe('Planering av stomnät');
      expect(d.kalla, nt).toBe('SIS-TS 21143:2016 Bilaga B kolumn P');
      expect(d.mall, nt).toBe('D');
    }
    expect(DOK_SIS.typ).toBe('Planering av stomnät');
  });

  it('ovald nättyp för ett Trafikverksuppdrag ger ingen dokumenttyp', () => {
    expect(dokumenttyp('vag', '')).toBeNull();
    expect(dokumenttyp('jarnvag', 'sis-bruksnat')).toBeNull();
  });

  it('varje kombination som ska gå att välja ger en mall', () => {
    const mallar = new Set();
    for (const v of ['vag', 'jarnvag'])
      for (const n of NATTYPER_TV.map(x => x.v)) mallar.add(dokumenttyp(v, n).mall);
    mallar.add(dokumenttyp('ej-tv', 'sis-bruksnat').mall);
    expect([...mallar].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ── §2.4.1 K3 Tabell 2 ──────────────────────────────────────────────────────

describe('markeringstyper, Tabell 2', () => {
  it('PP har de sju typerna i Tabell 2', () => {
    expect(MARKERINGSTYPER.PP).toEqual([
      'Dubb i berg',
      'Dubb i betong (horisontell)',
      'Dubb i betong (vertikal)',
      'Dubb i sten',
      'Markeringsspik i asfalt eller betong',
      'Rör i mark med däcksel',
      'Unikonsol (standard)',
    ]);
  });

  it('FIX har de fyra typerna i Tabell 2', () => {
    expect(MARKERINGSTYPER.FIX).toEqual([
      'Dubb i berg',
      'Dubb i betong (vertikal)',
      'Dubb i sten',
      'Järn i foderrör',
    ]);
  });

  it('tabellen bär sin källa', () => {
    expect(MARKERING_KALLA).toBe('TDOK 2014:0571 v6.0 §2.4.1 K3 Tabell 2');
  });

  // Skälet till att typkoden väljs först: tre typer står under båda koderna och
  // valet är annars inte entydigt.
  it('tre typer finns under båda typkoderna', () => {
    const bada = MARKERINGSTYPER.PP.filter(t => MARKERINGSTYPER.FIX.includes(t));
    expect(bada).toEqual(['Dubb i berg', 'Dubb i betong (vertikal)', 'Dubb i sten']);
  });
});

// ── §2.1 K2 ─────────────────────────────────────────────────────────────────

describe('tillståndsbedömning', () => {
  it('har de fem kategorierna i §2.1 K2', () => {
    expect(TILLSTAND_KATEGORIER).toEqual([
      'Ingen synbar påverkan',
      'Misstänkt rubbad',
      'Ej återfunnen',
      'Borta, raserad',
      'Bör raseras',
    ]);
    expect(TILLSTAND_KALLA).toContain('§2.1 K2');
    expect(TILLSTAND_KALLA).toContain('K5');
  });
});

// ── §1.6 kodning och §1 K2 täckningsfaktor ─────────────────────────────────

describe('kodsystem, §1.6', () => {
  it('järnväg förväljer TDOK 2019:0215, väg BH 90 del 7 bilaga D.1', () => {
    expect(kodsystemFor('jarnvag')).toBe('TDOK 2019:0215');
    expect(kodsystemFor('vag')).toBe('BH 90 del 7 bilaga D.1');
    expect(KODSYSTEM.vag.kalla).toBe('TDOK 2014:0571 v6.0 §1.6');
  });

  it('utanför Trafikverket finns inget förval', () => {
    expect(kodsystemFor('ej-tv')).toBe('');
    expect(kodsystemFor('')).toBe('');
  });
});

describe('täckningsfaktor, §1 K2', () => {
  // "Om inget anges kopplat till uttrycket osäkerhet är det täckningsfaktor 2
  // som avses." Förvalet måste därför vara 2.
  it('förvalet är utökad osäkerhet, täckningsfaktor 2', () => {
    expect(TACKNINGSFAKTOR_FORVAL).toBe('2');
    expect(TACKNINGSFAKTOR[0].v).toBe('2');
    expect(TACKNINGSFAKTOR[0].l).toContain('Utökad');
    expect(TACKNINGSFAKTOR.map(t => t.v).sort()).toEqual(['1', '2']);
  });
});

// ── Migrering av gamla utkast ───────────────────────────────────────────────

describe('migrering av v_nats', () => {
  it('Bruksnät → Bruksnät i plan', () => {
    expect(migreraNats('Bruksnät i plan (§6.4)').nattyp).toBe('bruksnat');
  });

  it('Brobyggnad → Bro', () => {
    expect(migreraNats('Nät för brobyggnad (§6.5.5)').nattyp).toBe('bro');
  });

  it('Tunneldrivning → Tunnel', () => {
    expect(migreraNats('Nät för tunneldrivning (§6.5.3)').nattyp).toBe('tunnel');
  });

  it('Anslutningsnät → Ej Trafikverket med motsvarande SIS-TS-typ', () => {
    expect(migreraNats('Anslutningsnät (§6.3)'))
      .toEqual({ verksamhet: 'ej-tv', nattyp: 'sis-anslutning' });
  });

  it('Rörelsemätning → Ej Trafikverket med motsvarande SIS-TS-typ', () => {
    expect(migreraNats('Nät för rörelsemätning (§6.5.6)'))
      .toEqual({ verksamhet: 'ej-tv', nattyp: 'sis-rorelse' });
  });

  // De tre TDOK-nättyperna säger ingenting om verksamhet. Ett gammalt utkast
  // vet inte om det var väg eller järnväg, och migreringen får inte gissa –
  // valet avgör dokumenttyp och mall.
  it('lämnar verksamheten ovald för de tre TDOK-nättyperna', () => {
    for (const t of ['Bruksnät i plan (§6.4)', 'Nät för brobyggnad (§6.5.5)',
                     'Nät för tunneldrivning (§6.5.3)']) {
      expect(migreraNats(t).verksamhet, t).toBe('');
    }
  });

  it('tom, saknad eller okänd text ger ovalda värden', () => {
    for (const t of ['', '   ', undefined, null, 'Något annat']) {
      expect(migreraNats(t)).toEqual({ verksamhet: '', nattyp: '' });
    }
  });

  it('varje migrerad nättyp finns i rätt lista', () => {
    for (const t of ['Bruksnät i plan (§6.4)', 'Nät för brobyggnad (§6.5.5)',
                     'Nät för tunneldrivning (§6.5.3)']) {
      const { nattyp } = migreraNats(t);
      expect(NATTYPER_TV.some(n => n.v === nattyp), t).toBe(true);
    }
    for (const t of ['Anslutningsnät (§6.3)', 'Nät för rörelsemätning (§6.5.6)']) {
      const { nattyp } = migreraNats(t);
      expect(NATTYPER_SIS.some(n => n.v === nattyp), t).toBe(true);
    }
  });
});

describe('migrering av markeringsfritext', () => {
  it('exakt Tabell 2-text under bara PP ger typkod PP', () => {
    expect(migreraMarkering('Unikonsol (standard)'))
      .toEqual({ typkod: 'PP', typ: 'Unikonsol (standard)', annan: false });
    expect(migreraMarkering('Rör i mark med däcksel').typkod).toBe('PP');
  });

  it('exakt Tabell 2-text under bara FIX ger typkod FIX', () => {
    expect(migreraMarkering('Järn i foderrör'))
      .toEqual({ typkod: 'FIX', typ: 'Järn i foderrör', annan: false });
  });

  // Texten är giltig men säger inte vilken kod punkten har – koden lämnas
  // ovald i stället för att gissas.
  it('text under båda koderna behålls men utan typkod', () => {
    expect(migreraMarkering('Dubb i berg'))
      .toEqual({ typkod: '', typ: 'Dubb i berg', annan: false });
    expect(migreraMarkering('Dubb i sten').typkod).toBe('');
  });

  it('okänd text behålls som "Annan: …"', () => {
    expect(migreraMarkering('Rörstump i dike'))
      .toEqual({ typkod: '', typ: 'Annan: Rörstump i dike', annan: true });
  });

  // Matchningen är EXAKT. Fel skiftläge eller tillagd text gissas inte till
  // en typkod – användaren ser direkt vad som inte känts igen.
  it('matchningen är exakt – skiftläge och tillägg ger "Annan: …"', () => {
    expect(migreraMarkering('dubb i berg').typ).toBe('Annan: dubb i berg');
    expect(migreraMarkering('DUBB I BERG').annan).toBe(true);
    expect(migreraMarkering('Dubb i berg (ny)').typ).toBe('Annan: Dubb i berg (ny)');
    expect(migreraMarkering('Dubb  i  berg').annan).toBe(true);
  });

  it('tom text ger inget val', () => {
    for (const t of ['', '   ', undefined, null]) {
      expect(migreraMarkering(t)).toEqual({ typkod: '', typ: '', annan: false });
    }
  });

  it('omgivande blanksteg trimmas före matchning', () => {
    expect(migreraMarkering('  Järn i foderrör  ').typkod).toBe('FIX');
  });
});

describe('migreraUtkast', () => {
  it('ett gammalt utkast får verksamhet, nättyp och täckningsfaktor', () => {
    const ut = migreraUtkast({ proj: 'Gammalt', nats: 'Nät för brobyggnad (§6.5.5)' });
    expect(ut.nattyp).toBe('bro');
    expect(ut.verksamhet).toBe('');
    expect(ut.kravk).toBe('2');
  });

  it('all övrig text i utkastet lämnas orörd', () => {
    const gammalt = {
      proj: 'P', projnr: '1', best: 'B', utf: 'U', ans: 'A',
      nats: 'Bruksnät i plan (§6.4)', metod: 'Polär mätning',
      r32txt: 'text', krav: '5', leverans: 'Digitalt',
    };
    const ut = migreraUtkast(gammalt);
    for (const [k, v] of Object.entries(gammalt)) expect(ut[k], k).toBe(v);
  });

  it('v_nats behålls, så att det går att se vad utkastet kom ifrån', () => {
    expect(migreraUtkast({ nats: 'Bruksnät i plan (§6.4)' }).nats)
      .toBe('Bruksnät i plan (§6.4)');
  });

  it('är idempotent – ett redan migrerat utkast ändras inte', () => {
    const en  = migreraUtkast({ nats: 'Nät för tunneldrivning (§6.5.3)' });
    const två = migreraUtkast(en);
    expect(två).toEqual(en);
  });

  it('skriver inte över ett val användaren redan gjort', () => {
    const ut = migreraUtkast({
      nats: 'Bruksnät i plan (§6.4)', verksamhet: 'jarnvag', nattyp: 'tunnel', kravk: '1',
    });
    expect(ut.verksamhet).toBe('jarnvag');
    expect(ut.nattyp).toBe('tunnel');
    expect(ut.kravk).toBe('1');
  });

  it('ett tomt utkast får bara täckningsfaktorns förval', () => {
    expect(migreraUtkast({})).toEqual({ verksamhet: '', nattyp: '', kravk: '2' });
    expect(migreraUtkast()).toEqual({ verksamhet: '', nattyp: '', kravk: '2' });
  });

  it('muterar inte indata', () => {
    const in_ = { nats: 'Bruksnät i plan (§6.4)' };
    migreraUtkast(in_);
    expect(in_).toEqual({ nats: 'Bruksnät i plan (§6.4)' });
  });
});

// ── Steg 1: verksamheten styr nättypslistan ─────────────────────────────────

describe('steg 1 – kopplingen verksamhet → nättyp', () => {
  const D = {
    sr: { K_global: 0.75 }, crs: 'SWEREF 99 TM', mkKey: 'G2',
    allPts: [{ id: 'FP1' }], dag: '2026-09-23',
  };

  let c;
  const rendera = async vals => {
    const { render } = await import('../src/pm/steps/step1-project.js');
    c = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(c);
    render(D, c, vals);
    return vals;
  };
  const opt = id => [...document.getElementById(id).options].map(o => o.value).filter(Boolean);

  it('nättypslistan är SIS-TS-listan innan verksamhet valts', async () => {
    await rendera({});
    expect(opt('v_nattyp')).toEqual(NATTYPER_SIS.map(n => n.v));
  });

  it('väg och järnväg ger Trafikverkslistan', async () => {
    await rendera({});
    const v = document.getElementById('v_verksamhet');
    v.value = 'vag';
    v.dispatchEvent(new Event('change'));
    expect(opt('v_nattyp')).toEqual(NATTYPER_TV.map(n => n.v));
  });

  it('Ej Trafikverket ger SIS-TS-listan', async () => {
    await rendera({});
    const v = document.getElementById('v_verksamhet');
    v.value = 'ej-tv';
    v.dispatchEvent(new Event('change'));
    expect(opt('v_nattyp')).toEqual(NATTYPER_SIS.map(n => n.v));
  });

  // Byter användaren verksamhet står den gamla nättypen kvar bara om den finns
  // i den nya listan – annars blir valet ogiltigt utan att synas.
  it('nättypen nollställs när den inte finns i den nya listan', async () => {
    await rendera({ verksamhet: 'vag', nattyp: 'tunnel' });
    expect(document.getElementById('v_nattyp').value).toBe('tunnel');
    const v = document.getElementById('v_verksamhet');
    v.value = 'ej-tv';
    v.dispatchEvent(new Event('change'));
    expect(document.getElementById('v_nattyp').value).toBe('');
  });

  it('visar dokumenttypen med sin paragraf när båda valen är gjorda', async () => {
    await rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    const txt = document.getElementById('dok-info').textContent;
    expect(txt).toContain('Åtgärdsförslag');
    expect(txt).toContain('§2.5 K1');
    expect(txt).toContain('TDOK 2019:0215');       // kodsystem, §1.6
  });

  it('ber om valen när de saknas', async () => {
    await rendera({});
    expect(document.getElementById('dok-info').textContent).toContain('Välj verksamhet och nättyp');
  });

  // §1.1 K2–K3 gäller järnväg.
  it('erfarenhetsfälten visas bara för järnväg', async () => {
    await rendera({ verksamhet: 'vag', nattyp: 'bruksnat' });
    expect(document.getElementById('v_erfprojekt')).toBeNull();

    await rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    expect(document.getElementById('v_erfprojekt')).not.toBeNull();
    expect(document.getElementById('v_erfmiljo')).not.toBeNull();
  });

  it('behörighetsfälten enligt §1.1 K1 finns alltid', async () => {
    await rendera({ verksamhet: 'ej-tv', nattyp: 'sis-bruksnat' });
    expect(document.getElementById('v_behtyp')).not.toBeNull();
    expect(document.getElementById('v_behnr')).not.toBeNull();
  });

  it('§2.5 K2-fälten syfte, anslutningslösning och tidplan finns', async () => {
    await rendera({});
    for (const id of ['v_syfte', 'v_anslutning', 'v_genomforande',
                      'v_tidplan', 'v_tidstart', 'v_tidslut', 'v_gnsssess']) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it('det gamla v_nats-fältet finns inte kvar', async () => {
    await rendera({ nats: 'Bruksnät i plan (§6.4)' });
    expect(document.getElementById('v_nats')).toBeNull();
  });
});

// ── Föräldralösa tabellnycklar ──────────────────────────────────────────────

describe('föräldralösa tabellnycklar', () => {
  const PT_IDS = ['FP1', 'NY1'];
  const bas = () => ({
    markering: { FP1: { typkod: 'PP', typ: 'Dubb i berg' }, BORTA: { typkod: 'FIX', typ: 'Dubb i sten' } },
    tillstand: { FP1: { kat: 'Misstänkt rubbad' }, ÄVEN_BORTA: { kat: 'Ej återfunnen' } },
    gemensam:  { NY1: true, BORTA: true },
  });

  it('pekar ut nycklar utan punkt i nätet', () => {
    expect(foraldralosa(bas().markering, PT_IDS)).toEqual(['BORTA']);
    expect(foraldralosa(bas().tillstand, PT_IDS)).toEqual(['ÄVEN_BORTA']);
    expect(foraldralosa(bas().gemensam, PT_IDS)).toEqual(['BORTA']);
  });

  it('tål saknade och tomma tabeller', () => {
    expect(foraldralosa(undefined, PT_IDS)).toEqual([]);
    expect(foraldralosa({}, PT_IDS)).toEqual([]);
    expect(foraldralosa({ A: 1 }, [])).toEqual(['A']);
    expect(foraldralosa({ A: 1 }, undefined)).toEqual(['A']);
  });

  it('samlar alla tre tabellerna', () => {
    expect(foraldralosaTabeller(bas(), PT_IDS)).toEqual({
      markering: ['BORTA'], tillstand: ['ÄVEN_BORTA'], gemensam: ['BORTA'],
    });
  });

  it('harForaldralosa är sann bara när något faktiskt saknas', () => {
    expect(harForaldralosa(bas(), PT_IDS)).toBe(true);
    expect(harForaldralosa(bas(), ['FP1', 'NY1', 'BORTA', 'ÄVEN_BORTA'])).toBe(false);
    expect(harForaldralosa({}, PT_IDS)).toBe(false);
    expect(harForaldralosa()).toBe(false);
  });

  it('rensning tar bort exakt de föräldralösa och rör inte övriga', () => {
    const v = bas();
    expect(rensaForaldralosa(v, PT_IDS)).toBe(3);
    expect(v.markering).toEqual({ FP1: { typkod: 'PP', typ: 'Dubb i berg' } });
    expect(v.tillstand).toEqual({ FP1: { kat: 'Misstänkt rubbad' } });
    expect(v.gemensam).toEqual({ NY1: true });
    expect(harForaldralosa(v, PT_IDS)).toBe(false);
  });

  it('rensning på ett rent vals gör ingenting', () => {
    const v = { markering: { FP1: {} }, tillstand: {}, gemensam: {} };
    expect(rensaForaldralosa(v, PT_IDS)).toBe(0);
    expect(v.markering.FP1).toBeDefined();
  });

  it('TABELLER täcker de tre tabellerna och inget mer', () => {
    expect([...TABELLER]).toEqual(['markering', 'tillstand', 'gemensam']);
  });
});
