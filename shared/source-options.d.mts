export const billetSourceOptions: readonly [
  "RJ's Tree Farms",
  'Great Lakes Veneer',
  'Maine Billets',
  'Cahan',
  'Champeau',
]

export type BilletSource = (typeof billetSourceOptions)[number]

export function inferBilletSourceFromText(value: unknown): BilletSource | null
