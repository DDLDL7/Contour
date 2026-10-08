import { describe, expect, it } from 'vitest'
import { calculateProbability, sampleDistribution } from './probability'

describe('probability distributions', () => {
  it('samples bounded continuous and discrete distribution plots', () => {
    const normal = sampleDistribution({ distribution: 'normal', firstParameter: 0, secondParameter: 1 })
    expect(normal.length).toBeGreaterThan(100)
    expect(normal[60].x).toBeCloseTo(0)
    const binomial = sampleDistribution({ distribution: 'binomial', firstParameter: 12, secondParameter: .5 })
    expect(binomial.some((point) => point.x === 6)).toBe(true)
    expect(binomial.every((point) => point.y >= 0 && point.y <= 1)).toBe(true)
  })
  it('calculates normal density and cumulative probability', () => {
    const result = calculateProbability({ distribution: 'normal', x: 0, firstParameter: 0, secondParameter: 1 })
    expect(result.densityOrMass).toBeCloseTo(0.39894228, 7)
    expect(result.cumulative).toBeCloseTo(0.5, 10)
  })

  it('calculates binomial and Poisson point and cumulative probabilities', () => {
    const binomial = calculateProbability({ distribution: 'binomial', x: 5, firstParameter: 10, secondParameter: .5 })
    expect(binomial.densityOrMass).toBeCloseTo(0.24609375, 8)
    expect(binomial.cumulative).toBeCloseTo(0.623046875, 8)
    const poisson = calculateProbability({ distribution: 'poisson', x: 2, firstParameter: 3, secondParameter: 0 })
    expect(poisson.densityOrMass).toBeCloseTo(0.2240418, 6)
    expect(poisson.cumulative).toBeCloseTo(0.4231901, 6)
  })

  it('calculates Student-t and chi-squared density and CDF', () => {
    const student = calculateProbability({ distribution: 'student-t', x: 0, firstParameter: 1, secondParameter: 0 })
    expect(student.densityOrMass).toBeCloseTo(1 / Math.PI, 9)
    expect(student.cumulative).toBeCloseTo(.5, 9)
    const chiSquare = calculateProbability({ distribution: 'chi-square', x: 2, firstParameter: 2, secondParameter: 0 })
    expect(chiSquare.densityOrMass).toBeCloseTo(Math.exp(-1) / 2, 8)
    expect(chiSquare.cumulative).toBeCloseTo(1 - Math.exp(-1), 8)
  })

  it('rejects invalid distribution parameters', () => {
    expect(() => calculateProbability({ distribution: 'normal', x: 0, firstParameter: 0, secondParameter: 0 })).toThrow(/Standard deviation/)
    expect(() => calculateProbability({ distribution: 'binomial', x: 1, firstParameter: 2.5, secondParameter: .5 })).toThrow(/whole number/)
  })
})
