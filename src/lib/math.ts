import { FunctionNode, parse, SymbolNode, type MathNode } from 'mathjs'

export type GraphKind = 'curve' | 'vertical' | 'surface' | 'spaceCurve' | 'parametricSurface' | 'implicitSurface' | 'polar' | 'parametric' | 'implicit' | 'inequality'
export type RelationOperator = '=' | '<' | '<=' | '>' | '>='

export interface GraphExpression {
  kind: GraphKind
  label: string
  source: string
  definitions: Readonly<Record<string, number>>
  inferredFunctions: string[]
  relation?: RelationOperator
  evaluate: (x: number, y: number, a: number) => number
  evaluateY?: (t: number, y: number, a: number) => number
  evaluateZ?: (t: number, y: number, a: number) => number
  evaluate3D?: (x: number, y: number, z: number, a: number) => number
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

export function normalizeMathSource(source: string): string {
  // MathLive emits `sin x` for a function applied to a single symbol.
  return source.replace(
    /(?<![A-Za-z_])(sin|cos|tan)\s+(theta|[xyat])(\s*\^\s*\d+(?:\.\d+)?)?/g,
    (_match, name: string, variable: string, power: string = '') => `${name}(${variable}${power})`,
  )
}

function compileFormula(source: string, variables: string[], defaultVariable: string, inferFunctions = true): CompiledFormula {
  if (!source.trim()) throw new Error('Finish the expression before graphing it.')
  const normalized = normalizeMathSource(source)
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
    if (character === '(' || character === '{') depth += 1
    if (character === ')' || character === '}') depth -= 1
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
    if (character === '(' || character === '{') depth += 1
    if (character === ')' || character === '}') depth -= 1
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

function compileCondition(source: string, definitions: Readonly<Record<string, number>>): (x: number, a: number) => boolean {
  const relation = splitTopLevelRelation(source)
  if (!relation) throw new Error('Use a condition such as x < 0.')
  const names = ['x', ...Object.keys(definitions)]
  const left = compileFormula(relation.left, names, 'x')
  const right = compileFormula(relation.right, names, 'x')
  return (x, a) => {
    const scope = { ...definitions, x, a }
    const first = left.evaluate(scope)
    const second = right.evaluate(scope)
    if (!Number.isFinite(first) || !Number.isFinite(second)) return false
    switch (relation.operator) {
      case '<': return first < second
      case '<=': return first <= second
      case '>': return first > second
      case '>=': return first >= second
      case '=': return Math.abs(first - second) < 1e-10
    }
  }
}

export function compileGraph(input: string, definitions: Readonly<Record<string, number>> = {}): GraphExpression {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter an expression to graph.')
  const names = Object.keys(definitions)

  const parts = splitTopLevelParts(trimmed)
  if ((parts.length === 2 || parts.length === 3) && /^x\s*=/i.test(parts[0]) && /^y\s*=/i.test(parts[1]) && (parts.length === 2 || /^z\s*=/i.test(parts[2]))) {
    const xSource = parts[0].replace(/^x\s*=/i, '').trim()
    const ySource = parts[1].replace(/^y\s*=/i, '').trim()
    const axes = parts.length === 3 ? ['t', 'u', 'v', ...names] : ['t', ...names]
    const xFormula = compileFormula(xSource, axes, 't')
    const yFormula = compileFormula(ySource, axes, 't')
    const zFormula = parts.length === 3 ? compileFormula(parts[2].replace(/^z\s*=/i, '').trim(), axes, 't') : null
    const symbols = new Set([...xFormula.symbols, ...yFormula.symbols, ...(zFormula?.symbols ?? [])])
    const isSurface = Boolean(zFormula && (symbols.has('u') || symbols.has('v')))
    if (isSurface && symbols.has('t')) throw new Error('Use u and v for a surface, or t for a space curve.')
    return {
      kind: isSurface ? 'parametricSurface' : zFormula ? 'spaceCurve' : 'parametric',
      label: trimmed,
      source: trimmed,
      definitions,
      inferredFunctions: [...new Set([...xFormula.inferredFunctions, ...yFormula.inferredFunctions, ...(zFormula?.inferredFunctions ?? [])])],
      evaluate: (first, second, a) => xFormula.evaluate(isSurface ? { ...definitions, u: first, v: second, a } : { ...definitions, t: first, a }),
      evaluateY: (first, second, a) => yFormula.evaluate(isSurface ? { ...definitions, u: first, v: second, a } : { ...definitions, t: first, a }),
      evaluateZ: zFormula ? (first, second, a) => zFormula.evaluate(isSurface ? { ...definitions, u: first, v: second, a } : { ...definitions, t: first, a }) : undefined,
    }
  }

  const relation = splitTopLevelRelation(trimmed)
  if (relation && !(relation.operator === '=' && /^[xyzr]$/i.test(relation.left))) {
    const left = compileFormula(relation.left, ['x', 'y', 'z', ...names], 'x')
    const right = compileFormula(relation.right, ['x', 'y', 'z', ...names], 'x')
    const usesZ = left.symbols.includes('z') || right.symbols.includes('z')
    if (usesZ && relation.operator !== '=') throw new Error('3D inequalities are not supported yet.')
    return {
      kind: usesZ ? 'implicitSurface' : relation.operator === '=' ? 'implicit' : 'inequality',
      label: trimmed,
      source: trimmed,
      definitions,
      relation: relation.operator,
      inferredFunctions: [...new Set([...left.inferredFunctions, ...right.inferredFunctions])],
      evaluate: (x, y, a) => left.evaluate({ ...definitions, x, y, a }) - right.evaluate({ ...definitions, x, y, a }),
      evaluate3D: usesZ ? (x, y, z, a) => left.evaluate({ ...definitions, x, y, z, a }) - right.evaluate({ ...definitions, x, y, z, a }) : undefined,
    }
  }

  const target = relation?.left.toLowerCase() ?? 'y'
  const source = relation?.right ?? trimmed
  const kind: GraphKind = target === 'z' ? 'surface' : target === 'x' ? 'vertical' : target === 'r' ? 'polar' : 'curve'
  const variables = kind === 'surface' ? ['x', 'y'] : kind === 'curve' ? ['x'] : kind === 'polar' ? ['theta'] : []
  const defaultVariable = kind === 'polar' ? 'theta' : 'x'
  if (kind === 'curve' && source.startsWith('{') && source.endsWith('}')) {
    const pieces = splitTopLevelParts(source.slice(1, -1)).map((piece) => {
      const colon = piece.indexOf(':')
      if (colon < 0) throw new Error('Write each piece as condition: expression.')
      return {
        matches: compileCondition(piece.slice(0, colon), definitions),
        formula: compileFormula(piece.slice(colon + 1), ['x', ...names], 'x'),
      }
    })
    if (pieces.length === 0) throw new Error('Add at least one piece.')
    return {
      kind, label: `${target} = ${source}`, source: trimmed, definitions,
      inferredFunctions: [...new Set(pieces.flatMap((piece) => piece.formula.inferredFunctions))],
      evaluate: (x, _y, a) => pieces.find((piece) => piece.matches(x, a))?.formula.evaluate({ ...definitions, x, a }) ?? Number.NaN,
    }
  }
  const restricted = kind === 'curve' ? /^(.*?)\s*\{([^{}]+)\}$/.exec(source) : null
  const condition = restricted ? compileCondition(restricted[2], definitions) : null
  const formula = compileFormula(restricted ? restricted[1] : source, [...variables, ...names], defaultVariable)

  return {
    kind,
    label: `${target} = ${source}`,
    source: trimmed,
    definitions,
    inferredFunctions: formula.inferredFunctions,
    evaluate: (x, y, a) => condition && !condition(x, a) ? Number.NaN : formula.evaluate(kind === 'polar' ? { ...definitions, theta: x, a } : { ...definitions, x, y, a }),
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
