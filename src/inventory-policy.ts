export const billetSuitabilityOptions = [
  'MLB capable',
  'Indy ball/International',
  'High school',
  'Trainer only',
  'Trophy',
] as const

export type BilletSuitability = (typeof billetSuitabilityOptions)[number]

export function normalizeBilletSuitability(
  value: unknown,
  legacy: { mlbEligible?: boolean; trophyEligible?: boolean } = {},
): BilletSuitability[] {
  if (Array.isArray(value)) {
    const recognized = billetSuitabilityOptions.filter((option) => value.includes(option))
    return recognized.includes('Trophy') ? ['Trophy'] : recognized
  }

  if (legacy.trophyEligible) return ['Trophy']
  if (legacy.mlbEligible) return ['MLB capable']
  return []
}

export function updateBilletSuitability(
  current: BilletSuitability[],
  category: BilletSuitability,
  selected: boolean,
) {
  if (!selected) return current.filter((item) => item !== category)
  if (category === 'Trophy') return ['Trophy'] satisfies BilletSuitability[]

  return billetSuitabilityOptions.filter(
    (option) => option !== 'Trophy' && (option === category || current.includes(option)),
  )
}

export function isValidWorkableWeightRange(minValue: string, maxValue: string) {
  const min = Number(minValue)
  const max = Number(maxValue)
  return (
    minValue.trim() !== '' &&
    maxValue.trim() !== '' &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    max >= min
  )
}
