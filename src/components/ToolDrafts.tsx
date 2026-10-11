import { createContext, useContext, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react'

export const ToolDraftContext = createContext<{ values: Map<string, unknown>; namespace: string } | null>(null)

/** Session-only form state. Workers still unmount/cancel when a task is left. */
export function useToolDraft<T = undefined>(name: string, initial?: T): [T, Dispatch<SetStateAction<T>>] {
  const cache = useContext(ToolDraftContext)
  const key = `${cache?.namespace}:${name}`
  const [value, setValue] = useState<T>(() => cache?.values.has(key) ? cache.values.get(key) as T : initial as T)
  useLayoutEffect(() => { cache?.values.set(key, value) }, [cache, key, value])
  return [value, setValue]
}
