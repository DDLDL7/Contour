import { compileGraph } from '../lib/math'
import { sampleImplicitSurface, sampleParametricSurface } from '../lib/meshing'

interface MeshJob {
  id: string
  source: string
  definitions: Record<string, number>
  parameterA: number
}

self.onmessage = (event: MessageEvent<MeshJob>) => {
  const { id, source, definitions, parameterA } = event.data
  try {
    const graph = compileGraph(source, definitions)
    const samples = graph.kind === 'parametricSurface'
      ? sampleParametricSurface(graph, parameterA)
      : sampleImplicitSurface(graph, parameterA)
    self.postMessage({ id, samples }, { transfer: [samples.positions.buffer] })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Could not generate the surface.' })
  }
}
