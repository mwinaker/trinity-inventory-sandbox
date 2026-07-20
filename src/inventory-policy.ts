export const billetSuitabilityOptions = [
  'MLB capable',
  'Indy ball/International',
  'High school',
  'Trainer only',
  'Fungo only',
  'Trophy',
] as const

export type BilletSuitability = (typeof billetSuitabilityOptions)[number]
export type BilletWorkflowStatus = 'storage' | 'production'

export function normalizeBilletWorkflowStatus(value: unknown): BilletWorkflowStatus {
  if (value === 'production' || value === 'in_production' || value === 'consumed') {
    return 'production'
  }
  return 'storage'
}

export function reconcileBilletStatusForOrderAssignment(
  billetId: string,
  currentStatus: BilletWorkflowStatus,
  assignment: {
    previousBilletId: string
    nextBilletId: string
    assignedBilletIds: string[]
  },
): BilletWorkflowStatus {
  if (assignment.nextBilletId && billetId === assignment.nextBilletId) return 'production'
  if (
    assignment.previousBilletId &&
    billetId === assignment.previousBilletId &&
    !assignment.assignedBilletIds.includes(billetId)
  ) {
    return 'storage'
  }
  return currentStatus
}

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
