import { describe, expect, it } from 'vitest'
import { evaluateSpreadsheet, fitLinear, fitRegression, isSpreadsheetData, type SpreadsheetData } from './spreadsheet'

describe('spreadsheet formula evaluation', () => {
  it('recalculates referenced cells and linked workspace variables', () => {
    const data: SpreadsheetData = { cells: { A1: '3', B1: '=A1*2+a' } }
    expect(evaluateSpreadsheet(data, { a: 4 }, 4).B1.value).toBe(10)
    expect(evaluateSpreadsheet({ cells: { ...data.cells, A1: '5' } }, { a: 4 }, 4).B1.value).toBe(14)
  })

  it('marks circular and malformed cell references with an error', () => {
    const result = evaluateSpreadsheet({ cells: { A1: '=B1+1', B1: '=A1+1', C1: '=unknown+1' } })
    expect(result.A1.error).toBeTruthy()
    expect(result.B1.error).toBeTruthy()
    expect(result.C1.error).toBeTruthy()
  })

  it('shows text headers without errors but rejects them in numeric formulas', () => {
    const result = evaluateSpreadsheet({ cells: { A1: 'x', B1: 'y', A2: '1', B2: '=A2+1', C2: '=A1+1' } })
    expect(result.A1).toEqual({ raw: 'x', value: null })
    expect(result.B1).toEqual({ raw: 'y', value: null })
    expect(result.B2.value).toBe(2)
    expect(result.C2.error).toContain('A1 does not contain a number')
  })

  it('supports multiple sheets and formulas that depend on another sheet', () => {
    const data: SpreadsheetData = {
      cells: { A1: '9' },
      activeSheetId: 'main',
      sheets: [
        { id: 'main', name: 'Sheet 1', cells: { A1: '9', B1: "='Data Sheet'!A2*2" } },
        { id: 'data', name: 'Data Sheet', cells: { A2: '6' } },
      ],
    }
    expect(isSpreadsheetData(data)).toBe(true)
    expect(evaluateSpreadsheet(data, {}, 1, 'main').B1.value).toBe(12)
    expect(evaluateSpreadsheet(data, {}, 1, 'data').A2.value).toBe(6)
  })

  it('detects circular references across sheets', () => {
    const data: SpreadsheetData = { cells: {}, sheets: [
      { id: 'one', name: 'One', cells: { A1: '=Two!A1+1' } },
      { id: 'two', name: 'Two', cells: { A1: '=One!A1+1' } },
    ] }
    expect(evaluateSpreadsheet(data, {}, 1, 'one').A1.error).toContain('Circular')
  })

  it('fits a least-squares line and reports fit quality', () => {
    const fit = fitLinear([{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }])
    expect(fit?.slope).toBeCloseTo(2)
    expect(fit?.intercept).toBeCloseTo(1)
    expect(fit?.rSquared).toBeCloseTo(1)
  })

  it('supports quadratic and exponential fits and reports residuals in original y units', () => {
    const quadratic = fitRegression([{ x: -1, y: 4 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 1 }], 'quadratic')
    expect(quadratic?.predict(3)).toBeCloseTo(4)
    expect(quadratic?.rSquared).toBeCloseTo(1)
    const exponential = fitRegression([{ x: 0, y: 2 }, { x: 1, y: 4 }, { x: 2, y: 8 }], 'exponential')
    expect(exponential?.predict(3)).toBeCloseTo(16)
    expect(exponential?.rSquared).toBeCloseTo(1)
    expect(fitRegression([{ x: 0, y: -1 }, { x: 1, y: 2 }], 'exponential')).toBeNull()
  })
})
