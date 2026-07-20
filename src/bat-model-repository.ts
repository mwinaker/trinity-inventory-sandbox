export function mergeBatModelSources<T extends { id: string }>(
  ...sources: ReadonlyArray<ReadonlyArray<T>>
) {
  const modelsById = new Map<string, T>()

  for (const source of sources) {
    for (const model of source) {
      modelsById.set(model.id, model)
    }
  }

  return Array.from(modelsById.values())
}

export function upsertBatModelOverride<T extends { id: string }>(
  overrides: T[],
  nextOverride: T,
) {
  return [nextOverride, ...overrides.filter((model) => model.id !== nextOverride.id)]
}

export function isValidEditableWeightRange(minimum: string, maximum: string) {
  const minimumValue = minimum.trim() === '' ? null : Number(minimum)
  const maximumValue = maximum.trim() === '' ? null : Number(maximum)

  if (minimumValue !== null && (!Number.isFinite(minimumValue) || minimumValue < 0)) return false
  if (maximumValue !== null && (!Number.isFinite(maximumValue) || maximumValue < 0)) return false

  return minimumValue === null || maximumValue === null || minimumValue <= maximumValue
}

export function getOptionalWeightValue(value: string) {
  if (value.trim() === '') return undefined
  return Number(value)
}
