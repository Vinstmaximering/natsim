// ─────────────────────────────────────────────────────────────────────────────
// FACITTESTER för beräkningskärnan
//
// Dessa tester är OBEROENDE av NätSims implementation. Varje facit är antingen
// handräknat med slutet svar eller hämtat direkt ur HMK-Stommätning 2024.
// De är medvetet åtskilda från tests/calc.test.js, som är ett golden master mot
// den ursprungliga kärnan (NätSim_Beta_2.html) och därför kodifierar de fel
// som rättas här.
//
// REGEL: när ett golden-master-test går rött av en korrekt fix skrivs testet om
// mot facit – fixen justeras aldrig bakåt för att blidka det gamla värdet.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { runSimulation } from '../src/core/simulation.js'
import { runSimStations } from '../src/core/stations.js'
import { exportCalcReport } from '../src/reports/sim-report.js'
import { klassificeraKtal, K_NAT_GOLV } from '../src/core/constants.js'
import { setState, getState } from '../src/state/store.js'

// Kör ett nät genom kärnan och returnera simResult.
function kor(pts, meas, centerErr = 0) {
  setState({ pts, meas, centerErr, activeMatklass: '', simResult: null })
  runSimulation()
  return getState().simResult
}

// ═════════════════════════════════════════════════════════════════════════════
// F1 – ∂riktning/∂z i den bågmeterskalade riktningsraden
//
// Riktningsraden multipliceras med siktlängden d (bågmeter) och σ skalas som
// σ_arc = d·σ_rad. Då måste även orienteringsledet skalas: ∂(d·φ)/∂z = −d.
//
// HANDRÄKNAT FACIT (HMK-Stommätning 2024 Formel 3.3 / Bilaga F):
//   Uppställning på känd punkt, riktningar mot enbart kända punkter.
//   Enda obekant är orienteringskonstanten ⇒ n = 3, u = 1, f = 2.
//   Korrekt modell:  a_i = −d_i,  σ_i = d_i·σ_α  ⇒  p_i = 1/(d_i²σ_α²)
//     N    = Σ p_i d_i²    = 3/σ_α²
//     h_ii = a_i² p_i / N  = d_i²·(1/(d_i²σ_α²))·(σ_α²/3) = 1/3   ← oberoende av d_i
//     r_i  = 1 − 1/3 = 2/3   för samtliga,   Σr = 2 = f
//
//   Felaktig modell (a_i = −1):  h_ii = p_i/Σp_j = (1/d_i²)/Σ(1/d_j²)
//     med d = 50/100/400 blir vikterna 64 : 16 : 1 (summa 81) ⇒
//     r = 1−64/81 = 0,209877,  1−16/81 = 0,802469,  1−1/81 = 0,987654
// ═════════════════════════════════════════════════════════════════════════════
describe('F1 – orienteringspartialen ∂(d·φ)/∂z = −d', () => {
  // Uppställning S på känd punkt, tre kända mål på 50/100/400 m, 120° isär.
  // centerErr = 0 genomgående så att σ_α blir identisk för alla tre sikter –
  // det är förutsättningen för att facit r = 2/3 ska gälla exakt.
  const avstand = [50, 100, 400]
  const pts = [{ id: 'S', type: 'known', E: 0, N: 0, centerErr: 0 }]
  avstand.forEach((d, i) => {
    const a = (i * 120) * Math.PI / 180
    pts.push({ id: 'FP' + (i + 1), type: 'known', E: d * Math.sin(a), N: d * Math.cos(a), centerErr: 0 })
  })
  const meas = avstand.map((_, i) => ({
    id: 'm' + (i + 1), from: 'S', to: 'FP' + (i + 1), obsType: 'hz_only',
    sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1'
  }))

  it('obekantvektorn innehåller enbart orienteringskonstanten (n=3, u=1, f=2)', () => {
    const sr = kor(pts, meas, 0)
    expect(sr.error).toBeUndefined()
    expect(sr.meas_n).toBe(3)
    expect(sr.unkn_n).toBe(1)
    expect(sr.nCoordUnkn).toBe(0)
    expect(sr.nOrientUnkn).toBe(1)
    expect(sr.redundancy).toBe(2)
  })

  it('r_i = 2/3 för samtliga sikter, oberoende av siktlängd (50/100/400 m)', () => {
    const sr = kor(pts, meas, 0)
    sr.redund.forEach((rd, i) => {
      expect(rd.ri, `sikt ${rd.fromId}→${rd.toId} (d=${avstand[i]} m)`).toBeCloseTo(2 / 3, 9)
    })
  })

  it('Σr_i = 2 = f', () => {
    const sr = kor(pts, meas, 0)
    const sum = sr.redund.reduce((a, b) => a + b.ri, 0)
    expect(sum).toBeCloseTo(2, 9)
  })

  it('r är identiskt även när siktlängderna är lika (regressionsskydd)', () => {
    // Vid lika d är −1 vs −d en ren kolumnskalning och därmed ofarlig.
    // Detta test var grönt före fixen och måste förbli grönt efter.
    const likaPts = [{ id: 'S', type: 'known', E: 0, N: 0, centerErr: 0 }]
    for (let i = 0; i < 3; i++) {
      const a = (i * 120) * Math.PI / 180
      likaPts.push({ id: 'FP' + (i + 1), type: 'known', E: 100 * Math.sin(a), N: 100 * Math.cos(a), centerErr: 0 })
    }
    const sr = kor(likaPts, meas, 0)
    sr.redund.forEach(rd => expect(rd.ri).toBeCloseTo(2 / 3, 9))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F2 – orienteringsobekant får bara skapas för uppställningar som mäter riktning
//
// En uppställning med enbart dist_only-observationer bidrar aldrig till någon
// riktningsrad. Får den ändå en orienteringsobekant blir kolumnen identiskt noll
// och N singulär, trots att nätet är väl bestämt.
//
// HANDRÄKNAT FACIT: ren trilateration, 3 avstånd mot 3 kända punkter.
//   u = 2 (endast E,N för den nya punkten), n = 3, f = 1, Σr = f = 1.
// ═════════════════════════════════════════════════════════════════════════════
describe('F2 – orienteringsobekant endast vid riktningsobservationer', () => {
  const kanda = [
    { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
    { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
    { id: 'FP3', type: 'known', E: 50, N: 90, centerErr: 0 }
  ]
  const obs = (id, from, to, obsType) => ({
    id, from, to, obsType,
    sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1'
  })

  it('ren trilateration löser med u=2, f=1 – ingen orienteringsobekant', () => {
    const pts = [{ id: 'NY1', type: 'new', E: 50, N: 30, centerErr: 0 }, ...kanda]
    const meas = [1, 2, 3].map(i => obs('m' + i, 'NY1', 'FP' + i, 'dist_only'))
    const sr = kor(pts, meas, 0)
    expect(sr.error).toBeUndefined()
    expect(sr.meas_n).toBe(3)
    expect(sr.nCoordUnkn).toBe(2)
    expect(sr.nOrientUnkn).toBe(0)
    expect(sr.unkn_n).toBe(2)
    expect(sr.redundancy).toBe(1)
  })

  it('Σr = f = 1 och punktosäkerheten är ändlig', () => {
    const pts = [{ id: 'NY1', type: 'new', E: 50, N: 30, centerErr: 0 }, ...kanda]
    const meas = [1, 2, 3].map(i => obs('m' + i, 'NY1', 'FP' + i, 'dist_only'))
    const sr = kor(pts, meas, 0)
    expect(sr.redund.reduce((a, b) => a + b.ri, 0)).toBeCloseTo(1, 9)
    const p = sr.ptResults.find(x => x.id === 'NY1')
    expect(Number.isFinite(p.sigE)).toBe(true)
    expect(Number.isFinite(p.sigN)).toBe(true)
    expect(p.sigPos).toBeGreaterThan(0)
  })

  it('blandat nät: bara uppställningar med riktning får orienteringsobekant', () => {
    // FP1 och FP2 mäter både+riktning, FP3 mäter enbart avstånd.
    // Facit: n = 5 (2·both + 1·dist), u = 2 koordinater + 2 orienteringar = 4, f = 1.
    const pts = [{ id: 'NY1', type: 'new', E: 50, N: 60, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP3', type: 'known', E: 50, N: 140, centerErr: 0 }]
    const meas = [
      obs('m1', 'FP1', 'NY1', 'both'),
      obs('m2', 'FP2', 'NY1', 'both'),
      obs('m3', 'FP3', 'NY1', 'dist_only')
    ]
    const sr = kor(pts, meas, 0)
    expect(sr.error).toBeUndefined()
    expect(sr.meas_n).toBe(5)
    expect(sr.nOrientUnkn).toBe(2)   // FP1 och FP2, inte FP3
    expect(sr.unkn_n).toBe(4)
    expect(sr.redundancy).toBe(1)
    expect(sr.redund.reduce((a, b) => a + b.ri, 0)).toBeCloseTo(1, 9)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F4 – centreringen går in EN gång, inte √2 gånger
//
// HMK-Stommätning 2024 Bilaga C.1.1 (riktning) och C.1.2 (längd): centreringens
// standardosäkerhet C är gemensam för instrument och reflektor/signal och ingår
// med en enda C-term i osäkerhetsbudgeten.
//
// HMK:s egna räkneexempel:
//   Längd:    u(L) = √[(2 + 3·0,3)² + 3²] = √[2,9² + 3²] = 4,17 mm   (C = 3 mm)
//   Riktning: u(φ) = √[(0,6/√2)² + (2/0,3·ρ)²] = 0,600 mgon          (C = 2 mm)
//             där ρ = 0,063662 mgon per (mm/km), dvs. 1 mm på 1 km = 0,063662 mgon
//
// Not: HMK adderar mm- och ppm-leden linjärt (2 + 3·0,3 = 2,9) medan kärnan
// summerar dem kvadratiskt. Den frågan ligger UTANFÖR detta uppdrag, så testet
// matar in den redan kombinerade instrumenttermen 2,9 mm med ppm = 0 och
// isolerar därmed centreringsbidraget – det som F4 faktiskt gäller.
// ═════════════════════════════════════════════════════════════════════════════
describe('F4 – centreringsbidraget enligt HMK Bilaga C.1.1 / C.1.2', () => {
  // Uppställning i origo med tre kända mål på exakt 300 m (= 0,3 km), 120° isär.
  function nat300(centrering, sigHz_mgon, sigDist_mm, sigDist_ppm) {
    const pts = [{ id: 'S', type: 'station', E: 0, N: 0, centerErr: centrering }]
    for (let i = 0; i < 3; i++) {
      const a = (i * 120) * Math.PI / 180
      pts.push({ id: 'FP' + (i + 1), type: 'known', E: 300 * Math.sin(a), N: 300 * Math.cos(a), centerErr: centrering })
    }
    const meas = [1, 2, 3].map(i => ({
      id: 'm' + i, from: 'S', to: 'FP' + i, obsType: 'both',
      sigDist_mm, sigDist_ppm, sigHz_mgon, numSatser: 1, instrPreset: 'ts16_1'
    }))
    return kor(pts, meas, centrering)
  }

  it('längd: u(L) = √[2,9² + 3²] = 4,17 mm  (HMK C.1.2, C = 3 mm)', () => {
    const sr = nat300(3.0, 0.3, 2.9, 0)
    expect(sr.error).toBeUndefined()
    const rd = sr.redund.find(r => r.type === 'dist')
    const facit = Math.sqrt(2.9 ** 2 + 3.0 ** 2)      // = 4,1725 mm
    expect(rd.sig * 1000).toBeCloseTo(facit, 6)
    expect(rd.sig * 1000).toBeCloseTo(4.1725, 3)
  })

  it('riktning: u(φ) = √[(0,6/√2)² + (2/0,3·ρ)²] = 0,600 mgon  (HMK C.1.1, C = 2 mm)', () => {
    const sigHz = 0.6 / Math.SQRT2                    // = 0,424264 mgon
    const sr = nat300(2.0, sigHz, 1.0, 0)
    expect(sr.error).toBeUndefined()
    const rd = sr.redund.find(r => r.type === 'hz')
    // ρ = 0,063662 mgon per (mm/km); C = 2 mm på 0,3 km
    const centreringsbidrag = (2.0 / 0.3) * 0.063662  // = 0,424413 mgon
    const facit = Math.sqrt(sigHz ** 2 + centreringsbidrag ** 2)
    expect(rd.sigH_mgon_eff).toBeCloseTo(facit, 5)
    expect(rd.sigH_mgon_eff).toBeCloseTo(0.600, 3)
  })

  it('centreringen ensam ger exakt C (ingen √2-uppräkning)', () => {
    // Nollställd instrumentterm ⇒ σ_D ska vara precis centreringens C = 3 mm.
    const sr = nat300(3.0, 0.3, 0, 0)
    const rd = sr.redund.find(r => r.type === 'dist')
    expect(rd.sig * 1000).toBeCloseTo(3.0, 9)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F3 – anslutningsosäkerhet ska propageras som VARIANS, inte som information
//
// Anslutningspunkternas osäkerhet försämrar en simulerad uppställning. Korrekt
// felfortplantning inflaterar observationens varians:
//     σ²_eff = σ²_obs + aᵀ Q_k a
// Att i stället addera en separat normalmatris modellerar TILLFÖRD information,
// vilket ger två omöjliga gränsvärden:
//   • perfekt anslutning (Q_k → 0)  ⇒  σ_pos → 0        (ska ge observationsfallet)
//   • usel anslutning   (Q_k → ∞)  ⇒  σ_pos → obs-fallet (ska växa obegränsat)
//
// FACIT:
//   (a) σ_pos växer monotont med anslutningsosäkerheten
//   (b) σ_pos ≥ observationernas bästafall (golv) för varje anslutningskvalitet
//   (c) σ_pos → observationernas bästafall när anslutningen går mot perfekt
//   (d) σ_pos växer obegränsat när anslutningen försämras
// ═════════════════════════════════════════════════════════════════════════════
describe('F3 – felfortplantning från anslutningspunkter till simstation', () => {
  const pts = [
    { id: 'SS1', type: 'simstation', E: 50, N: 50, centerErr: 0 },
    { id: 'NY1', type: 'new', E: 0, N: 0, centerErr: 0 },
    { id: 'NY2', type: 'new', E: 100, N: 0, centerErr: 0 },
    { id: 'NY3', type: 'new', E: 50, N: 130, centerErr: 0 }
  ]
  const meas = [1, 2, 3].map(i => ({
    id: 's' + i, from: 'SS1', to: 'NY' + i, obsType: 'both',
    sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1'
  }))

  // Anslutningspunkternas kofaktormatris: isotrop med standardosäkerhet sig (m).
  function medAnslutning(sig_m) {
    const nu = 6
    const Q = Array.from({ length: nu }, (_, i) =>
      Array.from({ length: nu }, (_, j) => (i === j ? sig_m * sig_m : 0)))
    return runSimStations(Q, ['NY1', 'NY2', 'NY3'], [], { pts, meas, centerErr: 0 })[0]
  }

  // Observationernas bästafall, dvs. golvet. Efter F5 ligger computeEllipse och
  // stations.js i samma definition – båda är u(plan) = √(σN²+σE²) enligt
  // HMK F.23 – så golvet är den literala jämförelsen mot sigPos_obs.
  // Uttrycktes tidigare som sigPos_obs/√2 eftersom de två låg i olika
  // definitioner; den tillfälliga lösningen behövs inte längre.
  // "Perfekt" anslutning: 1e-9 m ger ett variansbidrag på 1e-18 m², vilket är
  // försumbart mot observationernas σ² ≈ 5,8e-8 m².
  const PERFEKT = 1e-9
  const golv = () => medAnslutning(PERFEKT).sigPos_obs

  it('σ_pos växer monotont när anslutningen försämras', () => {
    const nivaer = [0.0005, 0.001, 0.002, 0.005, 0.020]
    const varden = nivaer.map(s => medAnslutning(s).sigPos)
    for (let i = 1; i < varden.length; i++) {
      expect(varden[i], `σ_conn ${nivaer[i] * 1000} mm mot ${nivaer[i - 1] * 1000} mm`)
        .toBeGreaterThan(varden[i - 1])
    }
  })

  it('σ_pos underskrider aldrig observationernas bästafall (σ_pos ≥ σ_pos_obs)', () => {
    const g = golv()
    for (const s of [0.0005, 0.001, 0.002, 0.005, 0.020, 0.100]) {
      const r = medAnslutning(s)
      expect(r.sigPos, `σ_conn = ${s * 1000} mm`).toBeGreaterThanOrEqual(g)
      // Golvet gäller mot uppställningens egen sigPos_obs, inte bara mot det
      // gemensamma referensvärdet – samma definition efter F5.
      expect(r.sigPos, `σ_conn = ${s * 1000} mm`).toBeGreaterThanOrEqual(r.sigPos_obs)
    }
  })

  it('σ_pos → observationernas bästafall när anslutningen blir perfekt', () => {
    expect(medAnslutning(PERFEKT).sigPos).toBeCloseTo(golv(), 9)
  })

  it('σ_pos växer obegränsat när anslutningen blir godtyckligt dålig', () => {
    // 100 mm osäkra anslutningspunkter måste ge en klart obestämd uppställning,
    // inte ett mättat värde strax under observationernas bästafall.
    expect(medAnslutning(0.100).sigPos).toBeGreaterThan(100 * golv())
    // När anslutningen dominerar helt växer σ_pos linjärt med den. Kvoten
    // σ_pos/σ_anslutning går mot en konstant (≈0,5785 för denna geometri), så
    // en tiofaldigad anslutningsosäkerhet ger nära tio gånger större σ_pos –
    // asymptotiskt underifrån, därav 9 och inte 10.
    expect(medAnslutning(1.000).sigPos).toBeGreaterThan(9 * medAnslutning(0.100).sigPos)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F5 – standardosäkerhet i plan enligt HMK-Stommätning 2024 Formel F.23
//
//   u(plan) = √[u²(N) + u²(E)]        ← Helmerts punktmedelfel
//
// HMK-Ordlistan (april 2022) bekräftar: standardosäkerhet i plan = punktmedelfel.
// Ingen delning med 2 förekommer. computeEllipse räknade √((Qee+Qnn)/2), vilket
// är kvadratiska medelvärdet av komponenterna – √2 för litet.
//
// σ_E och σ_N är definitionsoberoende och redan validerade mot en oberoende
// referensimplementation. Facit för σ_pos härleds därför ur F.23 och de
// validerade komponenterna, INTE ur referensimplementationen – den kodade
// samma mean-form och kan därför inte fånga felet.
// ═════════════════════════════════════════════════════════════════════════════
describe('F5 – u(plan) = √(σN² + σE²) enligt HMK Formel F.23', () => {
  // Referensnätet ur tests/calc.test.js, efter F1 och F4.
  const refPts = [
    { id: 'P1', type: 'station', E: 0, N: 0, centerErr: 2 },
    { id: 'A', type: 'known', E: 100, N: 0, centerErr: 2 },
    { id: 'B', type: 'known', E: 50, N: 100, centerErr: 2 },
    { id: 'C', type: 'known', E: -50, N: 80, centerErr: 2 }
  ]
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
  const refMeas = ['A', 'B', 'C'].map((t, i) =>
    ({ id: 'm' + (i + 1), from: 'P1', to: t, obsType: 'both', ...I }))

  // Komponentvärdena flyttades av F17 (längd-σ enligt HMK C.1.2):
  // 1,621/1,361 → 1,648/1,379. Själva F.23-egenskapen är oförändrad.
  it('referensnätet: σ_pos = √(1,648² + 1,379²) = 2,148 mm', () => {
    const sr = kor(refPts, refMeas, 2)
    const p = sr.ptResults.find(x => x.id === 'P1')
    // Validerade komponenter (definitionsoberoende):
    expect(p.sigE * 1000).toBeCloseTo(1.648, 3)
    expect(p.sigN * 1000).toBeCloseTo(1.379, 3)
    // Facit ur F.23:
    expect(p.sigPos * 1000).toBeCloseTo(2.148, 3)
  })

  it('u(plan) = √(σN² + σE²) för varje punkt i flera nät', () => {
    const fackverk = {
      pts: [
        { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 1 },
        { id: 'FP2', type: 'known', E: 200, N: 0, centerErr: 1 },
        { id: 'NY1', type: 'new', E: 60, N: 120, centerErr: 1 },
        { id: 'NY2', type: 'new', E: 150, N: 130, centerErr: 1 }
      ],
      meas: [['FP1', 'NY1'], ['NY1', 'FP1'], ['FP2', 'NY2'], ['NY2', 'FP2'],
        ['NY1', 'NY2'], ['NY2', 'NY1'], ['FP1', 'FP2'], ['FP1', 'NY2']]
        .map(([f, t], i) => ({ id: 'm' + i, from: f, to: t, obsType: 'both', ...I })),
      ce: 1
    }
    for (const { pts, meas, ce } of [{ pts: refPts, meas: refMeas, ce: 2 }, fackverk]) {
      const sr = kor(pts, meas, ce)
      expect(sr.error).toBeUndefined()
      sr.ptResults.forEach(p => {
        expect(p.sigPos, 'punkt ' + p.id).toBeCloseTo(Math.sqrt(p.sigN ** 2 + p.sigE ** 2), 12)
      })
    }
  })

  it('ellipsens halvaxlar följer inte σ_pos-definitionen – a=1,759 mm, b=1,233 mm', () => {
    // F5 rör enbart σ_pos. Halvaxlarna kommer ur egenvärdesuppdelningen och
    // låg still genom F5 (1,729/1,222 både före och efter). F17 flyttade dem
    // däremot, eftersom längd-σ ändrades och därmed hela Q_xx.
    const sr = kor(refPts, refMeas, 2)
    const p = sr.ptResults.find(x => x.id === 'P1')
    expect(p.aSemi * 1000).toBeCloseTo(1.759, 3)
    expect(p.bSemi * 1000).toBeCloseTo(1.233, 3)
  })

  it('invarianten a² + b² = σN² + σE² = σ_pos² håller', () => {
    // Spåret av 2×2-blocket är invariant under rotation, så summan av
    // halvaxlarnas kvadrater är samma som komponenternas – och därmed lika med
    // u(plan)² enligt F.23.
    const sr = kor(refPts, refMeas, 2)
    const p = sr.ptResults.find(x => x.id === 'P1')
    expect(p.aSemi ** 2 + p.bSemi ** 2).toBeCloseTo(p.sigE ** 2 + p.sigN ** 2, 15)
    expect(p.sigPos ** 2).toBeCloseTo(p.aSemi ** 2 + p.bSemi ** 2, 15)
  })

  it('simulerade uppställningar använder samma definition', () => {
    // stations.js går genom computeEllipse och ska följa med till F.23.
    const pts = [
      { id: 'SS1', type: 'simstation', E: 50, N: 50, centerErr: 0 },
      { id: 'NY1', type: 'new', E: 0, N: 0, centerErr: 0 },
      { id: 'NY2', type: 'new', E: 100, N: 0, centerErr: 0 },
      { id: 'NY3', type: 'new', E: 50, N: 130, centerErr: 0 }
    ]
    const meas = [1, 2, 3].map(i =>
      ({ id: 's' + i, from: 'SS1', to: 'NY' + i, obsType: 'both', ...I }))
    const Q = Array.from({ length: 6 }, (_, i) =>
      Array.from({ length: 6 }, (_, j) => (i === j ? 1e-6 : 0)))
    const ss = runSimStations(Q, ['NY1', 'NY2', 'NY3'], [], { pts, meas, centerErr: 0 })[0]
    expect(ss.sigPos).toBeCloseTo(Math.sqrt(ss.sigN ** 2 + ss.sigE ** 2), 12)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Rapportkonsistens – stnIds i beräkningsrapporten mot kärnans
//
// F2 gav enbart uppställningar med minst en riktningsobservation en
// orienteringsobekant. sim-report.js byggde fortsatt sin egen stnIds ur det
// ofiltrerade uttrycket och kan därför lista en orienteringsobekant som kärnan
// inte har – med felaktig Q_xx-indexering som följd.
// ═════════════════════════════════════════════════════════════════════════════
describe('Rapportkonsistens – orienteringsobekanta i beräkningsrapporten', () => {
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }

  // Nät där FP3 enbart mäter avstånd ⇒ ingen orienteringsobekant för FP3.
  const pts = [
    { id: 'NY1', type: 'new', E: 50, N: 60, centerErr: 0 },
    { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
    { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
    { id: 'FP3', type: 'known', E: 50, N: 140, centerErr: 0 }
  ]
  const meas = [
    { id: 'm1', from: 'FP1', to: 'NY1', obsType: 'both', ...I },
    { id: 'm2', from: 'FP2', to: 'NY1', obsType: 'both', ...I },
    { id: 'm3', from: 'FP3', to: 'NY1', obsType: 'dist_only', ...I }
  ]

  // jsdom:s Blob saknar .text(), så FileReader används för att läsa innehållet.
  const lasBlob = blob => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsText(blob)
  })

  // Fångar texten som exportCalcReport() skickar till nedladdning.
  async function rapporttext() {
    let blob = null
    const origCreate = URL.createObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = b => { blob = b; return 'blob:facit' }
    HTMLAnchorElement.prototype.click = () => {}
    try {
      exportCalcReport()
    } finally {
      URL.createObjectURL = origCreate
      HTMLAnchorElement.prototype.click = origClick
    }
    return blob ? await lasBlob(blob) : ''
  }

  it('rapporten listar exakt kärnans orienteringsobekanta', async () => {
    const sr = kor(pts, meas, 0)
    expect(sr.error).toBeUndefined()
    expect(sr.nOrientUnkn).toBe(2)          // FP1 och FP2, inte FP3

    const txt = await rapporttext()
    const zRader = [...txt.matchAll(/z_(\S+)\s+\S+\s+\(orienteringskonstant\)/g)].map(m => m[1])
    expect(zRader).toEqual(['FP1', 'FP2'])
    expect(zRader).toHaveLength(sr.nOrientUnkn)
    expect(zRader).not.toContain('FP3')
  })

  it('rapportens obekantindex sammanfaller med kärnans Q_xx-index', async () => {
    const sr = kor(pts, meas, 0)
    const txt = await rapporttext()
    // Koordinatobekanta upptar index 0..nCoordUnkn-1, sedan följer z-raderna.
    // Divergerar listorna hamnar z-indexen fel.
    const zIndex = [...txt.matchAll(/^\s*(\d+)\s+z_/gm)].map(m => Number(m[1]))
    expect(zIndex).toEqual([sr.nCoordUnkn, sr.nCoordUnkn + 1])
    expect(Math.max(...zIndex)).toBe(sr.unkn_n - 1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F17 – längdosäkerhetens summering enligt HMK-Stommätning 2024 Bilaga C.1.2
//
//   u(L) = √[(A + B·L)² + C²]
//
// Konstantledet A och det avståndsberoende ledet B·L adderas LINJÄRT; först
// centreringen C kombineras kvadratiskt. TDOK 2014:0571 §4.6.1.2 bekräftar det
// linjära med ordet "adderas".
//
// HMK:s räkneexempel: A = 2 mm, B = 3 ppm, L = 300 m, C = 3 mm
//   korrekt (hybrid):    √[(2 + 0,9)² + 3²] = √[8,41 + 9]      = 4,1725 mm
//   helt kvadratiskt:    √[2² + 0,9² + 3²]  = √[4 + 0,81 + 9]  = 3,7162 mm
// Skillnaden är diskriminanten för detta test.
//
// Facit är härlett ur C.1.2, INTE ur referensimplementationen – den summerade
// också helt kvadratiskt och kunde därför inte fånga felet.
// ═════════════════════════════════════════════════════════════════════════════
describe('F17 – u(L) = √[(A + B·L)² + C²] enligt HMK Bilaga C.1.2', () => {
  // Uppställning i origo med tre kända mål på exakt 300 m, 120° isär.
  function nat300(centrering, A_mm, B_ppm) {
    const pts = [{ id: 'S', type: 'station', E: 0, N: 0, centerErr: centrering }]
    for (let i = 0; i < 3; i++) {
      const a = (i * 120) * Math.PI / 180
      pts.push({ id: 'FP' + (i + 1), type: 'known', E: 300 * Math.sin(a), N: 300 * Math.cos(a), centerErr: centrering })
    }
    const meas = [1, 2, 3].map(i => ({
      id: 'm' + i, from: 'S', to: 'FP' + i, obsType: 'both',
      sigDist_mm: A_mm, sigDist_ppm: B_ppm, sigHz_mgon: 0.3, numSatser: 1, instrPreset: 'ts16_1'
    }))
    return kor(pts, meas, centrering)
  }

  it('HMK:s räkneexempel: A=2 mm, B=3 ppm, L=300 m, C=3 mm → 4,17 mm', () => {
    const sr = nat300(3.0, 2.0, 3.0)
    expect(sr.error).toBeUndefined()
    const rd = sr.redund.find(r => r.type === 'dist')
    expect(rd.sig * 1000).toBeCloseTo(Math.sqrt((2.0 + 0.9) ** 2 + 3.0 ** 2), 9)
    expect(rd.sig * 1000).toBeCloseTo(4.1725, 3)
    // Diskriminant: helt kvadratisk summering ger 3,7162 mm.
    expect(rd.sig * 1000).not.toBeCloseTo(3.7162, 2)
  })

  it('A och B·L adderas linjärt – u_D före centrering = A + B·L exakt', () => {
    // Utan centrering (C = 0) ska σ_D vara exakt A + B·L.
    const sr = nat300(0, 2.0, 3.0)
    const rd = sr.redund.find(r => r.type === 'dist')
    expect(rd.sig * 1000).toBeCloseTo(2.0 + 3.0 * 300 * 1e-3, 12)   // = 2,9 mm exakt
    expect(rd.sig * 1000).toBeCloseTo(2.9, 12)
  })

  it('linjäriteten gäller över flera avstånd', () => {
    // A + B·L är linjär i L; kvadratisk summering är det inte.
    for (const [L, A, B] of [[100, 1, 1.5], [500, 1, 1.5], [1000, 2, 2]]) {
      const pts = [
        { id: 'S', type: 'station', E: 0, N: 0, centerErr: 0 },
        { id: 'FP1', type: 'known', E: 0, N: L, centerErr: 0 },
        { id: 'FP2', type: 'known', E: L * 0.866, N: -L * 0.5, centerErr: 0 },
        { id: 'FP3', type: 'known', E: -L * 0.866, N: -L * 0.5, centerErr: 0 }
      ]
      const meas = [1, 2, 3].map(i => ({
        id: 'm' + i, from: 'S', to: 'FP' + i, obsType: 'both',
        sigDist_mm: A, sigDist_ppm: B, sigHz_mgon: 0.3, numSatser: 1, instrPreset: 'ts16_1'
      }))
      const sr = kor(pts, meas, 0)
      const rd = sr.redund.find(r => r.type === 'dist')
      expect(rd.sig * 1000, `L=${L} m, A=${A} mm, B=${B} ppm`).toBeCloseTo(A + B * L * 1e-3, 9)
    }
  })

  it('centreringen kombineras fortfarande kvadratiskt (F4 orörd)', () => {
    // A = B = 0 ⇒ σ_D ska vara exakt C.
    const sr = nat300(3.0, 0, 0)
    const rd = sr.redund.find(r => r.type === 'dist')
    expect(rd.sig * 1000).toBeCloseTo(3.0, 9)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F8 – YT för riktningar redovisas i mgon
//
// HMK-Stommätning 2024 F.4.1: tillförlitlighetsmåtten ges i samma enhet som
// mätningarna. Riktningarnas u(l) är i mgon, alltså är även MUF och YT i mgon.
// Etiketten "gon" är 1000× fel. Endast märkning – talvärdet är oförändrat.
// ═════════════════════════════════════════════════════════════════════════════
describe('F8 – enhetsmärkning av YT för riktningsobservationer', () => {
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
  const pts = [
    { id: 'P1', type: 'station', E: 0, N: 0, centerErr: 2 },
    { id: 'A', type: 'known', E: 100, N: 0, centerErr: 2 },
    { id: 'B', type: 'known', E: 50, N: 100, centerErr: 2 },
    { id: 'C', type: 'known', E: -50, N: 80, centerErr: 2 }
  ]
  const meas = ['A', 'B', 'C'].map((t, i) => ({ id: 'm' + (i + 1), from: 'P1', to: t, obsType: 'both', ...I }))

  const lasBlob = blob => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsText(blob)
  })

  async function simrapport() {
    const { exportSimReport } = await import('../src/reports/sim-report.js')
    let blob = null
    const origCreate = URL.createObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = b => { blob = b; return 'blob:facit' }
    HTMLAnchorElement.prototype.click = () => {}
    try { exportSimReport() } finally {
      URL.createObjectURL = origCreate
      HTMLAnchorElement.prototype.click = origClick
    }
    return blob ? await lasBlob(blob) : ''
  }

  it('simuleringsrapportens YT-kolumn märks mgon för riktningar', async () => {
    kor(pts, meas, 2)
    const txt = await simrapport()
    // Riktningsrader har MUF märkt mgon; YT måste bära samma enhet.
    const riktRader = txt.split('\n').filter(l => l.includes('Riktning'))
    expect(riktRader.length).toBeGreaterThan(0)
    riktRader.forEach(rad => {
      expect(rad, rad).toMatch(/\d+mgon\s+[\d.]+mgon/)  // MUF mgon, YT mgon
      // Ingen siffra får följas direkt av "gon" – då saknas m:et.
      expect(rad, rad).not.toMatch(/\d\s*gon/)
    })
  })

  it('YT-talvärdet är oförändrat: YT = MUF × (1 − r)', () => {
    const sr = kor(pts, meas, 2)
    sr.redund.filter(r => r.type === 'hz').forEach(rd => {
      // mdb.val är i mgon för riktningar; YT ärver enheten.
      expect(rd.mdb.val * (1 - rd.ri)).toBeGreaterThan(0)
      // yt_m är samma storhet i bågmeter – kvoten är siktlängden × radiankonstant.
      expect(rd.yt_m).toBeCloseTo((1 - rd.ri) * rd.mdb.val * rd.d / (200000 / Math.PI), 12)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F9 – rapporten ska märka σ_pos, MUF och YT som standardosäkerheter (1σ)
//
// HMK-Stommätning 2024 Bilaga B.3.3 redovisar dessa storheter som
// standardosäkerheter. simulation.js sätter k_ell = 1.0, så de utskrivna
// värdena ÄR 1σ – rubriken "(95%, k=2.45)" lovade utvidgad osäkerhet.
// Värdena blåses inte upp; endast märkningen rättas.
// ═════════════════════════════════════════════════════════════════════════════
describe('F9 – konfidensmärkning i simuleringsrapporten', () => {
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
  const pts = [
    { id: 'P1', type: 'station', E: 0, N: 0, centerErr: 2 },
    { id: 'A', type: 'known', E: 100, N: 0, centerErr: 2 },
    { id: 'B', type: 'known', E: 50, N: 100, centerErr: 2 },
    { id: 'C', type: 'known', E: -50, N: 80, centerErr: 2 }
  ]
  const meas = ['A', 'B', 'C'].map((t, i) => ({ id: 'm' + (i + 1), from: 'P1', to: t, obsType: 'both', ...I }))

  const lasBlob = blob => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsText(blob)
  })

  async function simrapport() {
    const { exportSimReport } = await import('../src/reports/sim-report.js')
    let blob = null
    const origCreate = URL.createObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = b => { blob = b; return 'blob:facit' }
    HTMLAnchorElement.prototype.click = () => {}
    try { exportSimReport() } finally {
      URL.createObjectURL = origCreate
      HTMLAnchorElement.prototype.click = origClick
    }
    return blob ? await lasBlob(blob) : ''
  }

  it('rubriken utlovar inte 95 % när värdena är 1σ', async () => {
    kor(pts, meas, 2)
    const txt = await simrapport()
    expect(txt).not.toMatch(/95\s*%/)
    expect(txt).not.toMatch(/k\s*=\s*2[.,]45/)
    expect(txt).toMatch(/PUNKTOSÄKERHETER.*(1σ|standardosäkerhet)/i)
  })

  it('utskrivna σ_pos är exakt kärnans 1σ-värde, inte uppblåst', async () => {
    const sr = kor(pts, meas, 2)
    const txt = await simrapport()
    const p = sr.ptResults.find(x => x.id === 'P1')
    // 2,117 mm efter F5 – ska stå oförändrat i rapporten.
    expect(txt).toContain((p.sigPos * 1000).toFixed(2))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F18 – LÅSTEST: δ₀ = 2,80 är HMK-konventionen och ska INTE ändras
//
// HMK-Stommätning 2024 Formel F.16 sätter α = 5 %, β = 80 %:
//   δ₀ = λ(α/2) + λ(β) = 1,96 + 0,84 = 2,80
// Tabell 55 visar hela fältet av risknivåer. Baardas klassiska 4,13 svarar mot
// α = 0,1 % – en annan risknivå som HMK medvetet valt bort. Att byta till 4,13
// skulle göra NätSim icke-HMK-kompatibelt.
//
// Detta test fångar ingen bugg. Det är en regressionsspärr som ska passera
// direkt och hindra att konstanten "rättas" av misstag i framtiden.
// ═════════════════════════════════════════════════════════════════════════════
describe('F18 – δ₀ = 2,80 låst enligt HMK Formel F.16', () => {
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
  const pts = [
    { id: 'P1', type: 'station', E: 0, N: 0, centerErr: 2 },
    { id: 'A', type: 'known', E: 100, N: 0, centerErr: 2 },
    { id: 'B', type: 'known', E: 50, N: 100, centerErr: 2 },
    { id: 'C', type: 'known', E: -50, N: 80, centerErr: 2 }
  ]
  const meas = ['A', 'B', 'C'].map((t, i) => ({ id: 'm' + (i + 1), from: 'P1', to: t, obsType: 'both', ...I }))

  it('κ = 2,80 = λ(2,5 %) + λ(20 %) = 1,96 + 0,84', () => {
    const sr = kor(pts, meas, 2)
    expect(sr.kappa).toBe(2.80)
    expect(sr.kappa).toBeCloseTo(1.96 + 0.84, 10)
  })

  it('MUF = κ · σ / √r med κ = 2,80', () => {
    const sr = kor(pts, meas, 2)
    sr.redund.filter(r => r.type === 'dist').forEach(rd => {
      expect(rd.mdb.val).toBeCloseTo(2.80 * rd.sig / Math.sqrt(rd.ri), 12)
    })
  })

  it('κ är INTE Baardas 4,13 (annan risknivå, α = 0,1 %)', () => {
    const sr = kor(pts, meas, 2)
    expect(sr.kappa).not.toBe(4.13)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// F7 – klassificeringen av kontrollerbarhetstalet k = f/n
//
// k ligger per definition i [0, 1]: k = (n − u)/n med u ≥ 1. Den gamla översta
// gränsen "k > 1,14" var därför en död gren – nät kunde aldrig nå högsta klass.
// 1,14 är i själva verket maxvärdet för VIKTSENHETENS standardosäkerhet u₀ vid
// f = 70 i HMK Tabell 53. Det är en annan storhet, prövad i ett efterberäknings-
// test på residualer (HMK F.3.1), och den existerar inte i ett simuleringsverktyg
// utan observationer – u₀ ≡ 1 per konstruktion i en residualfri simulering.
//
// Normens golv för k:
//   SIS-TS 21143:2016 §6.2.2      – k > 0,5 för nätet (k > 0,35 för enskild mätning)
//   HMK-Stommätning 2024 §3.2.2 b) – k ≥ 0,5 för triangel-/fackverksnät
//
// Testerna låser normgolvet och klassificeringens totalitet. Bandgränsen för
// högsta klassen är ett PRODUKTVAL och låses medvetet INTE här – se
// K_OVERBESTAMD_PRELIMINAR i src/core/constants.js.
// ═════════════════════════════════════════════════════════════════════════════
describe('F7 – klassificering av k-talet', () => {
  const I = { sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }

  it('normgolvet är k ≥ 0,50 (SIS-TS §6.2.2, HMK §3.2.2 b)', () => {
    expect(K_NAT_GOLV).toBe(0.50)
  })

  it('klassificeringen är total över hela k ∈ [0, 1]', () => {
    for (let k = 0; k <= 1.0000001; k += 0.005) {
      const r = klassificeraKtal(k)
      expect(r, `k=${k.toFixed(3)}`).toBeDefined()
      expect(typeof r.klass, `k=${k.toFixed(3)}`).toBe('string')
      expect(r.klass.length, `k=${k.toFixed(3)}`).toBeGreaterThan(0)
      expect(typeof r.cssKlass).toBe('string')
      expect(typeof r.farg).toBe('string')
    }
  })

  it('högsta klassen är nåbar för något k ≤ 1', () => {
    // Kärnan i den gamla buggen: "k > 1,14" kunde aldrig uppfyllas.
    const klasser = new Set()
    for (let k = 0; k <= 1.0000001; k += 0.001) klasser.add(klassificeraKtal(k).klass)
    const hogsta = klassificeraKtal(1.0).klass
    expect(klasser.size).toBeGreaterThan(1)
    // Högsta klassen vid k = 1 får inte vara samma som den vid normgolvet,
    // annars finns ingen översta klass alls.
    expect(hogsta).not.toBe(klassificeraKtal(K_NAT_GOLV).klass)
  })

  it('k ≥ 0,50 uppfyller normen, k < 0,50 gör det inte', () => {
    for (const k of [0.50, 0.55, 0.70, 0.85, 1.00]) {
      expect(klassificeraKtal(k).uppfyllerNorm, `k=${k}`).toBe(true)
    }
    for (const k of [0, 0.05, 0.15, 0.30, 0.45, 0.4999]) {
      expect(klassificeraKtal(k).uppfyllerNorm, `k=${k}`).toBe(false)
    }
  })

  it('klassificeringen är monoton – bättre k ger aldrig sämre klass', () => {
    const rang = ['Otillräckligt', 'Svagt', 'Acceptabelt', 'Starkt', 'Överbestämt']
    let forra = -1
    for (let k = 0; k <= 1.0000001; k += 0.005) {
      const i = rang.indexOf(klassificeraKtal(k).klass)
      expect(i, `okänd klass vid k=${k.toFixed(3)}`).toBeGreaterThanOrEqual(0)
      expect(i, `klassen sjönk vid k=${k.toFixed(3)}`).toBeGreaterThanOrEqual(forra)
      forra = i
    }
  })

  it('kärnans K_class kommer ur samma klassificering', () => {
    // Nät med k = 0,25: n = 8, u = 6, f = 2.
    const pts = [
      { id: 'NY1', type: 'new', E: 50, N: 50, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP3', type: 'known', E: 50, N: 120, centerErr: 0 },
      { id: 'FP4', type: 'known', E: -40, N: 90, centerErr: 0 }
    ]
    const meas = ['FP1', 'FP2', 'FP3', 'FP4'].map((f, i) =>
      ({ id: 'a' + i, from: f, to: 'NY1', obsType: 'both', ...I }))
    const sr = kor(pts, meas, 0)
    expect(sr.K_global).toBeCloseTo(0.25, 10)
    const facit = klassificeraKtal(sr.K_global)
    expect(sr.K_class).toBe(facit.klass)
    expect(sr.K_col).toBe(facit.farg)
  })

  it('k kan aldrig överstiga 1 i ett verkligt nät', () => {
    // k = (n − u)/n < 1 eftersom u ≥ 1. Detta är grunden till att 1,14 var död.
    const pts = [
      { id: 'S', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: -50, N: 86.6, centerErr: 0 },
      { id: 'FP3', type: 'known', E: -50, N: -86.6, centerErr: 0 }
    ]
    const meas = [1, 2, 3].map(i =>
      ({ id: 'm' + i, from: 'S', to: 'FP' + i, obsType: 'hz_only', ...I }))
    const sr = kor(pts, meas, 0)
    // n = 3, u = 1 (enbart orienteringskonstant) ⇒ k = 2/3, det högsta som
    // rimligen går att konstruera. Fortfarande < 1.
    expect(sr.K_global).toBeCloseTo(2 / 3, 10)
    expect(sr.K_global).toBeLessThan(1)
  })
})
