const paidOrderTopic = 'orders/paid'
const paidOrderCreationTopics = new Set(['orders/create', 'orders/updated'])

export const defaultPaidOrderAttachmentRecipient = 'jeremy@trinitybats.com'

function cleanString(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase()
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : []
}

function normalizeTopic(value) {
  return cleanString(value).toLowerCase().replaceAll('_', '/')
}

function isOrderPaid(order) {
  return cleanString(order?.financial_status || order?.displayFinancialStatus).toLowerCase() === 'paid'
}

function normalizeAttachmentNotificationEvent(value) {
  const event = cleanString(value).toLowerCase()
  return event === 'submission' || event === 'paid' ? event : ''
}

export function normalizeInternalAttachmentNotification(notification) {
  if (!notification || typeof notification !== 'object') return null

  const event = normalizeAttachmentNotificationEvent(notification.event)
  const recipient = normalizeEmail(notification.recipient)
  const sentAt = cleanString(notification.sentAt)
  const attachmentId = cleanString(notification.attachmentId)
  const downloadUrl = cleanString(notification.downloadUrl)
  if (!event || !recipient || !sentAt || (!attachmentId && !downloadUrl)) return null

  return {
    id:
      cleanString(notification.id) ||
      [
        event,
        recipient,
        cleanString(notification.shopifyEventId) ||
          cleanString(notification.shopifyOrderId) ||
          cleanString(notification.shopifyDraftOrderId) ||
          sentAt,
        attachmentId || downloadUrl,
      ].join(':'),
    event,
    recipient,
    sentAt,
    method: cleanString(notification.method),
    shopifyEventId: cleanString(notification.shopifyEventId),
    shopifyWebhookId: cleanString(notification.shopifyWebhookId),
    shopifyOrderId: cleanString(notification.shopifyOrderId),
    shopifyOrderName: cleanString(notification.shopifyOrderName),
    shopifyDraftOrderId: cleanString(notification.shopifyDraftOrderId),
    shopifyDraftOrderName: cleanString(notification.shopifyDraftOrderName),
    providerMessageId: cleanString(notification.providerMessageId),
    uploadedAttachmentAttached: notification.uploadedAttachmentAttached === true,
    attachmentId,
    filename: cleanString(notification.filename),
    downloadUrl,
  }
}

export function normalizeInternalAttachmentNotifications(notifications) {
  const unique = new Map()

  for (const notification of arrayFrom(notifications)) {
    const normalized = normalizeInternalAttachmentNotification(notification)
    if (normalized && !unique.has(normalized.id)) unique.set(normalized.id, normalized)
  }

  return Array.from(unique.values()).slice(-25)
}

export function createInternalAttachmentNotification({
  event,
  recipient,
  sentAt,
  method = '',
  shopifyEventId = '',
  shopifyWebhookId = '',
  shopifyOrderId = '',
  shopifyOrderName = '',
  shopifyDraftOrderId = '',
  shopifyDraftOrderName = '',
  providerMessageId = '',
  uploadedAttachmentAttached = false,
  attachment,
}) {
  return normalizeInternalAttachmentNotification({
    event,
    recipient,
    sentAt,
    method,
    shopifyEventId,
    shopifyWebhookId,
    shopifyOrderId,
    shopifyOrderName,
    shopifyDraftOrderId,
    shopifyDraftOrderName,
    providerMessageId,
    uploadedAttachmentAttached,
    attachmentId: attachment?.id,
    filename: attachment?.filename,
    downloadUrl: attachment?.downloadUrl || attachment?.url,
  })
}

function notificationMatchesJob(notification, job) {
  const attachment = job?.internalAttachment
  if (!attachment) return false

  const sameAttachment = notification.attachmentId
    ? notification.attachmentId === cleanString(attachment.id)
    : notification.downloadUrl === cleanString(attachment.downloadUrl || attachment.url)
  if (!sameAttachment) return false

  if (
    notification.shopifyOrderId &&
    cleanString(job.shopifyOrderId) &&
    notification.shopifyOrderId !== cleanString(job.shopifyOrderId)
  ) {
    return false
  }

  if (
    notification.shopifyDraftOrderId &&
    cleanString(job.shopifyDraftOrderId) &&
    notification.shopifyDraftOrderId !== cleanString(job.shopifyDraftOrderId)
  ) {
    return false
  }

  return true
}

export function recordInternalAttachmentNotification(jobs, notification) {
  const normalized = normalizeInternalAttachmentNotification(notification)
  if (!normalized) return arrayFrom(jobs)

  return arrayFrom(jobs).map((job) => {
    if (!notificationMatchesJob(normalized, job)) return job

    return {
      ...job,
      internalAttachmentNotifications: normalizeInternalAttachmentNotifications([
        ...arrayFrom(job.internalAttachmentNotifications),
        normalized,
      ]),
      updatedAt: normalized.sentAt,
    }
  })
}

function hasRecordedPaidNotification(jobs, recipient, attachment) {
  const normalizedRecipient = normalizeEmail(recipient)
  const attachmentId = cleanString(attachment?.id)
  const downloadUrl = cleanString(attachment?.downloadUrl || attachment?.url)

  return arrayFrom(jobs).some((job) =>
    normalizeInternalAttachmentNotifications(job?.internalAttachmentNotifications).some(
      (notification) =>
        notification.event === 'paid' &&
        notification.recipient === normalizedRecipient &&
        (attachmentId
          ? notification.attachmentId === attachmentId
          : notification.downloadUrl === downloadUrl),
    ),
  )
}

export function buildPaidOrderAttachmentNotification({
  topic,
  order,
  jobs,
  recipient = defaultPaidOrderAttachmentRecipient,
  shopifyEventId = '',
  shopifyWebhookId = '',
  sentAt = new Date().toISOString(),
}) {
  const normalizedTopic = normalizeTopic(topic)
  const isPaidWebhook = normalizedTopic === paidOrderTopic
  const isPaidWhenCreatedOrUpdated =
    paidOrderCreationTopics.has(normalizedTopic) && isOrderPaid(order)
  if (!isPaidWebhook && !isPaidWhenCreatedOrUpdated) return null

  const eligibleJobs = arrayFrom(jobs).filter(
    (job) => job?.origin === 'internal_sales' && job?.internalAttachment?.downloadUrl,
  )
  const primaryJob = eligibleJobs[0]
  if (!primaryJob) return null

  const attachment = primaryJob.internalAttachment
  const normalizedRecipient = normalizeEmail(recipient)
  if (!normalizedRecipient || hasRecordedPaidNotification(eligibleJobs, normalizedRecipient, attachment)) {
    return null
  }

  const orderId = cleanString(
    order?.admin_graphql_api_id || primaryJob.shopifyOrderId || order?.id,
  )
  if (!orderId) return null

  const orderName = cleanString(order?.name || primaryJob.shopifyOrderName) || 'Trinity order'
  const playerName = cleanString(primaryJob.playerName || primaryJob.customerName)
  const purchaseOrder = cleanString(primaryJob.purchaseOrder)
  const paidAt = cleanString(order?.updated_at || order?.processed_at || sentAt)
  const attachmentLine = `${cleanString(attachment.filename)}: ${cleanString(
    attachment.downloadUrl,
  )}`
  const customMessage = [
    `${orderName} has been paid.`,
    paidAt ? `Paid update: ${paidAt}` : '',
    playerName ? `Player: ${playerName}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    `ORDER ATTACHMENT — DOWNLOAD FILE: ${attachmentLine}`,
    'This attachment is for Trinity internal use and was not sent to the customer.',
  ]
    .filter(Boolean)
    .join('\n')

  const tracking = createInternalAttachmentNotification({
    event: 'paid',
    recipient: normalizedRecipient,
    sentAt,
    method: 'shopify_flow_internal_email',
    shopifyEventId,
    shopifyWebhookId,
    shopifyOrderId: orderId,
    shopifyOrderName: orderName,
    shopifyDraftOrderId: primaryJob.shopifyDraftOrderId,
    shopifyDraftOrderName: primaryJob.shopifyDraftOrderName,
    attachment,
  })

  if (!tracking) return null

  return {
    orderId,
    orderName,
    recipient: normalizedRecipient,
    subject: `${orderName} paid — production attachment`,
    customMessage,
    attachment,
    tracking,
  }
}

export function buildPaidOrderAttachmentDeliveryInput(notification) {
  const orderId = cleanString(notification?.orderId)
  const orderName = cleanString(notification?.orderName)
  const recipient = normalizeEmail(notification?.recipient)
  const subject = cleanString(notification?.subject)
  const text = cleanString(notification?.customMessage)
  const attachment = notification?.attachment

  if (!orderId || !recipient || !subject || !text || !cleanString(attachment?.downloadUrl)) {
    return null
  }

  return {
    order: { id: orderId, name: orderName },
    recipients: [recipient],
    subject,
    text,
    uploadedAttachment: attachment,
  }
}
