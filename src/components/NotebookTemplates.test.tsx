import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { NotebookView } from './NotebookView'
import { activityTemplates } from '../lib/activities'
import { starterProject } from '../lib/project'

vi.mock('./EquationField',()=>({EquationField:()=>null}))

describe('unified activity template picker',()=>{
  it('lists every template in one labelled dropdown and inserts the chosen activity',()=>{
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
    const host=document.createElement('div');const root=createRoot(host);const project=starterProject();const onAddActivity=vi.fn()
    const callbacks={onChange:vi.fn(),onToggleExpression:vi.fn(),onParameterValueChange:vi.fn(),onSetParameter:vi.fn(),onExpressionChange:vi.fn(),onCreateExpression:vi.fn(),onSpreadsheetCellChange:vi.fn(),onRunSequence:vi.fn(),onAddActivity}
    act(()=>root.render(<NotebookView cells={[]} expressions={[]} definitions={{}} parameterA={1} parameterARange={project.parameterARange} parameters={[]} spreadsheet={project.spreadsheet} {...callbacks}/>))
    const picker=host.querySelector<HTMLSelectElement>('select[aria-label="Activity templates"]')!
    expect(picker.options.length).toBe(activityTemplates.length+1)
    expect([...picker.options].slice(1).map(o=>o.text)).toEqual(activityTemplates.map(t=>t.label))
    expect(host.querySelectorAll('.notebook-templates button')).toHaveLength(0)
    act(()=>{picker.value='limits';picker.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(onAddActivity).toHaveBeenCalledWith('limits')
    act(()=>root.unmount())
  })
})
