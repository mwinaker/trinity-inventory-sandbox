import assert from 'node:assert/strict'
import test from 'node:test'

import {
  needsSalesRepPlayerEmailProtection,
  protectSalesRepPlayerEmail,
} from '../server/sales-order-contact-policy.mjs'

test('recognizes when a player email duplicates the submitting sales rep email', () => {
  assert.equal(
    needsSalesRepPlayerEmailProtection({
      playerEmail: 'KEITH@TRINITYBATS.COM',
      salesRepEmail: 'keith@trinitybats.com',
    }),
    true,
  )
  assert.equal(
    needsSalesRepPlayerEmailProtection({
      playerEmail: 'player@example.com',
      salesRepEmail: 'keith@trinitybats.com',
    }),
    false,
  )
})

test('keeps a legacy payer address while removing an unsaved rep-to-player association', () => {
  const protectedPayload = protectSalesRepPlayerEmail(
    {
      playerName: 'Jordan Smith',
      playerEmail: 'keith@trinitybats.com',
      salesRepEmail: 'keith@trinitybats.com',
      billingDifferent: false,
    },
    [],
  )

  assert.equal(protectedPayload.payerEmail, 'keith@trinitybats.com')
  assert.equal(protectedPayload.playerEmail, '')
})

test('retains the player association when the matching email is already on a saved CRM contact', () => {
  const protectedPayload = protectSalesRepPlayerEmail(
    {
      playerName: 'Jordan Smith',
      payerEmail: 'keith@trinitybats.com',
      playerEmail: 'keith@trinitybats.com',
      salesRepEmail: 'keith@trinitybats.com',
      billingDifferent: false,
    },
    [
      {
        name: 'Keith Frye',
        email: 'keith@trinitybats.com',
        playerNames: ['Jordan Smith'],
      },
    ],
  )

  assert.equal(protectedPayload.payerEmail, 'keith@trinitybats.com')
  assert.equal(protectedPayload.playerEmail, 'keith@trinitybats.com')
})

test('does not use an unrelated saved contact to associate the rep email to a player', () => {
  const protectedPayload = protectSalesRepPlayerEmail(
    {
      playerName: 'Jordan Smith',
      playerEmail: 'keith@trinitybats.com',
      salesRepEmail: 'keith@trinitybats.com',
      billingDifferent: false,
    },
    [
      {
        name: 'Another Player',
        email: 'keith@trinitybats.com',
        playerNames: [],
      },
    ],
  )

  assert.equal(protectedPayload.payerEmail, 'keith@trinitybats.com')
  assert.equal(protectedPayload.playerEmail, '')
})

test('does not alter a separately entered player email', () => {
  const payload = {
    playerName: 'Jordan Smith',
    payerEmail: 'keith@trinitybats.com',
    playerEmail: 'player@example.com',
    salesRepEmail: 'keith@trinitybats.com',
  }

  assert.deepEqual(protectSalesRepPlayerEmail(payload, []), payload)
})
