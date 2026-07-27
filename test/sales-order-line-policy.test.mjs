import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getSalesOrderProductionQuantity,
  normalizeSalesOrderItemType,
} from '../server/sales-order-line-policy.mjs'

test('non-bat quantities do not create bat rush-production surcharges', () => {
  assert.equal(
    getSalesOrderProductionQuantity({
      lines: [
        { itemType: 'bat', quantity: 2 },
        { itemType: 'shirt', quantity: 3 },
        { itemType: 'misc', quantity: 5 },
      ],
    }),
    2,
  )
})

test('legacy lines remain bat production lines', () => {
  assert.equal(normalizeSalesOrderItemType(undefined), 'bat')
  assert.equal(getSalesOrderProductionQuantity({ lines: [{ quantity: 2 }] }), 2)
})

test('miscellaneous item aliases normalize to the misc line type', () => {
  assert.equal(normalizeSalesOrderItemType('misc'), 'misc')
  assert.equal(normalizeSalesOrderItemType('miscellaneous'), 'misc')
  assert.equal(normalizeSalesOrderItemType('miscellaneous product'), 'misc')
})
