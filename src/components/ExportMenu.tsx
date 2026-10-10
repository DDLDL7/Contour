import { useEffect, useRef, useState, type RefObject } from 'react'
import { Download } from 'lucide-react'
import type { Project } from '../lib/project'
import { downloadBlob, fileName, graphImage, imageFormats, type ImageFormat } from '../lib/export'
import { notebookDocument, type DocumentFormat } from '../lib/notebookExport'

export function ExportMenu({project,view,canvasRef,onMessage}:{project:Project;view:string;canvasRef:RefObject<HTMLCanvasElement|null>;onMessage:(message:string)=>void}) {
  const menu=useRef<HTMLDetailsElement>(null)
  const [imageFormat,setImageFormat]=useState<ImageFormat>('png')
  const [documentFormat,setDocumentFormat]=useState<DocumentFormat>('html')
  const [includeAnswers,setIncludeAnswers]=useState(false)
  useEffect(()=>{
    const close=(event:KeyboardEvent|PointerEvent)=>{
      if(!menu.current?.open)return
      if(event.type==='keydown' && (event as KeyboardEvent).key==='Escape'){menu.current.open=false;menu.current.querySelector('summary')?.focus()}
      else if(event.type==='pointerdown' && !menu.current.contains(event.target as Node))menu.current.open=false
    }
    document.addEventListener('keydown',close);document.addEventListener('pointerdown',close)
    return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close)}
  },[])
  const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  async function image() {
    setBusy(true);setError('')
    try {
      if(!canvasRef.current)throw new Error('Open a graph workspace before exporting an image.')
      if(canvasRef.current.dataset.contourReady!=='true')throw new Error('The graph is still being drawn. Wait a moment, then try exporting again.')
      const blob=await graphImage(canvasRef.current,imageFormat)
      downloadBlob(blob,`${fileName(project.title)}-${view}.${imageFormats.find(f=>f.id===imageFormat)!.extension}`)
      onMessage(`${imageFormat.toUpperCase()} graph image downloaded.`);if(menu.current)menu.current.open=false
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not export the graph.')}
    finally{setBusy(false)}
  }
  function documentExport() {
    setError('')
    try {
      const result=notebookDocument(project,includeAnswers)
      if(documentFormat==='pdf') {
        const popup=window.open('','_blank')
        if(!popup)throw new Error('Print / PDF is unavailable here. Export HTML and open it in a browser to print, or allow the export window and try again.')
        popup.opener=null;popup.document.open();popup.document.write(result.html);popup.document.close()
        popup.focus();popup.print()
        onMessage('Use the print dialog to print or save the worksheet as PDF.')
      } else {
        downloadBlob(new Blob([documentFormat==='html'?result.html:result.markdown],{type:documentFormat==='html'?'text/html;charset=utf-8':'text/markdown;charset=utf-8'}),`${fileName(project.title)}-activity.${documentFormat==='html'?'html':'md'}`)
        onMessage('Notebook document downloaded.')
      }
      if(menu.current)menu.current.open=false
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not export the notebook.')}
  }
  return <details ref={menu} className="export-menu" onToggle={()=>setError('')}><summary className="header-button" aria-label="Export"><Download size={17}/><span>Export</span></summary><div className="export-options">
    {(view==='2d'||view==='3d')&&<fieldset><legend>Graph image</legend><label>Image format<select value={imageFormat} disabled={busy} onChange={event=>setImageFormat(event.target.value as ImageFormat)}>{imageFormats.map(format=><option key={format.id} value={format.id}>{format.label}</option>)}</select></label><button type="button" disabled={busy} onClick={image}>{busy?'Preparing image…':'Export graph'}</button></fieldset>}
    <fieldset><legend>Notebook document</legend><label>Document format<select value={documentFormat} onChange={event=>setDocumentFormat(event.target.value as DocumentFormat)}><option value="html">HTML worksheet</option><option value="markdown">Markdown</option><option value="pdf">Print / PDF</option></select></label><label className="export-answer-option"><input type="checkbox" checked={includeAnswers} onChange={event=>setIncludeAnswers(event.target.checked)}/> Include expected answers</label><button type="button" disabled={!project.notebook.length} onClick={documentExport}>Export notebook</button>{!project.notebook.length&&<p>Add notebook cells to export an activity.</p>}</fieldset>
    {error&&<p className="notebook-error" role="alert">{error}</p>}
  </div></details>
}
