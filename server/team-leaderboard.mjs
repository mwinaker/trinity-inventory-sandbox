function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLabel(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseAmount(value) {
  const amount = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

function getTimestamp(value) {
  const timestamp = Date.parse(cleanString(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isPaidJob(job) {
  return (
    cleanString(job?.invoiceStatus).toLowerCase() === 'paid' ||
    cleanString(job?.financialStatus).toLowerCase().includes('paid') ||
    Boolean(cleanString(job?.salesRepPaidNotificationSentAt))
  )
}

function getOrderKey(job) {
  return cleanString(
    job?.intakeId ||
      job?.shopifyDraftOrderId ||
      job?.shopifyOrderId ||
      job?.shopifyDraftOrderName ||
      job?.shopifyOrderName ||
      job?.id,
  )
}

function getRowKey(job, orderKey, paid) {
  return cleanString(job?.id || job?.lineItemId) ||
    [
      orderKey,
      paid ? 'paid' : 'draft',
      cleanString(job?.productTitle),
      cleanString(job?.variantTitle),
      Number(job?.quantity || 1),
      cleanString(job?.totalPrice),
      cleanString(job?.invoiceStatus),
    ].join('|')
}

function getTeamMember(job, members) {
  const email = cleanString(job?.salesRepEmail).toLowerCase()
  if (email) {
    const byEmail = members.find((member) => cleanString(member?.email).toLowerCase() === email)
    if (byEmail) return byEmail
  }

  const name = normalizeLabel(job?.salesRep)
  if (!name) return null
  return (
    members.find((member) =>
      [member?.name, member?.label, ...(Array.isArray(member?.aliases) ? member.aliases : [])]
        .map(normalizeLabel)
        .filter(Boolean)
        .includes(name),
    ) ?? null
  )
}

function attributesToRecord(attributes) {
  const record = {}
  for (const attribute of Array.isArray(attributes) ? attributes : []) {
    const key = cleanString(attribute?.key).toLowerCase()
    if (key) record[key] = cleanString(attribute?.value)
  }
  return record
}

function getTaggedValue(tags, label) {
  const expected = normalizeLabel(label)
  for (const tag of Array.isArray(tags) ? tags : []) {
    const [key, ...value] = cleanString(tag).split(':')
    if (normalizeLabel(key) === expected) return cleanString(value.join(':'))
  }
  return ''
}

function getNoteValue(note, label) {
  const escapedLabel = cleanString(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escapedLabel) return ''
  return cleanString(cleanString(note).match(new RegExp(`^${escapedLabel}:\\s*([^\\n]+)`, 'im'))?.[1])
}

function getSubmissionMatchKeys(record) {
  return [
    record?.intakeId,
    record?.shopifyDraftOrderId,
    record?.shopifyDraftOrderName,
    record?.shopifyOrderId,
    record?.shopifyOrderName,
    record?.id,
    record?.name,
    record?.order?.id,
    record?.order?.name,
  ]
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean)
}

function getInvoiceStatusPriority(status) {
  return { draft: 0, not_required: 1, sent: 2, paid: 3 }[cleanString(status)] ?? 0
}

function getDraftInvoiceStatus(draftOrder) {
  if (cleanString(draftOrder?.order?.displayFinancialStatus).toLowerCase().includes('paid')) {
    return 'paid'
  }
  return cleanString(draftOrder?.status).toUpperCase() === 'OPEN' ? 'draft' : 'sent'
}

function createSubmissionState(key) {
  return {
    key,
    matchKeys: new Set(),
    draftOrderName: '',
    paidOrderName: '',
    salesRep: '',
    salesRepEmail: '',
    customerName: '',
    payerName: '',
    submittedAt: '',
    paidAt: '',
    invoiceStatus: 'draft',
    isPaid: false,
    submissionSource: 'shopify_draft_order',
    jobDraftLineCount: 0,
    jobDraftProductTitles: new Set(),
    jobDraftQuantity: 0,
    jobDraftTotal: 0,
    jobPaidLineCount: 0,
    jobPaidProductTitles: new Set(),
    jobPaidQuantity: 0,
    jobPaidTotal: 0,
    countedJobRows: new Set(),
    draftOrderBasis: null,
  }
}

function addMatchKeys(state, keys, statesByMatchKey) {
  for (const key of keys) {
    state.matchKeys.add(key)
    statesByMatchKey.set(key, state)
  }
}

function getEarlierTimestamp(first, second) {
  const firstMs = getTimestamp(first)
  const secondMs = getTimestamp(second)
  if (!firstMs) return cleanString(second)
  if (!secondMs) return cleanString(first)
  return firstMs <= secondMs ? cleanString(first) : cleanString(second)
}

function getDraftLineBasis(draftOrder) {
  const lines = Array.isArray(draftOrder?.lineItems?.nodes) ? draftOrder.lineItems.nodes : []
  const productTitles = new Set()
  let quantity = 0
  let total = 0

  for (const line of lines) {
    const lineQuantity = Number(line?.quantity)
    const safeQuantity = Number.isFinite(lineQuantity) && lineQuantity > 0 ? lineQuantity : 1
    const unitPrice = parseAmount(line?.originalUnitPriceSet?.shopMoney?.amount)
    quantity += safeQuantity
    total += safeQuantity * unitPrice
    const title = cleanString(line?.title)
    if (title) productTitles.add(title)
  }

  return {
    lineCount: lines.length,
    productTitles,
    quantity,
    total,
  }
}

/**
 * Builds the canonical submitted-sales ledger used by every reporting view.
 * Inventory-tool rows and their Shopify Draft Orders are matched by intake,
 * draft, and completed-order identifiers so one sale is never counted twice.
 */
export function buildUnifiedSalesSubmissions(orderJobs, draftOrders, teamMembers = []) {
  const states = []
  const statesByMatchKey = new Map()

  for (const job of Array.isArray(orderJobs) ? orderJobs : []) {
    if (job?.origin !== 'internal_sales') continue
    const matchKeys = getSubmissionMatchKeys(job)
    if (matchKeys.length === 0) continue
    let state = matchKeys.map((key) => statesByMatchKey.get(key)).find(Boolean)
    if (!state) {
      state = createSubmissionState(getOrderKey(job))
      state.submissionSource = 'inventory'
      states.push(state)
    }
    addMatchKeys(state, matchKeys, statesByMatchKey)

    const paid = isPaidJob(job)
    const rowKey = getRowKey(job, state.key, paid)
    if (state.countedJobRows.has(rowKey)) continue
    state.countedJobRows.add(rowKey)

    state.submissionSource = 'inventory'
    state.draftOrderName ||= cleanString(job?.shopifyDraftOrderName)
    state.paidOrderName ||= cleanString(job?.shopifyOrderName)
    state.salesRep ||= cleanString(job?.salesRep)
    state.salesRepEmail ||= cleanString(job?.salesRepEmail).toLowerCase()
    state.customerName ||= cleanString(job?.playerName) || cleanString(job?.customerName)
    state.payerName ||= cleanString(job?.billingName) || cleanString(job?.customerName)
    state.submittedAt = getEarlierTimestamp(
      state.submittedAt,
      job?.orderSubmittedAt || job?.createdAt,
    )

    const quantity = Number(job?.quantity)
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    const lineValue = parseAmount(job?.totalPrice) * safeQuantity
    const productTitle = cleanString(job?.productTitle)
    if (paid) {
      state.jobPaidLineCount += 1
      state.jobPaidQuantity += safeQuantity
      state.jobPaidTotal += lineValue
      if (productTitle) state.jobPaidProductTitles.add(productTitle)
    } else {
      state.jobDraftLineCount += 1
      state.jobDraftQuantity += safeQuantity
      state.jobDraftTotal += lineValue
      if (productTitle) state.jobDraftProductTitles.add(productTitle)
    }

    const invoiceStatus = paid ? 'paid' : cleanString(job?.invoiceStatus) || 'draft'
    if (getInvoiceStatusPriority(invoiceStatus) > getInvoiceStatusPriority(state.invoiceStatus)) {
      state.invoiceStatus = invoiceStatus
    }
    if (paid) state.isPaid = true
  }

  for (const draftOrder of Array.isArray(draftOrders) ? draftOrders : []) {
    const attributes = attributesToRecord(draftOrder?.customAttributes)
    const orderAttributes = attributesToRecord(draftOrder?.order?.customAttributes)
    const matchRecord = {
      ...draftOrder,
      intakeId: attributes.trinity_intake_id || orderAttributes.trinity_intake_id,
    }
    const matchKeys = getSubmissionMatchKeys(matchRecord)
    if (matchKeys.length === 0) continue
    let state = matchKeys.map((key) => statesByMatchKey.get(key)).find(Boolean)
    if (!state) {
      state = createSubmissionState(cleanString(draftOrder?.id) || cleanString(draftOrder?.name))
      states.push(state)
    }
    addMatchKeys(state, matchKeys, statesByMatchKey)

    const tags = [
      ...(Array.isArray(draftOrder?.tags) ? draftOrder.tags : []),
      ...(Array.isArray(draftOrder?.order?.tags) ? draftOrder.order.tags : []),
    ]
    const note = cleanString(draftOrder?.note2) || cleanString(draftOrder?.order?.note)
    const playerName =
      cleanString(attributes.trinity_player_name) ||
      cleanString(orderAttributes.trinity_player_name) ||
      getTaggedValue(tags, 'Player') ||
      getNoteValue(note, 'Player')
    const salesRep =
      cleanString(attributes.trinity_sales_rep) ||
      cleanString(orderAttributes.trinity_sales_rep) ||
      getTaggedValue(tags, 'Sales Rep') ||
      getNoteValue(note, 'Sales rep')
    const salesRepEmail = cleanString(
      attributes.trinity_sales_rep_email || orderAttributes.trinity_sales_rep_email,
    ).toLowerCase()
    const payerName =
      cleanString(draftOrder?.billingAddress?.name) ||
      cleanString(draftOrder?.billingAddress?.company) ||
      cleanString(draftOrder?.customer?.displayName)

    state.draftOrderName ||= cleanString(draftOrder?.name)
    state.paidOrderName ||= cleanString(draftOrder?.order?.name)
    if (salesRep) state.salesRep = salesRep
    if (salesRepEmail) state.salesRepEmail = salesRepEmail
    if (playerName) state.customerName = playerName
    state.customerName ||= cleanString(draftOrder?.customer?.displayName) || payerName
    state.payerName ||= payerName
    state.submittedAt = getEarlierTimestamp(
      state.submittedAt,
      attributes.trinity_order_submitted_at ||
        orderAttributes.trinity_order_submitted_at ||
        draftOrder?.createdAt,
    )
    state.draftOrderBasis = getDraftLineBasis(draftOrder)

    const invoiceStatus = getDraftInvoiceStatus(draftOrder)
    if (getInvoiceStatusPriority(invoiceStatus) > getInvoiceStatusPriority(state.invoiceStatus)) {
      state.invoiceStatus = invoiceStatus
    }
    if (invoiceStatus === 'paid') state.isPaid = true
  }

  return states
    .map((state) => {
      const owner = getTeamMember(state, Array.isArray(teamMembers) ? teamMembers : [])
      const hasInventoryDraftBasis = state.jobDraftLineCount > 0
      const basis = hasInventoryDraftBasis
        ? {
            lineCount: state.jobDraftLineCount,
            productTitles: state.jobDraftProductTitles,
            quantity: state.jobDraftQuantity,
            total: state.jobDraftTotal,
          }
        : state.draftOrderBasis ?? {
            lineCount: state.jobPaidLineCount,
            productTitles: state.jobPaidProductTitles,
            quantity: state.jobPaidQuantity,
            total: state.jobPaidTotal,
          }

      return {
        key: state.key,
        draftOrderName: state.draftOrderName,
        paidOrderName: state.paidOrderName,
        salesRep: owner?.label ?? owner?.name ?? state.salesRep,
        salesRepEmail: cleanString(owner?.email) || state.salesRepEmail,
        customerName: state.customerName,
        payerName: state.payerName,
        submittedAt: state.submittedAt,
        paidAt: state.paidAt,
        invoiceStatus: state.invoiceStatus,
        isPaid: state.isPaid,
        total: basis.total,
        quantity: basis.quantity,
        lineCount: basis.lineCount,
        productSummary: Array.from(basis.productTitles).join(', ') || 'Custom bat order',
        submissionSource: state.submissionSource,
      }
    })
    .sort((first, second) => getTimestamp(second.submittedAt) - getTimestamp(first.submittedAt))
}

export function buildSalesLeaderboardFromSubmissions(
  submissions,
  teamMembers,
  { sinceMs = Number.NEGATIVE_INFINITY, throughMs = Date.now() } = {},
) {
  const eligibleMembers = (Array.isArray(teamMembers) ? teamMembers : []).filter(
    (member) => member?.role === 'sales' || member?.role === 'admin',
  )
  const rowsByMember = new Map(
    eligibleMembers.map((member) => [
      member.key ?? member.email,
      {
        key: member.key ?? member.email,
        label: member.label ?? member.name,
        submittedCount: 0,
        submittedValue: 0,
      },
    ]),
  )

  for (const submission of Array.isArray(submissions) ? submissions : []) {
    const submittedAt = getTimestamp(submission?.submittedAt)
    const owner = getTeamMember(submission, eligibleMembers)
    if (!owner || !submittedAt || submittedAt < sinceMs || submittedAt > throughMs) continue
    const row = rowsByMember.get(owner.key ?? owner.email)
    if (!row) continue
    row.submittedCount += 1
    row.submittedValue += Number(submission?.total) || 0
  }

  return Array.from(rowsByMember.values()).sort(
    (first, second) =>
      second.submittedValue - first.submittedValue ||
      second.submittedCount - first.submittedCount ||
      first.label.localeCompare(second.label),
  )
}

export function buildSalesLeaderboardForWindow(
  orderJobs,
  teamMembers,
  { sinceMs = Number.NEGATIVE_INFINITY, throughMs = Date.now() } = {},
) {
  return buildSalesLeaderboardFromSubmissions(
    buildUnifiedSalesSubmissions(orderJobs, [], teamMembers),
    teamMembers,
    { sinceMs, throughMs },
  )
}

export function buildTrailingSalesLeaderboard(
  orderJobs,
  teamMembers,
  nowMs = Date.now(),
  trailingDays = 30,
) {
  return buildSalesLeaderboardForWindow(orderJobs, teamMembers, {
    sinceMs: nowMs - trailingDays * 24 * 60 * 60 * 1000,
    throughMs: nowMs,
  })
}
