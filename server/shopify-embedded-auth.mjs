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
    <style>
      :root {
        color: #28170f;
        background: #f3e4c6;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
      }
      main {
        width: min(30rem, calc(100% - 3rem));
        padding: 2rem;
        border: 1px solid rgba(47, 76, 50, 0.2);
        border-radius: 1.5rem;
        background: #fffaf0;
        box-shadow: 0 1rem 3rem rgba(40, 23, 15, 0.12);
        text-align: center;
      }
      .status-dot {
        width: 0.9rem;
        height: 0.9rem;
        margin: 0 auto 1rem;
        border-radius: 999px;
        background: #79c95b;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.6rem, 6vw, 2.25rem);
      }
      p {
        margin: 0.75rem 0 0;
        color: #65574e;
        line-height: 1.5;
      }
      button {
        margin-top: 1.25rem;
        padding: 0.8rem 1.1rem;
        border: 0;
        border-radius: 999px;
        color: #fffaf0;
        background: #2f4c32;
        font: inherit;
        font-weight: 700;
      }
      button[hidden] {
        display: none;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="status-dot" aria-hidden="true"></div>
      <h1 id="status">Signing in through Shopify…</h1>
      <p id="detail">This should only take a moment.</p>
      <button id="retry" type="button" hidden>Try Shopify sign-in again</button>
    </main>
    <script>
      (() => {
        const status = document.getElementById('status')
        const detail = document.getElementById('detail')
        const retry = document.getElementById('retry')
        let signInAttempt = 0

        function isAllowedReloadTarget(target) {
          return (
            target.origin === window.location.origin &&
            (
              target.pathname === '/' ||
              target.pathname === '/internal-tool' ||
              target.pathname === '/inventory-tool' ||
              target.pathname.startsWith('/apps/')
            )
          )
        }

        async function requestShopifySignIn() {
          signInAttempt += 1
          const currentAttempt = signInAttempt
          status.textContent = 'Signing in through Shopify…'
          detail.textContent = 'This should only take a moment.'
          retry.hidden = true

          try {
            const reloadPath =
              new URLSearchParams(window.location.search).get('shopify-reload') || '/'
            const target = new URL(reloadPath, window.location.origin)
            if (!isAllowedReloadTarget(target)) {
              throw new Error('Invalid Shopify reload target')
            }

            if (!window.shopify || typeof window.shopify.idToken !== 'function') {
              throw new Error('Shopify App Bridge is unavailable')
            }

            const token = await Promise.race([
              window.shopify.idToken(),
              new Promise((_, reject) => {
                window.setTimeout(() => reject(new Error('Shopify sign-in timed out')), 8000)
              }),
            ])
            if (currentAttempt !== signInAttempt) return
            if (typeof token !== 'string' || !token.trim()) {
              throw new Error('Shopify returned an empty session token')
            }

            target.searchParams.delete('shopify-reload')
            target.searchParams.set('id_token', token.trim())
            window.location.replace(target.href)
          } catch {
            if (currentAttempt !== signInAttempt) return
            status.textContent = 'Shopify could not complete sign-in'
            detail.textContent = 'Tap below to request a fresh Shopify session.'
            retry.hidden = false
          }
        }

        retry.addEventListener('click', requestShopifySignIn)
        void requestShopifySignIn()
      })()
    </script>
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
