import { useEffect, useRef } from 'react'
import { convertAsciiMathToLatex, MathfieldElement } from 'mathlive'
import { editorAsciiToGraphSyntax } from '../lib/equation'

interface EquationFieldProps {
  id: string
  label: string
  value: string
  latex?: string
  placeholder: string
  onChange: (value: string, latex: string) => void
}

export function EquationField({ id, label, value, latex, placeholder, onChange }: EquationFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<MathfieldElement | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const field = new MathfieldElement()
    field.className = 'equation-field'
    field.setAttribute('data-expression-id', id)
    field.setAttribute('aria-label', label)
    field.placeholder = convertAsciiMathToLatex(placeholder)
    field.mathVirtualKeyboardPolicy = 'manual'
    field.smartFence = true
    field.value = latex?.trim() ? latex : convertAsciiMathToLatex(value)

    const handleInput = () => onChangeRef.current(editorAsciiToGraphSyntax(field.getValue('ascii-math')), field.value)
    field.addEventListener('input', handleInput)
    containerRef.current?.appendChild(field)
    fieldRef.current = field

    return () => {
      field.removeEventListener('input', handleInput)
      field.remove()
      fieldRef.current = null
    }
  }, [id])

  useEffect(() => {
    const field = fieldRef.current
    const displayValue = latex?.trim() ? latex : convertAsciiMathToLatex(value)
    if (field && field.value !== displayValue) {
      field.setValue(displayValue, { silenceNotifications: true })
    }
  }, [value, latex])

  useEffect(() => {
    const field = fieldRef.current
    if (field) {
      field.setAttribute('aria-label', label)
      field.placeholder = convertAsciiMathToLatex(placeholder)
    }
  }, [label, placeholder])

  return <div className="equation-field-host" ref={containerRef} />
}
