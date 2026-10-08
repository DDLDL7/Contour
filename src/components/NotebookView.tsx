import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Calculator, Eye, FileText, FormInput, Plus, Trash2 } from 'lucide-react'
import { MathfieldElement } from 'mathlive'
import { EquationField } from './EquationField'
import { MathResult } from './MathResult'
import { runMathTool } from '../lib/mathTools'
import { replaceNotebookVariables, type NotebookCell, type NotebookOperation } from '../lib/notebook'
import type { ParameterRange, SliderParameter } from '../lib/parameters'
import type { ExpressionRow } from '../lib/project'

interface Props {
  cells: NotebookCell[]
  expressions: ExpressionRow[]
  definitions: Readonly<Record<string, number>>
  parameterA: number
  parameterARange: ParameterRange
  parameters: SliderParameter[]
  onChange: (cells: NotebookCell[], group?: string) => void
  onToggleExpression: (id: string, visible: boolean) => void
  onParameterValueChange: (name: string, value: number) => void
}

function InlineMath({ latex }: { latex: string }) {
  const host = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const field = new MathfieldElement()
    field.className = 'notebook-inline-math'
    field.readOnly = true
    field.mathVirtualKeyboardPolicy = 'manual'
    field.value = latex
    field.setAttribute('aria-label', latex)
    host.current?.appendChild(field)
    return () => field.remove()
  }, [latex])
  return <span ref={host} className="notebook-inline-host" />
}

function NotebookText({ content, values }: { content: string; values: Readonly<Record<string, number>> }) {
  const rendered = replaceNotebookVariables(content, values)
  return <div className="notebook-preview">{rendered.split(/(\$[^$\n]+\$)/g).map((part, index) => part.startsWith('$') && part.endsWith('$')
    ? <InlineMath key={index} latex={part.slice(1, -1)} />
    : <span key={index}>{part}</span>)}</div>
}

function NotebookCalculation({ cell, definitions, parameterA }: { cell: Extract<NotebookCell, { kind: 'calculation' }>; definitions: Readonly<Record<string, number>>; parameterA: number }) {
  const answer = useMemo(() => {
    if (!cell.expression.trim()) return null
    try { return { result: runMathTool(cell.operation, cell.expression, { a: parameterA, definitions }) } }
    catch (error) { return { error: error instanceof Error ? error.message : 'Could not calculate this expression.' } }
  }, [cell.expression, cell.operation, definitions, parameterA])
  if (!answer) return <p className="notebook-hint">Enter an expression to see its result.</p>
  if ('error' in answer) return <p className="notebook-error" role="status">{answer.error}</p>
  return <div className="notebook-answer" role="status"><MathResult value={answer.result!.value} />{answer.result!.note && <p>{answer.result!.note}</p>}</div>
}

function NotebookParameterInput({ cell, parameters, onValueChange }: { cell: Extract<NotebookCell, { kind: 'input' }>; parameters: SliderParameter[]; onValueChange: (name: string, value: number) => void }) {
  const parameter = parameters.find((item) => item.name === cell.parameterName)
  const [draft, setDraft] = useState(parameter ? String(parameter.value) : '')
  const [error, setError] = useState('')
  useEffect(() => { setDraft(parameter ? String(parameter.value) : '') }, [parameter?.name, parameter?.value])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(draft)
    if (!parameter || !draft.trim() || !Number.isFinite(value) || value < parameter.min || value > parameter.max) {
      setError(parameter ? `Enter a number from ${parameter.min} to ${parameter.max}.` : 'Choose an available parameter.')
      return
    }
    onValueChange(parameter.name, value)
    setError('')
  }

  return <form className="notebook-parameter-form" onSubmit={apply}>
    <label>{cell.label || 'Set parameter'}<input type="number" step="any" min={parameter?.min} max={parameter?.max} value={draft} disabled={!parameter} onChange={(event) => setDraft(event.target.value)} /></label>
    <button type="submit" disabled={!parameter}>Apply</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

export function NotebookView({ cells, expressions, definitions, parameterA, parameterARange, parameters, onChange, onToggleExpression, onParameterValueChange }: Props) {
  const values = useMemo(() => ({ a: parameterA, ...definitions }), [parameterA, definitions])
  const allParameters = useMemo(() => [{ name: 'a', value: parameterA, ...parameterARange }, ...parameters], [parameterA, parameterARange, parameters])
  const atLimit = cells.length >= 60

  function add(kind: NotebookCell['kind']) {
    if (atLimit) return
    const id = crypto.randomUUID()
    const next: NotebookCell = kind === 'text' ? { id, kind, content: '' }
      : kind === 'calculation' ? { id, kind, expression: '', operation: 'calculate' }
        : kind === 'visibility' ? { id, kind, label: 'Show graph', expressionId: expressions[0]?.id ?? '' }
          : { id, kind, label: 'Set parameter', parameterName: 'a' }
    onChange([...cells, next])
  }

  function update(id: string, change: Partial<NotebookCell>, grouped = false) {
    onChange(cells.map((cell) => cell.id === id ? { ...cell, ...change } as NotebookCell : cell), grouped ? `notebook:${id}` : undefined)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= cells.length) return
    const next = [...cells]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return <div className="notebook-view">
    <div className="notebook-heading"><div><span className="tools-overline">Study workspace</span><h2>Notebook</h2><p>Keep notes and calculations beside your graphs. Changes save with this project.</p></div></div>
    <div className="notebook-toolbar" aria-label="Add notebook cell">
      <button type="button" disabled={atLimit} onClick={() => add('text')}><FileText size={16} /> Add note</button>
      <button type="button" disabled={atLimit} onClick={() => add('calculation')}><Calculator size={16} /> Add calculation</button>
      <button type="button" disabled={atLimit} onClick={() => add('visibility')}><Eye size={16} /> Add graph checkbox</button>
      <button type="button" disabled={atLimit} onClick={() => add('input')}><FormInput size={16} /> Add input box</button>
    </div>
    {cells.length === 0 && <div className="notebook-empty"><FileText size={28} /><strong>Your notebook is blank</strong><p>Add a note, a live calculation, or a control for a graph or parameter.</p><button type="button" onClick={() => add('text')}><Plus size={16} /> Add first note</button></div>}
    <div className="notebook-cells">{cells.map((cell, index) => <section className="notebook-cell" key={cell.id} aria-label={`${cell.kind} cell ${index + 1}`}>
      <div className="notebook-cell-head"><span>{index + 1} · {cell.kind === 'text' ? 'Note' : cell.kind === 'calculation' ? 'Calculation' : cell.kind === 'visibility' ? 'Graph checkbox' : 'Input box'}</span><div>
        <button type="button" aria-label={`Move cell ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Move cell ${index + 1} down`} title="Move down" disabled={index === cells.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
        <button type="button" aria-label={`Remove cell ${index + 1}`} title="Remove cell" onClick={() => onChange(cells.filter((item) => item.id !== cell.id))}><Trash2 size={15} /></button>
      </div></div>
      {cell.kind === 'text' && <><textarea aria-label={`Note ${index + 1}`} maxLength={4000} rows={4} placeholder="Write a note. Use {{a}} for a live variable or $x^2$ for maths." value={cell.content} onChange={(event) => update(cell.id, { content: event.target.value }, true)} />{cell.content.trim() && <NotebookText content={cell.content} values={values} />}</>}
      {cell.kind === 'calculation' && <><label className="notebook-operation">Method<select value={cell.operation} onChange={(event) => update(cell.id, { operation: event.target.value as NotebookOperation })}><option value="calculate">Calculate</option><option value="simplify">Simplify</option><option value="differentiate">Differentiate with respect to x</option></select></label><div className="notebook-equation"><EquationField id={`notebook-${cell.id}`} label={`Calculation ${index + 1} expression`} value={cell.expression} latex={cell.latex} placeholder="2a + 3" onChange={(expression, latex) => update(cell.id, { expression, latex }, true)} /></div><NotebookCalculation cell={cell} definitions={definitions} parameterA={parameterA} /></>}
      {cell.kind === 'visibility' && <div className="notebook-visibility"><label>Label<input type="text" maxLength={120} value={cell.label} onChange={(event) => update(cell.id, { label: event.target.value }, true)} /></label><label>Graph<select value={cell.expressionId} onChange={(event) => update(cell.id, { expressionId: event.target.value })}><option value="">Choose an expression</option>{expressions.map((row, rowIndex) => <option key={row.id} value={row.id}>{rowIndex + 1}. {row.text || 'Empty expression'}</option>)}</select></label>{(() => { const linked = expressions.find((row) => row.id === cell.expressionId); return <label className="notebook-check"><input type="checkbox" checked={linked?.visible ?? false} disabled={!linked} onChange={(event) => { if (linked) onToggleExpression(linked.id, event.target.checked) }} />{cell.label || 'Show graph'}</label> })()}</div>}
      {cell.kind === 'input' && <div className="notebook-input-cell"><label>Label<input type="text" maxLength={120} value={cell.label} onChange={(event) => update(cell.id, { label: event.target.value }, true)} /></label><label>Parameter<select value={cell.parameterName} onChange={(event) => update(cell.id, { parameterName: event.target.value })}>{allParameters.map((parameter) => <option key={parameter.name} value={parameter.name}>{parameter.name}</option>)}{!allParameters.some((parameter) => parameter.name === cell.parameterName) && <option value={cell.parameterName}>Missing parameter {cell.parameterName}</option>}</select></label><NotebookParameterInput cell={cell} parameters={allParameters} onValueChange={onParameterValueChange} /></div>}
    </section>)}</div>
  </div>
}
