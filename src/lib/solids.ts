export type SolidShape = 'sphere' | 'cube' | 'cylinder' | 'cone' | 'pyramid' | 'tetrahedron'
export interface SolidObject { id: string; shape: SolidShape; x: number; y: number; z: number; size: number; color: string; visible: boolean }
export interface VectorFieldObject { id: string; fx: string; fy: string; fz: string; color: string; visible: boolean }
export function isSolidObject(value: unknown): value is SolidObject {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SolidObject>
  return typeof item.id === 'string' && ['sphere', 'cube', 'cylinder', 'cone', 'pyramid', 'tetrahedron'].includes(item.shape ?? '')
    && [item.x, item.y, item.z, item.size].every((number) => typeof number === 'number' && Number.isFinite(number))
    && item.size! > 0 && typeof item.color === 'string' && typeof item.visible === 'boolean'
}

export function isVectorFieldObject(value: unknown): value is VectorFieldObject {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<VectorFieldObject>
  return typeof item.id === 'string' && [item.fx, item.fy, item.fz].every((part) => typeof part === 'string' && part.length > 0 && part.length <= 500)
    && typeof item.color === 'string' && typeof item.visible === 'boolean'
}

export type NetShape = 'cube' | 'pyramid' | 'tetrahedron' | 'cylinder' | 'cone'
export function printableNetSvg(shape: NetShape): string {
  let content = ''; let dimensions = ''
  const fold = 'fill="none" stroke="#555" stroke-width=".4" stroke-dasharray="2 1.5"'
  const cut = 'fill="none" stroke="#111" stroke-width=".6"'
  if (shape === 'cube') {
    content = `<path d="M70 15H110V55H150V95H110V175H70V135H70V95H30V55H70Z" ${cut}/><path d="M70 55H110M70 95H110M70 135H110M70 55V95M110 55V95" ${fold}/>`
    dimensions = 'Cube net · edge 40 mm'
  } else if (shape === 'pyramid') {
    // Right square pyramid: base edge 40, vertical height 40√2,
    // slant altitude sqrt((40√2)^2 + 20^2) = 60 mm.
    content = `<path d="M70 75L90 15L110 75L170 95L110 115L90 175L70 115L10 95Z" ${cut}/><path d="M70 75H110V115H70Z" ${fold}/>`
    dimensions = 'Square pyramid net · base edge 40 mm · face altitude 60 mm'
  } else if (shape === 'tetrahedron') {
    const h = 80*Math.sqrt(3)/2
    content = `<path d="M90 15L130 ${15+h}L170 ${15+2*h}H10L50 ${15+h}Z" ${cut}/><path d="M50 ${15+h}H130L90 ${15+2*h}Z" ${fold}/>`
    dimensions = 'Regular tetrahedron · edge 80 mm'
  } else if (shape === 'cylinder') {
    const width = 40*Math.PI
    content = `<rect x="25" y="75" width="${width}" height="40" ${cut}/><circle cx="88" cy="50" r="20" ${cut}/><circle cx="88" cy="140" r="20" ${cut}/>`
    dimensions = 'Cylinder · radius 20 mm · height 40 mm · seam length 40π mm'
  } else {
    const slant = Math.hypot(20,40); const angle = 2*Math.PI*20/slant
    const x1=90-slant*Math.sin(angle/2), x2=90+slant*Math.sin(angle/2), y=80-slant*Math.cos(angle/2)
    content = `<path d="M90 80L${x1} ${y}A${slant} ${slant} 0 0 1 ${x2} ${y}Z" ${cut}/><circle cx="90" cy="135" r="20" ${cut}/>`
    dimensions = 'Cone · radius 20 mm · height 40 mm · slant height 20√5 mm'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="210mm" viewBox="0 0 190 210"><rect width="190" height="210" fill="white"/>${content}<text x="95" y="190" text-anchor="middle" font-family="sans-serif" font-size="3.5">${dimensions}</text><text x="95" y="198" text-anchor="middle" font-family="sans-serif" font-size="3.5">Print at 100% · cut solid lines · fold dashed lines</text><text x="95" y="204" text-anchor="middle" font-family="sans-serif" font-size="3">Tape adjoining edges; tabs are not included. Dimensions are for this net.</text></svg>`
}
