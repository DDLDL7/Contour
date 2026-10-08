import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, ChartNoAxesCombined, Download, Eye, EyeOff, HelpCircle, Plus, Redo2, RotateCcw, Trash2, Undo2, Upload } from 'lucide-react'
import { Graph2D } from './components/Graph2D'
import { Graph3D } from './components/Graph3D'
import { EquationField } from './components/EquationField'
import { compileGraph, formatNumber, type PlottableGraph } from './lib/math'
import { createHistory, recordHistory, redoHistory, undoHistory } from './lib/history'
import { downloadProject, graphColors, loadProject, parseProjectFile, saveProject, starterProject, type Project } from './lib/project'

type View = '2d' | '3d'

interface CompiledRow {
  id: string
  text: string
  latex?: string
  color: string
  visible: boolean
  graph?: ReturnType<typeof compileGraph>
  error?: string
}

function describeGraph(graph: NonNullable<CompiledRow['graph']>): string {
  const kind = graph.kind === 'surface' ? '3D surface'
    : graph.kind === 'spaceCurve' ? '3D space curve'
    : graph.kind === 'vertical' ? 'Vertical line'
      : graph.kind === 'polar' ? 'Polar curve'
        : graph.kind === 'parametric' ? 'Parametric curve'
          : graph.kind === 'implicit' ? 'Implicit curve'
            : graph.kind === 'inequality' ? 'Shaded region' : '2D curve'
  const variable = graph.kind === 'polar' ? 'θ' : graph.kind === 'parametric' || graph.kind === 'spaceCurve' ? 't' : 'x'
  const inference = graph.inferredFunctions.map((name) => `${name} means ${name}(${variable})`).join(', ')
  return inference ? `${kind} · ${inference}` : kind
}

function App() {
  const [history, setHistory] = useState(() => createHistory(loadProject()))
  const project = history.present
  const [view, setView] = useState<View>('2d')
  const [saveStatus, setSaveStatus] = useState('Saved on this device')
  const [message, setMessage] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const graphCanvasRef = useRef<HTMLCanvasElement>(null)

  function setProject(update: Project | ((current: Project) => Project), group: string | null = null) {
    const now = Date.now()
    setHistory((current) => recordHistory(
      current,
      typeof update === 'function' ? update(current.present) : update,
      group,
      now,
    ))
  }

  const compiledRows = useMemo<CompiledRow[]>(() => project.expressions.map((row) => {
    if (!row.text.trim()) return { ...row }
    try {
      return { ...row, graph: compileGraph(row.text) }
    } catch (error) {
      return { ...row, error: error instanceof Error ? error.message : 'This expression could not be graphed.' }
    }
  }), [project.expressions])

  const graphs = useMemo<PlottableGraph[]>(() => compiledRows.flatMap((row) => row.graph ? [{
    id: row.id,
    color: row.color,
    visible: row.visible,
    graph: row.graph,
  }] : []), [compiledRows])

  const activeCount = graphs.filter((item) => item.visible && (view === '2d'
    ? item.graph.kind !== 'surface' && item.graph.kind !== 'spaceCurve'
    : item.graph.kind === 'surface' || item.graph.kind === 'spaceCurve')).length

  useEffect(() => {
    setSaveStatus('Saving…')
    const timeout = window.setTimeout(() => {
      try {
        saveProject({ ...project, updatedAt: new Date().toISOString() })
        setSaveStatus('Saved on this device')
      } catch {
        setSaveStatus('Could not save locally. Export a project copy.')
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [project])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setHistory((current) => event.shiftKey ? redoHistory(current) : undoHistory(current))
        return
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
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

  async function importProject(file?: File) {
    if (!file) return
    try {
      const content = await file.text()
      setProject(parseProjectFile(content))
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
    setProject({ ...starterProject(), title: 'Untitled project', expressions: [], parameterA: 1 })
    setMessage('New project started.')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="Contour home">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div className="brand-name">Contour</div>
          <div className="brand-divider" />
          <div className="brand-subtitle">Graphing workspace</div>
        </div>

        <div className="header-actions">
          <button className="icon-button header-icon" type="button" onClick={() => setHistory(undoHistory)} aria-label="Undo" title="Undo (⌘Z)" disabled={history.past.length === 0}><Undo2 size={18} /></button>
          <button className="icon-button header-icon" type="button" onClick={() => setHistory(redoHistory)} aria-label="Redo" title="Redo (⌘⇧Z)" disabled={history.future.length === 0}><Redo2 size={18} /></button>
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
            <button type="button" onClick={() => addExample('x = 2a*cos(t), y = 2a*sin(t), z = t/2', '3d')}>3D helix</button>
          </div>

          <div className="parameter-panel">
            <div className="parameter-head"><span>Parameters</span><span className="parameter-count">1 active</span></div>
            <div className="parameter-label"><label htmlFor="parameter-a">a</label><output htmlFor="parameter-a">{formatNumber(project.parameterA, 1)}</output></div>
            <input
              id="parameter-a"
              className="parameter-slider"
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={project.parameterA}
              onChange={(event) => setProject((current) => current.parameterA === Number(event.target.value) ? current : { ...current, parameterA: Number(event.target.value) }, 'parameter:a')}
            />
            <div className="slider-ends"><span>−5</span><span>5</span></div>
          </div>

          <div className="sidebar-footer">
            <button type="button" onClick={newProject}><RotateCcw size={15} /> New project</button>
            <span>Local workspace</span>
          </div>
        </aside>

        <section className="visual-panel" aria-label="Graph view">
          <div className="view-toolbar">
            <div className="view-switch" role="tablist" aria-label="Graph dimension">
              <button type="button" role="tab" aria-selected={view === '2d'} className={view === '2d' ? 'active' : ''} onClick={() => setView('2d')}><ChartNoAxesCombined size={17} /> 2D graph</button>
              <button type="button" role="tab" aria-selected={view === '3d'} className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}><Box size={17} /> 3D graph</button>
            </div>
            <div className="toolbar-right">
              <span className="graph-count">{activeCount} {activeCount === 1 ? 'graph' : 'graphs'}</span>
              <button className="export-image" type="button" onClick={exportImage}><Download size={16} /> <span>Export image</span></button>
            </div>
          </div>
          <div className="graph-wrap">
            {view === '2d'
              ? <Graph2D graphs={graphs} parameterA={project.parameterA} canvasRef={graphCanvasRef} />
              : <Graph3D graphs={graphs} parameterA={project.parameterA} canvasRef={graphCanvasRef} />}
            {activeCount === 0 && (
              <div className="graph-empty" role="status">
                <div className="graph-empty-icon">{view === '2d' ? <ChartNoAxesCombined size={24} /> : <Box size={24} />}</div>
                <strong>No {view.toUpperCase()} graph yet</strong>
                <p>{view === '2d' ? 'Add an expression in the left panel.' : 'Add a z = surface or x, y, z curve in the left panel.'}</p>
                <button type="button" onClick={addExpression}><Plus size={15} /> Add expression</button>
              </div>
            )}
          </div>
          <div className="visual-footer"><span>Your graphs stay on this device until you export them.</span><span>Use <kbd>⌘</kbd><kbd>S</kbd> to download a project copy</span></div>
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
            <div className="help-example"><span>Polar</span><code>r = 2sin(3θ)</code></div>
            <div className="help-example"><span>Parametric</span><code>x = 3cos(t), y = 3sin(t)</code></div>
            <div className="help-example"><span>Implicit</span><code>x^2 + y^2 = 9</code></div>
            <div className="help-example"><span>Inequality</span><code>x^2 + y^2 ≤ 9</code></div>
            <p>Polar curves use θ from 0 to 2π radians. Planar parametric curves use t from 0 to 2π; 3D space curves use t from 0 to 4π.</p>
            <p>Use the <strong>a</strong> slider to explore how a parameter changes a graph. Drag the canvas to pan or rotate, and scroll to zoom.</p>
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
