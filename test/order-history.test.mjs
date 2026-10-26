import assert from 'node:assert/strict'
import test from 'node:test'
import { createSubmissionSnapshot, groupSubmittedOrders, pageSubmittedOrders, buildReorderDraft, keepOriginalSubmissionSnapshot } from '../server/order-history.mjs'

const owner = { name: 'Shane Telfer', email: 'shane@trinitybats.com' }
const payload = {
  playerName: 'Test Player', payerEmail: 'payer@example.com', playerEmail: 'player@example.com',
  playerPhone: '5550101000', purchaseOrder: 'TEST-PO', shippingAddress1: '123 Test St',
  shippingAddress2: 'Suite 2', shippingCity: 'Test City', shippingProvinceCode: 'CO',
  shippingZip: '80000', shippingCountryCode: 'US', billingDifferent: true,
  requiresShipping: false, shippingSpeed: 'comped', productionTimeline: 'rush',
  billingName: 'Test Payer', billingEmail: 'payer@example.com', billingPhone: '5550101001',
  billingCompany: 'Test Club', billingRelationship: 'Coach', salesRep: owner.name,
  salesRepEmail: owner.email, notes: 'PRIVATE review only', createDraftOrder: false, sendInvoice: true,
  lines: ['bat', 'shirt', 'misc'].map((itemType, index) => ({
    itemType, id: `old-${index}`, productId: `product-${index}`, variantId: `variant-${index}`,
    variantTitle: `variant title ${index}`, title: `Test ${itemType}`, quantity: index + 1,
    unitPrice: index === 0 ? '0.00' : '25.50', isProOrder: index === 0,
    length: '34', targetWeight: '31', handleColor: 'Black', barrelColor: 'Natural',
    bandColor: 'Gold', logoColor: 'Silver', engraving: 'Test', cupped: 'Yes', wood: 'Birch', notes: 'Line detail',
  })),
  attachment: { downloadUrl: 'https://cdn.shopify.com/example.pdf', uploadToken: 'EXPIRED' },
  shopifyOrderId: 'old-order', invoiceSent: true, financialStatus: 'PAID',
}
const job = { id: 'job-1', intakeId: 'intake-1', origin: 'internal_sales', shopifyOrderId: 'order-1',
  orderReference: 'T-00100', salesRepEmail: owner.email, playerName: 'Test Player',
  productTitle: 'Test bat', quantity: 2, totalPrice: '0', orderSubmittedAt: '2026-01-01T00:00:00Z' }

test('snapshot keeps every editable field and multi-product line but not order state, line IDs, or upload tokens', () => {
  const snapshot = createSubmissionSnapshot(payload)
  const expected = structuredClone(payload)
  for (const key of ['attachment', 'shopifyOrderId', 'invoiceSent', 'financialStatus']) delete expected[key]
  expected.lines.forEach(line => delete line.id)
  assert.deepEqual(snapshot.draft, expected)
  assert.equal(JSON.stringify(snapshot).includes('EXPIRED'), false)
})

test('reorder is an independent editable copy, including zero-dollar prices and private notes', () => {
  const original = { ...job, submissionSnapshot: createSubmissionSnapshot(payload) }
  const group = groupSubmittedOrders([original])[0]
  const result = buildReorderDraft(group, null, owner)
  assert.equal(result.draft.lines.length, 3)
  assert.equal(result.draft.lines[0].unitPrice, '0.00')
  assert.equal(result.draft.notes, payload.notes)
  assert.equal(result.draft.shippingAddress2, 'Suite 2')
  assert.equal(result.draft.requiresShipping, false)
  assert.equal(result.draft.financialStatus, undefined)
  result.draft.lines[0].title = 'Edited'
  result.draft.notes = 'Edited private note'
  assert.equal(original.submissionSnapshot.draft.lines[0].title, 'Test bat')
  assert.equal(original.submissionSnapshot.draft.notes, payload.notes)
})

test('attachment is sourced from the saved internal job, never an expired snapshot token', () => {
  const attachment = { filename: 'spec.pdf', shopifyFileId: 'file-1', downloadUrl: 'https://cdn.shopify.com/spec.pdf' }
  const group = groupSubmittedOrders([{ ...job, submissionSnapshot: createSubmissionSnapshot(payload), internalAttachment: attachment }])[0]
  const result = buildReorderDraft(group, null, owner)
  assert.deepEqual(result.attachment, attachment)
  assert.equal(result.draft.attachment, null)
})

test('all-time pagination and search reach older orders without duplicates', () => {
  const jobs = Array.from({ length: 61 }, (_, i) => ({ ...job, id: `job-${i}`, intakeId: `intake-${i}`, shopifyOrderId: `order-${i}`, playerName: i === 60 ? 'Oldest Player' : 'Test Player', orderSubmittedAt: new Date(Date.UTC(2020, 0, 61 - i)).toISOString() }))
  const groups = groupSubmittedOrders(jobs)
  const first = pageSubmittedOrders(groups)
  const second = pageSubmittedOrders(groups, { after: first.nextCursor })
  const third = pageSubmittedOrders(groups, { after: second.nextCursor })
  assert.equal(first.orders.length, 25); assert.equal(second.orders.length, 25); assert.equal(third.orders.length, 11)
  assert.equal(third.nextCursor, null)
  assert.equal(new Set([...first.orders, ...second.orders, ...third.orders].map(row => row.id)).size, 61)
  assert.equal(pageSubmittedOrders(groups, { search: 'oldest' }).orders[0].id, 'job-60')
  assert.throws(() => pageSubmittedOrders(groups, { after: 'removed' }), /Refresh/)
})

test('draft completion and imported rows share one order even when intake attribution was absent', () => {
  const a = { ...job, shopifyOrderId: '', shopifyDraftOrderId: 'draft-1', lineItemId: 'line-1' }
  const b = { ...job, id: 'job-2', shopifyDraftOrderId: 'draft-1', lineItemId: 'line-1' }
  const c = { ...job, id: 'job-3', intakeId: '', shopifyDraftOrderId: '', lineItemId: 'line-2' }
  const groups = groupSubmittedOrders([a, b, c, { ...job, origin: 'website', id: 'website' }])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].jobs.length, 2)
})

test('older orders recover address and structured options without copying Shopify note into customer fields', () => {
  const group = groupSubmittedOrders([{ ...job, internalNotes: 'PRIVATE saved note', specs: { wood: 'Birch', engraving: 'Player' }, billingDifferent: false, customerEmail: 'player@example.com' }])[0]
  const source = { note: 'PRIVATE historical note', shippingAddress: { address1: '456 Old St', city: 'Denver', provinceCode: 'CO', zip: '80000', countryCodeV2: 'US' }, customAttributes: [
    { key: 'trinity_player_phone', value: '5550101000' }, { key: 'trinity_shipping_speed', value: 'fast' },
    { key: 'trinity_production_timeline', value: 'rush' }, { key: 'trinity_fulfillment_method', value: 'Local delivery' },
  ] }
  const result = buildReorderDraft(group, source, owner)
  assert.equal(result.draft.shippingAddress1, '456 Old St')
  assert.equal(result.draft.shippingSpeed, 'fast')
  assert.equal(result.draft.requiresShipping, false)
  assert.equal(result.draft.notes, 'PRIVATE saved note')
  assert.equal(JSON.stringify(result.draft).includes('PRIVATE historical note'), false)
  assert.match(result.warnings.join(' '), /older order/)
  assert.equal(result.draft.lines[0].wood, 'Birch')
})

test('missing legacy details stay visibly incomplete instead of being invented', () => {
  const result = buildReorderDraft(groupSubmittedOrders([job])[0], null, owner)
  assert.equal(result.draft.shippingAddress1, '')
  assert.equal(result.draft.shippingCountryCode, '')
  assert.match(result.warnings.join(' '), /unavailable/)
})

test('older clients and production edits cannot erase or replace the original snapshot', () => {
  const existing = { ...job, submissionSnapshot: createSubmissionSnapshot(payload) }
  for (const snapshot of [undefined, { version: 1, draft: { notes: 'tampered' } }]) {
    const result = keepOriginalSubmissionSnapshot(existing, { ...job, productionStatus: 'complete', submissionSnapshot: snapshot })
    assert.deepEqual(result.submissionSnapshot, existing.submissionSnapshot)
    assert.equal(result.productionStatus, 'complete')
  }
  assert.equal(keepOriginalSubmissionSnapshot(job, { ...job, submissionSnapshot: { version: 1 } }).submissionSnapshot, undefined)
})
