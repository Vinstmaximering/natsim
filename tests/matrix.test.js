import { describe, it, expect } from 'vitest'
import { invertMatrix } from '../src/core/matrix.js'

describe('invertMatrix – Gauss-Jordan med partiell pivotering', () => {

  it('2×2 inversion: [[4,7],[2,6]] → [[0.6,-0.7],[-0.2,0.4]]', () => {
    // det = 4*6 - 7*2 = 10
    const inv = invertMatrix([[4, 7], [2, 6]])
    expect(inv[0][0]).toBeCloseTo( 0.6, 10)
    expect(inv[0][1]).toBeCloseTo(-0.7, 10)
    expect(inv[1][0]).toBeCloseTo(-0.2, 10)
    expect(inv[1][1]).toBeCloseTo( 0.4, 10)
  })

  it('3×3 inversion: [[2,1,0],[1,3,1],[0,1,2]] → 1/8·[[5,-2,1],[-2,4,-2],[1,-2,5]]', () => {
    // det = 8, analytisk invers verifierad
    const inv = invertMatrix([[2, 1, 0], [1, 3, 1], [0, 1, 2]])
    expect(inv[0][0]).toBeCloseTo( 5 / 8, 10)
    expect(inv[0][1]).toBeCloseTo(-2 / 8, 10)
    expect(inv[0][2]).toBeCloseTo( 1 / 8, 10)
    expect(inv[1][0]).toBeCloseTo(-2 / 8, 10)
    expect(inv[1][1]).toBeCloseTo( 4 / 8, 10)
    expect(inv[1][2]).toBeCloseTo(-2 / 8, 10)
    expect(inv[2][0]).toBeCloseTo( 1 / 8, 10)
    expect(inv[2][1]).toBeCloseTo(-2 / 8, 10)
    expect(inv[2][2]).toBeCloseTo( 5 / 8, 10)
  })

  it('singulär matris returnerar null', () => {
    // [[1,2],[2,4]] har det=0
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull()
  })

  it('A * A⁻¹ = I (roundtrip, 3×3 normalmatris)', () => {
    // Typisk normalmatris-form: symmetrisk, välkonditionerad
    const M = [[3, 0, 1], [0, 2, 0], [1, 0, 3]]
    const inv = invertMatrix(M)
    const n = 3
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0
        for (let k = 0; k < n; k++) sum += M[i][k] * inv[k][j]
        expect(sum).toBeCloseTo(i === j ? 1 : 0, 10)
      }
    }
  })

})
