import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { evaluateSpatialPoint, type PlottableGraph } from '../lib/math'

interface Props {
  graphs: PlottableGraph[]
  parameterA: number
  canvasRef: RefObject<HTMLCanvasElement | null>
}

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  surfaces: THREE.Group
}

function makeSurface(graph: PlottableGraph, parameterA: number, wireframe: boolean): THREE.Mesh | null {
  const cells = 72
  const extent = 6
  const positions = new Float32Array((cells + 1) ** 2 * 3)
  const values = new Float32Array((cells + 1) ** 2)
  const indices: number[] = []

  for (let iy = 0; iy <= cells; iy++) {
    for (let ix = 0; ix <= cells; ix++) {
      const index = iy * (cells + 1) + ix
      const x = -extent + (ix / cells) * extent * 2
      const y = -extent + (iy / cells) * extent * 2
      const z = graph.graph.evaluate(x, y, parameterA)
      values[index] = Number.isFinite(z) && Math.abs(z) < 30 ? z : Number.NaN
      positions[index * 3] = x
      positions[index * 3 + 1] = Number.isFinite(values[index]) ? z : 0
      positions[index * 3 + 2] = y
    }
  }

  const pushTriangle = (a: number, b: number, c: number) => {
    const za = values[a]
    const zb = values[b]
    const zc = values[c]
    if (![za, zb, zc].every(Number.isFinite)) return
    if (Math.max(za, zb, zc) - Math.min(za, zb, zc) > 3) return
    indices.push(a, b, c)
  }

  for (let iy = 0; iy < cells; iy++) {
    for (let ix = 0; ix < cells; ix++) {
      const a = iy * (cells + 1) + ix
      const b = a + 1
      const c = a + cells + 1
      const d = c + 1
      pushTriangle(a, c, b)
      pushTriangle(b, c, d)
    }
  }

  if (indices.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    color: graph.color,
    side: THREE.DoubleSide,
    roughness: 0.68,
    metalness: 0,
    transparent: true,
    opacity: wireframe ? 1 : 0.87,
    wireframe,
  })
  return new THREE.Mesh(geometry, material)
}

function makeSpaceCurve(graph: PlottableGraph, parameterA: number): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  let points: THREE.Vector3[] = []
  const material = new THREE.MeshStandardMaterial({ color: graph.color, roughness: 0.6 })
  const finishRun = () => {
    if (points.length >= 2) {
      const path = new THREE.CatmullRomCurve3(points)
      meshes.push(new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(16, points.length * 2), 0.04, 6, false), material.clone()))
    }
    points = []
  }

  for (let index = 0; index <= 720; index += 1) {
    const parameter = index / 720 * Math.PI * 4
    const [x, y, z] = evaluateSpatialPoint(graph.graph, parameter, parameterA)
    if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 30) {
      finishRun()
      continue
    }
    const point = new THREE.Vector3(x, z, y)
    if (points.length > 0 && points[points.length - 1].distanceTo(point) > 2) finishRun()
    points.push(point)
  }
  finishRun()
  material.dispose()
  return meshes
}

export function Graph3D({ graphs, parameterA, canvasRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneState | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    } catch {
      setError('3D graphics are unavailable on this device or browser.')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor('#ffffff')
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    camera.position.set(14, 12, 16)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = false
    controls.minDistance = 3
    controls.maxDistance = 70
    controls.target.set(0, 0, 0)
    controls.update()

    scene.add(new THREE.AmbientLight('#ffffff', 2.1))
    const sun = new THREE.DirectionalLight('#ffffff', 2)
    sun.position.set(6, 12, 8)
    scene.add(sun)

    const grid = new THREE.GridHelper(12, 12, '#a9b9c7', '#e1e7ec')
    scene.add(grid)
    const axes = new THREE.AxesHelper(7)
    scene.add(axes)
    const surfaces = new THREE.Group()
    scene.add(surfaces)

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    })
    observer.observe(container)
    sceneRef.current = { renderer, scene, camera, controls, surfaces }
    render()

    return () => {
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      surfaces.children.forEach((child) => {
        const mesh = child as THREE.Mesh
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      })
      renderer.dispose()
      sceneRef.current = null
    }
  }, [canvasRef])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    for (const child of [...state.surfaces.children]) {
      const mesh = child as THREE.Mesh
      state.surfaces.remove(child)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    for (const graph of graphs) {
      if (!graph.visible) continue
      if (graph.graph.kind === 'surface') {
        const mesh = makeSurface(graph, parameterA, wireframe)
        if (mesh) state.surfaces.add(mesh)
      } else if (graph.graph.kind === 'spaceCurve') {
        state.surfaces.add(...makeSpaceCurve(graph, parameterA))
      }
    }
    state.renderer.render(state.scene, state.camera)
  }, [graphs, parameterA, wireframe])

  return (
    <div className="graph-stage" ref={containerRef}>
      {error ? <div className="graph-error">{error}</div> : <canvas ref={canvasRef} className="graph-canvas" aria-label="Interactive three-dimensional graph. Drag to rotate and scroll to zoom." role="img" />}
      {!error && (
        <>
          <div className="graph-controls" aria-label="3D graph controls">
            <button type="button" onClick={() => {
              const state = sceneRef.current
              if (!state) return
              state.camera.position.set(14, 12, 16)
              state.controls.target.set(0, 0, 0)
              state.controls.update()
            }} aria-label="Reset 3D view" className="reset-view">⌖</button>
            <button type="button" onClick={() => setWireframe((current) => !current)} aria-label={wireframe ? 'Show solid surface' : 'Show wireframe'} className="wireframe-toggle">{wireframe ? 'Solid' : 'Mesh'}</button>
          </div>
          <div className="coordinate-readout">Drag to rotate · Scroll to zoom</div>
          <div className="axis-key"><span className="axis-x">x</span><span className="axis-y">y</span><span className="axis-z">z</span></div>
        </>
      )}
    </div>
  )
}
