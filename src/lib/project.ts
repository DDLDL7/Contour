import { geometryIsConsistent, isGeometryObject, type GeometryObject } from './geometry'
import { emptySpreadsheet, isSpreadsheetData, type SpreadsheetData } from './spreadsheet'
import { isSolidObject, isVectorFieldObject, type SolidObject, type VectorFieldObject } from './solids'
import { areSliderParameters, defaultParameterRange, defaultRangeFor, isParameterRange, type ParameterRange, type SliderParameter } from './parameters'
import { areNotebookCells, type NotebookCell } from './notebook'

export interface ExpressionRow {
  id: string
  text: string
  latex?: string
  color: string
  visible: boolean
}

export interface Project {
  version: number
  title: string
  expressions: ExpressionRow[]
  geometry: GeometryObject[]
  spreadsheet: SpreadsheetData
  solids: SolidObject[]
  vectorFields: VectorFieldObject[]
  parameterA: number
  parameterARange: ParameterRange
  parameters: SliderParameter[]
  notebook: NotebookCell[]
  updatedAt: string
}

export const PROJECT_KEY = 'contour-project-v1'
export const PROJECT_VERSION = 2

export const graphColors = ['#286fc0', '#df7752', '#29967a', '#805fc2', '#c39a24']

const legacyStarterExpressions = [
  'y = a*sin(x)',
  'y = 0.15*x^2 - 2',
  'z = a/2*sin(sqrt(x^2 + y^2))',
]
const legacyStarterCells: Record<string, string> = { A1: 'x', B1: 'y', A2: '1', B2: '2', A3: '2', B3: '3', A4: '3', B4: '5', A5: '4', B5: '4' }

/** Only migrate the untouched, automatically saved sample workspace. */
export function isUntouchedLegacyStarter(value: Partial<Project>): boolean {
  const noObjects = (items: unknown) => items === undefined || (Array.isArray(items) && items.length === 0)
  const range = value.parameterARange
  const sheet = value.spreadsheet
  return value.title === 'My graphs' && value.parameterA === 2
    && Array.isArray(value.expressions) && value.expressions.length === legacyStarterExpressions.length
    && value.expressions.every((row, index) => row.text === legacyStarterExpressions[index]
      && row.color === graphColors[index] && row.visible === true && row.latex === undefined)
    && noObjects(value.geometry) && noObjects(value.solids) && noObjects(value.vectorFields) && noObjects(value.parameters)
    && noObjects(value.notebook)
    && (range === undefined || (range.min === -5 && range.max === 5 && range.step === 0.1 && (range.animationSeconds === undefined || range.animationSeconds === 4)))
    && (sheet === undefined || (sheet.sheets === undefined && sheet.activeSheetId === undefined
      && Object.keys(sheet.cells).length === Object.keys(legacyStarterCells).length
      && Object.entries(legacyStarterCells).every(([address, cell]) => sheet.cells[address] === cell)))
}

export function starterProject(): Project {
  return {
    version: PROJECT_VERSION,
    title: 'Untitled project',
    expressions: [],
    geometry: [],
    spreadsheet: emptySpreadsheet(),
    solids: [],
    vectorFields: [],
    parameterA: 1,
    parameterARange: { ...defaultParameterRange },
    parameters: [],
    notebook: [],
    updatedAt: new Date().toISOString(),
  }
}

export function loadProject(): Project {
  try {
    const saved = localStorage.getItem(PROJECT_KEY)
    if (!saved) return starterProject()
    const parsed: unknown = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') return starterProject()
    const project = parsed as Partial<Project>
    if (project.version !== undefined && project.version !== 1 && project.version !== PROJECT_VERSION) return starterProject()
    if (
      typeof project.title !== 'string' ||
      !Array.isArray(project.expressions) ||
      typeof project.parameterA !== 'number' || !Number.isFinite(project.parameterA)
    ) return starterProject()
    if (isUntouchedLegacyStarter(project)) return starterProject()

    const expressions = project.expressions.filter((row): row is ExpressionRow =>
      typeof row?.id === 'string' && typeof row.text === 'string' &&
      (row.latex === undefined || typeof row.latex === 'string') &&
      typeof row.color === 'string' && typeof row.visible === 'boolean',
    )
    const geometry = Array.isArray(project.geometry) && project.geometry.every(isGeometryObject) ? project.geometry : []
    const spreadsheet = isSpreadsheetData(project.spreadsheet) ? project.spreadsheet : emptySpreadsheet()
    const solids = Array.isArray(project.solids) && project.solids.every(isSolidObject) ? project.solids : []
    const vectorFields = Array.isArray(project.vectorFields) && project.vectorFields.every(isVectorFieldObject) ? project.vectorFields : []
    const notebook = areNotebookCells(project.notebook) ? project.notebook : []
    return {
      version: PROJECT_VERSION,
      title: project.title,
      expressions,
      geometry: geometryIsConsistent(geometry) ? geometry : [],
      spreadsheet,
      solids,
      vectorFields,
      parameterA: project.parameterA,
      parameterARange: isParameterRange(project.parameterARange) && project.parameterA >= project.parameterARange.min && project.parameterA <= project.parameterARange.max ? project.parameterARange : defaultRangeFor(project.parameterA),
      parameters: areSliderParameters(project.parameters) ? project.parameters : [],
      notebook,
      updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : new Date().toISOString(),
    }
  } catch {
    return starterProject()
  }
}

export function saveProject(project: Project): void {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
}

export function downloadProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${project.title.trim().replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'contour-project'}.contour.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseProjectFile(value: string): Project {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') throw new Error('This is not a Contour project.')
  const candidate = parsed as Partial<Project>
  if (candidate.version !== undefined && candidate.version !== 1 && candidate.version !== PROJECT_VERSION) throw new Error('This project was created by a newer version of Contour.')
  if (
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.expressions) ||
    !candidate.expressions.every((row) =>
      typeof row?.id === 'string' && typeof row.text === 'string' &&
      (row.latex === undefined || typeof row.latex === 'string') &&
      typeof row.color === 'string' && typeof row.visible === 'boolean',
    ) ||
    typeof candidate.parameterA !== 'number' ||
    !Number.isFinite(candidate.parameterA)
  ) throw new Error('This project file is incomplete or damaged.')
  const geometry = candidate.geometry === undefined ? [] : candidate.geometry
  if (!Array.isArray(geometry) || !geometry.every(isGeometryObject) || !geometryIsConsistent(geometry)) {
    throw new Error('This project contains invalid geometry objects.')
  }
  const spreadsheet = candidate.spreadsheet === undefined ? emptySpreadsheet() : candidate.spreadsheet
  if (!isSpreadsheetData(spreadsheet)) throw new Error('This project contains invalid spreadsheet cells.')
  const solids = candidate.solids === undefined ? [] : candidate.solids
  if (!Array.isArray(solids) || !solids.every(isSolidObject)) throw new Error('This project contains invalid 3D solids.')
  const vectorFields = candidate.vectorFields === undefined ? [] : candidate.vectorFields
  if (!Array.isArray(vectorFields) || !vectorFields.every(isVectorFieldObject)) throw new Error('This project contains invalid 3D vector fields.')
  const parameterARange = candidate.parameterARange === undefined ? defaultRangeFor(candidate.parameterA) : candidate.parameterARange
  if (!isParameterRange(parameterARange) || candidate.parameterA < parameterARange.min || candidate.parameterA > parameterARange.max) throw new Error('This project contains an invalid a slider range.')
  const parameters = candidate.parameters === undefined ? [] : candidate.parameters
  if (!areSliderParameters(parameters)) throw new Error('This project contains invalid parameters.')
  const notebook = candidate.notebook === undefined ? [] : candidate.notebook
  if (!areNotebookCells(notebook)) throw new Error('This project contains invalid notebook cells.')
  return {
    version: PROJECT_VERSION,
    title: candidate.title,
    expressions: candidate.expressions,
    geometry,
    spreadsheet,
    solids,
    vectorFields,
    parameterA: candidate.parameterA,
    parameterARange,
    parameters,
    notebook,
    updatedAt: new Date().toISOString(),
  }
}
