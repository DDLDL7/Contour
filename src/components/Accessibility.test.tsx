import { act } from 'react'
import { createRoot } from 'react-dom/client'
import axe from 'axe-core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'

// WebGL and MathLive shadow DOM need real-browser checks. Keep this audit
// focused on the application's own landmarks, forms, controls and messages.
vi.mock('./Graph2D', () => ({ Graph2D: () => <canvas role="img" aria-label="2D graph" /> }))
vi.mock('./Graph3DLoader', () => ({ Graph3D: () => <canvas role="img" aria-label="3D graph" /> }))
vi.mock('./EquationField', () => ({ EquationField: ({ label }: { label: string }) => <input aria-label={label} /> }))
vi.mock('./MathResult', () => ({ MathResult: ({ value }: { value: string }) => <span>{value}</span> }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement('div')
let root: ReturnType<typeof createRoot>
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { act(() => root?.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks() })

it.each(['2D Graph', '3D Graph', 'Maths Tools', 'Spreadsheet & Stats', 'Notebook'])('has no automated semantic accessibility violations in %s', async label => {
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(button => button.getAttribute('aria-label') === label)!
  await act(async () => tab.click())
  const results = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } })
  expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.html) }))).toEqual([])
})

it('keeps Help focus contained, closes with Escape and restores its trigger', async () => {
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Help & Shortcuts"]')!
  trigger.focus(); await act(async () => trigger.click())
  const dialog = host.querySelector('[role="dialog"]')!
  expect(dialog.contains(document.activeElement)).toBe(true)
  const buttons = dialog.querySelectorAll('button')
  buttons[buttons.length - 1].focus()
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  expect(document.activeElement).toBe(buttons[0])
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('navigates workspace tabs with arrows, Home and End', async () => {
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  tabs[0].focus()
  for (const [key, index] of [['ArrowRight', 1], ['End', 4], ['Home', 0], ['ArrowLeft', 4]] as const) {
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(tabs[index])
    expect(tabs[index].getAttribute('aria-selected')).toBe('true')
    expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[index]])
    expect(host.querySelector(`[aria-labelledby="${tabs[index].id}"]`)).not.toBeNull()
  }
})

it('leaves text Undo to editors and keeps project Undo available outside them', async () => {
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  const input = host.querySelector<HTMLInputElement>('[aria-label="Project title"]')!
  input.focus()
  const textUndo = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
  await act(async () => input.dispatchEvent(textUndo))
  expect(textUndo.defaultPrevented).toBe(false)
  const projectUndo = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
  await act(async () => host.querySelector('[role="tab"]')!.dispatchEvent(projectUndo))
  expect(projectUndo.defaultPrevented).toBe(true)
})

it('reveals and focuses newly inserted notebook notes', async () => {
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Notebook"]')!.click())
  const add = [...host.querySelectorAll<HTMLButtonElement>('.notebook-toolbar button')].find(button => button.textContent?.includes('Add note'))!
  await act(async () => add.click())
  expect(document.activeElement).toBe(host.querySelector('[aria-label="Note 1"]'))
  expect(host.querySelectorAll('.notebook-toolbar > button')).toHaveLength(3)
  expect(host.querySelector('[aria-label="More notebook cells"]')).not.toBeNull()
})

it('reports a failed autosave in the persistent status region', async () => {
  vi.useFakeTimers()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
  document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<App />))
  await act(async () => vi.advanceTimersByTime(300))
  const status = host.querySelector('.save-status-bar')!
  expect(status.textContent).toContain('Could not save locally. Export a project copy.')
  expect(status.getAttribute('role')).toBe('status')
  expect(status.classList.contains('save-failed')).toBe(true)
  vi.useRealTimers()
})
