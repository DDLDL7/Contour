import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Box, Calculator, ChartNoAxesCombined, Download, Eye, EyeOff, HelpCircle, Moon, Plus, Redo2, RotateCcw, Sun, TableProperties, Trash2, Undo2, Upload } from 'lucide-react'
import { Graph2D } from './components/Graph2D'
import { Graph3D } from './components/Graph3D'
import { EquationField } from './components/EquationField'
import { MathTools } from './components/MathTools'
import { SpreadsheetView } from './components/SpreadsheetView'
import { ParameterControl } from './components/ParameterControl'
import { NotebookView } from './components/NotebookView'
import { formatNumber, type GraphExpression, type PlottableGraph } from './lib/math'
import { createHistory, recordHistory, redoHistory, undoHistory } from './lib/history'
import { downloadProject, graphColors, loadProject, parseProjectFile, saveProject, starterProject, type Project } from './lib/project'
import { compileWorkspace } from './lib/workspace'
import { evaluateSpreadsheet } from './lib/spreadsheet'
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

function App() {
  const [history, setHistory] = useState(() => createHistory(loadProject()))
  const project = history.present
  const [view, setView] = useState<View>('2d')
  const [parameterName, setParameterName] = useState('b')
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('contour-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  const [saveStatus, setSaveStatus] = useState('Saved on this device')
  const [animationStop, setAnimationStop] = useState(0)
  const [message, setMessage] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const graphCanvasRef = useRef<HTMLCanvasElement>(null)
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
        <div className="brand" aria-label="Contour home">
          <img className="brand-mark" src="/contour-app-icon.png" alt="" />
          <div className="brand-name">CONTOUR</div>
          <div className="brand-divider" />
          <div className="brand-subtitle">Graphing workspace</div>
        </div>

        <div className="header-actions">
          <button className="icon-button header-icon" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button className="icon-button header-icon" type="button" onClick={() => { setAnimationStop((current) => current + 1); setHistory(undoHistory) }} aria-label="Undo" title="Undo (⌘Z)" disabled={history.past.length === 0}><Undo2 size={18} /></button>
          <button className="icon-button header-icon" type="button" onClick={() => { setAnimationStop((current) => current + 1); setHistory(redoHistory) }} aria-label="Redo" title="Redo (⌘⇧Z)" disabled={history.future.length === 0}><Redo2 size={18} /></button>
          <button className="icon-button header-icon" type="button" onClick={() => setHelpOpen(true)} aria-label="Help" title="Help"><HelpCircle size={18} /></button>
          <button className="header-button" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /><span>Open</span></button>
          <button className="header-button primary-action" type="button" onClick={() => downloadProject(project)}><Download size={16} /><span>Save project</span></button>
        </div>
      </header>

      <main className="workspace">
        <aside className="expression-panel" aria-label="Expressions">
          <div className="project-header">
            <div className="project-overline">Workspace</div>
            <input
              className="project-title"
              aria-label="Project title"
              value={project.title}
              maxLength={80}
              onChange={(event) => setProject((current) => current.title === event.target.value ? current : { ...current, title: event.target.value }, 'project:title')}
            />
            <div className="save-status"><span className="status-dot" />{saveStatus}</div>
          </div>

          <div className="expression-heading">
            <div><h1>Expressions</h1><p>Add a function and watch it take shape.</p></div>
            <button className="icon-button add-top" type="button" aria-label="Add expression" title="Add expression" onClick={addExpression}><Plus size={20} /></button>
          </div>

          <div className="expression-list">
            {compiledRows.length === 0 && (
              <div className="empty-expressions">
                <div className="empty-symbol">ƒ</div>
                <strong>Start with an expression</strong>
                <p>Try <code>y = sin(x)</code> or switch to 3D and try <code>z = x^2 + y^2</code>.</p>
                <button type="button" onClick={addExpression}><Plus size={16} /> Add expression</button>
              </div>
            )}
            {compiledRows.map((row, index) => (
              <div className={`expression-card ${row.error ? 'has-error' : ''}`} key={row.id}>
                <div className="expression-line">
                  <span className="expression-index">{index + 1}</span>
                  <span className="graph-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
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
                  <button className="icon-button row-action delete-action" type="button" onClick={() => setProject((current) => ({ ...current, expressions: current.expressions.filter((item) => item.id !== row.id) }))} aria-label={`Remove expression ${index + 1}`} title="Remove"><Trash2 size={16} /></button>
                </div>
                {row.error && <p className="expression-error" role="status">{row.error}</p>}
                {!row.error && row.definition && <p className="expression-type">Variable · {row.definition.name} = {formatNumber(row.definition.value, 5)}</p>}
                {!row.error && row.graph && <p className="expression-type">{describeGraph(row.graph)}</p>}
              </div>
            ))}
          </div>

          <button className="add-expression" type="button" onClick={addExpression}><Plus size={16} /> Add expression</button>

          <div className="graph-examples" aria-label="Graph examples">
            <span>Try an example</span>
            <button type="button" onClick={() => addExample('r = 2*sin(3*theta)')}>Polar rose</button>
            <button type="button" onClick={() => addExample('x = 3*cos(t), y = 3*sin(t)')}>Parametric circle</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 = 9')}>Implicit circle</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 <= 9')}>Shaded disk</button>
            <button type="button" onClick={() => { const name = nextParameterName(project.expressions, project.parameters); if (name) addExample(`${name} = 2a`); else setMessage('All available variable letters are in use.') }}>Derived variable</button>
            <button type="button" onClick={() => addExample('x = 2a*cos(t), y = 2a*sin(t), z = t/2', '3d')}>3D helix</button>
            <button type="button" onClick={() => addExample('x = (2 + cos(v))*cos(u), y = (2 + cos(v))*sin(u), z = sin(v)', '3d')}>Torus</button>
            <button type="button" onClick={() => addExample('x^2 + y^2 + z^2 = 9', '3d')}>Sphere</button>
          </div>

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
          <div className="view-toolbar">
            <div className="view-switch" role="tablist" aria-label="Workspace view">
              <button type="button" role="tab" aria-label="2D graph" data-tooltip="2D graph" aria-selected={view === '2d'} className={view === '2d' ? 'active' : ''} onClick={() => setView('2d')}><ChartNoAxesCombined size={18} /></button>
              <button type="button" role="tab" aria-label="3D graph" data-tooltip="3D graph" aria-selected={view === '3d'} className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}><Box size={18} /></button>
              <button type="button" role="tab" aria-label="Maths tools" data-tooltip="Maths tools" aria-selected={view === 'tools'} className={view === 'tools' ? 'active' : ''} onClick={() => setView('tools')}><Calculator size={18} /></button>
              <button type="button" role="tab" aria-label="Spreadsheet" data-tooltip="Spreadsheet" aria-selected={view === 'sheet'} className={view === 'sheet' ? 'active' : ''} onClick={() => setView('sheet')}><TableProperties size={18} /></button>
              <button type="button" role="tab" aria-label="Notebook" data-tooltip="Notebook" aria-selected={view === 'notebook'} className={view === 'notebook' ? 'active' : ''} onClick={() => setView('notebook')}><BookOpenText size={18} /></button>
            </div>
            <div className="toolbar-right">
              {(view === '2d' || view === '3d') && <><span className="graph-count">{activeCount} {activeCount === 1 ? 'graph' : 'graphs'}</span>
                <button className="export-image" type="button" onClick={exportImage}><Download size={16} /> <span>Export image</span></button></>}
            </div>
          </div>
          <div className="graph-wrap">
            {view === 'sheet' ? <SpreadsheetView data={project.spreadsheet} definitions={definitions} parameterA={project.parameterA} onChange={(spreadsheet) => setProject((current) => ({ ...current, spreadsheet }))} />
              : view === 'notebook' ? <NotebookView cells={project.notebook} expressions={project.expressions} definitions={definitions} parameterA={project.parameterA} parameterARange={project.parameterARange} parameters={project.parameters} onChange={(notebook, group) => setProject((current) => ({ ...current, notebook }), group)} onToggleExpression={(id, visible) => updateRow(id, { visible })} onParameterValueChange={(name, value) => { setAnimationStop((current) => current + 1); setProject((current) => name === 'a' ? { ...current, parameterA: value } : { ...current, parameters: current.parameters.map((item) => item.name === name ? { ...item, value } : item) }) }} />
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
          </div>
          <div className="visual-footer"><span>{view === 'tools' ? 'Tool results are temporary; project expressions continue to save locally.' : view === 'sheet' ? 'Spreadsheet cells save with your project and recalculate from linked values.' : view === 'notebook' ? 'Notebook cells save with your project and update from live variables.' : 'Your graphs stay on this device until you export them.'}</span><span>Use <kbd>⌘</kbd><kbd>S</kbd> to download a project copy</span></div>
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
