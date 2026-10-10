import { act, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GraphLoadBoundary } from './Graph3DLoader'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('contains a rejected 3D chunk and keeps surrounding workspace controls mounted', async () => {
  const BrokenScene = lazy(() => Promise.reject(new Error('Chunk unavailable')))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await act(async () => root.render(<><button>Save project</button><GraphLoadBoundary><Suspense fallback="Loading"><BrokenScene /></Suspense></GraphLoadBoundary></>))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('3D graph could not load')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Save project', 'Reload workspace'])
  } finally {
    act(() => root.unmount()); host.remove(); report.mockRestore()
  }
})
