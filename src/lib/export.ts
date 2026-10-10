export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'svg'
export const imageFormats: { id:ImageFormat; label:string; extension:string }[] = [
  {id:'png',label:'PNG',extension:'png'}, {id:'jpeg',label:'JPEG',extension:'jpg'},
  {id:'webp',label:'WebP',extension:'webp'}, {id:'svg',label:'SVG snapshot',extension:'svg'},
]
export function fileName(title:string):string {
  return title.replace(/[^\p{L}\p{N}._ -]/gu,'').trim().slice(0,80) || 'contour'
}
export function downloadBlob(blob:Blob, name:string) {
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a'); anchor.download=name;anchor.href=url;anchor.click()
  setTimeout(()=>URL.revokeObjectURL(url),30_000)
}
export async function graphImage(canvas:HTMLCanvasElement,format:ImageFormat):Promise<Blob> {
  if (!canvas.width || !canvas.height) throw new Error('The graph is not ready to export.')
  if (format==='svg') {
    const png=canvas.toDataURL('image/png')
    return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><title>Contour graph snapshot</title><image width="100%" height="100%" href="${png}"/></svg>`],{type:'image/svg+xml'})
  }
  let source=canvas
  if (format==='jpeg') {
    source=document.createElement('canvas');source.width=canvas.width;source.height=canvas.height
    const context=source.getContext('2d');if(!context)throw new Error('Image export is unavailable on this device.')
    context.fillStyle='#ffffff';context.fillRect(0,0,source.width,source.height);context.drawImage(canvas,0,0)
  }
  const mime=`image/${format}`
  const blob=await new Promise<Blob|null>(resolve=>source.toBlob(resolve,mime,.95))
  if (!blob || blob.type!==mime) throw new Error(`${format.toUpperCase()} export is unavailable in this browser. Choose PNG or JPEG.`)
  return blob
}
