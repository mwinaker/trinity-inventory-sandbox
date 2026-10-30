import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { supportsPuckKnob, productionModelLabel } from '../shared/production-model.ts'
import { productionLineDetails } from '../server/production-line-details.mjs'
import { buildProductionDocument } from '../shared/production-documents.ts'
import { createSubmissionSnapshot, groupSubmittedOrders, buildReorderDraft } from '../server/order-history.mjs'

// Load real pure application functions without starting a server or creating an order.
const serverUrl = new URL('../server/index.mjs', import.meta.url)
const serverSource = fs.readFileSync(serverUrl, 'utf8')
const serverAst = ts.createSourceFile('server.mjs', serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const modules = {}
for (const statement of serverAst.statements) {
  if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('.')) {
    Object.assign(modules, await import(new URL(statement.moduleSpecifier.text, serverUrl)))
  }
}
const server = vm.createContext({ ...modules, permanentOrderReferencesEnabled: true, path, URL, Buffer,
  shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', internalOrderNotificationEmails: [],
  draftInvoiceHost: 'test.myshopify.com', shopDomain: 'test.myshopify.com' })
vm.runInContext(serverAst.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(serverAst)).join('\n'), server)

const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const appAst = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functionNames = new Set(['updateSalesLineDraft', 'cloneSalesOrderDraft', 'getTypedBatModelPatch', 'findShopifyCatalogProductByName'])
const appStatements = appAst.statements.filter(statement =>
  ts.isFunctionDeclaration(statement) && functionNames.has(statement.name?.text) ||
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(appAst) === 'emptySalesLine'))
const client = vm.createContext({ supportsPuckKnob, productionModelLabel, createId: prefix => `${prefix}-test` })
vm.runInContext(ts.transpileModule(appStatements.map(n => n.getText(appAst)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText + '\nthis.newSalesLine = emptySalesLine;', client)

const line = (overrides = {}) => ({ id: 'line-1', itemType: 'bat', title: 'RA13L', quantity: 2,
  unitPrice: '159.00', length: '33', targetWeight: '30', wood: 'Birch', cupped: 'No',
  puckKnob: 'Yes', ...overrides })
const owner = { name: 'Matt Winaker', email: 'matt@trinitybats.com' }
const payload = (lines = [line()]) => ({ playerName: 'Example Player', payerEmail: 'customer@example.com',
  customerEmail: 'customer@example.com', requiresShipping: false, productionTimeline: 'normal',
  salesRep: owner.name, salesRepEmail: owner.email, createDraftOrder: true, sendInvoice: true, lines })
const pairs = properties => Object.fromEntries(properties.map(p => [p.key ?? p.name, p.value]))
const draftSource = (request) => ({ id: 'gid://shopify/DraftOrder/42', name: '#D42',
  invoiceUrl: 'https://test.myshopify.com/invoices/test', createdAt: '2026-10-30T16:00:00Z',
  lineItems: { nodes: request.lineItems.map((item, i) => ({ ...item, id: `gid://shopify/DraftOrderLineItem/${i + 1}` })) } })
const orderSource = (request) => ({ id: 'gid://shopify/Order/84', name: '#TBC84',
  customAttributes: [{ key: 'trinity_origin', value: 'internal_sales' }],
  createdAt: '2026-10-30T16:00:00Z', updatedAt: '2026-10-30T16:00:00Z', displayFinancialStatus: 'PENDING',
  lineItems: { nodes: request.lineItems.map((item, i) => ({ ...item, title: item.title || 'RA13L',
    id: `gid://shopify/LineItem/${i + 1}`, customAttributes: item.customAttributes || (item.properties || []).map(p => ({ key: p.name, value: p.value })) })) } })

test('new manual lines default to No and only game bat lines support the choice', () => {
  for (const type of ['bat', 'shirt', 'misc']) assert.equal(client.newSalesLine(type).puckKnob, 'No')
  for (const title of ['RA13L', 'Pro Model AP5 Custom', 'Youth Pro Model HK47 Custom', 'T141 pro custom']) {
    assert.equal(supportsPuckKnob(title, 'bat'), true, title)
  }
  for (const title of ['', 'Fungo', 'Overload Trainer', 'Blade Barrel', 'Trophy Bat', 'Towel Bat']) {
    assert.equal(supportsPuckKnob(title, 'bat'), false, title)
  }
  assert.equal(supportsPuckKnob('RA13L', 'shirt'), false)
  assert.equal(supportsPuckKnob('RA13L', 'misc'), false)
})

test('changing a selected game bat to a non-game item clears its choice without affecting price or another line', () => {
  const original = line()
  for (const patch of [{ title: 'Fungo' }, { title: '' }, { itemType: 'shirt' }, { itemType: 'misc' }]) {
    const updated = client.updateSalesLineDraft(original, patch)
    assert.equal(updated.puckKnob, 'No')
    assert.equal(updated.unitPrice, '159.00')
    assert.equal(original.puckKnob, 'Yes')
  }
  assert.equal(client.updateSalesLineDraft(original, { title: 'AP5' }).puckKnob, 'Yes')
  assert.equal(client.updateSalesLineDraft(original, { puckKnob: 'No' }).puckKnob, 'No')
  assert.equal(client.updateSalesLineDraft(line({ puckKnob: undefined }), {}).puckKnob, 'No')
})

test('typed catalog and custom pro model patches flow through the same choice normalization', () => {
  const original = line()
  const catalog = [{ id: 'product-fungo', name: 'Fungo', variants: [{ id: 'variant-fungo', price: '119.00' }] }]
  const patch = client.getTypedBatModelPatch(catalog, 'Fungo', original)
  const updated = client.updateSalesLineDraft(original, patch)
  assert.equal(updated.productId, 'product-fungo')
  assert.equal(updated.puckKnob, 'No')
  const pro = client.updateSalesLineDraft(original, { title: 'AP5 pro custom', isProOrder: true, productId: '', variantId: '' })
  assert.equal(pro.puckKnob, 'Yes')
  assert.equal(productionModelLabel({ model: pro.title, puckKnob: pro.puckKnob }), 'AP5.pk pro custom')
})

test('submission cloning retains independent game choices and removes stale non-game choices', () => {
  const original = payload([line(), line({ id: 'line-2', puckKnob: 'No' }), line({ id: 'line-3', title: 'Blade Barrel' })])
  const cloned = client.cloneSalesOrderDraft(original)
  assert.deepEqual(Array.from(cloned.lines, l => l.puckKnob), ['Yes', 'No', 'No'])
  cloned.lines[0].puckKnob = 'No'
  assert.equal(original.lines[0].puckKnob, 'Yes')
  assert.equal(original.lines[2].puckKnob, 'Yes')
})

test('draft and direct Shopify payloads retain per-line knob choices without altering source models or prices', () => {
  const input = payload([line(), line({ id: 'line-2', puckKnob: 'No' }), line({ id: 'line-3', title: 'Fungo' }),
    line({ id: 'line-4', title: 'RA13L', itemType: 'misc' })])
  const before = JSON.stringify(input)
  for (const [builder, propertyKey] of [['buildDraftOrderInput', 'customAttributes'], ['buildOrderCreateInput', 'properties']]) {
    const request = server[builder](input, 'manual-puck-test')
    assert.equal(request.lineItems.length, 4)
    const attrs = request.lineItems.map(item => pairs(item[propertyKey]))
    assert.deepEqual(Array.from(attrs, a => a.trinity_puck_knob), ['Yes', 'No', undefined, undefined])
    assert.deepEqual(Array.from(attrs, a => a.trinity_model), ['RA13L', 'RA13L', 'Fungo', 'RA13L'])
    assert.doesNotMatch(JSON.stringify(request), /\.pk|productionModel/)
    for (const item of request.lineItems) {
      const amount = item.originalUnitPriceWithCurrency?.amount ?? item.priceOverride?.amount ?? item.priceSet?.shopMoney?.amount
      assert.equal(Number(amount), 159)
      assert.equal(item.quantity, 2)
    }
  }
  assert.equal(JSON.stringify(input), before)
})

test('pro custom and variant-backed draft lines both persist the knob property', () => {
  const request = server.buildDraftOrderInput(payload([
    line({ isProOrder: true, title: 'AP5', productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/2' }),
    line({ id: 'line-2', variantId: 'gid://shopify/ProductVariant/3' }),
  ]), 'manual-pro-test')
  assert.equal(request.lineItems[0].variantId, undefined)
  assert.equal(request.lineItems[1].variantId, 'gid://shopify/ProductVariant/3')
  assert.equal(pairs(request.lineItems[0].customAttributes).trinity_puck_knob, 'Yes')
  assert.equal(pairs(request.lineItems[1].customAttributes).trinity_puck_knob, 'Yes')
})

test('manual alias is authoritative and never inherits an order-level knob choice', () => {
  for (const properties of [
    [{ key: '_Puck Knob', value: 'Yes' }, { key: 'trinity_puck_knob', value: 'No' }],
    [{ key: 'trinity_puck_knob', value: 'No' }, { key: '_Puck Knob', value: 'Yes' }],
  ]) {
    const details = productionLineDetails([{ key: 'trinity_model', value: 'RA13L' }, ...properties])
    assert.equal(details.specs.puckKnob, 'No')
    assert.equal(details.specs.productionModel, 'RA13L')
  }
  const inherited = server.extractSpecs({ trinity_puck_knob: 'Yes' }, { trinity_model: 'RA13L' })
  assert.equal(inherited.puckKnob, '')
  const own = server.extractSpecs({ trinity_puck_knob: 'Yes' }, { trinity_model: 'RA13L', trinity_puck_knob: 'No' })
  assert.equal(own.puckKnob, 'No')
})

test('draft creation, direct creation, and completed drafts keep the same production notation', () => {
  const input = payload([line(), line({ id: 'line-2', puckKnob: 'No' })])
  const request = server.buildDraftOrderInput(input, 'manual-lifecycle')
  const draft = draftSource(request)
  const order = orderSource(request)
  const sets = [
    server.mapDraftOrderToJobs(draft, input, 'manual-lifecycle', false),
    server.mapCreatedOrderToJobs(order, input, 'manual-lifecycle', false),
    server.mapCompletedDraftOrderToJobs(order, draft, input, 'manual-lifecycle', false),
  ]
  for (const jobs of sets) {
    assert.deepEqual(Array.from(jobs, j => j.specs.productionModel), ['RA13L.pk', 'RA13L'])
    assert.deepEqual(Array.from(jobs, j => j.specs.model), ['RA13L', 'RA13L'])
    assert.equal(jobs[0].submissionSnapshot.draft.lines[0].puckKnob, 'Yes')
    assert.equal(jobs[0].submissionSnapshot.draft.lines[1].puckKnob, 'No')
    for (const layout of ['detail', 'landscape']) {
      const html = buildProductionDocument(jobs, layout)
      assert.match(html, /<h2>1\. RA13L\.pk<\/h2>/)
      assert.match(html, /<h2>2\. RA13L<\/h2>/)
    }
  }
})

test('manual Shopify properties survive subsequent GraphQL and webhook ingestion', () => {
  const input = payload([line(), line({ id: 'line-2', puckKnob: 'No' })])
  const draftRequest = server.buildDraftOrderInput(input, 'manual-refresh')
  const directRequest = server.buildOrderCreateInput(input, 'manual-refresh')
  const graphJobs = server.mapGraphQLOrderToJobs(orderSource(draftRequest))
  const webhookJobs = server.mapOrderWebhookToJobs({ id: 84, name: '#TBC84',
    note_attributes: [{ name: 'trinity_origin', value: 'internal_sales' }],
    line_items: directRequest.lineItems.map((item, i) => ({ ...item, id: i + 1, price: '159.00' })) }, 'orders/create')
  for (const jobs of [graphJobs, webhookJobs]) {
    assert.deepEqual(Array.from(jobs, j => j.specs.productionModel), ['RA13L.pk', 'RA13L'])
    assert.deepEqual(Array.from(jobs, j => j.specs.puckKnob), ['Yes', 'No'])
  }
})

test('older creation payloads cannot erase an affirmative knob already returned by Shopify', () => {
  const current = payload([line()])
  const request = server.buildDraftOrderInput(current, 'legacy-create')
  const draft = draftSource(request)
  const order = orderSource(request)
  for (const older of [payload([{ ...line(), puckKnob: undefined }]), payload([])]) {
    for (const jobs of [
      server.mapCreatedOrderToJobs(order, older, 'legacy-create', false),
      server.mapCompletedDraftOrderToJobs(order, draft, older, 'legacy-create', false),
    ]) {
      assert.equal(jobs[0].specs.puckKnob, 'Yes')
      assert.equal(jobs[0].specs.productionModel, 'RA13L.pk')
      assert.equal(jobs[0].specs.model, 'RA13L')
    }
  }
})

test('saved submission snapshots and reorders preserve choices without modifying the original', () => {
  const input = payload([line(), line({ id: 'line-2', puckKnob: 'No' })])
  const request = server.buildDraftOrderInput(input, 'manual-reorder')
  const jobs = server.mapDraftOrderToJobs(draftSource(request), input, 'manual-reorder', false)
  const original = JSON.stringify(jobs[0].submissionSnapshot)
  const group = groupSubmittedOrders(jobs)[0]
  const result = buildReorderDraft(group, null, owner)
  assert.deepEqual(result.draft.lines.map(l => l.puckKnob), ['Yes', 'No'])
  assert.deepEqual(result.draft.lines.map(l => l.title), ['RA13L', 'RA13L'])
  result.draft.lines[0].puckKnob = 'No'
  assert.equal(JSON.stringify(jobs[0].submissionSnapshot), original)
  assert.equal(input.lines[0].puckKnob, 'Yes')
})

test('legacy reorder recovers stored knob choice and old snapshots safely default to No in form cloning', () => {
  const input = payload([line(), line({ id: 'line-2', puckKnob: 'No' })])
  const jobs = server.mapDraftOrderToJobs(draftSource(server.buildDraftOrderInput(input, 'legacy')), input, 'legacy', false)
  for (const job of jobs) delete job.submissionSnapshot
  const restored = buildReorderDraft(groupSubmittedOrders(jobs)[0], null, owner)
  assert.deepEqual(restored.draft.lines.map(l => l.puckKnob), ['Yes', 'No'])
  const oldLine = { ...line() }
  delete oldLine.puckKnob
  const snapshot = createSubmissionSnapshot(payload([oldLine]))
  assert.equal(snapshot.draft.lines[0].puckKnob, undefined)
  assert.equal(client.cloneSalesOrderDraft(snapshot.draft).lines[0].puckKnob, 'No')
})

test('server refuses stale affirmative knobs on non-game items and normalizes unselected legacy inputs', () => {
  for (const changes of [{ title: 'Blade Barrel' }, { title: 'Fungo' }, { itemType: 'shirt' }, { itemType: 'misc' }, { title: '' }]) {
    const current = line(changes)
    assert.equal(server.salesLinePuckKnob(current), '')
    assert.doesNotMatch(server.specsFromSalesLine(current).productionModel, /\.pk/)
  }
  assert.equal(server.salesLinePuckKnob(line({ puckKnob: undefined })), 'No')
  assert.equal(server.salesLinePuckKnob(line({ puckKnob: 'yes' })), 'Yes')
  assert.equal(server.salesLinePuckKnob(line({ puckKnob: 'maybe' })), 'No')
})
