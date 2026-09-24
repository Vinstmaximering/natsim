// Etapp 3 – steg 3, Punkter och markering.
//
// Tabellerna lagras i PM:ets egna vals, nycklade på punkt-id. Testerna låser
// att de skrivs dit, att migreringen av pt.markering bara fyller tomma platser,
// och att de verksamhets- och nättypsberoende sektionerna visas när de ska.

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '../src/pm/steps/step3-points.js';
import { TILLSTAND_KATEGORIER, MARKERINGSTYPER } from '../src/pm/tdok-v6.js';

const D = {
  allPts: [
    { id: 'FP1', type: 'known',   N: 100, E: 100, H: 10, markering: 'Dubb i berg' },
    { id: 'FP2', type: 'known',   N: 200, E: 100, H: 10, markering: 'Järn i foderrör' },
    { id: 'NY1', type: 'new',     N: 150, E: 150, H: 10, markering: 'Rörstump i dike' },
    { id: 'S1',  type: 'station', N: 120, E: 180, H: 10, markering: '' },
  ],
  knownPts: [
    { id: 'FP1', N: 100, E: 100, H: 10, markering: 'Dubb i berg' },
    { id: 'FP2', N: 200, E: 100, H: 10, markering: 'Järn i foderrör' },
  ],
};

let c;
const rendera = vals => { c = document.createElement('div'); render(D, c, vals); return vals; };
const q = sel => c.querySelector(sel);

beforeEach(() => { document.body.innerHTML = ''; });

// ── Markeringstyp ───────────────────────────────────────────────────────────

describe('markeringstabellen', () => {
  it('har en rad per punkt i nätet', () => {
    rendera({});
    expect(c.querySelectorAll('[data-mk-kod]')).toHaveLength(D.allPts.length);
    expect(c.querySelectorAll('[data-mk-typ]')).toHaveLength(D.allPts.length);
  });

  it('migrerar pt.markering till vals.markering vid första renderingen', () => {
    const vals = rendera({});
    // Entydig FIX-text ger typkod.
    expect(vals.markering.FP2).toEqual({ typkod: 'FIX', typ: 'Järn i foderrör' });
    // Text under båda koderna behålls men utan kod.
    expect(vals.markering.FP1).toEqual({ typkod: '', typ: 'Dubb i berg' });
    // Okänd text blir "Annan: …".
    expect(vals.markering.NY1).toEqual({ typkod: '', typ: 'Annan: Rörstump i dike' });
    // Tom markering ger ingen nyckel alls.
    expect(vals.markering.S1).toBeUndefined();
  });

  it('skriver aldrig över ett val användaren redan gjort', () => {
    const vals = { markering: { FP1: { typkod: 'PP', typ: 'Unikonsol (standard)' } } };
    rendera(vals);
    expect(vals.markering.FP1).toEqual({ typkod: 'PP', typ: 'Unikonsol (standard)' });
  });

  it('typlistan följer den valda typkoden', () => {
    rendera({});
    const kod = q('[data-mk-kod="S1"]');
    const typ = q('[data-mk-typ="S1"]');
    expect([...typ.options].map(o => o.value).filter(Boolean)).toEqual([]);

    kod.value = 'FIX';
    kod.dispatchEvent(new Event('change'));
    expect([...typ.options].map(o => o.value).filter(Boolean)).toEqual([...MARKERINGSTYPER.FIX]);

    kod.value = 'PP';
    kod.dispatchEvent(new Event('change'));
    expect([...typ.options].map(o => o.value).filter(Boolean)).toEqual([...MARKERINGSTYPER.PP]);
  });

  it('ett val skrivs till vals med både typkod och typ', () => {
    const vals = rendera({});
    const kod = q('[data-mk-kod="S1"]');
    const typ = q('[data-mk-typ="S1"]');
    kod.value = 'PP';
    kod.dispatchEvent(new Event('change'));
    typ.value = 'Dubb i sten';
    typ.dispatchEvent(new Event('change'));
    expect(vals.markering.S1).toEqual({ typkod: 'PP', typ: 'Dubb i sten' });
  });

  // En migrerad "Annan: …"-text finns inte i någon kods lista och skulle
  // annars tappas så fort typkoden sattes.
  it('en "Annan: …"-text finns kvar som val när typkoden sätts', () => {
    const vals = rendera({});
    const typ = q('[data-mk-typ="NY1"]');
    expect(typ.value).toBe('Annan: Rörstump i dike');
    const kod = q('[data-mk-kod="NY1"]');
    kod.value = 'PP';
    kod.dispatchEvent(new Event('change'));
    expect([...typ.options].map(o => o.value)).toContain('Annan: Rörstump i dike');
  });

  it('tömt val tar bort nyckeln', () => {
    const vals = rendera({});
    const kod = q('[data-mk-kod="FP2"]');
    const typ = q('[data-mk-typ="FP2"]');
    kod.value = ''; kod.dispatchEvent(new Event('change'));
    typ.value = ''; typ.dispatchEvent(new Event('change'));
    expect(vals.markering.FP2).toBeUndefined();
  });
});

// ── Tillståndsbedömning ─────────────────────────────────────────────────────

describe('tillståndsbedömning (§2.1 K5)', () => {
  it('visas bara för järnväg', () => {
    rendera({ verksamhet: 'vag', nattyp: 'bruksnat' });
    expect(c.querySelector('[data-ts-kat]')).toBeNull();

    rendera({ verksamhet: 'ej-tv', nattyp: 'sis-bruksnat' });
    expect(c.querySelector('[data-ts-kat]')).toBeNull();

    rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    expect(c.querySelector('[data-ts-kat]')).not.toBeNull();
  });

  it('förifyller punktnummer från nätets kända punkter', () => {
    rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    const ids = [...c.querySelectorAll('[data-ts-kat]')].map(el => el.dataset.tsKat);
    expect(ids).toEqual(['FP1', 'FP2']);
  });

  it('erbjuder de fem kategorierna i §2.1 K2', () => {
    rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    const val = [...q('[data-ts-kat="FP1"]').options].map(o => o.value).filter(Boolean);
    expect(val).toEqual([...TILLSTAND_KATEGORIER]);
  });

  // §2.1 K5 kräver punktnummer, kategori, siktförhållande och tidpunkt.
  it('har fält för kategori, siktförhållande och tidpunkt', () => {
    rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    expect(q('[data-ts-kat="FP1"]')).not.toBeNull();
    expect(q('[data-ts-sikt="FP1"]')).not.toBeNull();
    expect(q('[data-ts-datum="FP1"]')).not.toBeNull();
    expect(q('[data-ts-datum="FP1"]').type).toBe('date');
  });

  it('skriver bedömningen till vals.tillstand', () => {
    const vals = rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    const kat = q('[data-ts-kat="FP1"]');
    kat.value = 'Misstänkt rubbad';
    kat.dispatchEvent(new Event('change'));
    const sikt = q('[data-ts-sikt="FP1"]');
    sikt.value = 'Fri sikt mot FP2';
    sikt.dispatchEvent(new Event('input'));
    const datum = q('[data-ts-datum="FP1"]');
    datum.value = '2026-09-01';
    datum.dispatchEvent(new Event('change'));
    expect(vals.tillstand.FP1)
      .toEqual({ kat: 'Misstänkt rubbad', sikt: 'Fri sikt mot FP2', datum: '2026-09-01' });
  });

  it('återställer sparade bedömningar', () => {
    rendera({
      verksamhet: 'jarnvag', nattyp: 'bruksnat',
      tillstand: { FP2: { kat: 'Ej återfunnen', sikt: 'Skymd', datum: '2026-08-15' } },
    });
    expect(q('[data-ts-kat="FP2"]').value).toBe('Ej återfunnen');
    expect(q('[data-ts-sikt="FP2"]').value).toBe('Skymd');
    expect(q('[data-ts-datum="FP2"]').value).toBe('2026-08-15');
  });
});

// ── Gemensamma markeringar ──────────────────────────────────────────────────

describe('gemensamma markeringar (§2.11.2 K4)', () => {
  it('visas bara för bro i järnvägsverksamhet', () => {
    rendera({ verksamhet: 'jarnvag', nattyp: 'bro' });
    expect(c.querySelector('[data-gem]')).not.toBeNull();

    rendera({ verksamhet: 'vag', nattyp: 'bro' });
    expect(c.querySelector('[data-gem]')).toBeNull();

    rendera({ verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    expect(c.querySelector('[data-gem]')).toBeNull();
  });

  it('kryssade punkter hamnar i vals.gemensam', () => {
    const vals = rendera({ verksamhet: 'jarnvag', nattyp: 'bro' });
    const a = q('[data-gem="FP1"]');
    a.checked = true; a.dispatchEvent(new Event('change'));
    expect(vals.gemensam).toEqual({ FP1: true });

    a.checked = false; a.dispatchEvent(new Event('change'));
    expect(vals.gemensam).toEqual({});
  });

  it('räknaren säger om §2.11.2 K4:s minst 2 är uppfyllt', () => {
    const vals = rendera({ verksamhet: 'jarnvag', nattyp: 'bro' });
    expect(c.querySelector('#gem-antal').textContent).toContain('kräver minst 2');

    for (const id of ['FP1', 'FP2']) {
      const cb = q(`[data-gem="${id}"]`);
      cb.checked = true; cb.dispatchEvent(new Event('change'));
    }
    expect(c.querySelector('#gem-antal').textContent).toContain('uppfyller');
  });

  it('återställer sparade kryss', () => {
    rendera({ verksamhet: 'jarnvag', nattyp: 'bro', gemensam: { FP2: true } });
    expect(q('[data-gem="FP1"]').checked).toBe(false);
    expect(q('[data-gem="FP2"]').checked).toBe(true);
  });
});

// ── Robusthet ───────────────────────────────────────────────────────────────

describe('robusthet', () => {
  it('ett nät utan punkter renderar utan att kasta', () => {
    const tom = { allPts: [], knownPts: [] };
    const el = document.createElement('div');
    expect(() => render(tom, el, {})).not.toThrow();
    expect(el.textContent).toContain('inga punkter');
  });

  it('järnväg utan kända punkter säger det i stället för att visa en tom tabell', () => {
    const utanKanda = { allPts: [{ id: 'NY1', type: 'new', markering: '' }], knownPts: [] };
    const el = document.createElement('div');
    render(utanKanda, el, { verksamhet: 'jarnvag', nattyp: 'bruksnat' });
    expect(el.textContent).toContain('inga kända punkter');
  });

  it('objekten finns alltid i vals efter rendering', () => {
    const vals = rendera({});
    expect(vals.markering).toBeTypeOf('object');
    expect(vals.tillstand).toBeTypeOf('object');
    expect(vals.gemensam).toBeTypeOf('object');
  });
});

// ── Föräldralösa värden i steg 3 ────────────────────────────────────────────

describe('värden utan punkt i nätet', () => {
  const medBorta = () => ({
    verksamhet: 'jarnvag', nattyp: 'bro',
    markering: { FP1: { typkod: '', typ: 'Dubb i berg' },
                 GAMMAL: { typkod: 'FIX', typ: 'Järn i foderrör' } },
    tillstand: { UTGATT: { kat: 'Ej återfunnen', sikt: 'Skymd', datum: '2026-01-01' } },
    gemensam:  { FP1: true, RIVEN: true },
  });

  it('sektionen visas bara när något saknas', () => {
    rendera({});
    expect(c.querySelector('#foraldralosa-sek').innerHTML).toBe('');

    rendera(medBorta());
    expect(c.querySelector('#foraldralosa-sek').textContent).toContain('Värden utan punkt i nätet');
  });

  it('listar varje föräldralös nyckel med tabell och värde', () => {
    rendera(medBorta());
    const txt = c.querySelector('#foraldralosa-sek').textContent;
    for (const id of ['GAMMAL', 'UTGATT', 'RIVEN']) expect(txt, id).toContain(id);
    expect(txt).toContain('Markeringstyp');
    expect(txt).toContain('Tillståndsbedömning');
    expect(txt).toContain('Gemensam markering');
    // Värdet sammanfattas så att det går att bedöma innan det tas bort.
    expect(txt).toContain('FIX · Järn i foderrör');
    expect(txt).toContain('Ej återfunnen');
  });

  it('listar inte punkter som finns i nätet', () => {
    rendera(medBorta());
    const rader = [...c.querySelectorAll('#foraldralosa-sek [data-fl-id]')]
      .map(b => b.dataset.flId);
    expect(rader.sort()).toEqual(['GAMMAL', 'RIVEN', 'UTGATT']);
    expect(rader).not.toContain('FP1');
  });

  it('säger uttryckligen att värdena inte kommer med i rapporten', () => {
    rendera(medBorta());
    expect(c.querySelector('#foraldralosa-sek').textContent)
      .toContain('De tas inte med i rapporten');
  });

  it('en enskild post går att ta bort', () => {
    const vals = rendera(medBorta());
    c.querySelector('[data-fl-id="GAMMAL"]').click();
    expect(vals.markering.GAMMAL).toBeUndefined();
    expect(vals.markering.FP1).toBeDefined();
    // Listan ritas om och visar de kvarvarande.
    expect(c.querySelector('#foraldralosa-sek').textContent).not.toContain('GAMMAL');
    expect(c.querySelector('#foraldralosa-sek').textContent).toContain('UTGATT');
  });

  it('alla går att ta bort på en gång, och sektionen försvinner', () => {
    const vals = rendera(medBorta());
    c.querySelector('#fl-rensa-alla').click();
    // Kvar ska vara exakt nätets punkter. FP2 och NY1 finns här trots att de
    // inte stod i utkastet – de fick sin markering av migreringen vid render.
    expect(Object.keys(vals.markering).sort()).toEqual(['FP1', 'FP2', 'NY1']);
    expect(vals.tillstand).toEqual({});
    expect(vals.gemensam).toEqual({ FP1: true });
    expect(c.querySelector('#foraldralosa-sek').innerHTML).toBe('');
  });

  // Borttagning går inte att ångra, så den sker aldrig av sig själv.
  it('rendering ensam tar inte bort något', () => {
    const vals = medBorta();
    rendera(vals);
    expect(vals.markering.GAMMAL).toBeDefined();
    expect(vals.tillstand.UTGATT).toBeDefined();
    expect(vals.gemensam.RIVEN).toBe(true);
  });
});
