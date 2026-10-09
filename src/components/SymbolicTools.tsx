import { useEffect, useRef, useState } from 'react'
import { SymbolicEngine, symbolicMethods, symbolicRequest, type SymbolicMethod, type SymbolicOptions, type SymbolicResult } from '../lib/symbolic'

export function SymbolicTools({ parameterA, definitions }: { parameterA: number; definitions: Readonly<Record<string, number>> }) {
  const engine = useRef<SymbolicEngine | null>(null)
  const job = useRef(0)
  const [method, setMethod] = useState<SymbolicMethod>('exact')
  const [input, setInput] = useState<string>(symbolicMethods[0][2])
  const [options, setOptions] = useState<Omit<SymbolicOptions, 'definitions'>>({ variable: 'x', domain: 'real', assumption: 'none', start: '0', end: 'pi', direction: 'both', order: 6, initialY: '1' })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<SymbolicResult | null>(null)
  const [error, setError] = useState('')
  const [resultSignature, setResultSignature] = useState('')
  const signature = JSON.stringify({ method, input, options, parameterA, definitions })
  const selected = symbolicMethods.find(item => item[0] === method)!
  useEffect(() => () => { job.current++; engine.current?.cancel() }, [])
  function stop() { job.current++; engine.current?.cancel(); setBusy(false); setProgress('Calculation stopped.') }
  async function run() {
    const id = ++job.current
    try {
      const request = symbolicRequest(method, input, { ...options, definitions: { ...definitions, a: parameterA } })
      engine.current ??= new SymbolicEngine()
      setBusy(true); setError(''); setResult(null); setProgress('Preparing calculation…')
      const answer = await engine.current.run(request, message => { if (job.current === id) setProgress(message) })
      if (job.current !== id) return
      setResult(answer); setResultSignature(signature); setProgress('')
    } catch (cause) {
      if (job.current !== id) return
      setError(cause instanceof Error ? cause.message : 'Could not calculate.'); setResultSignature(signature)
    } finally { if (job.current === id) setBusy(false) }
  }
  function change<K extends keyof typeof options>(key: K, value: typeof options[K]) { setOptions(current => ({ ...current, [key]: value })) }
  return <section className="math-tool-card" aria-label="Exact symbolic mathematics">
    <div className="math-tool-card-header"><div><h3>Exact symbolic mathematics</h3><p>Runs on this device. Use semicolons between equations, inequalities, or matrix rows. Infinity bounds use oo or -oo.</p></div></div>
    <div className="math-tool-options"><label>Method<select value={method} disabled={busy} onChange={event => { const next = event.target.value as SymbolicMethod; setMethod(next); setInput(symbolicMethods.find(item => item[0] === next)![2]); setResult(null); setError('') }}>{symbolicMethods.map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label>
      <label>Variable<input value={options.variable} disabled={busy} onChange={event => change('variable', event.target.value)} /></label>
      <label>Domain<select value={options.domain} disabled={busy} onChange={event => change('domain', event.target.value as typeof options.domain)}><option value="real">Real</option><option value="complex">Complex</option></select></label>
      <label>Variable assumption<select value={options.assumption} disabled={busy} onChange={event => change('assumption', event.target.value as typeof options.assumption)}><option value="none">None</option><option value="positive">Positive</option><option value="nonnegative">Nonnegative</option><option value="negative">Negative</option><option value="nonzero">Nonzero</option></select></label>
    </div>
    <label className="math-tool-label" htmlFor="symbolic-input">{method === 'ode' ? 'dy/dx =' : method === 'envelope' ? 'Family F(x,y,t) = 0; enter F and choose variable t' : selected[1] + ' input'}</label>
    <textarea id="symbolic-input" className="math-tool-data" value={input} disabled={busy} onChange={event => setInput(event.target.value)} rows={3} spellCheck={false} />
    {method === 'substitute' && <div className="math-tool-options"><label>Replace variable with<input value={options.end} disabled={busy} onChange={event => change('end', event.target.value)} /></label></div>}
    {['definite', 'limit', 'series', 'ode'].includes(method) && <div className="math-tool-options">
      <label>{method === 'definite' ? 'Lower bound' : method === 'ode' ? 'Initial x' : 'Approach / expansion point'}<input value={options.start} disabled={busy} onChange={event => change('start', event.target.value)} /></label>
      {method === 'definite' && <label>Upper bound<input value={options.end} disabled={busy} onChange={event => change('end', event.target.value)} /></label>}
      {method === 'ode' && <label>Initial y<input value={options.initialY} disabled={busy} onChange={event => change('initialY', event.target.value)} /></label>}
      {method === 'limit' && <label>Direction<select value={options.direction} disabled={busy} onChange={event => change('direction', event.target.value as typeof options.direction)}><option value="both">Both sides</option><option value="left">Left</option><option value="right">Right</option></select></label>}
      {method === 'series' && <label>Order (1–20)<input type="number" min="1" max="20" value={options.order} disabled={busy} onChange={event => change('order', Number(event.target.value))} /></label>}
    </div>}
    {busy ? <button className="math-tool-run" type="button" onClick={stop}>Stop calculation</button> : <button className="math-tool-run" type="button" onClick={run}>Calculate exact result</button>}
    {progress && <p role="status">{progress}</p>}
    {error && resultSignature === signature && <p className="math-tool-error" role="alert">{error}</p>}
    {result && resultSignature === signature && <div className="math-tool-result" role="status"><span>{result.title}</span><p className="math-result-text">{result.value}</p><p>{result.note}</p></div>}
  </section>
}
