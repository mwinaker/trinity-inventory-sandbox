import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSalesLeaderboardForWindow,
  buildTrailingSalesLeaderboard,
} from '../server/team-leaderboard.mjs'

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

test('leaderboard supports exact custom and all-time windows', () => {
  const jobs = [
    {
      id: 'old-line',
      origin: 'internal_sales',
      intakeId: 'sales-old',
      orderSubmittedAt: '2025-01-15T12:00:00.000Z',
      salesRepEmail: 'steve@trinitybats.com',
      quantity: 1,
      totalPrice: '500.00',
      invoiceStatus: 'paid',
    },
    {
      id: 'current-line',
      origin: 'internal_sales',
      intakeId: 'sales-current',
      orderSubmittedAt: '2026-07-10T12:00:00.000Z',
      salesRepEmail: 'steve@trinitybats.com',
      quantity: 2,
      totalPrice: '125.00',
      invoiceStatus: 'sent',
    },
  ]

  const customRows = buildSalesLeaderboardForWindow(jobs, members, {
    sinceMs: Date.parse('2025-01-01T00:00:00.000Z'),
    throughMs: Date.parse('2025-01-31T23:59:59.999Z'),
  })
  const allTimeRows = buildSalesLeaderboardForWindow(jobs, members, {
    throughMs: Date.parse('2026-08-04T18:00:00.000Z'),
  })

  assert.equal(customRows[0].submittedCount, 1)
  assert.equal(customRows[0].submittedValue, 500)
  assert.equal(allTimeRows[0].submittedCount, 2)
  assert.equal(allTimeRows[0].submittedValue, 750)
})
