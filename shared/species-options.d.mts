export const billetSpeciesOptions: readonly ['Maple', 'Soft Maple', 'Birch', 'Ash']

export type BilletSpecies = (typeof billetSpeciesOptions)[number]

export function inferBilletSpeciesFromText(value: unknown): BilletSpecies | null
