import { calculateProbability, distributionQuantile } from './probability'

/** Wilson score interval, without continuity correction (NIST prc241). */
export function proportionInference(successes: number, n: number, nullProportion: number, confidence = .95) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e9 || !Number.isSafeInteger(successes) || successes < 0 || successes > n) throw new Error('Use integer counts with 0 ≤ successes ≤ sample size, and sample size from 1 to 1,000,000,000.')
  if (!(confidence > 0 && confidence < 1) || !(nullProportion > 0 && nullProportion < 1)) throw new Error('Confidence and null proportion must lie strictly between 0 and 1.')
  const proportion = successes / n
  const z = distributionQuantile('normal', (1 + confidence) / 2)
  const divisor = 1 + z*z/n
  const center = (proportion + z*z/(2*n)) / divisor
  const half = z * Math.sqrt(proportion*(1-proportion)/n + z*z/(4*n*n)) / divisor
  const statistic = (proportion-nullProportion) / Math.sqrt(nullProportion*(1-nullProportion)/n)
  const pValue = 2*calculateProbability({ distribution: 'normal', x: -Math.abs(statistic), firstParameter: 0, secondParameter: 1 }).cumulative
  return { proportion, lower: Math.max(0, center-half), upper: Math.min(1, center+half), statistic, pValue, normalApproximationAdequate: n*nullProportion >= 10 && n*(1-nullProportion) >= 10 }
}
