import { describe, expect, it } from 'vitest'
import { runMathTool } from './mathTools'

describe('maths tools', () => {
  const options = { a: 2, start: 0, end: 1, initialY: 1 }

  it('calculates real and complex expressions through the restricted grammar', () => {
    expect(Number(runMathTool('calculate', 'sqrt(2)+3/4', options).value)).toBeCloseTo(Math.sqrt(2) + 0.75)
    expect(runMathTool('calculate', '2+3i', options).value).toContain('i')
    expect(() => runMathTool('calculate', 'import("x")', options)).toThrow()
    expect(Number(runMathTool('calculate', 'b+1', { ...options, definitions: { b: 4 } }).value)).toBe(5)
  })

  it('simplifies, differentiates, integrates, and probes a limit', () => {
    expect(runMathTool('simplify', '2*x+3*x', options).value).toContain('5')
    expect(runMathTool('differentiate', 'x^3', options).value).toContain('x ^ 2')
    expect(Number(runMathTool('integrate', 'x^2', options).value.replace('≈ ', ''))).toBeCloseTo(1 / 3, 8)
    expect(Number(runMathTool('limit', 'sin(x)/x', options).value.replace('≈ ', ''))).toBeCloseTo(1, 4)
  })

  it('solves linear and quadratic equations without fitting a non-polynomial curve', () => {
    expect(runMathTool('solve', 'x^2-5*x+6=0', options).value).toBe('x₁ = 2\nx₂ = 3')
    expect(runMathTool('solve', '2*x+4=0', options).value).toBe('x = -2')
    expect(runMathTool('solve', 'b*x-8=0', { ...options, definitions: { b: 4 } }).value).toBe('x = 2')
    expect(runMathTool('solve', 'x^2+1=0', options).value).toContain('i')
    expect(() => runMathTool('solve', 'x^3-1=0', options)).toThrow('degree two')
    expect(() => runMathTool('solve', 'sin(x)=0', options)).toThrow('degree two')
  })

  it('handles singular matrices, summary statistics, regression, and an ODE', () => {
    expect(runMathTool('matrix', '1, 2; 3, 4', options).value).toContain('det = -2')
    expect(runMathTool('matrix', '1, 2; 2, 4', options).note).toContain('Singular')
    expect(runMathTool('statistics', '2, 4, 4, 6', options).value).toContain('mean = 4')
    expect(runMathTool('regression', '1, 2; 2, 4; 3, 6', options).value).toContain('R² = 1')
    expect(Number(runMathTool('ode', 'y', options).value.split('≈ ')[1])).toBeCloseTo(Math.E, 8)
  })
})
