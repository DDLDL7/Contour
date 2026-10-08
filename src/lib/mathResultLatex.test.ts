import { describe, expect, it } from 'vitest'
import { mathResultLatex } from './mathResultLatex'

describe('math tool result typesetting', () => {
  it('typesets symbolic expressions and indexed roots', () => {
    expect(mathResultLatex('3 * x ^ 2')?.[0]).toContain('x^{2}')
    expect(mathResultLatex('x₁ = 2\nx₂ = 3')).toEqual(['x_{1}=2', 'x_{2}=3'])
  })

  it('typesets actual matrices and vectors instead of bracketed text', () => {
    expect(mathResultLatex('[6, 8]\n[10, 12]')?.[0]).toContain(String.raw`\begin{bmatrix}6 & 8 \\ 10 & 12\end{bmatrix}`)
    expect(mathResultLatex('∇f = [2 * x, 2 * y, 2 * z]')?.[0]).toContain(String.raw`\nabla f = \left\langle`)
    expect(mathResultLatex('det = -2\nA⁻¹ = [-2, 1]\n       [1.5, -0.5]')?.[1]).toContain(String.raw`A^{-1} = \begin{bmatrix}`)
  })

  it('leaves non-mathematical outcomes as readable text', () => {
    expect(mathResultLatex('No solution.')).toBeNull()
    expect(mathResultLatex('No common finite limit detected')).toBeNull()
  })
})
