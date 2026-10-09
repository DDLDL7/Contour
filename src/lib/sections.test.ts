import { describe, expect, it } from 'vitest'
import { meshPlaneSection } from './sections'

describe('mesh plane intersections', () => {
  const triangle = [-1,-1,0, 1,-1,0, 0,1,0]
  it('interpolates indexed and unindexed triangles on each axis', () => {
    expect(meshPlaneSection(triangle, null, 1, 0)).toEqual([.5,0,0, -.5,0,0])
    expect(meshPlaneSection(triangle, [0,1,2], 0, 0)).toEqual([0,-1,0, 0,1,0])
    expect(meshPlaneSection(triangle, null, 1, 3)).toEqual([])
  })
  it('avoids spurious zero-length and coplanar diagonals', () => {
    expect(meshPlaneSection(triangle, null, 1, 1)).toEqual([])
    expect(meshPlaneSection(triangle, null, 2, 0)).toEqual([])
  })
})
