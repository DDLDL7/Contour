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

  it('finds approximate roots of non-polynomial equations on a selected interval', () => {
    const result = runMathTool('solve-numeric', 'sin(x) = 0', { ...options, start: 3, end: 4 })
    expect(Number(result.value.split('≈ ')[1])).toBeCloseTo(Math.PI, 8)
    expect(result.note).toContain('refinement of even-root valleys')
  })

  it('handles singular matrices, summary statistics, regression, and an ODE', () => {
    expect(runMathTool('matrix', '1, 2; 3, 4', options).value).toContain('det = -2')
    expect(runMathTool('matrix', '1, 2; 2, 4', options).note).toContain('Singular')
    expect(runMathTool('statistics', '2, 4, 4, 6', options).value).toContain('mean = 4')
    expect(runMathTool('regression', '1, 2; 2, 4; 3, 6', options).value).toContain('R² = 1')
    expect(Number(runMathTool('ode', 'y', options).value.split('≈ ')[1])).toBeCloseTo(Math.E, 8)
  })

  it('supports partial derivatives and local Taylor polynomials', () => {
    expect(runMathTool('partial', 'x^2*y + sin(y*z)', { ...options, variable: 'y' }).value).toContain('x ^ 2')
    expect(runMathTool('taylor', 'sin(x)', { ...options, center: 0, order: 3 }).value).toContain('0.166666')
  })

  it('computes symbolic gradients and Hessian matrices in x, y, z order', () => {
    expect(runMathTool('gradient', 'x^2 + y^2 + z^2', options).value).toContain('∇f = [2 * x, 2 * y, 2 * z]')
    const hessian = runMathTool('hessian', 'x^2 + y^2 + z^2', options).value
    expect(hessian).toContain('[2, 0, 0]')
    expect(hessian).toContain('[0, 2, 0]')
    expect(hessian).toContain('[0, 0, 2]')
  })

  it('integrates common symbolic forms and clearly rejects unsupported forms', () => {
    const integral = runMathTool('symbolic-integrate', 'x^3+cos(x)', options).value
    expect(integral).toContain('x ^ 4')
    expect(integral).toContain('sin(x)')
    expect(integral).toContain('+ C')
    expect(runMathTool('symbolic-integrate', 'sin(2*x)', options).value).toContain('cos(2 * x)')
    expect(runMathTool('symbolic-integrate', 'exp(3*x+1)', options).value).toContain('exp(3 * x + 1)')
    expect(() => runMathTool('symbolic-integrate', 'sin(x^2)', options)).toThrow(/No symbolic antiderivative rule/)
  })

  it('uses direct substitution and l’Hôpital reduction for supported quotient limits', () => {
    expect(runMathTool('limit', '(x^2-1)/(x-1)', { ...options, start: 1 })).toMatchObject({ title: 'Limit (l’Hôpital reduction)', value: '2' })
  })

  it('uses explicit sign and nonzero assumptions for safe simplifications', () => {
    expect(runMathTool('simplify', 'sqrt(x^2)', { ...options, assumption: 'positive' }).value).toBe('x')
    expect(runMathTool('simplify', 'abs(x)', { ...options, assumption: 'negative' }).value).toBe('-x')
    expect(runMathTool('simplify', 'x/x', { ...options, assumption: 'nonzero' }).value).toBe('1')
    expect(runMathTool('simplify', 'x/x', { ...options, assumption: 'nonnegative' }).value).not.toBe('1')
    expect(runMathTool('simplify', 'sqrt(x^2)', options).value).not.toBe('x')
  })

  it('does not report a pole as a numerical root', () => {
    expect(runMathTool('solve-numeric', 'tan(x) = 0', { ...options, start: 1.4, end: 1.8 }).value).toContain('No isolated real roots')
  })

  it('expands, factors, and substitutes supported symbolic expressions', () => {
    expect(runMathTool('expand', '(x+2)*(x-3)', options).value).toContain('x ^ 2')
    expect(runMathTool('factor', 'x^2-5*x+6', options).value).toContain('(x − 2)(x − 3)')
    expect(runMathTool('substitute', 'x^2+2*x+1', { ...options, substitutionVariable: 'x', replacement: '3' }).value).toContain('16')
  })

  it('performs matrix arithmetic, linear solves, and eigenvalue calculations', () => {
    expect(runMathTool('matrix-algebra', '1,2;3,4 | 5,6;7,8', { ...options, matrixOperation: 'add' }).value).toBe('[6, 8]\n[10, 12]')
    expect(runMathTool('matrix-algebra', '1,2;3,4 | 5,6;7,8', { ...options, matrixOperation: 'multiply' }).value).toBe('[19, 22]\n[43, 50]')
    expect(runMathTool('matrix-algebra', '1,2;3,4', { ...options, matrixOperation: 'transpose' }).value).toBe('[1, 3]\n[2, 4]')
    expect(runMathTool('matrix-algebra', '1,2;3,4', { ...options, matrixOperation: 'inverse' }).value).toContain('[-2, 1]')
    expect(runMathTool('matrix-algebra', '2,1;1,-1 | 5;1', { ...options, matrixOperation: 'solve' }).value).toBe('x1 = 2\nx2 = 1')
    expect(runMathTool('matrix-algebra', '2,1;1,2', { ...options, matrixOperation: 'eigenvalues' }).value).toContain('λ1 = 1')
    expect(runMathTool('matrix-algebra', '2,1;1,2', { ...options, matrixOperation: 'eigenvectors' }).value).toContain('v1 =')
  })
})
