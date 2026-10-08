import { geometryIsConsistent, isGeometryObject, type GeometryObject } from './geometry'
import { emptySpreadsheet, isSpreadsheetData, type SpreadsheetData } from './spreadsheet'
import { isSolidObject, isVectorFieldObject, type SolidObject, type VectorFieldObject } from './solids'
import { areSliderParameters, defaultParameterRange, defaultRangeFor, isParameterRange, type ParameterRange, type SliderParameter } from './parameters'

export interface ExpressionRow {
  id: string
  text: string
  latex?: string
  color: string
  visible: boolean
}

export interface Project {
  title: string
  expressions: ExpressionRow[]
  geometry: GeometryObject[]
  spreadsheet: SpreadsheetData
  solids: SolidObject[]
  vectorFields: VectorFieldObject[]
  parameterA: number
  parameterARange: ParameterRange
  parameters: SliderParameter[]
  updatedAt: string
}

export const PROJECT_KEY = 'contour-project-v1'

export const graphColors = ['#286fc0', '#df7752', '#29967a', '#805fc2', '#c39a24']

export function starterProject(): Project {
  return {
    title: 'My graphs',
    expressions: [
      { id: crypto.randomUUID(), text: 'y = a*sin(x)', color: graphColors[0], visible: true },
      { id: crypto.randomUUID(), text: 'y = 0.15*x^2 - 2', color: graphColors[1], visible: true },
      { id: crypto.randomUUID(), text: 'z = a/2*sin(sqrt(x^2 + y^2))', color: graphColors[2], visible: true },
    ],
    geometry: [],
    spreadsheet: emptySpreadsheet(),
    solids: [],
    vectorFields: [],
    parameterA: 2,
    parameterARange: { ...defaultParameterRange },
    parameters: [],
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
    if (
      typeof project.title !== 'string' ||
      !Array.isArray(project.expressions) ||
      typeof project.parameterA !== 'number' || !Number.isFinite(project.parameterA)
    ) return starterProject()

    const expressions = project.expressions.filter((row): row is ExpressionRow =>
      typeof row?.id === 'string' && typeof row.text === 'string' &&
      (row.latex === undefined || typeof row.latex === 'string') &&
      typeof row.color === 'string' && typeof row.visible === 'boolean',
    )
    const geometry = Array.isArray(project.geometry) && project.geometry.every(isGeometryObject) ? project.geometry : []
    const spreadsheet = isSpreadsheetData(project.spreadsheet) ? project.spreadsheet : emptySpreadsheet()
    const solids = Array.isArray(project.solids) && project.solids.every(isSolidObject) ? project.solids : []
    const vectorFields = Array.isArray(project.vectorFields) && project.vectorFields.every(isVectorFieldObject) ? project.vectorFields : []
    return {
      title: project.title,
      expressions,
      geometry: geometryIsConsistent(geometry) ? geometry : [],
      spreadsheet,
      solids,
      vectorFields,
      parameterA: project.parameterA,
      parameterARange: isParameterRange(project.parameterARange) && project.parameterA >= project.parameterARange.min && project.parameterA <= project.parameterARange.max ? project.parameterARange : defaultRangeFor(project.parameterA),
      parameters: areSliderParameters(project.parameters) ? project.parameters : [],
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
  return {
    title: candidate.title,
    expressions: candidate.expressions,
    geometry,
    spreadsheet,
    solids,
    vectorFields,
    parameterA: candidate.parameterA,
    parameterARange,
    parameters,
    updatedAt: new Date().toISOString(),
  }
}
