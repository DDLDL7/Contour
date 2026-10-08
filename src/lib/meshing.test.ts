import { describe, expect, it } from 'vitest'
import { compileGraph } from './math'
import { sampleImplicitSurface, sampleParametricSurface } from './meshing'

describe('advanced 3D surfaces', () => {
  it('samples a parametric torus with finite vertices', () => {
    const graph = compileGraph('x=(2+cos(v))*cos(u), y=(2+cos(v))*sin(u), z=sin(v)')
    expect(graph.kind).toBe('parametricSurface')
    const samples = sampleParametricSurface(graph, 1, 16)
    expect(samples.indices!.length).toBeGreaterThan(100)
    expect([...samples.positions].every(Number.isFinite)).toBe(true)
    expect(graph.evaluate(0, 0, 1)).toBeCloseTo(3)
    expect(graph.evaluateZ?.(0, Math.PI / 2, 1)).toBeCloseTo(1)
  })

  it('meshes an implicit sphere near its equation', () => {
    const graph = compileGraph('x^2+y^2+z^2=9')
    expect(graph.kind).toBe('implicitSurface')
    const samples = sampleImplicitSurface(graph, 1, 18)
    expect(samples.positions.length).toBeGreaterThan(1000)
    for (let index = 0; index < samples.positions.length; index += 3) {
      const [x, z, y] = samples.positions.slice(index, index + 3)
      expect(Math.abs(graph.evaluate3D!(x, y, z, 1))).toBeLessThan(0.35)
    }
  })

  it('keeps space curves distinct and rejects mixed parameters', () => {
    expect(compileGraph('x=cos(t), y=sin(t), z=t').kind).toBe('spaceCurve')
    expect(() => compileGraph('x=cos(t)+u, y=sin(u), z=v')).toThrow('Use u and v')
    expect(() => compileGraph('x^2+y^2+z^2<9')).toThrow('3D inequalities')
  })
})
