import { describe, expect, it } from 'vitest'
import { createHistory, recordHistory, redoHistory, undoHistory } from './history'

describe('project undo and redo', () => {
  it('groups a short typing burst into one undo step', () => {
    let history = createHistory('y = ')
    history = recordHistory(history, 'y = x', 'expression:1', 100)
    history = recordHistory(history, 'y = x^', 'expression:1', 300)
    history = recordHistory(history, 'y = x^2', 'expression:1', 500)
    expect(history.past).toEqual(['y = '])
    expect(undoHistory(history).present).toBe('y = ')
    expect(redoHistory(undoHistory(history)).present).toBe('y = x^2')
  })

  it('keeps separate edits and clears redo after a new branch', () => {
    let history = createHistory(0)
    history = recordHistory(history, 1, 'slider:a', 100)
    history = recordHistory(history, 2, 'slider:a', 2000)
    expect(history.past).toEqual([0, 1])
    history = undoHistory(history)
    expect(history.present).toBe(1)
    expect(history.future).toEqual([2])
    history = recordHistory(history, 3, null, 3000)
    expect(history.future).toEqual([])
    expect(redoHistory(history).present).toBe(3)
  })

  it('does not add a history entry for an unchanged value', () => {
    const history = createHistory({ title: 'A' })
    expect(recordHistory(history, history.present)).toBe(history)
    expect(undoHistory(history)).toBe(history)
  })
})
