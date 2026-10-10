import { act, createRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Graph2D } from './Graph2D'
import type { GeometryObject } from '../lib/geometry'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>; let objects: GeometryObject[]
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); objects = []
  function Harness() { const [geometry, setGeometry] = useState<GeometryObject[]>([]); return <Graph2D graphs={[]} geometry={geometry} onGeometryChange={next => { objects = next; setGeometry(next) }} parameterA={1} canvasRef={createRef()} darkMode linkedValues={{}} /> }
  await act(async () => root.render(<Harness />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function key(key: string, shiftKey = false) { await act(async () => host.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))) }
it('constructs points and a line with the keyboard cursor', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="line"]')!.click())
  await key('Enter'); await key('ArrowRight'); await key('Enter')
  expect(objects.filter(item => item.kind === 'point')).toHaveLength(2)
  expect(objects.filter(item => item.kind === 'line')).toHaveLength(1)
  expect(objects[0]).toMatchObject({ x: 0, y: 0 })
  expect(objects[1]).toMatchObject({ x: 20 / 52, y: 0 })
})
it('cancels a pending construction without creating objects', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="line"]')!.click())
  await key('Enter'); await key('Escape')
  expect(objects).toEqual([])
  expect(host.querySelector('[aria-label="Cancel construction"]')).toBeNull()
  expect(host.textContent).toContain('Construction and selection cleared')
})
it('pans and resets the keyboard cursor before placing a point', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="point"]')!.click())
  await key('ArrowRight', true); await key('Home'); await key('Enter')
  expect(objects[0]).toMatchObject({ kind: 'point', x: 0, y: 0 })
})
