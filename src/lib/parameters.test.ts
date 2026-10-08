import { describe, expect, it } from 'vitest'
import { animatedParameterValue, areSliderParameters, isParameterRange, nextParameterName, unusedParameterNames } from './parameters'

describe('project sliders', () => {
  it('chooses an unused letter instead of shadowing an expression definition', () => {
    expect(nextParameterName([{ text: 'b = 2a' }], [])).toBe('c')
    expect(nextParameterName([], [{ name: 'b', value: 1, min: -5, max: 5, step: .1 }])).toBe('c')
    expect(unusedParameterNames([{ text: 'b = 2a' }], []).includes('p')).toBe(true)
    expect(unusedParameterNames([{ text: 'b = 2a' }], []).includes('b')).toBe(false)
  })

  it('rejects duplicate names and values outside a saved range', () => {
    const slider = { name: 'b', value: 1, min: -5, max: 5, step: .1 }
    expect(areSliderParameters([slider])).toBe(true)
    expect(areSliderParameters([slider, slider])).toBe(false)
    expect(areSliderParameters([{ ...slider, value: 6 }])).toBe(false)
  })

  it('sweeps from the current value to each bound and back at the saved speed', () => {
    const range = { min: -2, max: 2, step: 0.5, animationSeconds: 2 }
    expect(animatedParameterValue(range, 0, 1, 0)).toEqual({ value: 0, direction: 1 })
    expect(animatedParameterValue(range, 0, 1, 1000)).toEqual({ value: 2, direction: 1 })
    expect(animatedParameterValue(range, 0, 1, 1500)).toEqual({ value: 1, direction: -1 })
    expect(animatedParameterValue(range, 0, -1, 500)).toEqual({ value: -1, direction: -1 })
  })

  it('validates sweep speed while accepting older ranges without it', () => {
    const range = { min: -5, max: 5, step: 0.1 }
    expect(isParameterRange(range)).toBe(true)
    expect(isParameterRange({ ...range, animationSeconds: 0 })).toBe(false)
    expect(isParameterRange({ ...range, animationSeconds: 61 })).toBe(false)
    expect(isParameterRange({ ...range, animationSeconds: 4 })).toBe(true)
  })
})
