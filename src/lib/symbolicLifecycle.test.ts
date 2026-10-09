import { afterEach, describe, expect, it, vi } from 'vitest'
import { SymbolicEngine, symbolicRequest, type SymbolicOptions } from './symbolic'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { FakeWorker.instances.push(this) }
}
const options: SymbolicOptions = { variable:'x',domain:'real',assumption:'none',start:'0',end:'1',direction:'both',order:6,initialY:'1',definitions:{} }
const request = symbolicRequest('exact','1/2',options)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeWorker.instances=[] })
describe('symbolic worker lifetime', () => {
  it('cancels previous work and ignores its queued result', async () => {
    vi.stubGlobal('Worker',FakeWorker)
    const engine=new SymbolicEngine()
    const first=engine.run(request,vi.fn())
    const rejected=expect(first).rejects.toThrow('stopped')
    const second=engine.run(request,vi.fn())
    await rejected
    const [oldWorker,newWorker]=FakeWorker.instances
    oldWorker.onmessage?.({data:{result:{value:'wrong'}}})
    expect(oldWorker.terminate).toHaveBeenCalledOnce()
    expect(newWorker.terminate).not.toHaveBeenCalled()
    newWorker.onmessage?.({data:{result:{title:'Exact',value:'1/2',note:''}}})
    expect((await second).value).toBe('1/2')
    expect(newWorker.terminate).toHaveBeenCalledOnce()
  })
  it('terminates work at the timeout and permits a fresh calculation', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker',FakeWorker)
    const engine=new SymbolicEngine()
    const expired=engine.run(request,vi.fn())
    const rejected=expect(expired).rejects.toThrow('90 seconds')
    await vi.advanceTimersByTimeAsync(90000)
    await rejected
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce()
    const fresh=engine.run(request,vi.fn())
    const stopped=expect(fresh).rejects.toThrow('stopped')
    engine.cancel(); await stopped
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce()
  })
})
