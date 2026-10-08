import { FunctionNode, parse, SymbolNode, type MathNode } from 'mathjs'

export type GraphKind = 'curve' | 'vertical' | 'surface' | 'spaceCurve' | 'polar' | 'parametric' | 'implicit' | 'inequality'
export type RelationOperator = '=' | '<' | '<=' | '>' | '>='

export interface GraphExpression {
  kind: GraphKind
  label: string
  inferredFunctions: string[]
  relation?: RelationOperator
  evaluate: (x: number, y: number, a: number) => number
  evaluateY?: (t: number, y: number, a: number) => number
  evaluateZ?: (t: number, y: number, a: number) => number
}

export interface PlottableGraph {
  id: string
  color: string
  visible: boolean
  graph: GraphExpression
}

const allowedFunctions = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'abs', 'exp',
  'log', 'log10', 'floor', 'ceil', 'round', 'sign',
  'min', 'max',
])
const unaryFunctions = new Set([...allowedFunctions].filter((name) => name !== 'min' && name !== 'max'))
const allowedOperators = new Set(['+', '-', '*', '/', '^'])
const allowedNodes = new Set([
  'ConstantNode', 'SymbolNode', 'OperatorNode',
  'FunctionNode', 'ParenthesisNode',
])

function validate(node: MathNode, symbols: ReadonlySet<string>, defaultVariable: string, parent?: MathNode): void {
  if (!allowedNodes.has(node.type)) {
    throw new Error('Use numbers, variables, and supported maths functions.')
  }

  if (node.type === 'SymbolNode') {
    const name = (node as MathNode & { name: string }).name
    if (allowedFunctions.has(name) && parent?.type !== 'FunctionNode') {
      throw new Error(`Add an argument to “${name}”, such as ${name}(${defaultVariable}).`)
    }
    if (!symbols.has(name) && !allowedFunctions.has(name)) {
      throw new Error(`Unknown symbol “${name}”.`)
    }
  }

  if (node.type === 'FunctionNode') {
    const fnNode = node as MathNode & { fn: MathNode & { name?: string } }
    if (fnNode.fn.type !== 'SymbolNode' || !allowedFunctions.has(fnNode.fn.name ?? '')) {
      throw new Error('This function is not supported for graphing.')
    }
  }

  if (node.type === 'OperatorNode') {
    const operator = (node as MathNode & { op: string }).op
    if (!allowedOperators.has(operator)) {
      throw new Error(`The “${operator}” operator is not supported for graphing.`)
    }
  }

  node.forEach((child) => validate(child, symbols, defaultVariable, node))
}

interface CompiledFormula {
  inferredFunctions: string[]
  symbols: string[]
  evaluate: (scope: Record<string, number>) => number
}

function compileFormula(source: string, variables: string[], defaultVariable: string, inferFunctions = true): CompiledFormula {
  if (!source.trim()) throw new Error('Finish the expression before graphing it.')
  // MathLive emits `sin x` for a function applied to a single symbol.
  const normalized = source.replace(
    /(?<![A-Za-z_])(sin|cos|tan)\s+(theta|[xyat])(\s*\^\s*\d+(?:\.\d+)?)?/g,
    (_match, name: string, variable: string, power: string = '') => `${name}(${variable}${power})`,
  )
  let tree: MathNode
  try {
    tree = parse(normalized)
  } catch {
    throw new Error('Check the expression for a missing number, bracket, or operator.')
  }

  const inferredFunctions = new Set<string>()
  tree = tree.transform((node, _path, parent) => {
    if (!inferFunctions) return node
    if (node.type !== 'SymbolNode' || parent?.type === 'FunctionNode') return node
    const name = (node as SymbolNode).name
    if (!unaryFunctions.has(name)) return node
    inferredFunctions.add(name)
    return new FunctionNode(new SymbolNode(name), [new SymbolNode(defaultVariable)])
  })
  validate(tree, new Set([...variables, 'a', 'pi', 'e']), defaultVariable)
  const symbols = new Set<string>()
  tree.traverse((node, _path, parent) => {
    if (node.type !== 'SymbolNode' || (parent?.type === 'FunctionNode' && (parent as FunctionNode).fn === node)) return
    symbols.add((node as SymbolNode).name)
  })
  const compiled = tree.compile()
  return {
    inferredFunctions: [...inferredFunctions],
    symbols: [...symbols],
    evaluate: (scope) => {
      try {
        const value: unknown = compiled.evaluate(scope)
        return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
      } catch {
        return Number.NaN
      }
    },
  }
}

export interface ScalarDefinition {
  dependencies: string[]
  evaluate: (scope: Record<string, number>) => number
}

export function compileScalarDefinition(source: string, names: string[]): ScalarDefinition {
  const formula = compileFormula(source, names, 'a', false)
  return {
    dependencies: formula.symbols.filter((name) => names.includes(name)),
    evaluate: formula.evaluate,
  }
}

function splitTopLevelParts(input: string): string[] {
  let depth = 0
  let start = 0
  const parts: string[] = []
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && (character === ',' || character === ';')) {
      parts.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(input.slice(start).trim())
  return parts
}

function splitTopLevelRelation(input: string): { left: string; right: string; operator: RelationOperator } | null {
  let depth = 0
  let found: { left: string; right: string; operator: RelationOperator } | null = null
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth !== 0 || !'=<>≤≥'.includes(character)) continue
    if (found) throw new Error('Use one equality or inequality per expression.')
    const next = input[index + 1]
    const operator = character === '≤' ? '<=' : character === '≥' ? '>='
      : ((character === '<' || character === '>') && next === '=' ? `${character}=` : character) as RelationOperator
    const length = operator.length === 2 && character !== '≤' && character !== '≥' ? 2 : 1
    found = { left: input.slice(0, index).trim(), right: input.slice(index + length).trim(), operator }
    index += length - 1
  }
  return found
}

export function compileGraph(input: string, definitions: Readonly<Record<string, number>> = {}): GraphExpression {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter an expression to graph.')
  const names = Object.keys(definitions)

  const parts = splitTopLevelParts(trimmed)
  if ((parts.length === 2 || parts.length === 3) && /^x\s*=/i.test(parts[0]) && /^y\s*=/i.test(parts[1]) && (parts.length === 2 || /^z\s*=/i.test(parts[2]))) {
    const xSource = parts[0].replace(/^x\s*=/i, '').trim()
    const ySource = parts[1].replace(/^y\s*=/i, '').trim()
    const xFormula = compileFormula(xSource, ['t', ...names], 't')
    const yFormula = compileFormula(ySource, ['t', ...names], 't')
    const zFormula = parts.length === 3 ? compileFormula(parts[2].replace(/^z\s*=/i, '').trim(), ['t', ...names], 't') : null
    return {
      kind: zFormula ? 'spaceCurve' : 'parametric',
      label: trimmed,
      inferredFunctions: [...new Set([...xFormula.inferredFunctions, ...yFormula.inferredFunctions, ...(zFormula?.inferredFunctions ?? [])])],
      evaluate: (t, _y, a) => xFormula.evaluate({ ...definitions, t, a }),
      evaluateY: (t, _y, a) => yFormula.evaluate({ ...definitions, t, a }),
      evaluateZ: zFormula ? (t, _y, a) => zFormula.evaluate({ ...definitions, t, a }) : undefined,
    }
  }

  const relation = splitTopLevelRelation(trimmed)
  if (relation && !(relation.operator === '=' && /^[xyzr]$/i.test(relation.left))) {
    const left = compileFormula(relation.left, ['x', 'y', ...names], 'x')
    const right = compileFormula(relation.right, ['x', 'y', ...names], 'x')
    return {
      kind: relation.operator === '=' ? 'implicit' : 'inequality',
      label: trimmed,
      relation: relation.operator,
      inferredFunctions: [...new Set([...left.inferredFunctions, ...right.inferredFunctions])],
      evaluate: (x, y, a) => left.evaluate({ ...definitions, x, y, a }) - right.evaluate({ ...definitions, x, y, a }),
    }
  }

  const target = relation?.left.toLowerCase() ?? 'y'
  const source = relation?.right ?? trimmed
  const kind: GraphKind = target === 'z' ? 'surface' : target === 'x' ? 'vertical' : target === 'r' ? 'polar' : 'curve'
  const variables = kind === 'surface' ? ['x', 'y'] : kind === 'curve' ? ['x'] : kind === 'polar' ? ['theta'] : []
  const defaultVariable = kind === 'polar' ? 'theta' : 'x'
  const formula = compileFormula(source, [...variables, ...names], defaultVariable)

  return {
    kind,
    label: `${target} = ${source}`,
    inferredFunctions: formula.inferredFunctions,
    evaluate: (x, y, a) => formula.evaluate(kind === 'polar' ? { ...definitions, theta: x, a } : { ...definitions, x, y, a }),
  }
}

export function evaluatePlanarPoint(graph: GraphExpression, parameter: number, a: number): [number, number] {
  const first = graph.evaluate(parameter, 0, a)
  if (graph.kind === 'polar') {
    return [first * Math.cos(parameter), first * Math.sin(parameter)]
  }
  if (graph.kind === 'parametric') {
    return [first, graph.evaluateY?.(parameter, 0, a) ?? Number.NaN]
  }
  return [Number.NaN, Number.NaN]
}

export function evaluateSpatialPoint(graph: GraphExpression, parameter: number, a: number): [number, number, number] {
  if (graph.kind !== 'spaceCurve') return [Number.NaN, Number.NaN, Number.NaN]
  return [
    graph.evaluate(parameter, 0, a),
    graph.evaluateY?.(parameter, 0, a) ?? Number.NaN,
    graph.evaluateZ?.(parameter, 0, a) ?? Number.NaN,
  ]
}

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  return Object.is(rounded, -0) ? '0' : `${rounded}`
}
