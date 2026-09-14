export type InvoicePaymentStatus = 'draft' | 'sent' | 'paid' | 'not_required' | 'pending' | 'partially_paid' | 'refunded' | 'voided'
export type PaymentJob = {
  financialStatus?: string | null
  invoiceStatus?: string | null
  shopifyOrderId?: string | null
  productionStatus?: string | null
  cancelledAt?: string | null
  test?: boolean
}
export function isFullyPaidFinancialStatus(value: unknown): boolean
export function isOrderJobPaid(job?: PaymentJob | null): boolean
export function getOrderJobInvoiceStatus(job?: PaymentJob | null): InvoicePaymentStatus
