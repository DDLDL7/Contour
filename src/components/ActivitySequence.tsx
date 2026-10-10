import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ActivityStep, NotebookCell } from '../lib/notebook'
import type { ExpressionRow } from '../lib/project'
import type { SliderParameter } from '../lib/parameters'

export function ActivitySequence({cell,expressions,parameters,onChange,onRun}:{cell:Extract<NotebookCell,{kind:'sequence'}>;expressions:ExpressionRow[];parameters:SliderParameter[];onChange:(change:Partial<typeof cell>)=>void;onRun:(steps:ActivityStep[])=>void}) {
  const [draftValues,setDraftValues]=useState<Record<number,string>>({})
  const previousSteps=useRef(cell.steps)
  useEffect(()=>{
    const previous=previousSteps.current;previousSteps.current=cell.steps
    setDraftValues(drafts=>Object.fromEntries(Object.entries(drafts).filter(([key])=>JSON.stringify(previous[Number(key)])===JSON.stringify(cell.steps[Number(key)]))))
  },[cell.steps])
  const [status,setStatus]=useState(''); const [signature,setSignature]=useState('')
  const current=JSON.stringify(cell)
  function update(index:number,step:ActivityStep){onChange({steps:cell.steps.map((old,i)=>i===index?step:old)})}
  function move(index:number,direction:number){const steps=[...cell.steps];[steps[index],steps[index+direction]]=[steps[index+direction],steps[index]];onChange({steps})}
  return <div className="activity-sequence"><label>Button label<input maxLength={120} value={cell.label} onChange={event=>onChange({label:event.target.value})}/></label>
    <ol>{cell.steps.map((step,index)=><li key={index}><div className="sequence-step-fields"><label>Action<select value={step.action} onChange={event=>update(index,event.target.value==='set-parameter'?{action:'set-parameter',parameterName:'a',value:parameters[0]?.value??1}:{action:'set-visibility',expressionId:expressions[0]?.id??'',visible:true})}><option value="set-parameter">Set parameter</option><option value="set-visibility">Show or hide graph</option></select></label>
      {step.action==='set-parameter'?<><label>Parameter<select value={step.parameterName} onChange={event=>update(index,{...step,parameterName:event.target.value})}>{parameters.map(p=><option key={p.name}>{p.name}</option>)}{!parameters.some(p=>p.name===step.parameterName)&&<option value={step.parameterName}>Missing {step.parameterName}</option>}</select></label><label>Value<input type="number" step="any" value={draftValues[index]??String(step.value)} onChange={event=>setDraftValues(current=>({...current,[index]:event.target.value}))} onBlur={event=>{const value=event.target.value;if(value.trim()&&Number.isFinite(Number(value)))update(index,{...step,value:Number(value)})}}/></label></>:<><label>Graph<select value={step.expressionId} onChange={event=>update(index,{...step,expressionId:event.target.value})}><option value="">Choose an expression</option>{expressions.map((row,i)=><option key={row.id} value={row.id}>{i+1}. {row.text || 'Empty expression'}</option>)}</select></label><label>Visibility<select value={String(step.visible)} onChange={event=>update(index,{...step,visible:event.target.value==='true'})}><option value="true">Show</option><option value="false">Hide</option></select></label></>}
      <div className="sequence-step-buttons"><button type="button" aria-label={`Move step ${index+1} up`} disabled={!index} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button type="button" aria-label={`Move step ${index+1} down`} disabled={index===cell.steps.length-1} onClick={()=>move(index,1)}><ArrowDown size={16}/></button><button type="button" aria-label={`Remove step ${index+1}`} disabled={cell.steps.length===1} onClick={()=>onChange({steps:cell.steps.filter((_,i)=>i!==index)})}><Trash2 size={16}/></button></div></div></li>)}</ol>
    <div className="sequence-actions"><button type="button" disabled={cell.steps.length>=20} onClick={()=>onChange({steps:[...cell.steps,{action:'set-parameter',parameterName:'a',value:parameters[0]?.value??1}]})}><Plus size={16}/> Add step</button><button type="button" className="notebook-action-button" onClick={()=>{
      try {
        const steps=cell.steps.map((step,index)=>{
          if(step.action!=='set-parameter')return step
          const draft=draftValues[index]??String(step.value)
          if(!draft.trim() || !Number.isFinite(Number(draft)))throw new Error('Enter a finite value for every parameter step before running the sequence.')
          return {...step,value:Number(draft)}
        })
        onRun(steps)
        setStatus('Sequence applied. Use Undo to restore the previous workspace.')
        setSignature(JSON.stringify({...cell,steps}))
      } catch(cause) {setStatus(cause instanceof Error?cause.message:'Could not run this sequence.');setSignature(current)}
    }}>{cell.label || 'Run sequence'}</button></div>
    <p className="notebook-hint">Steps run in order as one undoable edit when you press the button. Opening a project never runs them.</p>{signature===current&&status&&<p role="status">{status}</p>}
  </div>
}
