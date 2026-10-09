import { describe, expect, it } from 'vitest'
import { appendActivity } from './activities'
import { parseProjectFile, starterProject } from './project'
import { evaluateSpreadsheet, spreadsheetSheets } from './spreadsheet'
import { createHistory, recordHistory, redoHistory, undoHistory } from './history'

describe('activity starters', () => {
  it('appends linked cells, preserves existing work and round-trips through a project file', () => {
    const project = starterProject()
    project.parameterA = -2
    project.notebook = [{ id: 'own-note', kind: 'text', content: 'My observations' }]
    const next = appendActivity(project, 'parameter')
    expect(next.notebook).toHaveLength(6)
    expect(next.notebook[0]).toEqual(project.notebook[0])
    expect(next.parameterA).toBe(-2)
    expect(next.notebook.find((cell) => cell.kind === 'graph')).toMatchObject({ expressionId: next.expressions[0].id })
    expect(parseProjectFile(JSON.stringify(next))).toMatchObject({ notebook: next.notebook, expressions: next.expressions })
    const history = recordHistory(createHistory(project), next)
    expect(undoHistory(history).present).toBe(project)
    expect(redoHistory(undoHistory(history)).present).toBe(next)
  })

  it('creates separate data sheets with unique names and live formulas without changing active graph links', () => {
    const project = starterProject()
    project.spreadsheet.cells = { A2: '99' }
    const next = appendActivity(appendActivity(project, 'data'), 'data')
    const sheets = spreadsheetSheets(next.spreadsheet)
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Sheet 1', 'Activity data', 'Activity data 2'])
    expect(next.spreadsheet.activeSheetId).toBe('sheet-1')
    expect(next.spreadsheet.cells).toEqual(project.spreadsheet.cells)
    expect(evaluateSpreadsheet(next.spreadsheet, {}, 3, sheets[1].id).B4.value).toBe(7)
    expect(new Set(next.notebook.map((cell) => cell.id)).size).toBe(next.notebook.length)
  })

  it('does not partially append an activity past the notebook or sheet limits', () => {
    const project = starterProject()
    project.notebook = Array.from({ length: 57 }, (_, i) => ({ id: `note-${i}`, kind: 'text', content: '' }))
    expect(appendActivity(project, 'parameter')).toBe(project)
    expect(appendActivity(project, 'data')).toBe(project)
    project.notebook = []
    project.spreadsheet.sheets = Array.from({ length: 20 }, (_, i) => ({ id: `sheet-${i}`, name: `Sheet ${i}`, cells: {} }))
    expect(appendActivity(project, 'data')).toBe(project)
  })
})
