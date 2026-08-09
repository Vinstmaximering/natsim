// ─────────────────────────────────────────────────────────────────────────────
// HMK-BINDNING AV REFERENSIMPLEMENTATIONEN
//
// Den här filen validerar tests/ref.mjs mot HMK-Stommätning 2024:s publicerade
// räkneexempel och handräknade facit. Den importerar MEDVETET ingenting från
// src/ – referensens korrekthet får aldrig vila på kärnan.
//
// Bakgrund: ref.mjs har två gånger burit exakt samma fel som kärnan (mean-formen
// för σ_pos i F5, helt kvadratisk längdsummering i F17) och gett falsk
// överensstämmelse på < 5e-16 mot fel svar. Den här filen är spärren mot att det
// händer en tredje gång.
//
// Jämförelser mellan kärnan och referensen hör hemma i tests/facit.test.js –
// inte här.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  uL, uPhi, uPlan, centreringsterm, reference, invert, DELTA0, RHO_MGON
} from './ref.mjs'

describe('HMK Bilaga C.1.2 – längdosäkerhet u(L) = √[(A + B·L)² + C²]', () => {
  it('HMK:s räkneexempel: A=2 mm, B=3 ppm, L=300 m, C=3 mm → 4,17 mm', () => {
    expect(uL(2, 3, 300, 3)).toBeCloseTo(Math.sqrt((2 + 0.9) ** 2 + 3 ** 2), 12)
    expect(uL(2, 3, 300, 3)).toBeCloseTo(4.1725, 3)
  })

  it('A och B·L adderas linjärt, inte kvadratiskt', () => {
    // Utan centrering ska resultatet vara exakt A + B·L.
    expect(uL(2, 3, 300, 0)).toBeCloseTo(2.9, 12)
    expect(uL(1, 1.5, 1000, 0)).toBeCloseTo(2.5, 12)
    // Diskriminant mot den gamla helt kvadratiska formen:
    expect(uL(2, 3, 300, 3)).not.toBeCloseTo(Math.sqrt(4 + 0.81 + 9), 2)  // 3,7162
  })

  it('centreringen kombineras kvadratiskt och ingår en gång', () => {
    // A = B = 0 ⇒ u(L) = C exakt.
    expect(uL(0, 0, 300, 3)).toBeCloseTo(3, 12)
    // C = 0 ⇒ ingen kvadratisk term alls.
    expect(uL(2, 0, 100, 0)).toBeCloseTo(2, 12)
  })

  it('är linjär i L för fix A, B och C = 0', () => {
    const d1 = uL(1, 2, 200, 0) - uL(1, 2, 100, 0)
    const d2 = uL(1, 2, 300, 0) - uL(1, 2, 200, 0)
    expect(d1).toBeCloseTo(d2, 12)
    expect(d1).toBeCloseTo(0.2, 12)   // 2 ppm × 100 m
  })
})

describe('HMK Bilaga C.1.1 – riktningsosäkerhet u(φ)', () => {
  it('HMK:s räkneexempel: A=0,6 mgon, 2 helsatser, C=2 mm, L=300 m → 0,600 mgon', () => {
    expect(uPhi(0.6, 2, 2, 300)).toBeCloseTo(0.600, 3)
    // Ledvis mot standardens uppställning:
    //   instrumentledet 0,6/√2 = 0,424264 mgon
    //   centreringsledet 2 mm / 0,3 km × ρ = 0,424413 mgon,  ρ = 0,063662
    const instr = 0.6 / Math.SQRT2
    const centr = (2 / 0.3) * 0.063662
    expect(instr).toBeCloseTo(0.424264, 6)
    expect(centr).toBeCloseTo(0.424413, 6)
    expect(uPhi(0.6, 2, 2, 300)).toBeCloseTo(Math.hypot(instr, centr), 5)
  })

  it('helsatser skalar instrumentledet med 1/√n', () => {
    // Utan centrering är u(φ) = A/√n exakt.
    expect(uPhi(0.6, 1, 0, 300)).toBeCloseTo(0.6, 12)
    expect(uPhi(0.6, 4, 0, 300)).toBeCloseTo(0.3, 12)
    expect(uPhi(0.6, 9, 0, 300)).toBeCloseTo(0.2, 12)
  })

  it('centreringsledet avtar med siktlängden', () => {
    // C ensam: u(φ) = C/L · ρ. Dubblad sikt ⇒ halverat bidrag.
    expect(uPhi(0, 1, 2, 300)).toBeCloseTo(2 * uPhi(0, 1, 2, 600), 12)
    expect(uPhi(0, 1, 2, 300)).toBeCloseTo((0.002 / 300) * RHO_MGON, 12)
  })

  it('ρ = 200000/π ≈ 63661,98 mgon per radian, dvs. 0,063662 mgon per mm/km', () => {
    expect(RHO_MGON).toBeCloseTo(63661.977, 3)
    expect(RHO_MGON * 1e-6).toBeCloseTo(0.063662, 6)
  })
})

describe('HMK Formel F.23 – standardosäkerhet i plan', () => {
  it('u(plan) = √[u²(N) + u²(E)], Helmert – ingen delning med 2', () => {
    expect(uPlan(3, 4)).toBeCloseTo(5, 12)
    expect(uPlan(1, 1)).toBeCloseTo(Math.SQRT2, 12)
    // Diskriminant mot den gamla mean-formen √((N²+E²)/2):
    expect(uPlan(3, 4)).not.toBeCloseTo(Math.sqrt((9 + 16) / 2), 3)
  })

  it('gäller för utjämnade komponenter i ett litet nät', () => {
    // Fyra kända punkter runt en ny – komponenterna kommer ur utjämningen,
    // u(plan) ska vara deras kvadratsumma.
    const pts = [
      { id: 'NY1', type: 'new', E: 50, N: 50, centerErr: 1 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 1 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 1 },
      { id: 'FP3', type: 'known', E: 100, N: 100, centerErr: 1 },
      { id: 'FP4', type: 'known', E: 0, N: 100, centerErr: 1 }
    ]
    const meas = ['FP1', 'FP2', 'FP3', 'FP4'].map((f, i) => ({
      id: 'm' + i, from: f, to: 'NY1', obsType: 'both',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 1)
    expect(r.singular).toBe(false)
    const p = r.ptResults.find(x => x.id === 'NY1')
    expect(p.sigPos).toBeCloseTo(Math.hypot(p.sigN, p.sigE), 15)
    // Symmetrisk geometri ⇒ σ_E = σ_N och därmed cirkulär ellips.
    expect(p.sigE).toBeCloseTo(p.sigN, 12)
    expect(p.aSemi).toBeCloseTo(p.bSemi, 12)
    // Spårinvariansen: a² + b² = σN² + σE² = u(plan)².
    expect(p.aSemi ** 2 + p.bSemi ** 2).toBeCloseTo(p.sigE ** 2 + p.sigN ** 2, 15)
    expect(p.sigPos ** 2).toBeCloseTo(p.aSemi ** 2 + p.bSemi ** 2, 15)
  })
})

describe('HMK Formel F.16 – δ₀', () => {
  it('δ₀ = λ(2,5 %) + λ(20 %) = 1,96 + 0,84 = 2,80', () => {
    expect(DELTA0).toBe(2.80)
    expect(DELTA0).toBeCloseTo(1.96 + 0.84, 10)
  })

  it('är inte Baardas 4,13 (α = 0,1 %, annan risknivå)', () => {
    expect(DELTA0).not.toBe(4.13)
  })

  it('MUF = δ₀ · σ / √r', () => {
    const pts = [
      { id: 'NY1', type: 'new', E: 50, N: 50, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP3', type: 'known', E: 50, N: 130, centerErr: 0 }
    ]
    const meas = ['FP1', 'FP2', 'FP3'].map((f, i) => ({
      id: 'm' + i, from: f, to: 'NY1', obsType: 'both',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 0)
    const kontrollerbara = r.redund.filter(rd => rd.ri > 1e-9)
    expect(kontrollerbara.length).toBeGreaterThan(0)
    kontrollerbara.forEach(rd => {
      expect(rd.muf).toBeCloseTo(DELTA0 * rd.sig / Math.sqrt(rd.ri), 12)
    })
  })

  it('MUF är oändlig för en okontrollerbar observation (r = 0)', () => {
    // Varje station har här exakt en riktning, som orienteringsobekanten
    // absorberar helt ⇒ r = 0. Ett grovfel i en sådan observation kan aldrig
    // upptäckas, och minsta urskiljbara fel är därmed obegränsat.
    const pts = [
      { id: 'NY1', type: 'new', E: 50, N: 50, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP3', type: 'known', E: 50, N: 130, centerErr: 0 }
    ]
    const meas = ['FP1', 'FP2', 'FP3'].map((f, i) => ({
      id: 'm' + i, from: f, to: 'NY1', obsType: 'both',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 0)
    const hz = r.redund.filter(rd => rd.type === 'hz')
    expect(hz.length).toBe(3)
    hz.forEach(rd => {
      expect(rd.ri).toBeCloseTo(0, 10)
      expect(rd.muf).toBe(Infinity)
    })
    // Avstånden bär hela redundansen: r = 1/3 var vid symmetrisk geometri.
    expect(r.sumR).toBeCloseTo(r.dof, 10)
  })
})

describe('Handräknat facit – orienteringsmodell och redundans', () => {
  it('känd station, endast orienteringsobekant, tre riktningar → r = 2/3 var', () => {
    // Handräkning: a_i = −d_i, σ_i = d_i·σ_α ⇒ p_i = 1/(d_i²σ_α²).
    //   N    = Σ p_i d_i² = 3/σ_α²
    //   h_ii = a_i² p_i / N = 1/3   oberoende av d_i
    //   r_i  = 2/3,  Σr = 2 = f
    // Siktlängderna görs medvetet olika – vid lika längder döljs ett fel i
    // orienteringspartialen, eftersom −1 och −d då bara skiljer sig med en
    // kolumnskalning.
    const avstand = [50, 100, 400]
    const pts = [{ id: 'S', type: 'known', E: 0, N: 0, centerErr: 0 }]
    avstand.forEach((d, i) => {
      const a = (i * 120) * Math.PI / 180
      pts.push({ id: 'FP' + (i + 1), type: 'known', E: d * Math.sin(a), N: d * Math.cos(a), centerErr: 0 })
    })
    const meas = avstand.map((_, i) => ({
      id: 'm' + i, from: 'S', to: 'FP' + (i + 1), obsType: 'hz_only',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 0)
    expect(r.n).toBe(3)
    expect(r.nu).toBe(1)
    expect(r.dof).toBe(2)
    r.redund.forEach((rd, i) => {
      expect(rd.ri, `d=${avstand[i]} m`).toBeCloseTo(2 / 3, 12)
    })
    expect(r.sumR).toBeCloseTo(2, 12)
  })

  it('Σr = n − u för ett fackverk med reciproka sikter', () => {
    const pts = [
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 1 },
      { id: 'FP2', type: 'known', E: 200, N: 0, centerErr: 1 },
      { id: 'NY1', type: 'new', E: 60, N: 120, centerErr: 1 },
      { id: 'NY2', type: 'new', E: 150, N: 130, centerErr: 1 }
    ]
    const meas = [['FP1', 'NY1'], ['NY1', 'FP1'], ['FP2', 'NY2'], ['NY2', 'FP2'],
      ['NY1', 'NY2'], ['NY2', 'NY1'], ['FP1', 'FP2'], ['FP1', 'NY2']]
      .map(([f, t], i) => ({
        id: 'm' + i, from: f, to: t, obsType: 'both',
        sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
      }))
    const r = reference(pts, meas, 1)
    expect(r.sumR).toBeCloseTo(r.dof, 10)
    r.redund.forEach(rd => {
      expect(rd.ri).toBeGreaterThanOrEqual(-1e-12)
      expect(rd.ri).toBeLessThanOrEqual(1 + 1e-12)
    })
  })

  it('ren trilateration ger ingen orienteringsobekant', () => {
    const pts = [
      { id: 'NY1', type: 'new', E: 50, N: 30, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP3', type: 'known', E: 50, N: 90, centerErr: 0 }
    ]
    const meas = ['FP1', 'FP2', 'FP3'].map((t, i) => ({
      id: 'm' + i, from: 'NY1', to: t, obsType: 'dist_only',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 0)
    expect(r.singular).toBe(false)
    expect(r.nu).toBe(2)
    expect(r.dof).toBe(1)
    expect(r.sumR).toBeCloseTo(1, 12)
  })

  it('k = f/n ligger i [0, 1)', () => {
    const pts = [
      { id: 'S', type: 'known', E: 0, N: 0, centerErr: 0 },
      { id: 'FP1', type: 'known', E: 100, N: 0, centerErr: 0 },
      { id: 'FP2', type: 'known', E: -50, N: 86.6, centerErr: 0 },
      { id: 'FP3', type: 'known', E: -50, N: -86.6, centerErr: 0 }
    ]
    const meas = [1, 2, 3].map(i => ({
      id: 'm' + i, from: 'S', to: 'FP' + i, obsType: 'hz_only',
      sigDist_mm: 1, sigDist_ppm: 1, sigHz_mgon: 0.3, numSatser: 3
    }))
    const r = reference(pts, meas, 0)
    expect(r.kGlobal).toBeCloseTo(2 / 3, 12)
    expect(r.kGlobal).toBeLessThan(1)
  })
})

describe('Matrisinvertering', () => {
  it('inverterar korrekt och upptäcker singularitet', () => {
    const M = [[4, 7], [2, 6]]
    const Mi = invert(M)
    expect(Mi[0][0]).toBeCloseTo(0.6, 12)
    expect(Mi[0][1]).toBeCloseTo(-0.7, 12)
    expect(Mi[1][0]).toBeCloseTo(-0.2, 12)
    expect(Mi[1][1]).toBeCloseTo(0.4, 12)
    expect(invert([[1, 2], [2, 4]])).toBeNull()
  })
})

describe('Centreringstermen', () => {
  it('är exakt C när båda ändarna har samma värde (HMK:s förutsättning)', () => {
    expect(centreringsterm(3, 3)).toBeCloseTo(3, 12)
    expect(centreringsterm(2, 2)).toBeCloseTo(2, 12)
  })

  it('är kvadratiska medelvärdet vid olika värden', () => {
    expect(centreringsterm(2, 4)).toBeCloseTo(Math.sqrt((4 + 16) / 2), 12)
  })
})
