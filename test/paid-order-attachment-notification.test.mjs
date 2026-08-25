import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaidOrderAttachmentDeliveryInput,
  buildPaidOrderAttachmentNotification,
  createInternalAttachmentNotification,
  recordInternalAttachmentNotification,
} from '../server/paid-order-attachment-notification.mjs'

const attachment = {
  id: 'attachment-1',
  filename: 'engraving-reference.png',
  downloadUrl: 'https://cdn.shopify.com/s/files/1/reference.png',
}

function createJobs() {
  return [
    {
      id: 'draft-1-line-1',
      origin: 'internal_sales',
      intakeId: 'sales-1',
      shopifyOrderId: 'gid://shopify/Order/101',
      shopifyOrderName: '#101',
      shopifyDraftOrderId: 'gid://shopify/DraftOrder/201',
      shopifyDraftOrderName: '#D201',
      playerName: 'Test Player',
      purchaseOrder: 'PO-101',
      internalAttachment: attachment,
      internalAttachmentNotifications: [],
    },
    {
      id: 'draft-1-line-2',
      origin: 'internal_sales',
      intakeId: 'sales-1',
      shopifyOrderId: 'gid://shopify/Order/101',
      shopifyOrderName: '#101',
      internalAttachment: attachment,
      internalAttachmentNotifications: [],
    },
  ]
}

test('builds Jeremy a paid-order Shopify email with the stored attachment link', () => {
  const notification = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: {
      admin_graphql_api_id: 'gid://shopify/Order/101',
      name: '#101',
      processed_at: '2026-08-11T20:30:00.000Z',
    },
    jobs: createJobs(),
    shopifyEventId: 'event-101',
    shopifyWebhookId: 'webhook-101',
    sentAt: '2026-08-11T20:30:01.000Z',
  })

  assert.equal(notification.recipient, 'jeremy@trinitybats.com')
  assert.equal(notification.orderId, 'gid://shopify/Order/101')
  assert.equal(notification.orderName, '#101')
  assert.equal(notification.subject, '#101 paid — production attachment')
  assert.match(notification.customMessage, /#101 has been paid/)
  assert.match(
    notification.customMessage,
    /ORDER ATTACHMENT — DOWNLOAD FILE: engraving-reference\.png: https:\/\/cdn\.shopify\.com/,
  )
  assert.match(notification.customMessage, /not sent to the customer/)
  assert.equal(notification.tracking.event, 'paid')
  assert.equal(notification.tracking.method, 'shopify_flow_internal_email')
  assert.equal(notification.tracking.shopifyEventId, 'event-101')
  assert.equal(notification.tracking.shopifyWebhookId, 'webhook-101')
})

test('creates a direct paid-order delivery with the stored attachment', () => {
  const notification = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: {
      admin_graphql_api_id: 'gid://shopify/Order/101',
      name: '#101',
    },
    jobs: createJobs(),
  })

  const delivery = buildPaidOrderAttachmentDeliveryInput(notification)

  assert.deepEqual(delivery.order, {
    id: 'gid://shopify/Order/101',
    name: '#101',
  })
  assert.deepEqual(delivery.recipients, ['jeremy@trinitybats.com'])
  assert.equal(delivery.subject, '#101 paid — production attachment')
  assert.equal(delivery.uploadedAttachment, attachment)
  assert.match(delivery.text, /ORDER ATTACHMENT — DOWNLOAD FILE/)
})

test('does not create a direct paid-order delivery without a usable link', () => {
  assert.equal(
    buildPaidOrderAttachmentDeliveryInput({
      orderId: 'gid://shopify/Order/101',
      recipient: 'jeremy@trinitybats.com',
      subject: '#101 paid — production attachment',
      customMessage: '#101 has been paid.',
      attachment: { filename: 'reference.png' },
    }),
    null,
  )
})

test('records submission and paid attachment notifications on every matching order line', () => {
  const submission = createInternalAttachmentNotification({
    event: 'submission',
    recipient: 'jeremy@trinitybats.com',
    sentAt: '2026-08-11T20:00:00.000Z',
    method: 'shopify_draft_order_email',
    providerMessageId: 'gmail-submission-1',
    uploadedAttachmentAttached: true,
    shopifyDraftOrderId: 'gid://shopify/DraftOrder/201',
    shopifyDraftOrderName: '#D201',
    attachment,
  })
  const paid = createInternalAttachmentNotification({
    event: 'paid',
    recipient: 'jeremy@trinitybats.com',
    sentAt: '2026-08-11T20:30:01.000Z',
    method: 'shopify_flow_internal_email',
    providerMessageId: 'gmail-paid-1',
    uploadedAttachmentAttached: true,
    shopifyOrderId: 'gid://shopify/Order/101',
    shopifyOrderName: '#101',
    shopifyEventId: 'event-101',
    attachment,
  })

  const withSubmission = recordInternalAttachmentNotification(createJobs(), submission)
  const trackedJobs = recordInternalAttachmentNotification(withSubmission, paid)

  assert.deepEqual(
    trackedJobs.map((job) => job.internalAttachmentNotifications.map((item) => item.event)),
    [
      ['submission', 'paid'],
      ['submission', 'paid'],
    ],
  )
  assert.equal(trackedJobs[0].internalAttachmentNotifications[0].providerMessageId, 'gmail-submission-1')
  assert.equal(trackedJobs[0].internalAttachmentNotifications[0].uploadedAttachmentAttached, true)
  assert.equal(trackedJobs[0].internalAttachmentNotifications[1].providerMessageId, 'gmail-paid-1')
  assert.equal(trackedJobs[0].internalAttachmentNotifications[1].uploadedAttachmentAttached, true)
})

test('does not resend the paid attachment notification for a recorded order', () => {
  const first = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: { admin_graphql_api_id: 'gid://shopify/Order/101', name: '#101' },
    jobs: createJobs(),
    shopifyEventId: 'event-101',
    sentAt: '2026-08-11T20:30:01.000Z',
  })
  const trackedJobs = recordInternalAttachmentNotification(createJobs(), {
    ...first.tracking,
    uploadedAttachmentAttached: true,
  })
  const duplicate = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: { admin_graphql_api_id: 'gid://shopify/Order/101', name: '#101' },
    jobs: trackedJobs,
    shopifyEventId: 'event-101',
    sentAt: '2026-08-11T20:31:00.000Z',
  })

  assert.equal(duplicate, null)
})

test('retries a paid notification when the prior record did not confirm the uploaded attachment', () => {
  const first = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: { admin_graphql_api_id: 'gid://shopify/Order/101', name: '#101' },
    jobs: createJobs(),
    sentAt: '2026-08-11T20:30:01.000Z',
  })
  const unconfirmedJobs = recordInternalAttachmentNotification(createJobs(), first.tracking)
  const retry = buildPaidOrderAttachmentNotification({
    topic: 'orders/paid',
    order: { admin_graphql_api_id: 'gid://shopify/Order/101', name: '#101' },
    jobs: unconfirmedJobs,
    sentAt: '2026-08-11T20:31:00.000Z',
  })

  assert.ok(retry)
  const deliveredJobs = recordInternalAttachmentNotification(unconfirmedJobs, {
    ...retry.tracking,
    providerMessageId: 'gmail-paid-retry-1',
    uploadedAttachmentAttached: true,
  })
  assert.equal(deliveredJobs[0].internalAttachmentNotifications.length, 2)
  assert.equal(deliveredJobs[0].internalAttachmentNotifications[0].uploadedAttachmentAttached, false)
  assert.equal(deliveredJobs[0].internalAttachmentNotifications[1].uploadedAttachmentAttached, true)
  assert.equal(deliveredJobs[0].internalAttachmentNotifications[1].providerMessageId, 'gmail-paid-retry-1')
})

test('sends the paid attachment notification when Shopify creates a completed draft already paid', () => {
  const notification = buildPaidOrderAttachmentNotification({
    topic: 'orders/create',
    order: {
      admin_graphql_api_id: 'gid://shopify/Order/101',
      name: '#101',
      financial_status: 'paid',
    },
    jobs: createJobs(),
    shopifyEventId: 'event-created-paid-101',
    sentAt: '2026-08-11T20:30:01.000Z',
  })

  assert.equal(notification.recipient, 'jeremy@trinitybats.com')
  assert.match(notification.customMessage, /ORDER ATTACHMENT — DOWNLOAD FILE/)
})

test('sends the paid attachment notification when an order-updated webhook reports paid', () => {
  const notification = buildPaidOrderAttachmentNotification({
    topic: 'ORDERS_UPDATED',
    order: {
      admin_graphql_api_id: 'gid://shopify/Order/101',
      name: '#101',
      financial_status: 'paid',
    },
    jobs: createJobs(),
  })

  assert.equal(notification.recipient, 'jeremy@trinitybats.com')
})

test('ignores non-paid webhooks, website orders, and orders without attachments', () => {
  assert.equal(
    buildPaidOrderAttachmentNotification({
      topic: 'orders/updated',
      order: { id: 101 },
      jobs: createJobs(),
    }),
    null,
  )
  assert.equal(
    buildPaidOrderAttachmentNotification({
      topic: 'orders/paid',
      order: { id: 101 },
      jobs: [{ ...createJobs()[0], origin: 'website' }],
    }),
    null,
  )
  assert.equal(
    buildPaidOrderAttachmentNotification({
      topic: 'orders/paid',
      order: { id: 101 },
      jobs: [{ ...createJobs()[0], internalAttachment: null }],
    }),
    null,
  )
})
