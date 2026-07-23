import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  allowsLocalInternalAccess,
  isInternalAppShellPath,
  renderAppShell,
  verifyShopifySessionToken,
} from '../server/shopify-embedded-auth.mjs'

const apiKey = 'trinity-client-id'
const apiSecret = 'trinity-test-secret'
const shopDomain = 'trinitybatco.myshopify.com'
const nowMs = Date.UTC(2026, 6, 23, 18, 0, 0)

function createSessionToken(payloadPatch = {}, secret = apiSecret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      aud: apiKey,
      dest: `https://${shopDomain}`,
      exp: Math.floor(nowMs / 1000) + 60,
      nbf: Math.floor(nowMs / 1000) - 5,
      sub: '123456789',
      ...payloadPatch,
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

test('internal and Shopify alternate launch paths receive the embedded app shell', () => {
  assert.equal(isInternalAppShellPath('/'), true)
  assert.equal(isInternalAppShellPath('/internal-tool?embedded=1'), true)
  assert.equal(isInternalAppShellPath('/inventory-tool'), true)
  assert.equal(isInternalAppShellPath('/apps/trinity-billet-inventory'), true)
  assert.equal(isInternalAppShellPath('/sales-order'), false)
  assert.equal(isInternalAppShellPath('/team-tool'), false)
})

test('loopback access is never treated as authenticated in production', () => {
  assert.equal(allowsLocalInternalAccess('production'), false)
  assert.equal(allowsLocalInternalAccess('PRODUCTION'), false)
  assert.equal(allowsLocalInternalAccess('development'), true)
  assert.equal(allowsLocalInternalAccess(undefined), true)
})

test('internal app shell loads App Bridge without forcing standalone desktop redirects', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, {
    includeShopifyAppBridge: true,
    apiKey,
  })

  assert.match(html, /name="shopify-api-key" content="trinity-client-id"/)
  assert.match(html, /name="shopify-disabled-features" content="auto-redirect"/)
  assert.match(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/)
  assert.doesNotMatch(html, /TRINITY_SHOPIFY_APP_BRIDGE/)
})

test('public and team-code shells do not load App Bridge', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, {
    includeShopifyAppBridge: false,
    apiKey,
  })

  assert.equal(html, '<head></head>')
})

test('Shopify session tokens require a valid signature, audience, time, and exact shop', () => {
  const options = { apiSecret, apiKey, shopDomain, nowMs }
  assert.equal(verifyShopifySessionToken(createSessionToken(), options), true)
  assert.equal(
    verifyShopifySessionToken(createSessionToken({}, 'wrong-secret'), options),
    false,
  )
  assert.equal(
    verifyShopifySessionToken(createSessionToken({ aud: 'wrong-client-id' }), options),
    false,
  )
  assert.equal(
    verifyShopifySessionToken(
      createSessionToken({ exp: Math.floor(nowMs / 1000) - 1 }),
      options,
    ),
    false,
  )
  assert.equal(
    verifyShopifySessionToken(
      createSessionToken({
        dest: `https://${shopDomain}.attacker.example`,
      }),
      options,
    ),
    false,
  )
  assert.equal(
    verifyShopifySessionToken(
      createSessionToken({ dest: 'https://another-shop.myshopify.com' }),
      options,
    ),
    false,
  )
})
