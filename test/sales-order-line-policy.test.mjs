import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getSalesOrderProductionQuantity,
  normalizeSalesOrderItemType,
} from '../server/sales-order-line-policy.mjs'

test('shirt quantities do not create bat rush-production surcharges', () => {
  assert.equal(
    getSalesOrderProductionQuantity({
      lines: [
        { itemType: 'bat', quantity: 2 },
        { itemType: 'shirt', quantity: 3 },
      ],
    }),
    2,
  )
})

test('legacy lines remain bat production lines', () => {
  assert.equal(normalizeSalesOrderItemType(undefined), 'bat')
  assert.equal(getSalesOrderProductionQuantity({ lines: [{ quantity: 2 }] }), 2)
})
