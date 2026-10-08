import { describe, expect, it } from 'vitest'
import { compileGraph } from './math'
import { estimateSlope, findCurveExtrema, findCurveInflections, findCurveIntersections, findCurveRoots } from './analysis'

describe('2D numerical graph analysis', () => {
  it('finds crossing and touching roots without reporting an asymptote as a root', () => {
    const parabola = compileGraph('y = x^2 - 4')
    const touching = compileGraph('y = (x - 0.37)^2')
    const reciprocal = compileGraph('y = 1/x')
    expect(findCurveRoots(parabola, 0, -5, 5).map((point) => point.x)).toEqual([expect.closeTo(-2, 4), expect.closeTo(2, 4)])
    expect(findCurveRoots(touching, 0, -5, 5)).toHaveLength(1)
    expect(findCurveRoots(touching, 0, -5, 5)[0].x).toBeCloseTo(0.37, 4)
    expect(findCurveRoots(reciprocal, 0, -5, 5)).toEqual([])
  })

  it('finds intersections, including with a shifted parameterised curve', () => {
    const parabola = compileGraph('y = x^2')
    const line = compileGraph('y = a')
    const points = findCurveIntersections(parabola, line, 4, -5, 5)
    expect(points).toHaveLength(2)
    expect(points[0].x).toBeCloseTo(-2, 4)
    expect(points[1].x).toBeCloseTo(2, 4)
    expect(points[0].y).toBeCloseTo(4)
    expect(findCurveIntersections(parabola, parabola, 0, -5, 5)).toEqual([])
  })

  it('finds turning points and avoids claiming a slope at a cusp', () => {
    const parabola = compileGraph('y = (x - 1)^2 + 2')
    const cosine = compileGraph('y = cos(x)')
    const cusp = compileGraph('y = abs(x)')
    const minimum = findCurveExtrema(parabola, 0, -5, 5)
    expect(minimum).toHaveLength(1)
    expect(minimum[0]).toMatchObject({ kind: 'minimum' })
    expect(minimum[0].x).toBeCloseTo(1, 4)
    expect(minimum[0].y).toBeCloseTo(2, 4)
    expect(findCurveExtrema(cosine, 0, -1, 1)[0]).toMatchObject({ kind: 'maximum' })
    expect(estimateSlope(parabola, 0, 2)).toBeCloseTo(2, 3)
    expect(estimateSlope(cusp, 0, 0)).toBeNaN()
  })

  it('locates sign changes in curvature as approximate inflection points', () => {
    const cubic = compileGraph('y = x^3')
    const points = findCurveInflections(cubic, 0, -3, 3)
    expect(points).toHaveLength(1)
    expect(points[0].x).toBeCloseTo(0, 3)
    expect(points[0].y).toBeCloseTo(0, 3)
  })
})
