export type SolidShape = 'sphere' | 'cube' | 'cylinder' | 'cone' | 'pyramid'
export interface SolidObject { id: string; shape: SolidShape; x: number; y: number; z: number; size: number; color: string; visible: boolean }
export interface VectorFieldObject { id: string; fx: string; fy: string; fz: string; color: string; visible: boolean }
export function isSolidObject(value: unknown): value is SolidObject {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SolidObject>
  return typeof item.id === 'string' && ['sphere', 'cube', 'cylinder', 'cone', 'pyramid'].includes(item.shape ?? '')
    && [item.x, item.y, item.z, item.size].every((number) => typeof number === 'number' && Number.isFinite(number))
    && item.size! > 0 && typeof item.color === 'string' && typeof item.visible === 'boolean'
}

export function isVectorFieldObject(value: unknown): value is VectorFieldObject {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<VectorFieldObject>
  return typeof item.id === 'string' && [item.fx, item.fy, item.fz].every((part) => typeof part === 'string' && part.length > 0 && part.length <= 500)
    && typeof item.color === 'string' && typeof item.visible === 'boolean'
}

export function printableNetSvg(shape: 'cube' | 'pyramid'): string {
  if (shape === 'cube') return `<svg xmlns="http://www.w3.org/2000/svg" width="240mm" height="320mm" viewBox="0 0 240 320"><rect width="240" height="320" fill="white"/><path d="M80 0H160V80H240V160H160V320H80V240H80V160H0V80H80Z" fill="none" stroke="#111" stroke-width="1.4"/><path d="M80 80H160M80 160H160M80 240H160M80 80V160M160 80V160" fill="none" stroke="#333" stroke-width=".8" stroke-dasharray="4 3"/><text x="120" y="312" text-anchor="middle" font-family="sans-serif" font-size="5">Cube net · cut solid outline, fold dashed lines</text></svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="300mm" viewBox="0 0 300 300"><rect width="300" height="300" fill="white"/><path d="M100 100L150 20L200 100L280 150L200 200L150 280L100 200L20 150Z" fill="none" stroke="#111" stroke-width="1.5"/><path d="M100 100H200V200H100Z" fill="none" stroke="#333" stroke-width=".8" stroke-dasharray="4 3"/><path d="M100 100L150 20L200 100M200 100L280 150L200 200M200 200L150 280L100 200M100 200L20 150L100 100" fill="none" stroke="#333" stroke-width=".8" stroke-dasharray="4 3"/><text x="150" y="294" text-anchor="middle" font-family="sans-serif" font-size="5">Square pyramid net · cut solid outline, fold dashed lines</text></svg>`
}
