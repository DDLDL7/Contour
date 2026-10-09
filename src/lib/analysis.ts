import type { GraphExpression } from './math'

export interface CurvePoint {
  x: number
  y: number
}

export interface TurningPoint extends CurvePoint {
  kind: 'minimum' | 'maximum'
}

export interface InflectionPoint extends CurvePoint { kind: 'inflection' }

export interface CurveDiagnostics { integral: number; arcLength: number; curvature: number | null }

/** Approximate continuous portions only; reject undefined values and obvious jumps. */
export function estimateCurveDiagnostics(graph: GraphExpression, parameterA: number, minX: number, maxX: number, anchorX = (minX + maxX) / 2): CurveDiagnostics | null {
  if (graph.kind !== 'curve' || ![minX, maxX, anchorX].every(Number.isFinite) || maxX <= minX || maxX - minX > 1000) return null
  const evaluate = (x: number) => graph.evaluate(x, 0, parameterA)
  const segments = 512
  const step = (maxX - minX) / segments
  let previous = evaluate(minX)
  if (!Number.isFinite(previous) || Math.abs(previous) > 1e6) return null
  let integral = 0
  let arcLength = 0
  for (let index = 1; index <= segments; index += 1) {
    const x = minX + index * step
    const current = evaluate(x)
    const midpoint = evaluate(x - step / 2)
    if (![current, midpoint].every(Number.isFinite) || Math.max(Math.abs(current), Math.abs(midpoint)) > 1e6) return null
    if (Math.max(Math.abs(midpoint - previous), Math.abs(current - midpoint)) > 50) return null
    integral += (previous + 2 * midpoint + current) * step / 4
    arcLength += Math.hypot(step / 2, midpoint - previous) + Math.hypot(step / 2, current - midpoint)
    previous = current
  }
  const h = Math.max(1e-4, Math.min(0.01, step / 2))
  const left = evaluate(anchorX - h)
  const center = evaluate(anchorX)
  const right = evaluate(anchorX + h)
  const slope = (right - left) / (2 * h)
  const secondDerivative = (right - 2 * center + left) / (h * h)
  const curvature = [left, center, right, slope, secondDerivative].every(Number.isFinite)
    ? Math.abs(secondDerivative) / Math.pow(1 + slope * slope, 1.5) : null
  return { integral, arcLength, curvature: Number.isFinite(curvature) ? curvature : null }
}

const sampleCount = 900
const maxResults = 64

function searchMinimum(evaluate: (x: number) => number, left: number, right: number): number {
  const ratio = (Math.sqrt(5) - 1) / 2
  let first = right - ratio * (right - left)
  let second = left + ratio * (right - left)
  let firstValue = evaluate(first)
  let secondValue = evaluate(second)
  for (let iteration = 0; iteration < 56; iteration += 1) {
    if (firstValue > secondValue) {
      left = first
      first = second
      firstValue = secondValue
      second = left + ratio * (right - left)
      secondValue = evaluate(second)
    } else {
      right = second
      second = first
      secondValue = firstValue
      first = right - ratio * (right - left)
      firstValue = evaluate(first)
    }
  }
  return (left + right) / 2
}

function sample(evaluate: (x: number) => number, minX: number, maxX: number): number[] {
  return Array.from({ length: sampleCount + 1 }, (_, index) => evaluate(minX + (maxX - minX) * index / sampleCount))
}

function findZeroes(evaluate: (x: number) => number, minX: number, maxX: number): number[] {
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return []
  const values = sample(evaluate, minX, maxX)
  // Coincident curves have infinitely many intersections, not a list of isolated points.
  if (values.every((value) => value === 0)) return []
  const step = (maxX - minX) / sampleCount
  const zeroes: number[] = []
  const add = (x: number, nearbyMagnitude: number) => {
    const value = evaluate(x)
    if (!Number.isFinite(value) || Math.abs(value) > Math.max(1e-7, nearbyMagnitude * 1e-6)) return
    if (zeroes.some((other) => Math.abs(other - x) < step * 0.2)) return
    if (zeroes.length < maxResults) zeroes.push(x)
  }

  for (let index = 0; index < sampleCount && zeroes.length < maxResults; index += 1) {
    const leftValue = values[index]
    const rightValue = values[index + 1]
    const leftX = minX + index * step
    if (leftValue === 0) add(leftX, 0)
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue) || leftValue * rightValue >= 0) continue

    let left = leftX
    let right = leftX + step
    let signAtLeft = Math.sign(leftValue)
    for (let iteration = 0; iteration < 56; iteration += 1) {
      const middle = (left + right) / 2
      const middleValue = evaluate(middle)
      if (!Number.isFinite(middleValue)) break
      if (middleValue === 0) { left = middle; right = middle; break }
      if (Math.sign(middleValue) === signAtLeft) {
        left = middle
        signAtLeft = Math.sign(middleValue)
      } else {
        right = middle
      }
    }
    add((left + right) / 2, Math.max(Math.abs(leftValue), Math.abs(rightValue)))
  }

  // Even-multiplicity roots do not change sign. Refine valleys in |f| separately.
  for (let index = 1; index < sampleCount && zeroes.length < maxResults; index += 1) {
    const before = Math.abs(values[index - 1])
    const middle = Math.abs(values[index])
    const after = Math.abs(values[index + 1])
    if (!Number.isFinite(before) || !Number.isFinite(middle) || !Number.isFinite(after)) continue
    if (middle >= before || middle >= after) continue
    const left = minX + (index - 1) * step
    const right = left + 2 * step
    const x = searchMinimum((point) => Math.abs(evaluate(point)), left, right)
    add(x, Math.max(before, after))
  }
  return zeroes.sort((left, right) => left - right)
}

export function findCurveRoots(graph: GraphExpression, parameterA: number, minX: number, maxX: number): CurvePoint[] {
  if (graph.kind !== 'curve') return []
  const evaluate = (x: number) => graph.evaluate(x, 0, parameterA)
  return findZeroes(evaluate, minX, maxX).map((x) => ({ x, y: 0 }))
}

export function findCurveIntersections(
  first: GraphExpression,
  second: GraphExpression,
  parameterA: number,
  minX: number,
  maxX: number,
): CurvePoint[] {
  if (first.kind !== 'curve' || second.kind !== 'curve') return []
  const difference = (x: number) => first.evaluate(x, 0, parameterA) - second.evaluate(x, 0, parameterA)
  return findZeroes(difference, minX, maxX)
    .map((x) => ({ x, y: first.evaluate(x, 0, parameterA) }))
    .filter((point) => Number.isFinite(point.y))
}

export function findCurveExtrema(graph: GraphExpression, parameterA: number, minX: number, maxX: number): TurningPoint[] {
  if (graph.kind !== 'curve' || maxX <= minX) return []
  const evaluate = (x: number) => graph.evaluate(x, 0, parameterA)
  const values = sample(evaluate, minX, maxX)
  const step = (maxX - minX) / sampleCount
  const points: TurningPoint[] = []

  for (let index = 1; index < sampleCount && points.length < maxResults; index += 1) {
    const before = values[index - 1]
    const middle = values[index]
    const after = values[index + 1]
    if (![before, middle, after].every(Number.isFinite)) continue
    const kind = middle < before && middle < after ? 'minimum'
      : middle > before && middle > after ? 'maximum' : null
    if (!kind) continue
    const left = minX + (index - 1) * step
    const right = left + 2 * step
    const x = searchMinimum((point) => {
      const value = evaluate(point)
      return Number.isFinite(value) ? (kind === 'minimum' ? value : -value) : Number.POSITIVE_INFINITY
    }, left, right)
    const y = evaluate(x)
    if (!Number.isFinite(y)) continue
    if (kind === 'minimum' && (y > before || y > after)) continue
    if (kind === 'maximum' && (y < before || y < after)) continue
    points.push({ x, y, kind })
  }
  return points
}

export function findCurveInflections(graph: GraphExpression, parameterA: number, minX: number, maxX: number): InflectionPoint[] {
  if (graph.kind !== 'curve' || !Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return []
  const evaluate = (x: number) => graph.evaluate(x, 0, parameterA)
  const curvature = (x: number) => {
    const h = 2e-3 * Math.max(1, Math.abs(x))
    const before = evaluate(x - h); const value = evaluate(x); const after = evaluate(x + h)
    return [before, value, after].every(Number.isFinite) ? (after - 2 * value + before) / (h * h) : Number.NaN
  }
  const count = 700; const step = (maxX - minX) / count; const points: InflectionPoint[] = []
  let left = minX; let leftCurvature = curvature(left)
  for (let index = 1; index <= count && points.length < maxResults; index += 1) {
    const right = minX + index * step; const rightCurvature = curvature(right)
    const curvatureBeforeLeft = index > 1 ? curvature(left - step) : Number.NaN
    const crossesAtZero = Math.abs(leftCurvature) < 1e-8 && Number.isFinite(curvatureBeforeLeft) && curvatureBeforeLeft * rightCurvature < 0
    if (Number.isFinite(leftCurvature) && Number.isFinite(rightCurvature) && (leftCurvature * rightCurvature < 0 || crossesAtZero)) {
      let low = left; let high = right; let lowSign = Math.sign(leftCurvature)
      for (let iteration = 0; iteration < 48; iteration += 1) {
        const middle = (low + high) / 2; const middleCurvature = curvature(middle)
        if (!Number.isFinite(middleCurvature)) break
        if (Math.sign(middleCurvature) === lowSign) low = middle
        else high = middle
      }
      const x = (low + high) / 2; const y = evaluate(x)
      if (Number.isFinite(y) && !points.some((point) => Math.abs(point.x - x) < step * .2)) points.push({ x, y, kind: 'inflection' })
    }
    left = right; leftCurvature = rightCurvature
  }
  return points
}

export function estimateSlope(graph: GraphExpression, parameterA: number, x: number): number {
  if (graph.kind !== 'curve') return Number.NaN
  const step = 1e-4 * Math.max(1, Math.abs(x))
  const before = graph.evaluate(x - step, 0, parameterA)
  const value = graph.evaluate(x, 0, parameterA)
  const after = graph.evaluate(x + step, 0, parameterA)
  if (![before, value, after].every(Number.isFinite)) return Number.NaN
  const leftSlope = (value - before) / step
  const rightSlope = (after - value) / step
  if (Math.abs(leftSlope - rightSlope) > Math.max(0.02, 0.05 * Math.max(Math.abs(leftSlope), Math.abs(rightSlope)))) return Number.NaN
  return (leftSlope + rightSlope) / 2
}
