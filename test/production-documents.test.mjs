import test from 'node:test'
import assert from 'node:assert/strict'
import { productionOrderJobs, buildProductionDocument } from '../src/production-documents.ts'
const first={id:'draft-1-line-1',intakeId:'intake-a',shopifyDraftOrderId:'draft-1',productTitle:'CS271',quantity:2,internalNotes:'Private build instructions',specs:{model:'CS271',length:'33',targetWeight:'30',engraving:'<script>bad()</script>'},internalAttachment:{filename:'Logo.jpg',contentType:'image/jpeg',downloadUrl:'https://cdn.shopify.com/logo.jpg'}}
test('whole-order grouping follows source identifiers, not customer names, and deduplicates source lines',()=>{
 const second={...first,id:'order-1-line-2',shopifyOrderId:'order-1',lineItemId:'line-2'}
 const linked={...second,id:'copy',intakeId:'',shopifyDraftOrderId:''}
 const other={...first,id:'other',intakeId:'intake-b',shopifyDraftOrderId:'draft-2'}
 assert.deepEqual(productionOrderJobs([first,second,linked,other],first).map(x=>x.id),[first.id,second.id])
 assert.deepEqual(productionOrderJobs([{id:'one'},{id:'two'}],{id:'one'}).map(x=>x.id),['one'])
})
test('both layouts retain notes/specs and attachment, escape content and never include customer payment/email actions',()=>{
 for(const layout of ['detail','landscape']){
  const html=buildProductionDocument([first],layout,'test-time')
  for(const text of ['PRODUCTION ONLY','DO NOT SEND TO CUSTOMER','Private build instructions','CS271','33','30','Logo.jpg','Open / print original attachment']) assert.ok(html.includes(text),text)
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'))
  assert.ok(!html.includes('<script>bad()'))
  assert.ok(!html.includes('mailto:') && !html.includes('/apps/download-pdf') && !html.includes('Pay online'))
  assert.match(html,new RegExp('size:letter '+(layout==='detail'?'portrait':'landscape')))
 }
})
test('reject active attachment URLs and do not auto-load external images',()=>{
 for(const url of ['javascript:alert(1)','https://untrusted.example/logo.jpg']){
  const html=buildProductionDocument([{...first,internalAttachment:{filename:'logo',downloadUrl:url,contentType:'image/jpeg'}}],'detail')
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('javascript:'))
 }
})
test('large orders retain every line and long notes instead of clipping',()=>{
 const jobs=Array.from({length:20},(_,i)=>({...first,id:`line-${i}`,productTitle:`Product ${i}`,specs:{model:`Product ${i}`},internalNotes:`Notes ${i} `+'long '.repeat(100)}))
 const html=buildProductionDocument(jobs,'landscape')
 for(let i=0;i<20;i++) assert.ok(html.includes(`Product ${i}`)&&html.includes(`Notes ${i}`))
 assert.ok(!html.includes('overflow:hidden')&&!html.includes('max-height:100%'))
})
