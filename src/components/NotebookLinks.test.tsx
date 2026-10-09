import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotebookGraphCell, NotebookTableCell } from './NotebookLinks'

vi.mock('./EquationField', () => ({ EquationField: ({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) => <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /> }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function render(node: ReactNode) { act(() => root.render(node)) }
function edit(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('linked notebook editing', () => {
  const graphProps = () => ({
    cell: { id: 'cell', kind: 'graph' as const, expressionId: 'curve' },
    expressions: [{ id: 'curve', text: 'y=x', color: '#4589ff', visible: true }],
    definitions: {}, parameterA: 1, onLink: vi.fn(), onBounds: vi.fn(), onExpressionChange: vi.fn(), onCreateExpression: vi.fn(), onToggleExpression: vi.fn(),
  })

  it('writes equation edits through the linked ID and rejects invalid windows', () => {
    const props = graphProps(); render(<NotebookGraphCell {...props} />)
    edit(host.querySelector<HTMLInputElement>('[aria-label="Linked graph equation"]')!, 'y=x^2')
    expect(props.onExpressionChange).toHaveBeenCalledWith('curve', 'y=x^2', undefined)
    const inputs = host.querySelectorAll<HTMLInputElement>('.notebook-bounds input')
    edit(inputs[0], '9')
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(props.onBounds).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('increasing bounds')
    edit(inputs[0], '-2')
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(props.onBounds).toHaveBeenCalledWith({ minX: -2, maxX: 8, minY: -5, maxY: 5 })
  })

  it('shows missing links and unsupported expressions without displaying a misleading empty graph', () => {
    const props = graphProps()
    render(<NotebookGraphCell {...props} expressions={[]} />)
    expect(host.textContent).toContain('linked expression was removed')
    expect(host.querySelector('svg')).toBeNull()
    render(<NotebookGraphCell {...props} expressions={[{ ...props.expressions[0], text: 'z=x+y' }]} />)
    expect(host.textContent).toContain('Show 3D preview')
    expect(host.querySelector('canvas')).toBeNull()
    expect(host.querySelector('svg')).toBeNull()
  })

  it('edits the selected sheet with raw formulas and displays evaluated values and formula errors', () => {
    const onCellChange = vi.fn()
    const props: ComponentProps<typeof NotebookTableCell> = { cell: { id: 'table', kind: 'table', sheetId: 'second', rows: 2 },
      spreadsheet: { cells: {}, sheets: [{ id: 'first', name: 'First', cells: {} }, { id: 'second', name: 'Second', cells: { A2: '3', B2: '=a*A2', C2: '=unknown' } }] },
      definitions: {}, parameterA: 2, onLink: vi.fn(), onRows: vi.fn(), onCellChange }
    render(<NotebookTableCell {...props} />)
    expect(host.textContent).toContain('6')
    expect(host.textContent).toContain('Unknown symbol')
    act(() => host.querySelector<HTMLInputElement>('[type="checkbox"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[aria-label="Second B2"]')!
    expect(input.value).toBe('=a*A2')
    edit(input, '=a*A2+1')
    expect(onCellChange).toHaveBeenCalledWith('second', 'B2', '=a*A2+1')
    render(<NotebookTableCell {...props} cell={{ ...props.cell, sheetId: 'missing' }} />)
    expect(host.textContent).toContain('linked spreadsheet was removed')
    expect(host.querySelector('table')).toBeNull()
  })
})
