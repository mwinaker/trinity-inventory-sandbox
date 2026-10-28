// Private submission snapshots are stored only in the internal order-job payload.
// Never include them in Shopify order notes, attributes, or invoice messages.
const text = value => value == null ? '' : String(value)
const draftFields = [
  'playerName', 'payerEmail', 'playerEmail', 'playerPhone', 'purchaseOrder',
  'shippingAddress1', 'shippingAddress2', 'shippingCity', 'shippingProvinceCode',
  'shippingZip', 'shippingCountryCode', 'billingName', 'billingEmail', 'billingPhone',
  'billingCompany', 'billingRelationship', 'salesRep', 'salesRepEmail', 'notes',
  'shippingSpeed', 'productionTimeline',
]
const lineFields = ['itemType', 'productId', 'variantId', 'variantTitle', 'title', 'unitPrice',
  'length', 'targetWeight', 'handleColor', 'barrelColor', 'bandColor', 'logoColor',
  'engraving', 'cupped', 'wood', 'notes']

export function createSubmissionSnapshot(payload) {
  const snapshot = Object.fromEntries(draftFields.map(key => [key, text(payload[key])]))
  for (const key of ['billingDifferent', 'requiresShipping', 'createDraftOrder', 'sendInvoice']) {
    snapshot[key] = payload[key] === true
  }
  snapshot.requiresShipping = payload.requiresShipping !== false
  snapshot.createDraftOrder = payload.createDraftOrder !== false
  snapshot.lines = (payload.lines ?? []).map(line => ({
    ...Object.fromEntries(lineFields.map(key => [key, text(line[key])])),
    quantity: Number(line.quantity || 1), isProOrder: line.isProOrder === true,
  }))
  return { version: 1, draft: snapshot }
}

export function groupSubmittedOrders(jobs) {
  const groups = new Map()
  const parent = new Map()
  const root = key => {
    if (!parent.has(key)) parent.set(key, key)
    if (parent.get(key) !== key) parent.set(key, root(parent.get(key)))
    return parent.get(key)
  }
  const keysFor = job => [job.intakeId, job.shopifyDraftOrderId, job.shopifyOrderId].filter(Boolean)
  const manual = jobs.filter(job => job.origin === 'internal_sales')
  for (const job of manual) {
    const keys = keysFor(job)
    for (const key of keys.slice(1)) parent.set(root(key), root(keys[0]))
  }
  for (const job of manual) {
    const key = root(keysFor(job)[0] || job.id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(job)
  }
  return [...groups].map(([key, rows]) => {
    // A completed draft and its webhook/imported copy must not duplicate a line.
    const seen = new Set()
    const completedLines = rows.filter(job => String(job.lineItemId || '').startsWith('gid://shopify/LineItem/'))
    const unique = (completedLines.length ? completedLines : rows).filter(job => {
      const id = job.lineItemId || job.id
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    const primary = rows.find(job => job.submissionSnapshot?.version === 1) || rows[0]
    return { key, jobs: unique, sourceJobs: rows, primary, submittedAt: primary.orderSubmittedAt || primary.createdAt || '' }
  }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.key.localeCompare(b.key))
}

export function summarizeSubmittedOrder(group) {
  const { primary, jobs } = group
  return {
    id: primary.id, reference: primary.orderReference || primary.shopifyOrderName || primary.shopifyDraftOrderName || 'Manual order',
    submittedAt: group.submittedAt, playerName: primary.playerName || primary.customerName || '',
    payerName: primary.billingName || primary.customerName || '',
    summary: jobs.map(job => `${job.quantity} × ${job.productTitle}`).join(', '),
    quantity: jobs.reduce((sum, job) => sum + Number(job.quantity || 0), 0),
    status: primary.cancelledAt ? 'Cancelled' : primary.financialStatus || primary.invoiceStatus || 'Submitted',
    currency: primary.currency || 'USD',
    productTotal: jobs.reduce((sum, job) => sum + Number(job.totalPrice || 0) * Number(job.quantity || 0), 0),
  }
}

export function pageSubmittedOrders(groups, { after = '', search = '', limit = 25 } = {}) {
  const term = text(search).toLowerCase().trim()
  const rows = groups.map(summarizeSubmittedOrder).filter(row => !term ||
    [row.reference, row.playerName, row.payerName, row.summary].join(' ').toLowerCase().includes(term))
  const position = after ? rows.findIndex(row => row.id === after) : -1
  if (after && position < 0) throw new Error('Order history changed. Refresh the list to continue.')
  const page = rows.slice(position + 1, position + 1 + limit)
  return { orders: page, total: rows.length, nextCursor: position + 1 + page.length < rows.length ? page.at(-1)?.id : null }
}

export function buildReorderDraft(group, source, owner) {
  const { primary, jobs } = group
  const snapshot = primary.submissionSnapshot
  let draft
  const warnings = []
  if (snapshot?.version === 1) {
    draft = structuredClone(snapshot.draft)
  } else {
    const attributes = Object.fromEntries((source?.customAttributes ?? []).map(a => [a.key, a.value]))
    const address = source?.shippingAddress || {}
    const billingDifferent = Boolean(primary.billingDifferent)
    draft = {
      playerName: primary.playerName || primary.customerName || '',
      payerEmail: billingDifferent ? '' : primary.customerEmail || source?.email || '',
      playerEmail: primary.playerEmail || attributes.trinity_player_email || '',
      playerPhone: attributes.trinity_player_phone || (!billingDifferent ? primary.billingPhone : '') || '',
      purchaseOrder: primary.purchaseOrder || attributes.trinity_purchase_order || '',
      shippingAddress1: address.address1 || '', shippingAddress2: address.address2 || '',
      shippingCity: address.city || '', shippingProvinceCode: address.provinceCode || '',
      shippingZip: address.zip || '', shippingCountryCode: address.countryCodeV2 || '',
      billingDifferent, requiresShipping: attributes.trinity_requires_shipping
        ? attributes.trinity_requires_shipping !== 'false'
        : attributes.trinity_fulfillment_method !== 'Local delivery',
      shippingSpeed: attributes.trinity_shipping_speed || '',
      productionTimeline: attributes.trinity_production_timeline || '',
      billingName: primary.billingName || '', billingEmail: primary.billingEmail || '',
      billingPhone: primary.billingPhone || '', billingCompany: primary.billingCompany || '',
      billingRelationship: primary.billingRelationship || '', notes: primary.internalNotes || '',
      createDraftOrder: true, sendInvoice: false,
      lines: jobs.map(job => ({
        ...Object.fromEntries(lineFields.map(key => [key, text(job.specs?.[key])])),
        itemType: job.itemType || 'bat', productId: job.shopifyProductId || '',
        variantId: job.shopifyVariantId || '', variantTitle: job.variantTitle || '',
        title: job.productTitle || '', quantity: Number(job.quantity || 1),
        unitPrice: text(job.totalPrice), isProOrder: /^pro order\b/i.test(job.productTitle || ''),
        notes: job.notes || job.specs?.notes || '',
      })),
    }
    warnings.push('This older order predates saved form snapshots. Available details were recovered; review every field, including prices, shipping, and production options.')
    if (!source) warnings.push('The original Shopify record was unavailable. Missing contact or address fields must be completed before submitting.')
  }
  // Reorders have new line identities and no payment, fulfillment, or invoice state.
  draft.salesRep = owner.name
  draft.salesRepEmail = owner.email
  draft.attachment = null
  const attachment = primary.internalAttachment || jobs.find(job => job.internalAttachment)?.internalAttachment || null
  if (attachment) warnings.push('The previous internal attachment is included. Review it and remove or replace it if needed.')
  warnings.push('Review the copied prices and details. Tax and delivery charges are recalculated when you submit this new order.')
  return { draft, attachment, warnings }
}

export const reorderSourceQuery = `query ReorderSource($id: ID!) {
  node(id: $id) {
    ... on Order {
      id email customAttributes { key value }
      shippingAddress { address1 address2 city provinceCode zip countryCodeV2 }
    }
    ... on DraftOrder {
      id email customAttributes { key value }
      shippingAddress { address1 address2 city provinceCode zip countryCodeV2 }
    }
  }
}`

export function keepOriginalSubmissionSnapshot(existing, incoming) {
  return { ...incoming, submissionSnapshot: existing?.submissionSnapshot }
}
