// Siktlinjetester för NätSim – visibility.js
// Alla numeriska värden är hand-beräknade och kan verifieras analytiskt.

import { describe, it, expect } from 'vitest'
import {
  segmentIntersection,
  pointInPolygon,
  boundingBoxOverlap,
  computeBoundingBox,
  hasLineOfSight
} from '../src/core/visibility.js'

// ─── segmentIntersection ─────────────────────────────────────────────────────

describe('segmentIntersection', () => {
  it('Korsande segment → intersects: true, korrekt skärningspunkt', () => {
    // (0,0)→(10,10) ✕ (0,10)→(10,0): korsas vid (5,5)
    // t = 0.5,  u = 0.5  ⟹  point = (5, 5)
    const r = segmentIntersection([0, 0], [10, 10], [0, 10], [10, 0])
    expect(r.intersects).toBe(true)
    expect(r.point[0]).toBeCloseTo(5, 6)
    expect(r.point[1]).toBeCloseTo(5, 6)
    expect(r.t).toBeCloseTo(0.5, 6)
  })

  it('Parallella segment → intersects: false', () => {
    // Horisontella linjer, y=0 och y=5
    const r = segmentIntersection([0, 0], [10, 0], [0, 5], [10, 5])
    expect(r.intersects).toBe(false)
  })

  it('T-korsning mitt på segment → intersects: true', () => {
    // Vertikalt segment (5,0)→(5,10) korsar horisontellt (0,5)→(10,5) vid (5,5)
    const r = segmentIntersection([0, 5], [10, 5], [5, 0], [5, 10])
    expect(r.intersects).toBe(true)
    expect(r.point[0]).toBeCloseTo(5, 6)
    expect(r.point[1]).toBeCloseTo(5, 6)
  })

  it('Segment delar exakt endpoint → tolereras (false)', () => {
    // (0,0)→(10,0) och (10,0)→(10,10): delar punkten (10,0)
    // Utan tolerans: intersects vid t=1, u=0 → avstånd=0 < 0.01 m → false
    const r = segmentIntersection([0, 0], [10, 0], [10, 0], [10, 10])
    expect(r.intersects).toBe(false)
  })

  it('Endpoint-överlapp < 0.01 m → tolereras (false)', () => {
    // Segment 1 slutar vid (10, 0.005); Segment 2 börjar vid (10, 0)
    // Skärning faller vid t=1 → avstånd till p2=(10,0.005) är 0 < 0.01 m → false
    const r = segmentIntersection([0, 0], [10, 0.005], [10, 0], [10, 10])
    expect(r.intersects).toBe(false)
  })

  it('Segment med stor lucka → intersects: false', () => {
    // Seg1: (0,0)→(4,2), Seg2: (6,3)→(10,5): ingen skärning
    const r = segmentIntersection([0, 0], [4, 2], [6, 3], [10, 5])
    expect(r.intersects).toBe(false)
  })

  it('Kolinjära (överlappande) segment → intersects: false', () => {
    // rxs = 0 → parallell-gren → false
    const r = segmentIntersection([0, 0], [10, 0], [3, 0], [7, 0])
    expect(r.intersects).toBe(false)
  })
})

// ─── pointInPolygon ──────────────────────────────────────────────────────────

describe('pointInPolygon', () => {
  // Kvadrat [0..10] × [0..10]
  const SQ = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('Punkt klart inuti kvadrat → true', () => {
    expect(pointInPolygon([5, 5], SQ)).toBe(true)
  })

  it('Punkt klart utanför kvadrat → false', () => {
    expect(pointInPolygon([15, 5], SQ)).toBe(false)
  })

  it('Punkt på kant → true (dokumenterat val: kant räknas som inuti)', () => {
    // Mitten på höger kant: (10, 5)
    expect(pointInPolygon([10, 5], SQ)).toBe(true)
  })

  it('Punkt i hörn → true', () => {
    expect(pointInPolygon([0, 0], SQ)).toBe(true)
  })

  // L-formad polygon (notch uppe till höger):
  //
  //   (0,10)—(5,10)
  //     |        |
  //     |    (5,5)—(10,5)
  //     |               |
  //   (0,0)——————————(10,0)
  const L = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]

  it('L-polygon: punkt i nedre del → true', () => {
    expect(pointInPolygon([7, 2], L)).toBe(true)
  })

  it('L-polygon: punkt i vänstra övre del → true', () => {
    expect(pointInPolygon([2, 7], L)).toBe(true)
  })

  it('L-polygon: punkt i notchen (övre höger) → false', () => {
    // (7,7) befinner sig i det område som SAKNAS i L-formen
    expect(pointInPolygon([7, 7], L)).toBe(false)
  })

  it('Stöder {E,N}-objekt som indata', () => {
    const SQ_OBJ = [{ E: 0, N: 0 }, { E: 10, N: 0 }, { E: 10, N: 10 }, { E: 0, N: 10 }]
    expect(pointInPolygon({ E: 5, N: 5 }, SQ_OBJ)).toBe(true)
    expect(pointInPolygon({ E: 15, N: 5 }, SQ_OBJ)).toBe(false)
  })
})

// ─── boundingBoxOverlap ──────────────────────────────────────────────────────

describe('boundingBoxOverlap', () => {
  it('Överlappande boxes → true', () => {
    const b1 = { minE: 0, maxE: 10, minN: 0, maxN: 10 }
    const b2 = { minE: 5, maxE: 15, minN: 5, maxN: 15 }
    expect(boundingBoxOverlap(b1, b2)).toBe(true)
  })

  it('Separata boxes (E-riktning) → false', () => {
    const b1 = { minE: 0, maxE: 10, minN: 0, maxN: 10 }
    const b2 = { minE: 20, maxE: 30, minN: 0, maxN: 10 }
    expect(boundingBoxOverlap(b1, b2)).toBe(false)
  })

  it('Separata boxes (N-riktning) → false', () => {
    const b1 = { minE: 0, maxE: 10, minN: 0, maxN: 10 }
    const b2 = { minE: 0, maxE: 10, minN: 20, maxN: 30 }
    expect(boundingBoxOverlap(b1, b2)).toBe(false)
  })

  it('Boxes som delar en kant (tangent) → true', () => {
    const b1 = { minE: 0, maxE: 10, minN: 0, maxN: 10 }
    const b2 = { minE: 10, maxE: 20, minN: 0, maxN: 10 }
    expect(boundingBoxOverlap(b1, b2)).toBe(true)
  })
})

// ─── computeBoundingBox ──────────────────────────────────────────────────────

describe('computeBoundingBox', () => {
  it('Korrekt box för fyra [E,N]-punkter', () => {
    const bb = computeBoundingBox([[3, 7], [1, 2], [8, 5], [4, 9]])
    expect(bb.minE).toBe(1)
    expect(bb.maxE).toBe(8)
    expect(bb.minN).toBe(2)
    expect(bb.maxN).toBe(9)
  })

  it('Stöder {E,N}-objekt', () => {
    const bb = computeBoundingBox([{ E: 0, N: 10 }, { E: 5, N: 0 }])
    expect(bb.minE).toBe(0)
    expect(bb.maxE).toBe(5)
    expect(bb.minN).toBe(0)
    expect(bb.maxN).toBe(10)
  })
})

// ─── hasLineOfSight ──────────────────────────────────────────────────────────

// Testbyggnad: rektangel E=[40..60], N=[−10..10]
// Verifiering av sektionskorsning (kant E=60):
//   r=(100,0), s=(0,20), qp=(60,−10)
//   t = (60·20 − (−10)·0)/2000 = 0.6  ✓
//   u = (60·0 − (−10)·100)/2000 = 0.5 ✓
const BUILDING = {
  id: 'building_1',
  type: 'polygon',
  points: [[40, -10], [60, -10], [60, 10], [40, 10]]
}

describe('hasLineOfSight', () => {
  it('Fri sikt utan hinder → visible: true', () => {
    const r = hasLineOfSight([0, 0], [100, 0], [])
    expect(r.visible).toBe(true)
    expect(r.blockedBy).toBeUndefined()
  })

  it('Siktlinje rakt igenom byggnad → visible: false', () => {
    // (0,0)→(100,0) passerar E=[40..60] vid N=0: skär kant E=60 (t=0.6)
    const r = hasLineOfSight([0, 0], [100, 0], [BUILDING])
    expect(r.visible).toBe(false)
    expect(r.blockedBy).toBe('building_1')
  })

  it('Punkter på samma sida om byggnaden → visible: true', () => {
    // Siktlinje stannar vid E=30 – aldrig i närheten av E=[40..60]
    const r = hasLineOfSight([0, 0], [30, 0], [BUILDING])
    expect(r.visible).toBe(true)
  })

  it('Siktlinje förbi byggnaden (annan N) → visible: true', () => {
    // N=20 är utanför byggnadens N=[−10..10]
    const r = hasLineOfSight([0, 20], [100, 20], [BUILDING])
    expect(r.visible).toBe(true)
  })

  it('Punkt inuti byggnaden → visible: false', () => {
    // Station (50,0) befinner sig i centrum av BUILDING
    const r = hasLineOfSight([50, 0], [0, 100], [BUILDING])
    expect(r.visible).toBe(false)
    expect(r.blockedBy).toBe('building_1')
  })

  it('Linje-hinder blockerar → visible: false, korrekt blockedBy', () => {
    const wall = { id: 'wall_A', type: 'line', points: [[50, -5], [50, 5]] }
    // (0,0)→(100,0): skär väggen vid E=50, N=0
    //   t = 0.5, u = 0.5 → intersects ✓
    const r = hasLineOfSight([0, 0], [100, 0], [wall])
    expect(r.visible).toBe(false)
    expect(r.blockedBy).toBe('wall_A')
  })

  it('Linje-hinder parallellt med siktlinje → visible: true', () => {
    const wall = { id: 'wall_par', type: 'line', points: [[0, 5], [100, 5]] }
    const r = hasLineOfSight([0, 0], [100, 0], [wall])
    expect(r.visible).toBe(true)
  })

  it('Stöder {E,N}-objekt för from/to', () => {
    const r = hasLineOfSight({ E: 0, N: 0 }, { E: 30, N: 0 }, [BUILDING])
    expect(r.visible).toBe(true)
  })

  it('Korrekt blockedBy när flera hinder finns – stannar vid det första', () => {
    const w1 = { id: 'w1', type: 'line', points: [[30, -5], [30, 5]] }
    const w2 = { id: 'w2', type: 'line', points: [[70, -5], [70, 5]] }
    const r = hasLineOfSight([0, 0], [100, 0], [w1, w2])
    expect(r.visible).toBe(false)
    expect(r.blockedBy).toBe('w1')
  })

  it('Bounding-box-optimering: hinder långt bort konsulteras ej (getter-spion)', () => {
    // Siktlinje: (0,0)→(10,0)  –  sightBB: E=[0..10], N=[0..0]
    // Hindret sitter vid E=[900..910], N=[900..910] → BB överlappar ej.
    //
    // Med optimering (continue vid BB-miss):
    //   obs.points anropas EXAKT EN GÅNG (för computeBoundingBox inuti pre-filter)
    //   och sedan aldrig mer (kantcheckar hoppar över).
    //
    // Utan optimering skulle obs.points anropas en ytterligare gång
    // (för pts = obs.points innanför polygon-blocket).
    let accessCount = 0
    const BASE = [[900, 900], [910, 900], [910, 910], [900, 910]]
    const farObs = {
      id: 'far_obs',
      type: 'polygon',
      get points() { accessCount++; return BASE }
    }

    const result = hasLineOfSight([0, 0], [10, 0], [farObs])

    expect(result.visible).toBe(true)
    expect(accessCount).toBe(1) // exakt 1: BB-beräkning, inga kantcheckar
  })
})
