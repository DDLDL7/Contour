import { describe, expect, it } from 'vitest'
import { convertAsciiMathToLatex, convertLatexToAsciiMath } from 'mathlive/ssr'
import { editorAsciiToGraphSyntax } from './equation'
import { compileGraph, evaluatePlanarPoint, evaluateSpatialPoint } from './math'

describe('graph expression compilation', () => {
  it('evaluates a parameterised 2D function', () => {
    const expression = compileGraph('y = a*sin(x)')
    expect(expression.kind).toBe('curve')
    expect(expression.evaluate(Math.PI / 2, 0, 2)).toBeCloseTo(2)
  })

  it('uses x for a bare trig function entered in LaTeX', () => {
    const input = editorAsciiToGraphSyntax(convertLatexToAsciiMath(String.raw`y=3\sin+5`))
    const expression = compileGraph(input)

    expect(expression.inferredFunctions).toEqual(['sin'])
    expect(expression.evaluate(0, 0, 0)).toBe(5)
    expect(expression.evaluate(Math.PI / 2, 0, 0)).toBeCloseTo(8)
    expect(compileGraph('y=2cos-1').evaluate(Math.PI, 0, 0)).toBeCloseTo(-3)
    expect(compileGraph(convertLatexToAsciiMath(String.raw`y=3\sin x+5`)).evaluate(Math.PI / 2, 0, 0)).toBeCloseTo(8)
    expect(compileGraph(convertLatexToAsciiMath(String.raw`y=\sin x^2`)).evaluate(Math.sqrt(Math.PI / 2), 0, 0)).toBeCloseTo(1)
  })

  it('evaluates a 3D surface and preserves undefined points', () => {
    const surface = compileGraph('z = x^2 + y^2')
    const reciprocal = compileGraph('y = 1/x')
    expect(surface.kind).toBe('surface')
    expect(surface.evaluate(2, 3, 0)).toBe(13)
    expect(reciprocal.evaluate(0, 0, 0)).toBeNaN()
  })

  it('rejects code-like or unsupported expressions', () => {
    expect(() => compileGraph('y = import("x")')).toThrow()
    expect(() => compileGraph('y = x = 1')).toThrow()
    expect(() => compileGraph('y = evil(x)')).toThrow()
    expect(() => compileGraph('y = x + y')).toThrow()
    expect(() => compileGraph('x = sin(y)')).toThrow()
    expect(() => compileGraph('y = min + 1')).toThrow('Add an argument')
  })

  it('graphs a fraction and a function entered in math notation', () => {
    const fraction = compileGraph(editorAsciiToGraphSyntax(convertLatexToAsciiMath(String.raw`y=\frac{x^2+1}{2}`)))
    const functionGraph = compileGraph(editorAsciiToGraphSyntax(convertLatexToAsciiMath(String.raw`z=\frac{a}{2}\sin(\sqrt{x^2+y^2})`)))

    expect(fraction.evaluate(3, 0, 0)).toBe(5)
    expect(functionGraph.kind).toBe('surface')
    expect(functionGraph.evaluate(3, 4, 2)).toBeCloseTo(Math.sin(5))
  })

  it('renders existing project expressions as math notation', () => {
    const latex = convertAsciiMathToLatex('y = a*sin(x)')
    expect(latex).toContain(String.raw`\sin`)
    expect(compileGraph(convertLatexToAsciiMath(latex)).evaluate(Math.PI / 2, 0, 2)).toBeCloseTo(2)
  })

  it('compiles polar equations using theta and the parameter slider', () => {
    const source = convertLatexToAsciiMath(String.raw`r=2a\sin(3\theta)`)
    const polar = compileGraph(editorAsciiToGraphSyntax(source))

    expect(polar.kind).toBe('polar')
    expect(polar.evaluate(Math.PI / 6, 0, 1.5)).toBeCloseTo(3)
    const [x, y] = evaluatePlanarPoint(polar, Math.PI / 6, 1.5)
    expect(x).toBeCloseTo(3 * Math.sqrt(3) / 2)
    expect(y).toBeCloseTo(1.5)
    expect(polar.evaluate(0, 0, 1.5)).toBeCloseTo(0)
    expect(() => compileGraph('r=x+1')).toThrow('Unknown symbol')
  })

  it('compiles paired parametric equations without splitting function arguments', () => {
    const source = convertLatexToAsciiMath(String.raw`x=3\cos(t),y=3\sin(t)`)
    const circle = compileGraph(editorAsciiToGraphSyntax(source))
    const nestedComma = compileGraph('x = min(2, t), y = sin(t)')

    expect(circle.kind).toBe('parametric')
    expect(circle.evaluate(0, 0, 0)).toBeCloseTo(3)
    expect(circle.evaluateY?.(Math.PI / 2, 0, 0)).toBeCloseTo(3)
    const [x, y] = evaluatePlanarPoint(circle, Math.PI / 2, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(3)
    expect(nestedComma.evaluate(3, 0, 0)).toBe(2)
    expect(() => compileGraph('x = cos(x), y = sin(t)')).toThrow('Unknown symbol')
    expect(() => compileGraph('x = cos(t), y =')).toThrow('Finish the expression')
  })

  it('compiles a three-dimensional parametric space curve', () => {
    const source = convertLatexToAsciiMath(String.raw`x=2a\cos(t),y=2a\sin(t),z=t/2`)
    const helix = compileGraph(editorAsciiToGraphSyntax(source))
    const nestedComma = compileGraph('x = min(2, t), y = sin(t), z = t/2')

    expect(helix.kind).toBe('spaceCurve')
    const [x, y, z] = evaluateSpatialPoint(helix, Math.PI / 2, 1.5)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(3)
    expect(z).toBeCloseTo(Math.PI / 4)
    expect(evaluateSpatialPoint(nestedComma, 3, 0)[0]).toBe(2)
    expect(() => compileGraph('x=cos(t), y=sin(t), z=unknown')).toThrow('Unknown symbol')
  })

  it('compiles implicit equations and inequalities from math notation', () => {
    const circle = compileGraph(convertLatexToAsciiMath(String.raw`x^2+y^2=9`))
    const disk = compileGraph(convertLatexToAsciiMath(String.raw`x^2+y^2\le 9`))
    const exterior = compileGraph('x^2 + y^2 > 9')

    expect(circle.kind).toBe('implicit')
    expect(circle.evaluate(3, 0, 0)).toBeCloseTo(0)
    expect(circle.evaluate(0, 0, 0)).toBe(-9)
    expect(disk.kind).toBe('inequality')
    expect(disk.relation).toBe('<=')
    expect(disk.evaluate(0, 0, 0)).toBeLessThan(0)
    expect(exterior.relation).toBe('>')
    expect(exterior.evaluate(4, 0, 0)).toBeGreaterThan(0)
    expect(() => compileGraph('x^2 + y^2 = 9 = 10')).toThrow('one equality')
  })

  it('supports domain restrictions and piecewise 2D functions', () => {
    const restricted = compileGraph('y = x^2 {x >= 0}')
    expect(restricted.kind).toBe('curve')
    expect(restricted.evaluate(-2, 0, 1)).toBeNaN()
    expect(restricted.evaluate(2, 0, 1)).toBe(4)

    const piecewise = compileGraph('y = {x < 0: -x, x >= 0: x^2}')
    expect(piecewise.evaluate(-3, 0, 1)).toBe(3)
    expect(piecewise.evaluate(2, 0, 1)).toBe(4)
    expect(() => compileGraph('y = {x < 0, x >= 0: x}')).toThrow('condition: expression')
  })
})
