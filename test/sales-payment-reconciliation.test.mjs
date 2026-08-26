import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCanonicalSalesSummary,
  buildSalesReconciliationChecks,
  classifyPaidInvoiceSource,
  classifySalesReportingCategory,
  getSuccessfulPaymentTimestamp,
  getSalesOrderStatusBucket,
  isShopifyDraftOrderSource,
  isWebsiteOrderSource,
} from '../shared/sales-payment-reconciliation.mjs'

function transaction(kind, status, amount, processedAt) {
  return {
    kind,
    status,
    processedAt,
    amountSet: { shopMoney: { amount: String(amount), currencyCode: 'USD' } },
  }
}

test('uses the successful sale timestamp when it pays the invoice in full', () => {
  const paidAt = getSuccessfulPaymentTimestamp(
    [transaction('SALE', 'SUCCESS', 150, '2026-07-21T16:30:00Z')],
    150,
  )

  assert.equal(paidAt, '2026-07-21T16:30:00Z')
})

test('returns the capture that brings cumulative successful payments to the order total', () => {
  const paidAt = getSuccessfulPaymentTimestamp(
    [
      transaction('CAPTURE', 'SUCCESS', 80, '2026-07-24T19:00:00Z'),
      transaction('AUTHORIZATION', 'SUCCESS', 150, '2026-07-20T14:00:00Z'),
      transaction('CAPTURE', 'SUCCESS', 70, '2026-07-22T18:00:00Z'),
    ],
    150,
  )

  assert.equal(paidAt, '2026-07-24T19:00:00Z')
})

test('ignores failed sales and does not report a partially paid invoice as paid', () => {
  const paidAt = getSuccessfulPaymentTimestamp(
    [
      transaction('SALE', 'FAILURE', 150, '2026-07-21T16:30:00Z'),
      transaction('CAPTURE', 'SUCCESS', 75, '2026-07-22T16:30:00Z'),
    ],
    150,
  )

  assert.equal(paidAt, '')
})

test('does not treat a zero-dollar order as a paid transaction', () => {
  assert.equal(getSuccessfulPaymentTimestamp([], 0), '')
})

test('only classifies Shopify Online Store orders as direct website orders', () => {
  assert.equal(isWebsiteOrderSource('web'), true)
  assert.equal(isWebsiteOrderSource('WEB'), true)
  assert.equal(isWebsiteOrderSource('shopify_draft_order'), false)
  assert.equal(isWebsiteOrderSource('pos'), false)
  assert.equal(isWebsiteOrderSource(''), false)
})

test('only classifies Shopify draft-order-source orders as draft orders', () => {
  assert.equal(isShopifyDraftOrderSource('shopify_draft_order'), true)
  assert.equal(isShopifyDraftOrderSource('SHOPIFY_DRAFT_ORDER'), true)
  assert.equal(isShopifyDraftOrderSource('web'), false)
  assert.equal(isShopifyDraftOrderSource('pos'), false)
  assert.equal(isShopifyDraftOrderSource(''), false)
})

test('includes Inventory-tagged and Shopify Draft Orders in paid invoice reporting', () => {
  assert.equal(classifyPaidInvoiceSource('shopify_draft_order', true), 'inventory')
  assert.equal(classifyPaidInvoiceSource('shopify_draft_order', false), 'shopify_draft_order')
  assert.equal(classifyPaidInvoiceSource('web', false), '')
  assert.equal(classifyPaidInvoiceSource('pos', false), '')
})

test('classifies reporting channels with manual markers taking precedence', () => {
  assert.equal(
    classifySalesReportingCategory({
      sourceName: 'web',
      appName: 'Online Store',
      hasInventoryMarker: true,
    }),
    'manual_sales_order_entry',
  )
  assert.equal(
    classifySalesReportingCategory({
      sourceName: 'shopify_draft_order',
      appName: 'Draft Orders',
      hasInventoryMarker: false,
    }),
    'manual_sales_order_entry',
  )
  assert.equal(
    classifySalesReportingCategory({
      sourceName: 'web',
      appName: 'Online Store',
      hasInventoryMarker: false,
    }),
    'online_store',
  )
  assert.equal(
    classifySalesReportingCategory({ sourceName: 'web', appName: 'Shop' }),
    'shop',
  )
  assert.equal(
    classifySalesReportingCategory({ sourceName: 'pos', appName: 'Point of Sale' }),
    'point_of_sale',
  )
  assert.equal(
    classifySalesReportingCategory({ sourceName: 'web', appName: 'Unrecognized app' }),
    'other_unresolved',
  )
})

test('keeps zero-dollar completed orders as comped without inventing a payment event', () => {
  assert.equal(
    getSalesOrderStatusBucket({ financialStatus: 'PAID', total: 0, paidAt: '' }),
    'comped',
  )
  assert.equal(
    getSalesOrderStatusBucket({
      financialStatus: 'PAID',
      total: 125,
      paidAt: '2026-08-01T12:00:00Z',
    }),
    'paid_positive',
  )
  assert.equal(
    getSalesOrderStatusBucket({ financialStatus: 'PENDING', total: 125, paidAt: '' }),
    'pending',
  )
  assert.equal(
    getSalesOrderStatusBucket({ financialStatus: 'REFUNDED', total: 0, paidAt: '' }),
    'refunded',
  )
})

test('reconciles mutually exclusive channel and manual-status totals', () => {
  const orders = [
    {
      orderId: '1',
      orderName: '#1',
      reportingCategory: 'manual_sales_order_entry',
      statusBucket: 'paid_positive',
      currentOrderValue: 100,
      salesRepResolution: 'canonical',
    },
    {
      orderId: '2',
      orderName: '#2',
      reportingCategory: 'manual_sales_order_entry',
      statusBucket: 'comped',
      currentOrderValue: 0,
      salesRepResolution: 'unresolved',
    },
    {
      orderId: '3',
      orderName: '#3',
      reportingCategory: 'online_store',
      statusBucket: 'paid_positive',
      currentOrderValue: 75.55,
    },
    {
      orderId: '4',
      orderName: '#4',
      reportingCategory: 'shop',
      statusBucket: 'paid_positive',
      currentOrderValue: 20,
    },
  ]
  const summary = buildCanonicalSalesSummary(orders)
  const reconciliation = buildSalesReconciliationChecks(orders, summary)

  assert.deepEqual(summary.total, { count: 4, value: 195.55 })
  assert.deepEqual(summary.categories.manual_sales_order_entry, { count: 2, value: 100 })
  assert.deepEqual(summary.manualStatuses.comped, { count: 1, value: 0 })
  assert.equal(reconciliation.ok, true)
  assert.deepEqual(reconciliation.unresolvedManualRepOrderNames, ['#2'])
})

test('fails reconciliation for duplicate order IDs and unresolved channels', () => {
  const orders = [
    {
      orderId: '1',
      orderName: '#1',
      reportingCategory: 'online_store',
      statusBucket: 'paid_positive',
      currentOrderValue: 50,
    },
    {
      orderId: '1',
      orderName: '#2',
      reportingCategory: 'other_unresolved',
      statusBucket: 'other',
      currentOrderValue: 25,
    },
  ]
  const reconciliation = buildSalesReconciliationChecks(orders)

  assert.equal(reconciliation.ok, false)
  assert.deepEqual(reconciliation.duplicateOrderIds, ['1'])
  assert.deepEqual(reconciliation.unresolvedOrderNames, ['#2'])
})
