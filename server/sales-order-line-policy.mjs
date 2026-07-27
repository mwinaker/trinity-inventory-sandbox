import { getSalesOrderBatQuantity } from '../shared/sales-order-shipping-policy.mjs'

function cleanString(value) {
  return String(value ?? '').trim()
}

export function normalizeSalesOrderItemType(value) {
  return cleanString(value).toLowerCase() === 'shirt' ? 'shirt' : 'bat'
}

export function getSalesOrderProductionQuantity(payload = {}) {
  return getSalesOrderBatQuantity(payload.lines)
}
