import { describe, expect, it } from 'vitest'
import { contourSegments, sampleScalarGrid } from './contours'
import { compileGraph } from './math'

describe('implicit contour sampling', () => {
  it('traces the circle x² + y² = 9 near radius 3', () => {
    const graph = compileGraph('x^2 + y^2 = 9')
    const grid = sampleScalarGrid(
      (x, y) => graph.evaluate(x, y, 0),
      200, 200,
      (pixel) => pixel / 20 - 5,
      (pixel) => 5 - pixel / 20,
    )
    const segments = contourSegments(grid)

    expect(segments.length).toBeGreaterThan(20)
    for (const [px0, py0, px1, py1] of segments) {
      for (const [px, py] of [[px0, py0], [px1, py1]]) {
        expect(Math.hypot(px / 20 - 5, 5 - py / 20)).toBeCloseTo(3, 1)
      }
    }
  })

  it('skips cells that have no boundary or undefined samples', () => {
    const positive = sampleScalarGrid(() => 1, 100, 100, (pixel) => pixel, (pixel) => pixel)
    const undefinedDomain = sampleScalarGrid((x) => x < 50 ? Number.NaN : 1, 100, 100, (pixel) => pixel, (pixel) => pixel)

    expect(contourSegments(positive)).toEqual([])
    expect(contourSegments(undefinedDomain)).toEqual([])
  })
})
