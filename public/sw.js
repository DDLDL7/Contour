const CACHE = 'contour-static-v6'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const indexUrl = new URL('./', self.location.href)
    const response = await fetch(indexUrl)
    await cache.put(indexUrl, response.clone())
    const html = await response.text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], indexUrl).toString())
      .filter((url) => new URL(url).origin === self.location.origin)
    await cache.addAll(assets)
    const bundled = await (await fetch(new URL('offline-assets.json', indexUrl))).json()
    await cache.addAll(bundled.map(file => new URL(file, indexUrl).toString()))
    const runtime = new URL('math-runtime/', indexUrl)
    const manifestResponse = await fetch(new URL('manifest.json', runtime))
    const manifest = await manifestResponse.json()
    for (const item of manifest) {
      const url = new URL(item.file, runtime)
      const asset = await fetch(url)
      if (!asset.ok) throw new Error(`Offline mathematical asset missing: ${item.file}`)
      const bytes = await asset.clone().arrayBuffer()
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      if (bytes.byteLength !== item.bytes || digest !== item.sha256) throw new Error(`Offline mathematical asset failed verification: ${item.file}`)
      await cache.put(url, asset)
    }
    await cache.put(new URL('manifest.json', runtime), new Response(JSON.stringify(manifest)))

    const stylesheets = assets.filter((url) => new URL(url).pathname.endsWith('.css'))
    for (const stylesheet of stylesheets) {
      const css = await (await cache.match(stylesheet)).text()
      const fontAssets = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
        .map((match) => new URL(match[1], stylesheet).toString())
        .filter((url) => new URL(url).origin === self.location.origin)
      await cache.addAll(fontAssets)
    }
    await cache.put(new URL('offline-ready.json', indexUrl), new Response('{"ready":true}'))
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(async () => { for (const client of await self.clients.matchAll()) client.postMessage({ type: 'math-offline-ready' }) }),
  )
})

self.addEventListener('message', event => {
  if (event.data?.type !== 'offline-status') return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    if (await cache.match(new URL('offline-ready.json', self.location.href))) event.source?.postMessage({ type: 'math-offline-ready' })
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          const cache = await caches.open(CACHE)
          await cache.put(event.request, response.clone())
        }
        return response
      } catch {
        return (await caches.match(event.request))
          || (await caches.match(new URL('./', self.location.href)))
          || Response.error()
      }
    })())
    return
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
      }
      return response
    })),
  )
})
