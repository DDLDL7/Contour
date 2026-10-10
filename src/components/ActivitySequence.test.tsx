import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ActivitySequence } from './ActivitySequence'
import type { NotebookCell } from '../lib/notebook'

it('permits empty numeric drafts, blocks incomplete execution and commits negative values',()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  const host=document.createElement('div');const root=createRoot(host);const onRun=vi.fn()
  function Editor(){
    const [cell,setCell]=useState<Extract<NotebookCell,{kind:'sequence'}>>({id:'sequence',kind:'sequence',label:'Run steps',steps:[{action:'set-parameter',parameterName:'a',value:1}]})
    return <ActivitySequence cell={cell} expressions={[]} parameters={[{name:'a',value:1,min:-5,max:5,step:1}]} onChange={change=>setCell(old=>({...old,...change}))} onRun={onRun}/>
  }
  act(()=>root.render(<Editor/>))
  const input=host.querySelector<HTMLInputElement>('input[type="number"]')!
  const run=[...host.querySelectorAll('button')].find(b=>b.textContent==='Run steps')!
  function edit(value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
  edit('');expect(input.value).toBe('')
  act(()=>run.click());expect(onRun).not.toHaveBeenCalled();expect(host.textContent).toContain('finite value')
  edit('0.20');expect(input.value).toBe('0.20')
  edit('0.201');expect(input.value).toBe('0.201')
  act(()=>run.click());expect(onRun).toHaveBeenCalledWith([{action:'set-parameter',parameterName:'a',value:0.201}])
  edit('-2.5');act(()=>run.click())
  expect(onRun).toHaveBeenCalledWith([{action:'set-parameter',parameterName:'a',value:-2.5}])
  act(()=>root.unmount())
})
