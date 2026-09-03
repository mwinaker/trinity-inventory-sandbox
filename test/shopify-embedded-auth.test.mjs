import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import vm from 'node:vm'

import {
  allowsLocalInternalAccess,
  buildShopifySessionBounceLocation,
  hasEmbeddedShopifyContext,
  isInternalAppShellPath,
  renderAppShell,
  renderShopifySessionBounce,
  setShopifySessionRetryHeader,
  shopifySessionRetryHeaderName,
  shouldRetryShopifySessionRequest,
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

function getBounceInlineScript() {
  const html = renderShopifySessionBounce(apiKey)
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  return scripts.map((match) => match[1]).find((script) => script.includes('requestShopifySignIn'))
}

async function runBounceInlineScript({
  search = '?shopify-reload=%2F',
  idToken = async () => 'fresh-shopify-token',
  setTimeout = () => 1,
} = {}) {
  const elements = {
    status: { textContent: '' },
    detail: { textContent: '' },
    retry: {
      hidden: true,
      addEventListener(_eventName, handler) {
        this.handler = handler
      },
    },
  }
  let replacedLocation = ''
  const window = {
    location: {
      origin: 'https://trinity.local',
      search,
      replace(value) {
        replacedLocation = value
      },
    },
    setTimeout,
    shopify: { idToken },
  }
  const document = {
    getElementById(id) {
      return elements[id]
    },
  }

  vm.runInNewContext(getBounceInlineScript(), {
    document,
    Error,
    Promise,
    URL,
    URLSearchParams,
    window,
  })
  await new Promise((resolve) => setImmediate(resolve))

  return { elements, replacedLocation }
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

test('only invalid bearer-token requests instruct App Bridge to refresh and retry', () => {
  assert.equal(shouldRetryShopifySessionRequest('Bearer signed-token'), true)
  assert.equal(shouldRetryShopifySessionRequest('bearer signed-token'), true)
  assert.equal(shouldRetryShopifySessionRequest(''), false)
  assert.equal(shouldRetryShopifySessionRequest(undefined), false)
  assert.equal(shouldRetryShopifySessionRequest('Basic credentials'), false)

  const headers = new Map()
  setShopifySessionRetryHeader({
    set(name, value) {
      headers.set(name, value)
    },
  })

  assert.equal(headers.get(shopifySessionRetryHeaderName), '1')
})

test('embedded Shopify launches can be identified without treating standalone links as embedded', () => {
  assert.equal(hasEmbeddedShopifyContext({ embedded: '1' }), true)
  assert.equal(
    hasEmbeddedShopifyContext({ host: 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvdHJpbml0eQ' }),
    true,
  )
  assert.equal(hasEmbeddedShopifyContext({ shop: shopDomain }), false)
  assert.equal(hasEmbeddedShopifyContext(), false)
})

test('session-token bounce preserves launch context and removes stale tokens', () => {
  const location = buildShopifySessionBounceLocation(
    '/?embedded=1&host=encoded-host&id_token=stale-token&shop=trinitybatco.myshopify.com',
  )
  const bounce = new URL(location, 'https://trinity.local')

  assert.equal(bounce.pathname, '/session-token-bounce')
  assert.equal(bounce.searchParams.get('embedded'), '1')
  assert.equal(bounce.searchParams.get('host'), 'encoded-host')
  assert.equal(bounce.searchParams.get('shop'), shopDomain)
  assert.equal(bounce.searchParams.has('id_token'), false)
  assert.equal(
    bounce.searchParams.get('shopify-reload'),
    '/?embedded=1&host=encoded-host&shop=trinitybatco.myshopify.com',
  )
})

test('session-token bounce loads only App Bridge so Shopify can immediately relaunch the app', () => {
  const html = renderShopifySessionBounce(apiKey)

  assert.match(html, /name="shopify-api-key" content="trinity-client-id"/)
  assert.match(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/)
  assert.match(html, /window\.shopify\.idToken\(\)/)
  assert.match(html, /window\.location\.replace\(target\.href\)/)
  assert.match(html, /Shopify sign-in timed out/)
  assert.match(html, /Try Shopify sign-in again/)
  assert.doesNotMatch(html, /shopify-disabled-features/)
  assert.doesNotMatch(html, /src="\/src\/main\.tsx"/)
})

test('session-token bounce actively returns to the requested app path with a fresh token', async () => {
  const result = await runBounceInlineScript({
    search:
      '?embedded=1&shopify-reload=%2Finventory-tool%3Fembedded%3D1%26host%3Dencoded-host',
  })

  assert.equal(
    result.replacedLocation,
    'https://trinity.local/inventory-tool?embedded=1&host=encoded-host&id_token=fresh-shopify-token',
  )
  assert.equal(result.elements.retry.hidden, true)
})

test('session-token bounce falls through to the app shell when Shopify does not respond', async () => {
  const result = await runBounceInlineScript({
    search:
      '?embedded=1&shopify-reload=%2Finventory-tool%3Fembedded%3D1%26host%3Dencoded-host',
    idToken: async () => new Promise(() => {}),
    setTimeout(callback) {
      callback()
      return 1
    },
  })

  assert.equal(
    result.replacedLocation,
    'https://trinity.local/inventory-tool?embedded=1&host=encoded-host&shopify_auth_failed=1',
  )
  assert.equal(result.elements.retry.hidden, true)
})

test('session-token bounce falls through to the app shell when App Bridge is unavailable', async () => {
  const result = await runBounceInlineScript({
    search:
      '?embedded=1&shopify-reload=%2Finventory-tool%3Fembedded%3D1%26host%3Dencoded-host',
    idToken: null,
  })

  assert.equal(
    result.replacedLocation,
    'https://trinity.local/inventory-tool?embedded=1&host=encoded-host&shopify_auth_failed=1',
  )
  assert.equal(result.elements.retry.hidden, true)
})

test('session-token bounce rejects navigation outside the Trinity app origin', async () => {
  let tokenRequested = false
  const result = await runBounceInlineScript({
    search: '?shopify-reload=https%3A%2F%2Fevil.example%2F',
    idToken: async () => {
      tokenRequested = true
      return 'fresh-shopify-token'
    },
  })

  assert.equal(tokenRequested, false)
  assert.equal(result.replacedLocation, '')
  assert.equal(result.elements.retry.hidden, false)
})

test('internal app shell keeps app identity without loading App Bridge', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, {
    includeShopifyAppBridge: false,
    includeTeamPinFallback: true,
    apiKey,
  })

  assert.match(html, /name="shopify-api-key" content="trinity-client-id"/)
  assert.doesNotMatch(html, /shopify-disabled-features/)
  assert.doesNotMatch(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/)
  assert.doesNotMatch(html, /TRINITY_SHOPIFY_APP_BRIDGE/)
})

test('desktop Team PIN shell keeps its app identity without loading App Bridge', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, {
    includeShopifyAppBridge: false,
    includeTeamPinFallback: true,
    apiKey,
  })

  assert.match(html, /name="shopify-api-key" content="trinity-client-id"/)
  assert.doesNotMatch(html, /shopify-disabled-features/)
  assert.doesNotMatch(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/)
})

test('Shopify Mobile PIN fallback shell keeps app identity without blocking on App Bridge', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, {
    includeShopifyAppBridge: false,
    includeTeamPinFallback: true,
    apiKey,
  })

  assert.match(html, /name="shopify-api-key" content="trinity-client-id"/)
  assert.doesNotMatch(html, /shopify-disabled-features/)
  assert.doesNotMatch(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/)
})

test('public shells omit Shopify identity and App Bridge', () => {
  const template = '<head><!-- TRINITY_SHOPIFY_APP_BRIDGE --></head>'
  const html = renderAppShell(template, { apiKey })

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
