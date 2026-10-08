// MathLive's AsciiMath puts adjacent factors after a closing bracket together,
// which mathjs can interpret as part of a fraction's denominator. Make that
// multiplication explicit before graph compilation.
export function editorAsciiToGraphSyntax(value: string): string {
  return value.replace(/\)\s*(?=[a-zA-Z0-9(])/g, ')*')
}
