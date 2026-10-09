import { graphColors, type Project } from './project'
import { activeSpreadsheetSheet, spreadsheetSheets } from './spreadsheet'
import type { NotebookCell } from './notebook'

export type ActivityTemplate = 'parameter' | 'data'
export const activityTemplates: { id: ActivityTemplate; label: string; cells: number }[] = [
  { id: 'parameter', label: 'Explore a quadratic', cells: 5 },
  { id: 'data', label: 'Build a data model', cells: 4 },
]

/** Append one linked activity as a single undoable edit; existing work is preserved. */
export function appendActivity(project: Project, template: ActivityTemplate): Project {
  const description = activityTemplates.find((item) => item.id === template)
  if (!description || project.notebook.length + description.cells > 60) return project
  if (template === 'data' && spreadsheetSheets(project.spreadsheet).length >= 20) return project
  const expressionId = crypto.randomUUID()
  const cell = (value: Omit<Extract<NotebookCell, { kind: 'text' }>, 'id'>): NotebookCell => ({ id: crypto.randomUUID(), ...value })
  const graph: NotebookCell = { id: crypto.randomUUID(), kind: 'graph', expressionId }
  let notebook: NotebookCell[]
  let spreadsheet = project.spreadsheet
  if (template === 'parameter') {
    notebook = [
      cell({ kind: 'text', content: 'Explore y = ax²\nPredict how the curve changes when a is positive, zero or negative. The current value is {{a}}. Choose values within your parameter range.' }),
      { id: crypto.randomUUID(), kind: 'input', label: 'Choose a', parameterName: 'a' },
      graph,
      { id: crypto.randomUUID(), kind: 'calculation', operation: 'differentiate', expression: 'a*x^2' },
      cell({ kind: 'text', content: 'Explain your result\nHow does the derivative describe the slope on either side of x = 0? What changes when a = 0? Write your observations here.' }),
    ]
  } else {
    const sheets = spreadsheetSheets(spreadsheet)
    const active = activeSpreadsheetSheet(spreadsheet)
    const sheetId = crypto.randomUUID()
    let name = 'Activity data'; let suffix = 2
    while (sheets.some((sheet) => sheet.name.toLowerCase() === name.toLowerCase())) name = `Activity data ${suffix++}`
    spreadsheet = { ...spreadsheet, cells: active.cells, activeSheetId: active.id, sheets: [...sheets, { id: sheetId, name, cells: { A1: 'x', B1: 'y', A2: '0', B2: '=a*A2+1', A3: '1', B3: '=a*A3+1', A4: '2', B4: '=a*A4+1', A5: '3', B5: '=a*A5+1' } }] }
    notebook = [
      cell({ kind: 'text', content: 'Build a data model\nThis example uses y = ax + 1. Edit column A or parameter a and watch the formulas in column B update. The new sheet is separate from your existing data.' }),
      { id: crypto.randomUUID(), kind: 'table', sheetId },
      graph,
      cell({ kind: 'text', content: 'Compare and explain\nDo the calculated pairs lie on the line? Change a formula or edit the linked equation, then explain when the table and graph agree.' }),
    ]
  }
  return { ...project, spreadsheet, expressions: [...project.expressions, { id: expressionId, text: template === 'parameter' ? 'y = a*x^2' : 'y = a*x+1', visible: true, color: graphColors[project.expressions.length % graphColors.length] }], notebook: [...project.notebook, ...notebook] }
}
