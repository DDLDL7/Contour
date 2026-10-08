import { useState } from 'react'
import { runBonferroniPairwise, runChiSquareGoodnessOfFit, runChiSquareIndependence, runOneSampleInference, runOneWayAnova, type Alternative, type InferenceMethod } from '../lib/inference'
import { formatNumber } from '../lib/math'
import { spreadsheetColumns } from '../lib/spreadsheet'

interface Props { values: Record<string, number | null> }

const methods: { id: InferenceMethod; label: string }[] = [
  { id: 't-test', label: 'One-sample t-test' }, { id: 'z-test', label: 'One-sample z-test' },
  { id: 't-interval', label: 'Mean confidence interval (t)' }, { id: 'z-interval', label: 'Mean confidence interval (z)' },
]

type InferenceMode = 'one-sample' | 'anova' | 'posthoc' | 'chi-square' | 'independence'

export function InferenceTools({ values }: Props) {
  const [mode, setMode] = useState<InferenceMode>('one-sample')
  const [column, setColumn] = useState('B')
  const [expectedColumn, setExpectedColumn] = useState('C')
  const [groupColumns, setGroupColumns] = useState<string[]>(['A', 'B'])
  const [method, setMethod] = useState<InferenceMethod>('t-test')
  const [nullMean, setNullMean] = useState('0')
  const [populationSd, setPopulationSd] = useState('1')
  const [confidence, setConfidence] = useState('0.95')
  const [alternative, setAlternative] = useState<Alternative>('two-sided')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReturnType<typeof runOneSampleInference> | null>(null)
  const [anovaResult, setAnovaResult] = useState<ReturnType<typeof runOneWayAnova> | null>(null)
  const [goodnessResult, setGoodnessResult] = useState<ReturnType<typeof runChiSquareGoodnessOfFit> | null>(null)
  const [independenceResult, setIndependenceResult] = useState<ReturnType<typeof runChiSquareIndependence> | null>(null)
  const [pairwiseResult, setPairwiseResult] = useState<ReturnType<typeof runBonferroniPairwise> | null>(null)
  const [calculatedInputs, setCalculatedInputs] = useState('')
  const isZ = method === 'z-test' || method === 'z-interval'
  const isInterval = method.endsWith('interval')
  const inputSignature = JSON.stringify({ mode, column, expectedColumn, groupColumns, method, nullMean, populationSd, confidence, alternative, values })

  function calculate() {
    try {
      setPairwiseResult(null); setIndependenceResult(null)
      if (mode === 'one-sample') {
        if ((!isInterval && !nullMean.trim()) || (isZ && !populationSd.trim()) || (isInterval && !confidence.trim())) throw new Error('Enter every required test or interval value.')
        const observations = Array.from({ length: 17 }, (_, index) => values[`${column}${index + 2}`]).filter((value): value is number => value !== null && Number.isFinite(value))
        setResult(runOneSampleInference(observations, method, isInterval ? 0 : Number(nullMean), isZ ? Number(populationSd) : 1, isInterval ? Number(confidence) : .95, alternative))
        setAnovaResult(null); setGoodnessResult(null)
      } else if (mode === 'anova') {
        const groups = groupColumns.map((name) => Array.from({ length: 17 }, (_, index) => values[`${name}${index + 2}`]).filter((value): value is number => value !== null && Number.isFinite(value)))
        setAnovaResult(runOneWayAnova(groups)); setResult(null); setGoodnessResult(null)
      } else if (mode === 'posthoc') {
        const groups = groupColumns.map((name) => Array.from({ length: 17 }, (_, index) => values[`${name}${index + 2}`]).filter((value): value is number => value !== null && Number.isFinite(value)))
        setPairwiseResult(runBonferroniPairwise(groups)); setResult(null); setAnovaResult(null); setGoodnessResult(null); setIndependenceResult(null)
      } else if (mode === 'independence') {
        if (groupColumns.length < 2) throw new Error('Select at least two columns for the contingency table.')
        const table = Array.from({ length: 17 }, (_, index) => groupColumns.map((name) => values[`${name}${index + 2}`])).filter((row): row is number[] => row.every((value): value is number => value !== null && Number.isFinite(value)))
        setIndependenceResult(runChiSquareIndependence(table)); setResult(null); setAnovaResult(null); setGoodnessResult(null); setPairwiseResult(null)
      } else {
        if (column === expectedColumn) throw new Error('Choose different columns for observed and expected counts.')
        const pairs: { observed: number; expected: number }[] = []
        for (let row = 2; row <= 18; row += 1) {
          const observed = values[`${column}${row}`]
          const expected = values[`${expectedColumn}${row}`]
          const hasObserved = Number.isFinite(observed)
          const hasExpected = Number.isFinite(expected)
          if (hasObserved !== hasExpected) throw new Error(`Row ${row} needs both an observed and an expected count.`)
          if (hasObserved && hasExpected) pairs.push({ observed: observed!, expected: expected! })
        }
        const observed = pairs.map((pair) => pair.observed)
        const expected = pairs.map((pair) => pair.expected)
        setGoodnessResult(runChiSquareGoodnessOfFit(observed, expected)); setResult(null); setAnovaResult(null)
      }
      setCalculatedInputs(inputSignature)
      setError('')
    } catch (cause) {
      setCalculatedInputs(inputSignature)
      setResult(null); setAnovaResult(null); setGoodnessResult(null)
      setError(cause instanceof Error ? cause.message : 'Could not complete this inference procedure.')
    }
  }

  return <section className="inference-card" aria-label="One-sample statistical inference">
    <div className="probability-heading"><div><span className="tools-overline">Statistical inference</span><h3>Tests & confidence intervals</h3><p>Run supported procedures on spreadsheet data.</p></div></div>
    <div className="probability-fields">
      <label>Procedure<select value={mode} onChange={(event) => { setMode(event.target.value as InferenceMode); setResult(null); setAnovaResult(null); setGoodnessResult(null); setIndependenceResult(null); setPairwiseResult(null); setError('') }}><option value="one-sample">One-sample test / interval</option><option value="anova">One-way ANOVA</option><option value="posthoc">ANOVA post-hoc comparisons</option><option value="chi-square">Chi-squared goodness of fit</option><option value="independence">Chi-squared independence</option></select></label>
      {mode === 'one-sample' && <>
      <label>Data column<select value={column} onChange={(event) => setColumn(event.target.value)}>{spreadsheetColumns.map((name) => <option key={name} value={name}>Column {name}</option>)}</select></label>
      <label>Method<select value={method} onChange={(event) => { setMethod(event.target.value as InferenceMethod); setResult(null); setError('') }}>{methods.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {!isInterval && <label>Null mean μ₀<input type="number" value={nullMean} onChange={(event) => setNullMean(event.target.value)} /></label>}
      {isZ && <label>Known population σ<input type="number" min="0" value={populationSd} onChange={(event) => setPopulationSd(event.target.value)} /></label>}
      {isInterval && <label>Confidence level<input type="number" min="0.01" max="0.999" step="0.01" value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>}
      {!isInterval && <label>Alternative<select value={alternative} onChange={(event) => setAlternative(event.target.value as Alternative)}><option value="two-sided">Two-sided</option><option value="greater">Greater than</option><option value="less">Less than</option></select></label>}
      </>}
      {(mode === 'anova' || mode === 'posthoc' || mode === 'independence') && <fieldset className="anova-groups"><legend>{mode === 'independence' ? 'Table columns (each row is a category)' : 'Groups (one column per group)'}</legend>{spreadsheetColumns.map((name) => <label key={name}><input type="checkbox" checked={groupColumns.includes(name)} onChange={(event) => setGroupColumns((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} />{name}</label>)}</fieldset>}
      {mode === 'chi-square' && <><label>Observed counts<select value={column} onChange={(event) => setColumn(event.target.value)}>{spreadsheetColumns.map((name) => <option key={name} value={name}>Column {name}</option>)}</select></label><label>Expected counts<select value={expectedColumn} onChange={(event) => setExpectedColumn(event.target.value)}>{spreadsheetColumns.map((name) => <option key={name} value={name}>Column {name}</option>)}</select></label></>}
      <button type="button" onClick={calculate}>Calculate</button>
    </div>
    <p className="probability-note">{mode === 'one-sample' ? `${isZ ? 'Z procedures assume the population standard deviation is known.' : 'T procedures estimate spread from the sample and use n − 1 degrees of freedom.'} These one-sample procedures do not test normality or account for paired, clustered, or survey-sampled data.` : mode === 'anova' || mode === 'posthoc' ? 'ANOVA and pooled-variance post-hoc comparisons assume independent observations, approximately normal residuals, and similar group variances.' : mode === 'independence' ? 'Each spreadsheet row is one table row and each selected column is one table column. Expected cell counts should generally be at least five.' : 'This goodness-of-fit test compares observed counts in one column with expected counts in another. Expected counts must be positive and have the same total as observed counts.'}</p>
    {error && calculatedInputs === inputSignature && <p className="probability-error" role="alert">{error}</p>}
    {calculatedInputs === inputSignature && result && <div className="inference-result" role="status">
      <span>n = {result.n} · mean = {formatNumber(result.mean, 5)} · sample s = {formatNumber(result.sampleStandardDeviation, 5)}</span>
      {result.statistic !== undefined && <><strong>{isZ ? 'z' : 't'} = {formatNumber(result.statistic, 5)} · p = {formatNumber(result.pValue ?? 0, 6)}</strong><small>Test against H₀: μ = {formatNumber(Number(nullMean), 5)} ({alternative.replace('-', ' ')}).</small></>}
      {result.lower !== undefined && <><strong>{formatNumber((result.confidence ?? 0) * 100, 1)}% CI: [{formatNumber(result.lower, 5)}, {formatNumber(result.upper ?? result.lower, 5)}]</strong><small>{isZ ? 'Known population standard deviation.' : `t critical value with ${result.n - 1} degrees of freedom.`}</small></>}
    </div>}
    {calculatedInputs === inputSignature && anovaResult && <div className="inference-result" role="status"><span>{anovaResult.groups} groups · n = {anovaResult.observations} · grand mean = {formatNumber(anovaResult.grandMean, 5)}</span><strong>F({anovaResult.numeratorDf}, {anovaResult.denominatorDf}) = {formatNumber(anovaResult.fStatistic, 5)} · p = {formatNumber(anovaResult.pValue, 6)}</strong><small>ANOVA tests whether all group means are equal. Use the post-hoc procedure to compare selected pairs.</small></div>}
    {calculatedInputs === inputSignature && pairwiseResult && <div className="inference-result" role="status"><span>Bonferroni-adjusted pooled-variance t comparisons</span>{pairwiseResult.map((pair) => <strong key={`${pair.first}-${pair.second}`}>Group {groupColumns[pair.first]} − {groupColumns[pair.second]} = {formatNumber(pair.meanDifference, 5)} · t({pair.degreesOfFreedom}) = {formatNumber(pair.statistic, 5)} · adjusted p = {formatNumber(pair.adjustedPValue, 6)}</strong>)}<small>Uses the pooled within-group variance and controls family-wise error with Bonferroni adjustment.</small></div>}
    {calculatedInputs === inputSignature && goodnessResult && <div className="inference-result" role="status"><span>{goodnessResult.categories} categories · total = {formatNumber(goodnessResult.total, 4)}</span><strong>χ²({goodnessResult.degreesOfFreedom}) = {formatNumber(goodnessResult.statistic, 5)} · p = {formatNumber(goodnessResult.pValue, 6)}</strong><small>Expected counts should generally be sufficiently large for the chi-squared approximation to be reliable.</small></div>}
    {calculatedInputs === inputSignature && independenceResult && <div className="inference-result" role="status"><span>{independenceResult.rows} × {independenceResult.columns} table · n = {independenceResult.total} · smallest expected count = {formatNumber(independenceResult.expectedMinimum, 4)}</span><strong>χ²({independenceResult.degreesOfFreedom}) = {formatNumber(independenceResult.statistic, 5)} · p = {formatNumber(independenceResult.pValue, 6)}</strong><small>Uses Pearson’s chi-squared statistic without continuity correction.</small></div>}
  </section>
}
