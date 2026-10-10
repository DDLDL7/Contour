import { meshPlaneSection } from '../lib/sections'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { evaluateSpatialPoint, type PlottableGraph } from '../lib/math'
import { sampleImplicitSurface, sampleParametricSurface, type MeshSamples } from '../lib/meshing'
import { printableNetSvg, type SolidObject, type NetShape, type SolidShape } from '../lib/solids'
import type { VectorFieldObject } from '../lib/solids'
import { compileScalarDefinition } from '../lib/math'
import type { TriangleMesh } from '../lib/intersections3d'

interface Props {
  graphs: PlottableGraph[]
  parameterA: number
  canvasRef: RefObject<HTMLCanvasElement | null>
  darkMode: boolean
  solids: SolidObject[]
  onSolidsChange: (solids: SolidObject[]) => void
  vectorFields: VectorFieldObject[]
  onVectorFieldsChange: (fields: VectorFieldObject[]) => void
  definitions: Readonly<Record<string, number>>
}

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  perspectiveCamera: THREE.PerspectiveCamera
  orthographicCamera: THREE.OrthographicCamera
  controls: OrbitControls
  surfaces: THREE.Group
  grid: THREE.GridHelper
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

function makeSampledSurface(samples: MeshSamples, color: string, wireframe: boolean): THREE.Mesh | null {
  if (samples.positions.length === 0 || (samples.indices && samples.indices.length === 0)) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(samples.positions, 3))
  if (samples.indices) geometry.setIndex(samples.indices)
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.68,
    transparent: true,
    opacity: wireframe ? 1 : 0.88,
    wireframe,
  })
  return new THREE.Mesh(geometry, material)
}

export function Graph3D({ graphs, parameterA, canvasRef, darkMode, solids, onSolidsChange, vectorFields, onVectorFieldsChange, definitions, preview = false }: Props & { preview?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<SceneState | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [intersectionsEnabled, setIntersectionsEnabled] = useState(true)
  const [intersectionStatus, setIntersectionStatus] = useState('')
  const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('z')
  const [sectionHeight, setSectionHeight] = useState(1)
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective')
  const [fieldInput, setFieldInput] = useState({ fx: '-y', fy: 'x', fz: '0' })
  const [fieldError, setFieldError] = useState('')
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
    const orthographicCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
    orthographicCamera.position.copy(camera.position)
    const controls = new OrbitControls(camera, canvas)
    controls.listenToKeyEvents(canvas)
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

    let rendererSized = false
    const render = () => { renderer.render(scene, sceneRef.current?.camera ?? camera); if(rendererSized)canvas.dataset.contourReady='true' }
    controls.addEventListener('change', render)
    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      rendererSized = true
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      orthographicCamera.left = -10 * width / height
      orthographicCamera.right = 10 * width / height
      orthographicCamera.top = 10
      orthographicCamera.bottom = -10
      orthographicCamera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    sceneRef.current = { renderer, scene, camera, perspectiveCamera: camera, orthographicCamera, controls, surfaces, grid }
    resize()

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
    state.renderer.setClearColor(darkMode ? '#111316' : '#ffffff')
    const materials = Array.isArray(state.grid.material) ? state.grid.material : [state.grid.material]
    materials[0]?.color.set(darkMode ? '#687681' : '#a9b9c7')
    materials[1]?.color.set(darkMode ? '#303b44' : '#e1e7ec')
    state.renderer.render(state.scene, state.camera)
  }, [darkMode])

  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    let active = true
    for (const child of [...state.surfaces.children]) {
      const mesh = child as THREE.Mesh
      state.surfaces.remove(child)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    const addSection = (mesh: THREE.Mesh) => {
      if (!sectionEnabled) return
      mesh.updateMatrixWorld(true)
      const position = mesh.geometry.getAttribute('position')
      const vertices: number[] = []
      for (let i = 0; i < position.count; i++) {
        const p = mesh.localToWorld(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)))
        vertices.push(p.x, p.y, p.z)
      }
      const index = mesh.geometry.getIndex()
      const sections = meshPlaneSection(vertices, index?.array ?? null, sectionAxis === 'x' ? 0 : sectionAxis === 'y' ? 2 : 1, sectionHeight)
      if (sections.length) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(sections, 3))
        state.surfaces.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#e05252' })))
      }
    }
    const intersectionMeshes: THREE.Mesh[] = []
    let intersectionWorker: Worker | null = null
    let intersectionTimer: ReturnType<typeof setTimeout> | undefined
    const advanced = new Map<string, PlottableGraph>()
    for (const graph of graphs) {
      if (!graph.visible) continue
      if (graph.graph.kind === 'surface') {
        const mesh = makeSurface(graph, parameterA, wireframe)
        if (mesh) { state.surfaces.add(mesh); addSection(mesh); intersectionMeshes.push(mesh) }
      } else if (graph.graph.kind === 'parametricSurface' || graph.graph.kind === 'implicitSurface') {
        advanced.set(graph.id, graph)
      } else if (graph.graph.kind === 'spaceCurve') {
        state.surfaces.add(...makeSpaceCurve(graph, parameterA))
      }
    }
    const makePrimitive = (item: SolidObject) => {
      const size = item.size
      if (item.shape === 'tetrahedron') return new THREE.TetrahedronGeometry(size)
      if (item.shape === 'sphere') return new THREE.SphereGeometry(size, 32, 20)
      if (item.shape === 'cube') return new THREE.BoxGeometry(size * 1.6, size * 1.6, size * 1.6)
      if (item.shape === 'cylinder') return new THREE.CylinderGeometry(size, size, size * 2, 32)
      if (item.shape === 'pyramid') return new THREE.ConeGeometry(size, size * 2, 4)
      return new THREE.ConeGeometry(size, size * 2, 32)
    }
    solids.filter((item) => item.visible).forEach((item) => {
      const material = new THREE.MeshStandardMaterial({ color: item.color, wireframe, roughness: 0.58, transparent: true, opacity: 0.84, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(makePrimitive(item), material)
      // Mathematical z is the vertical Three.js axis, as it is for plotted surfaces.
      mesh.position.set(item.x, item.z, item.y)
      mesh.updateMatrixWorld(true)
      state.surfaces.add(mesh)
      addSection(mesh)
    })
    if (sectionEnabled) {
      const planeGeometry = new THREE.PlaneGeometry(18, 18)
      const planeMaterial = new THREE.MeshBasicMaterial({ color: '#df7752', side: THREE.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false })
      const plane = new THREE.Mesh(planeGeometry, planeMaterial)
      if (sectionAxis === 'z') { plane.rotation.x = -Math.PI / 2; plane.position.y = sectionHeight }
      else if (sectionAxis === 'x') { plane.rotation.y = Math.PI / 2; plane.position.x = sectionHeight }
      else plane.position.z = sectionHeight
      plane.renderOrder = 2
      state.surfaces.add(plane)
    }
    vectorFields.filter((field) => field.visible).forEach((field) => {
      try {
        const fx = compileScalarDefinition(field.fx, ['x', 'y', 'z', ...Object.keys(definitions)])
        const fy = compileScalarDefinition(field.fy, ['x', 'y', 'z', ...Object.keys(definitions)])
        const fz = compileScalarDefinition(field.fz, ['x', 'y', 'z', ...Object.keys(definitions)])
        const segments: number[] = []
        for (let x = -4; x <= 4; x += 2) for (let y = -4; y <= 4; y += 2) for (let z = -4; z <= 4; z += 2) {
          const scope = { ...definitions, x, y, z, a: parameterA }
          const vector = new THREE.Vector3(fx.evaluate(scope), fz.evaluate(scope), fy.evaluate(scope))
          const magnitude = vector.length()
          if (!Number.isFinite(magnitude) || magnitude < 1e-8 || magnitude > 1e7) continue
          vector.normalize()
          const length = Math.min(1.5, 0.25 + Math.log1p(magnitude) * 0.18)
          const start = new THREE.Vector3(x, z, y)
          const tip = start.clone().addScaledVector(vector, length)
          const side = new THREE.Vector3().crossVectors(vector, Math.abs(vector.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(length * .18)
          const back = tip.clone().addScaledVector(vector, -length * .25)
          segments.push(start.x, start.y, start.z, tip.x, tip.y, tip.z,
            tip.x, tip.y, tip.z, back.x + side.x, back.y + side.y, back.z + side.z,
            tip.x, tip.y, tip.z, back.x - side.x, back.y - side.y, back.z - side.z)
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3))
        state.surfaces.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: field.color })))
      } catch { /* Invalid saved fields are ignored by the renderer. */ }
    })
    state.renderer.render(state.scene, state.camera)
    const addAdvanced = (graph: PlottableGraph, samples?: MeshSamples) => {
      if (!active) return
      const result = samples ?? (graph.graph.kind === 'parametricSurface'
        ? sampleParametricSurface(graph.graph, parameterA)
        : sampleImplicitSurface(graph.graph, parameterA))
      const mesh = makeSampledSurface(result, graph.color, wireframe)
      if (mesh) { state.surfaces.add(mesh); addSection(mesh); intersectionMeshes.push(mesh) }
      state.renderer.render(state.scene, state.camera)
    }
    const calculateIntersections = () => {
      if (!active || !intersectionsEnabled || intersectionMeshes.length < 2) { if (active) setIntersectionStatus(''); return }
      const meshes: TriangleMesh[] = intersectionMeshes.map(mesh => {
        const p = mesh.geometry.getAttribute('position')
        return { positions: Array.from(p.array), indices: mesh.geometry.getIndex() ? Array.from(mesh.geometry.getIndex()!.array) : null }
      })
      setIntersectionStatus('Calculating sampled surface intersections…')
      intersectionWorker = new Worker(new URL('../workers/intersections.worker.ts', import.meta.url), { type: 'module' })
      intersectionTimer = setTimeout(() => { intersectionWorker?.terminate(); if (active) setIntersectionStatus('Intersection calculation exceeded 30 seconds. Reduce visible surfaces.') }, 30000)
      intersectionWorker.onmessage = ({ data }) => {
        clearTimeout(intersectionTimer); intersectionWorker?.terminate()
        if (!active) return
        if (data.error) { setIntersectionStatus(data.error); return }
        if (data.segments.length) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.segments, 3))
          state.surfaces.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#dd4d4d' })))
          state.renderer.render(state.scene, state.camera)
        }
        setIntersectionStatus('Intersections approximate sampled surfaces. Tangencies and coincident faces are omitted.')
      }
      intersectionWorker.onerror = () => { clearTimeout(intersectionTimer); intersectionWorker?.terminate(); if (active) setIntersectionStatus('Could not calculate surface intersections.') }
      intersectionWorker.postMessage({ meshes })
    }
    let worker: Worker | null = null
    const completed = new Set<string>()
    if (advanced.size > 0) {
      try {
        worker = new Worker(new URL('../workers/meshing.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ id: string; samples?: MeshSamples; error?: string }>) => {
          const graph = advanced.get(event.data.id)
          if (graph && !completed.has(graph.id)) {
            addAdvanced(graph, event.data.error ? undefined : event.data.samples)
            completed.add(graph.id)
            if (completed.size === advanced.size) calculateIntersections()
          }
        }
        worker.onerror = () => {
          worker?.terminate()
          worker = null
          for (const graph of advanced.values()) if (!completed.has(graph.id)) addAdvanced(graph)
          calculateIntersections()
        }
        for (const graph of advanced.values()) {
          worker.postMessage({
            id: graph.id,
            source: graph.graph.source,
            definitions: graph.graph.definitions,
            parameterA,
          })
        }
      } catch {
        worker?.terminate()
        for (const graph of advanced.values()) if (!completed.has(graph.id)) addAdvanced(graph)
        calculateIntersections()
      }
    }
    if (advanced.size === 0) calculateIntersections()
    return () => {
      clearTimeout(intersectionTimer)
      intersectionWorker?.terminate()
      active = false
      worker?.terminate()
    }
  }, [graphs, parameterA, wireframe, solids, sectionEnabled, sectionHeight, sectionAxis, intersectionsEnabled, vectorFields, definitions])

  function addSolid(shape: SolidShape) {
    const index = solids.length
    const colors = ['#25a6b8', '#ef7864', '#8a70c8', '#e6ae4e', '#529b78']
    onSolidsChange([...solids, { id: crypto.randomUUID(), shape, x: ((index % 3) - 1) * 3, y: Math.floor(index / 3) * 3, z: 1, size: 1, color: colors[index % colors.length], visible: true }])
  }

  function downloadNet(shape: NetShape) {
    const blob = new Blob([printableNetSvg(shape)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `contour-${shape}-net.svg`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportMesh(format: 'obj' | 'stl') {
    const surfaces = sceneRef.current?.surfaces
    if (!surfaces) return
    let meshes = 0
    surfaces.traverse((object) => { if (object instanceof THREE.Mesh) meshes += 1 })
    if (!meshes) { setFieldError('Add a visible surface or solid before exporting a mesh.'); return }
    const data = format === 'obj' ? new OBJExporter().parse(surfaces) : new STLExporter().parse(surfaces)
    const blob = new Blob([data], { type: format === 'obj' ? 'text/plain' : 'model/stl' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `contour-scene.${format}`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setFieldError('')
  }

  function addVectorField() {
    try {
      compileScalarDefinition(fieldInput.fx, ['x', 'y', 'z', ...Object.keys(definitions)])
      compileScalarDefinition(fieldInput.fy, ['x', 'y', 'z', ...Object.keys(definitions)])
      compileScalarDefinition(fieldInput.fz, ['x', 'y', 'z', ...Object.keys(definitions)])
      onVectorFieldsChange([...vectorFields, { id: crypto.randomUUID(), ...fieldInput, color: '#25a6b8', visible: true }])
      setFieldError('')
    } catch (cause) { setFieldError(cause instanceof Error ? cause.message : 'Check the vector field expressions.') }
  }

  function moveCamera(view: 'iso' | 'top' | 'front' | 'right') {
    const state = sceneRef.current
    if (!state) return
    const offset: [number, number, number] = view === 'top' ? [0, 22, 0.001] : view === 'front' ? [0, 0, 22] : view === 'right' ? [22, 0, 0] : [14, 12, 16]
    state.camera.position.set(...offset)
    state.controls.target.set(0, 0, 0)
    state.controls.update()
    state.renderer.render(state.scene, state.camera)
  }

  function toggleProjection() {
    const state = sceneRef.current
    const next = projection === 'perspective' ? 'orthographic' : 'perspective'
    if (state) {
      const camera = next === 'perspective' ? state.perspectiveCamera : state.orthographicCamera
      camera.position.copy(state.camera.position)
      camera.quaternion.copy(state.camera.quaternion)
      state.camera = camera
      state.controls.object = camera
      state.controls.update()
      state.renderer.render(state.scene, camera)
    }
    setProjection(next)
  }

  return (
    <div className="graph-stage" ref={containerRef}>
      {error ? <div className="graph-error" role="alert">{error}</div> : <canvas data-contour-ready="false" ref={canvasRef} className="graph-canvas" tabIndex={0} aria-label="Interactive three-dimensional graph. Arrow keys pan; Shift and arrows rotate; plus and minus zoom. Drag to rotate and scroll to zoom. Use camera controls to reset or choose a view." role="img" onKeyDown={event => {
        if (!['+', '=', '-'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
        event.preventDefault()
        const state = sceneRef.current
        if (!state) return
        const factor = event.key === '-' ? 1.2 : 1 / 1.2
        if (state.camera instanceof THREE.OrthographicCamera) { state.camera.zoom = Math.min(8, Math.max(.15, state.camera.zoom / factor)); state.camera.updateProjectionMatrix() }
        else {
          const offset = state.camera.position.clone().sub(state.controls.target)
          const distance = Math.min(70, Math.max(3, offset.length() * factor))
          state.camera.position.copy(state.controls.target).add(offset.setLength(distance))
        }
        state.controls.update(); state.renderer.render(state.scene, state.camera)
      }} />}
      {!error && !preview && (
        <>
          <div className="graph-controls graph-controls-3d" aria-label="3D graph controls">
            <button type="button" onClick={() => moveCamera('iso')} aria-label="Reset 3D view" className="reset-view">⌖</button>
            <div className="camera-presets" role="group" aria-label="Camera views">{(['iso', 'top', 'front', 'right'] as const).map((view) => <button key={view} type="button" onClick={() => moveCamera(view)} aria-label={`${view} view`}>{view === 'front' ? 'FRT' : view === 'right' ? 'RGT' : view.toUpperCase()}</button>)}</div>
            <button type="button" onClick={toggleProjection} aria-label={`Switch to ${projection === 'perspective' ? 'orthographic' : 'perspective'} projection`} title={`Current projection: ${projection}`}>{projection === 'perspective' ? 'PERSP' : 'ORTHO'}</button>
            <button type="button" onClick={() => setWireframe((current) => !current)} aria-label={wireframe ? 'Show solid surface' : 'Show wireframe'} className="wireframe-toggle">{wireframe ? 'Solid' : 'Mesh'}</button>
            <button type="button" aria-pressed={intersectionsEnabled} onClick={() => setIntersectionsEnabled(value => !value)}>Intersections</button>
            <button type="button" aria-pressed={sectionEnabled} className={sectionEnabled ? 'active' : ''} onClick={() => setSectionEnabled((enabled) => !enabled)} title="Toggle cross-section">Slice</button>
            {sectionEnabled && <label className="slice-hud">Slice <select aria-label="Cross-section axis" value={sectionAxis} onChange={event => setSectionAxis(event.target.value as typeof sectionAxis)}><option>x</option><option>y</option><option>z</option></select> = <input aria-label="Cross-section coordinate" type="number" step="0.1" value={sectionHeight} onChange={event => setSectionHeight(Number(event.target.value))} /></label>}
            <details className="solid-menu"><summary>Objects</summary><div className="solid-controls" aria-label="3D solid constructions">
              {(['sphere', 'cube', 'cylinder', 'cone', 'pyramid', 'tetrahedron'] as SolidShape[]).map((shape) => <button key={shape} type="button" onClick={() => addSolid(shape)}>+ {shape[0].toUpperCase() + shape.slice(1)}</button>)}
              {(['cube', 'pyramid', 'tetrahedron', 'cylinder', 'cone'] as NetShape[]).map(shape => <button key={shape} type="button" onClick={() => downloadNet(shape)}>{shape} net</button>)}
              <button type="button" onClick={() => exportMesh('obj')}>Export OBJ mesh</button><button type="button" onClick={() => exportMesh('stl')}>Export STL mesh</button>
              {solids.map((solid) => <button key={solid.id} type="button" title="Remove solid" onClick={() => onSolidsChange(solids.filter((item) => item.id !== solid.id))}>− {solid.shape}</button>)}
              <label className="field-input">Fₓ<input aria-label="Vector field x component" value={fieldInput.fx} onChange={(event) => setFieldInput((current) => ({ ...current, fx: event.target.value }))} /></label>
              <label className="field-input">Fᵧ<input aria-label="Vector field y component" value={fieldInput.fy} onChange={(event) => setFieldInput((current) => ({ ...current, fy: event.target.value }))} /></label>
              <label className="field-input">F𝓏<input aria-label="Vector field z component" value={fieldInput.fz} onChange={(event) => setFieldInput((current) => ({ ...current, fz: event.target.value }))} /></label>
              <button type="button" onClick={addVectorField}>Add field</button>
              {vectorFields.map((field) => <button key={field.id} type="button" title="Remove vector field" onClick={() => onVectorFieldsChange(vectorFields.filter((item) => item.id !== field.id))}>− Field</button>)}
            </div></details>
            {intersectionStatus && <p className="field-error" role="status">{intersectionStatus}</p>}
      {fieldError && <div className="graph-error field-error" role="alert">{fieldError}</div>}
          </div>
          <div className="coordinate-readout">Drag to rotate · Scroll to zoom</div>
          <div className="axis-key"><span className="axis-x">x</span><span className="axis-y">y</span><span className="axis-z">z</span></div>
        </>
      )}
    </div>
  )
}
