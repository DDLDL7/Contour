import { useEffect, useRef, useState } from 'react'
import { type OdeSolution } from '../lib/ode'

export function DifferentialTools({ parameterA, definitions }: { parameterA: number; definitions: Readonly<Record<string, number>> }) {
  const worker=useRef<Worker | null>(null)
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [busy,setBusy]=useState(false)
  const [errorSignature,setErrorSignature]=useState('')
  useEffect(()=>()=>{worker.current?.terminate();clearTimeout(timer.current)},[])
  function stop(){worker.current?.terminate();worker.current=null;clearTimeout(timer.current);setBusy(false)}
  const [system, setSystem] = useState(false)
  const [first, setFirst] = useState('y')
  const [second, setSecond] = useState('-x')
  const [start, setStart] = useState('0'); const [end, setEnd] = useState('6.28')
  const [initialX, setInitialX] = useState('1'); const [initialY, setInitialY] = useState('0')
  const [tolerance, setTolerance] = useState('0.000001')
  const [result, setResult] = useState<{ solution: OdeSolution; arrows: number[][]; signature: string } | null>(null)
  const [error, setError] = useState('')
  const signature = JSON.stringify({ system, first, second, start, end, initialX, initialY, tolerance, parameterA, definitions })
  function calculate() {
    try {
      if ([start, end, initialX, initialY, tolerance].some(value => !value.trim())) throw new Error('Enter every initial value, bound, and tolerance.')
      stop();setBusy(true);setResult(null);setError('')
      const active=new Worker(new URL('../workers/ode.worker.ts',import.meta.url),{type:'module'})
      worker.current=active
      timer.current=setTimeout(()=>{if(worker.current===active){stop();setErrorSignature(signature);setError('Solver exceeded 30 seconds. Shorten the interval.')}},30000)
      active.onmessage=({data})=>{
        if(worker.current!==active) return
        stop();setErrorSignature(signature)
        if(data.error) setError(data.error)
        else setResult({solution:data.solution,arrows:data.arrows,signature})
      }
      active.onerror=()=>{if(worker.current===active){stop();setErrorSignature(signature);setError('Numerical worker could not start. Reload and try again.')}}
      active.postMessage({system,first,second,start:Number(start),end:Number(end),initialX:Number(initialX),initialY:Number(initialY),tolerance:Number(tolerance),parameterA,definitions})
    } catch (cause) { stop();setErrorSignature(signature);setResult(null); setError(cause instanceof Error ? cause.message : 'Could not solve.') }
  }
  const current = result?.signature === signature ? result : null
  const px = (x: number) => 210 + x * 40; const py = (y: number) => 210 - y * 40
  const path = current?.solution.points.map((point, index) => {
    const x = system ? point.values[0] : point.t; const y = system ? point.values[1] : point.values[0]
    return `${index ? 'L' : 'M'}${px(x)},${py(y)}`
  }).join(' ')
  return <section className="math-tool-card" aria-label="Differential equation explorer">
    <div className="math-tool-card-header"><div><h3>Differential equation explorer</h3><p>Adaptive numerical solutions with a slope field or a two-variable phase portrait. The fixed plot window is −5 to 5 on each axis.</p></div></div>
    <div className="math-tool-options"><label>Equation type<select value={system ? 'system' : 'scalar'} onChange={event => { setSystem(event.target.value === 'system'); setError('') }}><option value="scalar">dy/dx = f(x,y)</option><option value="system">dx/dt, dy/dt system</option></select></label>
      <label>{system ? 'dx/dt' : 'dy/dx'}<input value={first} onChange={event => setFirst(event.target.value)} /></label>
      {system && <label>dy/dt<input value={second} onChange={event => setSecond(event.target.value)} /></label>}
      <label>Initial {system ? 't' : 'x'}<input type="number" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Final {system ? 't' : 'x'}<input type="number" value={end} onChange={event => setEnd(event.target.value)} /></label>
      {system && <label>Initial x<input type="number" value={initialX} onChange={event => setInitialX(event.target.value)} /></label>}
      <label>Initial y<input type="number" value={initialY} onChange={event => setInitialY(event.target.value)} /></label>
      <label>Local error tolerance<input type="number" min="1e-10" max="0.01" step="any" value={tolerance} onChange={event => setTolerance(event.target.value)} /></label>
    </div><button className="math-tool-run" type="button" onClick={busy ? stop : calculate}>{busy ? 'Stop solving' : 'Solve and plot'}</button>
    {error && errorSignature===signature && <p className="math-tool-error" role="alert">{error}</p>}
    {current && <><svg viewBox="0 0 420 420" className="distribution-plot" role="img" aria-label={system ? 'Phase portrait in x,y with trajectory' : 'Slope field and numerical solution in x,y'} style={{ overflow: 'hidden' }}>
      <defs><marker id="ode-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor" /></marker><clipPath id="ode-plot-clip"><rect x="10" y="10" width="400" height="400" /></clipPath></defs>
      <g clipPath="url(#ode-plot-clip)"><path d="M10 210H410 M210 10V410" className="chart-axis" />
        {current.arrows.map(([x, y, dx, dy], index) => <path key={index} d={`M${px(x-dx/2)} ${py(y-dy/2)}L${px(x+dx/2)} ${py(y+dy/2)}`} stroke="currentColor" opacity=".35" markerEnd={system ? 'url(#ode-arrow)' : undefined} />)}
        <path d={path} className="distribution-density" /></g></svg>
      <p role="status">Final solution: {current.solution.points.at(-1)!.values.map(value => value.toPrecision(8)).join(', ')}. {current.solution.steps} attempted steps, {current.solution.rejected} rejected. Local scaled error tolerance {tolerance}; this is not a global error bound.</p>
      {system && <p>Field shown at t = {start}. It is a phase portrait for autonomous systems; time-dependent fields may change as t advances.</p>}
    </>}
  </section>
}
