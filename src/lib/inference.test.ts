import { describe, expect, it } from 'vitest'
import { runBonferroniPairwise, runChiSquareGoodnessOfFit, runChiSquareIndependence, runOneSampleInference, runOneWayAnova, runWelchInference } from './inference'

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

describe('Welch independent-sample inference', () => {
  // Reference values generated independently with scipy.stats.ttest_ind(equal_var=False).
  it('matches reference statistics, p-values and confidence limits', () => {
    const result = runWelchInference([1, 2, 3], [4, 5, 6])
    expect(result.statistic).toBeCloseTo(-3.6742346141747673, 10)
    expect(result.degreesOfFreedom).toBeCloseTo(4, 10)
    expect(result.pValue).toBeCloseTo(.021311641128756713, 10)
    expect(result.lower).toBeCloseTo(-5.266957935527519, 9)
    expect(result.upper).toBeCloseTo(-.7330420644724809, 9)
  })

  it('handles unequal variances and sample sizes with fractional degrees of freedom', () => {
    const result = runWelchInference([1, 2, 3, 5, 8], [2, 4, 9])
    expect(result.statistic).toBeCloseTo(-.49515243757439836, 10)
    expect(result.degreesOfFreedom).toBeCloseTo(3.455898018725212, 10)
    expect(result.pValue).toBeCloseTo(.6502931188266563, 10)
    expect(result.lower).toBeCloseTo(-8.367818591263546, 8)
    expect(result.upper).toBeCloseTo(5.967818591263546, 8)
  })

  it('respects nonzero null differences and test direction while keeping a two-sided interval', () => {
    const first = [1, 2, 3]; const second = [4, 5, 6]
    const centered = runWelchInference(first, second, -3)
    expect(centered.statistic).toBeCloseTo(0)
    expect(centered.pValue).toBeCloseTo(1)
    const less = runWelchInference(first, second, 0, .95, 'less')
    const greater = runWelchInference(first, second, 0, .95, 'greater')
    expect(less.pValue).toBeCloseTo(.021311641128756713 / 2, 10)
    expect(less.pValue + greater.pValue).toBeCloseTo(1, 10)
    expect(less.lower).toBeCloseTo(greater.lower, 10)
    expect(runWelchInference(second, first).statistic).toBeCloseTo(-less.statistic, 10)
  })

  it('supports one constant sample but rejects undefined or invalid procedures', () => {
    expect(runWelchInference([1, 1, 1], [2, 4, 6]).degreesOfFreedom).toBeCloseTo(2)
    expect(() => runWelchInference([1, 1], [2, 2])).toThrow(/zero variation/)
    expect(() => runWelchInference([1], [2, 3])).toThrow(/at least two/)
    expect(() => runWelchInference([1, Number.NaN], [2, 3])).toThrow(/finite/)
    expect(() => runWelchInference([1, 2], [2, 3], 0, 1)).toThrow(/Confidence/)
    expect(() => runWelchInference([1e308, -1e308], [2, 3])).toThrow(/numerical range/)
  })
})
