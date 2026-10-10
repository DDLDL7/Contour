// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

// Model Cache API's Vary matching: a worker module request can include Origin,
// while the installation fetch that cached the same public file omitted it.
async function workerFixture(corrupt=false) {
  const origin='https://contour.test/'
  const bytes=new TextEncoder().encode('export const runtime = true')
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex')
  const responses: Record<string,string>={
    '': '<script src="assets/app.js"></script>',
    'assets/app.js':'/* app */',
    'user-data.json':'{}',
    'offline-assets.json':'["assets/app.js"]',
    'math-runtime/manifest.json':JSON.stringify([{file:'pyodide.mjs',bytes:bytes.length,sha256:corrupt?'0'.repeat(64):hash}]),
    'math-runtime/pyodide.mjs':new TextDecoder().decode(bytes),
  }
  let offline=false
  const entries=new Map<string,{request:Request;response:Response}>()
  const request=(value:string|URL|Request)=>value instanceof Request?value:new Request(value)
  const match=async(value:string|URL|Request,options?:{ignoreVary?:boolean})=>{
    const incoming=request(value);const entry=entries.get(incoming.url)
    if(!entry)return undefined
    if(!options?.ignoreVary && entry.response.headers.get('Vary')==='Origin' && incoming.headers.get('Origin')!==entry.request.headers.get('Origin'))return undefined
    return entry.response.clone()
  }
  const fetch=async(value:string|URL|Request)=>{
    if(offline)throw new Error('Network disconnected')
    const path=request(value).url.slice(origin.length)
    if(!(path in responses))return new Response('Not found',{status:404})
    return new Response(responses[path],{headers:{Vary:'Origin'}})
  }
  const cache={match,put:async(value:string|URL|Request,response:Response)=>{const req=request(value);entries.set(req.url,{request:req,response:response.clone()})},addAll:async(values:string[])=>{for(const value of values)await cache.put(value,await fetch(value))}}
  const handlers:Record<string,(event:any)=>void>={}
  runInNewContext(await readFile('public/sw.js','utf8'),{
    self:{location:{href:origin+'sw.js',origin:new URL(origin).origin},addEventListener:(name:string,handler:(event:any)=>void)=>{handlers[name]=handler},skipWaiting:()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}},
    caches:{open:async()=>cache,match,keys:async()=>[],delete:async()=>true},
    fetch,URL,Response,Uint8Array,crypto:webcrypto,
  })
  async function install(){let pending:Promise<unknown>|undefined;handlers.install({waitUntil:(work:Promise<unknown>)=>{pending=work}});await pending}
  async function get(path:string,headers:HeadersInit={}){let pending:Promise<Response>|undefined;handlers.fetch({request:new Request(origin+path,{headers}),respondWith:(work:Promise<Response>)=>{pending=work}});return await pending}
  return {install,get,match,cacheResource:async(path:string)=>cache.put(origin+path,await fetch(origin+path)),setOffline:()=>{offline=true},origin}
}

it.each(['math-runtime/pyodide.mjs','assets/app.js'])('loads cached public %s offline despite an Origin Vary mismatch',async(path)=>{
  const fixture=await workerFixture();await fixture.install();fixture.setOffline()
  expect(await fixture.match(fixture.origin+'offline-ready.json')).toBeDefined()
  const response=await fixture.get(path,{Origin:fixture.origin.slice(0,-1)})
  expect(response?.ok).toBe(true)
})
it('keeps normal Vary matching outside public app assets',async()=>{
  const fixture=await workerFixture();await fixture.install();await fixture.cacheResource('user-data.json');fixture.setOffline()
  await expect(fixture.get('user-data.json',{Origin:'https://different.test'})).rejects.toThrow('disconnected')
})
it('never reports offline readiness if runtime integrity verification fails',async()=>{
  const fixture=await workerFixture(true)
  await expect(fixture.install()).rejects.toThrow('failed verification')
  expect(await fixture.match(fixture.origin+'offline-ready.json')).toBeUndefined()
})
