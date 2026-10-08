export interface History<T> {
  past: T[]
  present: T
  future: T[]
  lastGroup: string | null
  lastChangeAt: number
}

const historyLimit = 80
const groupWindowMs = 1200

export function createHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [], lastGroup: null, lastChangeAt: 0 }
}

export function recordHistory<T>(history: History<T>, next: T, group: string | null = null, now = Date.now()): History<T> {
  if (next === history.present) return history
  const merge = group !== null && group === history.lastGroup && now - history.lastChangeAt <= groupWindowMs
  return {
    past: merge ? history.past : [...history.past, history.present].slice(-historyLimit),
    present: next,
    future: [],
    lastGroup: group,
    lastChangeAt: now,
  }
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    lastGroup: null,
    lastChangeAt: 0,
  }
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history
  return {
    past: [...history.past, history.present].slice(-historyLimit),
    present: history.future[0],
    future: history.future.slice(1),
    lastGroup: null,
    lastChangeAt: 0,
  }
}
