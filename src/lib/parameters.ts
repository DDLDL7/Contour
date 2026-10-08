export interface ParameterRange { min: number; max: number; step: number }
export interface SliderParameter extends ParameterRange { name: string; value: number }

// Coordinate and curve parameter letters have dedicated meanings in graph expressions.
export const availableParameterNames = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 's', 'w'] as const
export const defaultParameterRange: ParameterRange = { min: -5, max: 5, step: 0.1 }

export function defaultRangeFor(value: number): ParameterRange {
  return { min: Math.min(-5, Math.floor(value)), max: Math.max(5, Math.ceil(value)), step: 0.1 }
}

export function isParameterRange(value: unknown): value is ParameterRange {
  if (!value || typeof value !== 'object') return false
  const range = value as Partial<ParameterRange>
  return typeof range.min === 'number' && Number.isFinite(range.min)
    && typeof range.max === 'number' && Number.isFinite(range.max)
    && typeof range.step === 'number' && Number.isFinite(range.step)
    && range.min < range.max && range.step > 0 && range.step <= range.max - range.min
}

export function isSliderParameter(value: unknown): value is SliderParameter {
  if (!isParameterRange(value)) return false
  const parameter = value as SliderParameter
  return typeof parameter.name === 'string' && availableParameterNames.includes(parameter.name as typeof availableParameterNames[number])
    && typeof parameter.value === 'number' && Number.isFinite(parameter.value)
    && parameter.value >= parameter.min && parameter.value <= parameter.max
}

export function areSliderParameters(value: unknown): value is SliderParameter[] {
  return Array.isArray(value) && value.length <= availableParameterNames.length
    && value.every(isSliderParameter)
    && new Set(value.map((parameter) => parameter.name)).size === value.length
}

export function unusedParameterNames(expressions: readonly { text: string }[], parameters: readonly SliderParameter[]): string[] {
  const used = new Set(parameters.map((parameter) => parameter.name))
  for (const row of expressions) {
    const name = /^\s*([a-z])\s*=/.exec(row.text)?.[1]
    if (name) used.add(name)
  }
  return availableParameterNames.filter((name) => !used.has(name))
}

export function nextParameterName(expressions: readonly { text: string }[], parameters: readonly SliderParameter[]): string | null {
  return unusedParameterNames(expressions, parameters)[0] ?? null
}
