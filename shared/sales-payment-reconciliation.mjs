const successfulPaymentKinds = new Set(['SALE', 'CAPTURE'])

export const salesReportingCategories = Object.freeze([
  'manual_sales_order_entry',
  'online_store',
  'shop',
  'point_of_sale',
  'other_unresolved',
])

export const salesOrderStatusBuckets = Object.freeze([
  'paid_positive',
  'comped',
  'pending',
  'partially_paid',
  'refunded',
  'voided',
  'other',
])

function cleanString(value) {
  return String(value ?? '').trim()
}

function transactionAmount(transaction) {
  const value = Number(transaction?.amountSet?.shopMoney?.amount ?? transaction?.amount ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function transactionTimestamp(transaction) {
  const value = cleanString(transaction?.processedAt ?? transaction?.createdAt)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function isWebsiteOrderSource(sourceName) {
  return cleanString(sourceName).toLowerCase() === 'web'
}

export function isShopifyDraftOrderSource(sourceName) {
  return cleanString(sourceName).toLowerCase() === 'shopify_draft_order'
}

export function classifyPaidInvoiceSource(sourceName, hasInventoryMarker) {
  if (hasInventoryMarker) return 'inventory'
  if (isShopifyDraftOrderSource(sourceName)) return 'shopify_draft_order'
  return ''
}

export function classifySalesReportingCategory({ sourceName, appName, hasInventoryMarker }) {
  const normalizedSource = cleanString(sourceName).toLowerCase()
  const normalizedApp = cleanString(appName).toLowerCase()

  if (hasInventoryMarker || isShopifyDraftOrderSource(normalizedSource)) {
    return 'manual_sales_order_entry'
  }
  if (normalizedSource === 'web' && normalizedApp === 'online store') return 'online_store'
  if (normalizedApp === 'shop') return 'shop'
  if (normalizedSource === 'pos' || normalizedApp === 'point of sale') return 'point_of_sale'
  return 'other_unresolved'
}

export function getSalesOrderStatusBucket({ financialStatus, total, paidAt }) {
  const normalizedStatus = cleanString(financialStatus).toUpperCase()
  const numericTotal = Number(total)
  const safeTotal = Number.isFinite(numericTotal) ? numericTotal : 0

  if (normalizedStatus === 'REFUNDED' || normalizedStatus === 'PARTIALLY_REFUNDED') {
    return 'refunded'
  }
  if (normalizedStatus === 'VOIDED' || normalizedStatus === 'EXPIRED') return 'voided'
  if (safeTotal <= 0 && normalizedStatus === 'PAID') return 'comped'
  if (cleanString(paidAt) && safeTotal > 0) return 'paid_positive'
  if (normalizedStatus === 'PARTIALLY_PAID' || normalizedStatus === 'AUTHORIZED') {
    return 'partially_paid'
  }
  if (normalizedStatus === 'PENDING' || !normalizedStatus) return 'pending'
  return 'other'
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function createSalesSummaryBucket() {
  return { count: 0, value: 0 }
}

export function buildCanonicalSalesSummary(orders) {
  const categories = Object.fromEntries(
    salesReportingCategories.map((category) => [category, createSalesSummaryBucket()]),
  )
  const manualStatuses = Object.fromEntries(
    salesOrderStatusBuckets.map((status) => [status, createSalesSummaryBucket()]),
  )
  const total = createSalesSummaryBucket()

  for (const order of Array.isArray(orders) ? orders : []) {
    const category = salesReportingCategories.includes(order?.reportingCategory)
      ? order.reportingCategory
      : 'other_unresolved'
    const numericValue = Number(order?.currentOrderValue ?? order?.total)
    const value = Number.isFinite(numericValue) ? numericValue : 0

    total.count += 1
    total.value += value
    categories[category].count += 1
    categories[category].value += value

    if (category === 'manual_sales_order_entry') {
      const status = salesOrderStatusBuckets.includes(order?.statusBucket)
        ? order.statusBucket
        : 'other'
      manualStatuses[status].count += 1
      manualStatuses[status].value += value
    }
  }

  total.value = roundMoney(total.value)
  for (const bucket of Object.values(categories)) bucket.value = roundMoney(bucket.value)
  for (const bucket of Object.values(manualStatuses)) bucket.value = roundMoney(bucket.value)

  return { total, categories, manualStatuses }
}

export function buildSalesReconciliationChecks(orders, summary = buildCanonicalSalesSummary(orders)) {
  const rows = Array.isArray(orders) ? orders : []
  const orderIds = rows.map((order) => cleanString(order?.orderId)).filter(Boolean)
  const duplicateOrderIds = [...new Set(orderIds.filter((id, index) => orderIds.indexOf(id) !== index))]
  const unresolvedOrderNames = rows
    .filter((order) => order?.reportingCategory === 'other_unresolved')
    .map((order) => cleanString(order?.orderName) || cleanString(order?.orderId))
    .filter(Boolean)
  const unresolvedManualRepOrderNames = rows
    .filter(
      (order) =>
        order?.reportingCategory === 'manual_sales_order_entry' &&
        cleanString(order?.salesRepResolution) === 'unresolved',
    )
    .map((order) => cleanString(order?.orderName) || cleanString(order?.orderId))
    .filter(Boolean)
  const categoryCount = Object.values(summary.categories).reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  )
  const categoryValue = roundMoney(
    Object.values(summary.categories).reduce((sum, bucket) => sum + bucket.value, 0),
  )
  const manualStatusCount = Object.values(summary.manualStatuses).reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  )
  const manualStatusValue = roundMoney(
    Object.values(summary.manualStatuses).reduce((sum, bucket) => sum + bucket.value, 0),
  )
  const checks = [
    {
      key: 'unique_order_ids',
      ok: duplicateOrderIds.length === 0 && orderIds.length === rows.length,
      message:
        duplicateOrderIds.length === 0 && orderIds.length === rows.length
          ? 'Every completed order has one unique Shopify order ID.'
          : 'One or more completed orders is missing a unique Shopify order ID.',
    },
    {
      key: 'exclusive_categories',
      ok: categoryCount === summary.total.count,
      message: 'Channel counts sum to the all-order count.',
    },
    {
      key: 'category_value_total',
      ok: Math.abs(categoryValue - summary.total.value) < 0.005,
      message: 'Channel values sum to the all-order value.',
    },
    {
      key: 'manual_status_count',
      ok: manualStatusCount === summary.categories.manual_sales_order_entry.count,
      message: 'Manual-order status counts sum to the manual-order count.',
    },
    {
      key: 'manual_status_value',
      ok:
        Math.abs(manualStatusValue - summary.categories.manual_sales_order_entry.value) < 0.005,
      message: 'Manual-order status values sum to the manual-order value.',
    },
    {
      key: 'resolved_channels',
      ok: unresolvedOrderNames.length === 0,
      message:
        unresolvedOrderNames.length === 0
          ? 'Every completed order has a resolved reporting category.'
          : `${unresolvedOrderNames.length} completed order(s) need channel review.`,
    },
    {
      key: 'resolved_manual_statuses',
      ok: summary.manualStatuses.other.count === 0,
      message:
        summary.manualStatuses.other.count === 0
          ? 'Every manual order has a resolved status.'
          : `${summary.manualStatuses.other.count} manual order(s) need status review.`,
    },
  ]

  return {
    ok: checks.every((check) => check.ok),
    checks,
    duplicateOrderIds,
    unresolvedOrderNames,
    unresolvedManualRepOrderNames,
  }
}

export function getSuccessfulPaymentTimestamp(transactions, orderTotal) {
  const requiredAmount = Number(orderTotal)
  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) return ''

  const successfulPayments = (Array.isArray(transactions) ? transactions : [])
    .filter((transaction) => {
      const kind = cleanString(transaction?.kind).toUpperCase()
      const status = cleanString(transaction?.status).toUpperCase()
      return successfulPaymentKinds.has(kind) && status === 'SUCCESS'
    })
    .map((transaction) => ({
      amount: transactionAmount(transaction),
      processedAt: cleanString(transaction?.processedAt ?? transaction?.createdAt),
      timestamp: transactionTimestamp(transaction),
    }))
    .filter((transaction) => transaction.amount > 0 && transaction.timestamp > 0)
    .sort((first, second) => first.timestamp - second.timestamp)

  let paidAmount = 0
  for (const payment of successfulPayments) {
    paidAmount += payment.amount
    if (paidAmount + 0.005 >= requiredAmount) return payment.processedAt
  }

  return ''
}
