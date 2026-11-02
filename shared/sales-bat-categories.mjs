const categoryKeys = ['game', 'training', 'trophy', 'fungo']

function money(value) {
  const number = Number(value?.shopMoney?.amount)
  return Number.isFinite(number) ? number : NaN
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function numericId(value) {
  return String(value ?? '').split('/').at(-1) ?? ''
}

function lineAttributes(line) {
  return Object.fromEntries((Array.isArray(line?.customAttributes) ? line.customAttributes : [])
    .map((attribute) => [String(attribute?.key ?? '').toLowerCase(), String(attribute?.value ?? '')]))
}

// Explicit owner resolutions from the approved October 4 all-channel audit.
const ownerTrainingLineIds = new Set([
  '17087447564527', '17087447597295', '17087447630063', '17197609943279',
  '17209193791727', '17317589549295', '17570987278575',
  '17576294285551', '17576294318319', '17576294351087', '17576294383855',
  '17897522757871',
])
const ownerGameLineIds = new Set([
  '17197302677743', '17443134406895', '17466232996079', '17623856382191',
  '17782439477487', '17313490632943',
  '17432854102255',
])
const historicalDocumentedQuantities = new Map([
  ['17197609943279', 8], ['17209193791727', 4],
  ['17313490632943', 4], ['17317589549295', 3], ['17897522757871', 15],
])
const historicalPurposeReviewLineIds = new Set([
  '17061388681455', '17061388714223', '17345740898543',
  '17533758144751', '17564556460271', '17913895911663',
])

/** Classify physical purpose from line-level evidence, never from an order's overall label. */
export function classifySalesBatLine(line) {
  const title = String(line?.title ?? '').trim()
  const attributes = lineAttributes(line)
  const productTitle = String(line?.variant?.product?.title ?? attributes.trinity_product_title ?? '')
  const productType = String(line?.variant?.product?.productType ?? '')
  const model = String(attributes.trinity_model ?? attributes._bat_model ?? '')
  const text = `${title} ${productTitle} ${productType} ${model}`.toLowerCase()
  const id = numericId(line?.id)
  const nonBat = /\b(shipping|freight|postage|t-?shirts?|tees?|hoodies?|hats?|caps?|bat grips?|lizard (?:skin|grip)|bat wax|batting gloves?|stickers?|gift cards?|fees?|surcharges?)\b/i
  if (/\btest only\b|\bdo not produce\b/i.test(title)) return { category: 'non_bat', basis: 'Synthetic test line' }
  if (/\b\d+\s+(?:game |training |trophy )?bats?\b/i.test(title) && nonBat.test(title) &&
    !/\bshipping\b/i.test(title)) return { category: 'review', basis: 'Bat and non-bat items share one invoice line' }
  if (title.toLowerCase() === 'shipping chosen bats' || nonBat.test(title) || nonBat.test(productType)) {
    return { category: 'non_bat', basis: 'Non-bat item or fee' }
  }
  if (ownerTrainingLineIds.has(id)) return { category: 'training', basis: 'Owner-resolved historical line' }
  if (ownerGameLineIds.has(id)) return { category: 'game', basis: 'Owner-resolved historical line' }
  if (historicalPurposeReviewLineIds.has(id)) return { category: 'review', basis: 'Historical purpose remains unconfirmed' }

  const hasFungo = /\bfungos?\b/.test(text)
  const hasTraining = /\btrainers?\b|\btraining\b|\boverload\b|\bunderload\b|\bshort[ -]heavy\b|\blong[ -]heavy\b|\blong[ -]light\b|\bskinny\b|\bblade[ -]barrel\b|\bthick[ -]grip\b|\bbig[ -]grip\b|\bsplit[ -]grip\b|\btowel bat\b|\bsledge\b|\bone[ -]hand\b|\bon[ -]deck bat\b|\bx[ -]load\b|\bbase oc\b|\bbso c\b/.test(text)
  const hasTrophy = /\btroph(?:y|ies)\b|\baward bats?\b/.test(text)
  const hasGame = /\bgame(?:r| bats?)?\b|\bpro model\b|\bpro select\b|\bpro order\b|\bpro birch\b|\bpro maple\b|\bselect birch\b|\bselect model\b|\bsemi[ -]?custom\b|\bfully custom\b|\bstock (?:bat|birch|maple)\b|\bsoftball gamers?\b|\bscvbb\s*(?:i|ii)\b|\bsb08\b|\bboom stick\b|\bel tit[aá]n\b|\btorpedo\b|\byouth\b|\btrinity model\b|\blimited edition\b/.test(text) ||
    /\b[a-z]{1,5}\d{1,4}[a-z]{0,3}\b/i.test(model || title)
  const batEvidence = attributes.trinity_item_type?.toLowerCase() === 'bat' ||
    /\bbats?\b|\bfungos?\b|\btrainers?\b|\btraining series\b|\bpro series\b/.test(text) ||
    hasFungo || hasTraining || hasTrophy || hasGame
  if (!batEvidence) return { category: 'review', basis: 'Item purpose not established' }

  // One invoice line can represent several distinct products or a deposit; its money
  // and physical quantity cannot be allocated reliably without line-level detail.
  const mixed = /\bgame bats?\b/.test(title.toLowerCase()) &&
    (/\btrophy bats?\b|\btraining bats?\b/.test(title.toLowerCase()))
  if (mixed) {
    return { category: 'review', basis: 'Mixed purpose or uncertain allocation' }
  }
  const uncertainAllocation = /\b(deposit|remaining balance|see notes|check notes|match bat|copy bat)\b/.test(title.toLowerCase())
  if (uncertainAllocation) {
    const category = hasFungo ? 'fungo' : hasTraining ? 'training' : hasTrophy ? 'trophy' :
      hasGame ? 'game' : 'review'
    return { category, basis: 'Purpose known; unit-price allocation needs review', unitAllocationUncertain: true }
  }
  if (hasFungo) return { category: 'fungo', basis: 'Explicit fungo label' }
  if (hasTraining) return { category: 'training', basis: 'Explicit training model or product type' }
  if (hasTrophy) return { category: 'trophy', basis: 'Explicit trophy or award label' }
  if (hasGame) return { category: 'game', basis: 'Explicit game model or product type' }
  if (/\bpro series\b|\bgame bats?\b/.test(productType.toLowerCase())) {
    return { category: 'game', basis: 'Catalog product type' }
  }
  return { category: 'review', basis: 'Bat purpose not recorded' }
}

export function buildSalesBatCategoryReport(orders, ownerKeyForOrder = () => 'unassigned') {
  const lines = []
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!['manual_sales_order_entry', 'online_store'].includes(order?.reportingCategory)) continue
    if (order?.test || order?.cancelledAt) continue
    const financialStatus = String(order?.financialStatus ?? '').toUpperCase()
    const paid = ['PAID', 'PARTIALLY_REFUNDED'].includes(financialStatus)
    const compedOrder = Boolean(order?.isComped)
    for (const line of Array.isArray(order?.lineItems) ? order.lineItems : []) {
      const quantity = Number(line?.currentQuantity)
      if (!Number.isInteger(quantity) || quantity <= 0) continue
      const classification = classifySalesBatLine(line)
      if (classification.category === 'non_bat') continue
      const title = String(line?.title ?? '')
      const value = money(line?.priceAfterAllDiscountsBeforeTaxesSet)
      const id = numericId(line?.id)
      const titleQuantityMatches = [...title.matchAll(/\b(\d+)\s+(?:game |training |trophy )?bats?\b|\b(?:trainer|training)\s+order\s*[-:]\s*(\d+)\b/ig)]
      const documentedQuantity = historicalDocumentedQuantities.get(id) ||
        (quantity === 1 && titleQuantityMatches.length === 1
          ? Number(titleQuantityMatches[0][1] || titleQuantityMatches[0][2]) : null)
      const ambiguousBundle = quantity === 1 && titleQuantityMatches.length > 1
      const category = ambiguousBundle ? 'review' : classification.category
      const needsReview = category === 'review' || Boolean(classification.unitAllocationUncertain)
      const physicalQuantity = needsReview || !documentedQuantity || documentedQuantity < quantity
        ? quantity : documentedQuantity
      lines.push({
        orderId: order.orderId,
        orderName: order.orderName,
        lineId: id,
        title,
        category,
        needsReview,
        basis: ambiguousBundle ? 'Mixed or ambiguous multi-bat invoice' :
          historicalDocumentedQuantities.has(id) ? 'Documented physical quantity in approved audit' :
          physicalQuantity !== quantity ? `${classification.basis}; quantity stated in line title` : classification.basis,
        channel: order.reportingCategory,
        repKey: order.reportingCategory === 'online_store' ? 'online_store' : ownerKeyForOrder(order),
        repLabel: order.reportingCategory === 'online_store' ? 'Online Store' :
          ownerKeyForOrder(order) === 'jeremy' ? 'Jeremy (unresolved)' :
            order.salesRep || order.salesRepEmail || 'Unassigned',
        quantity: physicalQuantity,
        shopifyQuantity: quantity,
        value: Number.isFinite(value) ? round(value) : null,
        saleStatus: paid ? (value > 0 ? needsReview ? 'paid_unallocated' : 'paid' : 'comped') :
          compedOrder ? 'comped' : 'pending',
      })
    }
  }
  return { lines }
}

export function summarizeSalesBatCategoryLines(lines) {
  const byCategory = Object.fromEntries(['all', ...categoryKeys, 'review'].map((category) => [category, {
    category, orderCount: 0, paidUnits: 0, compedUnits: 0, pendingUnits: 0,
    netSales: 0, pricedSales: 0, unallocatedSales: 0, average: null, median: null, reviewLines: 0,
  }]))
  const orderIds = new Map()
  const prices = new Map()
  for (const line of Array.isArray(lines) ? lines : []) {
    const categories = line.category === 'review' ? ['review'] : [line.category, 'all']
    if (line.needsReview && line.category !== 'review') categories.push('review')
    for (const category of categories) {
      const bucket = byCategory[category]
      if (!bucket) continue
      if (!orderIds.has(category)) orderIds.set(category, new Set())
      orderIds.get(category).add(line.orderId)
      if (category === 'review') bucket.reviewLines += 1
      if (line.saleStatus === 'paid_unallocated' && category !== 'review' && line.value !== null) {
        bucket.netSales += line.value
        bucket.unallocatedSales += line.value
        continue
      }
      if (line.saleStatus === 'paid' && line.value !== null && category !== 'review') {
        bucket.paidUnits += line.quantity
        bucket.netSales += line.value
        bucket.pricedSales += line.value
        if (!prices.has(category)) prices.set(category, [])
        prices.get(category).push({ value: line.value / line.quantity, quantity: line.quantity })
      } else if (line.saleStatus === 'comped' && category !== 'review') {
        bucket.compedUnits += line.quantity
      } else if (line.saleStatus === 'pending' && category !== 'review') {
        bucket.pendingUnits += line.quantity
      }
    }
  }
  for (const bucket of Object.values(byCategory)) {
    bucket.orderCount = orderIds.get(bucket.category)?.size ?? 0
    bucket.netSales = round(bucket.netSales)
    bucket.pricedSales = round(bucket.pricedSales)
    bucket.unallocatedSales = round(bucket.unallocatedSales)
    if (!bucket.paidUnits) continue
    bucket.average = round(bucket.pricedSales / bucket.paidUnits)
    const values = prices.get(bucket.category).sort((a, b) => a.value - b.value)
    const valueAt = (rank) => {
      let count = 0
      for (const item of values) {
        count += item.quantity
        if (count >= rank) return item.value
      }
      return values.at(-1).value
    }
    bucket.median = round((valueAt(Math.floor((bucket.paidUnits + 1) / 2)) +
      valueAt(Math.ceil((bucket.paidUnits + 1) / 2))) / 2)
  }
  return byCategory
}
