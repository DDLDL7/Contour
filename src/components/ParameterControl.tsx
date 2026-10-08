import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { formatNumber } from '../lib/math'
import { animatedParameterValue, isParameterRange, type SliderParameter } from '../lib/parameters'

interface Props {
  parameter: SliderParameter
  onChange: (parameter: SliderParameter, dragging?: boolean) => void
  onRemove?: () => void
  stopSignal?: number
}

export function ParameterControl({ parameter, onChange, onRemove, stopSignal }: Props) {
  const [rangeDraft, setRangeDraft] = useState({ min: String(parameter.min), max: String(parameter.max), step: String(parameter.step), animationSeconds: String(parameter.animationSeconds ?? 4) })
  const [rangeError, setRangeError] = useState('')
  const [playing, setPlaying] = useState(false)
  const directionRef = useRef<1 | -1>(1)
  const latestRef = useRef({ parameter, onChange })
  latestRef.current = { parameter, onChange }

  useEffect(() => {
    setRangeDraft({ min: String(parameter.min), max: String(parameter.max), step: String(parameter.step), animationSeconds: String(parameter.animationSeconds ?? 4) })
    setRangeError('')
  }, [parameter.min, parameter.max, parameter.step, parameter.animationSeconds])

  useEffect(() => { setPlaying(false) }, [stopSignal])

  useEffect(() => {
    if (!playing) return
    const startValue = parameter.value
    const startDirection = directionRef.current
    const startedAt = performance.now()
    const range = { min: parameter.min, max: parameter.max, step: parameter.step, animationSeconds: parameter.animationSeconds }
    const interval = window.setInterval(() => {
      const next = animatedParameterValue(range, startValue, startDirection, performance.now() - startedAt)
      directionRef.current = next.direction
      const current = latestRef.current
      if (next.value !== current.parameter.value) current.onChange({ ...current.parameter, value: next.value }, true)
    }, 50)
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', pauseWhenHidden)
    }
  }, [playing, parameter.name, parameter.min, parameter.max, parameter.step, parameter.animationSeconds])

  function saveRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Object.values(rangeDraft).some((value) => !value.trim())) { setRangeError('Enter a minimum, maximum, step, and sweep time.'); return }
    const range = { min: Number(rangeDraft.min), max: Number(rangeDraft.max), step: Number(rangeDraft.step), animationSeconds: Number(rangeDraft.animationSeconds) }
    if (!isParameterRange(range)) { setRangeError('Use min < max, a positive step within the range, and a sweep time from 0.5 to 60 seconds.'); return }
    const clamped = Math.max(range.min, Math.min(range.max, parameter.value))
    const value = Number(Math.min(range.max, range.min + Math.round((clamped - range.min) / range.step) * range.step).toPrecision(12))
    setPlaying(false)
    onChange({ ...parameter, ...range, value })
    setRangeError('')
  }

  return <div className="parameter-item">
    <div className="parameter-label">
      <label htmlFor={`parameter-${parameter.name}`}>{parameter.name}</label>
      <div className="parameter-value"><output htmlFor={`parameter-${parameter.name}`}>{formatNumber(parameter.value, 3)}</output><button type="button" className="parameter-animate" aria-label={`${playing ? 'Pause' : 'Animate'} parameter ${parameter.name}`} title={`${playing ? 'Pause' : 'Animate'} parameter ${parameter.name}`} aria-pressed={playing} onClick={() => setPlaying((current) => !current)}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>{onRemove && <button type="button" className="parameter-remove" aria-label={`Remove parameter ${parameter.name}`} title={`Remove parameter ${parameter.name}`} onClick={onRemove}><Trash2 size={14} /></button>}</div>
    </div>
    <input id={`parameter-${parameter.name}`} className="parameter-slider" type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => { setPlaying(false); onChange({ ...parameter, value: Number(event.target.value) }, true) }} />
    <div className="slider-ends"><span>{formatNumber(parameter.min, 3)}</span><span>{formatNumber(parameter.max, 3)}</span></div>
    <details className="parameter-settings"><summary>Range, step and speed</summary><form onSubmit={saveRange}>
      <label>Min<input aria-label={`${parameter.name} minimum`} type="number" step="any" value={rangeDraft.min} onChange={(event) => setRangeDraft((current) => ({ ...current, min: event.target.value }))} /></label>
      <label>Max<input aria-label={`${parameter.name} maximum`} type="number" step="any" value={rangeDraft.max} onChange={(event) => setRangeDraft((current) => ({ ...current, max: event.target.value }))} /></label>
      <label>Step<input aria-label={`${parameter.name} step`} type="number" min="0.000001" step="any" value={rangeDraft.step} onChange={(event) => setRangeDraft((current) => ({ ...current, step: event.target.value }))} /></label>
      <label className="parameter-speed">Sweep time (seconds)<input aria-label={`${parameter.name} sweep time in seconds`} type="number" min="0.5" max="60" step="0.5" value={rangeDraft.animationSeconds} onChange={(event) => setRangeDraft((current) => ({ ...current, animationSeconds: event.target.value }))} /></label>
      <button type="submit">Apply</button>
    </form>{rangeError && <p role="alert">{rangeError}</p>}</details>
  </div>
}
