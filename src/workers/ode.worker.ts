import { compileScalarDefinition } from '../lib/math'
import { solveOde } from '../lib/ode'
const scope=self as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(data:unknown)=>void}
scope.onmessage=({data})=>{
  try {
    const {system,first,second,start,end,initialX,initialY,tolerance,parameterA,definitions}=data
    const names=[...new Set(['x','y','t','a',...Object.keys(definitions)])]
    const f=compileScalarDefinition(first,names); const g=system ? compileScalarDefinition(second,names) : null
    const field=(t:number,values:number[])=>{
      const variables={...definitions,a:parameterA,t,x:system ? values[0] : t,y:system ? values[1] : values[0]}
      return g ? [f.evaluate(variables),g.evaluate(variables)] : [f.evaluate(variables)]
    }
    const solution=solveOde(field,start,end,system ? [initialX,initialY] : [initialY],tolerance)
    const arrows:number[][]=[]
    for(let x=-4;x<=4;x+=.5) for(let y=-4;y<=4;y+=.5) {
      try {
        const v=field(system ? start : x,system ? [x,y] : [y]); const dx=system ? v[0] : 1,dy=system ? v[1] : v[0],norm=Math.hypot(dx,dy)
        if(Number.isFinite(norm) && norm>1e-12) arrows.push([x,y,dx/norm*.2,dy/norm*.2])
      } catch { /* Ignore undefined field samples without losing a valid solution. */ }
    }
    scope.postMessage({solution,arrows})
  } catch(error) {scope.postMessage({error:error instanceof Error ? error.message : 'Could not solve.'})}
}
