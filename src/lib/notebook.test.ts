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

  it('validates saved graph windows, editable table ranges and fixed actions', () => {
    const graph = { id: 'graph-cell', kind: 'graph', expressionId: 'graph-1', bounds: { minX: -2, maxX: 2, minY: -5, maxY: 5 } }
    const table = { id: 'table-cell', kind: 'table', sheetId: 'sheet-1', rows: 18 }
    const action = { id: 'button', kind: 'action', label: 'Set a', action: 'set-parameter', expressionId: '', parameterName: 'a', value: 2 }
    expect(areNotebookCells([graph, table, action])).toBe(true)
    expect(areNotebookCells([{ ...graph, bounds: { ...graph.bounds, maxX: -2 } }])).toBe(false)
    expect(areNotebookCells([{ ...graph, bounds: { ...graph.bounds, minY: Number.NaN } }])).toBe(false)
    expect(areNotebookCells([{ ...table, rows: 19 }])).toBe(false)
    expect(areNotebookCells([{ ...action, action: 'eval' }])).toBe(false)
  })
})
