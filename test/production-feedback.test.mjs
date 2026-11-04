import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { buildProductionDocument } from '../shared/production-documents.ts'
import { productionContactFromOrder } from '../server/production-contact.mjs'
import { createSubmissionSnapshot, buildReorderDraft } from '../server/order-history.mjs'
import { mergeCurrentPrintJobs } from '../server/production-print-records.mjs'

const serverUrl = new URL('../server/index.mjs', import.meta.url)
const source = fs.readFileSync(serverUrl, 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const modules = {}
for (const n of ast.statements) if (ts.isImportDeclaration(n) && n.moduleSpecifier.text.startsWith('.')) Object.assign(modules, await import(new URL(n.moduleSpecifier.text, serverUrl)))
const server = vm.createContext({ ...modules, path, URL, Buffer, permanentOrderReferencesEnabled: true,
  shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', internalOrderNotificationEmails: [],
  draftInvoiceHost: 'test.myshopify.com', shopDomain: 'test.myshopify.com' })
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(ast)).join('\n'), server)
const line = { itemType: 'bat', title: 'RA13L', quantity: 2, unitPrice: '155.00', length: '33', puckKnob: 'Yes' }
const payload = { playerName: 'Test Player', levelOfPlay: 'Youth', requiresShipping: false, notes: 'PRIVATE BUILD NOTES', lines: [line] }
const nativeOrder = {
  id: 'gid://shopify/Order/42', name: '#TBC42', email: 'order@example.test', phone: '555-0101', requiresShipping: true,
  shippingAddress: { name: 'Ship Recipient', address1: '42 Test Street', address2: 'Unit 8', city: 'Testville', provinceCode: 'CO', zip: '80000', country: 'United States', phone: '555-0102' },
  shippingLine: { title: 'Express' }, customer: { displayName: 'Payer Name', email: 'payer@example.test' },
  customAttributes: [], note: 'Third engraving line: TEAM CHAMPIONS', displayFinancialStatus: 'PAID',
  lineItems: { nodes: [{ id: 'gid://shopify/LineItem/8', title: 'RA13L', quantity: 2, currentQuantity: 2, customAttributes: [] }] },
}

test('manual level selection survives native order/draft payload, job mapping, snapshot, and reorder', () => {
  for (const level of ['MLB', 'MILB', 'Indy Ball/International', 'College', 'High School', 'Youth', '']) {
    const selected = { ...payload, levelOfPlay: level }
    for (const builder of ['buildOrderCreateInput', 'buildDraftOrderInput']) {
      const input = server[builder](selected, 'test-intake')
      assert.equal(input.customAttributes.find(a=>a.key==='trinity_level_of_play')?.value || '', level)
      assert.equal(JSON.stringify(input).includes('PRIVATE BUILD NOTES'), false)
    }
    const jobs = server.mapCreatedOrderToJobs(nativeOrder, selected, 'test-intake', false)
    assert.equal(jobs[0].levelOfPlay, level)
    const snapshot = createSubmissionSnapshot(selected)
    assert.equal(snapshot.draft.levelOfPlay, level)
    const restored = buildReorderDraft({ primary: { ...jobs[0], submissionSnapshot: snapshot }, jobs }, null, {name:'Seller',email:'seller@example.test'})
    assert.equal(restored.draft.levelOfPlay, level)
    assert.ok(buildProductionDocument(jobs, 'detail').includes(`Level of play:</b> ${level || 'Not recorded'}`))
  }
  const draftJobs = server.mapDraftOrderToJobs({ id: 'gid://shopify/DraftOrder/9', name:'#D9', lineItems:{nodes:[]} }, payload, 'intake', false)
  assert.equal(draftJobs[0].levelOfPlay, 'Youth')
  assert.equal(draftJobs[0].submissionSnapshot.draft.levelOfPlay, 'Youth')
})

test('website customer/delivery details survive GraphQL and webhook ingestion', () => {
  const [job] = server.mapGraphQLOrderToJobs(nativeOrder)
  assert.equal(job.productionContact.recipientName, 'Ship Recipient')
  assert.deepEqual(Array.from(job.productionContact.addressLines), ['42 Test Street','Unit 8','Testville, CO 80000','United States'])
  assert.equal(job.productionContact.phone, '555-0102')
  assert.equal(job.productionContact.email, 'order@example.test')
  assert.equal(job.productionContact.shippingMethod, 'Express')
  for (const layout of ['detail','landscape']) {
    const html = buildProductionDocument([job], layout)
    for (const value of ['Ship Recipient','42 Test Street','Unit 8','Testville, CO 80000','order@example.test','Express']) assert.ok(html.includes(value),value)
    assert.ok(html.indexOf('Third engraving line: TEAM CHAMPIONS') < html.indexOf('<section class="products">'))
    assert.ok(html.indexOf('Customer &amp; shipping details') > html.indexOf('Handwritten billet numbers'))
  }
  const hook = {id:42,name:'#TBC42',email:'order@example.test',customer:{first_name:'Payer',last_name:'Name'},
    shipping_address:{name:'Ship Recipient',address1:'42 Test Street',city:'Testville',province_code:'CO',zip:'80000',country:'United States'},
    shipping_lines:[{title:'Express'}],note_attributes:[{name:'trinity_level_of_play',value:'College'}],line_items:[{id:8,title:'RA13L',quantity:2}]}
  const [webhook] = server.mapOrderWebhookToJobs(hook, 'orders/create')
  assert.equal(webhook.productionContact.recipientName,'Ship Recipient')
  assert.equal(webhook.levelOfPlay,'College')
})

test('front page uses engraving order number, early notes and essential specs without metadata clutter', () => {
  const job = { ...server.mapGraphQLOrderToJobs(nativeOrder)[0], orderReference:'T-00091', internalNotes:'CHECK BEFORE CUTTING',
    assignedBilletId:'internal-id', assignedBilletBarcodes:['B-4242'], specs:{model:'RA13L.pk',puckKnob:'Yes',
      trinity_player_name:'Test Player',trinity_item_type:'bat',trinity_requires_shipping:'true',
      'Third Line Dark Text':'CUSTOM ENGRAVING', 'Unknown future finish':'Preserve this selection'} }
  for (const layout of ['detail','landscape']) {
    const html = buildProductionDocument([job],layout)
    assert.match(html,/<h1>#TBC42<\/h1>/)
    assert.match(html,/Internal reference: T-00091/)
    assert.ok(html.indexOf('CHECK BEFORE CUTTING') < html.indexOf('<section class="products">'))
    for (const detail of ['CUSTOM ENGRAVING','Preserve this selection','B-4242','Handwritten billet numbers']) assert.ok(html.includes(detail))
    for (const hidden of ['trinity player name','trinity item type','internal-id','assigned Billet Id','Default Title']) assert.ok(!html.includes(hidden),hidden)
    assert.match(html,/Level of play:<\/b> Not recorded/)
    assert.match(html,/Length \(in\)<\/dt><dd>Not recorded/)
  }
})

test('current missing address never falls back to historical shipping information', () => {
  const contact = productionContactFromOrder({...nativeOrder,shippingAddress:null})
  const html = buildProductionDocument([{...server.mapGraphQLOrderToJobs(nativeOrder)[0],productionContact:contact,
    submissionSnapshot:{draft:{shippingAddress1:'STALE ADDRESS',shippingCity:'Old City'}}}],'detail')
  assert.ok(!html.includes('STALE ADDRESS'))
  assert.match(html,/verify before shipping/)
  assert.equal(productionContactFromOrder({id:'42'}), undefined)
})

test('recognized manual summaries move contact details to the back and preserve all production notes once', () => {
  const timestamp = '2026-11-04T12:00:00Z'
  const note = `Order type: Custom\nProduction timeline: Rush\nPlayer email: player@example.test\nShipping address: 42 Test Street\nOrder submitted: ${timestamp}\nSpecial request: KEEP THIS IN FRONT`
  const job = { ...server.mapGraphQLOrderToJobs(nativeOrder)[0], origin:'internal_sales', orderSubmittedAt:timestamp,
    sourceOrderNotes:note, notes:note, internalNotes:'PRIVATE FINISH INSTRUCTIONS' }
  const html = buildProductionDocument([job], 'detail')
  const front = html.slice(0, html.indexOf('<section class="support">'))
  const back = html.slice(html.indexOf('<section class="support">'))
  for (const instruction of ['Order type: Custom','Production timeline: Rush','Special request: KEEP THIS IN FRONT','PRIVATE FINISH INSTRUCTIONS']) {
    assert.ok(front.includes(instruction))
    assert.equal(html.split(instruction).length - 1, 1)
  }
  assert.ok(!front.includes('Player email: player@example.test'))
  for (const detail of ['Player email: player@example.test','Shipping address: 42 Test Street',`Order submitted: ${timestamp}`]) assert.ok(back.includes(detail))
  const unknown = buildProductionDocument([{...job, origin:'shopify'}], 'detail')
  assert.ok(unknown.indexOf('Player email: player@example.test') < unknown.indexOf('<section class="products">'))
})

test('drafts are clearly identified and mixed current lines keep exact line/player metadata', () => {
  const html = buildProductionDocument([{id:'draft-9-line-1',shopifyDraftOrderName:'#D9',orderReference:'T-9',quantity:1}],'detail')
  assert.match(html,/<h1>#D9<\/h1>/)
  assert.match(html,/DRAFT · Shopify order number not yet assigned/)
  assert.ok(!html.includes('Bat engraving reference'))
  const saved=[{id:'old1',lineItemId:'l1',levelOfPlay:'Youth',playerProfileId:'player1'}, {id:'old2',lineItemId:'l2',levelOfPlay:'College',playerProfileId:'player2'}]
  const merged=mergeCurrentPrintJobs([{id:'new2',lineItemId:'l2'},{id:'new1',lineItemId:'l1'}],saved)
  assert.deepEqual(merged.map(j=>j.levelOfPlay),['College','Youth'])
  assert.deepEqual(merged.map(j=>j.playerProfileId),['player2','player1'])
})
