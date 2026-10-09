import { useState } from 'react'
import { proportionInference } from '../lib/proportions'
import { runOneSampleInference } from '../lib/inference'
import { spreadsheetColumns } from '../lib/spreadsheet'
import { formatNumber } from '../lib/math'

export function AdditionalInference({ values }: { values: Record<string, number | null> }) {
  const [mode, setMode] = useState('proportion')
  const [successes, setSuccesses] = useState('40'); const [n, setN] = useState('100')
  const [nullValue, setNullValue] = useState('0.5'); const [confidence, setConfidence] = useState('0.95')
  const [first, setFirst] = useState('B'); const [second, setSecond] = useState('C')
  const [result, setResult] = useState(''); const [error, setError] = useState(''); const [calculated, setCalculated] = useState('')
  const signature = JSON.stringify({ mode, successes, n, nullValue, confidence, first, second, values })
  function run() {
    setCalculated(signature)
    try {
      if (![nullValue, confidence, ...(mode === 'proportion' ? [successes, n] : [])].every(value => value.trim())) throw new Error('Enter every required value.')
      if (mode === 'proportion') {
        const r = proportionInference(Number(successes), Number(n), Number(nullValue), Number(confidence))
        setResult(`Estimated proportion = ${formatNumber(r.proportion, 6)}\nWilson ${Number(confidence)*100}% interval: [${formatNumber(r.lower, 6)}, ${formatNumber(r.upper, 6)}]\nTwo-sided score z = ${formatNumber(r.statistic, 6)}, approximate p = ${formatNumber(r.pValue, 7)}\n${r.normalApproximationAdequate ? 'Null expected counts meet the ≥10 check.' : 'Null expected counts are too small for a reliable normal-approximation test.'}`)
      } else {
        if (first === second) throw new Error('Choose different paired columns.')
        const differences: number[] = []; let omitted = 0
        for (let row = 2; row <= 18; row++) {
          const a = values[`${first}${row}`]; const b = values[`${second}${row}`]
          if (a === null && b === null) continue
          if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) { omitted++; continue }
          differences.push(a-b)
        }
        const test = runOneSampleInference(differences, 't-test', Number(nullValue), 1, Number(confidence))
        const interval = runOneSampleInference(differences, 't-interval', 0, 1, Number(confidence))
        setResult(`Complete pairs: ${test.n}; incomplete rows omitted: ${omitted}\nMean (${first} − ${second}) = ${formatNumber(test.mean, 6)}\nt(${test.n-1}) = ${formatNumber(test.statistic!, 6)}, two-sided p = ${formatNumber(test.pValue!, 7)}\n${Number(confidence)*100}% mean-difference interval: [${formatNumber(interval.lower!, 6)}, ${formatNumber(interval.upper!, 6)}]`)
      }
      setError('')
    } catch (cause) { setResult(''); setError(cause instanceof Error ? cause.message : 'Could not calculate.') }
  }
  return <section className="probability-card" aria-label="Proportions and paired inference"><div className="probability-heading"><div><h3>Proportions & paired samples</h3><p>Choose the method that matches how your observations were collected.</p></div></div>
    <div className="probability-fields"><label>Method<select value={mode} onChange={event => { setMode(event.target.value); setNullValue(event.target.value === 'paired' ? '0' : '0.5') }}><option value="proportion">Proportion interval & score test</option><option value="paired">Paired t-test & interval</option></select></label>
      {mode === 'proportion' ? <><label>Successes<input type="number" value={successes} onChange={event => setSuccesses(event.target.value)} /></label><label>Sample size<input type="number" value={n} onChange={event => setN(event.target.value)} /></label></> : <>{[first, second].map((column, index) => <label key={index}>{index ? 'Second' : 'First'} column<select value={column} onChange={event => index ? setSecond(event.target.value) : setFirst(event.target.value)}>{spreadsheetColumns.map(name => <option key={name}>{name}</option>)}</select></label>)}</>}
      <label>{mode === 'proportion' ? 'Null proportion' : 'Null mean difference'}<input type="number" value={nullValue} onChange={event => setNullValue(event.target.value)} /></label><label>Confidence (0–1)<input type="number" step=".01" value={confidence} onChange={event => setConfidence(event.target.value)} /></label><button type="button" onClick={run}>Calculate</button></div>
    <p className="probability-note">{mode === 'proportion' ? 'Assumes independent binary observations with a common success probability. Wilson coverage and the score test are approximate.' : 'Pairs match by row in the active sheet, rows 2–18. Assumes independent pairs and approximately normal differences for small samples; inspect differences for outliers.'} A p-value does not measure the probability that the null hypothesis is true.</p>
    {calculated === signature && error && <p className="probability-error" role="alert">{error}</p>}
    {calculated === signature && result && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{result}</p>}
  </section>
}
