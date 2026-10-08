import { useEffect, useRef, useState, type RefObject } from 'react'
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
      if (!item.visible || item.graph.kind === 'surface') continue
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
  }, [canvasRef, graphs, parameterA, size, viewport])

  function updateCursor(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setCursor({
      x: viewport.centerX + (clientX - rect.left - rect.width / 2) / viewport.scale,
      y: viewport.centerY - (clientY - rect.top - rect.height / 2) / viewport.scale,
    })
  }

  return (
    <div className="graph-stage" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        aria-label="Interactive two-dimensional graph. Drag to pan and scroll to zoom."
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
        onPointerUp={() => { dragRef.current = null }}
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
      </div>
      <div className="coordinate-readout" aria-live="off">
        {cursor ? `x ${formatNumber(cursor.x)}   y ${formatNumber(cursor.y)}` : 'Drag to pan · Scroll to zoom'}
      </div>
    </div>
  )
}
