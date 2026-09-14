import assert from 'node:assert/strict'
import test from 'node:test'
import { hasTrinityManualOrderMarker, getManualOrderSourceDetail, manualOrderSourceLabel } from '../shared/manual-order-provenance.mjs'
import { classifySalesReportingCategory } from '../shared/sales-payment-reconciliation.mjs'

for (const [name,order] of [
 ['marked draft conversion',{sourceName:'shopify_draft_order',app:{name:'Draft Orders'},customAttributes:[{key:'trinity_origin',value:'internal_sales'}]}],
 ['legacy tagged manual order',{sourceName:'shopify_draft_order',tags:['Internal Sales']}],
 ['legacy pro team source',{sourceName:'Pro Order - San Diego Padres',app:{name:'Trinity Billet Inventory'}}],
 ['legacy default app source',{sourceName:'351830966273',app:{name:'Trinity Billet Inventory'}}],
 ['new fixed source',{sourceName:'trinity_manual_order'}],
 ['webhook note attributes',{source_name:'web',note_attributes:[{name:'trinity_origin',value:'internal_sales'}]}],
 ['webhook comma-delimited tags',{source_name:'shopify_draft_order',tags:'Pro Order, Internal Sales, Player: Example'}],
]) {
 test(`${name} uses the same manual business category`,()=>{
  assert.equal(hasTrinityManualOrderMarker(order),true)
  assert.equal(classifySalesReportingCategory({...order,appName:order.app?.name,hasInventoryMarker:hasTrinityManualOrderMarker(order)}),'manual_sales_order_entry')
  assert.equal(getManualOrderSourceDetail(order,true),manualOrderSourceLabel)
 })
}
test('a linked draft or tool job retains provenance when Shopify attributes are missing',()=>{
 assert.equal(hasTrinityManualOrderMarker({},[{origin:'internal_sales'}]),true)
 assert.equal(hasTrinityManualOrderMarker({},[],{tags:['Trinity Intake']}),true)
})
test('native website, Shop, POS and direct Shopify drafts do not become tool entries',()=>{
 for(const order of [{sourceName:'web',app:{name:'Online Store'}},{sourceName:'pos'},{app:{name:'Shop'}},{sourceName:'shopify_draft_order',app:{name:'Draft Orders'}}]) assert.equal(hasTrinityManualOrderMarker(order),false)
})
