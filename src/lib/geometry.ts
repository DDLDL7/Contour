import { compileScalarDefinition } from './math'

export type GeometryTool = 'select' | 'point' | 'linked-point' | 'line' | 'segment' | 'ray' | 'vector' | 'polygon' | 'circle' | 'ellipse' | 'conic' | 'locus' | 'envelope' | 'distance' | 'angle' | 'perimeter' | 'area' | 'transform'

export interface GeometryPoint {
  id: string
  kind: 'point'
  x: number
  y: number
  color: string
  label: string
  xCell?: string
  yCell?: string
  intersectionOf?: [string, string]
  visible: boolean
}

export interface GeometryPath {
  id: string
  kind: 'line' | 'segment' | 'ray' | 'vector'
  startId: string
  endId: string
  color: string
  visible: boolean
}

export function intersectGeometryPaths(first: GeometryPath, second: GeometryPath, points: ReadonlyMap<string, GeometryPoint>): { x: number; y: number } | null {
  const p = points.get(first.startId); const p2 = points.get(first.endId)
  const q = points.get(second.startId); const q2 = points.get(second.endId)
  if (!p || !p2 || !q || !q2) return null
  if (![p.x, p.y, p2.x, p2.y, q.x, q.y, q2.x, q2.y].every(Number.isFinite)) return null
  const rx = p2.x - p.x; const ry = p2.y - p.y; const sx = q2.x - q.x; const sy = q2.y - q.y
  const denominator = rx * sy - ry * sx
  if (Math.abs(denominator) < 1e-12) return null
  const qpx = q.x - p.x; const qpy = q.y - p.y
  const t = (qpx * sy - qpy * sx) / denominator
  const u = (qpx * ry - qpy * rx) / denominator
  const valid = (path: GeometryPath, value: number) => path.kind === 'line' || path.kind === 'ray' && value >= -1e-10 || (path.kind === 'segment' || path.kind === 'vector') && value >= -1e-10 && value <= 1 + 1e-10
  if (!valid(first, t) || !valid(second, u)) return null
  return { x: p.x + t * rx, y: p.y + t * ry }
}

export function resolveGeometryPoints(objects: readonly GeometryObject[], id: string, seen = new Set<string>()): GeometryPoint[] {
  if (seen.has(id)) return []
  seen.add(id)
  const object = objects.find((item) => item.id === id && item.visible)
  if (!object) return []
  if (object.kind === 'point') return [object]
  const points = new Map(objects.filter((item): item is GeometryPoint => item.kind === 'point').map((point) => [point.id, point]))
  if (object.kind === 'polygon') return object.pointIds.map((pointId) => points.get(pointId)).filter((point): point is GeometryPoint => Boolean(point?.visible))
  if (object.kind === 'line' || object.kind === 'segment' || object.kind === 'ray' || object.kind === 'vector') return [points.get(object.startId), points.get(object.endId)].filter((point): point is GeometryPoint => Boolean(point?.visible))
  if (object.kind !== 'transform') return []
  const sourcePoints = resolveGeometryPoints(objects, object.sourceId, seen)
  return sourcePoints.map((point) => {
    let x = point.x; let y = point.y
    if (object.operation === 'translate') { x += object.dx; y += object.dy }
    if (object.operation === 'reflect-x') y = -y
    if (object.operation === 'reflect-y') x = -x
    if (object.operation === 'reflect-origin') { x = -x; y = -y }
    if (object.operation === 'rotate') {
      const angle = object.angleDegrees * Math.PI / 180
      const dx = x - object.centerX; const dy = y - object.centerY
      x = object.centerX + dx * Math.cos(angle) - dy * Math.sin(angle)
      y = object.centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
    }
    if (object.operation === 'dilate') { x = object.centerX + (x - object.centerX) * object.scale; y = object.centerY + (y - object.centerY) * object.scale }
    if (object.operation === 'invert') {
      const dx = x - object.centerX; const dy = y - object.centerY; const distance2 = dx * dx + dy * dy
      if (distance2 < 1e-12) return { ...point, id: `${object.id}:${point.id}`, x: Number.NaN, y: Number.NaN, color: object.color }
      x = object.centerX + object.radius * object.radius * dx / distance2
      y = object.centerY + object.radius * object.radius * dy / distance2
    }
    return { ...point, id: `${object.id}:${point.id}`, label: `${point.label}′`, x, y, color: object.color }
  })
}

export interface GeometryPolygon {
  id: string
  kind: 'polygon'
  pointIds: string[]
  color: string
  visible: boolean
}

export interface GeometryCircle {
  id: string
  kind: 'circle'
  centerId: string
  radiusPointId: string
  color: string
  visible: boolean
}

export interface GeometryEllipse {
  id: string
  kind: 'ellipse'
  centerId: string
  axisXId: string
  axisYId: string
  color: string
  visible: boolean
}

export interface GeometryConic {
  id: string
  kind: 'conic'
  pointIds: string[]
  color: string
  visible: boolean
}

export interface GeometryLocus {
  id: string
  kind: 'locus'
  pointId: string
  centerId: string
  color: string
  visible: boolean
}

export interface GeometryEnvelope {
  id: string
  kind: 'envelope'
  slopeExpression: string
  interceptExpression: string
  start: number
  end: number
  color: string
  visible: boolean
}

export function sampleLineEnvelope(envelope: GeometryEnvelope, count = 400): { x: number; y: number }[] {
  const slope = compileScalarDefinition(envelope.slopeExpression, ['t'])
  const intercept = compileScalarDefinition(envelope.interceptExpression, ['t'])
  const result: { x: number; y: number }[] = []
  for (let index = 0; index <= count; index += 1) {
    const t = envelope.start + (envelope.end - envelope.start) * index / count
    const h = 1e-4 * Math.max(1, Math.abs(t))
    const m = slope.evaluate({ t }); const b = intercept.evaluate({ t })
    const dm = (slope.evaluate({ t: t + h }) - slope.evaluate({ t: t - h })) / (2 * h)
    const db = (intercept.evaluate({ t: t + h }) - intercept.evaluate({ t: t - h })) / (2 * h)
    if (!Number.isFinite(dm) || Math.abs(dm) < 1e-10) { result.push({ x: Number.NaN, y: Number.NaN }); continue }
    const x = -db / dm; const y = m * x + b
    result.push(Number.isFinite(x) && Number.isFinite(y) && Math.max(Math.abs(x), Math.abs(y)) < 1e4 ? { x, y } : { x: Number.NaN, y: Number.NaN })
  }
  return result
}

export interface GeometryMeasurement {
  id: string
  kind: 'measurement'
  measure: 'distance' | 'angle' | 'perimeter' | 'area'
  pointIds?: string[]
  polygonId?: string
  color: string
  visible: boolean
}

export type TransformOperation = 'translate' | 'reflect-x' | 'reflect-y' | 'reflect-origin' | 'rotate' | 'dilate' | 'invert'

export interface GeometryTransform {
  id: string
  kind: 'transform'
  sourceId: string
  sourceKind: 'point' | 'line' | 'segment' | 'ray' | 'vector' | 'polygon'
  operation: TransformOperation
  dx: number
  dy: number
  centerX: number
  centerY: number
  angleDegrees: number
  scale: number
  radius: number
  color: string
  visible: boolean
}

export type GeometryObject = GeometryPoint | GeometryPath | GeometryPolygon | GeometryCircle | GeometryEllipse | GeometryConic | GeometryLocus | GeometryEnvelope | GeometryMeasurement | GeometryTransform

/** Coefficients of Ax² + Bxy + Cy² + Dx + Ey + F = 0 through five points. */
export function fitConic(points: Pick<GeometryPoint, 'x' | 'y'>[]): [number, number, number, number, number, number] | null {
  if (points.length !== 5) return null
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return null
  const matrix = points.map(({ x, y }) => [x * x, x * y, y * y, x, y, 1])
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) return null
  const scale = Math.max(1, ...matrix.flat().map(Math.abs))
  matrix.forEach((row) => row.forEach((value, index) => { row[index] = value / scale }))
  const pivots: number[] = []
  for (let column = 0; column < 6 && pivots.length < 5; column += 1) {
    let pivot = pivots.length
    for (let row = pivot + 1; row < 5; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    if (Math.abs(matrix[pivot][column]) < 1e-12) continue
    ;[matrix[pivots.length], matrix[pivot]] = [matrix[pivot], matrix[pivots.length]]
    const current = matrix[pivots.length]
    const divisor = current[column]
    for (let entry = column; entry < 6; entry += 1) current[entry] /= divisor
    for (let row = 0; row < 5; row += 1) {
      if (row === pivots.length) continue
      const factor = matrix[row][column]
      for (let entry = column; entry < 6; entry += 1) matrix[row][entry] -= factor * current[entry]
    }
    pivots.push(column)
  }
  if (pivots.length !== 5) return null
  const free = [0, 1, 2, 3, 4, 5].find((column) => !pivots.includes(column))!
  const result = [0, 0, 0, 0, 0, 0]
  result[free] = 1
  pivots.forEach((column, row) => { result[column] = -matrix[row][free] })
  const norm = Math.max(...result.map(Math.abs))
  if (!Number.isFinite(norm) || norm === 0) return null
  return result.map((value) => value / norm) as [number, number, number, number, number, number]
}

export function isGeometryObject(value: unknown): value is GeometryObject {
  if (!value || typeof value !== 'object') return false
  const object = value as Partial<GeometryObject>
  if (typeof object.id !== 'string' || typeof object.color !== 'string' || typeof object.visible !== 'boolean') return false
  if (object.kind === 'point') {
    const point = object as Partial<GeometryPoint>
    return Number.isFinite(point.x) && Number.isFinite(point.y) && typeof point.label === 'string'
      && (point.xCell === undefined || /^[A-H](?:[1-9]|1[0-8])$/.test(point.xCell))
      && (point.yCell === undefined || /^[A-H](?:[1-9]|1[0-8])$/.test(point.yCell))
      && (point.intersectionOf === undefined || Array.isArray(point.intersectionOf) && point.intersectionOf.length === 2 && point.intersectionOf.every((id) => typeof id === 'string'))
  }
  if (object.kind === 'line' || object.kind === 'segment' || object.kind === 'ray' || object.kind === 'vector') {
    const path = object as Partial<GeometryPath>
    return typeof path.startId === 'string' && typeof path.endId === 'string'
  }
  if (object.kind === 'polygon') {
    const polygon = object as Partial<GeometryPolygon>
    return Array.isArray(polygon.pointIds) && polygon.pointIds.length >= 3 && polygon.pointIds.every((id) => typeof id === 'string')
  }
  if (object.kind === 'circle') {
    const circle = object as Partial<GeometryCircle>
    return typeof circle.centerId === 'string' && typeof circle.radiusPointId === 'string'
  }
  if (object.kind === 'ellipse') {
    const ellipse = object as Partial<GeometryEllipse>
    return [ellipse.centerId, ellipse.axisXId, ellipse.axisYId].every((id) => typeof id === 'string')
  }
  if (object.kind === 'conic') {
    const conic = object as Partial<GeometryConic>
    return Array.isArray(conic.pointIds) && conic.pointIds.length === 5 && conic.pointIds.every((id) => typeof id === 'string')
  }
  if (object.kind === 'locus') {
    const locus = object as Partial<GeometryLocus>
    return typeof locus.pointId === 'string' && typeof locus.centerId === 'string'
  }
  if (object.kind === 'envelope') {
    const envelope = object as Partial<GeometryEnvelope>
    return typeof envelope.slopeExpression === 'string' && envelope.slopeExpression.length > 0 && envelope.slopeExpression.length <= 500
      && typeof envelope.interceptExpression === 'string' && envelope.interceptExpression.length > 0 && envelope.interceptExpression.length <= 500
      && Number.isFinite(envelope.start) && Number.isFinite(envelope.end) && envelope.start! < envelope.end!
  }
  if (object.kind === 'measurement') {
    const measurement = object as Partial<GeometryMeasurement>
    if (measurement.measure === 'distance') return Array.isArray(measurement.pointIds) && measurement.pointIds.length === 2 && measurement.pointIds.every((id) => typeof id === 'string')
    if (measurement.measure === 'angle') return Array.isArray(measurement.pointIds) && measurement.pointIds.length === 3 && measurement.pointIds.every((id) => typeof id === 'string')
    if (measurement.measure === 'perimeter' || measurement.measure === 'area') return typeof measurement.polygonId === 'string'
    return false
  }
  if (object.kind === 'transform') {
    const transform = object as Partial<GeometryTransform>
    return typeof transform.sourceId === 'string'
      && ['point', 'line', 'segment', 'ray', 'vector', 'polygon'].includes(transform.sourceKind ?? '')
      && ['translate', 'reflect-x', 'reflect-y', 'reflect-origin', 'rotate', 'dilate', 'invert'].includes(transform.operation ?? '')
      && [transform.dx, transform.dy, transform.centerX, transform.centerY, transform.angleDegrees, transform.scale, transform.radius].every(Number.isFinite)
  }
  return false
}

export function geometryIsConsistent(objects: GeometryObject[]): boolean {
  const ids = new Set(objects.map((object) => object.id))
  if (ids.size !== objects.length) return false
  return objects.every((object) => {
    if (object.kind === 'point') {
      if (!object.intersectionOf) return true
      if (object.intersectionOf[0] === object.intersectionOf[1]) return false
      return object.intersectionOf.every((id) => objects.some((candidate) => candidate.id === id && ['line', 'ray', 'segment', 'vector'].includes(candidate.kind)))
        && object.intersectionOf.every((id) => {
          const path = objects.find((candidate): candidate is GeometryPath => candidate.id === id && ['line', 'ray', 'segment', 'vector'].includes(candidate.kind))
          return Boolean(path && path.startId !== object.id && path.endId !== object.id)
        })
    }
    if (object.kind === 'measurement') {
      if (object.measure === 'distance' || object.measure === 'angle') {
        return object.pointIds!.every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
      }
      return ids.has(object.polygonId!) && objects.some((candidate) => candidate.id === object.polygonId && (candidate.kind === 'polygon' || candidate.kind === 'transform' && candidate.sourceKind === 'polygon'))
    }
    if (object.kind === 'circle') return [object.centerId, object.radiusPointId].every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
    if (object.kind === 'ellipse') return [object.centerId, object.axisXId, object.axisYId].every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
    if (object.kind === 'conic') return object.pointIds.every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
    if (object.kind === 'locus') return [object.pointId, object.centerId].every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
    if (object.kind === 'envelope') return true
    if (object.kind === 'transform') {
      const source = objects.find((candidate) => candidate.id === object.sourceId)
      if (!source || source.kind === 'measurement') return false
      const sourceKind = source.kind === 'transform' ? source.sourceKind : source.kind
      if (sourceKind !== object.sourceKind) return false
      const visited = new Set<string>([object.id])
      let current: GeometryObject | undefined = source
      while (current?.kind === 'transform') {
        if (visited.has(current.id)) return false
        visited.add(current.id)
        const sourceId: string = current.sourceId
        current = objects.find((candidate) => candidate.id === sourceId)
      }
      return true
    }
    if (object.kind === 'polygon') return object.pointIds.every((id) => ids.has(id) && objects.some((candidate) => candidate.id === id && candidate.kind === 'point'))
    return ids.has(object.startId) && ids.has(object.endId)
      && objects.some((candidate) => candidate.id === object.startId && candidate.kind === 'point')
      && objects.some((candidate) => candidate.id === object.endId && candidate.kind === 'point')
  })
}
