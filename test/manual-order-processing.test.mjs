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
const context = vm.createContext({ ...modules, path, URL, Buffer, shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', internalOrderNotificationEmails: [] })
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(ast)).join('\n'), context)

for (const [name, line] of [
  ['retail bat', { itemType: 'bat', title: 'AB23', unitPrice: '159.00', variantId: 'gid://shopify/ProductVariant/1' }],
  ['pro bat', { itemType: 'bat', title: 'AB23', unitPrice: '159.00', isProOrder: true }],
  ['shirt', { itemType: 'shirt', title: 'Team shirt', unitPrice: '25.00', variantId: 'gid://shopify/ProductVariant/2' }],
  ['miscellaneous item', { itemType: 'misc', title: 'Custom item', unitPrice: '5.00' }],
  ['zero-dollar sample', { itemType: 'bat', title: 'AB23', unitPrice: '0.00', isProOrder: true }],
]) {
  test(`${name} uses the same manual provenance in draft and direct creation`, () => {
    const payload = { playerName: 'Example Player', payerEmail: 'fake@example.com', requiresShipping: false, lines: [{ ...line, quantity: 1 }] }
    const direct = context.buildOrderCreateInput(payload, 'sales-example', '2026-09-14T18:00:00Z')
    const draft = context.buildDraftOrderInput(payload, 'sales-example', '2026-09-14T18:00:00Z')
    assert.equal(direct.sourceName, 'trinity_manual_order')
    assert.equal(direct.sourceIdentifier, 'sales-example')
    assert.equal(direct.financialStatus, 'PENDING')
    assert.equal(direct.transactions, undefined)
    for (const input of [draft, direct]) {
      const attributes = Object.fromEntries(input.customAttributes.map(a => [a.key, a.value]))
      assert.equal(attributes.trinity_origin, 'internal_sales')
      assert.equal(attributes.trinity_entry_source, 'trinity_inventory_tool')
      assert.equal(attributes.trinity_intake_id, 'sales-example')
      assert.equal(modules.hasTrinityManualOrderMarker(input), true)
    }
  })
}

test('legacy tagged custom orders remain manual on import and webhook refresh', () => {
  const order = { id: 'gid://shopify/Order/1122', name: '#TBC1122', tags: ['Internal Sales', 'Trinity Intake'], displayFinancialStatus: 'PENDING', lineItems: { nodes: [{ id: 'gid://shopify/LineItem/1', title: 'Custom bat', quantity: 1 }] } }
  const imported = context.mapGraphQLOrderToJobs(order)
  assert.equal(imported.length, 1)
  assert.equal(imported[0].origin, 'internal_sales')
  const refreshed = context.mapOrderWebhookToJobs({ id: 1122, name: '#TBC1122', tags: 'Internal Sales, Trinity Intake', financial_status: 'pending', line_items: [{ id: 1, title: 'Custom bat', quantity: 1, price: '159.00' }] }, 'orders/create')
  assert.equal(refreshed.length, 1)
  assert.equal(refreshed[0].origin, 'internal_sales')
})
