import { afterEach, describe, expect, it, vi } from 'vitest'
import { graphImage } from './export'
afterEach(()=>vi.restoreAllMocks())
describe('graph export encodings',()=>{
  it('flattens transparent pixels onto white for JPEG and requests its MIME type',async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=280
    const fillRect=vi.fn();const drawImage=vi.fn();const context={fillStyle:'',fillRect,drawImage}
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback,mime){callback(new Blob(['encoded'],{type:mime}))})
    expect((await graphImage(canvas,'jpeg')).type).toBe('image/jpeg')
    expect(context.fillStyle).toBe('#ffffff');expect(fillRect).toHaveBeenCalledWith(0,0,640,280)
    expect(drawImage).toHaveBeenCalledWith(canvas,0,0)
  })
  it('reports unsupported encodings instead of naming a PNG file as WebP',async()=>{
    const canvas=document.createElement('canvas')
    vi.spyOn(canvas,'toBlob').mockImplementation(callback=>callback(new Blob(['png'],{type:'image/png'})))
    await expect(graphImage(canvas,'webp')).rejects.toThrow('unavailable')
  })
  it('wraps the actual image dimensions in an SVG snapshot',async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=280
    vi.spyOn(canvas,'toDataURL').mockReturnValue('data:image/png;base64,cGl4ZWxz')
    const blob=await graphImage(canvas,'svg')
    expect(blob.type).toBe('image/svg+xml')
    const content=await new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob)})
    expect(content).toContain('viewBox="0 0 640 280"');expect(content).toContain('href="data:image/png;base64,')
  })
})
