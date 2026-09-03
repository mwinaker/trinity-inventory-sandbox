export function getProgressiveListSlice<T>(items: readonly T[], limit: number): T[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
  return items.slice(0, safeLimit)
}

export function getNextProgressiveListLimit(
  currentLimit: number,
  totalItems: number,
  batchSize: number,
) {
  const safeCurrentLimit = Number.isFinite(currentLimit)
    ? Math.max(0, Math.floor(currentLimit))
    : 0
  const safeTotalItems = Number.isFinite(totalItems) ? Math.max(0, Math.floor(totalItems)) : 0
  const safeBatchSize = Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 1

  return Math.min(safeTotalItems, safeCurrentLimit + safeBatchSize)
}
