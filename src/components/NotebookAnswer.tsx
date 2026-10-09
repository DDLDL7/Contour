import { useEffect, useRef, useState } from 'react'
import { SymbolicEngine, symbolicRequest } from '../lib/symbolic'
import type { NotebookCell } from '../lib/notebook'

export function NotebookAnswer({ cell, definitions, parameterA, onChange }: { cell: Extract<NotebookCell, { kind: 'answer' }>; definitions: Readonly<Record<string, number>>; parameterA: number; onChange: (change: Partial<NotebookCell>) => void }) {
  const engine = useRef<SymbolicEngine | null>(null); const job = useRef(0)
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [calculated, setCalculated] = useState('')
  const signature = JSON.stringify({ expected: cell.expected, response: cell.response, definitions, parameterA })
  useEffect(() => () => { job.current++; engine.current?.cancel() }, [])
  function stop() { job.current++; engine.current?.cancel(); setBusy(false); setStatus('') }
  async function check() {
    const id = ++job.current
    try {
      if (!cell.expected.trim() || !cell.response.trim() || /[;\n]/.test(cell.expected+cell.response)) throw new Error('Enter one expected expression and one answer, without semicolons.')
      const request = symbolicRequest('check', `${cell.expected}; ${cell.response}`, { variable:'x',domain:'real',assumption:'none',start:'0',end:'1',initialY:'1',direction:'both',order:6,definitions:{...definitions,a:parameterA} })
      engine.current ??= new SymbolicEngine(); setBusy(true); setStatus('Checking on this device…'); setCalculated(signature)
      const answer = await engine.current.run(request, message => { if (job.current === id) setStatus(message) })
      if (job.current === id) setStatus(answer.value)
    } catch (error) { if (job.current === id) { setStatus(error instanceof Error ? error.message : 'Could not check.'); setCalculated(signature) } }
    finally { if (job.current === id) setBusy(false) }
  }
  return <div className="notebook-answer-cell">
    <label>Question<textarea value={cell.prompt} maxLength={4000} onChange={event => onChange({prompt:event.target.value})} /></label>
    <label>Expected expression<input value={cell.expected} maxLength={1000} disabled={busy} onChange={event => onChange({expected:event.target.value})} /></label>
    <label>Your answer<input value={cell.response} maxLength={1000} disabled={busy} onChange={event => onChange({response:event.target.value})} /></label>
    <button type="button" className="notebook-action-button" onClick={busy ? stop : check}>{busy ? 'Stop checking' : 'Check answer'}</button>
    {calculated === signature && status && <p role="status">{status}</p>}
    <p>Checks symbolic equivalence for real variables where both expressions are defined. Domain restrictions and the validity of your working need separate checking. The expected answer remains visible for authoring.</p>
  </div>
}
