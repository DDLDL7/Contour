import { describe, expect, it } from 'vitest'
import { fitConic, geometryIsConsistent, intersectGeometryPaths, isGeometryObject, resolveGeometryPoints, sampleLineEnvelope, type GeometryCircle, type GeometryConic, type GeometryEllipse, type GeometryEnvelope, type GeometryLocus, type GeometryPath, type GeometryPoint } from './geometry'

describe('dynamic geometry', () => {
  it('validates a circle linked to movable center and radius points', () => {
    const center: GeometryPoint = { id: 'center', kind: 'point', x: 1, y: 2, color: '#286fc0', label: 'A', visible: true }
    const rim: GeometryPoint = { id: 'rim', kind: 'point', x: 4, y: 2, color: '#286fc0', label: 'B', visible: true }
    const circle: GeometryCircle = { id: 'circle', kind: 'circle', centerId: center.id, radiusPointId: rim.id, color: '#286fc0', visible: true }
    expect(isGeometryObject(circle)).toBe(true)
    expect(geometryIsConsistent([center, rim, circle])).toBe(true)
    expect(geometryIsConsistent([center, circle])).toBe(false)
  })

  it('validates an ellipse linked to its center and conjugate radius points', () => {
    const points: GeometryPoint[] = [
      { id: 'c', kind: 'point', x: 0, y: 0, color: '#286fc0', label: 'A', visible: true },
      { id: 'x', kind: 'point', x: 3, y: 0, color: '#286fc0', label: 'B', visible: true },
      { id: 'y', kind: 'point', x: 0, y: 2, color: '#286fc0', label: 'C', visible: true },
    ]
    const ellipse: GeometryEllipse = { id: 'ellipse', kind: 'ellipse', centerId: 'c', axisXId: 'x', axisYId: 'y', color: '#286fc0', visible: true }
    expect(isGeometryObject(ellipse)).toBe(true)
    expect(geometryIsConsistent([...points, ellipse])).toBe(true)
  })

  it('fits a dynamic conic through five points', () => {
    const points: GeometryPoint[] = [
      [-2, 0], [2, 0], [0, -2], [0, 2], [Math.SQRT2, Math.SQRT2],
    ].map(([x, y], index) => ({ id: `p${index}`, kind: 'point', x, y, color: '#286fc0', label: String(index), visible: true }))
    const coefficients = fitConic(points)
    expect(coefficients).not.toBeNull()
    if (coefficients) for (const point of points) {
      const [a, b, c, d, e, f] = coefficients
      expect(a * point.x ** 2 + b * point.x * point.y + c * point.y ** 2 + d * point.x + e * point.y + f).toBeCloseTo(0, 7)
    }
    const conic: GeometryConic = { id: 'fitted', kind: 'conic', pointIds: points.map((point) => point.id), color: '#286fc0', visible: true }
    expect(geometryIsConsistent([...points, conic])).toBe(true)
  })

  it('fits a conic through the origin', () => {
    const points = [-2, -1, 0, 1, 2].map((x) => ({ x, y: x * x }))
    const coefficients = fitConic(points)
    expect(coefficients).not.toBeNull()
    if (coefficients) for (const { x, y } of points) {
      const [a, b, c, d, e, f] = coefficients
      expect(a * x * x + b * x * y + c * y * y + d * x + e * y + f).toBeCloseTo(0, 8)
    }
  })

  it('computes constructed intersections and enforces ray and segment bounds', () => {
    const points: GeometryPoint[] = [
      { id: 'a', kind: 'point', x: -1, y: 0, color: '#286fc0', label: 'A', visible: true },
      { id: 'b', kind: 'point', x: 1, y: 0, color: '#286fc0', label: 'B', visible: true },
      { id: 'c', kind: 'point', x: 0, y: -1, color: '#286fc0', label: 'C', visible: true },
      { id: 'd', kind: 'point', x: 0, y: 1, color: '#286fc0', label: 'D', visible: true },
      { id: 'e', kind: 'point', x: 0, y: 2, color: '#286fc0', label: 'E', visible: true },
    ]
    const horizontal: GeometryPath = { id: 'h', kind: 'segment', startId: 'a', endId: 'b', color: '#286fc0', visible: true }
    const vertical: GeometryPath = { id: 'v', kind: 'segment', startId: 'c', endId: 'd', color: '#286fc0', visible: true }
    const coordinates = intersectGeometryPaths(horizontal, vertical, new Map(points.map((point) => [point.id, point])))
    expect(coordinates).toEqual({ x: 0, y: 0 })
    const outside: GeometryPath = { ...vertical, kind: 'ray', startId: 'd', endId: 'e' }
    expect(intersectGeometryPaths(horizontal, outside, new Map(points.map((point) => [point.id, point])))).toBeNull()
    const intersection: GeometryPoint = { id: 'i', kind: 'point', x: 0, y: 0, color: '#df7752', label: 'I', visible: true, intersectionOf: ['h', 'v'] }
    expect(geometryIsConsistent([...points, horizontal, vertical, intersection])).toBe(true)
  })

  it('validates a locus that depends on a moving point and rotation center', () => {
    const moving: GeometryPoint = { id: 'moving', kind: 'point', x: 2, y: 0, color: '#286fc0', label: 'A', visible: true }
    const center: GeometryPoint = { id: 'center', kind: 'point', x: 0, y: 0, color: '#286fc0', label: 'B', visible: true }
    const locus: GeometryLocus = { id: 'locus', kind: 'locus', pointId: moving.id, centerId: center.id, color: '#df7752', visible: true }
    expect(isGeometryObject(locus)).toBe(true)
    expect(geometryIsConsistent([moving, center, locus])).toBe(true)
  })

  it('resolves transformed polygons so their measurements can stay linked', () => {
    const points: GeometryPoint[] = [
      { id: 'a', kind: 'point', x: 0, y: 0, color: '#286fc0', label: 'A', visible: true },
      { id: 'b', kind: 'point', x: 2, y: 0, color: '#286fc0', label: 'B', visible: true },
      { id: 'c', kind: 'point', x: 0, y: 2, color: '#286fc0', label: 'C', visible: true },
    ]
    const polygon = { id: 'p', kind: 'polygon' as const, pointIds: ['a', 'b', 'c'], color: '#286fc0', visible: true }
    const transform = { id: 't', kind: 'transform' as const, sourceId: 'p', sourceKind: 'polygon' as const, operation: 'translate' as const, dx: 3, dy: 1, centerX: 0, centerY: 0, angleDegrees: 0, scale: 1, radius: 1, color: '#0c9cb5', visible: true }
    const measurement = { id: 'm', kind: 'measurement' as const, measure: 'area' as const, polygonId: 't', color: '#df7752', visible: true }
    expect(geometryIsConsistent([...points, polygon, transform, measurement])).toBe(true)
    expect(resolveGeometryPoints([...points, polygon, transform], 't').map(({ x, y }) => [x, y])).toEqual([[3, 1], [5, 1], [3, 3]])
  })

  it('samples the envelope of a parametrized line family', () => {
    const envelope: GeometryEnvelope = { id: 'env', kind: 'envelope', slopeExpression: 't', interceptExpression: '-t^2/2', start: -2, end: 2, color: '#805fc2', visible: true }
    const samples = sampleLineEnvelope(envelope, 40).filter((point) => Number.isFinite(point.x))
    expect(samples.length).toBeGreaterThan(30)
    for (const point of samples) expect(point.y).toBeCloseTo(point.x ** 2 / 2, 6)
  })
})
