/** Intersection segments of a triangle mesh with an axis-aligned plane.
 * Coordinates and results use the renderer's coordinate order. Coplanar
 * triangles are skipped: their whole face is a section, not a contour line.
 */
export function meshPlaneSection(positions: ArrayLike<number>, indices: ArrayLike<number> | null, axis: 0 | 1 | 2, height: number): number[] {
  const count = Math.floor((indices?.length ?? positions.length / 3) / 3)
  const result: number[] = []
  for (let triangle = 0; triangle < count; triangle++) {
    const vertices = [0, 1, 2].map(corner => {
      const index = indices ? indices[triangle * 3 + corner] : triangle * 3 + corner
      return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]]
    })
    if (!vertices.flat().every(Number.isFinite)) continue
    if (vertices.every(vertex => Math.abs(vertex[axis] - height) < 1e-10)) continue
    const hits: number[][] = []
    for (let edge = 0; edge < 3; edge++) {
      const first = vertices[edge]; const second = vertices[(edge + 1) % 3]
      const d1 = first[axis] - height; const d2 = second[axis] - height
      if (d1 * d2 > 0 || Math.abs(d1 - d2) < 1e-14) continue
      const t = d1 / (d1 - d2)
      if (t < 0 || t > 1) continue
      const hit = first.map((value, index) => value + t * (second[index] - value))
      hit[axis] = height
      if (!hits.some(prior => Math.hypot(...prior.map((value, index) => value - hit[index])) < 1e-10)) hits.push(hit)
    }
    if (hits.length === 2) result.push(...hits[0], ...hits[1])
  }
  return result
}
