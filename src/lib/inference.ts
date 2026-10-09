import { distributionQuantile, calculateProbability, fDistributionSurvival } from './probability'

export type InferenceMethod = 't-test' | 'z-test' | 't-interval' | 'z-interval'
export type Alternative = 'two-sided' | 'greater' | 'less'
export type InferenceMode = 'one-sample' | 'welch' | 'anova' | 'posthoc' | 'chi-square' | 'independence'
export interface WelchSettings { firstColumn: string; secondColumn: string; nullDifference: string; confidence: string; alternative: Alternative }
export const defaultWelchSettings: WelchSettings = { firstColumn: 'B', secondColumn: 'C', nullDifference: '0', confidence: '0.95', alternative: 'two-sided' }
export function isWelchSettings(value: unknown): value is WelchSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as WelchSettings
  return typeof settings.firstColumn === 'string' && /^[A-H]$/.test(settings.firstColumn)
    && typeof settings.secondColumn === 'string' && /^[A-H]$/.test(settings.secondColumn)
    && typeof settings.nullDifference === 'string' && settings.nullDifference.length <= 80
    && typeof settings.confidence === 'string' && settings.confidence.length <= 80
    && ['two-sided', 'greater', 'less'].includes(settings.alternative)
}

export interface InferenceResult {
  n: number
  mean: number
  sampleStandardDeviation: number
  statistic?: number
  pValue?: number
  lower?: number
  upper?: number
  confidence?: number
  method: InferenceMethod
}

export interface AnovaResult { groups: number; observations: number; fStatistic: number; pValue: number; numeratorDf: number; denominatorDf: number; grandMean: number }
export interface GoodnessOfFitResult { categories: number; total: number; statistic: number; pValue: number; degreesOfFreedom: number }
export interface IndependenceResult { rows: number; columns: number; total: number; statistic: number; pValue: number; degreesOfFreedom: number; expectedMinimum: number }
export interface PairwiseResult { first: number; second: number; meanDifference: number; statistic: number; adjustedPValue: number; degreesOfFreedom: number }

export interface WelchResult {
  firstN: number; secondN: number; firstMean: number; secondMean: number
  firstStandardDeviation: number; secondStandardDeviation: number
  meanDifference: number; standardError: number; degreesOfFreedom: number
  statistic: number; pValue: number; lower: number; upper: number; confidence: number
}

/** Independent samples, unequal variances: NIST e-Handbook, sections 1.3.5.3 and 7.3.1. */
export function runWelchInference(first: number[], second: number[], nullDifference = 0, confidence = .95, alternative: Alternative = 'two-sided'): WelchResult {
  if ([first, second].some((sample) => sample.length < 2 || sample.some((value) => !Number.isFinite(value)))) {
    throw new Error('Welch inference needs at least two finite observations in each sample.')
  }
  if (!Number.isFinite(nullDifference)) throw new Error('Enter a finite null difference.')
  if (!(confidence > 0 && confidence < 1)) throw new Error('Confidence level must be between 0 and 1.')
  const summarize = (sample: number[]) => {
    const mean = sample.reduce((sum, value) => sum + value / sample.length, 0)
    const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2 / (sample.length - 1), 0)
    return { mean, variance, n: sample.length }
  }
  const a = summarize(first); const b = summarize(second)
  const va = a.variance / a.n; const vb = b.variance / b.n
  const variance = va + vb
  if (variance === 0) throw new Error('Both samples have zero variation; Welch inference is undefined.')
  const standardError = Math.sqrt(variance)
  // Normalize the terms to avoid squaring a potentially large variance.
  const degreesOfFreedom = 1 / ((va / variance) ** 2 / (a.n - 1) + (vb / variance) ** 2 / (b.n - 1))
  const meanDifference = a.mean - b.mean
  const statistic = (meanDifference - nullDifference) / standardError
  if (![variance, meanDifference, statistic, degreesOfFreedom].every(Number.isFinite)) throw new Error('Sample magnitudes exceed the numerical range supported by Welch inference.')
  // Use the lower tail directly rather than subtracting a nearly-one CDF.
  const tail = calculateProbability({ distribution: 'student-t', x: -Math.abs(statistic), firstParameter: degreesOfFreedom, secondParameter: 0 }).cumulative
  const lowerTail = statistic <= 0 ? tail : 1 - tail
  const upperTail = statistic >= 0 ? tail : 1 - tail
  const pValue = alternative === 'two-sided' ? 2 * tail : alternative === 'less' ? lowerTail : upperTail
  const critical = distributionQuantile('student-t', (1 + confidence) / 2, degreesOfFreedom)
  const margin = critical * standardError
  if (![margin, meanDifference - margin, meanDifference + margin].every(Number.isFinite)) throw new Error('The confidence interval exceeds the supported numerical range.')
  return { firstN: a.n, secondN: b.n, firstMean: a.mean, secondMean: b.mean,
    firstStandardDeviation: Math.sqrt(a.variance), secondStandardDeviation: Math.sqrt(b.variance),
    meanDifference, standardError, degreesOfFreedom, statistic, pValue: Math.max(0, Math.min(1, pValue)),
    lower: meanDifference - margin, upper: meanDifference + margin, confidence }
}

export function runOneWayAnova(groups: number[][]): AnovaResult {
  if (groups.length < 2 || groups.some((group) => group.length < 2 || group.some((value) => !Number.isFinite(value)))) {
    throw new Error('ANOVA needs at least two groups, with at least two finite observations in each group.')
  }
  const total = groups.reduce((sum, group) => sum + group.length, 0)
  const grandMean = groups.reduce((sum, group) => sum + group.reduce((groupSum, value) => groupSum + value, 0), 0) / total
  const between = groups.reduce((sum, group) => {
    const mean = group.reduce((groupSum, value) => groupSum + value, 0) / group.length
    return sum + group.length * (mean - grandMean) ** 2
  }, 0)
  const within = groups.reduce((sum, group) => {
    const mean = group.reduce((groupSum, value) => groupSum + value, 0) / group.length
    return sum + group.reduce((groupSum, value) => groupSum + (value - mean) ** 2, 0)
  }, 0)
  const numeratorDf = groups.length - 1
  const denominatorDf = total - groups.length
  if (within === 0 && between === 0) throw new Error('All observations are identical; the F statistic is undefined.')
  const fStatistic = within === 0 ? Number.POSITIVE_INFINITY : (between / numeratorDf) / (within / denominatorDf)
  return { groups: groups.length, observations: total, fStatistic, pValue: fDistributionSurvival(fStatistic, numeratorDf, denominatorDf), numeratorDf, denominatorDf, grandMean }
}

export function runChiSquareGoodnessOfFit(observed: number[], expected: number[]): GoodnessOfFitResult {
  if (observed.length < 2 || observed.length !== expected.length) throw new Error('Enter at least two matching observed and expected category counts.')
  if (observed.some((value) => !Number.isSafeInteger(value) || value < 0) || expected.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Observed counts must be non-negative whole numbers and expected counts must be greater than zero.')
  }
  const totalObserved = observed.reduce((sum, value) => sum + value, 0)
  const totalExpected = expected.reduce((sum, value) => sum + value, 0)
  if (Math.abs(totalObserved - totalExpected) > Math.max(1, totalObserved) * 1e-8) throw new Error('Observed and expected counts must have the same total.')
  const statistic = observed.reduce((sum, value, index) => sum + (value - expected[index]) ** 2 / expected[index], 0)
  const degreesOfFreedom = observed.length - 1
  const pValue = 1 - calculateProbability({ distribution: 'chi-square', x: statistic, firstParameter: degreesOfFreedom, secondParameter: 0 }).cumulative
  return { categories: observed.length, total: totalObserved, statistic, pValue: Math.max(0, Math.min(1, pValue)), degreesOfFreedom }
}

export function runChiSquareIndependence(observed: number[][]): IndependenceResult {
  if (observed.length < 2 || observed.some((row) => row.length < 2 || row.length !== observed[0].length)) throw new Error('Enter a rectangular contingency table with at least two rows and two columns.')
  if (observed.some((row) => row.some((value) => !Number.isSafeInteger(value) || value < 0))) throw new Error('Contingency counts must be non-negative whole numbers.')
  const rowTotals = observed.map((row) => row.reduce((sum, value) => sum + value, 0))
  const columnTotals = observed[0].map((_, column) => observed.reduce((sum, row) => sum + row[column], 0))
  const total = rowTotals.reduce((sum, value) => sum + value, 0)
  if (total === 0) throw new Error('The contingency table must contain a positive total count.')
  const expected = observed.map((row, i) => row.map((_value, j) => rowTotals[i] * columnTotals[j] / total))
  if (expected.some((row) => row.some((value) => value === 0))) throw new Error('Every row and column must have a positive total.')
  const statistic = observed.reduce((sum, row, i) => sum + row.reduce((rowSum, value, j) => rowSum + (value - expected[i][j]) ** 2 / expected[i][j], 0), 0)
  const degreesOfFreedom = (observed.length - 1) * (observed[0].length - 1)
  const cumulative = calculateProbability({ distribution: 'chi-square', x: statistic, firstParameter: degreesOfFreedom, secondParameter: 0 }).cumulative
  return { rows: observed.length, columns: observed[0].length, total, statistic, pValue: Math.max(0, Math.min(1, 1 - cumulative)), degreesOfFreedom, expectedMinimum: Math.min(...expected.flat()) }
}

export function runBonferroniPairwise(groups: number[][]): PairwiseResult[] {
  if (groups.length < 3 || groups.some((group) => group.length < 2 || group.some((value) => !Number.isFinite(value)))) throw new Error('Post-hoc comparisons need at least three groups with two finite observations in each.')
  const total = groups.reduce((sum, group) => sum + group.length, 0)
  const degreesOfFreedom = total - groups.length
  const means = groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length)
  const pooledVariance = groups.reduce((sum, group, index) => sum + group.reduce((groupSum, value) => groupSum + (value - means[index]) ** 2, 0), 0) / degreesOfFreedom
  if (pooledVariance === 0) throw new Error('Post-hoc t statistics are undefined when all within-group variation is zero.')
  const pairs = groups.length * (groups.length - 1) / 2
  const results: PairwiseResult[] = []
  for (let first = 0; first < groups.length; first += 1) for (let second = first + 1; second < groups.length; second += 1) {
    const standardError = Math.sqrt(pooledVariance * (1 / groups[first].length + 1 / groups[second].length))
    const meanDifference = means[first] - means[second]
    const statistic = meanDifference / standardError
    const cumulative = calculateProbability({ distribution: 'student-t', x: Math.abs(statistic), firstParameter: degreesOfFreedom, secondParameter: 0 }).cumulative
    results.push({ first, second, meanDifference, statistic, adjustedPValue: Math.min(1, 2 * (1 - cumulative) * pairs), degreesOfFreedom })
  }
  return results
}

export function runOneSampleInference(
  values: number[], method: InferenceMethod, nullMean: number, populationStandardDeviation: number,
  confidence: number, alternative: Alternative = 'two-sided',
): InferenceResult {
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) throw new Error('Enter at least two finite numeric observations.')
  if (!Number.isFinite(nullMean) || !Number.isFinite(populationStandardDeviation)) throw new Error('Enter finite hypothesis parameters.')
  if (!(confidence > 0 && confidence < 1)) throw new Error('Confidence level must be between 0 and 1.')
  const n = values.length
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const sampleStandardDeviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1))
  const isZ = method === 'z-test' || method === 'z-interval'
  const standardDeviation = isZ ? populationStandardDeviation : sampleStandardDeviation
  if (isZ && standardDeviation <= 0) throw new Error('A z procedure requires a known population standard deviation greater than zero.')
  if (!isZ && standardDeviation === 0 && method === 't-test') throw new Error('The sample standard deviation is zero, so the t statistic is undefined.')
  const standardError = standardDeviation / Math.sqrt(n)
  if (method.endsWith('interval')) {
    const critical = distributionQuantile(isZ ? 'normal' : 'student-t', (1 + confidence) / 2, n - 1)
    const margin = critical * standardError
    return { n, mean, sampleStandardDeviation, lower: mean - margin, upper: mean + margin, confidence, method }
  }
  const statistic = (mean - nullMean) / standardError
  const cumulative = calculateProbability({ distribution: isZ ? 'normal' : 'student-t', x: statistic, firstParameter: isZ ? 0 : n - 1, secondParameter: isZ ? 1 : 0 }).cumulative
  const pValue = alternative === 'two-sided' ? 2 * Math.min(cumulative, 1 - cumulative) : alternative === 'greater' ? 1 - cumulative : cumulative
  return { n, mean, sampleStandardDeviation, statistic, pValue: Math.max(0, Math.min(1, pValue)), method }
}
