export type NotebookOperation = 'calculate' | 'simplify' | 'differentiate'

export type NotebookCell =
  | { id: string; kind: 'text'; content: string }
  | { id: string; kind: 'calculation'; expression: string; latex?: string; operation: NotebookOperation }
  | { id: string; kind: 'visibility'; label: string; expressionId: string }
  | { id: string; kind: 'input'; label: string; parameterName: string }
  | { id: string; kind: 'graph'; expressionId: string }
  | { id: string; kind: 'table'; sheetId: string }
  | { id: string; kind: 'action'; label: string; action: 'toggle-expression' | 'set-parameter'; expressionId: string; parameterName: string; value: number }

export function areNotebookCells(value: unknown): value is NotebookCell[] {
  if (!Array.isArray(value) || value.length > 60) return false
  const ids = new Set<string>()
  return value.every((cell) => {
    if (!cell || typeof cell !== 'object') return false
    const item = cell as Partial<NotebookCell>
    if (typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) return false
    ids.add(item.id)
    if (item.kind === 'text') return typeof item.content === 'string' && item.content.length <= 4000
    if (item.kind === 'calculation') return typeof item.expression === 'string' && item.expression.length <= 1000
      && (item.latex === undefined || (typeof item.latex === 'string' && item.latex.length <= 2000))
      && typeof item.operation === 'string' && ['calculate', 'simplify', 'differentiate'].includes(item.operation)
    if (item.kind === 'visibility') return typeof item.label === 'string' && item.label.length <= 120
      && typeof item.expressionId === 'string' && item.expressionId.length <= 80
    if (item.kind === 'input') return typeof item.label === 'string' && item.label.length <= 120
      && typeof item.parameterName === 'string' && /^[a-z]$/.test(item.parameterName)
    if (item.kind === 'graph') return typeof item.expressionId === 'string' && item.expressionId.length <= 80
    if (item.kind === 'table') return typeof item.sheetId === 'string' && /^[\w-]{1,40}$/.test(item.sheetId)
    if (item.kind === 'action') return typeof item.label === 'string' && item.label.length <= 120
      && typeof item.action === 'string' && ['toggle-expression', 'set-parameter'].includes(item.action)
      && typeof item.expressionId === 'string' && item.expressionId.length <= 80
      && typeof item.parameterName === 'string' && /^[a-z]$/.test(item.parameterName)
      && Number.isFinite(item.value)
    return false
  })
}

export function replaceNotebookVariables(content: string, values: Readonly<Record<string, number>>): string {
  return content.replace(/\{\{([a-z])\}\}/g, (match, name: string) =>
    Object.hasOwn(values, name) && Number.isFinite(values[name]) ? Number(values[name].toPrecision(8)).toString() : match)
}
