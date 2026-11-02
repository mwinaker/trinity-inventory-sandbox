import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBatPriceStats } from '../shared/bat-price-stats.mjs'

function line(id, title, quantity, currentQuantity, net, productType = '') {
  return {
    id: `gid://shopify/LineItem/${id}`,
    title,
    quantity,
    currentQuantity,
    priceAfterAllDiscountsBeforeTaxesSet: { shopMoney: { amount: String(net) } },
    variant: { product: { productType } },
  }
}

test('bat prices use paid current physical units and exclude non-bats, comps, and pending sales', () => {
  const result = buildBatPriceStats([
    { orderName: '#1', reportingCategory: 'manual_sales_order_entry', financialStatus: 'PAID',
      lineItems: [line(999001, 'Pro Model RA13', 2, 2, 300), line(999002, 'Shipping', 1, 1, 15)] },
    { orderName: '#2', reportingCategory: 'online_store', financialStatus: 'PAID',
      lineItems: [line(999003, 'Fungo FS3000', 3, 2, 200), line(999004, 'Pro Model RA13', 1, 1, 0)] },
    { orderName: '#3', reportingCategory: 'manual_sales_order_entry', financialStatus: 'PENDING',
      lineItems: [line(999005, 'Pro Model RA13', 1, 1, 900)] },
  ])
  assert.deepEqual(result.manual_sales_order_entry, {
    average: 150, median: 150, batCount: 2, lineCount: 1, netBatSales: 300,
  })
  assert.deepEqual(result.online_store, {
    average: 100, median: 100, batCount: 2, lineCount: 1, netBatSales: 200,
  })
  assert.deepEqual(result.combined, {
    average: 125, median: 125, batCount: 4, lineCount: 2, netBatSales: 500,
  })
  assert.deepEqual(result.review, [])
})

test('bundles and lines needing production notes are excluded for review', () => {
  const result = buildBatPriceStats([
    { orderName: '#old', reportingCategory: 'manual_sales_order_entry', financialStatus: 'PAID',
      lineItems: [line(999007, 'Custom trainer order - 8', 1, 1, 800)] },
    { orderName: '#new', reportingCategory: 'manual_sales_order_entry', financialStatus: 'PAID',
      lineItems: [line(999006, '24 bats and 30 t-shirts', 1, 1, 1200)] },
  ])
  assert.equal(result.manual_sales_order_entry.batCount, 0)
  assert.equal(result.manual_sales_order_entry.average, null)
  assert.deepEqual(result.review.map((entry) => entry.orderName), ['#old', '#new'])
})
