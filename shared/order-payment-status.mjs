function status(value) {
  return String(value ?? '').trim().toUpperCase()
}

// A number, invoice email or old notification is never proof of payment.
export function isFullyPaidFinancialStatus(value) {
  return status(value) === 'PAID'
}

export function isOrderJobPaid(job) {
  return !job?.test && !job?.cancelledAt && job?.productionStatus !== 'cancelled' &&
    isFullyPaidFinancialStatus(job?.financialStatus)
}

export function getOrderJobInvoiceStatus(job) {
  const financialStatus = status(job?.financialStatus)
  if (job?.cancelledAt || job?.productionStatus === 'cancelled') return 'voided'
  if (isOrderJobPaid(job)) return 'paid'
  if (financialStatus === 'PARTIALLY_PAID') return 'partially_paid'
  if (financialStatus === 'REFUNDED' || financialStatus === 'PARTIALLY_REFUNDED') return 'refunded'
  if (financialStatus === 'VOIDED' || financialStatus === 'EXPIRED') return 'voided'
  if (job?.invoiceStatus === 'sent') return 'sent'
  if (['PENDING', 'AUTHORIZED', 'UNPAID'].includes(financialStatus) || job?.shopifyOrderId) return 'pending'
  if (job?.invoiceStatus === 'not_required') return 'not_required'
  return 'draft'
}
