import { describe, expect, it } from 'vitest'
import { loadProject, parseProjectFile, PROJECT_KEY, saveProject, starterProject } from './project'
import { printableNetSvg } from './solids'

describe('project files', () => {
  it('starts new installations with no graph equations or spreadsheet samples', () => {
    const project = starterProject()
    expect(project.expressions).toEqual([])
    expect(project.spreadsheet.cells).toEqual({})
  })

  it('clears an untouched auto-saved starter but preserves a changed project', () => {
    const legacy = {
      title: 'My graphs', parameterA: 2, parameterARange: { min: -5, max: 5, step: 0.1 },
      expressions: [
        { id: 'one', text: 'y = a*sin(x)', color: '#286fc0', visible: true },
        { id: 'two', text: 'y = 0.15*x^2 - 2', color: '#df7752', visible: true },
        { id: 'three', text: 'z = a/2*sin(sqrt(x^2 + y^2))', color: '#29967a', visible: true },
      ],
      spreadsheet: { cells: { A1: 'x', B1: 'y', A2: '1', B2: '2', A3: '2', B3: '3', A4: '3', B4: '5', A5: '4', B5: '4' } },
    }
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(legacy))
      expect(loadProject().expressions).toEqual([])
      expect(loadProject().spreadsheet.cells).toEqual({})
      localStorage.setItem(PROJECT_KEY, JSON.stringify({ ...legacy, expressions: [...legacy.expressions, { id: 'own', text: 'y = x^3', color: '#805fc2', visible: true }] }))
      expect(loadProject().expressions).toHaveLength(4)
    } finally {
      localStorage.removeItem(PROJECT_KEY)
    }
  })

  it('preserves the entered LaTeX alongside graph syntax', () => {
    const source = {
      title: 'Fractions',
      parameterA: 1,
      updatedAt: new Date().toISOString(),
      expressions: [{
        id: 'fraction',
        text: 'y=(x^2+1)/(2)',
        latex: String.raw`y=\frac{x^2+1}{2}`,
        color: '#286fc0',
        visible: true,
      }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0]).toMatchObject({
      text: source.expressions[0].text,
      latex: source.expressions[0].latex,
    })
  })

  it('still opens older project files without LaTeX', () => {
    const source = {
      title: 'Older project',
      parameterA: 1,
      expressions: [{ id: 'curve', text: 'y = sin(x)', color: '#286fc0', visible: true }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0].latex).toBeUndefined()
    expect(parseProjectFile(JSON.stringify(source)).parameters).toEqual([])
  })

  it('preserves custom slider values and ranges in project files', () => {
    const source = {
      title: 'Sliders', parameterA: 1, parameterARange: { min: -10, max: 10, step: 0.5, animationSeconds: 8 },
      parameters: [{ name: 'b', value: 2.5, min: 0, max: 5, step: 0.5, animationSeconds: 2 }], expressions: [],
    }
    expect(parseProjectFile(JSON.stringify(source))).toMatchObject({ parameterARange: source.parameterARange, parameters: source.parameters })
    expect(() => parseProjectFile(JSON.stringify({ ...source, parameters: [{ ...source.parameters[0], name: 'x' }] }))).toThrow(/invalid parameters/)
  })

  it('migrates older project files and preserves notebook activities in current files', () => {
    const old = parseProjectFile(JSON.stringify({ title: 'Old', parameterA: 1, expressions: [] }))
    expect(old.version).toBe(2)
    expect(old.notebook).toEqual([])
    const notebook = [{ id: 'cell-1', kind: 'visibility', label: 'Show', expressionId: 'curve-1' }]
    expect(parseProjectFile(JSON.stringify({ ...old, notebook })).notebook).toEqual(notebook)
    expect(() => parseProjectFile(JSON.stringify({ ...old, notebook: [{ ...notebook[0], kind: 'script' }] }))).toThrow(/invalid notebook/)
    expect(() => parseProjectFile(JSON.stringify({ ...old, version: 99 }))).toThrow(/newer version/)
  })

  it('reopens notebook cells and graph visibility from local autosave', () => {
    const project = starterProject()
    project.expressions = [{ id: 'curve-1', text: 'y=x', color: '#286fc0', visible: false }]
    project.notebook = [
      { id: 'note-1', kind: 'text', content: 'Slope $x^2$ and {{a}}' },
      { id: 'calc-1', kind: 'calculation', expression: '2+3', operation: 'calculate' },
      { id: 'toggle-1', kind: 'visibility', label: 'Show the curve', expressionId: 'curve-1' },
    ]
    try {
      saveProject(project)
      expect(loadProject()).toMatchObject({ expressions: project.expressions, notebook: project.notebook })
    } finally {
      localStorage.removeItem(PROJECT_KEY)
    }
  })

  it('preserves saved 3D solid constructions', () => {
    const source = {
      title: 'Solids', parameterA: 1, expressions: [],
      solids: [{ id: 's1', shape: 'sphere', x: 1, y: 1, z: 0, size: 2, color: '#25a6b8', visible: true }],
    }
    expect(parseProjectFile(JSON.stringify(source)).solids).toEqual(source.solids)
  })

  it('round-trips editable notebook links, graph windows and Welch settings', () => {
    const project = starterProject()
    project.notebook = [
      { id: 'graph', kind: 'graph', expressionId: 'curve', bounds: { minX: -2, maxX: 3, minY: -4, maxY: 5 } },
      { id: 'table', kind: 'table', sheetId: 'sheet-1', rows: 18 },
      { id: 'action', kind: 'action', action: 'set-parameter', label: 'Set a', parameterName: 'a', expressionId: '', value: 2 },
    ]
    project.spreadsheet.inferenceMode = 'welch'
    project.spreadsheet.welch = { firstColumn: 'B', secondColumn: 'D', confidence: '.99', nullDifference: '1', alternative: 'greater' }
    const reopened = parseProjectFile(JSON.stringify(project))
    expect(reopened.notebook).toEqual(project.notebook)
    expect(reopened.spreadsheet).toEqual(project.spreadsheet)
    expect(() => parseProjectFile(JSON.stringify({ ...project, spreadsheet: { ...project.spreadsheet, welch: { ...project.spreadsheet.welch, firstColumn: 'Z' } } }))).toThrow(/spreadsheet/)
    expect(() => parseProjectFile(JSON.stringify({ ...project, notebook: [{ ...project.notebook[0], bounds: { minX: 0, maxX: 0 } }] }))).toThrow(/notebook/)
  })

  it('preserves saved 3D vector fields', () => {
    const source = {
      title: 'Fields', parameterA: 1, expressions: [],
      vectorFields: [{ id: 'vf1', fx: '-y', fy: 'x', fz: 'z', color: '#25a6b8', visible: true }],
    }
    expect(parseProjectFile(JSON.stringify(source)).vectorFields).toEqual(source.vectorFields)
  })

  it('generates printable nets with cut and fold guides for supported solids', () => {
    expect(printableNetSvg('cube')).toContain('Cube net')
    expect(printableNetSvg('cube')).toContain('stroke-dasharray')
    expect(printableNetSvg('pyramid')).toContain('Square pyramid net')
  })
})
