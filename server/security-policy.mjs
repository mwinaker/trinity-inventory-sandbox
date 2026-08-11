import path from 'node:path'

const manualCrmContactSourceLabels = new Set([
  'manual crm entry',
  'manual lead',
  'sales portal',
  'sales portal demo',
  'crm assistant',
])
const manualCrmContactTagLabels = new Set(['manual entry', 'ai captured'])
const derivedCrmContactSourceLabels = new Set([
  'sales intake',
  'website order',
  'saved payer contact',
  'sales portal order',
])

const attachmentTypesByExtension = new Map([
  ['.csv', ['text/csv', 'application/vnd.ms-excel']],
  ['.doc', ['application/msword']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['.heic', ['image/heic', 'image/heif']],
  ['.heif', ['image/heif', 'image/heic']],
  ['.jpeg', ['image/jpeg']],
  ['.jpg', ['image/jpeg']],
  ['.pdf', ['application/pdf']],
  ['.png', ['image/png']],
  ['.txt', ['text/plain']],
  ['.webp', ['image/webp']],
  ['.xls', ['application/vnd.ms-excel']],
  ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
])
const genericAttachmentTypes = new Set(['', 'application/octet-stream'])

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCrmContactLabel(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCrmContactTags(contact) {
  return Array.isArray(contact?.tags)
    ? contact.tags.map((tag) => cleanString(tag)).filter(Boolean)
    : []
}

export function isManualCrmContactRecord(contact) {
  const source = normalizeCrmContactLabel(contact?.source)
  if (manualCrmContactSourceLabels.has(source)) return true

  return getCrmContactTags(contact).some((tag) =>
    manualCrmContactTagLabels.has(normalizeCrmContactLabel(tag)),
  )
}

export function getDerivedCrmContactDeleteIds(contacts) {
  return (Array.isArray(contacts) ? contacts : [])
    .filter((contact) =>
      derivedCrmContactSourceLabels.has(normalizeCrmContactLabel(contact?.source)),
    )
    .map((contact) => cleanString(contact?.id))
    .filter(Boolean)
}

export function isFreshShopifyLaunchTimestamp(
  value,
  nowMs = Date.now(),
  maxAgeMs = 10 * 60 * 1000,
) {
  const timestampSeconds = Number(value)
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return false

  const ageMs = nowMs - timestampSeconds * 1000
  return ageMs >= -60 * 1000 && ageMs <= maxAgeMs
}

export function isSalesPortalSessionCurrent(payload, user) {
  if (cleanString(user?.status).toLowerCase() !== 'active') return false
  if (typeof payload?.iat !== 'number' || payload.iat <= 0) return false

  const rotatedAt = Date.parse(cleanString(user?.accessCodeRotatedAt))
  return !Number.isFinite(rotatedAt) || payload.iat >= rotatedAt
}

export function canUpdateOwnedRecord({ isAdmin, existingOwnerKey, sessionOwnerKey }) {
  if (isAdmin) return true
  return Boolean(existingOwnerKey && sessionOwnerKey && existingOwnerKey === sessionOwnerKey)
}

export function canAssignCrmContactOwner({ isAdmin, hasExistingContact }) {
  return Boolean(isAdmin || !hasExistingContact)
}

export function isOrderJobLinkedToCrmContacts(job, contacts) {
  const jobPlayerName = normalizeCrmContactLabel(job?.playerName)
  const jobEmails = new Set(
    [job?.playerEmail, job?.billingEmail, job?.customerEmail]
      .map((value) => cleanString(value).toLowerCase())
      .filter(Boolean),
  )
  const jobPhones = new Set(
    [job?.billingPhone, job?.customerPhone]
      .map((value) => cleanString(value).replace(/\D/g, ''))
      .filter(Boolean),
  )

  return (Array.isArray(contacts) ? contacts : []).some((contact) => {
    const playerNames = [contact?.name, ...(Array.isArray(contact?.playerNames) ? contact.playerNames : [])]
      .map(normalizeCrmContactLabel)
      .filter(Boolean)
    if (jobPlayerName && playerNames.includes(jobPlayerName)) return true

    const contactEmail = cleanString(contact?.email).toLowerCase()
    if (contactEmail && jobEmails.has(contactEmail)) return true

    const contactPhone = cleanString(contact?.phone).replace(/\D/g, '')
    return Boolean(contactPhone && jobPhones.has(contactPhone))
  })
}

export function sanitizeOrderJobForTeamReporting(job) {
  return {
    id: cleanString(job?.id),
    origin: 'internal_sales',
    intakeId: cleanString(job?.intakeId),
    shopifyOrderId: cleanString(job?.shopifyOrderId),
    shopifyOrderName: cleanString(job?.shopifyOrderName),
    shopifyDraftOrderId: cleanString(job?.shopifyDraftOrderId),
    shopifyDraftOrderName: cleanString(job?.shopifyDraftOrderName),
    lineItemId: cleanString(job?.lineItemId),
    orderSubmittedAt: cleanString(job?.orderSubmittedAt),
    productTitle: cleanString(job?.productTitle),
    variantTitle: cleanString(job?.variantTitle),
    quantity: Number(job?.quantity || 1),
    financialStatus: cleanString(job?.financialStatus),
    invoiceStatus: cleanString(job?.invoiceStatus),
    salesRep: cleanString(job?.salesRep),
    salesRepEmail: cleanString(job?.salesRepEmail),
    salesRepPaidNotificationSentAt: cleanString(job?.salesRepPaidNotificationSentAt),
    totalPrice: cleanString(job?.totalPrice),
    currency: cleanString(job?.currency),
    internalAttachment: sanitizeOrderAttachmentForTeamReporting(job?.internalAttachment),
    internalAttachmentNotifications: sanitizeAttachmentNotificationsForTeamReporting(
      job?.internalAttachmentNotifications,
    ),
    createdAt: cleanString(job?.createdAt),
    updatedAt: cleanString(job?.updatedAt),
  }
}

function sanitizeAttachmentNotificationsForTeamReporting(notifications) {
  if (!Array.isArray(notifications)) return []

  return notifications
    .map((notification) => {
      const event = cleanString(notification?.event).toLowerCase()
      const recipient = cleanString(notification?.recipient).toLowerCase()
      const sentAt = cleanString(notification?.sentAt)
      if (!['submission', 'paid'].includes(event) || !recipient || !sentAt) return null

      return {
        id: cleanString(notification?.id),
        event,
        recipient,
        sentAt,
        method: cleanString(notification?.method),
        shopifyEventId: cleanString(notification?.shopifyEventId),
        shopifyWebhookId: cleanString(notification?.shopifyWebhookId),
        shopifyOrderId: cleanString(notification?.shopifyOrderId),
        shopifyOrderName: cleanString(notification?.shopifyOrderName),
        shopifyDraftOrderId: cleanString(notification?.shopifyDraftOrderId),
        shopifyDraftOrderName: cleanString(notification?.shopifyDraftOrderName),
        attachmentId: cleanString(notification?.attachmentId),
        filename: cleanString(notification?.filename),
        downloadUrl: isAllowedShopifyAttachmentUrl(notification?.downloadUrl)
          ? cleanString(notification.downloadUrl)
          : '',
      }
    })
    .filter(Boolean)
    .slice(-25)
}

function sanitizeOrderAttachmentForTeamReporting(attachment) {
  if (!attachment || typeof attachment !== 'object') return null

  const filename = cleanString(attachment.filename)
  const downloadUrl = cleanString(attachment.downloadUrl || attachment.url)
  if (!filename || !isAllowedShopifyAttachmentUrl(downloadUrl)) return null

  return {
    id: cleanString(attachment.id),
    filename,
    downloadUrl,
    contentType: cleanString(attachment.contentType),
    bytes: Number(attachment.bytes) || 0,
    uploadedAt: cleanString(attachment.uploadedAt),
    fileStatus: cleanString(attachment.fileStatus),
  }
}

export function enforcePublicDraftOrderPolicy(payload, isAuthenticatedOperator) {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}
  if (!isAuthenticatedOperator) {
    nextPayload.createDraftOrder = true
    nextPayload.sendInvoice = false
  }
  return nextPayload
}

export function getAllowedOrderAttachmentContentType(filename, declaredContentType) {
  const extension = path.extname(cleanString(filename)).toLowerCase()
  const allowedTypes = attachmentTypesByExtension.get(extension)
  if (!allowedTypes) return ''

  const declaredType = cleanString(declaredContentType).toLowerCase().split(';')[0]
  if (genericAttachmentTypes.has(declaredType)) return allowedTypes[0]
  return allowedTypes.includes(declaredType) ? allowedTypes[0] : ''
}

export function getSalesOrderBoundsError(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : []
  if (lines.length > 20) return 'Orders are limited to 20 lines per submission.'

  const fieldLimits = [
    ['Player name', payload?.playerName || payload?.customerName, 160],
    ['Payer email', payload?.payerEmail, 254],
    ['Player email', payload?.playerEmail, 254],
    ['Player phone', payload?.playerPhone, 50],
    ['Purchase order', payload?.purchaseOrder, 160],
    ['Billing name', payload?.billingName, 160],
    ['Billing email', payload?.billingEmail, 254],
    ['Billing phone', payload?.billingPhone, 50],
    ['Billing company', payload?.billingCompany, 200],
    ['Billing relationship', payload?.billingRelationship, 120],
    ['Shipping address', payload?.shippingAddress1, 200],
    ['Shipping address line 2', payload?.shippingAddress2, 200],
    ['Shipping city', payload?.shippingCity, 100],
    ['Shipping state or province', payload?.shippingProvinceCode, 32],
    ['Shipping postal code', payload?.shippingZip, 32],
    ['Sales rep', payload?.salesRep, 120],
    ['Sales rep email', payload?.salesRepEmail, 254],
    ['Order notes', payload?.notes, 5000],
  ]
  for (const [label, value, limit] of fieldLimits) {
    if (cleanString(value).length > limit) return `${label} is too long.`
  }

  let orderTotal = 0
  for (const [index, line] of lines.entries()) {
    const quantity = Number(line?.quantity)
    const unitPrice = Number(cleanString(line?.unitPrice))
    if (Number.isFinite(quantity) && quantity > 100) {
      return `Line ${index + 1} quantity cannot exceed 100.`
    }
    if (Number.isFinite(unitPrice) && unitPrice > 10000) {
      return `Line ${index + 1} unit price cannot exceed $10,000.`
    }

    const lineTextFields = [
      ['product', line?.title || line?.model, 200],
      ['variant', line?.variantTitle, 200],
      ['engraving', line?.engraving, 500],
      ['notes', line?.notes, 2000],
    ]
    for (const [label, value, limit] of lineTextFields) {
      if (cleanString(value).length > limit) return `Line ${index + 1} ${label} is too long.`
    }

    if (Number.isFinite(unitPrice) && Number.isFinite(quantity)) {
      orderTotal += unitPrice * quantity
    }
  }
  if (orderTotal > 100000) return 'Order total cannot exceed $100,000.'

  const attachmentUrl = cleanString(payload?.attachment?.downloadUrl || payload?.attachment?.url)
  if (attachmentUrl && !isAllowedShopifyAttachmentUrl(attachmentUrl)) {
    return 'Attachment must be a file uploaded through the Trinity order form.'
  }

  return ''
}

export function isAllowedShopifyAttachmentUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.shopify.com'
  } catch {
    return false
  }
}

export function filterAdminOnlySalesRows(rows, hasAdminAccess) {
  return hasAdminAccess && Array.isArray(rows) ? rows : []
}

export function createFixedWindowRateLimiter({ max, windowMs, message }) {
  const buckets = new Map()
  let requestCount = 0

  return (request, response, next) => {
    const now = Date.now()
    const key = cleanString(request.ip) || cleanString(request.socket?.remoteAddress) || 'unknown'
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    buckets.set(key, bucket)

    response.set('RateLimit-Limit', String(max))
    response.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    response.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    requestCount += 1
    if (requestCount % 250 === 0) {
      for (const [bucketKey, savedBucket] of buckets.entries()) {
        if (savedBucket.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    if (bucket.count > max) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      response.status(429).json({
        ok: false,
        message: message || 'Too many requests. Please wait and try again.',
      })
      return
    }

    next()
  }
}
