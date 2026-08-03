import assert from 'node:assert/strict'
import test from 'node:test'

import { getSuccessfulPaymentTimestamp } from '../shared/sales-payment-reconciliation.mjs'

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
