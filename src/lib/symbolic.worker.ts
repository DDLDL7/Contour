import program from './symbolic.py?raw'
import type { PyodideInterface } from 'pyodide'

const scope = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (value: unknown) => void }
scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ progress: 'Starting the offline symbolic engine…' })
    const { loadPyodide } = await import(/* @vite-ignore */ `${data.base}pyodide.mjs`) as { loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface> }
    const python = await loadPyodide({ indexURL: data.base })
    await python.loadPackage('sympy')
    scope.postMessage({ progress: 'Calculating with SymPy…' })
    python.globals.set('request_json', JSON.stringify(data.request))
    const result = await python.runPythonAsync(program)
    scope.postMessage({ result: JSON.parse(result) })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message.split('\n').slice(-2).join(' ') : 'Could not calculate this expression.' })
  }
}
