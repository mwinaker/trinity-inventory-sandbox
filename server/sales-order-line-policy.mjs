function cleanString(value) {
  return String(value ?? '').trim()
}

export function normalizeSalesOrderItemType(value) {
  return cleanString(value).toLowerCase() === 'shirt' ? 'shirt' : 'bat'
}

export function getSalesOrderProductionQuantity(payload = {}) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []

  return lines.reduce((total, line) => {
    if (normalizeSalesOrderItemType(line?.itemType) === 'shirt') return total
    const quantity = Number(line?.quantity || 1)
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0)
  }, 0)
}
