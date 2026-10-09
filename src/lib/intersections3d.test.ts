import { describe, expect, it } from 'vitest'
import { intersectTriangleMeshes, type TriangleMesh } from './intersections3d'
describe('sampled surface intersections', () => {
  const horizontal: TriangleMesh = { positions:[-1,-1,0, 1,-1,0, 0,1,0], indices:null }
  it('finds a transverse line on both triangles and is symmetric', () => {
    const vertical: TriangleMesh = { positions:[0,-1,-1, 0,1,-1, 0,0,1], indices:[0,1,2] }
    const line=intersectTriangleMeshes(horizontal,vertical)
    expect(line.length).toBe(6)
    for(let i=0;i<line.length;i+=3) { expect(line[i]).toBeCloseTo(0,10); expect(line[i+2]).toBeCloseTo(0,10) }
    expect(intersectTriangleMeshes(vertical,horizontal).length).toBe(6)
  })
  it('omits disjoint and coincident faces and bounds work', () => {
    expect(intersectTriangleMeshes(horizontal,{ positions:horizontal.positions.map((v,i)=>i%3===2?v+2:v),indices:null })).toEqual([])
    expect(intersectTriangleMeshes(horizontal,horizontal)).toEqual([])
    expect(()=>intersectTriangleMeshes(horizontal,horizontal,0)).toThrow(/work limit/)
  })
})
