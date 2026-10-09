import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
// Include lazy-loaded mathematical workers on the first offline installation.
const files = (await readdir(new URL('../dist/assets/', import.meta.url))).sort().map(file => `assets/${file}`)
await writeFile(new URL('../dist/offline-assets.json', import.meta.url), JSON.stringify(files))
// A changed app/runtime must install a new cache even if sw.js itself was not edited.
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const runtime = await readFile(new URL('../dist/math-runtime/manifest.json', import.meta.url), 'utf8')
const version = createHash('sha256').update(JSON.stringify(files)).update(runtime).update(worker).digest('hex').slice(0,16)
await writeFile(new URL('../dist/sw.js', import.meta.url), worker.replace(/const CACHE = '[^']+'/, `const CACHE = 'contour-static-${version}'`))
