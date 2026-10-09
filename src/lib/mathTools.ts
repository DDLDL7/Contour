import { findZeroes } from './analysis'
import { derivative, eigs, evaluate, format, matrix, parse, simplify, type MathNode } from 'mathjs'
import { compileScalarDefinition, normalizeMathSource } from './math'

export type MathTool = 'calculate' | 'simplify' | 'expand' | 'factor' | 'substitute' | 'solve' | 'solve-numeric' | 'differentiate' | 'partial' | 'gradient' | 'hessian' | 'taylor' | 'integrate' | 'symbolic-integrate' | 'limit' | 'matrix' | 'matrix-algebra' | 'statistics' | 'regression' | 'ode'
export type MatrixOperation = 'add' | 'subtract' | 'multiply' | 'transpose' | 'determinant' | 'inverse' | 'eigenvalues' | 'eigenvectors' | 'solve'

export interface ToolOptions {
  a: number
  definitions?: Readonly<Record<string, number>>
  start?: number
  end?: number
  initialY?: number
  variable?: string
  center?: number
  order?: number
  matrixOperation?: MatrixOperation
  substitutionVariable?: string
  replacement?: string
  assumption?: 'none' | 'positive' | 'nonnegative' | 'negative' | 'nonzero'
  direction?: 'both' | 'left' | 'right'
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

function parseRectangularMatrix(input: string): number[][] {
  const rows = input.trim().split(/\n|;/).map((row) => row.trim()).filter(Boolean).map(parseNumbers)
  if (!rows.length || rows.length > 8 || rows.some((row) => row.length !== rows[0].length || row.length > 8)) {
    throw new Error('Enter a rectangular matrix with matching row lengths and at most 8 rows and columns.')
  }
  return rows
}

function runMatrixOperation(source: string, operation: MatrixOperation): ToolResult {
  const parts = source.split('|')
  if (parts.length > 2 || !parts[0].trim()) throw new Error('Separate two matrices with |, for example 1,2;3,4 | 5,6;7,8.')
  const first = parseRectangularMatrix(parts[0])
  const second = parts[1]?.trim() ? parseRectangularMatrix(parts[1]) : null
  const rows = first.length; const columns = first[0].length
  const formatMatrix = (values: number[][]) => values.map((row) => `[${row.map(numberText).join(', ')}]`).join('\n')
  const needsSecond = ['add', 'subtract', 'multiply', 'solve'].includes(operation)
  if (needsSecond && !second) throw new Error('Enter the second matrix after |.')
  if (!needsSecond && second) throw new Error('This operation uses one matrix; remove the second matrix after |.')
  if (operation === 'transpose') return { title: 'Transpose', value: formatMatrix(Array.from({ length: columns }, (_, column) => first.map((row) => row[column]))) }
  if (operation === 'add' || operation === 'subtract') {
    if (second!.length !== rows || second![0].length !== columns) throw new Error('Matrix addition and subtraction require equal dimensions.')
    const result = first.map((row, i) => row.map((value, j) => operation === 'add' ? value + second![i][j] : value - second![i][j]))
    return { title: operation === 'add' ? 'Matrix sum' : 'Matrix difference', value: formatMatrix(result) }
  }
  if (operation === 'multiply') {
    if (columns !== second!.length) throw new Error('The first matrix column count must match the second matrix row count.')
    const result = first.map((row) => second![0].map((_, column) => row.reduce((sum, value, inner) => sum + value * second![inner][column], 0)))
    return { title: 'Matrix product', value: formatMatrix(result) }
  }
  if (operation === 'solve') {
    if (rows !== columns || second!.length !== rows || second![0].length !== 1) throw new Error('Solve requires a square coefficient matrix and a one-column right-hand side.')
    try {
      const solved = evaluate(`lusolve(${JSON.stringify(first)}, ${JSON.stringify(second)})`) as { toArray?: () => number[][] } | number[][]
      const result = Array.isArray(solved) ? solved : solved.toArray?.()
      if (!result) throw new Error('The solver returned no values.')
      return { title: 'Linear system solution', value: result.map((row, index) => `x${index + 1} = ${numberText(row[0])}`).join('\n'), note: 'Numerical solution of Ax = b.' }
    } catch { throw new Error('The coefficient matrix is singular or the system could not be solved.') }
  }
  if (rows !== columns) throw new Error('This operation requires a square matrix.')
  if (operation === 'determinant') return { title: 'Determinant', value: `det(A) = ${numberText(Number(evaluate(`det(${JSON.stringify(first)})`)))}` }
  if (operation === 'inverse') {
    const determinant = Number(evaluate(`det(${JSON.stringify(first)})`))
    if (Math.abs(determinant) < 1e-12) throw new Error('This matrix is singular; it has no inverse.')
    const inverted = evaluate(`inv(${JSON.stringify(first)})`) as { toArray?: () => number[][] } | number[][]
    const result = Array.isArray(inverted) ? inverted : inverted.toArray?.()
    if (!result) throw new Error('Could not calculate the inverse.')
    return { title: 'Matrix inverse', value: formatMatrix(result) }
  }
  try {
    const result = eigs(matrix(first)) as { values: { toArray: () => unknown[] }; eigenvectors: { value: unknown; vector: { toArray: () => unknown[] } }[] }
    if (operation === 'eigenvectors') {
      return { title: 'Eigenvalues and eigenvectors', value: result.eigenvectors.map((item, index) => `λ${index + 1} = ${format(item.value, { precision: 8 })}\nv${index + 1} = [${item.vector.toArray().map((value) => format(value, { precision: 8 })).join(', ')}]`).join('\n'), note: 'Numerical eigenpairs; eigenvector scaling is arbitrary. The numerical eigensolver may reject unsupported matrices.' }
    }
    return { title: 'Eigenvalues', value: result.values.toArray().map((value, index) => `λ${index + 1} = ${format(value, { precision: 10 })}`).join('\n'), note: 'Numerical eigenvalues; this operation requires a matrix supported by the numerical eigensolver.' }
  } catch { throw new Error('Eigenvalues could not be computed for this matrix. Try a real symmetric matrix.') }
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

function solveNumeric(source: string, options: ToolOptions, definitions: Readonly<Record<string, number>>): ToolResult {
  const lower = finite(options.start, 'lower search bound')
  const upper = finite(options.end, 'upper search bound')
  if (lower >= upper || upper - lower > 1e6) throw new Error('Choose an increasing search interval no wider than 1,000,000.')
  const sides = source.split('=')
  if (sides.length > 2) throw new Error('Enter one equation, such as sin(x) = 0.')
  const expression = sides.length === 2 ? `(${sides[0]})-(${sides[1]})` : sides[0]
  const compiled = compileScalarDefinition(expression, ['x', ...Object.keys(definitions)])
  const evaluateAt = (x: number) => compiled.evaluate({ ...definitions, a: options.a, x })
  const roots = findZeroes(evaluateAt, lower, upper)
  return { title: 'Numerical real roots', value: roots.length ? roots.map((root,index)=>`x${index+1} ≈ ${numberText(root)}`).join('\n') : 'No isolated real roots detected in this interval.', note: 'Approximate search over 900 intervals, with sign-change bisection and refinement of even-root valleys. Returns at most 64 roots; closely spaced roots and small features can be missed. This is not proof that all roots were found.' }

}

interface ExpansionTerm { sign: 1 | -1; expression: string }

function expansionTerms(node: MathNode): ExpansionTerm[] {
  if (node.type === 'ParenthesisNode') return expansionTerms((node as MathNode & { content: MathNode }).content)
  if (node.type !== 'OperatorNode') return [{ sign: 1, expression: node.toString() }]
  const operator = node as MathNode & { op: string; args: MathNode[] }
  if (operator.op === '+' && operator.args.length === 2) return [...expansionTerms(operator.args[0]), ...expansionTerms(operator.args[1])]
  if (operator.op === '-' && operator.args.length === 2) return [...expansionTerms(operator.args[0]), ...expansionTerms(operator.args[1]).map((term) => ({ ...term, sign: term.sign === 1 ? -1 as const : 1 as const }))]
  if ((operator.op === '+' || operator.op === '-') && operator.args.length === 1) {
    const terms = expansionTerms(operator.args[0])
    return operator.op === '+' ? terms : terms.map((term) => ({ ...term, sign: term.sign === 1 ? -1 as const : 1 as const }))
  }
  if (operator.op === '^' && operator.args[1]?.type === 'ConstantNode') {
    const exponent = Number((operator.args[1] as MathNode & { value: unknown }).value)
    if (Number.isInteger(exponent) && exponent >= 0 && exponent <= 8 && exponent !== 1) {
      if (exponent === 0) return [{ sign: 1, expression: '1' }]
      let terms: ExpansionTerm[] = [{ sign: 1, expression: '1' }]
      const baseTerms = expansionTerms(operator.args[0])
      for (let power = 0; power < exponent; power += 1) terms = terms.flatMap((first) => baseTerms.map((second) => ({ sign: (first.sign * second.sign) as 1 | -1, expression: `(${first.expression})*(${second.expression})` })))
      return terms
    }
  }
  if (operator.op === '*' && operator.args.length === 2) {
    return expansionTerms(operator.args[0]).flatMap((first) => expansionTerms(operator.args[1]).map((second) => ({
      sign: (first.sign * second.sign) as 1 | -1,
      expression: `(${first.expression})*(${second.expression})`,
    })))
  }
  return [{ sign: 1, expression: node.toString() }]
}

function expandExpression(source: string): string {
  const terms = expansionTerms(parse(normalizeMathSource(source)))
  const expanded = terms.map((term, index) => `${index === 0 ? term.sign < 0 ? '-' : '' : term.sign < 0 ? ' - ' : ' + '}${term.expression}`).join('')
  return simplify(parse(expanded)).toString()
}

function factorQuadratic(source: string, a: number, definitions: Readonly<Record<string, number>>): ToolResult {
  const coefficients = polynomial(parse(normalizeMathSource(source)), a, definitions)
  const [constant, linear, quadratic] = coefficients
  if (![constant, linear, quadratic].every(Number.isFinite)) throw new Error('The polynomial has non-finite coefficients.')
  if (Math.abs(quadratic) < 1e-12) {
    if (Math.abs(linear) < 1e-12) return { title: 'Factored expression', value: numberText(constant), note: 'Only constant factors were found.' }
    const root = -constant / linear
    return { title: 'Factored polynomial', value: `${numberText(linear)}(x ${root < 0 ? '+' : '−'} ${numberText(Math.abs(root))})`, note: 'Linear factor; decimal coefficients are shown.' }
  }
  const discriminant = linear ** 2 - 4 * quadratic * constant
  if (discriminant >= 0) {
    const root1 = (-linear - Math.sqrt(discriminant)) / (2 * quadratic)
    const root2 = (-linear + Math.sqrt(discriminant)) / (2 * quadratic)
    return { title: 'Factored quadratic', value: `${numberText(quadratic)}(x ${root1 < 0 ? '+' : '−'} ${numberText(Math.abs(root1))})(x ${root2 < 0 ? '+' : '−'} ${numberText(Math.abs(root2))})`, note: 'Factors are numeric approximations when the roots are not rational.' }
  }
  const real = -linear / (2 * quadratic)
  const imaginary = Math.sqrt(-discriminant) / (2 * Math.abs(quadratic))
  return { title: 'Complex factorisation', value: `${numberText(quadratic)}(x - (${numberText(real)} + ${numberText(imaginary)}i))(x - (${numberText(real)} - ${numberText(imaginary)}i))`, note: 'Approximate factors over the complex numbers.' }
}

function dependsOn(node: MathNode, variable: string): boolean {
  let dependent = false
  node.traverse((child) => { if (child.type === 'SymbolNode' && (child as MathNode & { name: string }).name === variable) dependent = true })
  return dependent
}

function constantDerivative(node: MathNode, variable: string): number | null {
  try {
    const slope = simplify(derivative(node, variable))
    if (slope.type !== 'ConstantNode') return null
    const value = Number((slope as MathNode & { value: unknown }).value)
    return Number.isFinite(value) && Math.abs(value) > 1e-12 ? value : null
  } catch { return null }
}

function simplifyWithAssumption(node: MathNode, variable: string, assumption: NonNullable<ToolOptions['assumption']>): MathNode {
  if ((assumption === 'none' || assumption === 'nonnegative') && node.type === 'OperatorNode') {
    const operator = node as MathNode & { op: string; args: MathNode[] }
    if (operator.op === '/' && operator.args.length === 2 && operator.args[0].toString() === variable && operator.args[1].toString() === variable) return node
  }
  if (assumption === 'none') return simplify(node)
  const rewritten = node.transform((child) => {
    if (child.type === 'FunctionNode') {
      const fn = child as MathNode & { fn: MathNode; args: MathNode[] }
      const name = fn.fn.type === 'SymbolNode' ? (fn.fn as MathNode & { name: string }).name : ''
      const argument = fn.args[0]
      const isVariable = argument?.type === 'SymbolNode' && (argument as MathNode & { name: string }).name === variable
      const square = argument?.type === 'OperatorNode' ? argument as MathNode & { op: string; args: MathNode[] } : null
      const isSquareRoot = name === 'sqrt' && square?.op === '^'
        && square.args[0]?.type === 'SymbolNode'
        && (square.args[0] as MathNode & { name: string }).name === variable
        && Number((square.args[1] as MathNode & { value?: unknown })?.value) === 2
      if ((name === 'abs' && isVariable || isSquareRoot) && ['positive', 'nonnegative'].includes(assumption)) return parse(variable)
      if ((name === 'abs' && isVariable || isSquareRoot) && assumption === 'negative') return parse('-' + variable)
    }
    if (child.type === 'OperatorNode') {
      const operator = child as MathNode & { op: string; args: MathNode[] }
      if (operator.op === '/' && operator.args.length === 2 && operator.args[0].toString() === variable && operator.args[1].toString() === variable && assumption !== 'nonnegative') return parse('1')
    }
    return child
  })
  return simplify(rewritten)
}

function symbolicIntegral(node: MathNode, variable = 'x'): string {
  if (!dependsOn(node, variable)) return `(${node.toString()})*${variable}`
  if (node.type === 'ParenthesisNode') return symbolicIntegral((node as MathNode & { content: MathNode }).content, variable)
  if (node.type === 'SymbolNode') {
    const name = (node as MathNode & { name: string }).name
    if (name === variable) return `(${variable}^2)/2`
    return `(${name})*${variable}`
  }
  if (node.type === 'OperatorNode') {
    const operation = node as MathNode & { op: string; args: MathNode[] }
    const [first, second] = operation.args
    if ((operation.op === '+' || operation.op === '-') && first && second) return `(${symbolicIntegral(first, variable)}) ${operation.op} (${symbolicIntegral(second, variable)})`
    if (operation.op === '-' && first && !second) return `-(${symbolicIntegral(first, variable)})`
    if (operation.op === '*' && first && second) {
      if (!dependsOn(first, variable)) return `(${first.toString()})*(${symbolicIntegral(second, variable)})`
      if (!dependsOn(second, variable)) return `(${second.toString()})*(${symbolicIntegral(first, variable)})`
    }
    if (operation.op === '/' && first && second && !dependsOn(second, variable)) return `(${symbolicIntegral(first, variable)})/(${second.toString()})`
    if (operation.op === '^' && first?.type === 'SymbolNode' && (first as MathNode & { name: string }).name === variable && second?.type === 'ConstantNode') {
      const exponent = Number((second as MathNode & { value: unknown }).value)
      if (exponent === -1) return `log(abs(${variable}))`
      if (Number.isFinite(exponent) && exponent !== -1) return `(${variable}^${numberText(exponent + 1)})/${numberText(exponent + 1)}`
    }
  }
  if (node.type === 'FunctionNode') {
    const fn = node as MathNode & { name?: string; fn: MathNode; args: MathNode[] }
    const functionName = fn.fn.type === 'SymbolNode' ? (fn.fn as MathNode & { name: string }).name : ''
    if (fn.args.length === 1 && dependsOn(fn.args[0], variable)) {
      const argument = fn.args[0]
      const coefficient = constantDerivative(argument, variable)
      if (coefficient !== null) {
        const inner = argument.toString()
        if (functionName === 'sin') return `-cos(${inner})/${numberText(coefficient)}`
        if (functionName === 'cos') return `sin(${inner})/${numberText(coefficient)}`
        if (functionName === 'exp') return `exp(${inner})/${numberText(coefficient)}`
        if (functionName === 'log') return `((${inner})*log(${inner})-(${inner}))/${numberText(coefficient)}`
      }
    }
  }
  throw new Error(`No symbolic antiderivative rule is implemented for “${node.toString()}”. Try the numerical definite integral tool.`)
}

export function runMathTool(tool: MathTool, input: string, options: ToolOptions): ToolResult {
  const source = input.trim()
  if (!source) throw new Error('Enter an expression or dataset first.')
  if (source.length > 2000) throw new Error('Keep this input under 2,000 characters.')
  const definitions = options.definitions ?? {}

  if (tool === 'solve') return solvePolynomial(source, options.a, definitions)
  if (tool === 'solve-numeric') return solveNumeric(source, options, definitions)
  if (tool === 'matrix-algebra') return runMatrixOperation(source, options.matrixOperation ?? 'add')
  if (tool === 'expand') {
    compileScalarDefinition(source, ['x', 'y', 'z', ...Object.keys(definitions)])
    return { title: 'Expanded expression', value: expandExpression(source), note: 'Distribution is applied to sums and integer powers up to 8; unsupported forms remain unchanged.' }
  }
  if (tool === 'factor') return factorQuadratic(source, options.a, definitions)
  if (tool === 'substitute') {
    const variable = options.substitutionVariable ?? 'x'
    const replacement = options.replacement?.trim()
    if (!['x', 'y', 'z'].includes(variable) || !replacement) throw new Error('Choose x, y, or z and enter a replacement expression.')
    compileScalarDefinition(source, ['x', 'y', 'z', ...Object.keys(definitions)])
    compileScalarDefinition(replacement, ['x', 'y', 'z', ...Object.keys(definitions)])
    const tree = parse(normalizeMathSource(source)).transform((node) => {
      if (node.type !== 'SymbolNode' || (node as MathNode & { name: string }).name !== variable) return node
      return parse(normalizeMathSource(replacement))
    })
    return { title: `Substitute ${variable} = ${replacement}`, value: simplify(tree).toString() }
  }
  if (tool === 'symbolic-integrate') {
    compileScalarDefinition(source, ['x', ...Object.keys(definitions)])
    const result = simplify(parse(symbolicIntegral(parse(normalizeMathSource(source)))))
    return { title: 'Antiderivative with respect to x', value: `${result.toString()} + C`, note: 'Symbolic rules cover polynomials, constant multiples, sums, and sin(x), cos(x), exp(x), and log(x). Verify the derivative of the result.' }
  }

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

  const symbols = tool === 'calculate' ? ['i'] : tool === 'ode' ? ['x', 'y'] : ['partial', 'gradient', 'hessian'].includes(tool) ? ['x', 'y', 'z'] : ['x']
  const compiled = compileScalarDefinition(source, [...symbols, ...Object.keys(definitions)])
  if (tool === 'calculate') {
    const result = evaluate(normalizeMathSource(source), { ...definitions, a: options.a })
    return { title: 'Calculation', value: format(result, { precision: 12 }), note: 'Decimal or complex result; exact symbolic arithmetic is not available yet.' }
  }
  if (tool === 'simplify') {
    const assumption = options.assumption ?? 'none'
    return {
      title: 'Simplified expression',
      value: simplifyWithAssumption(parse(normalizeMathSource(source)), options.variable ?? 'x', assumption).toString(),
      note: assumption === 'none' ? 'No domain assumptions are applied. Choose a supported assumption to simplify sign-sensitive expressions.' : 'Simplified under the selected assumption; the result is only valid where that condition holds.',
    }
  }
  if (tool === 'differentiate') return { title: 'Derivative with respect to x', value: simplify(derivative(parse(normalizeMathSource(source)), 'x')).toString() }
  if (tool === 'partial') {
    const variable = options.variable ?? 'y'
    if (!['x', 'y', 'z'].includes(variable)) throw new Error('Choose x, y, or z as the differentiation variable.')
    return { title: `Partial derivative with respect to ${variable}`, value: simplify(derivative(parse(normalizeMathSource(source)), variable)).toString() }
  }
  if (tool === 'gradient' || tool === 'hessian') {
    const variables = ['x', 'y', 'z']
    const expression = parse(normalizeMathSource(source))
    const gradient = variables.map((variable) => simplify(derivative(expression, variable)))
    if (tool === 'gradient') {
      return { title: 'Gradient', value: `∇f = [${gradient.map((part) => part.toString()).join(', ')}]`, note: 'Components are ordered x, y, z; entries may be zero when the expression does not depend on that variable.' }
    }
    const hessian = gradient.map((part) => variables.map((variable) => simplify(derivative(part, variable))))
    return { title: 'Hessian matrix', value: hessian.map((row) => `[${row.map((part) => part.toString()).join(', ')}]`).join('\n'), note: 'Rows and columns are ordered x, y, z. Symbolic entries are simplified without domain assumptions.' }
  }
  if (tool === 'taylor') {
    const center = finite(options.center, 'series center')
    const order = options.order
    if (order === undefined || !Number.isInteger(order) || order < 0 || order > 8) throw new Error('Choose a Taylor order from 0 to 8.')
    const scope = { ...definitions, a: options.a, x: center }
    let current: MathNode = parse(normalizeMathSource(source))
    let factorial = 1
    const terms: string[] = []
    for (let power = 0; power <= order; power += 1) {
      const value = Number(current.compile().evaluate(scope))
      if (!Number.isFinite(value)) throw new Error(`Could not evaluate the order ${power} Taylor coefficient at x = ${center}.`)
      const coefficient = value / factorial
      if (Math.abs(coefficient) > 1e-14) terms.push(power === 0 ? numberText(coefficient) : `${numberText(coefficient)}(x - ${numberText(center)})${power === 1 ? '' : `^${power}`}`)
      current = derivative(current, 'x')
      factorial *= power + 1
    }
    return { title: `Taylor polynomial at x = ${numberText(center)}`, value: terms.join(' + ').replace(/\+ -/g, '− ') || '0', note: `Truncated at degree ${order}; approximation is local to the chosen center.` }
  }

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
    const expression = parse(normalizeMathSource(source))
    const scope = { ...definitions, a: options.a, x: point }
    const at = (node: MathNode) => {
      try { return Number(node.compile().evaluate(scope)) } catch { return Number.NaN }
    }
    let quotient = expression
    for (let order = 0; order <= 5; order += 1) {
      if (quotient.type !== 'OperatorNode' || (quotient as MathNode & { op: string }).op !== '/') break
      const [numerator, denominator] = (quotient as MathNode & { args: MathNode[] }).args
      const top = at(numerator); const bottom = at(denominator)
      if (Number.isFinite(top) && Number.isFinite(bottom) && Math.abs(bottom) > 1e-12) {
        return { title: order ? 'Limit (l’Hôpital reduction)' : 'Limit by substitution', value: numberText(top / bottom), note: order ? `Applied l’Hôpital’s rule ${order} time(s) to a quotient with numerator and denominator both approaching zero. Confirm differentiability conditions near x = ${numberText(point)}.` : 'Direct substitution gives a finite value.' }
      }
      if (order === 5 || !Number.isFinite(top) || !Number.isFinite(bottom) || Math.abs(top) > 1e-10 || Math.abs(bottom) > 1e-10) break
      quotient = parse(`(${derivative(numerator, 'x').toString()})/(${derivative(denominator, 'x').toString()})`)
    }
    const direction = options.direction ?? 'both'
    const samples = [1e-3, 1e-4, 1e-5].map((offset) => ({
      left: compiled.evaluate({ ...definitions, x: point - offset, a: options.a }),
      right: compiled.evaluate({ ...definitions, x: point + offset, a: options.a }),
    }))
    const { left, right } = samples.at(-1)!
    const approaches = direction === 'left' ? [left] : direction === 'right' ? [right] : [left, right]
    const sideSamples = direction === 'left' ? samples.map((sample) => sample.left) : direction === 'right' ? samples.map((sample) => sample.right) : []
    const sideIsStable = sideSamples.length < 2 || Math.abs(sideSamples[2] - sideSamples[1]) <= 0.02 * Math.max(1, Math.abs(sideSamples[2]))
    if (approaches.some((value) => !Number.isFinite(value)) || !sideIsStable || (approaches.length === 2 && Math.abs(left - right) > 1e-3 * Math.max(1, Math.abs(left), Math.abs(right)))) {
      return { title: 'Numerical limit', value: 'No common finite limit detected', note: 'A numerical probe cannot prove that a limit exists or does not exist.' }
    }
    const result = direction === 'left' ? left : direction === 'right' ? right : (left + right) / 2
    return { title: direction === 'both' ? 'Two-sided numerical limit' : `${direction === 'left' ? 'Left' : 'Right'}-hand numerical limit`, value: `≈ ${numberText(result)}`, note: `${direction === 'both' ? 'Probed from both sides' : `Probed from the ${direction}`} near x = ${numberText(point)}; this is not a symbolic proof.` }
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
