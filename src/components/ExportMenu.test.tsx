import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ExportMenu } from './ExportMenu'
import { starterProject } from '../lib/project'

it('does not download an unpainted graph canvas',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  const host=document.createElement('div');const root=createRoot(host)
  const canvasRef=createRef<HTMLCanvasElement>();canvasRef.current=document.createElement('canvas')
  const encode=vi.spyOn(canvasRef.current,'toBlob')
  await act(async()=>root.render(<ExportMenu project={starterProject()} view="2d" canvasRef={canvasRef} onMessage={vi.fn()}/>))
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Export graph')!
  await act(async()=>button.click())
  expect(host.textContent).toContain('still being drawn')
  expect(encode).not.toHaveBeenCalled()
  act(()=>root.unmount());vi.restoreAllMocks()
})
