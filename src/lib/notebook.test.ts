import { describe, expect, it } from 'vitest'
import { areNotebookCells, replaceNotebookVariables } from './notebook'

describe('saved notebook cells', () => {
  it('accepts notes, calculations, and graph and parameter controls but rejects duplicate IDs', () => {
    const cells = [
      { id: 'note-1', kind: 'text', content: 'Angle $\\theta$ is {{a}}' },
      { id: 'calc-1', kind: 'calculation', expression: '2*a+1', operation: 'calculate' },
      { id: 'show-1', kind: 'visibility', label: 'Show curve', expressionId: 'graph-1' },
      { id: 'input-1', kind: 'input', label: 'Set a', parameterName: 'a' },
    ]
    expect(areNotebookCells(cells)).toBe(true)
    expect(areNotebookCells([...cells, { ...cells[0] }])).toBe(false)
    expect(areNotebookCells([{ ...cells[1], operation: 'run-script' }])).toBe(false)
    expect(areNotebookCells([{ ...cells[3], parameterName: 'abc' }])).toBe(false)
  })

  it('substitutes only known finite one-letter values in notes', () => {
    expect(replaceNotebookVariables('a={{a}}, b={{b}}, q={{q}}', { a: 2.5, b: Number.NaN })).toBe('a=2.5, b={{b}}, q={{q}}')
  })
})
