import { useToolDraft } from './ToolDrafts'
import { ArrowRight, Blocks, Braces, Calculator, ChartArea, ChartScatter, ChartSpline, Equal, Expand, Grid2X2, Grid3X3, Hourglass, ListFilter, Replace, Sigma, SquareFunction, Target, TrendingUp, Variable, Waypoints, type LucideIcon } from 'lucide-react'
import { EquationField } from './EquationField'
import { MathResult } from './MathResult'
import { runMathTool, type MathTool, type MatrixOperation, type ToolResult } from '../lib/mathTools'

interface Props { parameterA: number; definitions: Readonly<Record<string, number>> }

type ToolGroup = 'algebra' | 'calculus' | 'data'
export const numericTools: { id: MathTool; label: string; example: string; hint: string; group: ToolGroup; icon: LucideIcon }[] = [
  { id: 'calculate', label: 'Calculate', example: 'sqrt(2) + 3/4', hint: 'Evaluate a real or complex expression.', group: 'algebra', icon: Calculator },
  { id: 'simplify', label: 'Simplify', example: '2*x + 3*x', hint: 'Simplify an expression in x.', group: 'algebra', icon: ListFilter },
  { id: 'expand', label: 'Expand', example: '(x + 2)*(x - 3)', hint: 'Distribute products and integer powers over sums.', group: 'algebra', icon: Expand },
  { id: 'factor', label: 'Factor', example: 'x^2 - 5*x + 6', hint: 'Factor a numeric polynomial of degree two or less.', group: 'algebra', icon: Braces },
  { id: 'substitute', label: 'Substitute', example: 'x^2 + 2*x + 1', hint: 'Replace a variable with another supported expression.', group: 'algebra', icon: Replace },
  { id: 'solve', label: 'Solve equation', example: 'x^2 - 5*x + 6 = 0', hint: 'Solve a linear or quadratic equation in x.', group: 'algebra', icon: Equal },
  { id: 'solve-numeric', label: 'Numerical roots', example: 'sin(x) = 0', hint: 'Search for real roots of polynomial or non-polynomial equations within a chosen interval.', group: 'algebra', icon: Target },
  { id: 'differentiate', label: 'Differentiate', example: 'x^3 + sin(x)', hint: 'Find a symbolic derivative with respect to x.', group: 'calculus', icon: ChartSpline },
  { id: 'partial', label: 'Partial derivative', example: 'x^2*y + sin(y*z)', hint: 'Differentiate an expression with respect to one chosen variable.', group: 'calculus', icon: Variable },
  { id: 'gradient', label: 'Gradient', example: 'x^2 + y^2 + z^2', hint: 'Find the symbolic gradient in x, y, and z.', group: 'calculus', icon: TrendingUp },
  { id: 'hessian', label: 'Hessian matrix', example: 'x^2*y + y^3', hint: 'Find the matrix of second partial derivatives in x, y, and z.', group: 'calculus', icon: Grid3X3 },
  { id: 'taylor', label: 'Taylor series', example: 'sin(x)', hint: 'Build a local Taylor polynomial up to degree 8.', group: 'calculus', icon: Sigma },
  { id: 'symbolic-integrate', label: 'Antiderivative', example: 'x^3 + cos(x)', hint: 'Integrate supported polynomials and common functions symbolically.', group: 'calculus', icon: SquareFunction },
  { id: 'integrate', label: 'Integrate', example: 'sin(x)', hint: 'Approximate a definite integral between two bounds.', group: 'calculus', icon: ChartArea },
  { id: 'limit', label: 'Limit', example: 'sin(x)/x', hint: 'Probe a limit numerically from both sides.', group: 'calculus', icon: Hourglass },
  { id: 'ode', label: 'ODE', example: 'x + y', hint: 'Solve dy/dx = f(x,y) from an initial value.', group: 'calculus', icon: Waypoints },
  { id: 'matrix', label: 'Matrix', example: '1, 2; 3, 4', hint: 'Find the determinant and inverse of a 2×2 to 4×4 matrix.', group: 'data', icon: Grid2X2 },
  { id: 'matrix-algebra', label: 'Matrix algebra', example: '1, 2; 3, 4 | 5, 6; 7, 8', hint: 'Add, multiply, transpose, invert, or solve with small numeric matrices.', group: 'data', icon: Blocks },
  { id: 'statistics', label: 'Statistics', example: '2, 4, 4, 6, 9', hint: 'Summarise a list of observations.', group: 'data', icon: ChartScatter },
  { id: 'regression', label: 'Regression', example: '1, 2; 2, 3; 3, 5', hint: 'Fit a least-squares line to x,y pairs.', group: 'data', icon: TrendingUp },
]

export function NumericTool({ parameterA, definitions, tool }: Props & { tool: MathTool }) {
  const [input, setInput] = useToolDraft('input', numericTools.find(item => item.id === tool)!.example)
  const [latex, setLatex] = useToolDraft<string | undefined>('latex')
  const [start, setStart] = useToolDraft('start', '0')
  const [end, setEnd] = useToolDraft('end', '1')
  const [initialY, setInitialY] = useToolDraft('initialY', '1')
  const [center, setCenter] = useToolDraft('center', '0')
  const [order, setOrder] = useToolDraft('order', '4')
  const [variable, setVariable] = useToolDraft('variable', 'y')
  const [replacement, setReplacement] = useToolDraft('replacement', '2')
  const [assumption, setAssumption] = useToolDraft<'none' | 'positive' | 'nonnegative' | 'negative' | 'nonzero'>('assumption', 'none')
  const [limitDirection, setLimitDirection] = useToolDraft<'both' | 'left' | 'right'>('limitDirection', 'both')
  const [matrixOperation, setMatrixOperation] = useToolDraft<MatrixOperation>('matrixOperation', 'add')
  const [matrixInputs, setMatrixInputs] = useToolDraft<Partial<Record<MatrixOperation, string>>>('matrixInputs', {})
  const [result, setResult] = useToolDraft<ToolResult | null>('result', null)
  const [calculatedInputs, setCalculatedInputs] = useToolDraft('calculatedInputs', '')
  const [error, setError] = useToolDraft('error', '')
  const selected = numericTools.find((item) => item.id === tool)!
  const dataset = tool === 'matrix' || tool === 'matrix-algebra' || tool === 'statistics' || tool === 'regression'
  const inputSignature = JSON.stringify({ tool, input, start, end, initialY, center, order, variable, replacement, assumption, limitDirection, matrixOperation, parameterA, definitions })

  function calculate() {
    const value = (text: string) => text.trim() ? Number(text) : undefined
    try {
      setResult(runMathTool(tool, input, {
        a: parameterA,
        definitions,
        start: value(start),
        end: value(end),
        initialY: value(initialY),
        center: value(center),
        order: value(order),
        variable,
        substitutionVariable: variable,
        replacement,
        assumption,
        direction: limitDirection,
        matrixOperation,
      }))
      setCalculatedInputs(inputSignature)
      setError('')
    } catch (cause) {
      setResult(null)
      setCalculatedInputs(inputSignature)
      setError(cause instanceof Error ? cause.message : 'Could not calculate this input.')
    }
  }

  return (
        <section className="math-tool-card" aria-label={selected.label}>
          <div className="math-tool-card-header"><div className="math-tool-card-icon"><selected.icon size={23} strokeWidth={1.75} aria-hidden="true" /></div><div><h3>{selected.label}</h3><p>{selected.hint}</p></div></div>
          <label className="math-tool-label" htmlFor={dataset ? 'math-tool-data' : undefined}>{dataset ? 'Values' : tool === 'ode' ? 'dy/dx =' : 'Expression'}</label>
          {dataset
            ? <textarea id="math-tool-data" className="math-tool-data" value={input} onChange={(event) => setInput(event.target.value)} rows={4} spellCheck={false} />
            : <div className="math-tool-equation"><EquationField key={tool} id={`math-tool-${tool}`} label={`${selected.label} expression`} value={input} latex={latex} placeholder={selected.example} onChange={(value, nextLatex) => { setInput(value); setLatex(nextLatex) }} /></div>}
          {(tool === 'integrate' || tool === 'limit' || tool === 'ode' || tool === 'solve-numeric') && (
            <div className="math-tool-options">
              <label>{tool === 'limit' ? 'Approach x' : tool === 'ode' ? 'Initial x' : 'Lower bound'}<input type="number" value={start} onChange={(event) => setStart(event.target.value)} /></label>
              {tool !== 'limit' && <label>{tool === 'ode' ? 'Final x' : 'Upper bound'}<input type="number" value={end} onChange={(event) => setEnd(event.target.value)} /></label>}
              {tool === 'ode' && <label>Initial y<input type="number" value={initialY} onChange={(event) => setInitialY(event.target.value)} /></label>}
            </div>
          )}
          {tool === 'limit' && <div className="math-tool-options"><label>Approach direction<select value={limitDirection} onChange={(event) => setLimitDirection(event.target.value as typeof limitDirection)}><option value="both">Both sides</option><option value="left">From the left</option><option value="right">From the right</option></select></label></div>}
          {tool === 'partial' && <div className="math-tool-options"><label>Differentiate with respect to<select value={variable} onChange={(event) => setVariable(event.target.value)}><option value="x">x</option><option value="y">y</option><option value="z">z</option></select></label></div>}
          {tool === 'simplify' && <div className="math-tool-options"><label>Assume<select value={assumption} onChange={(event) => setAssumption(event.target.value as typeof assumption)}><option value="none">No assumptions</option><option value="positive">{variable} &gt; 0</option><option value="nonnegative">{variable} ≥ 0</option><option value="negative">{variable} &lt; 0</option><option value="nonzero">{variable} ≠ 0</option></select></label><label>Variable<select value={variable} onChange={(event) => setVariable(event.target.value)}><option value="x">x</option><option value="y">y</option><option value="z">z</option></select></label></div>}
          {tool === 'taylor' && <div className="math-tool-options"><label>Center x₀<input type="number" value={center} onChange={(event) => setCenter(event.target.value)} /></label><label>Order (0–8)<input type="number" min="0" max="8" value={order} onChange={(event) => setOrder(event.target.value)} /></label></div>}
          {tool === 'substitute' && <div className="math-tool-options"><label>Variable<select value={variable} onChange={(event) => setVariable(event.target.value)}><option value="x">x</option><option value="y">y</option><option value="z">z</option></select></label><label>Replace with<input type="text" value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label></div>}
          {tool === 'matrix-algebra' && <div className="math-tool-options"><label>Operation<select value={matrixOperation} onChange={(event) => {
            const next = event.target.value as MatrixOperation
            setMatrixInputs(current => ({ ...current, [matrixOperation]: input }))
            setMatrixOperation(next)
            setInput(matrixInputs[next] ?? (next === 'solve' ? '2, 1; 1, -1 | 5; 1' : ['add', 'subtract', 'multiply'].includes(next) ? '1, 2; 3, 4 | 5, 6; 7, 8' : '1, 2; 3, 4'))
          }}><option value="add">Add</option><option value="subtract">Subtract</option><option value="multiply">Multiply</option><option value="transpose">Transpose A</option><option value="determinant">Determinant</option><option value="inverse">Inverse</option><option value="eigenvalues">Eigenvalues</option><option value="eigenvectors">Eigenvalues and vectors</option><option value="solve">Solve Ax = b</option></select></label></div>}
          <button className="math-tool-run" type="button" onClick={calculate}>Calculate result <ArrowRight size={16} aria-hidden="true" /></button>
          {error && calculatedInputs === inputSignature && <p className="math-tool-error" role="alert">{error}</p>}
          {result && calculatedInputs === inputSignature && <div className="math-tool-result" role="status"><span>{result.title}</span><MathResult value={result.value} />{result.note && <p>{result.note}</p>}</div>}
        </section>
  )
}
