import { useState } from 'react'
import { EquationField } from './EquationField'
import { runMathTool, type MathTool, type ToolResult } from '../lib/mathTools'

interface Props { parameterA: number; definitions: Readonly<Record<string, number>> }

const tools: { id: MathTool; label: string; example: string; hint: string }[] = [
  { id: 'calculate', label: 'Calculate', example: 'sqrt(2) + 3/4', hint: 'Evaluate a real or complex expression.' },
  { id: 'simplify', label: 'Simplify', example: '2*x + 3*x', hint: 'Simplify an expression in x.' },
  { id: 'solve', label: 'Solve equation', example: 'x^2 - 5*x + 6 = 0', hint: 'Solve a linear or quadratic equation in x.' },
  { id: 'differentiate', label: 'Differentiate', example: 'x^3 + sin(x)', hint: 'Find a symbolic derivative with respect to x.' },
  { id: 'integrate', label: 'Integrate', example: 'sin(x)', hint: 'Approximate a definite integral between two bounds.' },
  { id: 'limit', label: 'Limit', example: 'sin(x)/x', hint: 'Probe a limit numerically from both sides.' },
  { id: 'matrix', label: 'Matrix', example: '1, 2; 3, 4', hint: 'Find the determinant and inverse of a 2×2 to 4×4 matrix.' },
  { id: 'statistics', label: 'Statistics', example: '2, 4, 4, 6, 9', hint: 'Summarise a list of observations.' },
  { id: 'regression', label: 'Regression', example: '1, 2; 2, 3; 3, 5', hint: 'Fit a least-squares line to x,y pairs.' },
  { id: 'ode', label: 'ODE', example: 'x + y', hint: 'Solve dy/dx = f(x,y) from an initial value.' },
]

export function MathTools({ parameterA, definitions }: Props) {
  const [tool, setTool] = useState<MathTool>('calculate')
  const [input, setInput] = useState(tools[0].example)
  const [latex, setLatex] = useState<string | undefined>()
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('1')
  const [initialY, setInitialY] = useState('1')
  const [result, setResult] = useState<ToolResult | null>(null)
  const [error, setError] = useState('')
  const selected = tools.find((item) => item.id === tool)!
  const dataset = tool === 'matrix' || tool === 'statistics' || tool === 'regression'

  function selectTool(next: MathTool) {
    setTool(next)
    setInput(tools.find((item) => item.id === next)!.example)
    setLatex(undefined)
    setResult(null)
    setError('')
  }

  function calculate() {
    const value = (text: string) => text.trim() ? Number(text) : undefined
    try {
      setResult(runMathTool(tool, input, {
        a: parameterA,
        definitions,
        start: value(start),
        end: value(end),
        initialY: value(initialY),
      }))
      setError('')
    } catch (cause) {
      setResult(null)
      setError(cause instanceof Error ? cause.message : 'Could not calculate this input.')
    }
  }

  return (
    <div className="math-tools-view">
      <div className="math-tools-intro">
        <span className="tools-overline">Maths tools</span>
        <h2>Work through a calculation</h2>
        <p>Choose a method, enter your expression, and inspect the result. The current value of <em>a</em> and any valid variables in your workspace are available in formulas.</p>
      </div>
      <div className="math-tools-grid">
        <nav className="math-tool-list" aria-label="Maths operations">
          {tools.map((item) => <button key={item.id} type="button" className={tool === item.id ? 'active' : ''} aria-current={tool === item.id ? 'page' : undefined} onClick={() => selectTool(item.id)}>{item.label}</button>)}
        </nav>
        <section className="math-tool-card" aria-label={selected.label}>
          <h3>{selected.label}</h3>
          <p>{selected.hint}</p>
          <label className="math-tool-label" htmlFor={dataset ? 'math-tool-data' : undefined}>{dataset ? 'Values' : tool === 'ode' ? 'dy/dx =' : 'Expression'}</label>
          {dataset
            ? <textarea id="math-tool-data" className="math-tool-data" value={input} onChange={(event) => setInput(event.target.value)} rows={4} spellCheck={false} />
            : <div className="math-tool-equation"><EquationField key={tool} id={`math-tool-${tool}`} label={`${selected.label} expression`} value={input} latex={latex} placeholder={selected.example} onChange={(value, nextLatex) => { setInput(value); setLatex(nextLatex) }} /></div>}
          {(tool === 'integrate' || tool === 'limit' || tool === 'ode') && (
            <div className="math-tool-options">
              <label>{tool === 'limit' ? 'Approach x' : tool === 'ode' ? 'Initial x' : 'Lower bound'}<input type="number" value={start} onChange={(event) => setStart(event.target.value)} /></label>
              {tool !== 'limit' && <label>{tool === 'ode' ? 'Final x' : 'Upper bound'}<input type="number" value={end} onChange={(event) => setEnd(event.target.value)} /></label>}
              {tool === 'ode' && <label>Initial y<input type="number" value={initialY} onChange={(event) => setInitialY(event.target.value)} /></label>}
            </div>
          )}
          <button className="math-tool-run" type="button" onClick={calculate}>Calculate result</button>
          {error && <p className="math-tool-error" role="alert">{error}</p>}
          {result && <div className="math-tool-result" role="status"><span>{result.title}</span><pre>{result.value}</pre>{result.note && <p>{result.note}</p>}</div>}
        </section>
      </div>
    </div>
  )
}
