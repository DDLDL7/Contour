export interface OdePoint { t: number; values: number[] }
export interface OdeSolution { points: OdePoint[]; steps: number; rejected: number; tolerance: number }

/** Adaptive RK4 step doubling with Richardson error estimate. */
export function solveOde(field: (t: number, values: number[]) => number[], start: number, end: number, initial: number[], tolerance = 1e-6): OdeSolution {
  if (![start, end, ...initial, tolerance].every(Number.isFinite) || initial.length < 1 || initial.length > 3 || tolerance < 1e-10 || tolerance > .01) throw new Error('Use finite initial values and a tolerance between 1e-10 and 0.01.')
  const check = (values: number[]) => {
    if (values.length !== initial.length || values.some(value => !Number.isFinite(value) || Math.abs(value) > 1e12)) throw new Error('The solution became non-finite or exceeded the supported range. Shorten the interval.')
    return values
  }
  function rk(t: number, values: number[], h: number) {
    const k1 = check(field(t, values))
    const k2 = check(field(t + h / 2, values.map((v, i) => v + h * k1[i] / 2)))
    const k3 = check(field(t + h / 2, values.map((v, i) => v + h * k2[i] / 2)))
    const k4 = check(field(t + h, values.map((v, i) => v + h * k3[i])))
    return check(values.map((v, i) => v + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6))
  }
  let t = start; let values = [...initial]; let h = (end - start) / 100
  let steps = 0; let rejected = 0
  const points: OdePoint[] = [{ t, values: [...values] }]
  while (Math.abs(end - t) > Math.max(1, Math.abs(end)) * 1e-14) {
    if (++steps > 20000) throw new Error('Solver reached its 20,000-step limit. Shorten the interval or relax tolerance.')
    if (Math.abs(h) > Math.abs(end - t)) h = end - t
    if (Math.abs(h) < Math.max(1, Math.abs(t)) * 1e-14) throw new Error('Step size became too small near a singularity.')
    const whole = rk(t, values, h)
    const half = rk(t + h / 2, rk(t, values, h / 2), h / 2)
    const error = Math.max(...half.map((value, i) => Math.abs(value - whole[i]) / (15 * (1 + Math.max(Math.abs(values[i]), Math.abs(value))))))
    if (error <= tolerance) {
      t += h; values = check(half.map((v, i) => v + (v - whole[i]) / 15))
      points.push({ t, values: [...values] })
    } else rejected++
    h *= error === 0 ? 2 : Math.min(2, Math.max(.1, .9 * (tolerance / error) ** .2))
  }
  return { points, steps, rejected, tolerance }
}
