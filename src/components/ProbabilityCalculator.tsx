import { useState } from 'react'
import { calculateProbability, sampleDistribution, type DistributionName, type DistributionPlotPoint } from '../lib/probability'
import { formatNumber } from '../lib/math'

const distributionInfo: Record<DistributionName, { label: string; firstLabel: string; secondLabel?: string; firstDefault: string; secondDefault?: string; note: string }> = {
  normal: { label: 'Normal', firstLabel: 'Mean μ', secondLabel: 'Standard deviation σ', firstDefault: '0', secondDefault: '1', note: 'For continuous distributions, density is not the probability of one exact value. Use the cumulative value for P(X ≤ x).' },
  binomial: { label: 'Binomial', firstLabel: 'Trials n', secondLabel: 'Success probability p', firstDefault: '10', secondDefault: '0.5', note: 'The cumulative result is P(X ≤ floor(x)); point mass is shown only when x is an integer.' },
  poisson: { label: 'Poisson', firstLabel: 'Rate λ', firstDefault: '3', note: 'The cumulative result is P(X ≤ floor(x)); point mass is shown only when x is a non-negative integer.' },
  'student-t': { label: 'Student-t', firstLabel: 'Degrees of freedom', firstDefault: '10', note: 'This is the standard Student-t distribution centered at zero.' },
  'chi-square': { label: 'Chi-squared', firstLabel: 'Degrees of freedom', firstDefault: '4', note: 'Chi-squared values are non-negative; the input is degrees of freedom.' },
}

export function ProbabilityCalculator() {
  const [distribution, setDistribution] = useState<DistributionName>('normal')
  const [x, setX] = useState('1')
  const [first, setFirst] = useState('0')
  const [second, setSecond] = useState('1')
  const [result, setResult] = useState<ReturnType<typeof calculateProbability> | null>(null)
  const [plot, setPlot] = useState<DistributionPlotPoint[]>([])
  const [error, setError] = useState('')
  const info = distributionInfo[distribution]

  function clearResult() {
    setResult(null)
    setPlot([])
    setError('')
  }

  function updateDistribution(next: DistributionName) {
    setDistribution(next)
    setFirst(distributionInfo[next].firstDefault)
    setSecond(distributionInfo[next].secondDefault ?? '')
    clearResult()
  }

  function calculate() {
    try {
      if (!x.trim() || !first.trim() || (info.secondLabel && !second.trim())) throw new Error('Enter every required value before calculating.')
      const firstParameter = Number(first)
      const secondParameter = info.secondLabel ? Number(second) : 0
      setResult(calculateProbability({ distribution, x: Number(x), firstParameter, secondParameter }))
      setPlot(sampleDistribution({ distribution, firstParameter, secondParameter }))
      setError('')
    } catch (cause) {
      setResult(null)
      setPlot([])
      setError(cause instanceof Error ? cause.message : 'Could not calculate this probability.')
    }
  }

  return <section className="probability-card" aria-label="Probability calculator">
    <div className="probability-heading"><div><span className="tools-overline">Probability</span><h3>Distribution calculator</h3><p>Evaluate a point density or mass and the cumulative probability.</p></div></div>
    <div className="probability-fields">
      <label>Distribution<select value={distribution} onChange={(event) => updateDistribution(event.target.value as DistributionName)}>{Object.entries(distributionInfo).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
      <label>{distribution === 'binomial' || distribution === 'poisson' ? 'Observation x' : 'Value x'}<input type="number" value={x} onChange={(event) => { setX(event.target.value); clearResult() }} /></label>
      <label>{info.firstLabel}<input type="number" value={first} onChange={(event) => { setFirst(event.target.value); clearResult() }} /></label>
      {info.secondLabel && <label>{info.secondLabel}<input type="number" value={second} onChange={(event) => { setSecond(event.target.value); clearResult() }} /></label>}
      <button type="button" onClick={calculate}>Calculate</button>
    </div>
    <p className="probability-note">{info.note}</p>
    {error && <p className="probability-error" role="alert">{error}</p>}
    {result && <>
      <div className="probability-result" role="status"><div><span>{result.label}</span><strong>{result.measure === 'mass' ? 'P(X = x)' : 'Density'}</strong><b>{formatNumber(result.densityOrMass, 7)}</b></div><div><span>{result.label}</span><strong>P(X ≤ x)</strong><b>{formatNumber(result.cumulative, 7)}</b></div></div>
      {plot.length > 1 && <DistributionPlot points={plot} discrete={result.measure === 'mass'} label={result.label} />}
    </>}
  </section>
}

function DistributionPlot({ points, discrete, label }: { points: DistributionPlotPoint[]; discrete: boolean; label: string }) {
  const minX = points[0].x; const maxX = points[points.length - 1].x
  const maxY = Math.max(...points.map((point) => point.y), 1e-12)
  const x = (value: number) => 30 + (value - minX) / (maxX - minX || 1) * 360
  const y = (value: number) => 174 - value / maxY * 145
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(' ')
  return <svg className="distribution-plot" viewBox="0 0 420 205" role="img" aria-label={`Probability plot for ${label}`}>
    <line x1="30" y1="174" x2="390" y2="174" className="chart-axis" />
    {discrete ? points.map((point, index) => <rect key={index} x={x(point.x) - 2} y={y(point.y)} width="4" height={174 - y(point.y)} className="distribution-bar"><title>x = {formatNumber(point.x, 3)} · {formatNumber(point.y, 6)}</title></rect>) : <path d={path} className="distribution-density" />}
    <text x="30" y="194" className="chart-label">{formatNumber(minX, 3)}</text><text x="390" y="194" textAnchor="end" className="chart-label">{formatNumber(maxX, 3)}</text>
  </svg>
}
