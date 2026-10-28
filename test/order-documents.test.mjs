import test from 'node:test'
import assert from 'node:assert/strict'
import {statusFromSources,collectOrderAttachments,customerDocumentUrl} from '../server/order-documents.mjs'
import {createOrderDocumentService} from '../server/order-document-service.mjs'
const money=n=>({shopMoney:{amount:String(n),currencyCode:'USD'}})
const order={id:'gid://shopify/Order/10',name:'#TBC10',displayFinancialStatus:'PARTIALLY_PAID',totalPriceSet:money(100),totalOutstandingSet:money(50),transactions:[{kind:'AUTHORIZATION',status:'SUCCESS',processedAt:'2026-01-01T00:00:00Z',amountSet:money(100)},{kind:'CAPTURE',status:'SUCCESS',processedAt:'2026-01-02T00:00:00Z',amountSet:money(50)}]}
const draft={id:'gid://shopify/DraftOrder/20',name:'#D20',invoiceSentAt:'2025-12-30T00:00:00Z',status:'COMPLETED',order}
const job={id:'j',origin:'internal_sales',shopifyDraftOrderId:draft.id,orderReference:'T-ABCDE',salesRepEmail:'rep@example.com'}
const group={primary:job,jobs:[job]}
test('authorization, pending capture and partial payment are not full payment',()=>{
 assert.equal(statusFromSources([draft]).paidAt,'')
 assert.equal(statusFromSources([draft]).paymentStatus,'PARTIALLY_PAID')
 const paid={...order,displayFinancialStatus:'PAID',transactions:[...order.transactions,{kind:'CAPTURE',status:'SUCCESS',processedAt:'2026-01-03T00:00:00Z',amountSet:money(50)}]}
 assert.equal(statusFromSources([{...draft,order:paid}]).paidAt,'2026-01-03T00:00:00Z')
 assert.equal(statusFromSources([{...draft,order:paid}]).invoiceSentAt,draft.invoiceSentAt)
 assert.equal(statusFromSources([{...paid,cancelledAt:'2026-01-04'}]).paymentStatus,'CANCELLED')
})
test('existing approved templates use exact IDs without floating point rounding',()=>{
 assert.equal(customerDocumentUrl({id:'gid://shopify/DraftOrder/1290669097199',name:'#D489'},'receipt'),'https://trinitybatco.com/apps/download-pdf/drafts/91dcb7f04d15f1a08673/9390908351219924/d489.pdf')
 assert.match(customerDocumentUrl(order,'quote'),/orders\/d373b096caf265a4ab9f\/96890\/tbc10.pdf$/)
 assert.throws(()=>customerDocumentUrl({id:'https://bad.test'},'receipt'))
})
test('attachment collection deduplicates files and excludes unsafe links',()=>{
 const good={filename:'drawing.pdf',downloadUrl:'https://cdn.shopify.com/s/files/drawing.pdf'}
 const g={primary:{internalAttachment:good},jobs:[{internalAttachment:good,additionalInternalAttachments:[{downloadUrl:'javascript:alert(1)'},{downloadUrl:'https://bad.test/private'}]}]}
 assert.equal(collectOrderAttachments(g,null).length,1)
})
test('records survive service restarts, reconcile conversion, paginate source and remain idempotent',async()=>{
 const records=new Map();let calls=0
 const dependencies={read:async id=>records.get(id),write:async r=>records.set(r.id,structuredClone(r)),query:async (q,v)=>{
  calls++
  if(q.includes('OrderDocumentStatus'))return {data:{nodes:[draft]}}
  assert.equal(v.id,order.id)
  return {data:{node:{id:order.id,name:order.name,lineItems:{nodes:[{id:v.after?'second':'first',title:'CS271',customAttributes:[]}],pageInfo:{hasNextPage:!v.after,endCursor:'next'}}}}}
 }}
 let service=createOrderDocumentService(dependencies)
 await service.recordSent(draft.id,'2025-12-29T00:00:00Z')
 let result=await service.reconcile(group,{includeSource:true})
 assert.equal(result.resourceId,order.id)
 assert.equal(result.source.lineItems.nodes.length,2)
 assert.equal(records.size,1)
 const initialCalls=calls
 await service.reconcile(group,{includeSource:true})
 assert.equal(calls,initialCalls)
 service=createOrderDocumentService(dependencies)
 result=await service.reconcile(group,{includeSource:true})
 assert.equal(result.events.length,2)
 assert.equal([...records.values()][0].source.lineItems.nodes.length,2)
 assert.equal([...records.values()][0].ownerEmail,'rep@example.com')
})


test('a removed Shopify record does not hide saved production sources or attachments',async()=>{
 const records=new Map()
 const service=createOrderDocumentService({query:async()=>({data:{nodes:[null]}}),read:async id=>records.get(id),write:async r=>records.set(r.id,r)})
 const result=await service.reconcile(group,{includeSource:true})
 assert.equal(result.sourceUnavailable,true)
 assert.equal(result.paymentStatus,'UNAVAILABLE')
 assert.equal(result.resourceId,draft.id)
 assert.equal([...records.values()][0].savedJobs[0].id,job.id)
})
