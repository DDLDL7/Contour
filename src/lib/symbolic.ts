import { all, create, isBigNumber, type MathNode } from 'mathjs'
const { parse } = create(all, { number: 'BigNumber', precision: 100 })

export const symbolicMethods = [
  ['exact', 'Exact value', 'sqrt(2) + 3/4'], ['simplify', 'Simplify', 'sqrt(x^2)'],
  ['expand', 'Expand', '(x+y)^4'], ['factor', 'Factor', 'x^4-1'],
  ['rational', 'Rational rewriting', '1/(x+1)+1/(x-1)'], ['trig', 'Trigonometric rewriting', 'sin(x)^2+cos(x)^2'],
  ['substitute', 'Symbolic substitution', 'x^2+2*x+1'],
  ['solve', 'Solve equation', 'x^3-x=0'], ['system', 'Solve system', 'x+y=3; x-y=1'],
  ['inequality', 'Solve inequalities', 'x^2<4; x>0'], ['differentiate', 'Derivative', 'exp(x)*sin(x)'],
  ['differentiate-steps', 'Derivative working', 'exp(x)*sin(x)'], ['asymptotes', 'Exact asymptote analysis', '(x^2+1)/(x-1)'],
  ['integrate', 'Antiderivative', 'exp(-x^2)'], ['definite', 'Exact definite integral', 'sin(x)'],
  ['limit', 'Symbolic limit', 'sin(x)/x'], ['series', 'Taylor / Laurent series', 'sin(x)/x'],
  ['gradient', 'Gradient', 'x^2+y^2+z^2'], ['hessian', 'Hessian', 'x^2*y+y^3'],
  ['matrix', 'Exact matrix analysis', '1,2; 3,4'], ['ode', 'Symbolic first-order ODE', 'x+y'],
  ['check', 'Check equivalent answers', '(x+1)^2; x^2+2*x+1'],
  ['steps', 'Equation working', '2*x+3=9'],
  ['envelope', 'Implicit family envelope', 'y-t*x+t^2'],
] as const
export type SymbolicMethod = typeof symbolicMethods[number][0]
export type ExpressionTree = { kind: 'number' | 'symbol' | 'operation' | 'function'; value: string; args?: ExpressionTree[] }
const functions = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'sqrt', 'abs', 'factorial', 'floor', 'ceil', 'conjugate', 're', 'im'])
const operators = new Set(['+', '-', '*', '/', '^', '==', '!=', '<', '>', '<=', '>='])

/** Convert an expression to data, never executable Python or JavaScript. */
export function symbolicTree(source: string): ExpressionTree {
  if (!source.trim() || source.length > 2000) throw new Error('Enter an expression of at most 2,000 characters.')
  let count = 0
  function visit(node: MathNode, depth = 0): ExpressionTree {
    if (++count > 300 || depth > 40) throw new Error('Expression is too large or deeply nested.')
    const n = node as MathNode & { value: unknown; name: string; op: string; args: MathNode[]; content: MathNode; fn: MathNode & { name: string } }
    if (node.type === 'ParenthesisNode') return visit(n.content, depth + 1)
    if (node.type === 'ConstantNode' && (typeof n.value === 'number' || isBigNumber(n.value)) && Number.isFinite(Number(n.value)) && Math.abs(Number(n.value)) <= 1e100) return { kind: 'number', value: String(n.value) }
    if (node.type === 'SymbolNode' && /^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(n.name) && !n.name.startsWith('_')) return { kind: 'symbol', value: n.name }
    if (node.type === 'OperatorNode' && operators.has(n.op)) {
      if (n.op === '^' && n.args[1]?.type === 'ConstantNode' && Math.abs(Number((n.args[1] as unknown as { value: number }).value)) > 1000) throw new Error('Constant powers are limited to magnitude 1,000.')
      return { kind: 'operation', value: n.op, args: n.args.map(arg => visit(arg, depth + 1)) }
    }
    if (node.type === 'FunctionNode' && functions.has(n.fn.name)) return { kind: 'function', value: n.fn.name, args: n.args.map(arg => visit(arg, depth + 1)) }
    throw new Error('Use arithmetic, named variables, and supported mathematical functions only.')
  }
  return visit(parse(source.replace(/(?<![<>=!])=(?!=)/g, '==')))
}

export interface SymbolicOptions {
  variable: string; domain: 'real' | 'complex'; assumption: 'none' | 'positive' | 'nonnegative' | 'negative' | 'nonzero'
  start: string; end: string; direction: 'both' | 'left' | 'right'; order: number; initialY: string
  definitions: Readonly<Record<string, number>>
}
export interface SymbolicRequest { method: SymbolicMethod; expressions: ExpressionTree[][]; options: SymbolicOptions; bounds: ExpressionTree[] }
export interface SymbolicResult { title: string; value: string; note: string }
export function symbolicRequest(method: SymbolicMethod, input: string, options: SymbolicOptions): SymbolicRequest {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(options.variable) || ['pi', 'e', 'i', 'oo'].includes(options.variable)) throw new Error('Choose a variable name, such as x.')
  if (!Number.isInteger(options.order) || options.order < 1 || options.order > 20) throw new Error('Series order must be from 1 to 20.')
  const rows = input.split(/[;\n]/).filter(row => row.trim())
  if (rows.length < 1 || rows.length > 8) throw new Error('Use one to eight expressions or matrix rows.')
  if (!['matrix','system','inequality','check'].includes(method) && rows.length !== 1) throw new Error('This method takes one expression; use Solve system for multiple equations.')
  const expressions = rows.map(row => method === 'matrix' ? row.split(',').map(symbolicTree) : [symbolicTree(row)])
  if (method === 'matrix' && (expressions.some(row => row.length !== expressions[0].length) || expressions[0].length > 8)) throw new Error('Use a rectangular matrix up to 8 × 8.')
  if (method === 'check' && rows.length !== 2) throw new Error('Separate the two answers with a semicolon.')
  return { method, expressions, options, bounds: [options.start, options.end, options.initialY].map(symbolicTree) }
}

export class SymbolicEngine {
  private worker: Worker | null = null
  private reject: ((error: Error) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  cancel() {
    this.worker?.terminate(); this.worker = null
    clearTimeout(this.timer); this.reject?.(new Error('Calculation stopped.')); this.reject = null
  }
  run(request: SymbolicRequest, progress: (message: string) => void): Promise<SymbolicResult> {
    this.cancel()
    const worker = new Worker(new URL('./symbolic.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    return new Promise((resolve, reject) => {
      this.reject = reject
      const finish = () => { clearTimeout(this.timer); this.reject = null; worker.terminate(); if (this.worker === worker) this.worker = null }
      this.timer = setTimeout(() => { finish(); reject(new Error('Calculation exceeded 90 seconds. Try a simpler expression.')) }, 90_000)
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return
        if (data.progress) { progress(data.progress); return }
        finish()
        if (data.error) reject(new Error(data.error)); else resolve(data.result)
      }
      worker.onerror = () => { if (this.worker !== worker) return; finish(); reject(new Error('The offline symbolic engine could not start. Reload the app and try again.')) }
      worker.postMessage({ request, base: new URL(`${import.meta.env.BASE_URL}math-runtime/`, location.href).href })
    })
  }
}
