import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MathWorkspace, mathTasks } from './MathWorkspace'

vi.mock('./EquationField', () => ({ EquationField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Expression" value={value} onChange={event => onChange(event.target.value)} /> }))
vi.mock('./MathResult', () => ({ MathResult: ({ value }: { value: string }) => <span>{value}</span> }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement('div')
let root: ReturnType<typeof createRoot>
afterEach(() => { act(() => root?.unmount()); host.remove(); vi.restoreAllMocks() })

function render(active = true) {
  act(() => root.render(<MathWorkspace active={active} parameterA={1} definitions={{}} />))
}
function task(label: string) {
  const picker = host.querySelector<HTMLSelectElement>('.math-task-picker select')!
  act(() => { picker.value = String(mathTasks.findIndex(item => item.label === label)); picker.dispatchEvent(new Event('change', { bubbles: true })) })
}
function type(value: string) {
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('retains independent task drafts across task and workspace navigation', () => {
  document.body.append(host); root = createRoot(host); render()
  task('Factor'); type('x^6 - 1')
  task('Expand'); type('(x+3)^5')
  task('Factor'); expect(host.querySelector('textarea')!.value).toBe('x^6 - 1')
  render(false); expect(host.textContent).toBe('')
  render(); expect(host.querySelector('textarea')!.value).toBe('x^6 - 1')
  task('Expand'); expect(host.querySelector('textarea')!.value).toBe('(x+3)^5')
})

it('cancels an active symbolic worker when leaving while preserving its input', () => {
  const terminate = vi.fn()
  vi.stubGlobal('Worker', class { postMessage = vi.fn(); terminate = terminate })
  document.body.append(host); root = createRoot(host); render()
  task('Factor'); type('x^8 - 1')
  act(() => host.querySelector<HTMLButtonElement>('.math-tool-run')!.click())
  expect(host.textContent).toContain('Stop calculation')
  render(false)
  expect(terminate).toHaveBeenCalled()
  render()
  expect(host.querySelector('textarea')!.value).toBe('x^8 - 1')
  expect(host.textContent).toContain('Calculate exact result')
  vi.unstubAllGlobals()
})

it('carries the expression into another result type without overwriting a previous draft', () => {
  document.body.append(host); root = createRoot(host); render()
  task('Solve equation'); type('x^2-9=0')
  function variant(index: number) {
    const picker = host.querySelectorAll<HTMLSelectElement>('.math-task-picker select')[1]
    act(() => { picker.value = String(index); picker.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  variant(1)
  expect(host.querySelector<HTMLInputElement>('[aria-label="Expression"]')!.value).toBe('x^2-9=0')
  variant(0); type('x^2-16=0'); variant(1)
  expect(host.querySelector<HTMLInputElement>('[aria-label="Expression"]')!.value).toBe('x^2-9=0')
})

it('restores matrix inputs after switching operations and views', () => {
  document.body.append(host); root = createRoot(host); render()
  task('Matrix arithmetic & linear systems'); type('9, 8; 7, 6 | 1, 2; 3, 4')
  function operation(value: string) {
    const picker = host.querySelector<HTMLSelectElement>('.math-tool-options select')!
    act(() => { picker.value = value; picker.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  operation('inverse'); type('2, 0; 0, 2')
  render(false); render(); operation('add')
  expect(host.querySelector('textarea')!.value).toBe('9, 8; 7, 6 | 1, 2; 3, 4')
  operation('inverse'); expect(host.querySelector('textarea')!.value).toBe('2, 0; 0, 2')
})
