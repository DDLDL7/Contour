import { describe, expect, it } from 'vitest'
import { runBonferroniPairwise, runChiSquareGoodnessOfFit, runChiSquareIndependence, runOneSampleInference, runOneWayAnova } from './inference'

describe('one-sample statistical inference', () => {
  it('computes sample t tests with two-sided and one-sided alternatives', () => {
    const values = [2, 4, 6]
    const twoSided = runOneSampleInference(values, 't-test', 4, 1, .95, 'two-sided')
    expect(twoSided.statistic).toBeCloseTo(0)
    expect(twoSided.pValue).toBeCloseTo(1)
    const greater = runOneSampleInference(values, 't-test', 2, 1, .95, 'greater')
    expect(greater.pValue).toBeCloseTo(.1127, 3)
  })

  it('computes t and z confidence intervals', () => {
    const values = [2, 4, 6]
    const tInterval = runOneSampleInference(values, 't-interval', 0, 1, .95)
    expect(tInterval.mean).toBe(4)
    expect(tInterval.lower).toBeCloseTo(-.967, 2)
    expect(tInterval.upper).toBeCloseTo(8.967, 2)
    const zInterval = runOneSampleInference(values, 'z-interval', 0, 2, .95)
    expect(zInterval.lower).toBeCloseTo(1.737, 2)
    expect(zInterval.upper).toBeCloseTo(6.263, 2)
  })

  it('rejects samples or assumptions that are invalid for the chosen procedure', () => {
    expect(() => runOneSampleInference([2], 't-test', 0, 1, .95)).toThrow(/at least two/)
    expect(() => runOneSampleInference([2, 3], 'z-test', 0, 0, .95)).toThrow(/known population/)
  })

  it('runs one-way ANOVA and returns the F statistic and p-value', () => {
    const result = runOneWayAnova([[1, 2, 3], [4, 5, 6]])
    expect(result.fStatistic).toBeCloseTo(13.5)
    expect(result.pValue).toBeCloseTo(.0213, 3)
    expect(result.numeratorDf).toBe(1)
    expect(result.denominatorDf).toBe(4)
  })

  it('runs a chi-squared goodness-of-fit test and validates totals', () => {
    const result = runChiSquareGoodnessOfFit([50, 50], [40, 60])
    expect(result.statistic).toBeCloseTo(4.1666667, 6)
    expect(result.pValue).toBeCloseTo(.0412, 3)
    expect(() => runChiSquareGoodnessOfFit([50, 50], [30, 60])).toThrow(/same total/)
    expect(() => runChiSquareGoodnessOfFit([1.5, 2.5], [2, 2])).toThrow(/whole numbers/)
  })

  it('runs chi-squared independence and Bonferroni post-hoc comparisons', () => {
    const independence = runChiSquareIndependence([[20, 10], [10, 20]])
    expect(independence.degreesOfFreedom).toBe(1)
    expect(independence.statistic).toBeCloseTo(6.6666667)
    expect(() => runChiSquareIndependence([[1, 2], [3, 4.5]])).toThrow(/whole numbers/)
    const pairs = runBonferroniPairwise([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
    expect(pairs).toHaveLength(3)
    expect(pairs[0].adjustedPValue).toBeGreaterThanOrEqual(0)
    expect(pairs[0].adjustedPValue).toBeLessThanOrEqual(1)
  })
})
