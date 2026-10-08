import { erf, lgamma } from 'mathjs'

export type DistributionName = 'normal' | 'binomial' | 'poisson' | 'student-t' | 'chi-square'
export interface ProbabilityInput { distribution: DistributionName; x: number; firstParameter: number; secondParameter: number }
export interface ProbabilityResult { densityOrMass: number; cumulative: number; measure: 'density' | 'mass'; label: string }
export interface DistributionPlotPoint { x: number; y: number }

function logGamma(value: number): number { return Number(lgamma(value)) }

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    let term = 1 / a; let sum = term; let denominator = a
    for (let index = 1; index <= 10000; index += 1) {
      denominator += 1; term *= x / denominator; sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break
    }
    return Math.max(0, Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a))))
  }
  let b = x + 1 - a; let c = 1e300; let d = 1 / b; let h = d
  for (let index = 1; index <= 10000; index += 1) {
    const an = -index * (index - a); b += 2; d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const delta = d * c; h *= delta
    if (Math.abs(delta - 1) < 1e-14) break
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
  return Math.max(0, Math.min(1, 1 - q))
}

function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300; const qab = a + b; const qap = a + 1; const qam = a - 1
  let c = 1; let d = 1 - qab * x / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let index = 1; index <= 10000; index += 1) {
    let aa = index * (b - index) * x / ((qam + 2 * index) * (a + 2 * index))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d; h *= d * c
    aa = -(a + index) * (qab + index) * x / ((a + 2 * index) * (qap + 2 * index))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c; h *= delta
    if (Math.abs(delta - 1) < 1e-14) break
  }
  return h
}

export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  const result = x < (a + 1) / (a + b + 2)
    ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b
  return Math.max(0, Math.min(1, result))
}

export function fDistributionSurvival(statistic: number, numeratorDf: number, denominatorDf: number): number {
  if (!(statistic >= 0) || !(numeratorDf > 0) || !(denominatorDf > 0)) throw new Error('F statistic and degrees of freedom must be valid non-negative values.')
  if (statistic === Number.POSITIVE_INFINITY) return 0
  const x = numeratorDf * statistic / (numeratorDf * statistic + denominatorDf)
  return Math.max(0, Math.min(1, 1 - regularizedBeta(x, numeratorDf / 2, denominatorDf / 2)))
}

function logBinomialMass(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY
  if (p === 0) return k === 0 ? 0 : Number.NEGATIVE_INFINITY
  if (p === 1) return k === n ? 0 : Number.NEGATIVE_INFINITY
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p)
}

export function calculateProbability(input: ProbabilityInput): ProbabilityResult {
  const { distribution, x, firstParameter: first, secondParameter: second } = input
  if (![x, first, second].every(Number.isFinite)) throw new Error('Enter finite values for the observation and distribution parameters.')
  if (distribution === 'normal') {
    if (second <= 0) throw new Error('Standard deviation must be greater than zero.')
    const z = (x - first) / second
    return { densityOrMass: Math.exp(-z * z / 2) / (second * Math.sqrt(2 * Math.PI)), cumulative: (1 + erf(z / Math.sqrt(2))) / 2, measure: 'density', label: `Normal(μ=${first}, σ=${second})` }
  }
  if (distribution === 'binomial') {
    const n = first; const p = second
    if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error('Binomial trial count must be a whole number from 0 to 10,000.')
    if (p < 0 || p > 1) throw new Error('Binomial success probability must be between 0 and 1.')
    const k = Math.floor(x)
    const mass = Number.isInteger(x) ? Math.exp(logBinomialMass(n, x, p)) : 0
    const cumulative = k < 0 ? 0 : k >= n ? 1 : Array.from({ length: k + 1 }, (_, index) => Math.exp(logBinomialMass(n, index, p))).reduce((sum, value) => sum + value, 0)
    return { densityOrMass: mass, cumulative: Math.min(1, cumulative), measure: 'mass', label: `Binomial(n=${n}, p=${p})` }
  }
  if (distribution === 'poisson') {
    const lambda = first
    if (lambda <= 0 || lambda > 5000) throw new Error('Poisson rate λ must be greater than 0 and no more than 5,000.')
    const k = Math.floor(x)
    const mass = Number.isInteger(x) && k >= 0 ? Math.exp(k * Math.log(lambda) - lambda - logGamma(k + 1)) : 0
    const cumulative = k < 0 ? 0 : regularizedGammaP(k + 1, lambda) <= 1 ? 1 - regularizedGammaP(k + 1, lambda) : 1
    return { densityOrMass: mass, cumulative: Math.max(0, Math.min(1, cumulative)), measure: 'mass', label: `Poisson(λ=${lambda})` }
  }
  if (distribution === 'student-t') {
    const degrees = first
    if (degrees <= 0) throw new Error('Degrees of freedom must be greater than zero.')
    const density = Math.exp(logGamma((degrees + 1) / 2) - logGamma(degrees / 2)) / Math.sqrt(degrees * Math.PI) * (1 + x * x / degrees) ** (-(degrees + 1) / 2)
    const tail = regularizedBeta(degrees / (degrees + x * x), degrees / 2, .5) / 2
    return { densityOrMass: density, cumulative: x >= 0 ? 1 - tail : tail, measure: 'density', label: `Student-t(df=${degrees})` }
  }
  const degrees = first
  if (degrees <= 0) throw new Error('Degrees of freedom must be greater than zero.')
  if (x < 0) return { densityOrMass: 0, cumulative: 0, measure: 'density', label: `Chi-squared(df=${degrees})` }
  const shape = degrees / 2
  const density = x === 0 ? (shape < 1 ? Number.POSITIVE_INFINITY : shape === 1 ? .5 : 0) : Math.exp((shape - 1) * Math.log(x) - x / 2 - shape * Math.log(2) - logGamma(shape))
  return { densityOrMass: density, cumulative: regularizedGammaP(shape, x / 2), measure: 'density', label: `Chi-squared(df=${degrees})` }
}

export function sampleDistribution(input: Omit<ProbabilityInput, 'x'>): DistributionPlotPoint[] {
  const { distribution, firstParameter: first, secondParameter: second } = input
  let lower: number; let upper: number
  const discrete = distribution === 'binomial' || distribution === 'poisson'
  if (distribution === 'normal') { lower = first - 4 * second; upper = first + 4 * second }
  else if (distribution === 'student-t') { lower = -6; upper = 6 }
  else if (distribution === 'chi-square') { lower = 0; upper = Math.max(8, first + 5 * Math.sqrt(2 * first)) }
  else if (distribution === 'binomial') {
    const mean = first * second; const spread = 4 * Math.sqrt(first * second * (1 - second))
    lower = Math.max(0, Math.floor(mean - spread)); upper = Math.min(first, Math.ceil(mean + spread))
  } else {
    const spread = 4 * Math.sqrt(first)
    lower = Math.max(0, Math.floor(first - spread)); upper = Math.ceil(first + spread)
  }
  const count = discrete ? Math.min(200, Math.max(1, Math.ceil(upper - lower) + 1)) : 121
  const stride = discrete ? Math.max(1, Math.ceil((upper - lower + 1) / count)) : 1
  const points = Array.from({ length: count }, (_, index) => {
    const x = discrete ? Math.min(upper, lower + index * stride) : lower + (upper - lower) * index / (count - 1)
    const result = calculateProbability({ ...input, x })
    return { x, y: result.densityOrMass }
  })
  const finitePeak = Math.max(1e-12, ...points.map((point) => Number.isFinite(point.y) ? point.y : 0))
  return points.map((point) => Number.isFinite(point.y) ? point : { ...point, y: finitePeak * 1.1 })
}

export function distributionQuantile(distribution: 'normal' | 'student-t', probability: number, degreesOfFreedom = 1): number {
  if (!(probability > 0 && probability < 1)) throw new Error('Probability must be between 0 and 1, exclusive.')
  if (distribution === 'student-t' && !(degreesOfFreedom > 0)) throw new Error('Degrees of freedom must be greater than zero.')
  let low = -64; let high = 64
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2
    const cumulative = calculateProbability({
      distribution, x: middle, firstParameter: distribution === 'normal' ? 0 : degreesOfFreedom,
      secondParameter: distribution === 'normal' ? 1 : 0,
    }).cumulative
    if (cumulative < probability) low = middle
    else high = middle
  }
  return (low + high) / 2
}
