import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatSalesOrderShippingOptionLabel,
  getSalesOrderBatQuantity,
  getSalesOrderShippingQuote,
} from '../shared/sales-order-shipping-policy.mjs'

test('standard shipping follows the bat-count tiers at every boundary', () => {
  assert.equal(getSalesOrderShippingQuote('standard', 0).amount, '15.00')
  assert.equal(getSalesOrderShippingQuote('standard', 3).amount, '15.00')
  assert.equal(getSalesOrderShippingQuote('standard', 4).amount, '30.00')
  assert.equal(getSalesOrderShippingQuote('standard', 6).amount, '30.00')
  assert.equal(getSalesOrderShippingQuote('standard', 7).amount, '50.00')
})

test('both rush shipping speeds become $100 above three bats', () => {
  assert.equal(getSalesOrderShippingQuote('fast', 3).amount, '50.00')
  assert.equal(getSalesOrderShippingQuote('really_fast', 3).amount, '75.00')
  assert.equal(getSalesOrderShippingQuote('fast', 4).amount, '100.00')
  assert.equal(getSalesOrderShippingQuote('really_fast', 4).amount, '100.00')
})

test('comped shipping remains free for every bat quantity', () => {
  assert.equal(getSalesOrderShippingQuote('comped', 1).amount, '0.00')
  assert.equal(getSalesOrderShippingQuote('comped', 20).amount, '0.00')
})

test('shirt quantities do not affect the shipping tier', () => {
  const batQuantity = getSalesOrderBatQuantity([
    { itemType: 'bat', quantity: 3 },
    { itemType: 'shirt', quantity: 10 },
  ])

  assert.equal(batQuantity, 3)
  assert.equal(getSalesOrderShippingQuote('standard', batQuantity).amount, '15.00')
})

test('shipping labels expose the currently calculated charge and tier', () => {
  assert.equal(
    formatSalesOrderShippingOptionLabel('standard', 4),
    'Standard — $30.00 (4–6 bats)',
  )
  assert.equal(
    formatSalesOrderShippingOptionLabel('fast', 7),
    'Fast — $100.00 (4+ bats)',
  )
})
