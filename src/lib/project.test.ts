import { describe, expect, it } from 'vitest'
import { parseProjectFile } from './project'
import { printableNetSvg } from './solids'

describe('project files', () => {
  it('preserves the entered LaTeX alongside graph syntax', () => {
    const source = {
      title: 'Fractions',
      parameterA: 1,
      updatedAt: new Date().toISOString(),
      expressions: [{
        id: 'fraction',
        text: 'y=(x^2+1)/(2)',
        latex: String.raw`y=\frac{x^2+1}{2}`,
        color: '#286fc0',
        visible: true,
      }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0]).toMatchObject({
      text: source.expressions[0].text,
      latex: source.expressions[0].latex,
    })
  })

  it('still opens older project files without LaTeX', () => {
    const source = {
      title: 'Older project',
      parameterA: 1,
      expressions: [{ id: 'curve', text: 'y = sin(x)', color: '#286fc0', visible: true }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0].latex).toBeUndefined()
    expect(parseProjectFile(JSON.stringify(source)).parameters).toEqual([])
  })

  it('preserves custom slider values and ranges in project files', () => {
    const source = {
      title: 'Sliders', parameterA: 1, parameterARange: { min: -10, max: 10, step: 0.5 },
      parameters: [{ name: 'b', value: 2.5, min: 0, max: 5, step: 0.5 }], expressions: [],
    }
    expect(parseProjectFile(JSON.stringify(source))).toMatchObject({ parameterARange: source.parameterARange, parameters: source.parameters })
    expect(() => parseProjectFile(JSON.stringify({ ...source, parameters: [{ ...source.parameters[0], name: 'x' }] }))).toThrow(/invalid parameters/)
  })

  it('preserves saved 3D solid constructions', () => {
    const source = {
      title: 'Solids', parameterA: 1, expressions: [],
      solids: [{ id: 's1', shape: 'sphere', x: 1, y: 1, z: 0, size: 2, color: '#25a6b8', visible: true }],
    }
    expect(parseProjectFile(JSON.stringify(source)).solids).toEqual(source.solids)
  })

  it('preserves saved 3D vector fields', () => {
    const source = {
      title: 'Fields', parameterA: 1, expressions: [],
      vectorFields: [{ id: 'vf1', fx: '-y', fy: 'x', fz: 'z', color: '#25a6b8', visible: true }],
    }
    expect(parseProjectFile(JSON.stringify(source)).vectorFields).toEqual(source.vectorFields)
  })

  it('generates printable nets with cut and fold guides for supported solids', () => {
    expect(printableNetSvg('cube')).toContain('Cube net')
    expect(printableNetSvg('cube')).toContain('stroke-dasharray')
    expect(printableNetSvg('pyramid')).toContain('Square pyramid net')
  })
})
