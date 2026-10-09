export interface TriangleMesh { positions: number[]; indices: number[] | null }
type V = number[]
const sub = (a: V, b: V) => a.map((v,i) => v-b[i])
const dot = (a: V, b: V) => a.reduce((sum,v,i) => sum+v*b[i],0)
const cross = (a: V, b: V) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
function triangles(mesh: TriangleMesh) {
  const count = Math.floor((mesh.indices?.length ?? mesh.positions.length/3)/3)
  return Array.from({ length: count }, (_, index) => {
    const v = [0,1,2].map(corner => {
      const i = mesh.indices ? mesh.indices[index*3+corner] : index*3+corner
      return mesh.positions.slice(i*3,i*3+3)
    })
    return { v, min: [0,1,2].map(i => Math.min(...v.map(p => p[i]))), max: [0,1,2].map(i => Math.max(...v.map(p => p[i]))) }
  }).filter(t => t.v.flat().every(Number.isFinite))
}
function edgeTriangle(a: V, b: V, triangle: V[]): V | null {
  const [p,q,r] = triangle; const e1 = sub(q,p); const e2 = sub(r,p); const direction = sub(b,a)
  const h = cross(direction,e2); const determinant = dot(e1,h)
  if (Math.abs(determinant) < 1e-12) return null // coplanar faces have no unique curve
  const inverse = 1/determinant; const relative = sub(a,p); const u = inverse*dot(relative,h)
  if (u < -1e-9 || u > 1+1e-9) return null
  const v = inverse*dot(direction,cross(relative,e1))
  if (v < -1e-9 || u+v > 1+1e-9) return null
  const t = inverse*dot(e2,cross(relative,e1))
  return t < -1e-9 || t > 1+1e-9 ? null : a.map((value,i) => value+t*direction[i])
}

/** Piecewise-linear surface intersections, spatially indexed and bounded.
 * Tangential contact and coincident faces are intentionally not curve results.
 */
export function intersectTriangleMeshes(first: TriangleMesh, second: TriangleMesh, maximumChecks = 2_000_000): number[] {
  const a = triangles(first); const b = triangles(second)
  if (!a.length || !b.length) return []
  if (a.length > 100000 || b.length > 100000) throw new Error('Intersection meshes exceed 100,000 triangles.')
  const min = [0,1,2].map(i => [...a,b].flat().reduce((value,t)=>Math.min(value,t.min[i]),Infinity))
  const max = [0,1,2].map(i => [...a,b].flat().reduce((value,t)=>Math.max(value,t.max[i]),-Infinity))
  const cell = (value: number, axis: number) => Math.max(0,Math.min(15,Math.floor((value-min[axis])/(max[axis]-min[axis] || 1)*16)))
  const keys = (t: typeof a[number]) => {
    const keys: number[] = []
    for (let x=cell(t.min[0],0);x<=cell(t.max[0],0);x++) for(let y=cell(t.min[1],1);y<=cell(t.max[1],1);y++) for(let z=cell(t.min[2],2);z<=cell(t.max[2],2);z++) keys.push(x*256+y*16+z)
    return keys
  }
  const grid = new Map<number,number[]>()
  b.forEach((t,index) => { for (const key of keys(t)) { const entries=grid.get(key) ?? []; entries.push(index); grid.set(key,entries) } })
  const segments: number[] = []; let checks=0
  for (const t of a) {
    const candidates = new Set(keys(t).flatMap(key=>grid.get(key) ?? []))
    for (const index of candidates) {
      if (++checks > maximumChecks) throw new Error('Intersection reached its work limit. Use fewer or simpler surfaces.')
      const u=b[index]
      if ([0,1,2].some(i=>t.max[i]<u.min[i]-1e-9 || u.max[i]<t.min[i]-1e-9)) continue
      const hits: V[] = []
      for (let edge=0;edge<3;edge++) {
        for (const hit of [edgeTriangle(t.v[edge],t.v[(edge+1)%3],u.v),edgeTriangle(u.v[edge],u.v[(edge+1)%3],t.v)]) {
          if (hit && !hits.some(p=>Math.hypot(...sub(p,hit))<1e-8)) hits.push(hit)
        }
      }
      if (hits.length>=2) {
        let best=[hits[0],hits[1]]; let length=0
        for (const p of hits) for (const q of hits) { const d=Math.hypot(...sub(p,q)); if(d>length) {length=d;best=[p,q]} }
        if (length>1e-8) segments.push(...best[0],...best[1])
      }
      if (segments.length>600000) throw new Error('Intersection curve exceeds 100,000 segments.')
    }
  }
  return segments
}
