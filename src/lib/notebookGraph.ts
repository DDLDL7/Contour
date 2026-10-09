import { evaluatePlanarPoint, type GraphExpression } from './math'
import { areNotebookGraphBounds, type NotebookGraphBounds } from './notebook'

/** Bounded preview sampling. Off-screen samples break paths rather than being clamped. */
export function notebookGraphPaths(graph: GraphExpression, bounds: NotebookGraphBounds, parameterA: number): string[] {
  if (!areNotebookGraphBounds(bounds)) throw new Error('Enter increasing, finite graph bounds between −1,000,000 and 1,000,000.')
  if (!['curve', 'vertical', 'polar', 'parametric'].includes(graph.kind)) {
    throw new Error('Notebook previews support y=f(x), vertical lines, polar curves and parametric curves. Use the 2D or 3D workspace for other expressions.')
  }
  const sx = (x: number) => (x - bounds.minX) / (bounds.maxX - bounds.minX) * 640
  const sy = (y: number) => (bounds.maxY - y) / (bounds.maxY - bounds.minY) * 280
  if (graph.kind === 'vertical') {
    const x = graph.evaluate(0, 0, parameterA)
    return Number.isFinite(x) && x >= bounds.minX && x <= bounds.maxX ? [`M${sx(x)},0L${sx(x)},280`] : []
  }
  const planar = graph.kind === 'polar' || graph.kind === 'parametric'
  const start = planar ? 0 : bounds.minX
  const end = planar ? 2 * Math.PI : bounds.maxX
  const point = (t: number): [number, number] => planar
    ? evaluatePlanarPoint(graph, t, parameterA) : [t, graph.evaluate(t, 0, parameterA)]
  const paths: string[] = []
  let path = ''
  let previous: [number, number] | null = null
  for (let index = 0; index <= 640; index += 1) {
    const t = start + (end - start) * index / 640
    const [x, y] = point(t)
    if (![x, y].every(Number.isFinite) || x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
      if (path) paths.push(path)
      path = ''; previous = null
      continue
    }
    const px = sx(x); const py = sy(y)
    const [mx, my] = point(t - (end - start) / 1280)
    const continuous = previous && Number.isFinite(mx) && Number.isFinite(my)
      && Math.hypot(px - previous[0], py - previous[1]) < 140
      && Math.hypot(sx(mx) - (px + previous[0]) / 2, sy(my) - (py + previous[1]) / 2) < 35
    if (!continuous && path) { paths.push(path); path = '' }
    path += `${continuous ? 'L' : 'M'}${px.toFixed(3)},${py.toFixed(3)}`
    previous = [px, py]
  }
  if (path) paths.push(path)
  return paths
}
