import { describe, expect, it } from 'vitest'
import { compileWorkspace } from './workspace'
import type { ExpressionRow } from './project'

function rows(...expressions: string[]): ExpressionRow[] {
  return expressions.map((text, index) => ({ id: `${index}`, text, color: '#286fc0', visible: true }))
}

describe('shared workspace variables', () => {
  it('resolves definitions in any row order and updates their graphs with a', () => {
    const input = rows('y = c*sin(x)', 'c = b + 1', 'b = 2a', 'z = c*x + y')
    const first = compileWorkspace(input, 2)
    const second = compileWorkspace(input, 3)

    expect(first[0].graph?.evaluate(Math.PI / 2, 0, 2)).toBeCloseTo(5)
    expect(first[1].definition).toEqual({ name: 'c', value: 5 })
    expect(first[2].definition).toEqual({ name: 'b', value: 4 })
    expect(first[3].graph?.evaluate(1, 2, 2)).toBe(7)
    expect(second[0].graph?.evaluate(Math.PI / 2, 0, 3)).toBeCloseTo(7)
  })

  it('rejects cycles, duplicate names, reserved names, and invalid dependencies', () => {
    const cycle = compileWorkspace(rows('b = c + 1', 'c = b + 1', 'y = b*x'), 1)
    expect(cycle[0].error).toContain('Circular definition')
    expect(cycle[1].error).toContain('Circular definition')
    expect(cycle[2].error).toContain('Fix the definition')

    const duplicate = compileWorkspace(rows('b = 2', 'b = 3', 'a = 4', 'y = b*x'), 1)
    expect(duplicate[0].error).toContain('more than once')
    expect(duplicate[1].error).toContain('more than once')
    expect(duplicate[2].error).toContain('slider')
    expect(duplicate[3].error).toContain('Fix the definition')
  })

  it('allows graph-specific coordinates but not coordinates in scalar definitions', () => {
    const compiled = compileWorkspace(rows('b = x + 1', 'y = b*x', 'y = sin(x)'), 2)
    expect(compiled[0].error).toContain('Unknown symbol')
    expect(compiled[1].error).toContain('Fix the definition')
    expect(compiled[2].graph?.evaluate(Math.PI / 2, 0, 2)).toBeCloseTo(1)
  })
})
