import assert from 'node:assert/strict'
import test from 'node:test'

import { shopifyAuthenticatedFetch } from '../src/shopify-authenticated-fetch.ts'

function getAuthorizationHeader(init) {
  return new Headers(init?.headers).get('authorization')
}

test('non-embedded pages use the original request without waiting for App Bridge', async () => {
  const calls = []
  const response = await shopifyAuthenticatedFetch('/api/catalog', undefined, {
    isAppBridgeEnabled: () => false,
    fetchImplementation: async (input, init) => {
      calls.push({ input, init })
      return new Response('{}', { status: 200 })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(getAuthorizationHeader(calls[0].init), null)
})

test('an available Shopify ID token authenticates the first backend request', async () => {
  const calls = []
  const response = await shopifyAuthenticatedFetch('/api/state', { cache: 'no-store' }, {
    isAppBridgeEnabled: () => true,
    getIdTokenProvider: () => ({
      idToken: async () => 'signed-shopify-token',
    }),
    fetchImplementation: async (input, init) => {
      calls.push({ input, init })
      return new Response('{"ok":true}', { status: 200 })
    },
  })

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(
    getAuthorizationHeader(calls[0].init),
    'Bearer signed-shopify-token',
  )
})

test('a mobile startup 401 waits for App Bridge and retries with its signed token', async () => {
  const calls = []
  let providerChecks = 0
  const response = await shopifyAuthenticatedFetch('/api/state', { cache: 'no-store' }, {
    isAppBridgeEnabled: () => true,
    getIdTokenProvider: () => {
      providerChecks += 1
      if (providerChecks < 3) return undefined
      return {
        idToken: async () => 'mobile-shopify-token',
      }
    },
    wait: async () => {},
    tokenRetryIntervalMs: 100,
    tokenRetryTimeoutMs: 500,
    fetchImplementation: async (input, init) => {
      calls.push({ input, init })
      return new Response(
        calls.length === 1
          ? '{"ok":false,"message":"verified session required"}'
          : '{"ok":true}',
        { status: calls.length === 1 ? 401 : 200 },
      )
    },
  })

  assert.equal(response.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(getAuthorizationHeader(calls[0].init), null)
  assert.equal(
    getAuthorizationHeader(calls[1].init),
    'Bearer mobile-shopify-token',
  )
})

test('a protected request stays denied when Shopify never supplies a token', async () => {
  const calls = []
  const response = await shopifyAuthenticatedFetch('/api/state', undefined, {
    isAppBridgeEnabled: () => true,
    getIdTokenProvider: () => undefined,
    wait: async () => {},
    tokenRetryIntervalMs: 100,
    tokenRetryTimeoutMs: 200,
    fetchImplementation: async (input, init) => {
      calls.push({ input, init })
      return new Response('{"ok":false}', { status: 401 })
    },
  })

  assert.equal(response.status, 401)
  assert.equal(calls.length, 1)
  assert.equal(getAuthorizationHeader(calls[0].init), null)
})
