import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { InferenceTools } from './InferenceTools'
import { defaultWelchSettings } from '../lib/inference'

describe('Welch inference results', () => {
  it('reopens saved settings, clears stale results and reports invalid samples', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    const values = { B2: 1, B3: 2, B4: 3, C2: 4, C3: 5, C4: 6 }
    const props = { values, inferenceMode: 'welch' as const, welch: { ...defaultWelchSettings, confidence: '.99' }, onModeChange: vi.fn(), onWelchChange: vi.fn() }
    try {
      act(() => root.render(<InferenceTools {...props} />))
      expect(host.querySelector<HTMLInputElement>('input[max="0.999"]')!.value).toBe('.99')
      act(() => host.querySelector<HTMLButtonElement>('button')!.click())
      expect(host.querySelector('[role="status"]')?.textContent).toContain('99% two-sided CI')
      act(() => root.render(<InferenceTools {...props} values={{ ...values, B2: 10 }} />))
      expect(host.querySelector('[role="status"]')).toBeNull()
      act(() => root.render(<InferenceTools {...props} welch={{ ...props.welch, secondColumn: 'B' }} />))
      act(() => host.querySelector<HTMLButtonElement>('button')!.click())
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('two different sample columns')
      expect(host.querySelector('[role="status"]')).toBeNull()
    } finally { act(() => root.unmount()); host.remove() }
  })
})
