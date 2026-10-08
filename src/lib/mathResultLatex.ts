import { convertAsciiMathToLatex } from 'mathlive'

const proseResults = new Set([
  'All real x satisfy this equation.',
  'No solution.',
  'No sign-changing real roots found in this interval.',
  'No common finite limit detected',
])

function normalizeSymbols(value: string): string {
  const subscripts: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' }
  return value
    .replace(/([a-zA-Zλ])([₀-₉]+)/gu, (_, symbol: string, digits: string) => `${symbol === 'λ' ? 'lambda' : symbol}_${[...digits].map((digit) => subscripts[digit]).join('')}`)
    .replace(/λ(?=\d)/gu, 'lambda_')
    .replace(/([xv])(?=\d+\s*=)/gu, '$1_')
    .replace(/R²/g, 'R^2')
    .replace(/A⁻¹/g, 'A^(-1)')
    .replace(/σ/g, 'sigma')
    .replace(/∇/g, 'nabla ')
    .replace(/−/g, '-')
}

function math(value: string): string {
  return convertAsciiMathToLatex(normalizeSymbols(value))
}

function matrix(lines: string[]): string | null {
  const rows = lines.map((line) => /^\s*\[([^\[\]]*)\]\s*$/.exec(line)?.[1].split(',').map((cell) => cell.trim()))
  if (rows.some((row) => !row || !row.length || row.some((cell) => !cell)) || rows.some((row) => row!.length !== rows[0]!.length)) return null
  return String.raw`\begin{bmatrix}` + rows.map((row) => row!.map(math).join(' & ')).join(String.raw` \\ `) + String.raw`\end{bmatrix}`
}

function line(value: string): string {
  const vector = /^([λv]\d+)\s*=\s*\[([^\]]+)\]$/.exec(value)
  if (vector) return `${math(vector[1])} = ${matrix([`[${vector[2]}]`])}`
  return math(value)
}

/** Convert the calculator's display strings to typeset lines without changing their numeric values. */
export function mathResultLatex(value: string): string[] | null {
  if (proseResults.has(value)) return null
  const lines = value.split('\n')
  const bareMatrix = matrix(lines)
  if (bareMatrix) return [bareMatrix]

  const inverseStart = lines.findIndex((entry) => entry.includes('A⁻¹ ='))
  if (inverseStart >= 0) {
    const firstRow = lines[inverseStart].split('A⁻¹ =')[1].trim()
    const inverse = matrix([firstRow, ...lines.slice(inverseStart + 1)])
    if (inverse) return [math(lines[0]), String.raw`A^{-1} = ` + inverse]
  }

  const gradient = /^∇f\s*=\s*\[([^\]]+)\]$/.exec(value)
  if (gradient) return [String.raw`\nabla f = \left\langle ` + gradient[1].split(',').map((part) => math(part.trim())).join(', ') + String.raw` \right\rangle`]

  return lines.map(line)
}
