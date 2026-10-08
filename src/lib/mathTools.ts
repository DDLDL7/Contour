import { derivative, evaluate, format, parse, simplify, type MathNode } from 'mathjs'
import { compileScalarDefinition, normalizeMathSource } from './math'

export type MathTool = 'calculate' | 'simplify' | 'solve' | 'differentiate' | 'integrate' | 'limit' | 'matrix' | 'statistics' | 'regression' | 'ode'

export interface ToolOptions {
  a: number
  definitions?: Readonly<Record<string, number>>
  start?: number
  end?: number
  initialY?: number
}

export interface ToolResult {
  title: string
  value: string
  note?: string
}

function finite(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(`Enter a finite ${label}.`)
  return value
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) throw new Error('The result is outside the real-number range.')
  return Number(value.toPrecision(11)).toString()
}

function parseNumbers(input: string): number[] {
  const values = input.split(/[\s,;]+/).filter(Boolean).map(Number)
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) throw new Error('Enter finite numbers separated by commas or spaces.')
  return values
}

function parseMatrix(input: string): number[][] {
  const rows = input.trim().split(/\n|;/).map((row) => row.trim()).filter(Boolean).map((row) => parseNumbers(row))
  if (rows.length < 2 || rows.length > 4 || rows.some((row) => row.length !== rows.length)) {
    throw new Error('Enter a square 2×2, 3×3, or 4×4 matrix; separate rows with semicolons.')
  }
  return rows
}

type Polynomial = [number, number, number]
const addPolynomials = (first: Polynomial, second: Polynomial): Polynomial => [first[0] + second[0], first[1] + second[1], first[2] + second[2]]
const scalePolynomial = (value: Polynomial, factor: number): Polynomial => [value[0] * factor, value[1] * factor, value[2] * factor]

function polynomial(node: MathNode, a: number, definitions: Readonly<Record<string, number>>): Polynomial {
  if (node.type === 'ConstantNode') return [Number((node as MathNode & { value: unknown }).value), 0, 0]
  if (node.type === 'ParenthesisNode') return polynomial((node as MathNode & { content: MathNode }).content, a, definitions)
  if (node.type === 'SymbolNode') {
    const name = (node as MathNode & { name: string }).name
    if (name === 'x') return [0, 1, 0]
    if (name === 'a') return [a, 0, 0]
    if (name === 'pi') return [Math.PI, 0, 0]
    if (name === 'e') return [Math.E, 0, 0]
    if (Object.hasOwn(definitions, name)) return [definitions[name], 0, 0]
    throw new Error(`Unsupported polynomial symbol “${name}”.`)
  }
  if (node.type !== 'OperatorNode') throw new Error('Solve currently supports polynomial equations of degree two or less.')
  const operator = node as MathNode & { op: string; args: MathNode[] }
  const args = operator.args.map((part) => polynomial(part, a, definitions))
  if (operator.op === '+') return args.length === 1 ? args[0] : addPolynomials(args[0], args[1])
  if (operator.op === '-') return args.length === 1 ? scalePolynomial(args[0], -1) : addPolynomials(args[0], scalePolynomial(args[1], -1))
  if (operator.op === '/') {
    if (args[1][1] !== 0 || args[1][2] !== 0 || args[1][0] === 0) throw new Error('Division by x is not a polynomial equation.')
    return scalePolynomial(args[0], 1 / args[1][0])
  }
  if (operator.op === '^') {
    if (args[1][1] !== 0 || args[1][2] !== 0 || !Number.isInteger(args[1][0]) || args[1][0] < 0 || args[1][0] > 2) {
      throw new Error('Solve currently supports polynomial equations of degree two or less.')
    }
    let result: Polynomial = [1, 0, 0]
    for (let index = 0; index < args[1][0]; index += 1) result = multiplyPolynomials(result, args[0])
    return result
  }
  if (operator.op === '*') return multiplyPolynomials(args[0], args[1])
  throw new Error('Solve currently supports polynomial equations of degree two or less.')
}

function multiplyPolynomials(first: Polynomial, second: Polynomial): Polynomial {
  if (first[1] * second[2] + first[2] * second[1] !== 0 || first[2] * second[2] !== 0) {
    throw new Error('Solve currently supports polynomial equations of degree two or less.')
  }
  return [first[0] * second[0], first[0] * second[1] + first[1] * second[0], first[0] * second[2] + first[1] * second[1] + first[2] * second[0]]
}

function solvePolynomial(source: string, a: number, definitions: Readonly<Record<string, number>>): ToolResult {
  const sides = source.split('=')
  if (sides.length > 2) throw new Error('Enter one equation, such as x^2 - 5x + 6 = 0.')
  for (const side of sides) compileScalarDefinition(side, ['x', ...Object.keys(definitions)])
  const first = polynomial(parse(normalizeMathSource(sides[0])), a, definitions)
  const second = sides.length === 2 ? polynomial(parse(normalizeMathSource(sides[1])), a, definitions) : [0, 0, 0] as Polynomial
  const [constant, linear, quadratic] = addPolynomials(first, scalePolynomial(second, -1))
  if (![constant, linear, quadratic].every(Number.isFinite)) throw new Error('The equation has non-finite coefficients.')
  const epsilon = 1e-12
  if (Math.abs(quadratic) < epsilon) {
    if (Math.abs(linear) < epsilon) return { title: 'Equation solutions', value: Math.abs(constant) < epsilon ? 'All real x satisfy this equation.' : 'No solution.' }
    return { title: 'Equation solution', value: `x = ${numberText(-constant / linear)}` }
  }
  const discriminant = linear ** 2 - 4 * quadratic * constant
  if (discriminant < 0) {
    const real = numberText(-linear / (2 * quadratic))
    const imaginary = numberText(Math.sqrt(-discriminant) / (2 * Math.abs(quadratic)))
    return { title: 'Complex roots', value: `x = ${real} ± ${imaginary}i`, note: 'Decimal approximations of the two complex roots.' }
  }
  if (discriminant === 0) return { title: 'Repeated root', value: `x = ${numberText(-linear / (2 * quadratic))}` }
  const q = -0.5 * (linear + Math.sign(linear || 1) * Math.sqrt(discriminant))
  const roots = [q / quadratic, constant / q].sort((left, right) => left - right)
  return { title: 'Equation solutions', value: `x₁ = ${numberText(roots[0])}\nx₂ = ${numberText(roots[1])}`, note: 'Decimal approximations of the polynomial roots.' }
}

export function runMathTool(tool: MathTool, input: string, options: ToolOptions): ToolResult {
  const source = input.trim()
  if (!source) throw new Error('Enter an expression or dataset first.')
  if (source.length > 2000) throw new Error('Keep this input under 2,000 characters.')
  const definitions = options.definitions ?? {}

  if (tool === 'solve') return solvePolynomial(source, options.a, definitions)

  if (tool === 'matrix') {
    const rows = parseMatrix(source)
    const determinant = rows.length === 2
      ? rows[0][0] * rows[1][1] - rows[0][1] * rows[1][0]
      : Number(evaluate(`det(${JSON.stringify(rows)})`))
    if (!Number.isFinite(determinant)) throw new Error('Could not calculate this determinant.')
    if (Math.abs(determinant) < 1e-10) return { title: 'Matrix', value: `det = ${numberText(determinant)}`, note: 'Singular matrix; no inverse exists.' }
    const inverse = evaluate(`inv(${JSON.stringify(rows)})`) as { toArray?: () => number[][] } | number[][]
    const array = Array.isArray(inverse) ? inverse : inverse.toArray?.()
    if (!array) throw new Error('Could not calculate this inverse.')
    return { title: 'Matrix', value: `det = ${numberText(determinant)}\nA⁻¹ = ${array.map((row) => `[${row.map(numberText).join(', ')}]`).join('\n       ')}` }
  }

  if (tool === 'statistics') {
    const values = parseNumbers(source)
    const sorted = [...values].sort((left, right) => left - right)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const middle = Math.floor(values.length / 2)
    const median = values.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    return { title: 'Descriptive statistics', value: `n = ${values.length}\nmean = ${numberText(mean)}\nmedian = ${numberText(median)}\nσ = ${numberText(Math.sqrt(variance))}\nmin = ${numberText(sorted[0])}\nmax = ${numberText(sorted.at(-1)!)}`, note: 'σ uses the population standard deviation.' }
  }

  if (tool === 'regression') {
    const points = source.split(/\n|;/).map((pair) => pair.trim()).filter(Boolean).map((pair) => parseNumbers(pair))
    if (points.length < 2 || points.some((pair) => pair.length !== 2)) throw new Error('Enter at least two x,y pairs separated by semicolons.')
    const xMean = points.reduce((sum, point) => sum + point[0], 0) / points.length
    const yMean = points.reduce((sum, point) => sum + point[1], 0) / points.length
    const xx = points.reduce((sum, point) => sum + (point[0] - xMean) ** 2, 0)
    const xy = points.reduce((sum, point) => sum + (point[0] - xMean) * (point[1] - yMean), 0)
    const yy = points.reduce((sum, point) => sum + (point[1] - yMean) ** 2, 0)
    if (xx === 0) throw new Error('Regression needs at least two different x values.')
    const slope = xy / xx
    const intercept = yMean - slope * xMean
    return { title: 'Linear regression', value: `y ≈ ${numberText(slope)}x + ${numberText(intercept)}\nR² = ${yy === 0 ? '1' : numberText(xy ** 2 / (xx * yy))}`, note: 'Least-squares line; R² measures fit to these points.' }
  }

  const symbols = tool === 'calculate' ? ['i'] : tool === 'ode' ? ['x', 'y'] : ['x']
  const compiled = compileScalarDefinition(source, [...symbols, ...Object.keys(definitions)])
  if (tool === 'calculate') {
    const result = evaluate(normalizeMathSource(source), { ...definitions, a: options.a })
    return { title: 'Calculation', value: format(result, { precision: 12 }), note: 'Decimal or complex result; exact symbolic arithmetic is not available yet.' }
  }
  if (tool === 'simplify') return { title: 'Simplified expression', value: simplify(parse(normalizeMathSource(source))).toString(), note: 'Check assumptions when simplifying expressions with roots or absolute values.' }
  if (tool === 'differentiate') return { title: 'Derivative with respect to x', value: simplify(derivative(parse(normalizeMathSource(source)), 'x')).toString() }

  if (tool === 'integrate') {
    const start = finite(options.start, 'lower bound')
    const end = finite(options.end, 'upper bound')
    const steps = 512
    const h = (end - start) / steps
    let sum = 0
    for (let index = 0; index <= steps; index += 1) {
      const y = compiled.evaluate({ ...definitions, x: start + index * h, a: options.a })
      if (!Number.isFinite(y)) throw new Error('The integrand is undefined within these bounds.')
      sum += (index === 0 || index === steps ? 1 : index % 2 ? 4 : 2) * y
    }
    return { title: 'Definite integral', value: `≈ ${numberText(sum * h / 3)}`, note: 'Numerical Simpson approximation (512 intervals); discontinuities may need separate bounds.' }
  }

  if (tool === 'limit') {
    const point = finite(options.start, 'approach point')
    const samples = [1e-3, 1e-4, 1e-5].map((offset) => [
      compiled.evaluate({ ...definitions, x: point - offset, a: options.a }),
      compiled.evaluate({ ...definitions, x: point + offset, a: options.a }),
    ])
    const [left, right] = samples.at(-1)!
    if (![left, right].every(Number.isFinite) || Math.abs(left - right) > 1e-3 * Math.max(1, Math.abs(left), Math.abs(right))) {
      return { title: 'Numerical limit', value: 'No common finite limit detected', note: 'A numerical probe cannot prove that a limit exists or does not exist.' }
    }
    return { title: 'Numerical limit', value: `≈ ${numberText((left + right) / 2)}`, note: `Probed from both sides near x = ${numberText(point)}; this is not a symbolic proof.` }
  }

  const start = finite(options.start, 'initial x')
  const end = finite(options.end, 'final x')
  let y = finite(options.initialY, 'initial y')
  const steps = 500
  const h = (end - start) / steps
  const f = (x: number, currentY: number) => compiled.evaluate({ ...definitions, x, y: currentY, a: options.a })
  for (let index = 0; index < steps; index += 1) {
    const x = start + index * h
    const k1 = f(x, y)
    const k2 = f(x + h / 2, y + h * k1 / 2)
    const k3 = f(x + h / 2, y + h * k2 / 2)
    const k4 = f(x + h, y + h * k3)
    y += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6
    if (!Number.isFinite(y)) throw new Error('The ODE solution diverged or became undefined.')
  }
  return { title: 'ODE initial-value solution', value: `y(${numberText(end)}) ≈ ${numberText(y)}`, note: 'Fourth-order Runge–Kutta estimate with 500 steps; this does not include an error bound.' }
}
