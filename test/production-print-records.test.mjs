import test from 'node:test'
import assert from 'node:assert/strict'
import {mergeCurrentPrintJobs} from '../server/production-print-records.mjs'
import {buildProductionDocument} from '../shared/production-documents.ts'
test('current Shopify lines prevent duplicate draft/order products and stale specifications',()=>{
 const saved=[{id:'draft-1-line-1',quantity:1,internalNotes:'Private instructions',specs:{length:'33.5'},internalAttachment:{filename:'Logo',downloadUrl:'https://cdn.shopify.com/logo.jpg'}},{id:'draft-1-line-2',quantity:1,specs:{length:'33.75'}},{id:'order-1-line-11',lineItemId:'line11',quantity:1,specs:{length:'33.75'},productionStatus:'in_progress'},{id:'order-1-line-12',lineItemId:'line12',quantity:1,specs:{length:'33.75'}}]
 const current=[{id:'order-1-line-11',lineItemId:'line11',productTitle:'T26',quantity:1,specs:{length:'33.5'}},{id:'order-1-line-12',lineItemId:'line12',productTitle:'T26',quantity:2,specs:{length:'33.75'}}]
 const result=mergeCurrentPrintJobs(current,saved)
 assert.equal(result.length,2);assert.deepEqual(result.map(j=>j.quantity),[1,2]);assert.deepEqual(result.map(j=>j.specs.length),['33.5','33.75']);assert.equal(result[0].productionStatus,'in_progress')
 const html=buildProductionDocument(result,'detail');assert.match(html,/2 product lines · 3 units/);assert.match(html,/Private instructions/);assert.match(html,/Logo/)
})
