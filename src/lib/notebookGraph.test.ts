import { describe, expect, it } from 'vitest'
import { compileGraph } from './math'
import { notebookGraphPaths } from './notebookGraph'
import { defaultNotebookGraphBounds as bounds } from './notebook'

describe('notebook graph sampling', () => {
  it('does not clamp off-screen curves into a false horizontal line', () => {
    expect(notebookGraphPaths(compileGraph('y=100'), bounds, 1)).toEqual([])
    const paths = notebookGraphPaths(compileGraph('y=x^2'), bounds, 1)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.join('')).not.toContain('NaN')
  })

  it('breaks paths at poles and invalid real domains', () => {
    const paths = notebookGraphPaths(compileGraph('y=1/(x-0.013)'), bounds, 1)
    expect(paths).toHaveLength(2)
    const root = notebookGraphPaths(compileGraph('y=sqrt(x)'), bounds, 1)
    expect(root).toHaveLength(1)
    expect(root[0].startsWith('M320.000,140.000')).toBe(true)
  })

  it('plots vertical and planar curves, updates linked variables and rejects unsupported previews', () => {
    expect(notebookGraphPaths(compileGraph('x=a'), bounds, 2)).toEqual(['M400,0L400,280'])
    expect(notebookGraphPaths(compileGraph('r=2'), bounds, 1)).toHaveLength(1)
    expect(notebookGraphPaths(compileGraph('y=A2*x', { A2: 2 }), bounds, 1)).not.toEqual(notebookGraphPaths(compileGraph('y=A2*x', { A2: 1 }), bounds, 1))
    expect(() => notebookGraphPaths(compileGraph('z=x+y'), bounds, 1)).toThrow(/workspace/)
    expect(() => notebookGraphPaths(compileGraph('y=x'), { ...bounds, maxX: bounds.minX }, 1)).toThrow(/bounds/)
  })
})
