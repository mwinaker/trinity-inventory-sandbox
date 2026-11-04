import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { enforcePublicDraftOrderPolicy } from '../server/security-policy.mjs'

// Execute the actual submission handler with Shopify/email/storage replaced at their boundaries.
const source = fs.readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const route = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) &&
  n.expression.expression.getText(ast) === 'app.post' && n.expression.arguments[0]?.text === '/api/sales-orders')
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) &&
  ['trySendDraftOrderPayerInvoice', 'sendDraftOrderInvoice'].includes(n.name?.text))
const draftId = 'gid://shopify/DraftOrder/123'
const sentAt = '2026-11-04T22:00:00Z'

function fixture({ authenticated = true, sendError = '', missingConfirmation = false, trackingFailure = false } = {}) {
  const calls = { create: 0, invoices: [], writes: [], tracking: [] }
  const context = vm.createContext({
    Date, Error, console: { error() {} }, shopDomain: 'example.myshopify.com', adminToken: 'test-only',
    hasAuthenticatedSalesOrderAccess: async () => authenticated,
    applyRateLimit: () => true, publicSalesOrderRateLimiter: {},
    prepareSalesOrderPayloadForRequest: p => ({ payload: enforcePublicDraftOrderPolicy(p, authenticated) }),
    validateOrderAttachmentUploadReceipt: () => '', validateSalesOrderPayload: () => '',
    createPlainId: () => 'intake-123', isZeroDollarSalesOrder: () => false,
    calculateSalesOrderTax: async () => ({}), buildDraftOrderInput: p => p, ensureDefinitions: async () => {},
    needsSalesRepPlayerEmailProtection: () => false, resolvePayer: p => ({ email: p.payerEmail || '' }),
    createDraftOrder: async () => { calls.create++; return { id: draftId, name: '#D123', invoiceUrl: 'https://example.myshopify.com/invoices/test' } },
    buildDraftOrderInvoiceEmailInputFromPayload: p => ({ to: p.payerEmail, subject: 'T-00123 invoice from Trinity Sports Group' }),
    readReferenceResource: async () => ({}), needsTrinityOrderReference: () => false,
    shopifyGraphQL: async (query, variables) => {
      assert.match(query, /draftOrderInvoiceSend/)
      assert.doesNotMatch(query, /draftOrderComplete|orderCreate/)
      calls.invoices.push(variables)
      return { data: { draftOrderInvoiceSend: {
        draftOrder: sendError || missingConfirmation ? null : { id: draftId, invoiceSentAt: sentAt },
        userErrors: sendError ? [{ message: sendError }] : [],
      } } }
    },
    orderDocumentService: { recordSent: async id => { calls.tracking.push(id); if (trackingFailure) throw new Error('tracking unavailable') } },
    mapDraftOrderToJobs: () => [{ id: 'job-123', invoiceStatus: 'draft' }],
    attachOrderJobsToPlayerProfiles: async jobs => jobs,
    rememberOrderJobContacts: async () => ({ players: [], billingContacts: [] }),
    resourceConfigs: { orderJobs: {} }, upsertRecord: async (_, job) => calls.writes.push(job),
    syncOrderJobMetafields: async () => {},
    trySendInternalOrderCopyNotification: async () => ({ recipients: [], error: '' }),
    tryRecordSubmittedAttachmentNotification: async ({ jobs }) => ({ jobs, tracked: false, error: '' }),
    normalizeEmail: v => v || '', createDraftInvoiceSendToken: () => 'test-send-token', invoiceSendTokenMaxAgeMs: 1000,
  })
  vm.runInContext(functions.map(n => n.getText(ast)).join('\n'), context)
  const handler = vm.runInContext(`(${route.expression.arguments.at(-1).getText(ast)})`, context)
  async function submit(overrides = {}) {
    let status = 200, body
    const response = { status(value) { status = value; return this }, json(value) { body = value } }
    await handler({ body: { createDraftOrder: true, sendInvoice: true, payerEmail: 'payer@example.com', ...overrides } }, response)
    return { status, body }
  }
  return { calls, submit }
}

test('reviewed authenticated draft submission sends a native payable invoice and records Shopify confirmation', async () => {
  const { calls, submit } = fixture()
  const { status, body } = await submit()
  assert.equal(status, 200)
  assert.equal(calls.create, 1)
  assert.equal(calls.invoices.length, 1)
  assert.equal(calls.invoices[0].id, draftId)
  assert.equal(calls.invoices[0].email.to, 'payer@example.com')
  assert.equal(body.invoiceSent, true)
  assert.equal(body.draftInvoiceReadyForReview, false)
  assert.equal(body.orderJobs[0].invoiceStatus, 'sent')
  assert.equal(body.orderJobs[0].invoiceSentAt, sentAt)
})

for (const sendInvoice of [false, undefined]) {
  test(`an unsent or legacy draft request does not email: sendInvoice=${sendInvoice}`, async () => {
    const { calls, submit } = fixture()
    const { body } = await submit({ sendInvoice })
    assert.equal(calls.invoices.length, 0)
    assert.equal(body.invoiceSent, false)
    assert.equal(body.draftInvoiceReadyForReview, true)
  })
}

test('public intake cannot opt itself into automatic customer email', async () => {
  const { calls, submit } = fixture({ authenticated: false })
  const { body } = await submit({ createDraftOrder: false })
  assert.equal(calls.create, 1)
  assert.equal(calls.invoices.length, 0)
  assert.equal(body.invoiceSent, false)
})

test('missing payer email blocks a requested send before creating any order', async () => {
  const { calls, submit } = fixture()
  const { status, body } = await submit({ payerEmail: '' })
  assert.equal(status, 400)
  assert.match(body.message, /payer email/)
  assert.equal(calls.create, 0)
  assert.equal(calls.invoices.length, 0)
})

for (const options of [{ sendError: 'Email delivery refused' }, { missingConfirmation: true }]) {
  test(`failed or unconfirmed invoice keeps one saved draft and exposes recovery: ${JSON.stringify(options)}`, async () => {
    const { calls, submit } = fixture(options)
    const { status, body } = await submit()
    assert.equal(status, 200)
    assert.equal(body.ok, true)
    assert.equal(calls.create, 1)
    assert.equal(calls.writes.length, 1)
    assert.equal(calls.tracking.length, 0)
    assert.equal(body.invoiceSent, false)
    assert.ok(body.payerNotificationError)
    assert.equal(body.draftOrder.id, draftId)
    assert.equal(body.draftInvoiceReadyForReview, true)
    assert.ok(body.invoiceSendToken)
    assert.equal(body.orderJobs[0].invoiceStatus, 'draft')
  })
}

test('tracking-write failure does not pretend a confirmed customer email failed', async () => {
  const { calls, submit } = fixture({ trackingFailure: true })
  const { body } = await submit()
  assert.equal(calls.invoices.length, 1)
  assert.equal(body.invoiceSent, true)
  assert.equal(body.payerNotificationError, '')
})
