import { compileGraph, compileScalarDefinition, type GraphExpression } from './math'
import type { ExpressionRow } from './project'

export interface CompiledWorkspaceRow extends ExpressionRow {
  graph?: GraphExpression
  definition?: { name: string; value: number }
  error?: string
}

const graphTargets = new Set(['x', 'y', 'z', 'r'])
const reservedNames = new Set(['a', 'e', 'i', 't'])

function definitionName(text: string): string | null {
  const match = /^\s*([a-z])\s*=/.exec(text)
  return match && !graphTargets.has(match[1]) ? match[1] : null
}

export function compileWorkspace(rows: ExpressionRow[], parameterA: number): CompiledWorkspaceRow[] {
  const names = rows.map((row) => definitionName(row.text))
  const counts = new Map<string, number>()
  for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1)

  const definitions = new Map<string, ReturnType<typeof compileScalarDefinition>>()
  const errors = new Map<string, string>()
  const allowedNames = [...counts.keys()].filter((name) => !reservedNames.has(name))
  rows.forEach((row, index) => {
    const name = names[index]
    if (!name) return
    if (reservedNames.has(name)) {
      errors.set(name, name === 'a' ? '“a” is controlled by the slider.' : `“${name}” is reserved. Choose another letter.`)
    } else if (counts.get(name)! > 1) {
      errors.set(name, `“${name}” is defined more than once.`)
    } else {
      try {
        definitions.set(name, compileScalarDefinition(row.text.slice(row.text.indexOf('=') + 1), allowedNames))
      } catch (error) {
        errors.set(name, error instanceof Error ? error.message : 'Could not evaluate this variable.')
      }
    }
  })

  const values = new Map<string, number>()
  const visiting = new Set<string>()
  const resolve = (name: string, trail: string[]): number => {
    if (values.has(name)) return values.get(name)!
    if (errors.has(name)) return Number.NaN
    if (visiting.has(name)) {
      const cycle = [...trail.slice(trail.indexOf(name)), name]
      for (const member of cycle.slice(0, -1)) errors.set(member, `Circular definition: ${cycle.join(' → ')}.`)
      return Number.NaN
    }
    const definition = definitions.get(name)
    if (!definition) return Number.NaN
    visiting.add(name)
    const scope: Record<string, number> = { a: parameterA }
    for (const dependency of definition.dependencies) {
      scope[dependency] = resolve(dependency, [...trail, name])
      if (!Number.isFinite(scope[dependency]) && !errors.has(name)) {
        errors.set(name, `“${name}” depends on “${dependency}”, which has an error.`)
      }
    }
    visiting.delete(name)
    if (errors.has(name)) return Number.NaN
    const value = definition.evaluate(scope)
    if (!Number.isFinite(value)) {
      errors.set(name, `“${name}” has no finite value at a = ${parameterA}.`)
      return Number.NaN
    }
    values.set(name, value)
    return value
  }
  for (const name of allowedNames) resolve(name, [])

  const scope = Object.fromEntries(values)
  return rows.map((row, index) => {
    const name = names[index]
    if (name) {
      const error = errors.get(name)
      return error ? { ...row, error } : { ...row, definition: { name, value: values.get(name)! } }
    }
    if (!row.text.trim()) return { ...row }
    try {
      return { ...row, graph: compileGraph(row.text, scope) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This expression could not be graphed.'
      const unknown = /^Unknown symbol “([^”]+)”\.$/.exec(message)?.[1]
      return { ...row, error: unknown && errors.has(unknown) ? `Fix the definition of “${unknown}” first.` : message }
    }
  })
}
