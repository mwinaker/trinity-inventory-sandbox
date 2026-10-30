import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { productionModelLabel } from '../shared/production-model.ts'
import { productionLineDetails } from '../server/production-line-details.mjs'
import { buildProductionDocument } from '../shared/production-documents.ts'
import { isOrderJobPaid } from '../shared/order-payment-status.mjs'

// Exercise the application's actual mapping/merge functions without starting its
// HTTP server or connecting to Shopify. This follows private-order-notes.test.mjs.
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
const clientFunctions = new Set(['normalizeOrderJob', 'normalizeInvoiceStatus', 'normalizeProductionStatus',
  'normalizeOrderAttachment', 'normalizeInternalAttachmentNotifications', 'mergeOrderSpecs'])
const appFunctions = appAst.statements.filter(n => ts.isFunctionDeclaration(n) && clientFunctions.has(n.name?.text))
const client = vm.createContext({ isOrderJobPaid })
vm.runInContext(ts.transpileModule(appFunctions.map(n => n.getText(appAst)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText, client)

const attributes = (model = 'RA13L', knob = 'Yes', key = '_Puck Knob') => [
  { key: '_Bat model', value: model },
  ...(knob === undefined ? [] : [{ key, value: knob }]),
]
const graphqlOrder = (lines) => ({ id: 'gid://shopify/Order/42', name: '#TBC42',
  sourceName: 'web', customAttributes: [], displayFinancialStatus: 'PAID',
  createdAt: '2026-10-30T15:00:00Z', updatedAt: '2026-10-30T15:00:00Z',
  lineItems: { nodes: lines.map((line, i) => ({ id: `gid://shopify/LineItem/${i + 1}`,
    quantity: 1, title: 'Pro Model RA13L Custom', ...line })) } })
const webhookOrder = (lines) => ({ id: 42, name: '#TBC42', source_name: 'web',
  financial_status: 'paid', created_at: '2026-10-30T15:00:00Z', updated_at: '2026-10-30T15:00:00Z',
  line_items: lines.map((line, i) => ({ id: i + 1, quantity: 1, title: 'Pro Model RA13L Custom', ...line })) })
const webhookProperties = (attrs) => attrs.map(({ key, value }) => ({ name: key, value }))

test('exact affirmative puck choice derives a lower-case suffix while preserving full source model', () => {
  for (const knob of ['Yes', 'yes', ' YES ']) {
    const specs = { model: 'RA13L', puckKnob: knob }
    assert.equal(productionModelLabel(specs), 'RA13L.pk')
    assert.deepEqual(specs, { model: 'RA13L', puckKnob: knob })
  }
  for (const knob of ['', 'No', 'Puck', 'not Yes', 'No puck knob', 'true']) {
    assert.equal(productionModelLabel({ model: 'RA13L', puckKnob: knob }), 'RA13L')
  }
  assert.equal(productionModelLabel({ model: '', puckKnob: 'Yes' }), '')
  assert.equal(productionModelLabel({ model: 'RA13L', notes: 'Puck knob Yes' }), 'RA13L')
})

test('title fallback adds .pk to the model before build wording and preserves meaningful suffixes', () => {
  for (const build of ['Custom', 'Semi Custom', 'Semi-Custom', 'Fully Custom', 'Pro Custom']) {
    assert.equal(productionModelLabel({ puckKnob: 'Yes' }, `Youth Pro Model HK47 ${build}`), `Youth Pro Model HK47.pk ${build}`)
  }
  assert.equal(productionModelLabel({ model: 'RA13L', puckKnob: 'Yes' }), 'RA13L.pk')
  assert.equal(productionModelLabel({ model: 'RA13', puckKnob: 'Yes' }), 'RA13.pk')
})

test('repeated derivation and previously suffixed inputs never double the marker', () => {
  for (const model of ['RA13L.pk', 'RA13L.PK', 'RA13L.pk.pk']) {
    assert.equal(productionModelLabel({ model, puckKnob: 'Yes' }), 'RA13L.pk')
  }
  assert.equal(productionModelLabel({ model: 'Pro Model RA13L.pk Custom', puckKnob: 'Yes' }), 'Pro Model RA13L.pk Custom')
})

test('explicit non-game descriptions never receive a puck production suffix', () => {
  for (const title of ['Overload Trainer', 'Training Bat', 'Fungo', 'Trophy Bat', 'Towel Bat', 'T-shirt', 'Rush Production Surcharge']) {
    assert.equal(productionModelLabel({ model: 'RA13L', puckKnob: 'Yes' }, title), 'RA13L', title)
  }
})

test('known training model names remain outside the game-bat change', () => {
  for (const model of ['Blade Barrel', 'Short Heavy', 'Sledge', 'Weighted Skinny']) {
    assert.equal(productionModelLabel({ model, puckKnob: 'Yes' }, model), model, model)
  }
})

test('both observed live property spellings preserve the source model and canonical knob', () => {
  for (const key of ['Puck Knob', '_Puck Knob']) {
    const input = attributes('RA13L', 'Yes', key)
    const before = JSON.stringify(input)
    const result = productionLineDetails(input, {}, 'Pro Model RA13L Custom')
    assert.equal(result.specs.model, 'RA13L')
    assert.equal(result.specs.puckKnob, 'Yes')
    assert.equal(result.specs.productionModel, 'RA13L.pk')
    assert.equal(JSON.stringify(input), before)
    assert.equal(productionLineDetails(input, result.specs, 'Pro Model RA13L Custom').specs.productionModel, 'RA13L.pk')
  }
})

test('current absent or No knob clears previous puck metadata', () => {
  const old = productionLineDetails(attributes(), {}, 'Pro Model RA13L Custom').specs
  for (const input of [attributes('RA13L', 'No'), [{ key: '_Bat model', value: 'RA13L' }]]) {
    const current = productionLineDetails(input, old, 'Pro Model RA13L Custom').specs
    assert.equal(current.productionModel, 'RA13L')
    assert.notEqual(current.puckKnob, 'Yes')
    assert.equal(old.productionModel, 'RA13L.pk')
  }
})

test('GraphQL ingestion saves puck model per exact line without mutating Shopify source', () => {
  const order = graphqlOrder([
    { customAttributes: attributes() },
    { customAttributes: attributes('RA13L', 'No') },
    { title: 'Youth Pro Model HK47 Custom', customAttributes: [{ key: 'Puck Knob', value: 'Yes' }] },
    { title: 'Fungo', customAttributes: attributes('Fungo', 'Yes') },
  ])
  const before = JSON.stringify(order)
  const jobs = server.mapGraphQLOrderToJobs(order)
  assert.deepEqual(Array.from(jobs, job => job.specs.productionModel), ['RA13L.pk', 'RA13L', 'Youth Pro Model HK47.pk Custom', 'Fungo'])
  assert.equal(jobs[0].specs.model, 'RA13L')
  assert.equal(jobs[0].productTitle, 'Pro Model RA13L Custom')
  assert.equal(JSON.stringify(order), before)
})

test('webhook ingestion accepts name/value properties and keeps mixed lines separate', () => {
  const order = webhookOrder([
    { properties: webhookProperties(attributes()) },
    { properties: webhookProperties(attributes('RA13L', 'No', 'Puck Knob')) },
    { title: 'Pro Model AP5 Custom', properties: [{ name: 'Puck Knob', value: 'Yes' }] },
  ])
  const before = JSON.stringify(order)
  const jobs = server.mapOrderWebhookToJobs(order, 'orders/create')
  assert.deepEqual(Array.from(jobs, job => job.specs.productionModel), ['RA13L.pk', 'RA13L', 'Pro Model AP5.pk Custom'])
  assert.deepEqual(Array.from(jobs, job => job.specs.puckKnob), ['Yes', 'No', 'Yes'])
  assert.equal(JSON.stringify(order), before)
})

test('server merge keeps latest derived metadata, including unchecked choices, and original source model', () => {
  const old = { model: 'RA13L', productionModel: 'RA13L.pk', puckKnob: 'Yes', length: '33' }
  for (const puckKnob of ['', 'No']) {
    const result = server.mergeSpecs(old, { model: 'RA13L', productionModel: 'RA13L', puckKnob })
    assert.equal(result.productionModel, 'RA13L')
    assert.equal(result.puckKnob, puckKnob)
    assert.equal(result.model, 'RA13L')
    assert.equal(result.length, '33')
  }
  assert.equal(server.mergeSpecs(old, { length: '34' }).productionModel, 'RA13L.pk')
})

test('actual saved-job merge updates derived puck label while preserving production work', () => {
  const old = server.mapGraphQLOrderToJobs(graphqlOrder([{ customAttributes: attributes() }]))[0]
  old.productionStatus = 'in_production'
  old.assignedBilletId = 'billet-42'
  old.internalNotes = 'Keep these instructions'
  for (const customAttributes of [attributes('RA13L', 'No'), [{ key: '_Bat model', value: 'RA13L' }]]) {
    const current = server.mapGraphQLOrderToJobs(graphqlOrder([{ customAttributes }]))[0]
    const merged = server.mergeOrderJob(old, current)
    assert.equal(merged.specs.productionModel, 'RA13L')
    assert.notEqual(merged.specs.puckKnob, 'Yes')
    assert.equal(merged.productionStatus, 'in_production')
    assert.equal(merged.assignedBilletId, 'billet-42')
    assert.equal(merged.internalNotes, 'Keep these instructions')
  }
})

test('client normalization and merges preserve production metadata and explicit clearing', () => {
  const job = server.mapGraphQLOrderToJobs(graphqlOrder([{ customAttributes: attributes() }]))[0]
  const normalized = client.normalizeOrderJob(job)
  assert.equal(normalized.specs.model, 'RA13L')
  assert.equal(normalized.specs.productionModel, 'RA13L.pk')
  assert.equal(normalized.specs.puckKnob, 'Yes')
  assert.equal(client.mergeOrderSpecs(normalized.specs, {}).productionModel, 'RA13L.pk')
  for (const puckKnob of ['', 'No']) {
    const current = { model: 'RA13L', productionModel: 'RA13L', puckKnob }
    const merged = client.mergeOrderSpecs(current, normalized.specs)
    assert.equal(merged.productionModel, 'RA13L')
    assert.equal(merged.puckKnob, puckKnob)
  }
})

test('both invoice layouts use internal model once and keep regular-knob neighboring lines unchanged', () => {
  const jobs = server.mapGraphQLOrderToJobs(graphqlOrder([
    { customAttributes: attributes('RA13L', 'Yes') },
    { customAttributes: attributes('RA13L', 'No') },
  ])).map(job => client.normalizeOrderJob(job))
  for (const layout of ['detail', 'landscape']) {
    const html = buildProductionDocument(jobs, layout, '2026-10-30T15:00:00Z')
    assert.match(html, /<h2>1\. RA13L\.pk<\/h2>/)
    assert.match(html, /<h2>2\. RA13L<\/h2>/)
    assert.equal((html.match(/RA13L\.pk/g) || []).length, 1)
    assert.match(html, /PRODUCTION ONLY/)
    assert.match(html, /Puck knob<\/dt><dd>Yes<\/dd>/)
  }
  assert.equal(jobs[0].specs.model, 'RA13L')
})

test('customer order and invoice payloads never include derived production metadata', () => {
  const payload = { playerName: 'Example Player', playerEmail: 'customer@example.com',
    customerEmail: 'customer@example.com', requiresShipping: false,
    lines: [{ itemType: 'bat', title: 'RA13L', model: 'RA13L', quantity: 1, unitPrice: '159.00',
      productionModel: 'RA13L.pk', puckKnob: 'Yes' }] }
  for (const name of ['buildOrderCreateInput', 'buildDraftOrderInput']) {
    const result = server[name](payload, 'puck-test')
    assert.doesNotMatch(JSON.stringify(result), /\.pk|productionModel|puckKnob/)
    assert.match(JSON.stringify(result), /RA13L/)
  }
  const message = server.buildOrderInvoiceEmailInput(payload, { name: '#TBC42' })
  assert.doesNotMatch(JSON.stringify(message), /\.pk|productionModel|puckKnob/)
})
