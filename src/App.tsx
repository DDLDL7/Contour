import { OfflineStatus } from './components/OfflineStatus'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Box, Calculator, ChartNoAxesCombined, Copy, Download, Eye, EyeOff, HelpCircle, Moon, Plus, Redo2, RotateCcw, Sun, TableProperties, Trash2, Undo2, Upload, PanelLeftClose, PanelLeftOpen, Columns2, Sigma, Search, X } from 'lucide-react'
import { Graph2D } from './components/Graph2D'
import { Graph3D } from './components/Graph3D'
import { EquationField } from './components/EquationField'
import { MathTools } from './components/MathTools'
import { SpreadsheetView } from './components/SpreadsheetView'
import { ParameterControl } from './components/ParameterControl'
import { NotebookView } from './components/NotebookView'
import { compileScalarDefinition, formatNumber, type GraphExpression, type PlottableGraph } from './lib/math'
import { createHistory, recordHistory, redoHistory, undoHistory } from './lib/history'
import { downloadProject, graphColors, loadProject, parseProjectFile, saveProject, starterProject, type Project } from './lib/project'
import { compileWorkspace } from './lib/workspace'
import { appendActivity } from './lib/activities'
import { evaluateSpreadsheet, updateSpreadsheetCell } from './lib/spreadsheet'
import { defaultParameterRange, nextParameterName, unusedParameterNames, type SliderParameter } from './lib/parameters'

type View = '2d' | '3d' | 'tools' | 'sheet' | 'notebook'
type Theme = 'light' | 'dark'

function describeGraph(graph: GraphExpression): string {
  const kind = graph.kind === 'surface' ? '3D surface'
    : graph.kind === 'implicitSurface' ? 'Implicit 3D surface'
    : graph.kind === 'parametricSurface' ? 'Parametric 3D surface'
    : graph.kind === 'spaceCurve' ? '3D space curve'
    : graph.kind === 'vertical' ? 'Vertical line'
      : graph.kind === 'polar' ? 'Polar curve'
        : graph.kind === 'parametric' ? 'Parametric curve'
          : graph.kind === 'implicit' ? 'Implicit curve'
            : graph.kind === 'inequality' ? 'Shaded region' : '2D curve'
  const variable = graph.kind === 'polar' ? 'θ' : graph.kind === 'parametric' || graph.kind === 'spaceCurve' ? 't' : graph.kind === 'parametricSurface' ? 'u' : 'x'
  const inference = graph.inferredFunctions.map((name) => `${name} means ${name}(${variable})`).join(', ')
  return inference ? `${kind} · ${inference}` : kind
}

function vectorFieldError(parts: { fx: string; fy: string; fz: string }, definitions: Readonly<Record<string, number>>): string | null {
  try {
    const names = ['x', 'y', 'z', 'a', ...Object.keys(definitions)]
    for (const expression of [parts.fx, parts.fy, parts.fz]) compileScalarDefinition(expression, names)
    return null
  } catch (cause) { return cause instanceof Error ? cause.message : 'Check the vector field components.' }
}

function App() {
  const [history, setHistory] = useState(() => createHistory(loadProject()))
  const project = history.present
  const [view, setView] = useState<View>('2d')
  const [railOpen, setRailOpen] = useState(true)
  const [splitView, setSplitView] = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [expressionFilter, setExpressionFilter] = useState('')
  const [parameterName, setParameterName] = useState('b')
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('contour-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const [saveStatus, setSaveStatus] = useState('Saved on this device')
  const [animationStop, setAnimationStop] = useState(0)
  const [message, setMessage] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const graphCanvasRef = useRef<HTMLCanvasElement>(null)
  const secondaryCanvasRef = useRef<HTMLCanvasElement>(null)
  const lastSavedAtRef = useRef(Date.now())

  useEffect(() => {
    try { localStorage.setItem('contour-theme', theme) } catch { /* Theme still applies for this session. */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111417' : '#f7f9fc')
  }, [theme])

  function setProject(update: Project | ((current: Project) => Project), group: string | null = null) {
    const now = Date.now()
    setHistory((current) => recordHistory(
      current,
      typeof update === 'function' ? update(current.present) : update,
      group,
      now,
    ))
  }

  const parameterValues = useMemo(() => Object.fromEntries(project.parameters.map((parameter) => [parameter.name, parameter.value])), [project.parameters])
  const unusedNames = useMemo(() => unusedParameterNames(project.expressions, project.parameters), [project.expressions, project.parameters])
  const selectedParameterName = unusedNames.includes(parameterName) ? parameterName : (unusedNames[0] ?? '')
  const baseRows = useMemo(() => compileWorkspace(project.expressions, project.parameterA, {}, parameterValues), [project.expressions, project.parameterA, parameterValues])
  const definitions = useMemo(() => ({ ...parameterValues, ...Object.fromEntries(baseRows.flatMap((row) => row.definition ? [[row.definition.name, row.definition.value]] : [])) }), [baseRows, parameterValues])
  const sheetLinks = useMemo(() => Object.fromEntries(Object.entries(evaluateSpreadsheet(project.spreadsheet, definitions, project.parameterA, project.spreadsheet.activeSheetId)).flatMap(([address, value]) => value.value === null || value.value === undefined ? [] : [[address, value.value]])), [project.spreadsheet, definitions, project.parameterA])
  const compiledRows = useMemo(() => compileWorkspace(project.expressions, project.parameterA, sheetLinks, parameterValues), [project.expressions, project.parameterA, sheetLinks, parameterValues])

  const graphs = useMemo<PlottableGraph[]>(() => compiledRows.flatMap((row) => row.graph ? [{
    id: row.id,
    color: row.color,
    visible: row.visible,
    graph: row.graph,
  }] : []), [compiledRows])
  const selectedSolid = project.solids.find((solid) => solid.id === selectedSceneId)
  const selectedVectorField = project.vectorFields.find((field) => field.id === selectedSceneId)
  const filteredRows = useMemo(() => compiledRows.filter((row) => {
    const inView = view === '3d' ? !row.graph || ['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(row.graph.kind)
      : view === '2d' ? !row.graph || !['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(row.graph.kind) : true
    return inView && row.text.toLowerCase().includes(expressionFilter.toLowerCase())
  }), [compiledRows, expressionFilter, view])

  const activeCount = graphs.filter((item) => item.visible && (view === '2d'
    ? !['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(item.graph.kind)
    : view === '3d' && ['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(item.graph.kind))).length
  const hasCanvasObjects = view === '2d'
    ? project.geometry.some((object) => object.visible)
    : view === '3d' && (project.solids.some((object) => object.visible) || project.vectorFields.some((object) => object.visible))

  useEffect(() => {
    setSaveStatus('Saving…')
    const delay = Math.min(250, Math.max(0, 2000 - (Date.now() - lastSavedAtRef.current)))
    const timeout = window.setTimeout(() => {
      try {
        saveProject({ ...project, updatedAt: new Date().toISOString() })
        lastSavedAtRef.current = Date.now()
        setSaveStatus('Saved on this device')
      } catch {
        setSaveStatus('Could not save locally. Export a project copy.')
      }
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [project])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault()
        setView((['2d', '3d', 'tools', 'sheet', 'notebook'] as View[])[Number(event.key) - 1])
        return
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setAnimationStop((current) => current + 1)
        setHistory((current) => event.shiftKey ? redoHistory(current) : undoHistory(current))
        return
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        setAnimationStop((current) => current + 1)
        setHistory(redoHistory)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        downloadProject(project)
        setMessage('Project file downloaded.')
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        fileInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [project])

  function updateRow(id: string, changes: Partial<Project['expressions'][number]>) {
    setProject((current) => {
      const row = current.expressions.find((item) => item.id === id)
      if (!row || Object.entries(changes).every(([key, value]) => row[key as keyof typeof row] === value)) return current
      return {
        ...current,
        expressions: current.expressions.map((item) => item.id === id ? { ...item, ...changes } : item),
      }
    }, changes.text !== undefined || changes.latex !== undefined ? `expression:${id}` : null)
  }

  function createNotebookExpression(cellId: string) {
    setProject((current) => {
      if (!current.notebook.some((cell) => cell.id === cellId && cell.kind === 'graph')) return current
      const id = crypto.randomUUID()
      return {
        ...current,
        expressions: [...current.expressions, { id, text: 'y = x^2', color: graphColors[current.expressions.length % graphColors.length], visible: true }],
        notebook: current.notebook.map((cell) => cell.id === cellId && cell.kind === 'graph' ? { ...cell, expressionId: id } : cell),
      }
    })
  }

  function updateNotebookSpreadsheetCell(sheetId: string, address: string, raw: string) {
    setProject((current) => {
      const spreadsheet = updateSpreadsheetCell(current.spreadsheet, sheetId, address, raw)
      return spreadsheet === current.spreadsheet ? current : { ...current, spreadsheet }
    }, `sheet:${sheetId}:${address}`)
  }

  function addExpression() {
    const id = crypto.randomUUID()
    setProject((current) => ({
      ...current,
      expressions: [...current.expressions, {
        id,
        text: view === '3d' ? 'z = ' : 'y = ',
        color: graphColors[current.expressions.length % graphColors.length],
        visible: true,
      }],
    }))
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-expression-id="${id}"]`)?.focus(), 0)
  }

  function duplicateExpression(id: string) {
    const newId = crypto.randomUUID()
    setProject((current) => {
      const index = current.expressions.findIndex((row) => row.id === id)
      if (index < 0) return current
      const expressions = [...current.expressions]
      expressions.splice(index + 1, 0, { ...expressions[index], id: newId, color: graphColors[current.expressions.length % graphColors.length] })
      return { ...current, expressions }
    })
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-expression-id="${newId}"]`)?.focus(), 0)
  }

  function addExample(text: string, nextView: View = '2d') {
    setView(nextView)
    const id = crypto.randomUUID()
    setProject((current) => ({
      ...current,
      expressions: [...current.expressions, {
        id,
        text,
        color: graphColors[current.expressions.length % graphColors.length],
        visible: true,
      }],
    }))
  }

  function addParameter() {
    const name = selectedParameterName
    if (!name) { setMessage('All available parameter letters are in use.'); return }
    setProject((current) => ({ ...current, parameters: [...current.parameters, { name, value: 1, ...defaultParameterRange }] }))
    setMessage(`Parameter ${name} added. Use ${name} in an expression to control its graph.`)
  }

  function updateParameter(parameter: SliderParameter, dragging = false) {
    setProject((current) => parameter.name === 'a'
      ? { ...current, parameterA: parameter.value, parameterARange: { min: parameter.min, max: parameter.max, step: parameter.step, animationSeconds: parameter.animationSeconds } }
      : { ...current, parameters: current.parameters.map((item) => item.name === parameter.name ? parameter : item) },
    dragging ? `parameter:${parameter.name}` : null)
  }

  function removeParameter(name: string) {
    setProject((current) => ({ ...current, parameters: current.parameters.filter((item) => item.name !== name) }))
  }

  async function importProject(file?: File) {
    if (!file) return
    try {
      const content = await file.text()
      const imported = parseProjectFile(content)
      setAnimationStop((current) => current + 1)
      setProject(imported)
      setMessage(`Opened ${file.name}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open this project.')
    }
  }

  function exportImage() {
    const canvas = graphCanvasRef.current
    if (!canvas) return
    const anchor = document.createElement('a')
    anchor.download = `contour-${view}-graph.png`
    anchor.href = canvas.toDataURL('image/png')
    anchor.click()
    setMessage('Graph image downloaded.')
  }

  function newProject() {
    if (!window.confirm('Start a new project? Export a copy first if you want to keep this one.')) return
    setAnimationStop((current) => current + 1)
    setProject(starterProject())
    setMessage('New project started.')
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className="header-identity">
          {(view === '2d' || view === '3d') && <button className="icon-button rail-toggle" type="button" onClick={() => setRailOpen((open) => !open)} aria-label={railOpen ? 'Hide expression rail' : 'Show expression rail'} title={railOpen ? 'Hide expression rail' : 'Show expression rail'}>{railOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>}
          <div className="brand" aria-label="Contour home"><img className="brand-mark" src="/contour-app-icon.png" alt="" /><span className="brand-name">CONTOUR</span></div>
          <div className="brand-divider" />
          <input className="project-title" aria-label="Project title" value={project.title} maxLength={80} onChange={(event) => setProject((current) => current.title === event.target.value ? current : { ...current, title: event.target.value }, 'project:title')} />
          <span className="save-status"><span className="status-dot" />{saveStatus}</span>
          <div className="header-history"><button className="icon-button" type="button" onClick={() => { setAnimationStop((current) => current + 1); setHistory(undoHistory) }} aria-label="Undo" title="Undo (⌘Z)" disabled={history.past.length === 0}><Undo2 size={17} /></button><button className="icon-button" type="button" onClick={() => { setAnimationStop((current) => current + 1); setHistory(redoHistory) }} aria-label="Redo" title="Redo (⌘⇧Z)" disabled={history.future.length === 0}><Redo2 size={17} /></button></div>
        </div>
        <nav className="view-switch" role="tablist" aria-label="Workspace view">
          {([['2d', '2D Graph', ChartNoAxesCombined], ['3d', '3D Graph', Box], ['tools', 'Maths Tools', Calculator], ['sheet', 'Spreadsheet & Stats', TableProperties], ['notebook', 'Notebook', BookOpenText]] as const).map(([id, label, Icon], index) => <button key={id} type="button" role="tab" aria-label={label} aria-selected={view === id} className={view === id ? 'active' : ''} onClick={() => setView(id)} title={`${label} (⌘${index + 1})`}><Icon size={15} className="nav-icon" /><span>{label}</span><kbd>⌘{index + 1}</kbd></button>)}
        </nav>
        <div className="header-actions">
          {(view === '2d' || view === '3d') && <button className="header-button split-button" type="button" aria-pressed={splitView} onClick={() => setSplitView((value) => !value)} title="Show 2D and 3D graphs together"><Columns2 size={16} /><span>Split View</span></button>}
          <button className="header-button help-button" type="button" onClick={() => setHelpOpen(true)} aria-label="Help & Shortcuts" title="Help & Shortcuts"><HelpCircle size={16} /><span>Help & Shortcuts</span></button>
          {(view === '2d' || view === '3d') && <button className="icon-button header-icon" type="button" onClick={exportImage} aria-label="Export graph image" title="Export graph image"><Download size={17} /></button>}
          <button className="icon-button header-icon" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Open project" title="Open project"><Upload size={17} /></button>
          <button className="icon-button header-icon" type="button" onClick={() => downloadProject(project)} aria-label="Save project" title="Save project"><Download size={17} /></button>
          <button className="icon-button header-icon" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
        </div>
      </header>

      <main className={`workspace view-${view} ${railOpen ? '' : 'rail-hidden'}`}>
        <aside className="project-rail" aria-label="Expression rail">
          <div className="rail-heading"><span><Sigma size={16} /> Expressions</span><button type="button" onClick={addExpression} aria-label="Add expression" title="Add expression"><Plus size={17} /></button></div>
          <div className="rail-items">{compiledRows.length === 0 ? <p className="rail-empty">No expressions yet</p> : compiledRows.map((row, index) => <button key={row.id} type="button" className={`rail-item ${row.error ? 'rail-error' : ''}`} onClick={() => { setExpressionFilter(''); document.querySelector(`math-field[data-expression-id="${CSS.escape(row.id)}"]`)?.scrollIntoView({ block: 'center' }) }} title={row.text || `Expression ${index + 1}`}><span className="rail-index">{index + 1}</span><span className="rail-swatch" style={{ backgroundColor: row.color }} /><span className="rail-text">{row.text || 'Empty expression'}</span>{row.error ? <span className="rail-state">!</span> : row.graph ? <Eye size={14} /> : null}</button>)}</div>
          <div className="rail-footer"><span>Active rail: {view === '3d' ? 'Spatial' : 'Cartesian'}</span><span>{compiledRows.length} items</span></div>
        </aside>
        <aside className="expression-panel" aria-label="Expressions">
          <div className="expression-heading">
            <div><h1>{view === '3d' ? 'Scene Elements' : 'Expressions'}</h1><p>{view === '3d' ? `${graphs.filter((item) => ['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(item.graph.kind)).length + project.solids.length + project.vectorFields.length} visible and editable entities` : 'Functions, variables and constructions'}</p></div>
            <button className="icon-button add-top" type="button" aria-label="Add expression" title="Add expression" onClick={addExpression}><Plus size={20} /></button>
          </div>

          <div className="expression-commands"><button className="add-expression" type="button" onClick={addExpression}><Plus size={17} /> {view === '3d' ? 'Add 3D expression' : 'Add expression'}</button><label className="expression-search"><Search size={15} /><input aria-label="Filter expressions" placeholder="Filter expressions" value={expressionFilter} onChange={(event) => setExpressionFilter(event.target.value)} />{expressionFilter && <button type="button" onClick={() => setExpressionFilter('')} aria-label="Clear filter"><X size={14} /></button>}</label></div>

          <div className="expression-list">
            {compiledRows.length === 0 && (
              <div className="empty-expressions">
                <div className="empty-symbol">ƒ</div>
                <strong>Start with an expression</strong>
                <p>{view === '3d' ? <>Try <code>z = sin(sqrt(x^2 + y^2))</code> or add a shape below.</> : <>Try <code>y = sin(x)</code> or enter any equation.</>}</p>
                <button type="button" onClick={addExpression}><Plus size={16} /> {view === '3d' ? 'Add 3D expression' : 'Add expression'}</button>
              </div>
            )}
            {filteredRows.map((row) => {
              const index = compiledRows.findIndex((item) => item.id === row.id)
              return (
              <div className={`expression-card ${row.error ? 'has-error' : ''}`} key={row.id}>
                <div className="expression-line">
                  <span className="expression-index">{index + 1}</span>
                  <label className="row-color-action" title={`Change expression ${index + 1} color`}><span className="graph-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" /><input type="color" aria-label={`Expression ${index + 1} color`} value={row.color} onChange={(event) => updateRow(row.id, { color: event.target.value })} /></label>
                  <EquationField
                    id={row.id}
                    label={`Expression ${index + 1}`}
                    value={row.text}
                    latex={row.latex}
                    placeholder={view === '3d' ? 'z = f(x, y)' : 'y = f(x)'}
                    onChange={(text, latex) => updateRow(row.id, { text, latex })}
                  />
                  <button className="icon-button row-action" type="button" onClick={() => updateRow(row.id, { visible: !row.visible })} aria-label={row.visible ? `Hide expression ${index + 1}` : `Show expression ${index + 1}`} title={row.visible ? 'Hide' : 'Show'}>
                    {row.visible ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                  <button className="icon-button row-action" type="button" onClick={() => duplicateExpression(row.id)} aria-label={`Duplicate expression ${index + 1}`} title="Duplicate"><Copy size={16} /></button>
                  <button className="icon-button row-action delete-action" type="button" onClick={() => setProject((current) => ({ ...current, expressions: current.expressions.filter((item) => item.id !== row.id), geometry: current.geometry.filter(item => item.kind !== 'tangent' || item.expressionId !== row.id) }))} aria-label={`Remove expression ${index + 1}`} title="Remove"><Trash2 size={16} /></button>
                </div>
                {row.error && <p className="expression-error" role="status">{row.error}</p>}
                {!row.error && row.definition && <p className="expression-type">Variable · {row.definition.name} = {formatNumber(row.definition.value, 5)}</p>}
                {!row.error && row.graph && <p className="expression-type">{describeGraph(row.graph)}</p>}
              </div>
            )})}
            {filteredRows.length === 0 && compiledRows.length > 0 && <p className="filter-empty">{expressionFilter ? `No expressions match “${expressionFilter}”.` : view === '3d' ? 'No 3D expressions yet. Add a surface or space curve.' : 'No expressions for this view yet.'}</p>}
          </div>

          {view === '3d' && <section className="scene-elements" aria-label="3D scene objects">
            <div className="scene-section-heading"><span>Geometry objects</span><span>{project.solids.length + project.vectorFields.length}</span></div>
            {project.solids.map((solid, index) => <div className="scene-item" key={solid.id}>
              <div className="scene-item-top"><span className="scene-index">S{index + 1}</span><span className="scene-dot" style={{ background: solid.color }} /><button className="scene-select" type="button" aria-pressed={selectedSceneId === solid.id} onClick={() => setSelectedSceneId(selectedSceneId === solid.id ? null : solid.id)}>{solid.shape[0].toUpperCase() + solid.shape.slice(1)}</button><button type="button" aria-label={`${solid.visible ? 'Hide' : 'Show'} ${solid.shape}`} onClick={() => setProject((current) => ({ ...current, solids: current.solids.map((item) => item.id === solid.id ? { ...item, visible: !item.visible } : item) }))}>{solid.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button><button type="button" aria-label={`Remove ${solid.shape}`} onClick={() => { setSelectedSceneId(null); setProject((current) => ({ ...current, solids: current.solids.filter((item) => item.id !== solid.id) })) }}><X size={16} /></button></div>
              <div className="scene-metrics">{(['x', 'y', 'z', 'size'] as const).map((axis) => <label key={axis}>{axis}<input type="number" step="0.1" min={axis === 'size' ? '0.01' : undefined} aria-label={`${solid.shape} ${axis}`} value={solid[axis]} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && (axis !== 'size' || value > 0)) setProject((current) => ({ ...current, solids: current.solids.map((item) => item.id === solid.id ? { ...item, [axis]: value } : item) })) }} /></label>)}</div>
            </div>)}
            {project.vectorFields.map((field, index) => <div className="scene-item" key={field.id}><div className="scene-item-top"><span className="scene-index">V{index + 1}</span><span className="scene-dot" style={{ background: field.color }} /><button className="scene-select" type="button" aria-pressed={selectedSceneId === field.id} onClick={() => setSelectedSceneId(selectedSceneId === field.id ? null : field.id)}>Vector field</button><button type="button" aria-label={`${field.visible ? 'Hide' : 'Show'} vector field`} onClick={() => setProject((current) => ({ ...current, vectorFields: current.vectorFields.map((item) => item.id === field.id ? { ...item, visible: !item.visible } : item) }))}>{field.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button><button type="button" aria-label="Remove vector field" onClick={() => { setSelectedSceneId(null); setProject((current) => ({ ...current, vectorFields: current.vectorFields.filter((item) => item.id !== field.id) })) }}><X size={16} /></button></div><div className="scene-vector-inputs">{(['fx', 'fy', 'fz'] as const).map((component) => <label key={component}>F<sub>{component[1]}</sub><input aria-label={`Vector field ${component[1]} component`} value={field[component]} onChange={(event) => setProject((current) => ({ ...current, vectorFields: current.vectorFields.map((item) => item.id === field.id ? { ...item, [component]: event.target.value } : item) }), `field:${field.id}:${component}`)} /></label>)}</div>{vectorFieldError(field, definitions) && <p className="scene-vector-error" role="status">{vectorFieldError(field, definitions)}</p>}</div>)}
            <div className="scene-add-grid">{(['sphere', 'cube', 'cylinder', 'cone', 'pyramid'] as const).map((shape, index) => <button type="button" key={shape} onClick={() => setProject((current) => ({ ...current, solids: [...current.solids, { id: crypto.randomUUID(), shape, x: 0, y: 0, z: 1, size: 1, color: graphColors[index], visible: true }] }))}>+ {shape}</button>)}<button type="button" onClick={() => setProject((current) => ({ ...current, vectorFields: [...current.vectorFields, { id: crypto.randomUUID(), fx: '-y', fy: 'x', fz: '0', color: graphColors[1], visible: true }] }))}>+ vector field</button></div>
          </section>}

          <details className="graph-examples" aria-label="Graph examples">
            <summary>Try an example</summary>
            <div className="example-buttons">
            {view !== '3d' && <>
            <button type="button" onClick={() => addExample('r = 2*sin(3*theta)')}>Polar rose</button>
            <button type="button" onClick={() => addExample('x = 3*cos(t), y = 3*sin(t)')}>Parametric circle</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 = 9')}>Implicit circle</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 <= 9')}>Shaded disk</button>
            <button type="button" onClick={() => { const name = nextParameterName(project.expressions, project.parameters); if (name) addExample(`${name} = 2a`); else setMessage('All available variable letters are in use.') }}>Derived variable</button>
            </>}
            {view !== '2d' && <>
            <button type="button" onClick={() => addExample('x = 2a*cos(t), y = 2a*sin(t), z = t/2', '3d')}>3D helix</button>
            <button type="button" onClick={() => addExample('x = (2 + cos(v))*cos(u), y = (2 + cos(v))*sin(u), z = sin(v)', '3d')}>Torus</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 + z^2 = 9', '3d')}>Sphere</button>
            </>}
            </div>
          </details>

          <div className="parameter-panel">
            <div className="parameter-head"><span>Parameters</span><div className="parameter-head-actions"><span className="parameter-count">{project.parameters.length + 1} active</span><select aria-label="New parameter letter" value={selectedParameterName} onChange={(event) => setParameterName(event.target.value)} disabled={!unusedNames.length}>{unusedNames.map((name) => <option key={name} value={name}>{name}</option>)}</select><button type="button" onClick={addParameter} disabled={!unusedNames.length} aria-label="Add parameter" title="Add parameter"><Plus size={16} /> Add</button></div></div>
            <ParameterControl parameter={{ name: 'a', value: project.parameterA, ...project.parameterARange }} onChange={updateParameter} stopSignal={animationStop} />
            {project.parameters.map((parameter) => <ParameterControl key={parameter.name} parameter={parameter} onChange={updateParameter} onRemove={() => removeParameter(parameter.name)} stopSignal={animationStop} />)}
          </div>

          <div className="sidebar-footer">
            <button type="button" onClick={newProject}><RotateCcw size={15} /> New project</button>
            <span>Local workspace</span>
          </div>
        </aside>

        <section className="visual-panel" aria-label="Graph view">
          <div className={`graph-wrap ${splitView && (view === '2d' || view === '3d') ? 'is-split' : ''}`}>
            <div className="primary-workspace">
            {view === 'sheet' ? <SpreadsheetView data={project.spreadsheet} definitions={definitions} parameterA={project.parameterA} onChange={(spreadsheet) => setProject((current) => ({ ...current, spreadsheet }))} />
              : view === 'notebook' ? <NotebookView darkMode={theme === 'dark'} cells={project.notebook} expressions={project.expressions} definitions={definitions} parameterA={project.parameterA} parameterARange={project.parameterARange} parameters={project.parameters} spreadsheet={project.spreadsheet} onChange={(notebook, group) => setProject((current) => ({ ...current, notebook }), group)} onExpressionChange={(id, text, latex) => updateRow(id, { text, latex })} onCreateExpression={createNotebookExpression} onSpreadsheetCellChange={updateNotebookSpreadsheetCell} onAddActivity={(template) => setProject((current) => appendActivity(current, template))} onToggleExpression={(id, visible) => updateRow(id, { visible })} onParameterValueChange={(name, value) => { setAnimationStop((current) => current + 1); setProject((current) => name === 'a' ? { ...current, parameterA: value } : { ...current, parameters: current.parameters.map((item) => item.name === name ? { ...item, value } : item) }) }} onSetParameter={(name, value) => { setAnimationStop((current) => current + 1); setProject((current) => { const parameter = name === 'a' ? { name, ...current.parameterARange } : current.parameters.find((item) => item.name === name); if (!parameter) return current; const bounded = Math.max(parameter.min, Math.min(parameter.max, value)); return name === 'a' ? { ...current, parameterA: bounded } : { ...current, parameters: current.parameters.map((item) => item.name === name ? { ...item, value: bounded } : item) } }) }} />
              : view === '2d'
              ? <Graph2D graphs={graphs} geometry={project.geometry} onGeometryChange={(geometry) => setProject((current) => ({ ...current, geometry }))} parameterA={project.parameterA} canvasRef={graphCanvasRef} darkMode={theme === 'dark'} linkedValues={sheetLinks} />
              : view === '3d' ? <Graph3D graphs={graphs} parameterA={project.parameterA} canvasRef={graphCanvasRef} darkMode={theme === 'dark'} solids={project.solids} onSolidsChange={(solids) => setProject((current) => ({ ...current, solids }))} vectorFields={project.vectorFields} onVectorFieldsChange={(vectorFields) => setProject((current) => ({ ...current, vectorFields }))} definitions={definitions} />
                : <MathTools parameterA={project.parameterA} definitions={definitions} />}
            {(view === '2d' || view === '3d') && activeCount === 0 && !hasCanvasObjects && (
              <div className="graph-empty" role="status">
                <div className="graph-empty-icon">{view === '2d' ? <ChartNoAxesCombined size={24} /> : <Box size={24} />}</div>
                <strong>No {view.toUpperCase()} graph yet</strong>
                <p>{view === '2d' ? 'Add an expression in the left panel.' : 'Add a z = surface or x, y, z curve in the left panel.'}</p>
                <button type="button" onClick={addExpression}><Plus size={15} /> Add expression</button>
              </div>
            )}
            {view === '3d' && selectedSolid && <aside className="scene-inspector" aria-label={`Inspection of ${selectedSolid.shape}`}><div className="scene-inspector-head"><span className="scene-dot" style={{ background: selectedSolid.color }} /><strong>Inspection: {selectedSolid.shape}</strong><button type="button" onClick={() => setSelectedSceneId(null)} aria-label="Close inspection"><X size={15} /></button></div><dl><div><dt>Position</dt><dd>({formatNumber(selectedSolid.x)}, {formatNumber(selectedSolid.y)}, {formatNumber(selectedSolid.z)})</dd></div><div><dt>Size</dt><dd>{formatNumber(selectedSolid.size)}</dd></div><div><dt>Visibility</dt><dd>{selectedSolid.visible ? 'Shown' : 'Hidden'}</dd></div></dl></aside>}
            {view === '3d' && selectedVectorField && <aside className="scene-inspector" aria-label="Inspection of vector field"><div className="scene-inspector-head"><span className="scene-dot" style={{ background: selectedVectorField.color }} /><strong>Inspection: vector field</strong><button type="button" onClick={() => setSelectedSceneId(null)} aria-label="Close inspection"><X size={15} /></button></div><dl><div><dt>Fₓ</dt><dd>{selectedVectorField.fx}</dd></div><div><dt>Fᵧ</dt><dd>{selectedVectorField.fy}</dd></div><div><dt>F𝓏</dt><dd>{selectedVectorField.fz}</dd></div><div><dt>Visibility</dt><dd>{selectedVectorField.visible ? 'Shown' : 'Hidden'}</dd></div></dl></aside>}
          </div>
          {splitView && (view === '2d' || view === '3d') && <div className="secondary-workspace" aria-label={view === '2d' ? '3D graph in split view' : '2D graph in split view'}><div className="split-heading">{view === '2d' ? '3D Graph' : '2D Graph'}</div>{view === '2d' ? <Graph3D graphs={graphs} parameterA={project.parameterA} canvasRef={secondaryCanvasRef} darkMode={theme === 'dark'} solids={project.solids} onSolidsChange={(solids) => setProject((current) => ({ ...current, solids }))} vectorFields={project.vectorFields} onVectorFieldsChange={(vectorFields) => setProject((current) => ({ ...current, vectorFields }))} definitions={definitions} /> : <Graph2D graphs={graphs} geometry={project.geometry} onGeometryChange={(geometry) => setProject((current) => ({ ...current, geometry }))} parameterA={project.parameterA} canvasRef={secondaryCanvasRef} darkMode={theme === 'dark'} linkedValues={sheetLinks} />}</div>}
          </div>
          <div className="visual-footer"><OfflineStatus /><span>{view === 'tools' ? 'Tool results are temporary; project expressions continue to save locally.' : view === 'sheet' ? 'Spreadsheet cells save with your project and recalculate from linked values.' : view === 'notebook' ? 'Notebook cells save with your project and update from live variables.' : 'Your graphs stay on this device until you export them.'}</span><span>Use <kbd>⌘</kbd><kbd>S</kbd> to download a project copy</span></div>
        </section>
      </main>

      {message && <div className="toast" role="status" onAnimationEnd={() => window.setTimeout(() => setMessage(''), 2500)}>{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}

      {helpOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false) }}>
          <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <button className="dialog-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button>
            <div className="help-icon"><HelpCircle size={22} /></div>
            <h2 id="help-title">Graphing with Contour</h2>
            <p>Type one expression per row. Equations appear in maths notation as you type; use <code>/</code> for a fraction and <code>^</code> for a power. Functions such as <code>sin</code>, <code>cos</code>, <code>sqrt</code>, and <code>log</code> are supported.</p>
            <p>If you leave out a function’s argument, Contour uses <code>x</code>: <code>y = 3sin + 5</code> graphs as <code>y = 3sin(x) + 5</code>.</p>
            <div className="help-example"><span>For 2D</span><code>y = a*sin(x)</code></div>
            <div className="help-example"><span>For 3D</span><code>z = sin(sqrt(x^2 + y^2))</code></div>
            <div className="help-example"><span>3D curve</span><code>x = 2a cos(t), y = 2a sin(t), z = t/2</code></div>
            <div className="help-example"><span>3D surface</span><code>x = (2 + cos(v)) cos(u), y = (2 + cos(v)) sin(u), z = sin(v)</code></div>
            <div className="help-example"><span>Implicit 3D</span><code>x² + y² + z² = 9</code></div>
            <div className="help-example"><span>Polar</span><code>r = 2sin(3θ)</code></div>
            <div className="help-example"><span>Parametric</span><code>x = 3cos(t), y = 3sin(t)</code></div>
            <div className="help-example"><span>Implicit</span><code>x^2 + y^2 = 9</code></div>
            <div className="help-example"><span>Inequality</span><code>x^2 + y^2 ≤ 9</code></div>
            <p>Polar curves use θ from 0 to 2π radians. Planar parametric curves use t from 0 to 2π; 3D space curves use t from 0 to 4π. Parametric surfaces use u and v from 0 to 2π.</p>
            <p>Use the <strong>Parameters</strong> panel to add sliders such as <code>b</code> and <code>c</code>. Use them in equations, adjust their ranges, and drag the canvas to pan or rotate.</p>
            <p>Define a variable in any expression row, such as <code>k = 2a</code>, then use it in another row, such as <code>y = k sin(x)</code>. A letter cannot be both a slider and a definition; circular definitions show an error.</p>
            <p>In 2D, click a function to trace its coordinates and approximate slope. Use the <strong>ƒ′</strong> button to mark roots, turning points, and intersections of visible <code>y =</code> functions.</p>
            <p>Your current project saves in this browser automatically. Use <strong>Save project</strong> to keep a file you can reopen later.</p>
            <p>Use <strong>Undo</strong> and <strong>Redo</strong> in the toolbar, or press <code>⌘Z</code> and <code>⌘⇧Z</code>, to revisit edits from this session.</p>
            <button className="help-done" type="button" onClick={() => setHelpOpen(false)}>Got it</button>
          </section>
        </div>
      )}

      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".json,.contour.json,application/json" aria-label="Open a Contour project file" onChange={async (event) => { await importProject(event.target.files?.[0]); event.target.value = '' }} />
    </div>
  )
}

export default App
