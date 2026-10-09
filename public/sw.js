const CACHE = 'contour-static-v5'

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

    const stylesheets = assets.filter((url) => new URL(url).pathname.endsWith('.css'))
    for (const stylesheet of stylesheets) {
      const css = await (await cache.match(stylesheet)).text()
      const fontAssets = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
        .map((match) => new URL(match[1], stylesheet).toString())
        .filter((url) => new URL(url).origin === self.location.origin)
      await cache.addAll(fontAssets)
    }
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
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
