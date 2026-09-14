import test from 'node:test'
import assert from 'node:assert/strict'
import {isOrderJobPaid} from '../shared/order-payment-status.mjs'
import {getSalesOrderStatusBucket} from '../shared/sales-payment-reconciliation.mjs'
import {buildUnifiedSalesSubmissions} from '../server/team-leaderboard.mjs'
for(const status of ['draft','UNPAID','PENDING','PARTIALLY_PAID','AUTHORIZED','VOIDED']){
 test(`T-number and stale paid flags cannot turn ${status} into a paid order`,()=>{
  const job={id:'draft-line',intakeId:'intake',origin:'internal_sales',orderReference:'T-00001',financialStatus:status,invoiceStatus:'paid',salesRepPaidNotificationSentAt:'2026-09-14T20:00:00Z',quantity:1,totalPrice:'100',createdAt:'2026-09-14T20:00:00Z'}
  assert.equal(isOrderJobPaid(job),false);assert.notEqual(getSalesOrderStatusBucket({financialStatus:status,total:100,paidAt:job.salesRepPaidNotificationSentAt}),'paid_positive')
  const result=buildUnifiedSalesSubmissions([job],[],[])[0];assert.equal(result.isPaid,false);assert.notEqual(result.invoiceStatus,'paid')
 })
}
test('only actual fully paid, live, non-cancelled jobs are paid',()=>{
 assert.equal(isOrderJobPaid({financialStatus:'PAID',orderReference:'T-00001'}),true)
 assert.equal(isOrderJobPaid({financialStatus:'PAID',test:true}),false)
 assert.equal(isOrderJobPaid({financialStatus:'PAID',cancelledAt:'2026-09-14'}),false)
})

test('live unpaid linked order overrides a stale cached paid flag', () => {
  const job = {id: 'line', shopifyDraftOrderId: 'gid://shopify/DraftOrder/1', origin: 'internal_sales', financialStatus: 'PAID', invoiceStatus: 'paid', quantity: 1, totalPrice: '100'}
  const draft = {id: job.shopifyDraftOrderId, name: '#D1', status: 'COMPLETED', order: {id: 'gid://shopify/Order/2', name: '#TBC2', displayFinancialStatus: 'PENDING'}, lineItems: {nodes: []}}
  const submissions = buildUnifiedSalesSubmissions([job], [draft], [])
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].isPaid, false)
  assert.notEqual(submissions[0].invoiceStatus, 'paid')
})
