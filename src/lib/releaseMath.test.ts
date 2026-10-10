import { expect, it } from 'vitest'
import { compileGraph } from './math'
import { estimateSlope, findCurveRoots } from './analysis'
import { solveOde } from './ode'
import { calculateProbability, distributionQuantile } from './probability'
import { sampleParametricSurface } from './meshing'
import { evaluateSpreadsheet, fitRegression } from './spreadsheet'

// Closed forms and elementary recurrences are independent of the numerical
// algorithms under test. Inputs are fixed, so failures can be reproduced.
it.each([-2.3, -.371, .1234567, 2.7])('finds a shifted repeated root at %s without confusing poles', root => {
  const graph = compileGraph(`y=(x-(${root}))^2`)
  const points = findCurveRoots(graph, 1, -4, 4)
  expect(points).toHaveLength(1); expect(points[0].x).toBeCloseTo(root, 5)
  expect(findCurveRoots(compileGraph(`y=1/(x-(${root}))`), 1, -4, 4)).toEqual([])
})
it.each([-1.4, -.3, .5, 2.1])('agrees with the analytic derivative of sin(x²) at %s', x => {
  expect(estimateSlope(compileGraph('y=sin(x^2)'), 1, x)).toBeCloseTo(2 * x * Math.cos(x * x), 4)
})
it('agrees with logistic growth and its backward initial-value solution', () => {
  const exact = (t: number) => 1 / (1 + 9 * Math.exp(-t))
  const forward = solveOde((_t, [y]) => [y * (1 - y)], 0, 10, [.1], 1e-9)
  for (const point of forward.points) expect(point.values[0]).toBeCloseTo(exact(point.t), 7)
  const backward = solveOde((_t, [y]) => [y * (1 - y)], 10, 0, [exact(10)], 1e-10)
  expect(backward.points.at(-1)!.values[0]).toBeCloseTo(.1, 6)
})
it('preserves zero-length initial values and rejects finite-time blow-up', () => {
  expect(solveOde(() => [99], 3, 3, [2]).points).toEqual([{ t: 3, values: [2] }])
  expect(() => solveOde((_t, [y]) => [y * y], 0, 2, [1])).toThrow(/range|small|limit/)
})
it.each([-8, -2, -.2, 0, .2, 2, 8])('matches the Cauchy closed-form density and CDF at %s', x => {
  const value = calculateProbability({ distribution: 'student-t', x, firstParameter: 1, secondParameter: 0 })
  expect(value.cumulative).toBeCloseTo(.5 + Math.atan(x) / Math.PI, 9)
  expect(value.densityOrMass).toBeCloseTo(1 / (Math.PI * (1 + x * x)), 9)
})
it.each([.01, .1, .25, .75, .9, .99])('matches an independent Cauchy quantile at probability %s', p => {
  expect(distributionQuantile('student-t', p, 1)).toBeCloseTo(Math.tan(Math.PI * (p - .5)), 8)
})
it('matches Poisson probabilities computed by elementary recurrence', () => {
  const lambda = 12; let mass = Math.exp(-lambda); let cumulative = 0
  for (let k = 0; k <= 37; k++) {
    if (k) mass *= lambda / k
    cumulative += mass
    const value = calculateProbability({ distribution: 'poisson', x: k, firstParameter: lambda, secondParameter: 0 })
    expect(value.densityOrMass).toBeCloseTo(mass, 10)
    expect(value.cumulative).toBeCloseTo(cumulative, 9)
  }
})
it('keeps sampled parametric sphere vertices on the analytic sphere', () => {
  const graph = compileGraph('x=2*sin(v)*cos(u), y=2*sin(v)*sin(u), z=2*cos(v)')
  const mesh = sampleParametricSurface(graph, 1, 48)
  expect(mesh.indices!.length).toBeGreaterThan(1000)
  for (let i = 0; i < mesh.positions.length; i += 3) expect(mesh.positions[i] ** 2 + mesh.positions[i + 1] ** 2 + mesh.positions[i + 2] ** 2).toBeCloseTo(4, 5)
})
it('fits a degree-eight polynomial without losing precision from a large x offset', () => {
  const points = Array.from({ length: 17 }, (_, i) => ({ x: 1e6 + i, y: ((i - 8) / 8) ** 8 + 2 * ((i - 8) / 8) ** 3 - 1 }))
  const fit = fitRegression(points, 'polynomial', 8)!
  expect(fit).not.toBeNull()
  for (const point of points) expect(fit.predict(point.x)).toBeCloseTo(point.y, 8)
})
it('recomputes a long chain across all supported spreadsheet rows', () => {
  const cells: Record<string, string> = { A1: '1' }
  for (let row = 2; row <= 18; row++) cells[`A${row}`] = `=A${row - 1}+1`
  expect(evaluateSpreadsheet({ cells }, {}, 1).A18.value).toBe(18)
  expect(evaluateSpreadsheet({ cells: { ...cells, A1: '100' } }, {}, 1).A18.value).toBe(117)
})
