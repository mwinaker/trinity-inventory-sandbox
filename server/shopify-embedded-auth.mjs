import crypto from 'node:crypto'

const shopifyAppBridgePlaceholder = '<!-- TRINITY_SHOPIFY_APP_BRIDGE -->'
const internalAppShellPaths = new Set(['/', '/internal-tool', '/inventory-tool'])
export const shopifySessionRetryHeaderName =
  'X-Shopify-Retry-Invalid-Session-Request'
export const shopifySessionBouncePath = '/session-token-bounce'

export function isInternalAppShellPath(pathname) {
  const normalizedPath = String(pathname ?? '').split(/[?#]/, 1)[0]
  return internalAppShellPaths.has(normalizedPath) || /^\/apps(?:\/|$)/.test(normalizedPath)
}

export function allowsLocalInternalAccess(nodeEnvironment) {
  return String(nodeEnvironment ?? '').toLowerCase() !== 'production'
}

export function setShopifySessionRetryHeader(response) {
  response.set(shopifySessionRetryHeaderName, '1')
}

export function shouldRetryShopifySessionRequest(authorizationHeader) {
  return /^Bearer\s+\S+$/i.test(String(authorizationHeader ?? '').trim())
}

export function hasEmbeddedShopifyContext({ embedded = '', host = '' } = {}) {
  return String(embedded) === '1' || Boolean(String(host).trim())
}

export function buildShopifySessionBounceLocation(
  originalUrl,
  bouncePath = shopifySessionBouncePath,
) {
  const original = new URL(String(originalUrl || '/'), 'https://trinity.local')
  const searchParams = new URLSearchParams(original.search)
  searchParams.delete('id_token')
  searchParams.delete('shopify-reload')

  const reloadQuery = searchParams.toString()
  const reloadPath = `${original.pathname}${reloadQuery ? `?${reloadQuery}` : ''}`
  searchParams.set('shopify-reload', reloadPath)

  return `${bouncePath}?${searchParams.toString()}`
}

export function renderShopifySessionBounce(apiKey = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="shopify-api-key" content="${escapeHtmlAttribute(apiKey)}" />
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    <title>Signing in to Trinity Billet Inventory</title>
  </head>
  <body>
    <p>Signing in through Shopify…</p>
  </body>
</html>`
}

export function renderAppShell(template, { includeShopifyAppBridge = false, apiKey = '' } = {}) {
  const markup =
    includeShopifyAppBridge && apiKey
      ? [
          `<meta name="shopify-api-key" content="${escapeHtmlAttribute(apiKey)}" />`,
          '<meta name="shopify-disabled-features" content="auto-redirect" />',
          '<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>',
        ].join('\n    ')
      : ''

  return String(template).replace(shopifyAppBridgePlaceholder, markup)
}

export function verifyShopifySessionToken(
  token,
  { apiSecret = '', apiKey = '', shopDomain = '', nowMs = Date.now() } = {},
) {
  if (!apiSecret || !token) return false

  const parts = String(token).split('.')
  if (parts.length !== 3) return false

  try {
    const [encodedHeader, encodedPayload, signature] = parts
    const header = JSON.parse(decodeBase64Url(encodedHeader))
    const payload = JSON.parse(decodeBase64Url(encodedPayload))

    if (header.alg !== 'HS256') return false

    const expectedSignature = crypto
      .createHmac('sha256', apiSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url')

    if (!safeEqual(expectedSignature, signature, 'utf8')) return false

    const nowInSeconds = Math.floor(nowMs / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < nowInSeconds) return false
    if (typeof payload.nbf === 'number' && payload.nbf > nowInSeconds) return false
    if (apiKey && payload.aud !== apiKey) return false

    if (shopDomain && getHostname(payload.dest) !== normalizeHostname(shopDomain)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function decodeBase64Url(value) {
  return Buffer.from(String(value), 'base64url').toString('utf8')
}

function safeEqual(left, right, encoding) {
  try {
    const leftBuffer = Buffer.from(String(left), encoding)
    const rightBuffer = Buffer.from(String(right), encoding)
    return (
      leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer)
    )
  } catch {
    return false
  }
}

function normalizeHostname(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
}

function getHostname(value) {
  try {
    return normalizeHostname(new URL(String(value)).hostname)
  } catch {
    return ''
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
