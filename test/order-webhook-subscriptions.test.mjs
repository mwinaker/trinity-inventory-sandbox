import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOrderWebhookUri,
  reconcileOrderWebhookSubscriptions,
  requiredOrderWebhookTopics,
} from '../server/order-webhook-subscriptions.mjs'

test('builds the HTTPS endpoint used by Shopify order webhooks', () => {
  assert.equal(
    buildOrderWebhookUri('https://trinity-billet-inventory.onrender.com/'),
    'https://trinity-billet-inventory.onrender.com/api/webhooks/orders',
  )
  assert.throws(() => buildOrderWebhookUri('http://localhost:3000'), /must use HTTPS/)
})

test('creates and then verifies each required order webhook', async () => {
  const subscriptions = []
  const actions = []
  const result = await reconcileOrderWebhookSubscriptions({
    baseUrl: 'https://trinity-billet-inventory.onrender.com',
    listSubscriptions: async () => subscriptions,
    createSubscription: async ({ topic, uri }) => {
      const subscription = { id: `gid://shopify/WebhookSubscription/${topic}`, topic, uri }
      subscriptions.push(subscription)
      actions.push(`create:${topic}`)
      return subscription
    },
    updateSubscription: async () => {
      throw new Error('update should not be needed')
    },
  })

  assert.equal(result.subscriptions.length, requiredOrderWebhookTopics.length)
  assert.deepEqual(actions, requiredOrderWebhookTopics.map((topic) => `create:${topic}`))
  assert.deepEqual(result.actions.map((item) => item.action), Array(4).fill('created'))
})

test('repairs an app-owned order webhook that points to an old endpoint', async () => {
  const subscriptions = requiredOrderWebhookTopics.map((topic, index) => ({
    id: `gid://shopify/WebhookSubscription/${index + 1}`,
    topic,
    uri: 'https://old-trinity-service.example.com/api/webhooks/orders',
  }))
  const updates = []
  const result = await reconcileOrderWebhookSubscriptions({
    baseUrl: 'https://trinity-billet-inventory.onrender.com',
    listSubscriptions: async () => subscriptions,
    createSubscription: async () => {
      throw new Error('create should not be needed')
    },
    updateSubscription: async ({ id, uri }) => {
      const subscription = subscriptions.find((item) => item.id === id)
      subscription.uri = uri
      updates.push(id)
      return subscription
    },
  })

  assert.equal(updates.length, requiredOrderWebhookTopics.length)
  assert.deepEqual(result.actions.map((item) => item.action), Array(4).fill('updated'))
})

test('does not change a verified set of required order webhooks', async () => {
  const uri = 'https://trinity-billet-inventory.onrender.com/api/webhooks/orders'
  const subscriptions = requiredOrderWebhookTopics.map((topic, index) => ({
    id: `gid://shopify/WebhookSubscription/${index + 1}`,
    topic,
    uri,
  }))
  const result = await reconcileOrderWebhookSubscriptions({
    baseUrl: 'https://trinity-billet-inventory.onrender.com',
    listSubscriptions: async () => subscriptions,
    createSubscription: async () => {
      throw new Error('create should not be needed')
    },
    updateSubscription: async () => {
      throw new Error('update should not be needed')
    },
  })

  assert.deepEqual(result.actions.map((item) => item.action), Array(4).fill('verified'))
})
