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

  // Observationernas bästafall. stations.js rapporterar sigPos_obs som Helmerts
  // form √(Qee+Qnn) medan computeEllipse ger √((Qee+Qnn)/2) – den skillnaden är
  // F5 och ligger utanför detta uppdrag. Golvet uttrycks därför i samma definition
  // som sigPos, dvs. sigPos_obs/√2.
  // "Perfekt" anslutning. 1e-9 m ger ett variansbidrag på 1e-18 m², vilket är
  // försumbart mot observationernas σ² ≈ 5,8e-8 m².
  const PERFEKT = 1e-9
  const golv = () => medAnslutning(PERFEKT).sigPos_obs / Math.SQRT2

  it('σ_pos växer monotont när anslutningen försämras', () => {
    const nivaer = [0.0005, 0.001, 0.002, 0.005, 0.020]
    const varden = nivaer.map(s => medAnslutning(s).sigPos)
    for (let i = 1; i < varden.length; i++) {
      expect(varden[i], `σ_conn ${nivaer[i] * 1000} mm mot ${nivaer[i - 1] * 1000} mm`)
        .toBeGreaterThan(varden[i - 1])
    }
  })

  it('σ_pos underskrider aldrig observationernas bästafall', () => {
    const g = golv()
    for (const s of [0.0005, 0.001, 0.002, 0.005, 0.020, 0.100]) {
      expect(medAnslutning(s).sigPos, `σ_conn = ${s * 1000} mm`).toBeGreaterThanOrEqual(g)
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
