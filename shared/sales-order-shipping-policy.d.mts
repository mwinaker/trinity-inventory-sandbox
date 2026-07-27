export type SalesOrderShippingSpeed = 'standard' | 'fast' | 'really_fast' | 'comped'

export type SalesOrderShippingQuote = {
  key: SalesOrderShippingSpeed
  label: string
  amount: string
  batQuantity: number
  tierLabel: string
}

export const salesOrderShippingSpeeds: readonly SalesOrderShippingSpeed[]

export function getSalesOrderBatQuantity(
  lines?: Array<{ itemType?: unknown; quantity?: unknown }>,
): number

export function normalizeSalesOrderShippingSpeed(value: unknown): SalesOrderShippingSpeed

export function getSalesOrderShippingQuote(
  shippingSpeed: unknown,
  batQuantity: unknown,
): SalesOrderShippingQuote

export function formatSalesOrderShippingOptionLabel(
  shippingSpeed: unknown,
  batQuantity: unknown,
): string

export function formatSalesOrderBatCount(batQuantity: unknown): string
