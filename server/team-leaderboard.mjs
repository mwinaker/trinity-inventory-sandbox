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

export function buildSalesLeaderboardForWindow(
  orderJobs,
  teamMembers,
  { sinceMs = Number.NEGATIVE_INFINITY, throughMs = Date.now() } = {},
) {
  const eligibleMembers = (Array.isArray(teamMembers) ? teamMembers : []).filter(
    (member) => member?.role === 'sales' || member?.role === 'admin',
  )
  const orders = new Map()

  for (const job of Array.isArray(orderJobs) ? orderJobs : []) {
    if (job?.origin !== 'internal_sales') continue
    const orderKey = getOrderKey(job)
    if (!orderKey) continue

    const paid = isPaidJob(job)
    const rowKey = getRowKey(job, orderKey, paid)
    const order = orders.get(orderKey) ?? {
      owner: null,
      submittedAt: 0,
      draftRows: new Set(),
      draftTotal: 0,
      paidRows: new Set(),
      paidTotal: 0,
    }
    const rows = paid ? order.paidRows : order.draftRows
    if (rows.has(rowKey)) continue
    rows.add(rowKey)

    order.owner ||= getTeamMember(job, eligibleMembers)
    const submittedAt = getTimestamp(job?.orderSubmittedAt || job?.createdAt)
    if (submittedAt && (!order.submittedAt || submittedAt < order.submittedAt)) {
      order.submittedAt = submittedAt
    }
    const quantity = Number(job?.quantity)
    const lineValue = parseAmount(job?.totalPrice) *
      (Number.isFinite(quantity) && quantity > 0 ? quantity : 1)
    if (paid) order.paidTotal += lineValue
    else order.draftTotal += lineValue
    orders.set(orderKey, order)
  }

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

  for (const order of orders.values()) {
    if (
      !order.owner ||
      !order.submittedAt ||
      order.submittedAt < sinceMs ||
      order.submittedAt > throughMs
    ) {
      continue
    }
    const key = order.owner.key ?? order.owner.email
    const row = rowsByMember.get(key)
    if (!row) continue
    row.submittedCount += 1
    row.submittedValue += order.draftRows.size > 0 ? order.draftTotal : order.paidTotal
  }

  return Array.from(rowsByMember.values()).sort(
    (first, second) =>
      second.submittedValue - first.submittedValue ||
      second.submittedCount - first.submittedCount ||
      first.label.localeCompare(second.label),
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
