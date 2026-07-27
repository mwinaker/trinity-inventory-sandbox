import { getSalesOrderBatQuantity } from '../shared/sales-order-shipping-policy.mjs'

function cleanString(value) {
  return String(value ?? '').trim()
}

export function normalizeSalesOrderItemType(value) {
  const itemType = cleanString(value).toLowerCase()
  if (itemType === 'shirt') return 'shirt'
  if (['misc', 'miscellaneous', 'miscellaneous product'].includes(itemType)) return 'misc'
  return 'bat'
}

export function getSalesOrderProductionQuantity(payload = {}) {
  return getSalesOrderBatQuantity(payload.lines)
}
