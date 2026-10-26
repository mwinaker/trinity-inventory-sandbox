import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const serverUrl = new URL('../server/index.mjs', import.meta.url)
const source = fs.readFileSync(serverUrl, 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const modules = {}
for (const statement of ast.statements) {
  if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('.')) {
    Object.assign(modules, await import(new URL(statement.moduleSpecifier.text, serverUrl)))
  }
}
const context = vm.createContext({ ...modules, permanentOrderReferencesEnabled: true, path, URL, Buffer, shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', internalOrderNotificationEmails: [], draftInvoiceHost: 'test.myshopify.com', shopDomain: 'test.myshopify.com' })
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(ast)).join('\n'), context)

const secret = 'PRIVATE_SENTINEL_8bd7\nDo not share with customer'
const payload = {
  playerName: 'Example Player', playerEmail: 'customer@example.com',
  customerEmail: 'customer@example.com', requiresShipping: false,
  notes: secret, purchaseOrder: 'PO-TEST',
  lines: [{ itemType: 'bat', title: 'AB23', quantity: 2, unitPrice: '159.00', notes: 'Customer-visible bat specification' }],
}
const draft = { id: 'gid://shopify/DraftOrder/123', name: '#D123', invoiceUrl: 'https://test.myshopify.com/invoices/test', lineItems: { nodes: [] } }

test('private notes never enter customer invoice email messages, including resend fallbacks', () => {
  const jobs = [{ internalNotes: secret, notes: secret, billingEmail: 'customer@example.com', playerName: payload.playerName, shopifyDraftInvoiceUrl: draft.invoiceUrl }]
  const messages = [
    context.buildOrderInvoiceEmailInput(payload, { name: '#TBC123' }),
    context.buildOrderInvoiceEmailInput({ ...payload, lines: [{ ...payload.lines[0], unitPrice: '0.00' }] }, { name: '#TBC123' }),
    context.buildDraftOrderInvoiceEmailInputFromPayload(payload, draft),
    context.buildDraftOrderInvoiceEmailInput(jobs),
    context.buildDraftOrderInvoiceEmailInput([{ ...jobs[0], internalNotes: '' }]),
  ]
  for (const message of messages) {
    assert.equal(JSON.stringify(message).includes('PRIVATE_SENTINEL'), false)
    assert.match(message.customMessage, /Player: Example Player/)
  }
})

test('Shopify order and quote payloads exclude private notes everywhere, while keeping bat specifications', () => {
  for (const name of ['buildOrderCreateInput', 'buildDraftOrderInput']) {
    const result = context[name](payload, 'sales-test')
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false)
    assert.equal(result.lineItems[0].quantity, 2)
    assert.match(JSON.stringify(result.lineItems), /Customer-visible bat specification/)
    assert.match(result.note, /Player: Example Player/)
  }
})

test('private notes remain in internal production records for draft and direct orders', () => {
  const draftJobs = context.mapDraftOrderToJobs(draft, payload, 'sales-test', false)
  const order = { id: 'gid://shopify/Order/123', name: '#TBC123', lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', title: 'AB23', quantity: 2 }] } }
  const directJobs = context.mapCreatedOrderToJobs(order, payload, 'sales-test', false)
  for (const jobs of [draftJobs, directJobs]) {
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].internalNotes, secret)
  }
})
