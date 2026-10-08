import { useEffect, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { formatNumber } from '../lib/math'
import { isParameterRange, type SliderParameter } from '../lib/parameters'

interface Props {
  parameter: SliderParameter
  onChange: (parameter: SliderParameter, dragging?: boolean) => void
  onRemove?: () => void
}

export function ParameterControl({ parameter, onChange, onRemove }: Props) {
  const [rangeDraft, setRangeDraft] = useState({ min: String(parameter.min), max: String(parameter.max), step: String(parameter.step) })
  const [rangeError, setRangeError] = useState('')

  useEffect(() => {
    setRangeDraft({ min: String(parameter.min), max: String(parameter.max), step: String(parameter.step) })
    setRangeError('')
  }, [parameter.min, parameter.max, parameter.step])

  function saveRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Object.values(rangeDraft).some((value) => !value.trim())) { setRangeError('Enter a minimum, maximum, and step.'); return }
    const range = { min: Number(rangeDraft.min), max: Number(rangeDraft.max), step: Number(rangeDraft.step) }
    if (!isParameterRange(range)) { setRangeError('Use a minimum below the maximum and a positive step no larger than the range.'); return }
    const clamped = Math.max(range.min, Math.min(range.max, parameter.value))
    const value = Number(Math.min(range.max, range.min + Math.round((clamped - range.min) / range.step) * range.step).toPrecision(12))
    onChange({ ...parameter, ...range, value })
    setRangeError('')
  }

  return <div className="parameter-item">
    <div className="parameter-label">
      <label htmlFor={`parameter-${parameter.name}`}>{parameter.name}</label>
      <div className="parameter-value"><output htmlFor={`parameter-${parameter.name}`}>{formatNumber(parameter.value, 3)}</output>{onRemove && <button type="button" className="parameter-remove" aria-label={`Remove parameter ${parameter.name}`} title={`Remove parameter ${parameter.name}`} onClick={onRemove}><Trash2 size={14} /></button>}</div>
    </div>
    <input id={`parameter-${parameter.name}`} className="parameter-slider" type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => onChange({ ...parameter, value: Number(event.target.value) }, true)} />
    <div className="slider-ends"><span>{formatNumber(parameter.min, 3)}</span><span>{formatNumber(parameter.max, 3)}</span></div>
    <details className="parameter-settings"><summary>Range and step</summary><form onSubmit={saveRange}>
      <label>Min<input aria-label={`${parameter.name} minimum`} type="number" step="any" value={rangeDraft.min} onChange={(event) => setRangeDraft((current) => ({ ...current, min: event.target.value }))} /></label>
      <label>Max<input aria-label={`${parameter.name} maximum`} type="number" step="any" value={rangeDraft.max} onChange={(event) => setRangeDraft((current) => ({ ...current, max: event.target.value }))} /></label>
      <label>Step<input aria-label={`${parameter.name} step`} type="number" min="0.000001" step="any" value={rangeDraft.step} onChange={(event) => setRangeDraft((current) => ({ ...current, step: event.target.value }))} /></label>
      <button type="submit">Apply</button>
    </form>{rangeError && <p role="alert">{rangeError}</p>}</details>
  </div>
}
