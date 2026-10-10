import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react'
import type { Graph3D as Graph3DComponent } from './Graph3D'

const Scene = lazy(() => import('./Graph3D').then(module => ({ default: module.Graph3D })))

export class GraphLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return <div className="workspace-loading" role="alert">
      <p>The 3D graph could not load. Your workspace is still available. Reload to try again; if you have not downloaded offline assets yet, reconnect first.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
    </div>
    return this.props.children
  }
}

// Defer Three.js until a 3D workspace or preview is opened. The production
// manifest still precaches this chunk, so the first offline opening works.
export function Graph3D(props: ComponentProps<typeof Graph3DComponent>) {
  return <GraphLoadBoundary><Suspense fallback={<p className="workspace-loading" role="status">Loading 3D graph…</p>}><Scene {...props} /></Suspense></GraphLoadBoundary>
}
