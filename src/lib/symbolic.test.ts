// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { readFile } from 'node:fs/promises'
import { symbolicRequest, symbolicTree, type SymbolicMethod, type SymbolicOptions } from './symbolic'

const options: SymbolicOptions = { variable: 'x', domain: 'real', assumption: 'none', start: '0', end: 'pi', direction: 'both', order: 6, initialY: '1', definitions: {} }
describe('offline symbolic engine', () => {
  let python: PyodideInterface
  let program: string
  beforeAll(async () => {
    python = await loadPyodide({ indexURL: `${process.cwd()}/public/math-runtime/` })
    await python.loadPackage('sympy')
    program = await readFile('src/lib/symbolic.py', 'utf8')
  }, 60000)
  async function run(method: SymbolicMethod, input: string, changes: Partial<SymbolicOptions> = {}) {
    python.globals.set('request_json', JSON.stringify(symbolicRequest(method, input, { ...options, ...changes })))
    return JSON.parse(await python.runPythonAsync(program)) as { value: string; note: string }
  }
  it('keeps exact fractions and original undefined points', async () => {
    expect((await run('exact', '1/3+1/6')).value).toBe('1/2')
    expect((await run('exact', '9007199254740993+1')).value).toBe('9007199254740994')
    const cancelled = await run('simplify', 'x/x')
    expect(cancelled.value).toBe('1')
    expect(cancelled.note).toContain('open(0, oo)')
    expect((await run('simplify', 'sqrt(x^2)')).value).toBe('Abs(x)')
    expect((await run('simplify', 'sqrt(x^2)', { assumption: 'positive' })).value).toBe('x')
  })
  it('solves higher-degree equations, systems and real inequalities', async () => {
    expect((await run('solve', 'x^3-x=0')).value).toBe('{-1, 0, 1}')
    expect((await run('solve', 'x/x=1')).value).toContain('open(0, oo)')
    expect((await run('solve', 'x^2+1=0')).value).toBe('EmptySet')
    expect((await run('solve', 'x^2+1=0', { domain: 'complex' })).value).toContain('I')
    expect((await run('solve', 'x^2=4', { assumption:'positive' })).value).toBe('{2}')
    expect((await run('system', 'x+y=3; x-y=1')).value).toBe('{(2, 1)}')
    expect((await run('system', 'x+y=3; x-y=-5', { assumption:'positive' })).value).toBe('EmptySet')
    await expect(run('exact','factorial(-1)')).rejects.toThrow('Factorial')
    expect((await run('inequality', 'x^2<4; x>0')).value).toBe('Interval.open(0, 2)')
  })
  it('computes special-function integrals, limits and series', async () => {
    expect((await run('integrate', 'exp(-x^2)')).value).toContain('erf(x)')
    expect((await run('definite', 'sin(x)')).value).toBe('2')
    expect((await run('limit', 'sin(x)/x')).value).toBe('1')
    expect((await run('limit', '1/x')).value).toContain('Does not exist')
    expect((await run('limit', '1/x', { direction: 'left' })).value).toBe('-oo')
    expect((await run('definite', 'exp(-x)', { end: 'oo' })).value).toBe('1')
    expect((await run('series', 'sin(x)/x')).value).toContain('O(x^6)')
  })
  it('checks answers, shows actual worked steps, and solves an initial-value ODE', async () => {
    expect((await run('check', '(x+1)^2; x^2+2*x+1')).value).toContain('Equivalent')
    expect((await run('check', 'x; x+1')).value).toBe('Not equivalent.')
    expect((await run('steps', '2*x+3=9')).value).toContain('x = 3')
    expect((await run('steps', 'x^2-5*x+6=0')).value).toContain('{2, 3}')
    expect((await run('ode', 'y')).value).toBe('Eq(y(x), exp(x))')
    expect((await run('matrix', '1,2; 2,4')).value).toContain('singular matrix')
    expect((await run('matrix', '1,2; 3,4')).value).toContain('Determinant: -2')
    expect((await run('asymptotes','(x^2+1)/(x-1)')).value).toContain('y = x + 1')
    expect((await run('asymptotes','(x^2+1)/(x-1)')).value).toContain('Vertical: x = 1')
    expect((await run('envelope','y-t*x+t^2',{variable:'t'})).value).toBe('{(2*t, t^2)}')
    expect((await run('differentiate-steps','exp(x)*sin(x)')).value).toContain('Product rule')
  })
})
describe('restricted expression input', () => {
  it.each(['import("js")', 'x=2; print(x)', 'x[0]', '{x:2}', 'f(x)=x', 'eval("1")', 'x^10000', '__import__(x)'])('rejects executable or oversized input %s', source => {
    expect(() => symbolicTree(source)).toThrow()
  })
  it('bounds source size and matrix shape', () => {
    expect(() => symbolicTree('x'.repeat(2001))).toThrow()
    expect(() => symbolicRequest('matrix', '1,2;3', options)).toThrow()
  })
})
