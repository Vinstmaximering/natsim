// Etapp 3, justering – toleranskravets täckningsfaktor följer kravets ursprung.
//
// Kravet kan komma från två håll, och de betyder olika saker:
//   • NätSims A PRIORI σ-flik (D.sigReq) är ett krav på σ_pos, alltså
//     standardosäkerhet. Simuleringen räknar 1σ och inget annat, så
//     täckningsfaktor 1 är vad talet FAKTISKT betyder – inte ett antagande.
//   • Ett krav användaren skriver in själv har okänd täckningsfaktor, och då
//     gäller TDOK 2014:0571 v6.0 §1 K2: täckningsfaktor 2 om inget annat sägs.

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '../src/pm/steps/step3-instruments.js';
import { TACKNINGSFAKTOR_FORVAL, TACKNINGSFAKTOR_SIGREQ } from '../src/pm/tdok-v6.js';

const basD = {
  ins: 'Leica TS16 1″', mHz: 0.3, mDm: 1.0, mDp: 1.0, mSt: 3, centerErr: 1.0,
};

let c;
function rendera(D, vals = {}) {
  document.body.innerHTML = '';
  c = document.createElement('div');
  document.body.appendChild(c);
  render({ ...basD, ...D }, c, vals);
  return vals;
}
const el = id => document.getElementById(id);
const ursprung = () => el('krav-ursprung').textContent;

beforeEach(() => { document.body.innerHTML = ''; });

describe('konstanterna', () => {
  it('sigReq ger täckningsfaktor 1, okänt ursprung ger 2', () => {
    expect(TACKNINGSFAKTOR_SIGREQ).toBe('1');
    expect(TACKNINGSFAKTOR_FORVAL).toBe('2');
  });
});

describe('kravet hämtat från NätSim (sigReq)', () => {
  it('förifyller kravfältet', () => {
    rendera({ sigReq: 3 });
    expect(el('v_krav').value).toBe('3');
  });

  it('förväljer täckningsfaktor 1', () => {
    rendera({ sigReq: 3 });
    expect(el('v_kravk').value).toBe('1');
  });

  it('säger varifrån kravet kom och varför faktorn är 1', () => {
    rendera({ sigReq: 3 });
    expect(ursprung()).toContain('hämtat från NätSim');
    expect(ursprung()).toContain('A priori');
    expect(ursprung()).toContain('standardosäkerheten');
    expect(ursprung()).toContain('täckningsfaktor 1');
  });

  it('svensk decimalkomma i det utskrivna värdet', () => {
    rendera({ sigReq: 2.5 });
    expect(ursprung()).toContain('2,5');
  });
});

describe('kravet anges av användaren', () => {
  it('utan sigReq är fältet tomt och faktorn 2', () => {
    rendera({});
    expect(el('v_krav').value).toBe('');
    expect(el('v_kravk').value).toBe('2');
  });

  it('säger att §1 K2 ligger bakom förvalet', () => {
    rendera({});
    expect(ursprung()).toContain('Kravet anges här');
    expect(ursprung()).toContain('Täckningsfaktor 2');
    expect(ursprung()).toContain('TDOK 2014:0571 v6.0 §1 K2');
  });

  it('sigReq som null eller tom sträng räknas som frånvarande', () => {
    for (const v of [null, undefined, '']) {
      rendera({ sigReq: v });
      expect(el('v_kravk').value, String(v)).toBe('2');
      expect(ursprung(), String(v)).toContain('Kravet anges här');
    }
  });
});

describe('ett sparat utkast vinner alltid', () => {
  it('eget krav förifylls inte över av sigReq', () => {
    rendera({ sigReq: 3 }, { krav: '8' });
    expect(el('v_krav').value).toBe('8');
  });

  it('eget krav ger faktor 2, inte sigReq-förvalet', () => {
    rendera({ sigReq: 3 }, { krav: '8' });
    expect(el('v_kravk').value).toBe('2');
    expect(ursprung()).toContain('Kravet anges här');
  });

  it('en sparad täckningsfaktor skrivs aldrig över', () => {
    rendera({ sigReq: 3 }, { kravk: '2' });
    expect(el('v_kravk').value).toBe('2');
    rendera({}, { kravk: '1' });
    expect(el('v_kravk').value).toBe('1');
  });

  // Ett tomt sparat krav är inte ett eget val – då får sigReq förifylla.
  it('tomt sparat krav hindrar inte förifyllningen', () => {
    rendera({ sigReq: 4 }, { krav: '   ' });
    expect(el('v_krav').value).toBe('4');
    expect(el('v_kravk').value).toBe('1');
  });
});

describe('fältet självt', () => {
  it('har båda täckningsfaktorerna som val', () => {
    rendera({});
    expect([...el('v_kravk').options].map(o => o.value)).toEqual(['2', '1']);
  });

  it('kompletterande utrustning enligt §2.8 K15 och K19 finns', () => {
    rendera({});
    for (const id of ['v_termometer', 'v_barometer', 'v_tvangutr', 'v_gnssutr']) {
      expect(el(id), id).not.toBeNull();
    }
  });
});
