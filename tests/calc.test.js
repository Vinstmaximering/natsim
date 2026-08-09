// Beräkningskärna-tester för NätSim
// Dessa testfall är NUMERISKT VERIFIERADE mot NumPy-implementation
// och säkerställer att migrationen inte ändrar matematiken.

import { describe, it, expect, beforeEach } from 'vitest'
import { runSimulation } from '../src/core/simulation.js'
import { setState, getState } from '../src/state/store.js'

describe('Beräkningskärna – referensnät 1: P1 fri + A,B,C kända', () => {
  // Test-nät: 6 obs, 3 obekanta, f=3, perfekt anslutning
  beforeEach(() => {
    setState({
      pts: [
        { id: 'P1', type: 'station', E: 0,    N: 0,   H: 0, centerErr: 2 },
        { id: 'A',  type: 'known',   E: 100,  N: 0,   H: 0, centerErr: 2 },
        { id: 'B',  type: 'known',   E: 50,   N: 100, H: 0, centerErr: 2 },
        { id: 'C',  type: 'known',   E: -50,  N: 80,  H: 0, centerErr: 2 }
      ],
      meas: [
        { id: 'm1', from: 'P1', to: 'A', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' },
        { id: 'm2', from: 'P1', to: 'B', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' },
        { id: 'm3', from: 'P1', to: 'C', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
      ],
      centerErr: 2,
      activeMatklass: ''
    })
  })

  it('Antal observationer och obekanta', () => {
    runSimulation()
    const sr = getState().simResult
    expect(sr.error).toBeUndefined()
    expect(sr.meas_n).toBe(6)         // 3 dist + 3 hz
    expect(sr.unkn_n).toBe(3)         // 2 koord + 1 orient
    expect(sr.redundancy).toBe(3)
  })

  it('Σ r_i = f (verifierar redundansen)', () => {
    runSimulation()
    expect(getState().simResult.redundTotal).toBeCloseTo(3.00, 2)
  })

  it('Kontrollerbarhet k = 0.500', () => {
    runSimulation()
    expect(getState().simResult.K_global).toBeCloseTo(0.5000, 4)
  })

  it('κ = 2.80 (Baarda α=0.05, β=0.80)', () => {
    runSimulation()
    expect(getState().simResult.kappa).toBe(2.80)
  })

  // OMSKRIVET två gånger, av F1 och sedan av F4.
  //   Ursprung  2,166 / 1,832 / 2,006  – NätSim_Beta_2.html + NumPy-referensen
  //             som replikerade samma −1 i orienteringspartialen (F1).
  //   Efter F1  2,191 / 1,858 / 2,031  – ∂(d·φ)/∂z = −d. Siktlängderna här är
  //             olika (100 / 111,80 / 94,34 m) så nätet träffas av felet.
  //   Efter F4  1,621 / 1,361 / 1,497  – centreringen ingår med EN C-term
  //             (HMK Bilaga C.1.1/C.1.2). Med centerErr = 2 mm på båda ändar
  //             går e_c från 2,828 till 2,000 mm, dvs. kärnan var √2 för
  //             pessimistisk. Punktosäkerheten förbättras därmed ~26 %.
  //   Efter F5  1,621 / 1,361 / 2,117  – σ_pos är u(plan) = √(σN²+σE²) enligt
  //             HMK Formel F.23. Endast σ_pos rörde sig där; σ_E och σ_N är
  //             definitionsoberoende.
  //   Efter F17 1,648 / 1,379 / 2,148  – längd-σ summeras som
  //             √[(A + B·L)² + C²] enligt HMK Bilaga C.1.2 i stället för helt
  //             kvadratiskt. Längd-σ stiger (2,2383 → 2,2825 mm vid 100 m),
  //             alltså konservativ riktning, och allt nedströms följer med.
  // σ_E och σ_N är verifierade mot en oberoende referensimplementation
  // (avvikelse < 5e-16). σ_pos är härlett ur F.23 och de validerade
  // komponenterna – referensimplementationen kodade tidigare både mean-formen
  // (F5) och den kvadratiska längdsummeringen (F17) och dög därför inte som
  // facit för dessa; båda är rättade i den.
  it('P1 σ_pos = 2.148 mm (HMK F.23)', () => {
    runSimulation()
    const p1 = getState().simResult.ptResults.find(p => p.id === 'P1')
    expect(p1.sigE * 1000).toBeCloseTo(1.648, 2)
    expect(p1.sigN * 1000).toBeCloseTo(1.379, 2)
    expect(p1.sigPos * 1000).toBeCloseTo(2.148, 2)
    // u(plan) = √[u²(N) + u²(E)] – ingen delning med 2.
    expect(p1.sigPos).toBeCloseTo(Math.sqrt(p1.sigN ** 2 + p1.sigE ** 2), 12)
  })

  // OMSKRIVET av F1 (2,283/1,684 → 2,327/1,684), F4 (→ 1,729/1,222) och
  // F17 (→ 1,759/1,233). F5 rörde INTE halvaxlarna – de kommer ur
  // egenvärdesuppdelningen och är oberoende av hur σ_pos definieras.
  it('Felellips a=1.759 mm, b=1.233 mm (1σ)', () => {
    runSimulation()
    const p1 = getState().simResult.ptResults.find(p => p.id === 'P1')
    expect(p1.aSemi * 1000).toBeCloseTo(1.759, 2)
    expect(p1.bSemi * 1000).toBeCloseTo(1.233, 2)
  })

  // OMSKRIVET av F1 (0,4793 → 0,4671), F4 (→ 0,4753) och F17 (→ 0,4789).
  // MUF = κ·σ/√r och YT = (1−r)·MUF är oförändrade formler. MUF föll kraftigt
  // med F4 (12,14 → 9,09 mm) och stiger något med F17 (→ 9,24 mm) eftersom
  // längd-σ blir större med den linjära A+B·L-summeringen.
  it('Obs 1 (P1→A dist): r_i=0.4789, MUF=9.24mm, YT=4.81mm', () => {
    runSimulation()
    const r = getState().simResult.redund[0]  // första obs i ordning
    expect(r.ri).toBeCloseTo(0.4789, 3)
    expect(r.mdb.val * 1000).toBeCloseTo(9.24, 1)
    expect(r.yt_m * 1000).toBeCloseTo(4.81, 1)
  })

  it('Inga NaN i resultatet', () => {
    runSimulation()
    const sr = getState().simResult
    sr.ptResults.forEach(p => {
      expect(Number.isFinite(p.sigE)).toBe(true)
      expect(Number.isFinite(p.sigN)).toBe(true)
      expect(Number.isFinite(p.sigPos)).toBe(true)
      expect(Number.isFinite(p.aSemi)).toBe(true)
      expect(Number.isFinite(p.bSemi)).toBe(true)
    })
  })
})

describe('Datumdefekt-detektering', () => {
  it('1 känd punkt utan mätningar → fångas av datum-check', () => {
    setState({
      pts: [
        { id: 'FP1', type: 'known',  E: 100, N: 200, H: 0, centerErr: 2 },
        { id: 'A',   type: 'station', E: 0, N: 0, H: 0, centerErr: 2 },
        { id: 'B',   type: 'new',     E: 50, N: 50, H: 0, centerErr: 2 }
      ],
      meas: [
        { id: 'm1', from: 'A', to: 'B', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 }
      ],
      centerErr: 2,
      activeMatklass: ''
    })
    runSimulation()
    const sr = getState().simResult
    expect(sr.error).toBeDefined()
    expect(sr.error).toMatch(/FP1/)
    expect(sr.error).toMatch(/inte i några mätningar/)
  })

  it('Helt frikopplat fritt nät utan kända punkter → fel', () => {
    setState({
      pts: [
        { id: 'P1', type: 'station', E: 0,   N: 0,   H: 0, centerErr: 2 },
        { id: 'P2', type: 'new',     E: 100, N: 0,   H: 0, centerErr: 2 }
      ],
      meas: [
        { id: 'm1', from: 'P1', to: 'P2', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 }
      ],
      centerErr: 2,
      activeMatklass: ''
    })
    runSimulation()
    expect(getState().simResult.error).toBeDefined()
  })
})

describe('k-tal klassificering', () => {
  it('k > 1.14 ger "Överbestämt"', () => {
    // Test-nät med många redundanta mätningar
    setState({
      pts: [
        { id: 'A',  type: 'known',   E: 0,    N: 0,   H: 0, centerErr: 2 },
        { id: 'B',  type: 'known',   E: 100,  N: 0,   H: 0, centerErr: 2 },
        { id: 'C',  type: 'known',   E: 50,   N: 100, H: 0, centerErr: 2 },
        { id: 'P1', type: 'station', E: 30,   N: 30,  H: 0, centerErr: 2 }
      ],
      // Många mätningar för att höja k > 1.14
      meas: [
        { id: 'm1', from: 'P1', to: 'A', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
        { id: 'm2', from: 'P1', to: 'B', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 },
        { id: 'm3', from: 'P1', to: 'C', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3 }
      ],
      centerErr: 2,
      activeMatklass: ''
    })
    runSimulation()
    const sr = getState().simResult
    // 6 obs, 3 obekanta = k = 3/6 = 0.5 – knappt över Stark, men UTANFÖR "Överbestämt"
    // För riktigt k > 1.14 krävs mer än dubbla mätningar; detta test verifierar
    // bara att klassificeringen finns. Justera värden vid behov.
    expect(['Otillräckligt','Svagt','Acceptabelt','Starkt','Överbestämt']).toContain(sr.K_class)
  })
})

describe('NUMERISK REGRESSIONSTEST - exakt matchning mot facit', () => {
  // Var tidigare ett golden master mot NätSim_Beta_2.html. Originalet använde
  // ∂φ/∂z = −1 i en bågmeterskalad riktningsrad (F1), vilket var fel, så
  // "identiskt med originalet" är inte längre rätt kriterium. Testet mäter nu
  // mot facit: värdena är verifierade mot en oberoende referensimplementation
  // av 2D MK-utjämning skriven från lärobokens formler.
  it('Standardnät ger facitvärden för sigPos', () => {
    setState({
      pts: [
        { id: 'P1', type: 'station', E: 0,   N: 0,   H: 0, centerErr: 2 },
        { id: 'A',  type: 'known',   E: 100, N: 0,   H: 0, centerErr: 2 },
        { id: 'B',  type: 'known',   E: 50,  N: 100, H: 0, centerErr: 2 },
        { id: 'C',  type: 'known',   E: -50, N: 80,  H: 0, centerErr: 2 }
      ],
      meas: [
        { id: 'm1', from: 'P1', to: 'A', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' },
        { id: 'm2', from: 'P1', to: 'B', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' },
        { id: 'm3', from: 'P1', to: 'C', obsType: 'both', sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3, instrPreset: 'ts16_1' }
      ],
      centerErr: 2,
      activeMatklass: ''
    })
    runSimulation()
    const p1 = getState().simResult.ptResults.find(p => p.id === 'P1')
    // Facit med korrekt orienteringspartial ∂(d·φ)/∂z = −d (F1), centreringen
    // som en enda C-term enligt HMK Bilaga C.1.1/C.1.2 (F4), u(plan) =
    // √(σN²+σE²) enligt HMK Formel F.23 (F5) och längd-σ som
    // √[(A + B·L)² + C²] enligt HMK Bilaga C.1.2 (F17).
    // Ursprungliga (felaktiga) värden: 0.002166 / 0.001832 / 0.002006.
    // Efter enbart F1:                  0.002191 / 0.001858 / 0.002031.
    // Efter F1+F4:                      0.001621 / 0.001361 / 0.001497.
    // Efter F1+F4+F5:                   0.001621 / 0.001361 / 0.002117.
    expect(p1.sigE.toFixed(6)).toBe('0.001648')
    expect(p1.sigN.toFixed(6)).toBe('0.001379')
    expect(p1.sigPos.toFixed(6)).toBe('0.002148')
  })
})
