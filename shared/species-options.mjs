export const billetSpeciesOptions = ['Maple', 'Soft Maple', 'Birch', 'Ash']

const billetSpeciesDetectionOptions = ['Soft Maple', 'Maple', 'Birch', 'Ash']

export function inferBilletSpeciesFromText(value) {
  const normalized = String(value ?? '').toLowerCase()
  return (
    billetSpeciesDetectionOptions.find((species) =>
      normalized.includes(species.toLowerCase()),
    ) ?? null
  )
}
