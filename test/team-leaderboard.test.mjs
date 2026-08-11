import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSalesLeaderboardFromSubmissions,
  buildSalesLeaderboardForWindow,
  buildTrailingSalesLeaderboard,
  buildUnifiedSalesSubmissions,
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

test('unified submissions retain a Shopify Draft Order with no inventory record or rep', () => {
  const submissions = buildUnifiedSalesSubmissions(
    [],
    [
      {
        id: 'gid://shopify/DraftOrder/158',
        name: '#D158',
        status: 'INVOICE_SENT',
        createdAt: '2026-04-15T12:00:00.000Z',
        note2: 'Jackson Holliday',
        customer: { displayName: 'Baltimore Orioles' },
        lineItems: {
          nodes: [
            {
              title: 'Pro Birch JH7.1',
              quantity: 6,
              originalUnitPriceSet: { shopMoney: { amount: '139.00' } },
            },
          ],
        },
      },
    ],
    members,
  )

  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].draftOrderName, '#D158')
  assert.equal(submissions[0].salesRep, '')
  assert.equal(submissions[0].submissionSource, 'shopify_draft_order')
  assert.equal(submissions[0].quantity, 6)
  assert.equal(submissions[0].total, 834)
})

test('unified submissions deduplicate an inventory record and its Shopify Draft Order', () => {
  const submissions = buildUnifiedSalesSubmissions(
    [
      {
        id: 'job-1',
        origin: 'internal_sales',
        intakeId: 'sales-1',
        shopifyDraftOrderId: 'gid://shopify/DraftOrder/211',
        shopifyDraftOrderName: '#D211',
        orderSubmittedAt: '2026-07-10T12:00:00.000Z',
        salesRep: 'Steve',
        salesRepEmail: 'steve@trinitybats.com',
        playerName: 'Jackson Holliday',
        productTitle: 'Custom bat',
        quantity: 2,
        totalPrice: '0.00',
        invoiceStatus: 'not_required',
      },
    ],
    [
      {
        id: 'gid://shopify/DraftOrder/211',
        name: '#D211',
        status: 'COMPLETED',
        createdAt: '2026-07-10T12:00:00.000Z',
        customAttributes: [{ key: 'trinity_intake_id', value: 'sales-1' }],
        order: {
          id: 'gid://shopify/Order/1245',
          name: '#TBC1245',
          displayFinancialStatus: 'PAID',
        },
        lineItems: {
          nodes: [
            {
              title: 'Custom bat',
              quantity: 2,
              originalUnitPriceSet: { shopMoney: { amount: '0.00' } },
            },
          ],
        },
      },
    ],
    members,
  )

  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].submissionSource, 'inventory')
  assert.equal(submissions[0].draftOrderName, '#D211')
  assert.equal(submissions[0].paidOrderName, '#TBC1245')
  assert.equal(submissions[0].isPaid, true)
})

test('leaderboard counts direct Shopify Draft Orders and canonicalizes staff aliases', () => {
  const team = [
    ...members,
    {
      key: 'jeremy@trinitybats.com',
      name: 'Jeremy McKee',
      label: 'Jeremy McKee',
      email: 'jeremy@trinitybats.com',
      aliases: ['Trinity Bat Co Admin'],
      role: 'admin',
    },
  ]
  const submissions = buildUnifiedSalesSubmissions(
    [],
    [
      {
        id: 'gid://shopify/DraftOrder/300',
        name: '#D300',
        status: 'INVOICE_SENT',
        createdAt: '2026-07-10T12:00:00.000Z',
        tags: ['Sales Rep: Trinity Bat Co Admin'],
        lineItems: {
          nodes: [
            {
              title: 'Custom bat',
              quantity: 1,
              originalUnitPriceSet: { shopMoney: { amount: '175.00' } },
            },
          ],
        },
      },
    ],
    team,
  )
  const rows = buildSalesLeaderboardFromSubmissions(submissions, team, {
    sinceMs: Date.parse('2026-07-01T00:00:00.000Z'),
    throughMs: Date.parse('2026-08-01T00:00:00.000Z'),
  })

  assert.equal(submissions[0].salesRep, 'Jeremy McKee')
  assert.equal(rows.find((row) => row.label === 'Jeremy McKee').submittedCount, 1)
  assert.equal(rows.find((row) => row.label === 'Jeremy McKee').submittedValue, 175)
})
