import { useEffect, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import { mathResultLatex } from '../lib/mathResultLatex'

export function MathResult({ value }: { value: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const latexLines = mathResultLatex(value)
  const latexKey = latexLines?.join('\n')

  useEffect(() => {
    if (!latexLines) return
    const sourceLines = value.split('\n')
    const fields = latexLines.map((latex, index) => {
      const field = new MathfieldElement()
      field.className = 'math-result-field'
      field.readOnly = true
      field.mathVirtualKeyboardPolicy = 'manual'
      field.setAttribute('aria-label', index === latexLines.length - 1 ? sourceLines.slice(index).join(' ') : sourceLines[index])
      field.value = latex
      hostRef.current?.appendChild(field)
      return field
    })
    return () => fields.forEach((field) => field.remove())
  }, [latexKey, value])

  if (!latexLines) return <p className="math-result-text">{value}</p>
  return <div className="math-result-host" ref={hostRef} />
}
