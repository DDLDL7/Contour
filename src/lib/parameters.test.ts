import { describe, expect, it } from 'vitest'
import { areSliderParameters, nextParameterName, unusedParameterNames } from './parameters'

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
})
