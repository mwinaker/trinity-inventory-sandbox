import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canUpdateOwnedRecord,
  enforcePublicDraftOrderPolicy,
  getAllowedOrderAttachmentContentType,
  getDerivedCrmContactDeleteIds,
  getSalesOrderBoundsError,
  isAllowedShopifyAttachmentUrl,
  isFreshShopifyLaunchTimestamp,
  isManualCrmContactRecord,
  isOrderJobLinkedToCrmContacts,
  isSalesPortalSessionCurrent,
} from '../server/security-policy.mjs'

test('Shopify launch timestamps must be recent and cannot be far in the future', () => {
  const now = Date.UTC(2026, 6, 19, 12, 0, 0)
  assert.equal(isFreshShopifyLaunchTimestamp(now / 1000, now), true)
  assert.equal(isFreshShopifyLaunchTimestamp((now - 9 * 60 * 1000) / 1000, now), true)
  assert.equal(isFreshShopifyLaunchTimestamp((now - 11 * 60 * 1000) / 1000, now), false)
  assert.equal(isFreshShopifyLaunchTimestamp((now + 2 * 60 * 1000) / 1000, now), false)
  assert.equal(isFreshShopifyLaunchTimestamp('not-a-date', now), false)
})

test('only explicit legacy derived CRM sources are selected for deletion', () => {
  const contacts = [
    { id: 'manual', source: 'Manual CRM entry' },
    { id: 'old-lead', source: 'Manual lead' },
    { id: 'derived-order', source: 'Website order' },
    { id: 'derived-payer', source: 'Saved payer contact' },
    { id: 'ambiguous', source: 'Imported once' },
    { id: 'missing-source' },
  ]

  assert.equal(isManualCrmContactRecord(contacts[0]), true)
  assert.equal(isManualCrmContactRecord(contacts[1]), true)
  assert.deepEqual(getDerivedCrmContactDeleteIds(contacts), ['derived-order', 'derived-payer'])
})

test('sales portal sessions respect disabled users, code rotation, and CRM ownership', () => {
  const issuedAt = Date.UTC(2026, 6, 19, 12, 0, 0)
  assert.equal(
    isSalesPortalSessionCurrent(
      { iat: issuedAt },
      { status: 'active', accessCodeRotatedAt: new Date(issuedAt - 1000).toISOString() },
    ),
    true,
  )
  assert.equal(
    isSalesPortalSessionCurrent(
      { iat: issuedAt },
      { status: 'active', accessCodeRotatedAt: new Date(issuedAt + 1000).toISOString() },
    ),
    false,
  )
  assert.equal(isSalesPortalSessionCurrent({ iat: issuedAt }, { status: 'disabled' }), false)
  assert.equal(
    canUpdateOwnedRecord({
      isAdmin: false,
      existingOwnerKey: 'daniel@trinitybats.com',
      sessionOwnerKey: 'shane@trinitybats.com',
    }),
    false,
  )
  assert.equal(
    canUpdateOwnedRecord({
      isAdmin: true,
      existingOwnerKey: 'daniel@trinitybats.com',
      sessionOwnerKey: 'shane@trinitybats.com',
    }),
    true,
  )
})

test('a rep can see website orders tied to their own CRM players without seeing other contacts', () => {
  const ownedContacts = [
    {
      name: 'Jack Freedman',
      email: 'jack@example.com',
      playerNames: ['Michael Chavis'],
    },
  ]

  assert.equal(
    isOrderJobLinkedToCrmContacts(
      { playerName: 'Michael Chavis', customerEmail: 'different@example.com' },
      ownedContacts,
    ),
    true,
  )
  assert.equal(
    isOrderJobLinkedToCrmContacts(
      { playerName: 'Corey Seager', customerEmail: 'another@example.com' },
      ownedContacts,
    ),
    false,
  )
})

test('attachment policy accepts common business files and rejects executable web content', () => {
  assert.equal(getAllowedOrderAttachmentContentType('photo.JPG', 'image/jpeg'), 'image/jpeg')
  assert.equal(
    getAllowedOrderAttachmentContentType('spec.pdf', 'application/octet-stream'),
    'application/pdf',
  )
  assert.equal(getAllowedOrderAttachmentContentType('payload.svg', 'image/svg+xml'), '')
  assert.equal(getAllowedOrderAttachmentContentType('page.html', 'text/html'), '')
  assert.equal(getAllowedOrderAttachmentContentType('photo.jpg', 'text/html'), '')
})

test('order bounds reject oversized payloads and untrusted attachment links', () => {
  assert.match(
    getSalesOrderBoundsError({ lines: Array.from({ length: 21 }, () => ({})) }),
    /20 lines/,
  )
  assert.match(
    getSalesOrderBoundsError({ lines: [{ quantity: 101, unitPrice: '1' }] }),
    /cannot exceed 100/,
  )
  assert.match(
    getSalesOrderBoundsError({
      lines: [{ quantity: 1, unitPrice: '1' }],
      attachment: { downloadUrl: 'https://example.com/file.pdf' },
    }),
    /uploaded through the Trinity order form/,
  )
  assert.equal(isAllowedShopifyAttachmentUrl('https://cdn.shopify.com/s/files/file.pdf'), true)
  assert.equal(isAllowedShopifyAttachmentUrl('http://cdn.shopify.com/s/files/file.pdf'), false)
})

test('unauthenticated order callers cannot create finalized Shopify orders', () => {
  assert.deepEqual(
    enforcePublicDraftOrderPolicy({ createDraftOrder: false, sendInvoice: true }, false),
    { createDraftOrder: true, sendInvoice: false },
  )
  assert.deepEqual(
    enforcePublicDraftOrderPolicy({ createDraftOrder: false, sendInvoice: true }, true),
    { createDraftOrder: false, sendInvoice: true },
  )
})
