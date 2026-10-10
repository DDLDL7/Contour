import { afterEach, expect, it, vi } from 'vitest'
import { loadProjectState, preserveStoredProject, PROJECT_KEY, PROJECT_BACKUP_KEY, PROJECT_RECOVERY_KEY, saveProject, starterProject, storedProjectData } from './project'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
it('retains the previous valid save as a recovery backup', () => {
  const first = { ...starterProject(), title: 'First save' }
  saveProject(first); saveProject({ ...first, title: 'Second save' })
  expect(JSON.parse(localStorage.getItem(PROJECT_BACKUP_KEY)!)).toEqual(first)
  expect(loadProjectState().warning).toBe('')
})
it.each(['{"title":', JSON.stringify({ ...starterProject(), version: 999 }), JSON.stringify({ ...starterProject(), notebook: [{ kind: 'unknown' }] })])('does not overwrite damaged or unsupported stored data', raw => {
  localStorage.setItem(PROJECT_KEY, raw)
  const state = loadProjectState()
  expect(state.warning).toContain('paused')
  expect(() => saveProject(state.project)).toThrow('recovery')
  expect(localStorage.getItem(PROJECT_KEY)).toBe(raw)
  expect(JSON.parse(storedProjectData()).project).toBe(raw)
})
it('loads a valid backup and archives damaged bytes only on explicit recovery', () => {
  const backup = { ...starterProject(), title: 'Recovered activity' }
  localStorage.setItem(PROJECT_BACKUP_KEY, JSON.stringify(backup))
  localStorage.setItem(PROJECT_KEY, 'damaged bytes')
  const state = loadProjectState()
  expect(state.project.title).toBe('Recovered activity')
  expect(localStorage.getItem(PROJECT_KEY)).toBe('damaged bytes')
  preserveStoredProject(); saveProject(state.project)
  expect(JSON.parse(localStorage.getItem(PROJECT_RECOVERY_KEY)!)[0].raw).toBe('damaged bytes')
  expect(loadProjectState().warning).toBe('')
})
it('leaves the original intact when quota prevents archiving or backup', () => {
  localStorage.setItem(PROJECT_KEY, 'important damaged bytes')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  expect(preserveStoredProject).toThrow('Full')
  expect(localStorage.getItem(PROJECT_KEY)).toBe('important damaged bytes')
})
it('preserves every explicitly recovered record across repeated failures', () => {
  for (const raw of ['first damaged record', 'second damaged record']) { localStorage.setItem(PROJECT_KEY, raw); preserveStoredProject() }
  expect(JSON.parse(localStorage.getItem(PROJECT_RECOVERY_KEY)!).map((entry: { raw: string }) => entry.raw)).toEqual(['first damaged record', 'second damaged record'])
})
it('keeps the original if the primary write fails after successful archiving', () => {
  localStorage.setItem(PROJECT_KEY, 'original damaged record')
  preserveStoredProject()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  expect(() => saveProject(starterProject())).toThrow('Full')
  expect(localStorage.getItem(PROJECT_KEY)).toBe('original damaged record')
  expect(JSON.parse(localStorage.getItem(PROJECT_RECOVERY_KEY)!)[0].raw).toBe('original damaged record')
})
