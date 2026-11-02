export function isProductionBatJob(job) {
  if (!job) return false
  if (String(job?.itemType ?? 'bat').toLowerCase() !== 'bat') return false
  // Older imported Shopify lines defaulted to "bat" when their item type was absent.
  const title = String(job?.productTitle ?? '')
  return !/\b(?:t[\s-]?shirts?|tee[\s-]?shirts?|shirts?)\b/i.test(title)
}

export function isActionableProductionJob(job) {
  if (!isProductionBatJob(job)) return false
  if (['complete', 'cancelled'].includes(String(job.productionStatus ?? '').toLowerCase())) return false
  if (['fulfilled', 'cancelled'].includes(String(job.fulfillmentStatus ?? '').toLowerCase())) return false
  return true
}
