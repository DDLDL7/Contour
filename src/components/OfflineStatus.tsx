import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const bundled = '__TAURI_INTERNALS__' in window
  const [ready, setReady] = useState(bundled)
  useEffect(() => {
    if (bundled || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const status = (event: MessageEvent) => { if (event.data?.type === 'math-offline-ready') setReady(true) }
    navigator.serviceWorker.addEventListener('message', status)
    navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({ type:'offline-status' })).catch(() => {})
    return () => navigator.serviceWorker.removeEventListener('message', status)
  }, [bundled])
  if (!import.meta.env.PROD) return null
  return <span role="status">{ready ? 'Offline maths ready' : 'Preparing offline maths…'}</span>
}
