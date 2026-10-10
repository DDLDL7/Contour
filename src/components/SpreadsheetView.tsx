import { AdditionalInference } from './AdditionalInference'
import { useMemo, useState } from 'react'
import { activeSpreadsheetSheet, evaluateSpreadsheet, fitRegression, spreadsheetColumns, spreadsheetRows, spreadsheetSheets, type RegressionKind, type SpreadsheetData } from '../lib/spreadsheet'
import { formatNumber } from '../lib/math'
import { ProbabilityCalculator } from './ProbabilityCalculator'
import { InferenceTools } from './InferenceTools'

interface Props {
  data: SpreadsheetData
  definitions: Readonly<Record<string, number>>
  parameterA: number
  onChange: (data: SpreadsheetData) => void
}

export function SpreadsheetView({ data, definitions, parameterA, onChange }: Props) {
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const regressionKind: RegressionKind = data.regressionKind ?? 'linear'
  const polynomialDegree = data.polynomialDegree ?? 3
  const [chartKind, setChartKind] = useState<'scatter' | 'histogram' | 'bar' | 'box' | 'stem'>('scatter')
  const [dataColumn, setDataColumn] = useState('B')
  const sheets = spreadsheetSheets(data)
  const sheet = activeSpreadsheetSheet(data)
  const values = useMemo(() => evaluateSpreadsheet(data, definitions, parameterA, sheet.id), [data, definitions, parameterA, sheet.id])
  const numericCells = useMemo(() => Object.fromEntries(Object.entries(values).map(([address, cell]) => [address, cell.value])), [values])
  const points = useMemo(() => Array.from({ length: spreadsheetRows - 1 }, (_, index) => index + 2)
    .map((row) => ({ x: values[`A${row}`]?.value, y: values[`B${row}`]?.value }))
    .filter((point): point is { x: number; y: number } => Number.isFinite(point.x) && Number.isFinite(point.y)), [values])
  const regression = useMemo(() => fitRegression(points, regressionKind, polynomialDegree), [points, regressionKind, polynomialDegree])
  const chartPoints = points.length ? points.map((point) => ({ ...point, fittedY: regression?.predict(point.x) ?? point.y, residual: point.y - (regression?.predict(point.x) ?? point.y) })) : []
  const bounds = chartPoints.length ? {
    minX: Math.min(...chartPoints.map((point) => point.x)), maxX: Math.max(...chartPoints.map((point) => point.x)),
    minY: Math.min(...chartPoints.flatMap((point) => [point.y, point.fittedY])), maxY: Math.max(...chartPoints.flatMap((point) => [point.y, point.fittedY])),
  } : { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  const residualBounds = chartPoints.length ? { minY: Math.min(0, ...chartPoints.map((point) => point.residual)), maxY: Math.max(0, ...chartPoints.map((point) => point.residual)) } : { minY: -1, maxY: 1 }
  const scale = (value: number, min: number, max: number, size: number) => 24 + (value - min) / (max - min || 1) * (size - 48)
  const fitLinePoints = regression ? Array.from({ length: 41 }, (_, index) => {
    const x = bounds.minX + (bounds.maxX - bounds.minX) * index / 40
    return `${scale(x, bounds.minX, bounds.maxX, 420)},${260 - scale(regression.predict(x), bounds.minY, bounds.maxY, 260)}`
  }).join(' ') : ''
  const modelText = regression ? regressionKind === 'linear'
    ? `y = ${formatNumber(regression.coefficients[1], 4)}x ${regression.coefficients[0] < 0 ? '−' : '+'} ${formatNumber(Math.abs(regression.coefficients[0]), 4)}`
    : regressionKind === 'exponential'
      ? `y = ${formatNumber(regression.coefficients[0], 4)}e^(${formatNumber(regression.coefficients[1], 4)}x)`
      : regressionKind === 'polynomial' ? `u = (x − ${formatNumber(regression.xCenter, 8)}) / ${formatNumber(regression.xScale, 8)}; y ≈ ${regression.normalizedCoefficients.map((coefficient,power)=>`${formatNumber(coefficient,6)}${power ? `u^${power}` : ''}`).join(' + ')}`
      : `y ≈ ${regression.coefficients.map((coefficient, power) => `${formatNumber(coefficient, 5)}${power ? `x^${power}` : ''}`).join(' + ')}` : ''
  const numericValues = Array.from({ length: spreadsheetRows - 1 }, (_, index) => index + 2)
    .map((row) => values[`${dataColumn}${row}`]?.value).filter((value): value is number => Number.isFinite(value))
  const sortedValues = [...numericValues].sort((a, b) => a - b)
  const quantile = (fraction: number) => {
    if (!sortedValues.length) return Number.NaN
    const index = (sortedValues.length - 1) * fraction
    const lower = Math.floor(index); const upper = Math.ceil(index)
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower)
  }
  const boxSummary = sortedValues.length ? { min: sortedValues[0], q1: quantile(.25), median: quantile(.5), q3: quantile(.75), max: sortedValues[sortedValues.length - 1] } : null
  const histogram = (() => {
    if (!numericValues.length) return [] as { start: number; end: number; count: number }[]
    const minimum = Math.min(...numericValues); const maximum = Math.max(...numericValues)
    const width = (maximum - minimum || 1) / Math.min(8, Math.max(4, Math.ceil(Math.sqrt(numericValues.length))))
    const bins = Array.from({ length: Math.ceil((maximum - minimum || 1) / width) }, (_, index) => ({ start: minimum + index * width, end: minimum + (index + 1) * width, count: 0 }))
    numericValues.forEach((value) => { const index = Math.min(bins.length - 1, Math.floor((value - minimum) / width)); bins[index].count += 1 })
    return bins
  })()
  const barData = Array.from({ length: spreadsheetRows - 1 }, (_, index) => index + 2).flatMap((row) => {
    const rawLabel = sheet.cells[`A${row}`]?.trim()
    const value = values[`B${row}`]?.value
    return rawLabel && Number.isFinite(value) ? [{ label: Number.isFinite(values[`A${row}`]?.value) ? formatNumber(values[`A${row}`]!.value!, 3) : rawLabel, value: value as number }] : []
  }).slice(0, 12)
  const stems = new Map<number, number[]>()
  sortedValues.forEach((value) => {
    const stem = Math.trunc(value)
    const leaf = Math.floor(Math.abs(value - stem) * 10 + 1e-8)
    stems.set(stem, [...(stems.get(stem) ?? []), leaf])
  })

  function updateCell(address: string, raw: string) {
    const nextCells = { ...sheet.cells, [address]: raw }
    const nextSheets = sheets.map((item) => item.id === sheet.id ? { ...item, cells: nextCells } : item)
    onChange({ ...data, cells: nextCells, sheets: nextSheets, activeSheetId: sheet.id })
  }

  function addSheet() {
    if (sheets.length >= 20) return
    const id = crypto.randomUUID()
    const next = [...sheets, { id, name: `Sheet ${sheets.length + 1}`, cells: {} }]
    onChange({ ...data, cells: sheet.cells, sheets: next, activeSheetId: id })
    setSelectedCell(null)
  }

  const singleVariableChart = chartKind !== 'scatter' && chartKind !== 'bar'
    ? numericValues.length === 0 ? <div className="spreadsheet-chart-empty">No numeric values in column {dataColumn}.</div>
      : chartKind === 'histogram' ? (() => {
        const maxCount = Math.max(...histogram.map((bin) => bin.count), 1)
        return <svg className="spreadsheet-chart" viewBox="0 0 420 260" role="img" aria-label={`Histogram of column ${dataColumn}`}>
          <line x1="24" y1="236" x2="396" y2="236" className="chart-axis"/>
          {histogram.map((bin, index) => <g key={index}><rect x={24 + index * 372 / histogram.length + 2} y={236 - bin.count / maxCount * 190} width={Math.max(2, 372 / histogram.length - 4)} height={bin.count / maxCount * 190} className="chart-bar"><title>{formatNumber(bin.start, 3)} to {formatNumber(bin.end, 3)}: {bin.count}</title></rect><text x={24 + index * 372 / histogram.length + 4} y="252" className="chart-label">{formatNumber(bin.start, 2)}</text></g>)}
        </svg>
      })()
        : chartKind === 'box' && boxSummary ? <svg className="spreadsheet-chart box-chart" viewBox="0 0 420 130" role="img" aria-label={`Box plot of column ${dataColumn}`}>
          <line x1="24" y1="65" x2="396" y2="65" className="chart-axis" />
          <line x1={scale(boxSummary.min, boxSummary.min, boxSummary.max, 420)} y1="65" x2={scale(boxSummary.max, boxSummary.min, boxSummary.max, 420)} y2="65" className="box-whisker" />
          <line x1={scale(boxSummary.min, boxSummary.min, boxSummary.max, 420)} y1="49" x2={scale(boxSummary.min, boxSummary.min, boxSummary.max, 420)} y2="81" className="box-whisker" />
          <line x1={scale(boxSummary.max, boxSummary.min, boxSummary.max, 420)} y1="49" x2={scale(boxSummary.max, boxSummary.min, boxSummary.max, 420)} y2="81" className="box-whisker" />
          <rect x={scale(boxSummary.q1, boxSummary.min, boxSummary.max, 420)} y="40" width={Math.max(1, scale(boxSummary.q3, boxSummary.min, boxSummary.max, 420) - scale(boxSummary.q1, boxSummary.min, boxSummary.max, 420))} height="50" className="box-range" />
          <line x1={scale(boxSummary.median, boxSummary.min, boxSummary.max, 420)} y1="40" x2={scale(boxSummary.median, boxSummary.min, boxSummary.max, 420)} y2="90" className="box-median" />
          <text x="24" y="118" className="chart-label">Min {formatNumber(boxSummary.min, 3)} · Q1 {formatNumber(boxSummary.q1, 3)} · Median {formatNumber(boxSummary.median, 3)} · Q3 {formatNumber(boxSummary.q3, 3)} · Max {formatNumber(boxSummary.max, 3)}</text>
        </svg>
          : <div className="stem-leaf"><div><strong>Stem</strong><strong>Leaves</strong></div>{[...stems.entries()].sort(([a], [b]) => a - b).map(([stem, leaves]) => <div key={stem}><span>{stem}</span><span>{leaves.sort((a, b) => a - b).join('  ')}</span></div>)}<small>Stem = integer part · leaves = first decimal digit</small></div>
    : chartKind === 'bar' ? barData.length ? <svg className="spreadsheet-chart" viewBox="0 0 420 260" role="img" aria-label="Bar chart of columns A and B">
      <line x1="24" y1="236" x2="396" y2="236" className="chart-axis" />
      {barData.map((item, index) => {
        const minimum = Math.min(0, ...barData.map((bar) => bar.value)); const maximum = Math.max(0, ...barData.map((bar) => bar.value))
        const zeroY = 260 - scale(0, minimum, maximum, 260); const valueY = 260 - scale(item.value, minimum, maximum, 260)
        const barWidth = Math.min(26, 300 / barData.length)
        return <g key={`${item.label}-${index}`}><rect x={42 + index * 330 / barData.length} y={Math.min(zeroY, valueY)} width={barWidth} height={Math.max(1, Math.abs(zeroY - valueY))} className="chart-bar"><title>{item.label}: {formatNumber(item.value, 4)}</title></rect><text x={43 + index * 330 / barData.length} y="253" className="chart-label">{item.label.slice(0, 5)}</text></g>
      })}
    </svg> : <div className="spreadsheet-chart-empty">Add category labels in column A and numeric values in column B.</div>
      : null

  return <div className="spreadsheet-view">
    <div className="spreadsheet-heading"><div><span className="tools-overline">Spreadsheet & statistics</span><h2>Linked data table</h2><p>Enter formulas such as <code>=A2*2</code> or <code>='Sheet 2'!A2</code>. Sheets and graph variables recalculate together.</p></div></div>
    <div className="spreadsheet-tabs"><div className="sheet-tab-list" role="tablist" aria-label="Spreadsheet sheets" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const index = sheets.findIndex(item => item.id === sheet.id)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? sheets.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + sheets.length) % sheets.length
      event.preventDefault()
      const item = sheets[next]
      onChange({ ...data, cells: item.cells, sheets, activeSheetId: item.id }); setSelectedCell(null)
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
    }}>{sheets.map((item) => <button key={item.id} id={`sheet-tab-${item.id}`} type="button" role="tab" tabIndex={item.id === sheet.id ? 0 : -1} aria-controls="sheet-panel" aria-selected={item.id === sheet.id} className={item.id === sheet.id ? 'active' : ''} onClick={() => { onChange({ ...data, cells: item.cells, sheets, activeSheetId: item.id }); setSelectedCell(null) }}>{item.name}</button>)}</div><button type="button" onClick={addSheet} disabled={sheets.length >= 20} title={sheets.length >= 20 ? 'Maximum of 20 sheets' : 'Add sheet'}>+ Add sheet</button></div>
    <div className="spreadsheet-layout">
      <section className="spreadsheet-grid-card" id="sheet-panel" role="tabpanel" aria-labelledby={`sheet-tab-${sheet.id}`} aria-label="Editable spreadsheet">
        <div className="spreadsheet-scroll"><table className="spreadsheet-grid"><thead><tr><th scope="col">Row</th>{spreadsheetColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{Array.from({ length: spreadsheetRows }, (_, rowIndex) => rowIndex + 1).map((row) => <tr key={row}><th scope="row">{row}</th>{spreadsheetColumns.map((column) => {
            const address = `${column}${row}`; const value = values[address]
            return <td key={address} className={value?.error ? 'cell-error' : ''}>
              <input aria-label={`${sheet.name} cell ${address}`} title={value?.error ?? (value?.value === null || value?.value === undefined ? '' : `Value: ${formatNumber(value.value, 6)}`)} value={selectedCell === address || !value?.raw.startsWith('=') || value.value === null ? (sheet.cells[address] ?? '') : formatNumber(value.value, 6)} onFocus={() => setSelectedCell(address)} onBlur={() => setSelectedCell(null)} onChange={(event) => updateCell(address, event.target.value)} />
              {value?.error && <span className="cell-error-tip" role="tooltip">{value.error}</span>}
            </td>
          })}</tr>)}</tbody>
        </table></div>
        <p className="spreadsheet-note">Formulas update when referenced cells or project variables change. Circular references are reported in the affected cells.</p>
      </section>
      <section className="spreadsheet-chart-card" aria-label="Scatter plot, regression, and residuals">
        <div className="spreadsheet-card-heading"><div><h3>{chartKind === 'scatter' ? 'Scatter plot' : chartKind === 'bar' ? 'Bar chart' : chartKind === 'histogram' ? 'Histogram' : chartKind === 'box' ? 'Box plot' : 'Stem-and-leaf'}</h3><p>{chartKind === 'scatter' || chartKind === 'bar' ? 'Columns A and B · rows 2–18' : `Column ${dataColumn} · rows 2–18`}</p></div><span>{chartKind === 'bar' ? barData.length : chartKind === 'scatter' ? points.length : numericValues.length} values</span></div>
        <div className="spreadsheet-chart-options"><label>Chart<select value={chartKind} onChange={(event) => setChartKind(event.target.value as typeof chartKind)}><option value="scatter">Scatter plot</option><option value="bar">Bar chart</option><option value="histogram">Histogram</option><option value="box">Box plot</option><option value="stem">Stem-and-leaf</option></select></label>{chartKind !== 'scatter' && chartKind !== 'bar' && <label>Values from<select value={dataColumn} onChange={(event) => setDataColumn(event.target.value)}>{spreadsheetColumns.map((column) => <option key={column} value={column}>Column {column}</option>)}</select></label>}</div>
        {chartKind !== 'scatter' ? <>{singleVariableChart}</> : <>
        <label className="regression-picker">Regression model<select value={regressionKind} onChange={(event) => onChange({...data,regressionKind:event.target.value as RegressionKind})}><option value="linear">Linear</option><option value="exponential">Exponential</option><option value="quadratic">Quadratic</option><option value="polynomial">Polynomial</option></select></label>
        {regressionKind === 'polynomial' && <label className="regression-picker">Degree (2–8)<input type="number" min="2" max="8" value={polynomialDegree} onChange={event => onChange({...data,polynomialDegree:Math.max(2,Math.min(8,Number(event.target.value) || 2))})} /></label>}
        {points.length < 2 ? <div className="spreadsheet-chart-empty">Enter at least two numeric x,y pairs in columns A and B.</div> : <svg className="spreadsheet-chart" viewBox="0 0 420 260" role="img" aria-label={`${regressionKind} regression scatter plot`}>
          <line x1="24" y1="236" x2="396" y2="236" className="chart-axis"/><line x1="24" y1="24" x2="24" y2="236" className="chart-axis"/>
          {regression && <polyline points={fitLinePoints} className="chart-fit" />}
          {points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={scale(point.x, bounds.minX, bounds.maxX, 420)} cy={260 - scale(point.y, bounds.minY, bounds.maxY, 260)} r="4.5" className="chart-dot"><title>({formatNumber(point.x, 3)}, {formatNumber(point.y, 3)})</title></circle>)}
        </svg>}
        {points.length >= 2 && !regression && <div className="spreadsheet-chart-empty">This fit needs more distinct x values{regressionKind === 'exponential' ? ' and positive y values' : ''}.</div>}
        {regression && <div className="regression-summary"><span>{regressionKind[0].toUpperCase() + regressionKind.slice(1)} model</span><strong>{modelText}</strong><small>R² = {formatNumber(regression.rSquared, 4)}</small></div>}
        {regression && <>
          <div className="spreadsheet-card-heading residual-heading"><div><h3>Residual plot</h3><p>Observed y − fitted y</p></div></div>
          <svg className="spreadsheet-chart residual-chart" viewBox="0 0 420 180" role="img" aria-label="Residual plot">
            <line x1="24" y1={180 - scale(0, residualBounds.minY, residualBounds.maxY, 180)} x2="396" y2={180 - scale(0, residualBounds.minY, residualBounds.maxY, 180)} className="chart-zero" />
            {chartPoints.map((point, index) => <circle key={`residual-${index}`} cx={scale(point.x, bounds.minX, bounds.maxX, 420)} cy={180 - scale(point.residual, residualBounds.minY, residualBounds.maxY, 180)} r="4" className="chart-residual"><title>x = {formatNumber(point.x, 3)}, residual = {formatNumber(point.residual, 4)}</title></circle>)}
          </svg>
          <div className="residual-values"><strong>Residuals</strong>{chartPoints.map((point, index) => <span key={`res-${index}`}>({formatNumber(point.x, 3)}, {formatNumber(point.residual, 3)})</span>)}</div>
        </>}
        </>}
      </section>
    </div>
    <div className="spreadsheet-statistics"><ProbabilityCalculator /><AdditionalInference values={numericCells} /><InferenceTools values={numericCells} inferenceMode={data.inferenceMode} welch={data.welch} onModeChange={(inferenceMode) => onChange({ ...data, inferenceMode })} onWelchChange={(welch) => onChange({ ...data, welch })} /></div>
  </div>
}
