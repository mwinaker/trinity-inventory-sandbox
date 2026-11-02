function numericId(value) {
  return String(value ?? '').split('/').at(-1) ?? ''
}

function amount(value) {
  const number = Number(value?.shopMoney?.amount)
  return Number.isFinite(number) ? number : NaN
}

function classifyLine(line) {
  const title = String(line?.title ?? '').toLowerCase()
  const productType = String(line?.variant?.product?.productType ?? '').toLowerCase()
  const batWords = /\b(bats?|fungos?|trainers?|training|overload|underload|sledge|skinny|short heavy|long heavy|long light|blade barrel|puck knob|split grip|thick grip|big grip|torpedo|softball|trophy|boom stick|blem|stock|select|semi[ -]?custom|pro (?:model|order|select|birch|maple|ash|softball)|birch|maple|ash|el tit[aá]n)\b/i
  const modelCode = /\b(?:[a-z]{1,5}\d{1,4}[a-z]{0,3}|scvbb\s*(?:i|ii))\b/i
  const nonBatWords = /\b(shipping|freight|postage|t-?shirts?|tees?|hoodies?|hats?|caps?|lizard skin|lizard grip|bat grips?|bat wax|batting gloves?|stickers?|gift cards?|fees?|surcharges?)\b/i
  const apparel = /\b(t-?shirts?|tees?|hoodies?|hats?|caps?|batting gloves?)\b/i
  if (/\b\d+\s+(?:(?:game|training|trophy)\s+)?bats?\b/i.test(title) && apparel.test(title)) return 'review'
  if (nonBatWords.test(title) || nonBatWords.test(productType)) return 'non_bat'
  if (batWords.test(title) || modelCode.test(title) || /\b(baseball|softball|wood) bats?\b/i.test(productType)) {
    return 'bat'
  }
  return 'review'
}

function emptySummary() {
  return { average: null, median: null, batCount: 0, lineCount: 0, netBatSales: 0 }
}

function summarize(lines) {
  if (!lines.length) return emptySummary()
  const sorted = [...lines].sort((a, b) => a.pricePerBat - b.pricePerBat)
  const batCount = sorted.reduce((sum, line) => sum + line.batCount, 0)
  const netBatSales = sorted.reduce((sum, line) => sum + line.netBatSales, 0)
  const atRank = (rank) => {
    let count = 0
    for (const line of sorted) {
      count += line.batCount
      if (count >= rank) return line.pricePerBat
    }
    return sorted.at(-1).pricePerBat
  }
  const lower = atRank(Math.floor((batCount + 1) / 2))
  const upper = atRank(Math.ceil((batCount + 1) / 2))
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100
  return {
    average: round(netBatSales / batCount),
    median: round((lower + upper) / 2),
    batCount,
    lineCount: lines.length,
    netBatSales: round(netBatSales),
  }
}

/** Shopify's current line price is after all discounts, before tax, and excludes removed/refunded units. */
export function buildBatPriceStats(orders) {
  const included = { manual_sales_order_entry: [], online_store: [] }
  const review = []
  for (const order of Array.isArray(orders) ? orders : []) {
    const channel = order?.reportingCategory
    if (!Object.hasOwn(included, channel)) continue
    if (order?.test || order?.cancelledAt) continue
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(String(order?.financialStatus).toUpperCase())) {
      continue
    }
    for (const line of Array.isArray(order?.lineItems) ? order.lineItems : []) {
      const currentQuantity = Number(line?.currentQuantity)
      const net = amount(line?.priceAfterAllDiscountsBeforeTaxesSet)
      if (!Number.isInteger(currentQuantity) || currentQuantity <= 0 || !(net > 0)) continue
      const classification = classifyLine(line)
      if (classification === 'non_bat') continue
      const id = numericId(line.id)
      const title = String(line.title ?? '')
      const explicitBundle = /\b\d+\s+bats?\b|\b(?:trainer|training)\s+order\s*[-:]\s*\d+\b/i.test(title)
      const uncertainAllocation = /\b(deposit|remaining balance|see notes|check notes|match bat|copy bat)\b/i.test(title)
      const batCount = currentQuantity
      if (classification === 'review' || explicitBundle || uncertainAllocation) {
        review.push({ orderName: order.orderName, lineId: id, title: line.title, channel })
        continue
      }
      included[channel].push({
        orderName: order.orderName,
        lineId: id,
        batCount,
        netBatSales: net,
        pricePerBat: net / batCount,
      })
    }
  }
  return {
    definition: 'Paid, non-test bat lines at current Shopify value after all discounts and refunds, before shipping and tax. Each clearly identified bat unit receives an equal share of its line value. Free bats, bundles, and uncertain lines are excluded for review.',
    manual_sales_order_entry: summarize(included.manual_sales_order_entry),
    online_store: summarize(included.online_store),
    combined: summarize([...included.manual_sales_order_entry, ...included.online_store]),
    review,
  }
}
