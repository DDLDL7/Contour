import { describe, expect, it } from 'vitest'
import { solveOde } from './ode'

describe('adaptive differential equations', () => {
  it('agrees with exponential growth forwards and backwards', () => {
    const result = solveOde((_t, [y]) => [y], 0, 2, [1])
    expect(result.points.at(-1)!.values[0]).toBeCloseTo(Math.exp(2), 5)
    const back = solveOde((_t, [y]) => [y], 2, 0, [Math.exp(2)])
    expect(back.points.at(-1)!.values[0]).toBeCloseTo(1, 5)
  })
  it('preserves harmonic oscillator trajectory within tolerance', () => {
    const result = solveOde((_t, [x, y]) => [y, -x], 0, 2*Math.PI, [1, 0], 1e-8)
    expect(result.points.at(-1)!.values[0]).toBeCloseTo(1, 6)
    expect(result.points.at(-1)!.values[1]).toBeCloseTo(0, 6)
    for (const point of result.points) expect(point.values[0]**2 + point.values[1]**2).toBeCloseTo(1, 6)
  })
  it('rejects singular, malformed and unsupported inputs', () => {
    expect(() => solveOde(() => [Infinity], 0, 1, [1])).toThrow()
    expect(() => solveOde(() => [1,2], 0, 1, [1])).toThrow()
    expect(() => solveOde(() => [1], 0, 1, [1], 0)).toThrow()
  })
})
