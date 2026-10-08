import { describe, expect, it } from 'vitest'
import { parseProjectFile } from './project'

describe('project files', () => {
  it('preserves the entered LaTeX alongside graph syntax', () => {
    const source = {
      title: 'Fractions',
      parameterA: 1,
      updatedAt: new Date().toISOString(),
      expressions: [{
        id: 'fraction',
        text: 'y=(x^2+1)/(2)',
        latex: String.raw`y=\frac{x^2+1}{2}`,
        color: '#286fc0',
        visible: true,
      }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0]).toMatchObject({
      text: source.expressions[0].text,
      latex: source.expressions[0].latex,
    })
  })

  it('still opens older project files without LaTeX', () => {
    const source = {
      title: 'Older project',
      parameterA: 1,
      expressions: [{ id: 'curve', text: 'y = sin(x)', color: '#286fc0', visible: true }],
    }

    expect(parseProjectFile(JSON.stringify(source)).expressions[0].latex).toBeUndefined()
  })
})
