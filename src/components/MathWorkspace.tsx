import { useRef, useState } from 'react'
import { NumericTool } from './MathTools'
import { SymbolicTools } from './SymbolicTools'
import { DifferentialTools } from './DifferentialTools'
import { ToolDraftContext } from './ToolDrafts'
import type { MathTool } from '../lib/mathTools'
import type { SymbolicMethod } from '../lib/symbolic'

type Variant = { label: string; numeric?: MathTool; exact?: SymbolicMethod; differential?: true }
type Task = { label: string; group: string; variants: Variant[] }
const exact = (method: SymbolicMethod): Variant => ({ label: 'Exact', exact: method })
const numeric = (method: MathTool, label = 'Approximate'): Variant => ({ label, numeric: method })
export const mathTasks: Task[] = [
  { label: 'Calculate', group: 'Algebra', variants: [numeric('calculate'), exact('exact')] },
  ...(['simplify', 'expand', 'factor', 'substitute'] as const).map(method => ({ label: method[0].toUpperCase() + method.slice(1), group: 'Algebra', variants: [exact(method)] })),
  { label: 'Solve equation', group: 'Algebra', variants: [exact('solve'), numeric('solve-numeric'), { label: 'Show working', exact: 'steps' }] },
  { label: 'Solve system', group: 'Algebra', variants: [exact('system')] },
  { label: 'Solve inequalities', group: 'Algebra', variants: [exact('inequality')] },
  { label: 'Rewrite rational expression', group: 'Algebra', variants: [exact('rational')] },
  { label: 'Rewrite trigonometric expression', group: 'Algebra', variants: [exact('trig')] },
  { label: 'Check equivalent answers', group: 'Algebra', variants: [exact('check')] },
  { label: 'Differentiate', group: 'Calculus', variants: [exact('differentiate'), { label: 'Show working', exact: 'differentiate-steps' }] },
  { label: 'Partial derivative', group: 'Calculus', variants: [numeric('partial', 'Symbolic')] },
  { label: 'Integrate', group: 'Calculus', variants: [{ label: 'Antiderivative', exact: 'integrate' }, { label: 'Exact definite integral', exact: 'definite' }, numeric('integrate', 'Approximate definite integral')] },
  { label: 'Limit', group: 'Calculus', variants: [exact('limit'), numeric('limit', 'Numerical probe')] },
  { label: 'Taylor / Laurent series', group: 'Calculus', variants: [exact('series'), numeric('taylor', 'Taylor polynomial (degree 0–8)')] },
  { label: 'Gradient', group: 'Calculus', variants: [exact('gradient')] },
  { label: 'Hessian matrix', group: 'Calculus', variants: [exact('hessian')] },
  { label: 'Asymptotes', group: 'Calculus', variants: [exact('asymptotes')] },
  { label: 'Family envelope', group: 'Calculus', variants: [exact('envelope')] },
  { label: 'Differential equations', group: 'Calculus', variants: [{ label: 'Numerical solution & field', differential: true }, exact('ode')] },
  { label: 'Matrix analysis', group: 'Matrices & data', variants: [exact('matrix'), numeric('matrix')] },
  { label: 'Matrix arithmetic & linear systems', group: 'Matrices & data', variants: [numeric('matrix-algebra')] },
  { label: 'Statistics', group: 'Matrices & data', variants: [numeric('statistics')] },
  { label: 'Regression', group: 'Matrices & data', variants: [numeric('regression')] },
]

export function MathWorkspace({ active, parameterA, definitions }: { active: boolean; parameterA: number; definitions: Readonly<Record<string, number>> }) {
  const [taskIndex, setTaskIndex] = useState(0)
  const [choices, setChoices] = useState<Record<number, number>>({})
  const drafts = useRef(new Map<string, unknown>())
  const task = mathTasks[taskIndex]
  const choice = choices[taskIndex] ?? 0
  const variant = task.variants[choice]
  const namespace = `${taskIndex}:${choice}`
  function chooseVariant(next: number) {
    const targetKey = `${taskIndex}:${next}:${task.variants[next].differential ? 'first' : 'input'}`
    const sourceKey = `${namespace}:${variant.differential ? 'first' : 'input'}`
    // Start another result type with the student's expression, then keep its
    // own draft. A two-equation system cannot seed a scalar symbolic ODE.
    if (!drafts.current.has(targetKey) && drafts.current.has(sourceKey) && !(variant.differential && drafts.current.get(`${namespace}:system`))) {
      drafts.current.set(targetKey, drafts.current.get(sourceKey))
    }
    setChoices(current => ({ ...current, [taskIndex]: next }))
  }
  if (!active) return null
  return <div className="math-tools-view">
    <div className="math-tools-intro"><h2>Work through a calculation</h2><p>Choose what you want to do. Workspace variables are available in expressions. Drafts stay here while you switch views; copy results to your notebook before closing the app.</p></div>
    <div className="math-task-picker">
      <label>Task<select value={taskIndex} onChange={event => setTaskIndex(Number(event.target.value))}>{['Algebra', 'Calculus', 'Matrices & data'].map(group => <optgroup key={group} label={group}>{mathTasks.map((item, index) => item.group === group ? <option key={item.label} value={index}>{item.label}</option> : null)}</optgroup>)}</select></label>
      {task.variants.length > 1 && <label>Result type<select value={choice} onChange={event => chooseVariant(Number(event.target.value))}>{task.variants.map((item, index) => <option key={index} value={index}>{item.label}</option>)}</select></label>}
    </div>
    <ToolDraftContext.Provider key={namespace} value={{ values: drafts.current, namespace }}>
      {variant.numeric ? <NumericTool tool={variant.numeric} parameterA={parameterA} definitions={definitions} /> : variant.exact ? <SymbolicTools method={variant.exact} parameterA={parameterA} definitions={definitions} /> : <DifferentialTools parameterA={parameterA} definitions={definitions} />}
    </ToolDraftContext.Provider>
  </div>
}
