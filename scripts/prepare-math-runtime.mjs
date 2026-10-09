import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Ship only the interpreter and SymPy dependency closure. No runtime CDN access.
const source = new URL('../node_modules/pyodide/', import.meta.url)
const target = new URL('../public/math-runtime/', import.meta.url)
await mkdir(target, { recursive: true })
const lock = JSON.parse(await readFile(new URL('pyodide-lock.json', source), 'utf8'))
const { version } = JSON.parse(await readFile(new URL('package.json', source), 'utf8'))
const files = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
for (const file of files) await copyFile(new URL(file, source), new URL(file, target))
const packages = new Set()
function visit(name) {
  if (packages.has(name)) return
  packages.add(name)
  for (const dependency of lock.packages[name].depends) visit(dependency)
}
visit('sympy')
for (const name of packages) {
  const item = lock.packages[name]
  const path = new URL(item.file_name, target)
  let data
  try { data = await readFile(path) } catch {
    const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${item.file_name}`)
    if (!response.ok) throw new Error(`Could not download ${name}: ${response.status}`)
    data = Buffer.from(await response.arrayBuffer())
  }
  if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error(`Integrity failure: ${name}`)
  await writeFile(path, data)
  files.push(item.file_name)
}
await writeFile(new URL('manifest.json', target), JSON.stringify(await Promise.all(files.map(async file => {
  const data = await readFile(new URL(file, target))
  return { file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
})), null, 2))
console.log(`Prepared offline symbolic runtime (${files.length} files)`)
