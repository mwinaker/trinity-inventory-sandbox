import assert from 'node:assert/strict'
import test from 'node:test'

import {
  minimumInternalSessionSecretLength,
  resolveInternalSessionSigning,
} from '../server/internal-session-secret.mjs'

test('production signing fails closed when the dedicated secret is missing', () => {
  assert.deepEqual(
    resolveInternalSessionSigning({
      SHOPIFY_API_SECRET: 'mutable-shopify-secret',
      SHOPIFY_ADMIN_ACCESS_TOKEN: 'mutable-admin-token',
    }),
    {
      secret: '',
      source: 'missing',
      stable: false,
    },
  )
})

test('production signing rejects an undersized dedicated secret', () => {
  assert.deepEqual(
    resolveInternalSessionSigning({
      TRINITY_INTERNAL_SESSION_SECRET: 'too-short',
    }),
    {
      secret: '',
      source: 'dedicated_invalid',
      stable: false,
    },
  )
})

test('Shopify credential rotation cannot change a configured dedicated signer', () => {
  const dedicatedSecret = 's'.repeat(minimumInternalSessionSecretLength)
  const beforeRotation = resolveInternalSessionSigning({
    TRINITY_INTERNAL_SESSION_SECRET: dedicatedSecret,
    SHOPIFY_API_SECRET: 'shopify-secret-before-rotation',
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'admin-token-before-rotation',
  })
  const afterRotation = resolveInternalSessionSigning({
    TRINITY_INTERNAL_SESSION_SECRET: dedicatedSecret,
    SHOPIFY_API_SECRET: 'shopify-secret-after-rotation',
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'admin-token-after-rotation',
  })

  assert.deepEqual(beforeRotation, {
    secret: dedicatedSecret,
    source: 'dedicated_internal_secret',
    stable: true,
  })
  assert.deepEqual(afterRotation, beforeRotation)
})
