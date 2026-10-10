import type { Project } from './project'
import { compileWorkspace } from './workspace'
import { compileGraph } from './math'
import { evaluateSpreadsheet, spreadsheetColumns, spreadsheetSheets } from './spreadsheet'
import { defaultNotebookGraphBounds, replaceNotebookVariables } from './notebook'
import { notebookGraphPaths, notebookInequalityRegion } from './notebookGraph'
import { runMathTool } from './mathTools'

export type DocumentFormat = 'html' | 'markdown' | 'pdf'
export function escapeHtml(text:string) { return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!)) }
export function notebookDocument(project:Project, includeAnswers=false): {html:string;markdown:string} {
  const parameters=Object.fromEntries(project.parameters.map(p=>[p.name,p.value]))
  const compiled=compileWorkspace(project.expressions,project.parameterA,{},parameters)
  const definitions={...parameters,...Object.fromEntries(compiled.flatMap(row=>row.definition?[[row.definition.name,row.definition.value]]:[]))}
  const values: Record<string,number>={...parameters,...definitions,a:project.parameterA}
  const sheet=evaluateSpreadsheet(project.spreadsheet,definitions,project.parameterA)
  const graphValues={...values,...Object.fromEntries(Object.entries(sheet).flatMap(([id,value])=>value.value===null?[]:[[id,value.value]]))}
  const html:string[]=[]; const markdown:string[]=[`# ${escapeHtml(project.title.replace(/[\r\n]/g,' '))}\n`]
  function text(value:string) {html.push(`<p>${escapeHtml(value).replace(/\n/g,'<br>')}</p>`);markdown.push(escapeHtml(value)+'\n')}
  for(const cell of project.notebook) {
    html.push('<section>')
    if(cell.kind==='text')text(replaceNotebookVariables(cell.content,values))
    else if(cell.kind==='answer') {
      text(cell.prompt);text(`Response: ${cell.response || '________________________'}`)
      if(includeAnswers)text(`Expected expression: ${cell.expected}`)
    } else if(cell.kind==='calculation') {
      text(`${cell.operation}: ${cell.expression}`)
      try { const result=runMathTool(cell.operation,cell.expression,{definitions,a:project.parameterA});text(`${result.value}\n${result.note}`) }
      catch {text('This calculation could not be evaluated for the exported values.')}
    } else if(cell.kind==='graph') {
      const row=project.expressions.find(r=>r.id===cell.expressionId)
      if(!row)text('Linked graph is missing.')
      else {
        text(`Graph: ${row.text}`)
        try {
          const graph=compileGraph(row.text,graphValues); const bounds=cell.bounds??defaultNotebookGraphBounds
          const paths=notebookGraphPaths(graph,bounds,project.parameterA)
          const shade=notebookInequalityRegion(graph,bounds,project.parameterA)
          html.push(`<svg role="img" aria-label="${escapeHtml(row.text)}" viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="280" fill="white"/><path d="${shade}" fill="#5276a5" opacity=".15"/>${paths.map(d=>`<path d="${d}" fill="none" stroke="#254f83" stroke-width="2"${graph.kind==='inequality' && (graph.relation==='<' || graph.relation==='>')?' stroke-dasharray="6 4"':''}/>`).join('')}</svg>`)
          text(`Preview window: x ${bounds.minX} to ${bounds.maxX}; y ${bounds.minY} to ${bounds.maxY}. Sampled preview; small features may be missed.`)
        } catch {text('View this 3D or unsupported graph in the accompanying Contour project.')}
      }
    } else if(cell.kind==='table') {
      const linked=spreadsheetSheets(project.spreadsheet).find(s=>s.id===cell.sheetId)
      if(!linked)text('Linked table is missing.')
      else {
        text(`Table: ${linked.name}`)
        const evaluated=evaluateSpreadsheet(project.spreadsheet,definitions,project.parameterA,linked.id)
        const rows=Array.from({length:cell.rows??6},(_,i)=>spreadsheetColumns.map(col=>{
          const value=evaluated[`${col}${i+1}`];return value?.error??String(value?.value??value?.raw??'')
        }))
        html.push(`<table><thead><tr>${spreadsheetColumns.map(col=>`<th>${col}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
        markdown.push(`| ${spreadsheetColumns.join(' | ')} |\n| ${spreadsheetColumns.map(()=>'---').join(' | ')} |\n${rows.map(row=>`| ${row.map(v=>escapeHtml(v).replace(/\|/g,'\\|').replace(/\n/g,' ')).join(' | ')} |`).join('\n')}\n`)
      }
    } else if(cell.kind==='input')text(`${cell.label || 'Parameter'}: ${cell.parameterName} = ${values[cell.parameterName]??'missing parameter'}`)
    else if(cell.kind==='visibility')text(`${cell.label}: ${project.expressions.find(row=>row.id===cell.expressionId)?.visible?'shown':'hidden'} (interactive control in the project)`)
    else if(cell.kind==='action')text(`${cell.label || 'Action button'} (interactive control in the project)`)
    else if(cell.kind==='sequence')text(`${cell.label || 'Action sequence'}: ${cell.steps.length} steps (interactive control in the project)`)
    html.push('</section>')
  }
  const footer='Static worksheet exported from Contour. Live controls remain in the project file; mathematical checks are not automatically run. Inline LaTeX is retained as source notation.'
  text(footer)
  return { markdown:markdown.join('\n'),html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#202a34;max-width:900px;margin:40px auto;padding:0 24px}h1{line-height:1.2}p{overflow-wrap:anywhere}section{margin:0 0 24px}svg{width:100%;height:auto;border:1px solid #bec7cf}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bec7cf;padding:5px;overflow-wrap:anywhere;max-width:100px}@media print{body{margin:0;max-width:none}svg,table{break-inside:avoid}h1{break-after:avoid}}</style></head><body><h1>${escapeHtml(project.title)}</h1>${html.join('')}</body></html>` }
}
