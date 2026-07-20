export const billetSourceOptions: readonly [
  "RJ's Tree Farms",
  'Great Lakes Veneer',
  'Maine Billets',
  'Cahan',
  'Champeau',
]

export type BilletSource = (typeof billetSourceOptions)[number]

export const standardBilletLength: 37
export const standardBilletDiameter: 2.75
export const oversizedBilletDiameter: 2.79

export function isOversizedBilletSource(source: unknown): boolean
export function getBilletDimensionsForSource(source: unknown): {
  length: 37
  diameter: 2.75 | 2.79
}

export function inferBilletSourceFromText(value: unknown): BilletSource | null
