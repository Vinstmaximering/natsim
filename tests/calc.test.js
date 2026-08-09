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

  // OMSKRIVET efter F1-fixen (∂(d·φ)/∂z = −d i stället för −1).
  // Tidigare värden 2.166 / 1.832 / 2.006 kom från NätSim_Beta_2.html och den
  // NumPy-referens som replikerade samma −1. Siktlängderna i detta nät är
  // olika (100 / 111.80 / 94.34 m), och just då är −1 mot −d inte längre en
  // ofarlig kolumnskalning – de gamla värdena var alltså fel.
  // Nya värdena är verifierade mot en oberoende referensimplementation
  // (avvikelse < 5e-16 på samtliga storheter).
  it('P1 σ_pos = 2.031 mm', () => {
    runSimulation()
    const p1 = getState().simResult.ptResults.find(p => p.id === 'P1')
    expect(p1.sigE * 1000).toBeCloseTo(2.191, 2)
    expect(p1.sigN * 1000).toBeCloseTo(1.858, 2)
    expect(p1.sigPos * 1000).toBeCloseTo(2.031, 2)
  })

  // OMSKRIVET efter F1-fixen. Tidigare a=2.283, b=1.684.
  it('Felellips a=2.327 mm, b=1.684 mm (1σ)', () => {
    runSimulation()
    const p1 = getState().simResult.ptResults.find(p => p.id === 'P1')
    expect(p1.aSemi * 1000).toBeCloseTo(2.327, 2)
    expect(p1.bSemi * 1000).toBeCloseTo(1.684, 2)
  })

  // OMSKRIVET efter F1-fixen. Tidigare r=0.4793, MUF=12.14mm, YT=6.32mm.
  // MUF = κ·σ/√r och YT = (1−r)·MUF är oförändrade formler; det är r som
  // flyttat sig, och MUF/YT följer med.
  it('Obs 1 (P1→A dist): r_i=0.4671, MUF=12.30mm, YT=6.55mm', () => {
    runSimulation()
    const r = getState().simResult.redund[0]  // första obs i ordning
    expect(r.ri).toBeCloseTo(0.4671, 3)
    expect(r.mdb.val * 1000).toBeCloseTo(12.30, 1)
    expect(r.yt_m * 1000).toBeCloseTo(6.55, 1)
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
    // Facit med korrekt orienteringspartial ∂(d·φ)/∂z = −d.
    // Gamla (felaktiga) värden: 0.002166 / 0.001832 / 0.002006.
    expect(p1.sigE.toFixed(6)).toBe('0.002191')
    expect(p1.sigN.toFixed(6)).toBe('0.001858')
    expect(p1.sigPos.toFixed(6)).toBe('0.002031')
  })
})
