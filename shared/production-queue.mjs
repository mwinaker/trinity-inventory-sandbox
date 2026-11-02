import { isOrderJobPaid } from './order-payment-status.mjs'

export function isProductionBatJob(job) {
  if (!job) return false
  if (String(job?.itemType ?? 'bat').toLowerCase() !== 'bat') return false
  // Older imported Shopify lines defaulted to "bat" when their item type was absent.
  const title = String(job?.productTitle ?? '')
  return !/^(?:(?:t[\s-]?shirts?|tee[\s-]?shirts?|shirts?)\b|(?:trinity signature|tbc)\b.*\bt[\s-]?shirt\b|(?:pro order\s*-\s*)?(?:international\s+)?shipping\b|lizard skin\b)/i.test(title)
}

export function isActionableProductionJob(job) {
  if (!isProductionBatJob(job)) return false
  if (job.test || job.cancelledAt) return false
  if (['complete', 'cancelled'].includes(String(job.productionStatus ?? '').toLowerCase())) return false
  if (['fulfilled', 'cancelled'].includes(String(job.fulfillmentStatus ?? '').toLowerCase())) return false
  if (['refunded', 'voided', 'expired'].includes(String(job.financialStatus ?? '').toLowerCase())) return false
  return true
}

export function isConfirmedProductionJob(job) {
  return isActionableProductionJob(job) && isOrderJobPaid(job)
}
