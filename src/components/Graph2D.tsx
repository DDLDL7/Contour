import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { estimateSlope, findCurveExtrema, findCurveIntersections, findCurveRoots } from '../lib/analysis'
import { contourSegments, sampleScalarGrid, type ScalarGrid } from '../lib/contours'
import { evaluatePlanarPoint, formatNumber, type PlottableGraph } from '../lib/math'

interface Viewport {
  centerX: number
  centerY: number
  scale: number
}

interface Props {
  graphs: PlottableGraph[]
  parameterA: number
  canvasRef: RefObject<HTMLCanvasElement | null>
}

interface AnalysisFeature {
  kind: 'root' | 'minimum' | 'maximum' | 'intersection'
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

function gridStep(scale: number): number {
  const target = 82 / scale
  const power = 10 ** Math.floor(Math.log10(target))
  for (const multiplier of [1, 2, 5, 10]) {
    if (multiplier * power >= target) return multiplier * power
  }
  return 10 * power
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

export function Graph2D({ graphs, parameterA, canvasRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; viewport: Viewport } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState(initialViewport)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [trace, setTrace] = useState<{ graphId: string; x: number } | null>(null)

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
      for (const other of curves.slice(index + 1)) {
        for (const point of findCurveIntersections(item.graph, other.graph, parameterA, minX, maxX)) {
          add('intersection', point.x, point.y, item.id, item.color, `${label} & ${graphs.indexOf(other) + 1}`)
        }
      }
    })
    return { features: features.sort((first, second) => first.x - second.x), omittedGraphs: allCurves.length - curves.length, curveCount: allCurves.length }
  }, [analysisOpen, graphs, parameterA, size, viewport])

  const tracedGraph = graphs.find((item) => item.id === trace?.graphId && item.visible && item.graph.kind === 'curve')
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

    ctx.fillStyle = '#ffffff'
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
    const xMin = worldX(0)
    const xMax = worldX(width)
    const yMin = worldY(height)
    const yMax = worldY(0)
    ctx.strokeStyle = '#e8edf3'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
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

    ctx.strokeStyle = '#9aa9b9'
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

    ctx.fillStyle = '#77899a'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
      if (Math.abs(x) < step / 100) continue
      ctx.fillText(formatNumber(x, 4), sx(x) + 5, Math.min(height - 7, Math.max(16, sy(0) + 15)))
    }
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
      if (Math.abs(y) < step / 100) continue
      ctx.fillText(formatNumber(y, 4), Math.min(width - 35, Math.max(7, sx(0) + 7)), sy(y) - 6)
    }

    for (const item of graphs) {
      if (!item.visible || item.graph.kind === 'surface' || item.graph.kind === 'spaceCurve') continue
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

    for (const feature of analysis.features) {
      const x = sx(feature.x)
      const y = sy(feature.y)
      if (x < 0 || x > width || y < 0 || y > height) continue
      ctx.beginPath()
      ctx.arc(x, y, feature.kind === 'intersection' ? 5.5 : 4.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
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
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [analysis.features, canvasRef, graphs, parameterA, size, trace, tracedGraph, tracedSlope, tracedY, viewport])

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

  return (
    <div className="graph-stage" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        aria-label="Interactive two-dimensional graph. Drag to pan, scroll to zoom, or click a function to trace it."
        role="img"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { x: event.clientX, y: event.clientY, viewport }
        }}
        onPointerMove={(event) => {
          updateCursor(event.clientX, event.clientY)
          if (!dragRef.current) return
          const drag = dragRef.current
          setViewport({
            ...drag.viewport,
            centerX: drag.viewport.centerX - (event.clientX - drag.x) / drag.viewport.scale,
            centerY: drag.viewport.centerY + (event.clientY - drag.y) / drag.viewport.scale,
          })
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) {
            selectTrace(event.clientX, event.clientY)
          }
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
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
      />
      <div className="graph-controls" aria-label="Graph controls">
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.min(maxScale, current.scale * buttonZoomFactor) }))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.max(minScale, current.scale / buttonZoomFactor) }))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setViewport(initialViewport)} aria-label="Reset view" className="reset-view">⌖</button>
        <button type="button" onClick={() => setAnalysisOpen((current) => !current)} aria-label={analysisOpen ? 'Hide graph analysis' : 'Analyze graph'} aria-pressed={analysisOpen} className={`analysis-toggle ${analysisOpen ? 'active' : ''}`}>ƒ′</button>
      </div>
      {analysisOpen && (
        <div className="analysis-panel" role="region" aria-label="Approximate graph analysis">
          <div className="analysis-heading"><strong>Graph analysis</strong><button type="button" onClick={() => setAnalysisOpen(false)} aria-label="Close graph analysis">×</button></div>
          <p>Approximate points for visible y = functions. Select one to trace it.</p>
          {analysis.omittedGraphs > 0 && <p>Showing the first 8 visible 2D functions.</p>}
          {analysis.features.length === 0 ? <div className="analysis-empty">{analysis.curveCount === 0 ? 'Add a visible y = function to analyze.' : 'No roots, turning points, or intersections found here.'}</div> : (
            <div className="analysis-results">
              {analysis.features.slice(0, 18).map((feature, index) => (
                <button key={`${feature.kind}-${feature.graphId}-${index}`} type="button" onClick={() => setTrace({ graphId: feature.graphId, x: feature.x })}>
                  <span className="analysis-dot" style={{ backgroundColor: feature.color }} aria-hidden="true" />
                  <span className="analysis-result-name">{feature.kind === 'root' ? 'Root' : feature.kind === 'minimum' ? 'Minimum' : feature.kind === 'maximum' ? 'Maximum' : 'Intersection'} <small>{feature.label}</small></span>
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
          <button type="button" onClick={() => setTrace(null)} aria-label="Clear trace">×</button>
        </div>
      )}
      <div className="coordinate-readout" aria-live="off">
        {cursor ? `x ${formatNumber(cursor.x)}   y ${formatNumber(cursor.y)}` : 'Drag to pan · Scroll to zoom · Click a curve to trace'}
      </div>
    </div>
  )
}
