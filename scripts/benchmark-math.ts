import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { compileGraph } from '../src/lib/math'
import { compileWorkspace } from '../src/lib/workspace'
import { notebookGraphPaths } from '../src/lib/notebookGraph'
import { defaultNotebookGraphBounds } from '../src/lib/notebook'
import { sampleImplicitSurface, sampleParametricSurface } from '../src/lib/meshing'
import { evaluateSpreadsheet, fitRegression } from '../src/lib/spreadsheet'
import { solveOde } from '../src/lib/ode'
import { appendActivity, activityTemplates } from '../src/lib/activities'
import { parseProjectFile, starterProject } from '../src/lib/project'

const expressions = Array.from({ length: 20 }, (_, i) => ({ id: String(i), text: `y=sin(x)+${i}/20*x^2`, color: '#4589ff', visible: true }))
const curve = compileGraph('y=sin(x)+x^2/20')
const sphere = compileGraph('x^2+y^2+z^2=9')
const torus = compileGraph('x=(2+cos(v))*cos(u), y=(2+cos(v))*sin(u), z=sin(v)')
const points = Array.from({ length: 17 }, (_, i) => ({ x: 1e6 + i, y: ((i - 8) / 8) ** 8 + i }))
const cells: Record<string, string> = { A1: '1' }
for (let row = 2; row <= 18; row++) cells[`A${row}`] = `=A${row - 1}+1`
for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) for (let row = 1; row <= 18; row++) cells[`${col}${row}`] = `=A${row}*2`
const project = activityTemplates.reduce((current, template) => appendActivity(current, template.id), starterProject())
const saved = JSON.stringify(project)
const jobs = [
  { name: 'Compile 20 ordinary expressions', budgetMs: 100, run: () => compileWorkspace(expressions, 1, {}, {}) },
  { name: 'Sample 10 notebook 2D previews', budgetMs: 100, run: () => { for (let i = 0; i < 10; i++) notebookGraphPaths(curve, defaultNotebookGraphBounds, i / 5) } },
  { name: 'Evaluate 144 linked spreadsheet cells', budgetMs: 100, run: () => evaluateSpreadsheet({ cells }, {}, 1) },
  { name: 'Fit degree-eight regression', budgetMs: 100, run: () => fitRegression(points, 'polynomial', 8) },
  { name: 'Mesh implicit sphere at 36 cells', budgetMs: 1000, run: () => sampleImplicitSurface(sphere, 1, 36) },
  { name: 'Mesh parametric torus at 64 cells', budgetMs: 1000, run: () => sampleParametricSurface(torus, 1, 64) },
  { name: 'Solve 10 oscillator cycles', budgetMs: 1000, run: () => solveOde((_t, [x, y]) => [y, -x], 0, 20 * Math.PI, [1, 0], 1e-8) },
  { name: 'Validate project with all ten templates', budgetMs: 100, run: () => parseProjectFile(saved) },
]
const results = jobs.map(job => {
  for (let i = 0; i < 5; i++) job.run()
  const samples = Array.from({ length: 30 }, () => { const start = performance.now(); job.run(); return performance.now() - start }).sort((a, b) => a - b)
  return { name: job.name, medianMs: +samples[15].toFixed(3), p95Ms: +samples[28].toFixed(3), budgetMs: job.budgetMs, pass: samples[28] <= job.budgetMs }
})
global.gc?.()
const before = process.memoryUsage().heapUsed
for (let i = 0; i < 2000; i++) { compileWorkspace(expressions, i / 200, {}, {}); parseProjectFile(saved) }
global.gc?.()
const growthMiB = (process.memoryUsage().heapUsed - before) / 1024 ** 2
console.log(JSON.stringify({ date: new Date().toISOString(), environment: { node: process.version, cpu: cpus()[0].model, memoryGiB: totalmem() / 1024 ** 3 }, scope: 'Node computation only; excludes browser input-to-paint, GPU frame rate, battery and native memory.', results, soak: { cycles: 2000, retainedHeapGrowthMiB: +growthMiB.toFixed(3), garbageCollectionAvailable: !!global.gc }, projectBytes: Buffer.byteLength(saved) }, null, 2))
if (results.some(result => !result.pass)) process.exitCode = 1
