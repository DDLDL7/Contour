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
  parameterA: number
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
    parameterA: 2,
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
      typeof project.parameterA !== 'number'
    ) return starterProject()

    const expressions = project.expressions.filter((row): row is ExpressionRow =>
      typeof row?.id === 'string' && typeof row.text === 'string' &&
      (row.latex === undefined || typeof row.latex === 'string') &&
      typeof row.color === 'string' && typeof row.visible === 'boolean',
    )
    return {
      title: project.title,
      expressions,
      parameterA: project.parameterA,
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
  return {
    title: candidate.title,
    expressions: candidate.expressions,
    parameterA: candidate.parameterA,
    updatedAt: new Date().toISOString(),
  }
}
