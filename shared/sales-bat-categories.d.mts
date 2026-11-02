export type SalesBatCategory = 'game' | 'training' | 'trophy' | 'fungo' | 'review'
export type SalesBatCategorySelection = SalesBatCategory | 'all'

export type SalesBatCategoryLine = {
  orderId: string
  orderName: string
  lineId: string
  title: string
  category: SalesBatCategory
  basis: string
  channel: 'manual_sales_order_entry' | 'online_store'
  repKey: string
  repLabel: string
  quantity: number
  shopifyQuantity: number
  value: number | null
  saleStatus: 'paid' | 'comped' | 'pending'
}

export type SalesBatCategoryBucket = {
  category: SalesBatCategorySelection
  orderCount: number
  paidUnits: number
  compedUnits: number
  pendingUnits: number
  netSales: number
  average: number | null
  median: number | null
  reviewLines: number
}

export function summarizeSalesBatCategoryLines(
  lines: SalesBatCategoryLine[],
): Record<SalesBatCategorySelection, SalesBatCategoryBucket>
