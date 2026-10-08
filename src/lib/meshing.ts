import type { GraphExpression } from './math'

export interface MeshSamples {
  positions: Float32Array
  indices?: number[]
}

export function sampleParametricSurface(graph: GraphExpression, a: number, cells = 64): MeshSamples {
  if (graph.kind !== 'parametricSurface') throw new Error('Expected a parametric surface.')
  const positions = new Float32Array((cells + 1) ** 2 * 3)
  const valid = new Uint8Array((cells + 1) ** 2)
  const indices: number[] = []
  for (let iv = 0; iv <= cells; iv += 1) {
    for (let iu = 0; iu <= cells; iu += 1) {
      const index = iv * (cells + 1) + iu
      const u = iu / cells * Math.PI * 2
      const v = iv / cells * Math.PI * 2
      const x = graph.evaluate(u, v, a)
      const y = graph.evaluateY?.(u, v, a) ?? Number.NaN
      const z = graph.evaluateZ?.(u, v, a) ?? Number.NaN
      if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 30) continue
      positions.set([x, z, y], index * 3)
      valid[index] = 1
    }
  }
  const addTriangle = (first: number, second: number, third: number) => {
    if (!valid[first] || !valid[second] || !valid[third]) return
    for (const [left, right] of [[first, second], [second, third], [third, first]]) {
      const dx = positions[left * 3] - positions[right * 3]
      const dy = positions[left * 3 + 1] - positions[right * 3 + 1]
      const dz = positions[left * 3 + 2] - positions[right * 3 + 2]
      if (Math.hypot(dx, dy, dz) > 4) return
    }
    indices.push(first, second, third)
  }
  for (let iv = 0; iv < cells; iv += 1) {
    for (let iu = 0; iu < cells; iu += 1) {
      const first = iv * (cells + 1) + iu
      const second = first + 1
      const third = first + cells + 1
      const fourth = third + 1
      addTriangle(first, third, second)
      addTriangle(second, third, fourth)
    }
  }
  return { positions, indices }
}

type Point = [number, number, number]
const tetrahedra = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
]
const tetraEdges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]

export function sampleImplicitSurface(graph: GraphExpression, a: number, cells = 28, extent = 6): MeshSamples {
  if (graph.kind !== 'implicitSurface' || !graph.evaluate3D) throw new Error('Expected an implicit surface.')
  const stride = cells + 1
  const values = new Float32Array(stride ** 3)
  const at = (ix: number, iy: number, iz: number) => (iz * stride + iy) * stride + ix
  const coordinate = (index: number) => -extent + index / cells * extent * 2
  for (let iz = 0; iz <= cells; iz += 1) {
    for (let iy = 0; iy <= cells; iy += 1) {
      for (let ix = 0; ix <= cells; ix += 1) {
        values[at(ix, iy, iz)] = graph.evaluate3D(coordinate(ix), coordinate(iy), coordinate(iz), a)
      }
    }
  }

  const positions: number[] = []
  const pushTriangle = (first: Point, second: Point, third: Point) => {
    for (const point of [first, second, third]) positions.push(point[0], point[2], point[1])
  }
  for (let iz = 0; iz < cells; iz += 1) {
    for (let iy = 0; iy < cells; iy += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        const cube: Point[] = [
          [coordinate(ix), coordinate(iy), coordinate(iz)],
          [coordinate(ix + 1), coordinate(iy), coordinate(iz)],
          [coordinate(ix + 1), coordinate(iy + 1), coordinate(iz)],
          [coordinate(ix), coordinate(iy + 1), coordinate(iz)],
          [coordinate(ix), coordinate(iy), coordinate(iz + 1)],
          [coordinate(ix + 1), coordinate(iy), coordinate(iz + 1)],
          [coordinate(ix + 1), coordinate(iy + 1), coordinate(iz + 1)],
          [coordinate(ix), coordinate(iy + 1), coordinate(iz + 1)],
        ]
        const cubeValues = [
          values[at(ix, iy, iz)], values[at(ix + 1, iy, iz)],
          values[at(ix + 1, iy + 1, iz)], values[at(ix, iy + 1, iz)],
          values[at(ix, iy, iz + 1)], values[at(ix + 1, iy, iz + 1)],
          values[at(ix + 1, iy + 1, iz + 1)], values[at(ix, iy + 1, iz + 1)],
        ]
        if (!cubeValues.every(Number.isFinite) || cubeValues.every((value) => value > 0) || cubeValues.every((value) => value < 0)) continue
        for (const tetra of tetrahedra) {
          const crossings: Point[] = []
          for (const [one, two] of tetraEdges) {
            const first = tetra[one]
            const second = tetra[two]
            const firstValue = cubeValues[first]
            const secondValue = cubeValues[second]
            if ((firstValue < 0) === (secondValue < 0) || firstValue === secondValue) continue
            const ratio = firstValue / (firstValue - secondValue)
            crossings.push([
              cube[first][0] + ratio * (cube[second][0] - cube[first][0]),
              cube[first][1] + ratio * (cube[second][1] - cube[first][1]),
              cube[first][2] + ratio * (cube[second][2] - cube[first][2]),
            ])
          }
          if (crossings.length === 3) pushTriangle(crossings[0], crossings[1], crossings[2])
          if (crossings.length === 4) {
            const center: Point = [0, 0, 0]
            for (const point of crossings) for (let axis = 0; axis < 3; axis += 1) center[axis] += point[axis] / 4
            const normal = new Float32Array(3)
            const first = crossings[0].map((value, axis) => value - center[axis])
            const second = crossings[1].map((value, axis) => value - center[axis])
            normal[0] = first[1] * second[2] - first[2] * second[1]
            normal[1] = first[2] * second[0] - first[0] * second[2]
            normal[2] = first[0] * second[1] - first[1] * second[0]
            const dot = (left: number[], right: number[]) => left.reduce((sum, value, axis) => sum + value * right[axis], 0)
            const cross = (left: number[], right: number[]) => [
              left[1] * right[2] - left[2] * right[1],
              left[2] * right[0] - left[0] * right[2],
              left[0] * right[1] - left[1] * right[0],
            ]
            crossings.sort((left, right) => {
              const leftVector = left.map((value, axis) => value - center[axis])
              const rightVector = right.map((value, axis) => value - center[axis])
              return Math.atan2(dot(cross(first, leftVector), [...normal]), dot(first, leftVector))
                - Math.atan2(dot(cross(first, rightVector), [...normal]), dot(first, rightVector))
            })
            pushTriangle(crossings[0], crossings[1], crossings[2])
            pushTriangle(crossings[0], crossings[2], crossings[3])
          }
        }
      }
    }
  }
  return { positions: new Float32Array(positions) }
}
