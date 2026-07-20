import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrailingSalesLeaderboard } from '../server/team-leaderboard.mjs'

const members = [
  {
    key: 'steve@trinitybats.com',
    name: 'Steve Panayiotou',
    label: 'Steve Panayiotou',
    email: 'steve@trinitybats.com',
    aliases: ['Steve'],
    role: 'sales',
  },
]

test('leaderboard counts a submitted draft and its paid order only once', () => {
  const now = Date.parse('2026-07-20T12:00:00.000Z')
  const rows = buildTrailingSalesLeaderboard(
    [
      {
        id: 'draft-line',
        origin: 'internal_sales',
        intakeId: 'sales-1',
        orderSubmittedAt: '2026-07-10T12:00:00.000Z',
        salesRep: 'Steve',
        salesRepEmail: 'steve@trinitybats.com',
        quantity: 2,
        totalPrice: '100.00',
        invoiceStatus: 'sent',
      },
      {
        id: 'paid-line',
        origin: 'internal_sales',
        intakeId: 'sales-1',
        orderSubmittedAt: '2026-07-10T12:00:00.000Z',
        salesRep: 'Steve Panayiotou',
        salesRepEmail: 'steve@trinitybats.com',
        quantity: 2,
        totalPrice: '100.00',
        invoiceStatus: 'paid',
      },
    ],
    members,
    now,
  )

  assert.equal(rows[0].submittedCount, 1)
  assert.equal(rows[0].submittedValue, 200)
})

test('leaderboard excludes orders outside the trailing window', () => {
  const now = Date.parse('2026-07-20T12:00:00.000Z')
  const rows = buildTrailingSalesLeaderboard(
    [
      {
        id: 'old-line',
        origin: 'internal_sales',
        intakeId: 'sales-old',
        orderSubmittedAt: '2026-06-01T12:00:00.000Z',
        salesRepEmail: 'steve@trinitybats.com',
        quantity: 1,
        totalPrice: '500.00',
        invoiceStatus: 'paid',
      },
    ],
    members,
    now,
  )

  assert.equal(rows[0].submittedCount, 0)
  assert.equal(rows[0].submittedValue, 0)
})
