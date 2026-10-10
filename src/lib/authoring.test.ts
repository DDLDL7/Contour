import { describe, expect, it } from 'vitest'
import { activityTemplates, appendActivity, runActivitySteps } from './activities'
import { notebookDocument } from './notebookExport'
import { starterProject, parseProjectFile } from './project'
import { areActivitySteps } from './notebook'
import { compileWorkspace } from './workspace'
import { fileName } from './export'

describe('guided activity authoring',()=>{
  it.each(activityTemplates)('appends and reopens $label with working linked equations',template=>{
    const original=starterProject();original.notebook=[{id:'original',kind:'text',content:'Keep this'}]
    const next=appendActivity(original,template.id)
    expect(next.notebook.length).toBe(template.cells+1)
    expect(next.notebook[0]).toBe(original.notebook[0])
    expect(compileWorkspace(next.expressions,next.parameterA).every(row=>!row.error)).toBe(true)
    expect(parseProjectFile(JSON.stringify(next)).notebook).toEqual(next.notebook)
    expect(original.expressions).toHaveLength(0)
  })
  it('runs a sequence atomically in order and rejects invalid targets or values',()=>{
    const original=appendActivity(starterProject(),'parameter')
    const id=original.expressions[0].id
    const next=runActivitySteps(original,[{action:'set-parameter',parameterName:'a',value:2},{action:'set-visibility',expressionId:id,visible:false},{action:'set-parameter',parameterName:'a',value:-1}])
    expect(next.parameterA).toBe(-1);expect(next.expressions[0].visible).toBe(false)
    expect(original.parameterA).toBe(1);expect(original.expressions[0].visible).toBe(true)
    expect(()=>runActivitySteps(original,[{action:'set-parameter',parameterName:'a',value:2},{action:'set-visibility',expressionId:'missing',visible:false}])).toThrow('missing')
    expect(original.parameterA).toBe(1)
    expect(()=>runActivitySteps(original,[{action:'set-parameter',parameterName:'a',value:100}])).toThrow('between')
    expect(areActivitySteps([{action:'eval',code:'alert(1)'}])).toBe(false)
    expect(areActivitySteps(Array(21).fill({action:'set-parameter',parameterName:'a',value:1}))).toBe(false)
  })
  it('round-trips editable action sequences without executing imported steps',()=>{
    const project=starterProject()
    project.notebook=[{id:'sequence',kind:'sequence',label:'Reset',steps:[{action:'set-parameter',parameterName:'a',value:2}]}]
    const reopened=parseProjectFile(JSON.stringify(project))
    expect(reopened.notebook).toEqual(project.notebook);expect(reopened.parameterA).toBe(1)
  })
})
describe('worksheet export',()=>{
  it('escapes imported content and excludes expected answers by default',()=>{
    const project=appendActivity(starterProject(),'limits')
    project.title='<script>alert(1)</script>'
    project.notebook.unshift({id:'unsafe',kind:'text',content:'<img src=x onerror=alert(1)> {{a}}'})
    const output=notebookDocument(project)
    expect(output.html).not.toContain('<script>');expect(output.html).not.toContain('<img src=x')
    expect(output.html).toContain('&lt;img');expect(output.html).toContain('<svg')
    expect(output.html).not.toContain('Expected expression:')
    expect(notebookDocument(project,true).html).toContain('Expected expression: 1')
    expect(output.markdown).toContain('sin(x)/x')
    expect(fileName('../../a:/b?')).toBe('....ab')
  })
  it('exports current parameters, calculations and selected sheet rows',()=>{
    const project=appendActivity(starterProject(),'data')
    project.parameterA=3
    project.parameters=[{name:'b',value:2,min:-5,max:5,step:1}]
    project.notebook.push({id:'calc',kind:'calculation',operation:'calculate',expression:'a+b'})
    const output=notebookDocument(project)
    expect(output.html).toContain('<table>');expect(output.html).toContain('<td>7</td>')
    expect(output.html).toContain('<p>5<br>');expect(output.markdown).toContain('| 2 | 7 |')
    const tableCell=project.notebook.find(cell=>cell.kind==='table')!
    if(tableCell.kind==='table')project.spreadsheet.sheets!.find(sheet=>sheet.id===tableCell.sheetId)!.cells.C1='<img src=x onerror=alert(1)>'
    expect(notebookDocument(project).markdown).not.toContain('<img src=x')
  })
})
