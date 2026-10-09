import { intersectTriangleMeshes, type TriangleMesh } from '../lib/intersections3d'
const scope = self as unknown as { onmessage: (event: MessageEvent<{ meshes: TriangleMesh[] }>) => void; postMessage: (value: unknown) => void }
scope.onmessage = ({ data }) => {
  try {
    const segments: number[] = []
    if (data.meshes.length > 8) throw new Error('Surface intersections support up to eight visible surfaces.')
    for (let i=0;i<data.meshes.length;i++) for(let j=i+1;j<data.meshes.length;j++) {
      for (const value of intersectTriangleMeshes(data.meshes[i],data.meshes[j])) segments.push(value)
      if (segments.length > 600000) throw new Error('Intersection curves exceed 100,000 segments.')
    }
    scope.postMessage({ segments })
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'Surface intersection failed.' }) }
}
