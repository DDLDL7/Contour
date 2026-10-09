import { useId, useMemo, useState, type FormEvent } from 'react'
import { EquationField } from './EquationField'
import { compileGraph } from '../lib/math'
import { areNotebookGraphBounds, defaultNotebookGraphBounds, type NotebookCell, type NotebookGraphBounds } from '../lib/notebook'
import { notebookGraphPaths } from '../lib/notebookGraph'
import type { ExpressionRow } from '../lib/project'
import { evaluateSpreadsheet, spreadsheetColumns, spreadsheetSheets, type SpreadsheetData } from '../lib/spreadsheet'

export function NotebookGraphCell({ cell, expressions, definitions, parameterA, onLink, onBounds, onExpressionChange, onCreateExpression, onToggleExpression }: {
  cell: Extract<NotebookCell, { kind: 'graph' }>
  expressions: ExpressionRow[]
  definitions: Readonly<Record<string, number>>
  parameterA: number
  onLink: (id: string) => void
  onBounds: (bounds: NotebookGraphBounds) => void
  onExpressionChange: (id: string, text: string, latex?: string) => void
  onCreateExpression: () => void
  onToggleExpression: (id: string, visible: boolean) => void
}) {
  const row = expressions.find((item) => item.id === cell.expressionId)
  const bounds = cell.bounds ?? defaultNotebookGraphBounds
  const preview = useMemo(() => {
    if (!row) return null
    try { return { paths: notebookGraphPaths(compileGraph(row.text, definitions), bounds, parameterA) } }
    catch (error) { return { error: error instanceof Error ? error.message : 'Could not preview this expression.' } }
  }, [row, definitions, bounds, parameterA])
  const sx = (x: number) => (x - bounds.minX) / (bounds.maxX - bounds.minX) * 640
  const sy = (y: number) => (bounds.maxY - y) / (bounds.maxY - bounds.minY) * 280
  return <div className="notebook-linked-graph">
    <label>Linked expression<select value={cell.expressionId} onChange={(event) => onLink(event.target.value)}><option value="">Choose an expression</option>{cell.expressionId && !row && <option value={cell.expressionId}>Missing expression</option>}{expressions.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.text || 'Empty expression'}</option>)}</select></label>
    <button type="button" className="notebook-action-button" onClick={onCreateExpression}>Create linked equation</button>
    {row ? <>
      <div className="notebook-equation"><EquationField id={`graph-cell-${cell.id}`} label="Linked graph equation" placeholder="y = x^2" value={row.text} latex={row.latex} onChange={(text, latex) => onExpressionChange(row.id, text, latex)} /></div>
      <p className="notebook-hint">Editing this equation updates every view linked to it.</p>
      <GraphBoundsEditor key={`${cell.id}:${JSON.stringify(bounds)}`} bounds={bounds} onChange={onBounds} />
      {preview && 'error' in preview ? <p className="notebook-error" role="status">{preview.error}</p> : <>
        <svg className="notebook-graph-preview" viewBox="0 0 640 280" role="img" aria-label={`Graph of ${row.text}, x from ${bounds.minX} to ${bounds.maxX}, y from ${bounds.minY} to ${bounds.maxY}`}>
          {bounds.minY <= 0 && bounds.maxY >= 0 && <path d={`M0,${sy(0)}H640`} className="notebook-graph-axis" />}
          {bounds.minX <= 0 && bounds.maxX >= 0 && <path d={`M${sx(0)},0V280`} className="notebook-graph-axis" />}
          {preview?.paths?.map((path, index) => <path key={index} d={path} className="notebook-graph-line" />)}
          <text x="8" y="270" className="chart-label">{bounds.minX}</text><text x="632" y="270" textAnchor="end" className="chart-label">{bounds.maxX}</text>
        </svg>
        <p className="notebook-hint">Sampled preview{preview?.paths?.length === 0 ? ': no curve samples in this window' : ''}. Polar and parametric previews use 0 ≤ t, θ ≤ 2π; small features may be missed.</p>
      </>}
      <label className="notebook-check"><input type="checkbox" checked={row.visible} onChange={(event) => onToggleExpression(row.id, event.target.checked)} />Show in graph workspace</label>
    </> : <p className="notebook-hint">{cell.expressionId ? 'The linked expression was removed. Choose another or create an equation.' : 'Choose an expression or create an equation to begin.'}</p>}
  </div>
}

function GraphBoundsEditor({ bounds, onChange }: { bounds: NotebookGraphBounds; onChange: (bounds: NotebookGraphBounds) => void }) {
  const [draft, setDraft] = useState(Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])))
  const [error, setError] = useState('')
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() ? Number(value) : Number.NaN]))
    if (!areNotebookGraphBounds(next)) { setError('Enter increasing bounds between −1,000,000 and 1,000,000, with a span of at least 0.000001.'); return }
    onChange(next); setError('')
  }
  return <form className="notebook-bounds" onSubmit={apply}>
    {Object.entries({ minX: 'x minimum', maxX: 'x maximum', minY: 'y minimum', maxY: 'y maximum' }).map(([key, label]) => <label key={key}>{label}<input type="number" step="any" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
    <button type="submit" className="notebook-action-button">Apply window</button>{error && <p className="notebook-error" role="alert">{error}</p>}
  </form>
}

export function NotebookTableCell({ cell, spreadsheet, definitions, parameterA, onLink, onRows, onCellChange }: {
  cell: Extract<NotebookCell, { kind: 'table' }>
  spreadsheet: SpreadsheetData
  definitions: Readonly<Record<string, number>>
  parameterA: number
  onLink: (id: string) => void
  onRows: (rows: number) => void
  onCellChange: (sheetId: string, address: string, raw: string) => void
}) {
  const sheet = spreadsheetSheets(spreadsheet).find((item) => item.id === cell.sheetId)
  const [editing, setEditing] = useState(false)
  const helpId = useId()
  const values = useMemo(() => sheet ? evaluateSpreadsheet(spreadsheet, definitions, parameterA, sheet.id) : {}, [spreadsheet, definitions, parameterA, sheet])
  return <div className="notebook-linked-table">
    <label>Linked spreadsheet<select value={cell.sheetId} onChange={(event) => onLink(event.target.value)}>{!sheet && <option value={cell.sheetId}>Missing spreadsheet</option>}{spreadsheetSheets(spreadsheet).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {sheet ? <>
      <label>Visible rows<select value={cell.rows ?? 6} onChange={(event) => onRows(Number(event.target.value))}>{Array.from({ length: 18 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
      <label className="notebook-check"><input type="checkbox" checked={editing} onChange={(event) => setEditing(event.target.checked)} />Edit linked cells</label>
      <p id={helpId} className="notebook-hint">Changes update the spreadsheet and its dependants. Formulas start with =, for example =a*A2. Turn off editing to read evaluated values.</p>
      <div className="notebook-table-scroll"><table><caption>{sheet.name}{editing ? ' · Editing formulas and values' : ' · Evaluated values'}</caption><thead><tr><th scope="col">#</th>{spreadsheetColumns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{Array.from({ length: cell.rows ?? 6 }, (_, rowIndex) => <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{spreadsheetColumns.map((column) => {
        const address = `${column}${rowIndex + 1}`; const value = values[address]
        return <td key={column} title={value?.error ?? sheet.cells[address] ?? ''}>{editing ? <><input aria-label={`${sheet.name} ${address}`} aria-describedby={helpId} aria-invalid={Boolean(value?.error)} maxLength={500} value={sheet.cells[address] ?? ''} onChange={(event) => onCellChange(sheet.id, address, event.target.value)} />{value?.error && <span className="notebook-error">{value.error}</span>}</> : value?.error ? <span className="notebook-error">{value.error}</span> : value?.value === null || value?.value === undefined ? sheet.cells[address] ?? '' : Number(value.value.toPrecision(8))}</td>
      })}</tr>)}</tbody></table></div>
    </> : <p className="notebook-error" role="status">The linked spreadsheet was removed. Choose another sheet.</p>}
  </div>
}
