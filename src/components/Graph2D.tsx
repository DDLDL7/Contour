import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { PointCoordinates } from './PointCoordinates'
import { Circle, CircleDot, Crosshair, DraftingCompass, Ellipse, Link, Move, MousePointer2, Orbit, Pentagon, Ruler, Triangle, Waves } from 'lucide-react'
import { estimateCurveDiagnostics, estimateSlope, findCurveExtrema, findCurveInflections, findCurveIntersections, findCurveRoots } from '../lib/analysis'
import { contourSegments, sampleScalarGrid, type ScalarGrid } from '../lib/contours'
import { evaluatePlanarPoint, formatNumber, type PlottableGraph } from '../lib/math'
import { fitConic, sampleCurveLocus, removeGeometryObjects, projectPointToPath, intersectGeometryPaths, resolveGeometryPoints as resolveGeometryPointObjects, sampleLineEnvelope, type GeometryCircle, type GeometryConic, type GeometryEllipse, type GeometryEnvelope, type GeometryLocus, type GeometryObject, type GeometryPath, type GeometryPoint, type GeometryTool, type GeometryTransform, type TransformOperation } from '../lib/geometry'

interface Viewport {
  centerX: number
  centerY: number
  scale: number
}

interface Props {
  graphs: PlottableGraph[]
  geometry: GeometryObject[]
  onGeometryChange: (geometry: GeometryObject[]) => void
  parameterA: number
  canvasRef: RefObject<HTMLCanvasElement | null>
  darkMode: boolean
  linkedValues: Readonly<Record<string, number>>
}

interface AnalysisFeature {
  kind: 'root' | 'y-intercept' | 'minimum' | 'maximum' | 'inflection' | 'intersection'
  x: number
  y: number
  graphId: string
  color: string
  label: string
}

const initialViewport: Viewport = { centerX: 0, centerY: 0, scale: 52 }
const minScale = 0.05
const maxScale = 320
const buttonZoomFactor = 1.6

function ConstructionGlyph({ kind }: { kind: 'line' | 'segment' | 'ray' | 'vector' | 'perimeter' | 'area' }) {
  if (kind === 'perimeter' || kind === 'area') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="1" fill={kind === 'area' ? 'currentColor' : 'none'} fillOpacity={kind === 'area' ? '.22' : undefined} strokeDasharray={kind === 'perimeter' ? '3 2' : undefined} />
  </svg>
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12h16" />
    {kind === 'line' && <><path d="m7 9-3 3 3 3" /><path d="m17 9 3 3-3 3" /></>}
    {kind === 'segment' && <><circle cx="4" cy="12" r="1.7" fill="currentColor" /><circle cx="20" cy="12" r="1.7" fill="currentColor" /></>}
    {kind === 'ray' && <><circle cx="4" cy="12" r="1.7" fill="currentColor" /><path d="m17 9 3 3-3 3" /></>}
    {kind === 'vector' && <path d="m17 9 3 3-3 3" />}
  </svg>
}

function gridStep(scale: number): number {
  const target = 82 / scale
  const power = 10 ** Math.floor(Math.log10(target))
  for (const multiplier of [1, 2, 5, 10]) {
    if (multiplier * power >= target) return multiplier * power
  }
  return 10 * power
}

function piTick(value: number): string {
  const units = value / Math.PI
  for (const denominator of [1, 2, 4, 5, 10]) {
    const numerator = Math.round(units * denominator)
    if (Math.abs(units - numerator / denominator) < 0.001) {
      if (denominator === 1) return numerator === 1 ? 'π' : numerator === -1 ? '−π' : `${numerator}π`
      return `${numerator < 0 ? '−' : ''}${Math.abs(numerator) === 1 ? '' : Math.abs(numerator)}π/${denominator}`
    }
  }
  return `${formatNumber(units, 2)}π`
}

function drawInequalityShade(ctx: CanvasRenderingContext2D, grid: ScalarGrid, color: string, relation?: string): void {
  const shadeCanvas = document.createElement('canvas')
  shadeCanvas.width = grid.columns
  shadeCanvas.height = grid.rows
  const shade = shadeCanvas.getContext('2d')
  if (!shade) return
  const image = shade.createImageData(grid.columns, grid.rows)
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? '286fc0'
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const stride = grid.columns + 1

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const values = [
        grid.values[row * stride + column],
        grid.values[row * stride + column + 1],
        grid.values[(row + 1) * stride + column],
        grid.values[(row + 1) * stride + column + 1],
      ]
      if (!values.every(Number.isFinite)) continue
      const midpoint = (values[0] + values[1] + values[2] + values[3]) / 4
      const inside = relation === '<' ? midpoint < 0 : relation === '<=' ? midpoint <= 0
        : relation === '>' ? midpoint > 0 : midpoint >= 0
      if (!inside) continue
      const index = (row * grid.columns + column) * 4
      image.data[index] = red
      image.data[index + 1] = green
      image.data[index + 2] = blue
      image.data[index + 3] = 35
    }
  }

  shade.putImageData(image, 0, 0)
  ctx.drawImage(shadeCanvas, 0, 0, grid.width, grid.height)
}

export function Graph2D({ graphs, geometry, onGeometryChange, parameterA, canvasRef, darkMode, linkedValues }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: 'pan'; x: number; y: number; viewport: Viewport } | { kind: 'point'; id: string; x: number; y: number } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState(initialViewport)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisCurveId, setAnalysisCurveId] = useState('')
  const [analysisBounds, setAnalysisBounds] = useState({ from: '-2', to: '2' })
  const [piAxis, setPiAxis] = useState(false)
  const [trace, setTrace] = useState<{ graphId: string; x: number } | null>(null)
  const [geometryTool, setGeometryTool] = useState<GeometryTool>('select')
  const [pendingVertices, setPendingVertices] = useState<{ id: string; point: GeometryPoint; isNew: boolean }[]>([])
  const [previewPoint, setPreviewPoint] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedGeometryId, setSelectedGeometryId] = useState<string | null>(null)
  const [linkedXCell, setLinkedXCell] = useState('A2')
  const [linkedYCell, setLinkedYCell] = useState('B2')
  const [locusInput,setLocusInput] = useState({x:'t',y:'t^2',start:'-3',end:'3'})
  const [constructionError,setConstructionError] = useState('')
  const [envelopeInput, setEnvelopeInput] = useState({ slope: 't', intercept: '-t^2/2', start: '-4', end: '4' })
  const [transformOperation, setTransformOperation] = useState<TransformOperation>('translate')
  const [reflectionLineId, setReflectionLineId] = useState('')
  const [matrixInput,setMatrixInput]=useState('1, 0; 0, 1')
  const [transformValues, setTransformValues] = useState({ dx: '1', dy: '0', centerX: '0', centerY: '0', angleDegrees: '90', scale: '2', radius: '2' })

  const visibleGeometry = useMemo(() => {
    const points = new Map(geometry.filter((object): object is GeometryPoint => object.kind === 'point').map((point) => [point.id, point]))
    const paths = new Map(geometry.filter((object): object is GeometryPath => ['line', 'ray', 'segment', 'vector'].includes(object.kind)).map((path) => [path.id, path]))
    const resolve = (id: string, seen = new Set<string>()): GeometryPoint | null => {
      const point = points.get(id)
      if (!point || seen.has(id)) return null
      seen.add(id)
      if (point.id === previewPoint?.id) return { ...point, x: previewPoint.x, y: previewPoint.y }
      if (point.xCell && point.yCell) return { ...point, x: linkedValues[point.xCell] ?? Number.NaN, y: linkedValues[point.yCell] ?? Number.NaN }
      if (point.onPath) {
        const path = paths.get(point.onPath.pathId)
        const start = path && resolve(path.startId, new Set(seen)); const end = path && resolve(path.endId, new Set(seen))
        if (!start || !end) return { ...point, x: Number.NaN, y: Number.NaN }
        return { ...point, x: start.x + point.onPath.t*(end.x-start.x), y: start.y + point.onPath.t*(end.y-start.y) }
      }
      if (point.intersectionOf) {
        const [firstPath, secondPath] = point.intersectionOf.map((pathId) => paths.get(pathId))
        if (!firstPath || !secondPath) return { ...point, x: Number.NaN, y: Number.NaN }
        const endpoints = [firstPath.startId, firstPath.endId, secondPath.startId, secondPath.endId].map((pointId) => resolve(pointId, new Set(seen)))
        if (endpoints.some((item) => !item)) return { ...point, x: Number.NaN, y: Number.NaN }
        const coordinates = intersectGeometryPaths(firstPath, secondPath, new Map(endpoints.map((item) => [item!.id, item!])))
        return coordinates ? { ...point, ...coordinates } : { ...point, x: Number.NaN, y: Number.NaN }
      }
      return point
    }
    return geometry.map((object) => object.kind === 'point' ? resolve(object.id) ?? { ...object, x: Number.NaN, y: Number.NaN } : object)
  }, [geometry, linkedValues, previewPoint])

  const analysis = useMemo(() => {
    if (!analysisOpen || size.width === 0 || size.height === 0) return { features: [] as AnalysisFeature[], omittedGraphs: 0, curveCount: 0 }
    const allCurves = graphs.filter((item) => item.visible && item.graph.kind === 'curve')
    const curves = allCurves.slice(0, 8)
    const minX = viewport.centerX - size.width / (2 * viewport.scale)
    const maxX = viewport.centerX + size.width / (2 * viewport.scale)
    const minY = viewport.centerY - size.height / (2 * viewport.scale)
    const maxY = viewport.centerY + size.height / (2 * viewport.scale)
    const features: AnalysisFeature[] = []
    const add = (kind: AnalysisFeature['kind'], x: number, y: number, graphId: string, color: string, label: string) => {
      if (Number.isFinite(y) && y >= minY && y <= maxY && features.length < 200) {
        features.push({ kind, x, y, graphId, color, label })
      }
    }

    curves.forEach((item, index) => {
      const label = `Graph ${graphs.indexOf(item) + 1}`
      for (const point of findCurveRoots(item.graph, parameterA, minX, maxX)) {
        add('root', point.x, point.y, item.id, item.color, label)
      }
      for (const point of findCurveExtrema(item.graph, parameterA, minX, maxX)) {
        add(point.kind, point.x, point.y, item.id, item.color, label)
      }
      for (const point of findCurveInflections(item.graph, parameterA, minX, maxX)) {
        add(point.kind, point.x, point.y, item.id, item.color, label)
      }
      if (minX <= 0 && maxX >= 0) {
        const y = item.graph.evaluate(0, 0, parameterA)
        add('y-intercept', 0, y, item.id, item.color, label)
      }
      for (const other of curves.slice(index + 1)) {
        for (const point of findCurveIntersections(item.graph, other.graph, parameterA, minX, maxX)) {
          add('intersection', point.x, point.y, item.id, item.color, `${label} & ${graphs.indexOf(other) + 1}`)
        }
      }
    })
    return { features: features.sort((first, second) => first.x - second.x), omittedGraphs: allCurves.length - curves.length, curveCount: allCurves.length }
  }, [analysisOpen, graphs, parameterA, size, viewport])

  const tracedGraph = graphs.find((item) => item.id === trace?.graphId && item.visible && item.graph.kind === 'curve')
  const visibleCurves = graphs.filter((item) => item.visible && item.graph.kind === 'curve')
  const selectedAnalysisCurve = visibleCurves.find((item) => item.id === analysisCurveId) ?? visibleCurves[0]
  const analysisFrom = Number(analysisBounds.from)
  const analysisTo = Number(analysisBounds.to)
  const curveDiagnostics = useMemo(() => selectedAnalysisCurve && analysisBounds.from.trim() && analysisBounds.to.trim()
    ? estimateCurveDiagnostics(selectedAnalysisCurve.graph, parameterA, analysisFrom, analysisTo, trace?.graphId === selectedAnalysisCurve.id ? trace.x : (analysisFrom + analysisTo) / 2)
    : null, [analysisBounds, analysisFrom, analysisTo, parameterA, selectedAnalysisCurve, trace])
  const tracedY = tracedGraph && trace ? tracedGraph.graph.evaluate(trace.x, 0, parameterA) : Number.NaN
  const tracedSlope = tracedGraph && trace ? estimateSlope(tracedGraph.graph, parameterA, trace.x) : Number.NaN

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { width, height } = size
    const { centerX, centerY, scale } = viewport
    const sx = (x: number) => width / 2 + (x - centerX) * scale
    const sy = (y: number) => height / 2 - (y - centerY) * scale
    const worldX = (pixel: number) => centerX + (pixel - width / 2) / scale
    const worldY = (pixel: number) => centerY - (pixel - height / 2) / scale

    const palette = darkMode
      ? { background: '#0c0e11', grid: '#242830', axes: '#77848e', labels: '#a3adb5', point: '#171c20' }
      : { background: '#ffffff', grid: '#e8edf3', axes: '#9aa9b9', labels: '#77899a', point: '#ffffff' }
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, width, height)

    const scalarGrids = new Map<string, ScalarGrid>()
    for (const item of graphs) {
      if (!item.visible || (item.graph.kind !== 'implicit' && item.graph.kind !== 'inequality')) continue
      const grid = sampleScalarGrid(
        (x, y) => item.graph.evaluate(x, y, parameterA),
        width, height, worldX, worldY,
      )
      scalarGrids.set(item.id, grid)
      if (item.graph.kind === 'inequality') drawInequalityShade(ctx, grid, item.color, item.graph.relation)
    }

    const step = gridStep(scale)
    const xStep = piAxis ? gridStep(scale * Math.PI) * Math.PI : step
    const xMin = worldX(0)
    const xMax = worldX(width)
    const yMin = worldY(height)
    const yMax = worldY(0)
    ctx.strokeStyle = palette.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const px = Math.round(sx(x)) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, height)
    }
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
      const py = Math.round(sy(y)) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(width, py)
    }
    ctx.stroke()

    ctx.strokeStyle = palette.axes
    ctx.lineWidth = 1.3
    ctx.beginPath()
    if (xMin <= 0 && xMax >= 0) {
      ctx.moveTo(sx(0), 0)
      ctx.lineTo(sx(0), height)
    }
    if (yMin <= 0 && yMax >= 0) {
      ctx.moveTo(0, sy(0))
      ctx.lineTo(width, sy(0))
    }
    ctx.stroke()

    ctx.fillStyle = palette.labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      if (Math.abs(x) < xStep / 100) continue
      ctx.fillText(piAxis ? piTick(x) : formatNumber(x, 4), sx(x) + 5, Math.min(height - 7, Math.max(16, sy(0) + 15)))
    }
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
      if (Math.abs(y) < step / 100) continue
      ctx.fillText(formatNumber(y, 4), Math.min(width - 35, Math.max(7, sx(0) + 7)), sy(y) - 6)
    }

    for (const item of graphs) {
      if (!item.visible || ['surface', 'spaceCurve', 'parametricSurface', 'implicitSurface'].includes(item.graph.kind)) continue
      ctx.strokeStyle = item.color
      ctx.lineWidth = 2.7
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()


      if (item.graph.kind === 'implicit' || item.graph.kind === 'inequality') {
        const grid = scalarGrids.get(item.id)
        if (grid) {
          if (item.graph.kind === 'inequality' && (item.graph.relation === '<' || item.graph.relation === '>')) {
            ctx.setLineDash([7, 5])
          }
          for (const [x0, y0, x1, y1] of contourSegments(grid)) {
            ctx.moveTo(x0, y0)
            ctx.lineTo(x1, y1)
          }
        }
      } else if (item.graph.kind === 'vertical') {
        const x = item.graph.evaluate(0, 0, parameterA)
        if (Number.isFinite(x)) {
          ctx.moveTo(sx(x), 0)
          ctx.lineTo(sx(x), height)
        }
      } else if (item.graph.kind === 'polar' || item.graph.kind === 'parametric') {
        const samples = 1600
        let previousX = Number.NaN
        let previousY = Number.NaN
        for (let index = 0; index <= samples; index += 1) {
          const parameter = index / samples * Math.PI * 2
          const [graphX, graphY] = evaluatePlanarPoint(item.graph, parameter, parameterA)
          const px = sx(graphX)
          const py = sy(graphY)
          if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(px) > 1e7 || Math.abs(py) > 1e7) {
            previousX = Number.NaN
            previousY = Number.NaN
            continue
          }
          if (Number.isFinite(previousX) && Math.hypot(px - previousX, py - previousY) < Math.max(width, height) * 0.75) {
            ctx.lineTo(px, py)
          } else {
            ctx.moveTo(px, py)
          }
          previousX = px
          previousY = py
        }
      } else {
        let previousY = Number.NaN
        for (let px = 0; px <= width + 2; px += 2) {
          const y = item.graph.evaluate(worldX(px), 0, parameterA)
          const py = sy(y)
          if (
            Number.isFinite(y) &&
            Number.isFinite(py) &&
            Number.isFinite(previousY) &&
            Math.abs(py - previousY) < height * 0.75
          ) {
            ctx.lineTo(px, py)
          } else if (Number.isFinite(py)) {
            ctx.moveTo(px, py)
          }
          previousY = Number.isFinite(py) ? py : Number.NaN
        }
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    const geometryPoints = new Map(visibleGeometry.filter((item): item is GeometryPoint => item.kind === 'point').map((point) => [point.id, point]))
    const resolveGeometryPoints = (id: string): GeometryPoint[] => resolveGeometryPointObjects(visibleGeometry, id)
    for (const object of visibleGeometry) {
      if (!object.visible || object.kind === 'point' || object.kind === 'measurement') continue
      ctx.strokeStyle = object.color
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      if (object.kind === 'tangent') {
        const graph = graphs.find(item => item.id === object.expressionId && item.visible && item.graph.kind === 'curve')
        if (!graph) continue
        const y = graph.graph.evaluate(object.x, 0, parameterA)
        const slope = estimateSlope(graph.graph, parameterA, object.x)
        if (!Number.isFinite(y) || !Number.isFinite(slope)) continue
        const left = viewport.centerX - size.width / (2 * viewport.scale)
        const right = viewport.centerX + size.width / (2 * viewport.scale)
        ctx.setLineDash([6, 4]); ctx.moveTo(sx(left), sy(y + slope * (left - object.x))); ctx.lineTo(sx(right), sy(y + slope * (right - object.x))); ctx.stroke(); ctx.setLineDash([])
        continue
      }
      if (object.kind === 'circle') {
        const center = geometryPoints.get(object.centerId); const radiusPoint = geometryPoints.get(object.radiusPointId)
        if (!center || !radiusPoint) continue
        const radius = Math.hypot(sx(radiusPoint.x) - sx(center.x), sy(radiusPoint.y) - sy(center.y))
        if (radius < 1) continue
        ctx.arc(sx(center.x), sy(center.y), radius, 0, Math.PI * 2)
        ctx.stroke()
        continue
      }
      if (object.kind === 'ellipse') {
        const center = geometryPoints.get(object.centerId); const axisX = geometryPoints.get(object.axisXId); const axisY = geometryPoints.get(object.axisYId)
        if (!center || !axisX || !axisY) continue
        const cx = sx(center.x); const cy = sy(center.y)
        const ax = { x: sx(axisX.x) - cx, y: sy(axisX.y) - cy }
        const by = { x: sx(axisY.x) - cx, y: sy(axisY.y) - cy }
        if (Math.hypot(ax.x, ax.y) < 1 || Math.hypot(by.x, by.y) < 1) continue
        for (let step = 0; step <= 120; step += 1) {
          const angle = step / 120 * Math.PI * 2
          const x = cx + ax.x * Math.cos(angle) + by.x * Math.sin(angle)
          const y = cy + ax.y * Math.cos(angle) + by.y * Math.sin(angle)
          if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
        continue
      }
      if (object.kind === 'conic') {
        const points = object.pointIds.map((id) => geometryPoints.get(id))
        if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue
        const coefficients = fitConic(points as GeometryPoint[])
        if (!coefficients) continue
        const [a, b, c, d, e, f] = coefficients
        const grid = sampleScalarGrid((x, y) => a * x * x + b * x * y + c * y * y + d * x + e * y + f, width, height, worldX, worldY)
        for (const [x1, y1, x2, y2] of contourSegments(grid)) {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        }
        continue
      }
      if (object.kind === 'curve-locus') {
        try {
          let previous: {x:number;y:number} | null=null
          for (const point of sampleCurveLocus(object,{...linkedValues,a:parameterA})) {
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {previous=null;continue}
            if (previous && Math.hypot(sx(point.x)-sx(previous.x),sy(point.y)-sy(previous.y))<80) {
              ctx.beginPath();ctx.moveTo(sx(previous.x),sy(previous.y));ctx.lineTo(sx(point.x),sy(point.y));ctx.stroke()
            }
            previous=point
          }
        } catch { /* A linked variable may temporarily be invalid. */ }
        continue
      }
      if (object.kind === 'locus') {
        const moving = geometryPoints.get(object.pointId); const center = geometryPoints.get(object.centerId)
        if (!moving || !center) continue
        const radius = Math.hypot(sx(moving.x) - sx(center.x), sy(moving.y) - sy(center.y))
        if (radius < 1) continue
        for (let step = 0; step <= 120; step += 1) {
          const angle = step / 120 * Math.PI * 2
          const x = sx(center.x) + radius * Math.cos(angle)
          const y = sy(center.y) + radius * Math.sin(angle)
          if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
        continue
      }
      if (object.kind === 'envelope') {
        try {
          ctx.setLineDash([5, 4])
          let previous: { x: number; y: number } | null = null
          for (const point of sampleLineEnvelope(object)) {
            if (![point.x, point.y].every(Number.isFinite)) { previous = null; continue }
            if (previous && Math.hypot(sx(point.x) - sx(previous.x), sy(point.y) - sy(previous.y)) < 40) {
              ctx.beginPath(); ctx.moveTo(sx(previous.x), sy(previous.y)); ctx.lineTo(sx(point.x), sy(point.y)); ctx.stroke()
            }
            previous = point
          }
          ctx.setLineDash([])
        } catch { ctx.setLineDash([]) }
        continue
      }
      if (object.kind === 'polygon' || object.kind === 'transform') {
        const vertices = object.kind === 'polygon' ? object.pointIds.map((id) => geometryPoints.get(id)).filter((point): point is GeometryPoint => Boolean(point)) : resolveGeometryPoints(object.id)
        if (object.kind === 'transform' && object.sourceKind !== 'polygon') {
          if (vertices.length < 2 || vertices.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue
          const [start, end] = vertices
          const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy)
          if (length < 1e-10) continue
          const extent = (width + height) / scale; const ux = dx / length; const uy = dy / length
          const from = object.sourceKind === 'line' ? { x: start.x - ux * extent, y: start.y - uy * extent } : start
          const to = object.sourceKind === 'line' || object.sourceKind === 'ray' ? { x: start.x + ux * extent, y: start.y + uy * extent } : end
          ctx.moveTo(sx(from.x), sy(from.y)); ctx.lineTo(sx(to.x), sy(to.y)); ctx.stroke()
          continue
        }
        if (vertices.length < 3) continue
        if (vertices.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue
        ctx.moveTo(sx(vertices[0].x), sy(vertices[0].y))
        vertices.slice(1).forEach((point) => ctx.lineTo(sx(point.x), sy(point.y)))
        ctx.closePath()
        ctx.save()
        ctx.globalAlpha = 0.13
        ctx.fillStyle = object.color
        ctx.fill()
        ctx.restore()
        ctx.stroke()
        continue
      }
      const path = object as GeometryPath
      const start = geometryPoints.get(path.startId)
      const end = geometryPoints.get(path.endId)
      if (!start || !end) continue
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.hypot(dx, dy)
      if (length < 1e-10) continue
      const unitX = dx / length
      const unitY = dy / length
      const extent = (width + height) / scale
      const from = object.kind === 'line' ? { x: start.x - unitX * extent, y: start.y - unitY * extent } : start
      const to = object.kind === 'line' || object.kind === 'ray'
        ? { x: start.x + unitX * extent, y: start.y + unitY * extent }
        : end
      ctx.moveTo(sx(from.x), sy(from.y))
      ctx.lineTo(sx(to.x), sy(to.y))
      ctx.stroke()
      if (object.kind === 'vector') {
        const tipX = sx(end.x)
        const tipY = sy(end.y)
        const angle = Math.atan2(tipY - sy(start.y), tipX - sx(start.x))
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - 11 * Math.cos(angle - Math.PI / 6), tipY - 11 * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - 11 * Math.cos(angle + Math.PI / 6), tipY - 11 * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      }
    }

    for (const object of visibleGeometry) {
      if (object.kind !== 'transform' || !object.visible || object.sourceKind !== 'point') continue
      const point = resolveGeometryPoints(object.id)[0]
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
      const x = sx(point.x); const y = sy(point.y)
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = object.color; ctx.fill()
      ctx.strokeStyle = palette.background; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = palette.labels; ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillText(point.label, x + 7, y - 7)
    }

    for (const point of geometryPoints.values()) {
      if (!point.visible) continue
      const x = sx(point.x)
      const y = sy(point.y)
      const selected = point.id === selectedPointId
      ctx.beginPath()
      ctx.arc(x, y, selected ? 6 : 4.5, 0, Math.PI * 2)
      ctx.fillStyle = selected ? '#df7752' : point.color
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = palette.background
      ctx.stroke()
      ctx.fillStyle = palette.labels
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText(point.label, x + 7, y - 7)
    }

    for (const measurement of visibleGeometry) {
      if (measurement.kind !== 'measurement' || !measurement.visible) continue
      let label = ''
      let anchor: { x: number; y: number } | null = null
      if (measurement.measure === 'distance' || measurement.measure === 'angle') {
        const points = measurement.pointIds!.map((id) => geometryPoints.get(id))
        if (points.some((point) => !point?.visible)) continue
        const [first, second, third] = points as GeometryPoint[]
        if (measurement.measure === 'distance') {
          const length = Math.hypot(second.x - first.x, second.y - first.y)
          label = `d(${first.label}, ${second.label}) = ${formatNumber(length, 2)}`
          anchor = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
        } else {
          const firstVector = { x: first.x - second.x, y: first.y - second.y }
          const secondVector = { x: third.x - second.x, y: third.y - second.y }
          const product = Math.hypot(firstVector.x, firstVector.y) * Math.hypot(secondVector.x, secondVector.y)
          if (product === 0) continue
          const cosine = Math.max(-1, Math.min(1, (firstVector.x * secondVector.x + firstVector.y * secondVector.y) / product))
          const degrees = Math.acos(cosine) * 180 / Math.PI
          label = `∠${first.label}${second.label}${third.label} = ${formatNumber(degrees, 1)}°`
          anchor = { x: second.x, y: second.y }
        }
      } else {
        const polygon = visibleGeometry.find((object) => object.id === measurement.polygonId && (object.kind === 'polygon' || object.kind === 'transform' && object.sourceKind === 'polygon'))
        if (!polygon || !polygon.visible) continue
        const points = polygon.kind === 'polygon'
          ? polygon.pointIds.map((id) => geometryPoints.get(id)).filter((point): point is GeometryPoint => Boolean(point?.visible))
          : resolveGeometryPoints(polygon.id)
        if (points.length < 3) continue
        const perimeter = points.reduce((sum, point, index) => {
          const next = points[(index + 1) % points.length]
          return sum + Math.hypot(next.x - point.x, next.y - point.y)
        }, 0)
        const doubledArea = points.reduce((sum, point, index) => {
          const next = points[(index + 1) % points.length]
          return sum + point.x * next.y - next.x * point.y
        }, 0)
        const area = Math.abs(doubledArea) / 2
        label = measurement.measure === 'perimeter' ? `Perimeter = ${formatNumber(perimeter, 2)}` : `Area = ${formatNumber(area, 2)}`
        anchor = points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 })
      }
      if (!anchor) continue
      const textX = sx(anchor.x) + 9
      const textY = sy(anchor.y) - 9
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = palette.background
      ctx.fillRect(textX - 4, textY - 13, textWidth + 8, 19)
      ctx.strokeStyle = measurement.color
      ctx.lineWidth = 1
      ctx.strokeRect(textX - 4, textY - 13, textWidth + 8, 19)
      ctx.fillStyle = palette.labels
      ctx.fillText(label, textX, textY)
    }

    if (pendingVertices.length > 0 && geometryTool !== 'select') {
      const draft = pendingVertices.map((vertex) => vertex.point)
      ctx.save()
      ctx.strokeStyle = '#df7752'
      ctx.fillStyle = '#df7752'
      ctx.lineWidth = 1.7
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      draft.forEach((point, index) => index === 0 ? ctx.moveTo(sx(point.x), sy(point.y)) : ctx.lineTo(sx(point.x), sy(point.y)))
      if (cursor) ctx.lineTo(sx(cursor.x), sy(cursor.y))
      if (geometryTool === 'polygon' && draft.length >= 3) ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])
      draft.forEach((point) => {
        ctx.beginPath()
        ctx.arc(sx(point.x), sy(point.y), 5, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.restore()
    }

    for (const feature of analysis.features) {
      const x = sx(feature.x)
      const y = sy(feature.y)
      if (x < 0 || x > width || y < 0 || y > height) continue
      ctx.beginPath()
      ctx.arc(x, y, feature.kind === 'intersection' ? 5.5 : 4.5, 0, Math.PI * 2)
      ctx.fillStyle = palette.point
      ctx.fill()
      ctx.lineWidth = 2.4
      ctx.strokeStyle = feature.color
      ctx.stroke()
    }

    if (trace && tracedGraph && Number.isFinite(tracedY)) {
      const x = sx(trace.x)
      const y = sy(tracedY)
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        ctx.save()
        ctx.strokeStyle = tracedGraph.color
        ctx.lineWidth = 1.3
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
        if (Number.isFinite(tracedSlope)) {
          ctx.beginPath()
          ctx.moveTo(x - 90, y + tracedSlope * 90)
          ctx.lineTo(x + 90, y - tracedSlope * 90)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fillStyle = palette.point
        ctx.fill()
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [analysis.features, canvasRef, cursor, darkMode, geometryTool, graphs, parameterA, pendingVertices, piAxis, selectedPointId, size, trace, tracedGraph, tracedSlope, tracedY, viewport, visibleGeometry])

  function updateCursor(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setCursor({
      x: viewport.centerX + (clientX - rect.left - rect.width / 2) / viewport.scale,
      y: viewport.centerY - (clientY - rect.top - rect.height / 2) / viewport.scale,
    })
  }

  function selectTrace(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = viewport.centerX + (clientX - rect.left - rect.width / 2) / viewport.scale
    const pointerY = clientY - rect.top
    let nearest: { graphId: string; distance: number } | null = null
    for (const item of graphs) {
      if (!item.visible || item.graph.kind !== 'curve') continue
      const y = item.graph.evaluate(x, 0, parameterA)
      if (!Number.isFinite(y)) continue
      const pixelY = rect.height / 2 - (y - viewport.centerY) * viewport.scale
      const distance = Math.abs(pixelY - pointerY)
      if (!nearest || distance < nearest.distance) nearest = { graphId: item.id, distance }
    }
    setTrace(nearest && nearest.distance <= 22 ? { graphId: nearest.graphId, x } : null)
  }

  function worldPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: viewport.centerX + (clientX - rect.left - rect.width / 2) / viewport.scale,
      y: viewport.centerY - (clientY - rect.top - rect.height / 2) / viewport.scale,
    }
  }

  function hitPoint(clientX: number, clientY: number): GeometryPoint | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    let nearest: { point: GeometryPoint; distance: number } | null = null
    for (const object of visibleGeometry) {
      if (object.kind !== 'point' || !object.visible) continue
      const point = object
      const px = rect.width / 2 + (point.x - viewport.centerX) * viewport.scale
      const py = rect.height / 2 - (point.y - viewport.centerY) * viewport.scale
      const distance = Math.hypot(px - (clientX - rect.left), py - (clientY - rect.top))
      if (distance <= 12 && (!nearest || distance < nearest.distance)) nearest = { point, distance }
    }
    return nearest?.point ?? null
  }

  function hitPathIntersection(clientX: number, clientY: number): GeometryPoint | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const points = new Map(visibleGeometry.filter((object): object is GeometryPoint => object.kind === 'point').map((point) => [point.id, point]))
    const paths = visibleGeometry.filter((object): object is GeometryPath => ['line', 'ray', 'segment', 'vector'].includes(object.kind) && object.visible)
    let closest: { point: GeometryPoint; distance: number } | null = null
    for (let first = 0; first < paths.length; first += 1) for (let second = first + 1; second < paths.length; second += 1) {
      const coordinates = intersectGeometryPaths(paths[first], paths[second], points)
      if (!coordinates) continue
      const px = rect.width / 2 + (coordinates.x - viewport.centerX) * viewport.scale
      const py = rect.height / 2 - (coordinates.y - viewport.centerY) * viewport.scale
      const distance = Math.hypot(px - (clientX - rect.left), py - (clientY - rect.top))
      if (distance > 12 || closest && distance >= closest.distance) continue
      closest = { distance, point: { id: crypto.randomUUID(), kind: 'point', ...coordinates, color: '#df7752', label: 'I', visible: true, intersectionOf: [paths[first].id, paths[second].id] } }
    }
    return closest?.point ?? null
  }

  function hitPolygon(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    for (const polygon of [...geometry].reverse()) {
      if (!polygon.visible || !(polygon.kind === 'polygon' || polygon.kind === 'transform' && polygon.sourceKind === 'polygon')) continue
      const vertices = polygon.kind === 'polygon'
        ? polygon.pointIds.map((id) => visibleGeometry.find((item): item is GeometryPoint => item.kind === 'point' && item.id === id)).filter((point): point is GeometryPoint => Boolean(point?.visible))
        : resolveGeometryPointObjects(visibleGeometry, polygon.id)
      let inside = false
      for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index, index += 1) {
        const currentPoint = vertices[index]
        const previousPoint = vertices[previous]
        const currentX = rect.width / 2 + (currentPoint.x - viewport.centerX) * viewport.scale
        const currentY = rect.height / 2 - (currentPoint.y - viewport.centerY) * viewport.scale
        const previousX = rect.width / 2 + (previousPoint.x - viewport.centerX) * viewport.scale
        const previousY = rect.height / 2 - (previousPoint.y - viewport.centerY) * viewport.scale
        if ((currentY > localY) !== (previousY > localY) && localX < (previousX - currentX) * (localY - currentY) / (previousY - currentY) + currentX) inside = !inside
      }
      if (inside) return polygon
    }
    return null
  }

  function hitTransformTarget(clientX: number, clientY: number): GeometryObject | null {
    const point = hitPoint(clientX, clientY)
    if (point) return point
    const polygon = hitPolygon(clientX, clientY)
    if (polygon) return polygon
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const px = clientX - rect.left; const py = clientY - rect.top
    for (const path of [...geometry].reverse()) {
      if (!['line', 'segment', 'ray', 'vector'].includes(path.kind) || !path.visible) continue
      const pathObject = path as GeometryPath
      const points = new Map(geometry.filter((item): item is GeometryPoint => item.kind === 'point').map((item) => [item.id, item]))
      const start = points.get(pathObject.startId); const end = points.get(pathObject.endId)
      if (!start || !end) continue
      const ax = rect.width / 2 + (start.x - viewport.centerX) * viewport.scale
      const ay = rect.height / 2 - (start.y - viewport.centerY) * viewport.scale
      const bx = rect.width / 2 + (end.x - viewport.centerX) * viewport.scale
      const by = rect.height / 2 - (end.y - viewport.centerY) * viewport.scale
      const vx = bx - ax; const vy = by - ay; const length2 = vx * vx + vy * vy
      let t = length2 ? ((px - ax) * vx + (py - ay) * vy) / length2 : 0
      if (pathObject.kind === 'segment' || pathObject.kind === 'vector') t = Math.max(0, Math.min(1, t))
      else if (pathObject.kind === 'ray') t = Math.max(0, t)
      const distance = Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
      if (distance < 9) return pathObject
    }
    return null
  }

  function createTransform() {
    const source = geometry.find((object) => object.id === selectedGeometryId)
    if (!source || source.kind === 'curve-locus' || source.kind === 'tangent' || source.kind === 'measurement' || source.kind === 'circle' || source.kind === 'ellipse' || source.kind === 'conic' || source.kind === 'locus' || source.kind === 'envelope') return
    const sourceKind = source.kind === 'transform' ? source.sourceKind : source.kind
    const values = Object.fromEntries(Object.entries(transformValues).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof transformValues, number>
    if (Object.values(values).some((value) => !Number.isFinite(value))) return
    if (transformOperation === 'reflect-line' && !reflectionLineId) return
    const matrix=matrixInput.split(/[;,]/).map(value=>Number(value.trim()))
    if (transformOperation==='matrix' && (matrix.length!==4 || matrixInput.split(/[;,]/).some(value=>!value.trim()) || !matrix.every(Number.isFinite))) { setConstructionError('Enter four finite matrix entries: a, b; c, d.'); return }
    const transformed: GeometryTransform = {
      id: crypto.randomUUID(), kind: 'transform', sourceId: source.id, sourceKind, operation: transformOperation,
      dx: values.dx, dy: values.dy, centerX: values.centerX, centerY: values.centerY,
      angleDegrees: values.angleDegrees, scale: values.scale, radius: values.radius,
      ...(transformOperation === 'reflect-line' ? { reflectionLineId } : {}),
      ...(transformOperation === 'matrix' ? {matrix:matrix as [number,number,number,number]} : {}),
      color: '#0c9cb5', visible: true,
    }
    onGeometryChange([...geometry, transformed])
    setSelectedGeometryId(transformed.id)
  }

  function createEnvelope() {
    const start = Number(envelopeInput.start); const end = Number(envelopeInput.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return
    try {
      const envelope: GeometryEnvelope = { id: crypto.randomUUID(), kind: 'envelope', slopeExpression: envelopeInput.slope, interceptExpression: envelopeInput.intercept, start, end, color: '#805fc2', visible: true }
      sampleLineEnvelope(envelope)
      onGeometryChange([...geometry, envelope])
      setGeometryTool('select')
    } catch { /* Leave invalid family expressions in the fields for correction. */ }
  }

  function nextPointLabel(offset = 0): string {
    const index = geometry.filter((object) => object.kind === 'point').length + offset
    return index < 26 ? String.fromCharCode(65 + index) : `A${index - 25}`
  }

  function createGeometryPoint(x: number, y: number, labelOffset = 0): GeometryPoint {
    const point: GeometryPoint = { id: crypto.randomUUID(), kind: 'point', x, y, color: '#286fc0', label: nextPointLabel(labelOffset), visible: true }
    if (geometryTool === 'linked-point') return point
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      const intersection = hitPathIntersection(rect.left+rect.width/2+(x-viewport.centerX)*viewport.scale, rect.top+rect.height/2-(y-viewport.centerY)*viewport.scale)
      if (intersection) return { ...intersection, label:point.label }
    }
    const points = new Map(visibleGeometry.filter((item): item is GeometryPoint => item.kind === 'point').map(item => [item.id,item]))
    let closest: { path: GeometryPath; projection: { x:number; y:number; t:number }; distance:number } | null = null
    for (const path of visibleGeometry) {
      if (!path.visible || !['line','segment','ray','vector'].includes(path.kind)) continue
      const projection=projectPointToPath(path as GeometryPath,points,x,y)
      if (!projection) continue
      const distance=Math.hypot(projection.x-x,projection.y-y)*viewport.scale
      if (distance<9 && (!closest || distance<closest.distance)) closest={path:path as GeometryPath,projection,distance}
    }
    return closest ? { ...point, x:closest.projection.x, y:closest.projection.y, onPath:{pathId:closest.path.id,t:closest.projection.t} } : point

  }

  function createAt(clientX: number, clientY: number) {
    if (geometryTool === 'envelope' || geometryTool === 'curve-locus') return
    if (geometryTool === 'transform') {
      const target = hitTransformTarget(clientX, clientY)
      setSelectedGeometryId(target?.id ?? null)
      setSelectedPointId(target?.kind === 'point' ? target.id : null)
      return
    }
    const position = worldPoint(clientX, clientY)
    if (!position) return
    if (geometryTool === 'point') {
      const snapped = hitPoint(clientX, clientY)
      if (snapped) { setSelectedPointId(snapped.id); return }
      const intersection = hitPathIntersection(clientX, clientY)
      if (intersection) { onGeometryChange([...geometry, intersection]); setSelectedPointId(intersection.id); return }
      onGeometryChange([...geometry, createGeometryPoint(position.x, position.y)])
      setSelectedPointId(null)
      return
    }
    if (geometryTool === 'linked-point') {
      const x = linkedValues[linkedXCell]; const y = linkedValues[linkedYCell]
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      onGeometryChange([...geometry, { ...createGeometryPoint(x, y), xCell: linkedXCell, yCell: linkedYCell }])
      return
    }

    if (geometryTool === 'circle') {
      const snapped = hitPoint(clientX, clientY)
      const point = snapped ?? createGeometryPoint(position.x, position.y, pendingVertices.filter((vertex) => vertex.isNew).length)
      const vertex = { id: point.id, point, isNew: !snapped }
      if (!pendingVertices.length) { setPendingVertices([vertex]); return }
      const center = pendingVertices[0]
      if (center.id === vertex.id) return
      const circle: GeometryCircle = { id: crypto.randomUUID(), kind: 'circle', centerId: center.id, radiusPointId: vertex.id, color: '#286fc0', visible: true }
      onGeometryChange([...geometry, ...(center.isNew ? [center.point] : []), ...(vertex.isNew ? [vertex.point] : []), circle])
      setPendingVertices([])
      return
    }
    if (geometryTool === 'ellipse') {
      const snapped = hitPoint(clientX, clientY)
      const point = snapped ?? createGeometryPoint(position.x, position.y, pendingVertices.filter((vertex) => vertex.isNew).length)
      const vertex = { id: point.id, point, isNew: !snapped }
      const next = [...pendingVertices, vertex]
      if (next.some((item, index) => next.findIndex((other) => other.id === item.id) !== index)) return
      if (next.length < 3) { setPendingVertices(next); return }
      const [center, axisX, axisY] = next
      const ellipse: GeometryEllipse = { id: crypto.randomUUID(), kind: 'ellipse', centerId: center.id, axisXId: axisX.id, axisYId: axisY.id, color: '#286fc0', visible: true }
      onGeometryChange([...geometry, ...next.filter((item) => item.isNew).map((item) => item.point), ellipse])
      setPendingVertices([])
      return
    }
    if (geometryTool === 'conic') {
      const snapped = hitPoint(clientX, clientY)
      const point = snapped ?? createGeometryPoint(position.x, position.y, pendingVertices.filter((vertex) => vertex.isNew).length)
      const vertex = { id: point.id, point, isNew: !snapped }
      const next = [...pendingVertices, vertex]
      if (next.some((item, index) => next.findIndex((other) => other.id === item.id) !== index)) return
      if (next.length < 5) { setPendingVertices(next); return }
      if (!fitConic(next.map((item) => item.point))) { setPendingVertices([]); return }
      const conic: GeometryConic = { id: crypto.randomUUID(), kind: 'conic', pointIds: next.map((item) => item.id), color: '#286fc0', visible: true }
      onGeometryChange([...geometry, ...next.filter((item) => item.isNew).map((item) => item.point), conic])
      setPendingVertices([])
      return
    }
    if (geometryTool === 'locus') {
      const point = hitPoint(clientX, clientY)
      if (!point || pendingVertices.some((vertex) => vertex.id === point.id)) return
      const next = [...pendingVertices, { id: point.id, point, isNew: false }]
      if (next.length < 2) { setPendingVertices(next); return }
      const locus: GeometryLocus = { id: crypto.randomUUID(), kind: 'locus', pointId: next[0].id, centerId: next[1].id, color: '#df7752', visible: true }
      onGeometryChange([...geometry, locus])
      setPendingVertices([])
      return
    }

    if (geometryTool === 'distance' || geometryTool === 'angle') {
      const point = hitPoint(clientX, clientY)
      if (!point || pendingVertices.some((vertex) => vertex.id === point.id)) return
      const next = [...pendingVertices, { id: point.id, point, isNew: false }]
      const needed = geometryTool === 'distance' ? 2 : 3
      if (next.length < needed) { setPendingVertices(next); return }
      onGeometryChange([...geometry, {
        id: crypto.randomUUID(), kind: 'measurement', measure: geometryTool,
        pointIds: next.map((vertex) => vertex.id), color: '#df7752', visible: true,
      }])
      setPendingVertices([])
      return
    }

    if (geometryTool === 'perimeter' || geometryTool === 'area') {
      const polygon = hitPolygon(clientX, clientY)
      if (!polygon) return
      onGeometryChange([...geometry, {
        id: crypto.randomUUID(), kind: 'measurement', measure: geometryTool,
        polygonId: polygon.id, color: '#df7752', visible: true,
      }])
      return
    }

    if (geometryTool === 'select') return
    const snapped = hitPoint(clientX, clientY)
    const point = snapped ?? createGeometryPoint(position.x, position.y, pendingVertices.filter((vertex) => vertex.isNew).length)
    if (pendingVertices.some((vertex) => vertex.id === point.id)) return
    const vertex = { id: point.id, point, isNew: !snapped }
    if (geometryTool === 'polygon') {
      setPendingVertices((current) => [...current, vertex])
      return
    }
    if (pendingVertices.length === 0) {
      setPendingVertices([vertex])
      return
    }
    const first = pendingVertices[0]
    const endpoints = [...pendingVertices.filter((item) => item.isNew).map((item) => item.point), ...(vertex.isNew ? [vertex.point] : [])]
    const path: GeometryPath = {
      id: crypto.randomUUID(),
      kind: geometryTool,
      startId: first.id,
      endId: vertex.id,
      color: '#286fc0',
      visible: true,
    }
    onGeometryChange([...geometry, ...endpoints, path])
    setPendingVertices([])
    setSelectedPointId(null)
  }

  function finishPolygon() {
    const distinct = pendingVertices.filter((vertex, index, all) => all.findIndex((item) => item.id === vertex.id) === index)
    if (distinct.length < 3) return
    const points = distinct.filter((vertex) => vertex.isNew).map((vertex) => vertex.point)
    onGeometryChange([...geometry, ...points, {
      id: crypto.randomUUID(),
      kind: 'polygon',
      pointIds: distinct.map((vertex) => vertex.id),
      color: '#286fc0',
      visible: true,
    }])
    setPendingVertices([])
  }

  function deleteSelectedPoint() {
    if (!selectedPointId) return
    onGeometryChange(removeGeometryObjects(geometry, [selectedPointId]))
    setSelectedPointId(null)
  }

  const mainTools: GeometryTool[] = ['select', 'point', 'line', 'vector']
  const moreTools: GeometryTool[] = ['linked-point', 'segment', 'ray', 'polygon', 'circle', 'ellipse', 'conic', 'locus', 'curve-locus', 'envelope', 'distance', 'angle', 'perimeter', 'area', 'transform']
  const toolButton = (tool: GeometryTool, showLabel = false) => <button key={tool} type="button" className={geometryTool === tool ? 'active' : ''} aria-label={tool === 'linked-point' ? 'Sheet point' : tool} data-tooltip={tool === 'linked-point' ? 'Sheet point' : tool[0].toUpperCase() + tool.slice(1)} aria-pressed={geometryTool === tool} onClick={() => { setGeometryTool(tool); setPendingVertices([]) }}>
    {tool === 'select' ? <MousePointer2 /> : tool === 'point' ? <CircleDot /> : tool === 'linked-point' ? <Link /> : ['line', 'segment', 'ray', 'vector', 'perimeter', 'area'].includes(tool) ? <ConstructionGlyph kind={tool as 'line' | 'segment' | 'ray' | 'vector' | 'perimeter' | 'area'} /> : tool === 'polygon' ? <Pentagon /> : tool === 'circle' ? <Circle /> : tool === 'ellipse' ? <Ellipse /> : tool === 'conic' ? <DraftingCompass /> : tool === 'locus' ? <Orbit /> : tool === 'envelope' ? <Waves /> : tool === 'distance' ? <Ruler /> : tool === 'angle' ? <Triangle /> : tool === 'transform' ? <Move /> : <Crosshair />}
    {showLabel && <span>{tool[0].toUpperCase() + tool.slice(1)}</span>}
  </button>

  return (
    <div className="graph-stage" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={`graph-canvas ${geometryTool === 'select' ? '' : 'geometry-cursor'}`}
        tabIndex={0}
        aria-label="Interactive two-dimensional graph. Drag to pan, scroll to zoom, or click a function to trace it."
        role="img"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          if (geometryTool !== 'select') { dragRef.current = null; return }
          const point = hitPoint(event.clientX, event.clientY)
          if (point) {
            const source = geometry.find((object) => object.id === point.id)
            if (source?.kind === 'point' && (source.xCell && source.yCell || source.intersectionOf)) { setSelectedPointId(point.id); return }
            dragRef.current = { kind: 'point', id: point.id, x: event.clientX, y: event.clientY }
            setSelectedPointId(point.id)
            return
          }
          setSelectedPointId(null)
          dragRef.current = { kind: 'pan', x: event.clientX, y: event.clientY, viewport }
        }}
        onPointerMove={(event) => {
          updateCursor(event.clientX, event.clientY)
          if (!dragRef.current) return
          const drag = dragRef.current
          if (drag.kind === 'point') {
            const position = worldPoint(event.clientX, event.clientY)
            if (position && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 2) {
              const source = geometry.find((item): item is GeometryPoint => item.id===drag.id && item.kind==='point')
              const path = source?.onPath && geometry.find((item): item is GeometryPath => item.id===source.onPath!.pathId && ['line','segment','ray','vector'].includes(item.kind))
              const projected = path ? projectPointToPath(path,new Map(visibleGeometry.filter((item): item is GeometryPoint=>item.kind==='point').map(item=>[item.id,item])),position.x,position.y) : position
              if (projected) setPreviewPoint({id:drag.id,x:projected.x,y:projected.y})
            }
            return
          }
          setViewport({
            ...drag.viewport,
            centerX: drag.viewport.centerX - (event.clientX - drag.x) / drag.viewport.scale,
            centerY: drag.viewport.centerY + (event.clientY - drag.y) / drag.viewport.scale,
          })
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (drag?.kind === 'point') {
            const position = worldPoint(event.clientX, event.clientY)
            if (position && previewPoint?.id === drag.id) {
              onGeometryChange(geometry.map((object) => {
                if (object.kind!=='point' || object.id!==drag.id) return object
                if (!object.onPath) return { ...object, ...position }
                const path=geometry.find((item): item is GeometryPath=>item.id===object.onPath!.pathId && ['line','segment','ray','vector'].includes(item.kind))
                const projected=path && projectPointToPath(path,new Map(visibleGeometry.filter((item): item is GeometryPoint=>item.kind==='point').map(item=>[item.id,item])),position.x,position.y)
                return projected ? { ...object,x:projected.x,y:projected.y,onPath:{...object.onPath,t:projected.t} } : object
              }))
            }
            setPreviewPoint(null)
          } else if (drag?.kind === 'pan' && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) {
            selectTrace(event.clientX, event.clientY)
          } else if (!drag && geometryTool !== 'select') {
            createAt(event.clientX, event.clientY)
          }
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null; setPreviewPoint(null) }}
        onPointerLeave={() => setCursor(null)}
        onWheel={(event) => {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const px = event.clientX - rect.left - rect.width / 2
          const py = event.clientY - rect.top - rect.height / 2
          const factor = Math.exp(-event.deltaY * 0.0015)
          setViewport((current) => {
            const nextScale = Math.min(maxScale, Math.max(minScale, current.scale * factor))
            return {
              centerX: current.centerX + px / current.scale - px / nextScale,
              centerY: current.centerY - py / current.scale + py / nextScale,
              scale: nextScale,
            }
          })
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Backspace' || event.key === 'Delete') && selectedPointId) {
            event.preventDefault()
            deleteSelectedPoint()
          }
        }}
      />
      <div className="geometry-toolbar" role="toolbar" aria-label="Geometry tools">
        <div className="geometry-main-tools">{mainTools.map((tool) => toolButton(tool, true))}</div>
        {geometry.some(item => item.kind === 'tangent') && <details><summary>Saved tangents</summary>{geometry.filter(item => item.kind === 'tangent').map(item => <button key={item.id} type="button" onClick={() => onGeometryChange(geometry.filter(object => object.id !== item.id))}>Remove tangent at x = {item.kind === 'tangent' ? formatNumber(item.x) : ''}</button>)}</details>}
        <details className="geometry-more"><summary>{moreTools.includes(geometryTool) ? geometryTool.replace('-', ' ') : 'More tools'}</summary><div>{moreTools.map((tool) => toolButton(tool, true))}</div></details>
        {geometryTool === 'linked-point' && <><label> x cell <input value={linkedXCell} onChange={(event) => setLinkedXCell(event.target.value.toUpperCase())} /></label><label> y cell <input value={linkedYCell} onChange={(event) => setLinkedYCell(event.target.value.toUpperCase())} /></label></>}
        {geometryTool === 'curve-locus' && <>
          {(['x','y','start','end'] as const).map(key=><label key={key}>{key==='x' || key==='y' ? `${key}(t)` : key}<input value={locusInput[key]} onChange={event=>setLocusInput(current=>({...current,[key]:event.target.value}))} /></label>)}
          <button type="button" onClick={()=>{
            try {
              const start=Number(locusInput.start),end=Number(locusInput.end)
              if (!locusInput.start.trim() || !locusInput.end.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start>=end) throw new Error('Enter increasing finite parameter bounds.')
              const object={id:crypto.randomUUID(),kind:'curve-locus' as const,xExpression:locusInput.x,yExpression:locusInput.y,start,end,color:'#805fc2',visible:true}
              sampleCurveLocus(object,{...linkedValues,a:parameterA});onGeometryChange([...geometry,object]);setConstructionError('');setGeometryTool('select')
            } catch(error) {setConstructionError(error instanceof Error ? error.message : 'Invalid locus.')}
          }}>Create sampled locus</button>
          {constructionError && <span role="alert">{constructionError}</span>}
        </>}
        {geometryTool === 'envelope' && <><label>m(t)<input aria-label="Line family slope m of t" value={envelopeInput.slope} onChange={(event) => setEnvelopeInput((current) => ({ ...current, slope: event.target.value }))} /></label><label>b(t)<input aria-label="Line family intercept b of t" value={envelopeInput.intercept} onChange={(event) => setEnvelopeInput((current) => ({ ...current, intercept: event.target.value }))} /></label><label>t from<input aria-label="Envelope parameter start" type="number" value={envelopeInput.start} onChange={(event) => setEnvelopeInput((current) => ({ ...current, start: event.target.value }))} /></label><label>to<input aria-label="Envelope parameter end" type="number" value={envelopeInput.end} onChange={(event) => setEnvelopeInput((current) => ({ ...current, end: event.target.value }))} /></label><button type="button" className="geometry-finish" onClick={createEnvelope}>Create envelope</button></>}
        {geometryTool === 'transform' && <>
          <select aria-label="Transformation" value={transformOperation} onChange={(event) => setTransformOperation(event.target.value as TransformOperation)}>
            <option value="translate">Translate</option><option value="reflect-x">Reflect across x-axis</option><option value="reflect-y">Reflect across y-axis</option><option value="reflect-origin">Reflect across origin</option><option value="reflect-line">Reflect across a constructed line</option><option value="rotate">Rotate</option><option value="dilate">Dilate</option><option value="invert">Invert in circle</option><option value="matrix">2 × 2 matrix transform</option>
          </select>
          {transformOperation === 'reflect-line' && <label>Mirror line<select aria-label="Reflection line" value={reflectionLineId} onChange={event => setReflectionLineId(event.target.value)}><option value="">Choose a path</option>{geometry.filter(item => ['line', 'segment', 'ray', 'vector'].includes(item.kind)).map(item => <option key={item.id} value={item.id}>{item.kind} {item.id.slice(0, 6)}</option>)}</select></label>}
          {transformOperation==='matrix' && <label>Matrix rows<input aria-label="Two by two transformation matrix" value={matrixInput} onChange={event=>setMatrixInput(event.target.value)} placeholder="1, 0; 0, 1" /></label>}
          {transformOperation === 'translate' && <><label>Δx <input aria-label="Horizontal translation" value={transformValues.dx} onChange={(event) => setTransformValues({ ...transformValues, dx: event.target.value })} /></label><label>Δy <input aria-label="Vertical translation" value={transformValues.dy} onChange={(event) => setTransformValues({ ...transformValues, dy: event.target.value })} /></label></>}
          {['rotate', 'dilate', 'invert'].includes(transformOperation) && <><label>Center x <input aria-label="Center x coordinate" value={transformValues.centerX} onChange={(event) => setTransformValues({ ...transformValues, centerX: event.target.value })} /></label><label>y <input aria-label="Center y coordinate" value={transformValues.centerY} onChange={(event) => setTransformValues({ ...transformValues, centerY: event.target.value })} /></label></>}
          {transformOperation === 'rotate' && <label>° <input aria-label="Rotation angle in degrees" value={transformValues.angleDegrees} onChange={(event) => setTransformValues({ ...transformValues, angleDegrees: event.target.value })} /></label>}
          {transformOperation === 'dilate' && <label>Factor <input aria-label="Dilation factor" value={transformValues.scale} onChange={(event) => setTransformValues({ ...transformValues, scale: event.target.value })} /></label>}
          {transformOperation === 'invert' && <label>Radius <input aria-label="Inversion circle radius" value={transformValues.radius} onChange={(event) => setTransformValues({ ...transformValues, radius: event.target.value })} /></label>}
          <button type="button" className="geometry-finish" disabled={!selectedGeometryId} onClick={createTransform}>Create copy</button>
          <span className="geometry-hint">{selectedGeometryId ? `Selected: ${geometry.find((item) => item.id === selectedGeometryId)?.kind ?? 'object'}` : 'Click a point, path, or polygon'}</span>
        </>}
        {geometryTool === 'polygon' && pendingVertices.length > 0 && <button type="button" className="geometry-finish" onClick={finishPolygon} disabled={pendingVertices.length < 3}>Finish polygon</button>}
        {pendingVertices.length > 0 && <button type="button" className="geometry-cancel" onClick={() => setPendingVertices([])} aria-label="Cancel construction">Cancel</button>}
        {selectedPointId && <button type="button" className="geometry-delete" onClick={deleteSelectedPoint} aria-label="Delete selected point and dependent objects">Delete point</button>}
        {(() => {const point=geometry.find((item):item is GeometryPoint=>item.id===selectedPointId && item.kind==='point');return point ? <PointCoordinates key={point.id} point={point} onChange={next=>onGeometryChange(geometry.map(item=>item.id===next.id ? next : item))} /> : null})()}
        {geometryTool !== 'select' && geometryTool !== 'transform' && geometryTool !== 'envelope' && geometryTool !== 'curve-locus' && <span className="geometry-hint">{geometryTool === 'point' ? 'Click to add a point; snap near intersections' : geometryTool === 'linked-point' ? 'Click to add a point linked to these sheet cells' : geometryTool === 'conic' ? `Select five points · ${pendingVertices.length}/5` : geometryTool === 'ellipse' ? `Select center, x-axis point, and y-axis point · ${pendingVertices.length}/3` : geometryTool === 'locus' ? `Select moving point and rotation center · ${pendingVertices.length}/2` : geometryTool === 'polygon' ? `${pendingVertices.length} vertices · finish at 3 or more` : geometryTool === 'distance' ? `Select ${pendingVertices.length}/2 points` : geometryTool === 'angle' ? `Select ${pendingVertices.length}/3 points` : geometryTool === 'area' || geometryTool === 'perimeter' ? 'Click a polygon' : pendingVertices.length ? 'Click the second endpoint' : 'Click two endpoints'}</span>}
      </div>
      <div className="graph-controls" aria-label="Graph controls">
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.min(maxScale, current.scale * buttonZoomFactor) }))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.max(minScale, current.scale / buttonZoomFactor) }))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setViewport(initialViewport)} aria-label="Reset view" className="reset-view">⌖</button>
        <button type="button" onClick={() => setAnalysisOpen((current) => !current)} aria-label={analysisOpen ? 'Hide graph analysis' : 'Analyze graph'} aria-pressed={analysisOpen} className={`analysis-toggle ${analysisOpen ? 'active' : ''}`}>ƒ′</button>
        <button type="button" onClick={() => setPiAxis((current) => !current)} aria-label={piAxis ? 'Use numeric x-axis' : 'Use π labels on x-axis'} aria-pressed={piAxis} className={piAxis ? 'active axis-mode' : 'axis-mode'} title={piAxis ? 'Cartesian x-axis' : 'π x-axis'}>{piAxis ? 'π' : 'x'}</button>
      </div>
      {analysisOpen && (
        <div className="analysis-panel" role="region" aria-label="Approximate graph analysis">
          <div className="analysis-heading"><strong>Graph analysis</strong><button type="button" onClick={() => setAnalysisOpen(false)} aria-label="Close graph analysis">×</button></div>
          {selectedAnalysisCurve && <div className="analysis-diagnostics">
            <label>Curve<select aria-label="Analyze curve" value={selectedAnalysisCurve.id} onChange={(event) => setAnalysisCurveId(event.target.value)}>{visibleCurves.map((item) => <option key={item.id} value={item.id}>Graph {graphs.indexOf(item) + 1}</option>)}</select></label>
            <div className="analysis-bounds"><label>From<input type="number" aria-label="Analysis interval start" value={analysisBounds.from} onChange={(event) => setAnalysisBounds((current) => ({ ...current, from: event.target.value }))} /></label><label>To<input type="number" aria-label="Analysis interval end" value={analysisBounds.to} onChange={(event) => setAnalysisBounds((current) => ({ ...current, to: event.target.value }))} /></label></div>
            {curveDiagnostics ? <dl><div><dt>∫ f(x) dx ≈</dt><dd>{formatNumber(curveDiagnostics.integral, 5)}</dd></div><div><dt>Arc length ≈</dt><dd>{formatNumber(curveDiagnostics.arcLength, 5)}</dd></div>{curveDiagnostics.curvature !== null && <div><dt>Curvature near {trace?.graphId === selectedAnalysisCurve.id ? 'trace' : 'midpoint'} ≈</dt><dd>{formatNumber(curveDiagnostics.curvature, 5)}</dd></div>}</dl> : <p>Enter a finite interval without a discontinuity to see diagnostics.</p>}
          </div>}
          <p>Approximate points for visible y = functions. Select one to trace it.</p>
          {analysis.omittedGraphs > 0 && <p>Showing the first 8 visible 2D functions.</p>}
          {analysis.features.length === 0 ? <div className="analysis-empty">{analysis.curveCount === 0 ? 'Add a visible y = function to analyze.' : 'No roots, turning points, or intersections found here.'}</div> : (
            <div className="analysis-results">
              {analysis.features.slice(0, 18).map((feature, index) => (
                <button key={`${feature.kind}-${feature.graphId}-${index}`} type="button" onClick={() => setTrace({ graphId: feature.graphId, x: feature.x })}>
                  <span className="analysis-dot" style={{ backgroundColor: feature.color }} aria-hidden="true" />
                  <span className="analysis-result-name">{feature.kind === 'root' ? 'x-intercept' : feature.kind === 'y-intercept' ? 'y-intercept' : feature.kind === 'minimum' ? 'Minimum' : feature.kind === 'maximum' ? 'Maximum' : feature.kind === 'inflection' ? 'Inflection' : 'Intersection'} <small>{feature.label}</small></span>
                  <span className="analysis-coordinates">({formatNumber(feature.x, 2)}, {formatNumber(feature.y, 2)})</span>
                </button>
              ))}
              {analysis.features.length > 18 && <div className="analysis-more">+{analysis.features.length - 18} more points in view</div>}
            </div>
          )}
        </div>
      )}
      {trace && tracedGraph && Number.isFinite(tracedY) && (
        <div className="trace-card" role="status">
          <span className="trace-dot" style={{ backgroundColor: tracedGraph.color }} aria-hidden="true" />
          <span>x {formatNumber(trace.x)} · y {formatNumber(tracedY)}{Number.isFinite(tracedSlope) ? ` · slope ${formatNumber(tracedSlope)}` : ''}</span>
          {Number.isFinite(tracedSlope) && <button type="button" onClick={() => onGeometryChange([...geometry, { id: crypto.randomUUID(), kind: 'tangent', expressionId: tracedGraph.id, x: trace.x, color: tracedGraph.color, visible: true }])}>Save tangent</button>}
          <button type="button" onClick={() => setTrace(null)} aria-label="Clear trace">×</button>
        </div>
      )}
      <div className="coordinate-readout" aria-live="off">
        {cursor ? `x ${formatNumber(cursor.x)}   y ${formatNumber(cursor.y)}` : 'Drag to pan · Scroll to zoom · Click a curve to trace'}
      </div>
    </div>
  )
}
