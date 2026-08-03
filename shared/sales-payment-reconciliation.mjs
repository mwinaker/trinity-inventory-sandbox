const successfulPaymentKinds = new Set(['SALE', 'CAPTURE'])

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
