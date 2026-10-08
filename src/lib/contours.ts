export interface ScalarGrid {
  columns: number
  rows: number
  width: number
  height: number
  values: Float64Array
}

export type ContourSegment = [number, number, number, number]

export function sampleScalarGrid(
  evaluate: (x: number, y: number) => number,
  width: number,
  height: number,
  worldX: (pixel: number) => number,
  worldY: (pixel: number) => number,
): ScalarGrid {
  const columns = Math.max(2, Math.min(240, Math.ceil(width / 10)))
  const rows = Math.max(2, Math.min(160, Math.ceil(height / 10)))
  const values = new Float64Array((columns + 1) * (rows + 1))

  for (let row = 0; row <= rows; row += 1) {
    const y = worldY(row * height / rows)
    for (let column = 0; column <= columns; column += 1) {
      values[row * (columns + 1) + column] = evaluate(worldX(column * width / columns), y)
    }
  }
  return { columns, rows, width, height, values }
}

export function contourSegments(grid: ScalarGrid): ContourSegment[] {
  const { columns, rows, width, height, values } = grid
  const segments: ContourSegment[] = []
  const stride = columns + 1

  for (let row = 0; row < rows; row += 1) {
    const y0 = row * height / rows
    const y1 = (row + 1) * height / rows
    for (let column = 0; column < columns; column += 1) {
      const x0 = column * width / columns
      const x1 = (column + 1) * width / columns
      const corner = [
        values[row * stride + column],
        values[row * stride + column + 1],
        values[(row + 1) * stride + column + 1],
        values[(row + 1) * stride + column],
      ]
      if (!corner.every(Number.isFinite)) continue

      const points: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      const crossings: Array<[number, number] | null> = [null, null, null, null]
      for (let edge = 0; edge < 4; edge += 1) {
        const next = (edge + 1) % 4
        if ((corner[edge] < 0) === (corner[next] < 0)) continue
        const fraction = corner[edge] / (corner[edge] - corner[next])
        crossings[edge] = [
          points[edge][0] + fraction * (points[next][0] - points[edge][0]),
          points[edge][1] + fraction * (points[next][1] - points[edge][1]),
        ]
      }

      const addSegment = (first: number, second: number) => {
        const start = crossings[first]
        const end = crossings[second]
        if (start && end) segments.push([start[0], start[1], end[0], end[1]])
      }
      const edges = crossings.flatMap((crossing, edge) => crossing ? [edge] : [])
      if (edges.length === 2) addSegment(edges[0], edges[1])
      if (edges.length === 4) {
        const centerNegative = (corner[0] + corner[1] + corner[2] + corner[3]) < 0
        if (centerNegative === (corner[0] < 0)) {
          addSegment(0, 1)
          addSegment(2, 3)
        } else {
          addSegment(0, 3)
          addSegment(1, 2)
        }
      }
    }
  }
  return segments
}
