import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envPath =
  process.env.SHOPIFY_ENV_FILE ?? path.join(rootDir, '.env.shopify-custom-app.local')

dotenv.config({ path: envPath })

const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken =
  process.env.TRINITY_ANALYTICS_SHOPIFY_ADMIN_ACCESS_TOKEN ??
  process.env.SHOPIFY_ANALYTICS_ADMIN_ACCESS_TOKEN ??
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const collectorUrl =
  process.env.TRINITY_ANALYTICS_COLLECTOR_URL ??
  'https://trinity-analytics-collector.onrender.com/api/analytics/events'
const sessionType =
  process.env.TRINITY_ANALYTICS_SESSION_TYPE ?? 'app--351830966273--trinity_customer_session'

const now = new Date()
const isoNow = now.toISOString()
const day = isoNow.slice(0, 10)
const sessionId = `trinity-analytics-health-${day}`
const eventId = `${sessionId}-${isoNow.replace(/[^0-9]/g, '').slice(0, 14)}`

const payload = {
  id: eventId,
  name: 'page_viewed',
  timestamp: isoNow,
  clientId: `${sessionId}-client`,
  sessionId,
  visitorId: 'trinity-analytics-health-visitor',
  sourcePixel: {
    id: 'trinity-health-check',
    name: 'Trinity Analytics Health Check',
    version: '1',
  },
  integration: {
    shopifyPixelName: 'Trinity Analytics Health Check',
    shopifyPixelVersion: '1',
    collector: 'trinity-analytics-collector',
    instagramHandle: 'trinitybatco',
  },
  browserSignals: {
    trackingParams: {
      utm_source: 'trinity_health_check',
      utm_medium: 'diagnostic',
      utm_campaign: 'analytics_pipeline',
    },
    cookies: {},
    consent: {
      analyticsProcessingAllowed: true,
      marketingAllowed: false,
    },
  },
  attribution: {
    sessionId,
    visitorId: 'trinity-analytics-health-visitor',
    device: 'server',
    first: healthTouchpoint(isoNow),
    last: healthTouchpoint(isoNow),
    path: [
      {
        path: '/analytics-health-check',
        url: 'https://www.trinitybatco.com/analytics-health-check?utm_source=trinity_health_check&utm_medium=diagnostic&utm_campaign=analytics_pipeline',
        title: 'Trinity Analytics Health Check',
        at: isoNow,
      },
    ],
  },
  context: {
    document: {
      title: 'Trinity Analytics Health Check',
      location: {
        href: 'https://www.trinitybatco.com/analytics-health-check?utm_source=trinity_health_check&utm_medium=diagnostic&utm_campaign=analytics_pipeline',
      },
      referrer: '',
    },
    navigator: {
      userAgent: 'Trinity analytics health check',
      language: 'en-US',
    },
    window: {
      innerWidth: 1,
      innerHeight: 1,
    },
  },
  data: {},
}

const collectorResponse = await fetch(collectorUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Trinity-Analytics-Verify': '1',
    Origin: 'https://www.trinitybatco.com',
  },
  body: JSON.stringify(payload),
})
const collectorBody = await collectorResponse.json().catch(async () => ({
  raw: await collectorResponse.text(),
}))

if (!collectorResponse.ok || !collectorBody.ok) {
  throw new Error(
    `Collector check failed: ${collectorResponse.status} ${JSON.stringify(collectorBody)}`,
  )
}

if (Number(collectorBody.sessionWritesVerified ?? 0) < 1) {
  throw new Error(`Collector did not verify Shopify write: ${JSON.stringify(collectorBody)}`)
}

const shopifyReadback = await readShopifySession().catch((error) => ({
  warning: error instanceof Error ? error.message : String(error),
}))

console.log(
  JSON.stringify(
    {
      ok: true,
      collectorUrl,
      collector: collectorBody,
      shopify: shopifyReadback,
    },
    null,
    2,
  ),
)

async function readShopifySession() {
  if (!shopDomain || !adminToken) {
    return {
      skipped: true,
      reason: `Missing SHOPIFY_SHOP or Shopify Admin token in ${envPath}`,
    }
  }

  const readback = await shopifyGraphQL(
    `
      query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          handle
          updatedAt
          payload: field(key: "payload") {
            jsonValue
          }
        }
      }
    `,
    {
      handle: {
        type: sessionType,
        handle: sanitizeHandle(sessionId),
      },
    },
  )

  const metaobject = readback?.data?.metaobjectByHandle
  const stored = metaobject?.payload?.jsonValue
  if (!stored || stored.sessionId !== sessionId) {
    return {
      warning: `Local Shopify readback did not find ${sessionType}/${sanitizeHandle(sessionId)}. The collector-side verification already passed; this usually means the local token is scoped to a different $app metaobject namespace than production.`,
    }
  }

  const hasCurrentEvent = Array.isArray(stored.events)
    ? stored.events.some((event) => event?.id === eventId)
    : false
  if (stored.lastEventAt !== isoNow || !hasCurrentEvent) {
    return {
      warning: `Local Shopify readback found ${sessionType}/${sanitizeHandle(sessionId)}, but not the event just verified by the production collector. The local token is probably reading a different $app metaobject namespace.`,
      id: metaobject.id,
      handle: metaobject.handle,
      updatedAt: metaobject.updatedAt,
      sessionId: stored.sessionId,
      lastEventName: stored.lastEventName,
      lastEventAt: stored.lastEventAt,
      eventCount: Array.isArray(stored.events) ? stored.events.length : 0,
    }
  }

  return {
    id: metaobject.id,
    handle: metaobject.handle,
    updatedAt: metaobject.updatedAt,
    sessionId: stored.sessionId,
    lastEventName: stored.lastEventName,
    lastEventAt: stored.lastEventAt,
    eventCount: Array.isArray(stored.events) ? stored.events.length : 0,
  }
}

function healthTouchpoint(capturedAt) {
  return {
    source: 'trinity_health_check',
    medium: 'diagnostic',
    campaign: 'analytics_pipeline',
    landingPage:
      'https://www.trinitybatco.com/analytics-health-check?utm_source=trinity_health_check&utm_medium=diagnostic&utm_campaign=analytics_pipeline',
    referrer: '',
    capturedAt,
  }
}

async function shopifyGraphQL(query, variables = {}) {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(', '))
  }
  return payload
}

function sanitizeHandle(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255)
}
