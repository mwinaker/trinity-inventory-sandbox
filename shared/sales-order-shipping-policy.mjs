const shippingSpeedLabels = Object.freeze({
  standard: 'Standard',
  fast: 'Fast',
  really_fast: 'Really fast',
  comped: 'Comped',
})

export const salesOrderShippingSpeeds = Object.freeze(Object.keys(shippingSpeedLabels))

function normalizeQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

export function getSalesOrderBatQuantity(lines = []) {
  if (!Array.isArray(lines)) return 0

  return lines.reduce((total, line) => {
    const itemType = String(line?.itemType ?? '').trim().toLowerCase()
    if (itemType && itemType !== 'bat') return total
    return total + normalizeQuantity(line?.quantity || 1)
  }, 0)
}

export function normalizeSalesOrderShippingSpeed(value) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return Object.prototype.hasOwnProperty.call(shippingSpeedLabels, key) ? key : 'standard'
}

export function getSalesOrderShippingQuote(shippingSpeed, batQuantity) {
  const key = normalizeSalesOrderShippingSpeed(shippingSpeed)
  const quantity = normalizeQuantity(batQuantity)
  let amount = '0.00'
  let tierLabel = 'any bat quantity'

  if (key === 'standard') {
    if (quantity <= 3) {
      amount = '15.00'
      tierLabel = 'up to 3 bats'
    } else if (quantity <= 6) {
      amount = '30.00'
      tierLabel = '4–6 bats'
    } else {
      amount = '50.00'
      tierLabel = '7+ bats'
    }
  } else if (key === 'fast') {
    amount = quantity > 3 ? '100.00' : '50.00'
    tierLabel = quantity > 3 ? '4+ bats' : 'up to 3 bats'
  } else if (key === 'really_fast') {
    amount = quantity > 3 ? '100.00' : '75.00'
    tierLabel = quantity > 3 ? '4+ bats' : 'up to 3 bats'
  }

  return {
    key,
    label: shippingSpeedLabels[key],
    amount,
    batQuantity: quantity,
    tierLabel,
  }
}

export function formatSalesOrderShippingOptionLabel(shippingSpeed, batQuantity) {
  const quote = getSalesOrderShippingQuote(shippingSpeed, batQuantity)
  return `${quote.label} — $${quote.amount} (${quote.tierLabel})`
}

export function formatSalesOrderBatCount(batQuantity) {
  const quantity = normalizeQuantity(batQuantity)
  return `${quantity} ${quantity === 1 ? 'bat' : 'bats'}`
}
