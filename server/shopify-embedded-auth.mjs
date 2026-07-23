import crypto from 'node:crypto'

const shopifyAppBridgePlaceholder = '<!-- TRINITY_SHOPIFY_APP_BRIDGE -->'
const internalAppShellPaths = new Set(['/', '/internal-tool', '/inventory-tool'])

export function isInternalAppShellPath(pathname) {
  const normalizedPath = String(pathname ?? '').split(/[?#]/, 1)[0]
  return internalAppShellPaths.has(normalizedPath) || /^\/apps(?:\/|$)/.test(normalizedPath)
}

export function allowsLocalInternalAccess(nodeEnvironment) {
  return String(nodeEnvironment ?? '').toLowerCase() !== 'production'
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
