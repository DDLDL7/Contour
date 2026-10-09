import { compileScalarDefinition } from './math'

export interface SpreadsheetSheet { id: string; name: string; cells: Record<string, string> }
export interface SpreadsheetData { cells: Record<string, string>; sheets?: SpreadsheetSheet[]; activeSheetId?: string }
export interface SpreadsheetValue { raw: string; value: number | null; error?: string }

export const spreadsheetColumns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
export const spreadsheetRows = 18
export const emptySpreadsheet = (): SpreadsheetData => ({ cells: {} })

export function spreadsheetSheets(data: SpreadsheetData): SpreadsheetSheet[] {
  if (data.sheets?.length) return data.sheets
  return [{ id: 'sheet-1', name: 'Sheet 1', cells: data.cells }]
}

export function activeSpreadsheetSheet(data: SpreadsheetData, id = data.activeSheetId): SpreadsheetSheet {
  const sheets = spreadsheetSheets(data)
  return sheets.find((sheet) => sheet.id === id) ?? sheets[0]
}

export function isSpreadsheetData(value: unknown): value is SpreadsheetData {
  if (!value || typeof value !== 'object' || !('cells' in value) || !value.cells || typeof value.cells !== 'object') return false
  const validCells = (cells: unknown) => Boolean(cells && typeof cells === 'object' && Object.entries(cells).every(([address, cell]) => /^[A-H](?:[1-9]|1[0-8])$/.test(address) && typeof cell === 'string' && cell.length <= 500))
  const data = value as Partial<SpreadsheetData>
  if (!validCells(data.cells)) return false
  if (data.sheets !== undefined && (!Array.isArray(data.sheets) || data.sheets.length < 1 || data.sheets.length > 20 || data.sheets.some((sheet) => !sheet || typeof sheet.id !== 'string' || !/^[\w-]{1,40}$/.test(sheet.id) || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 40 || !validCells(sheet.cells)))) return false
  if (data.sheets && new Set(data.sheets.map((sheet) => sheet.id)).size !== data.sheets.length) return false
  return data.activeSheetId === undefined || data.sheets?.some((sheet) => sheet.id === data.activeSheetId) === true
}

export function evaluateSpreadsheet(data: SpreadsheetData, definitions: Readonly<Record<string, number>> = {}, parameterA = 1, selectedSheetId?: string): Record<string, SpreadsheetValue> {
  const sheets = spreadsheetSheets(data)
  const selectedSheet = activeSpreadsheetSheet(data, selectedSheetId)
  const byName = new Map(sheets.map((sheet) => [sheet.name.toLowerCase(), sheet]))
  const values: Record<string, SpreadsheetValue> = {}
  const visiting = new Set<string>()
  const workspaceNames = Object.keys(definitions).filter((name) => /^[a-z]$/.test(name))
  const resolve = (sheet: SpreadsheetSheet, address: string): number => {
    const key = `${sheet.id}:${address}`
    if (values[key]) return values[key].value ?? Number.NaN
    const raw = sheet.cells[address] ?? ''
    if (!raw.trim()) { values[key] = { raw, value: null }; return Number.NaN }
    if (visiting.has(key)) { values[key] = { raw, value: null, error: 'Circular cell reference' }; return Number.NaN }
    const literal = Number(raw)
    if (Number.isFinite(literal) && raw.trim() !== '') { values[key] = { raw, value: literal }; return literal }
    if (!raw.startsWith('=')) { values[key] = { raw, value: null }; return Number.NaN }
    visiting.add(key)
    try {
      const references: { sheet: SpreadsheetSheet; address: string; symbol: string }[] = []
      const expression = raw.slice(1).replace(/(?:'([^']+)'|([A-Za-z][\w-]*))!([A-H](?:[1-9]|1[0-8]))/g, (_match, quoted: string | undefined, plain: string | undefined, address: string) => {
        const sheetName = quoted ?? plain ?? ''
        const target = byName.get(sheetName.toLowerCase())
        if (!target) throw new Error(`Unknown sheet “${sheetName}”.`)
        const symbol = `cell_${references.length}`
        references.push({ sheet: target, address, symbol })
        return symbol
      }).replace(/\b([A-H](?:[1-9]|1[0-8]))\b/g, (_match, address: string) => {
        const symbol = `cell_${references.length}`
        references.push({ sheet, address, symbol })
        return symbol
      })
      const dependencyNames = [...new Set([...references.map((ref) => ref.symbol), ...workspaceNames, 'a'])]
      const compiled = compileScalarDefinition(expression, dependencyNames)
      const scope: Record<string, number> = { ...definitions, a: parameterA }
      for (const ref of references) {
        scope[ref.symbol] = resolve(ref.sheet, ref.address)
        const dependency = values[`${ref.sheet.id}:${ref.address}`]
        const dependencyError = dependency?.error
        if (dependencyError) throw new Error(dependencyError)
        if (dependency?.value === null) throw new Error(`${ref.address} does not contain a number`)
      }
      const result = compiled.evaluate(scope)
      if (!Number.isFinite(result)) throw new Error('Formula did not produce a finite number')
      values[key] = { raw, value: result }
      return result
    } catch (error) {
      values[key] = { raw, value: null, error: error instanceof Error ? error.message : 'Invalid formula' }
      return Number.NaN
    } finally {
      visiting.delete(key)
    }
  }
  for (const sheet of sheets) for (const address of new Set([...Object.keys(sheet.cells), ...spreadsheetColumns.flatMap((column) => Array.from({ length: spreadsheetRows }, (_, i) => `${column}${i + 1}`))])) resolve(sheet, address)
  return Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith(`${selectedSheet.id}:`)).map(([key, value]) => [key.slice(selectedSheet.id.length + 1), value]))
}

export function fitLinear(points: { x: number; y: number }[]) {
  const fit = fitRegression(points, 'linear')
  return fit ? { slope: fit.coefficients[1], intercept: fit.coefficients[0], rSquared: fit.rSquared } : null
}

export type RegressionKind = 'linear' | 'exponential' | 'quadratic'
export interface RegressionFit { coefficients: number[]; rSquared: number; predict: (x: number) => number }

function solveSystem(matrix: number[][], values: number[]): number[] | null {
  const size = values.length
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let entry = column; entry <= size; entry += 1) augmented[row][entry] -= factor * augmented[column][entry]
    }
  }
  return augmented.map((row) => row[size])
}

export function fitRegression(points: { x: number; y: number }[], kind: RegressionKind): RegressionFit | null {
  const degree = kind === 'quadratic' ? 2 : 1
  if (points.length < degree + 1 || (kind === 'exponential' && points.some((point) => point.y <= 0))) return null
  const transformed = kind === 'exponential' ? points.map((point) => ({ x: point.x, y: Math.log(point.y) })) : points
  const matrix = Array.from({ length: degree + 1 }, (_, row) => Array.from({ length: degree + 1 }, (_, column) => transformed.reduce((sum, point) => sum + point.x ** (row + column), 0)))
  const rhs = Array.from({ length: degree + 1 }, (_, power) => transformed.reduce((sum, point) => sum + point.y * point.x ** power, 0))
  const solved = solveSystem(matrix, rhs)
  if (!solved) return null
  const coefficients = kind === 'exponential' ? [Math.exp(solved[0]), solved[1]] : solved
  const predict = (x: number) => kind === 'exponential'
    ? coefficients[0] * Math.exp(coefficients[1] * x)
    : coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0)
  if (points.some((point) => !Number.isFinite(predict(point.x)))) return null
  const mean = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const total = points.reduce((sum, point) => sum + (point.y - mean) ** 2, 0)
  const residual = points.reduce((sum, point) => sum + (point.y - predict(point.x)) ** 2, 0)
  return { coefficients, rSquared: total === 0 ? (residual < 1e-12 ? 1 : 0) : 1 - residual / total, predict }
}
