import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envPath =
  process.env.SHOPIFY_ENV_FILE ?? path.join(rootDir, '.env.shopify-custom-app.local')

dotenv.config({ path: envPath })

const options = parseArgs(process.argv.slice(2))
const now = new Date()
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const collectorUrl =
  process.env.TRINITY_ANALYTICS_COLLECTOR_URL ??
  'https://trinity-analytics-collector.onrender.com/api/analytics/events'
const outputDir = path.resolve(
  rootDir,
  process.env.TRINITY_ANALYTICS_BACKFILL_DIR ?? 'reports/backfill-2026-06-13/backfill',
)
const since = parseDate(options.since) ?? new Date('2026-05-22T00:00:00-06:00')
const batchSize = Math.max(1, Number(options.batchSize ?? options['batch-size'] ?? 10))
const dryRun = options.dryRun === 'true' || options['dry-run'] === 'true'
const forceOrders = options.forceOrders === 'true' || options['force-orders'] === 'true'
const sessionType = '$app:trinity_customer_session'

if (!shopDomain || !adminToken) {
  throw new Error(`Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_ACCESS_TOKEN in ${envPath}`)
}

await fs.mkdir(outputDir, { recursive: true })

const orders = await listOrders({ since })
const onlineOrders = orders.filter((order) => classifyOrder(order) === 'online_store')
const orderEvents = onlineOrders
  .filter((order) => forceOrders || !clean(order.trinityCustomerSessionId?.value))
  .map(buildOrderBackfillEvent)
  .filter(Boolean)

const sessionTypes = await resolveCustomerSessionTypes()
const rawSessions = (
  await Promise.all(sessionTypes.map((type) => listCustomerSessions(type, since)))
).flat()
const sessionEvents = rawSessions
  .filter(isBackfillableSession)
  .flatMap(buildSessionBackfillEvents)

const backfillEvents = dedupeEvents([...orderEvents, ...sessionEvents])
const result = dryRun
  ? { accepted: 0, sessionsUpdated: 0, sessionWritesVerified: 0, batches: [] }
  : await sendBackfillEvents(backfillEvents)

const summary = {
  generatedAt: now.toISOString(),
  since: since.toISOString(),
  dryRun,
  collectorUrl,
  shop: shopDomain,
  orders: {
    onlineOrders: onlineOrders.length,
    alreadyTrinityAttributed: onlineOrders.filter((order) =>
      clean(order.trinityCustomerSessionId?.value),
    ).length,
    backfilledFromShopifyNativeJourney: orderEvents.length,
  },
  customerSessions: {
    sourceTypes: sessionTypes,
    visibleSessions: rawSessions.length,
    backfilledSessions: unique(sessionEvents.map((event) => event.sessionId)).length,
    backfilledEvents: sessionEvents.length,
  },
  totals: {
    eventsPrepared: backfillEvents.length,
    collectorAccepted: result.accepted,
    sessionsUpdated: result.sessionsUpdated,
    sessionWritesVerified: result.sessionWritesVerified,
  },
  unrecoverable: [
    'Anonymous non-converting visitor sessions that only hit the failed collector cannot be reconstructed.',
    'Exact product-view/add-to-cart/customizer sequences are only available for sessions visible in Shopify metaobjects; Shopify-native order journeys provide order attribution, not full anonymous behavior.',
    'Manual internal order-form submissions are sales records, not website traffic sessions, so they are reported separately rather than synthesized as web traffic.',
  ],
}

const jsonPath = path.join(outputDir, 'analytics-backfill-run-2026-06-13.json')
const csvPath = path.join(outputDir, 'analytics-backfill-events-2026-06-13.csv')
const markdownPath = path.join(outputDir, 'analytics-backfill-run-2026-06-13.md')

await fs.writeFile(
  jsonPath,
  `${JSON.stringify({ summary, batches: result.batches, events: backfillEvents }, null, 2)}\n`,
)
await fs.writeFile(csvPath, toBackfillCsv(backfillEvents))
await fs.writeFile(markdownPath, toBackfillMarkdown(summary))

console.log(`Prepared ${backfillEvents.length} backfill events`)
console.log(`Collector accepted ${result.accepted}`)
console.log(`Sessions updated ${result.sessionsUpdated}`)
console.log(`Session writes verified ${result.sessionWritesVerified}`)
console.log(`JSON: ${path.relative(rootDir, jsonPath)}`)
console.log(`CSV: ${path.relative(rootDir, csvPath)}`)
console.log(`Report: ${path.relative(rootDir, markdownPath)}`)

async function listOrders({ since: sinceDate }) {
  const orders = []
  let cursor = null
  let hasNextPage = true
  const query = `created_at:>=${sinceDate.toISOString().slice(0, 10)}`

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query ListOrders($query: String!, $after: String) {
          orders(first: 250, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
            nodes {
              id
              name
              createdAt
              sourceName
              tags
              app {
                name
              }
              customer {
                id
              }
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customAttributes {
                key
                value
              }
              lineItems(first: 100) {
                nodes {
                  id
                  title
                  quantity
                  sku
                  variantTitle
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    sku
                    title
                    product {
                      id
                      title
                      productType
                    }
                  }
                }
              }
              customerJourneySummary {
                ready
                firstVisit {
                  occurredAt
                  landingPage
                  referrerUrl
                  source
                  sourceDescription
                  sourceType
                  utmParameters {
                    campaign
                    content
                    medium
                    source
                    term
                  }
                }
                lastVisit {
                  occurredAt
                  landingPage
                  referrerUrl
                  source
                  sourceDescription
                  sourceType
                  utmParameters {
                    campaign
                    content
                    medium
                    source
                    term
                  }
                }
              }
              trinityCustomerSessionId: metafield(namespace: "trinity", key: "customer_session_id") {
                value
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { query, after: cursor },
    )

    const connection = result?.data?.orders
    orders.push(...(connection?.nodes ?? []))
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return orders
}

async function resolveCustomerSessionTypes() {
  if (options.type) return [String(options.type)]

  const result = await shopifyGraphQL(`
    query MetaobjectDefinitions {
      metaobjectDefinitions(first: 250) {
        nodes {
          type
        }
      }
    }
  `)
  const types = result?.data?.metaobjectDefinitions?.nodes?.map((node) => node.type) ?? []
  const matches = unique(
    [
      ...types.filter((type) => type === sessionType),
      ...types.filter((type) => type.endsWith('--trinity_customer_session')),
      ...types.filter((type) => type.includes('trinity_customer_session')),
    ].filter(Boolean),
  )

  return matches.length > 0 ? matches : [sessionType]
}

async function listCustomerSessions(type, sinceDate) {
  const sessions = []
  let cursor = null
  let hasNextPage = true
  const limit = Number(options.limit ?? process.env.TRINITY_ANALYTICS_BACKFILL_LIMIT ?? 10000)

  while (hasNextPage && sessions.length < limit) {
    const result = await shopifyGraphQL(
      `
        query ListCustomerSessions($type: String!, $after: String) {
          metaobjects(type: $type, first: 250, after: $after, sortKey: "updated_at", reverse: true) {
            nodes {
              id
              handle
              updatedAt
              payload: field(key: "payload") {
                jsonValue
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { type, after: cursor },
    )

    const connection = result?.data?.metaobjects
    for (const node of connection?.nodes ?? []) {
      const payload = node?.payload?.jsonValue
      if (!payload) continue
      const activeAt = parseDate(payload.updatedAt || payload.lastEventAt || node.updatedAt)
      if (activeAt && activeAt >= sinceDate) {
        sessions.push({
          metaobjectId: node.id,
          handle: node.handle,
          sessionRecordType: type,
          shopifyUpdatedAt: node.updatedAt,
          ...payload,
        })
      }
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return sessions
}

function buildOrderBackfillEvent(order) {
  const journey = order.customerJourneySummary ?? {}
  const first = normalizeVisit(journey.firstVisit)
  const last = normalizeVisit(journey.lastVisit)
  const firstTouch = touchpointFromVisit(first, order.createdAt)
  const lastTouch = touchpointFromVisit(last, order.createdAt)
  const sessionId = `trinity-backfill-order-${safeHandle(order.name)}-${order.createdAt.slice(0, 10)}`
  const value = Number(order.currentTotalPriceSet?.shopMoney?.amount ?? 0)
  const currency = clean(order.currentTotalPriceSet?.shopMoney?.currencyCode) || 'USD'
  const landingPage = lastTouch.landingPage || firstTouch.landingPage || 'https://www.trinitybatco.com/'
  const referrer = lastTouch.referrer || firstTouch.referrer

  return {
    id: `${sessionId}-checkout-completed`,
    name: 'checkout_completed',
    timestamp: order.createdAt,
    clientId: sessionId,
    sessionId,
    visitorId: customerBackfillVisitorId(order),
    sourcePixel: {
      id: 'trinity-backfill-shopify-native',
      name: 'Trinity Shopify Native Journey Backfill',
      version: '1',
    },
    integration: {
      shopifyPixelName: 'Trinity Shopify Native Journey Backfill',
      shopifyPixelVersion: '1',
      collector: 'trinity-analytics-collector',
      instagramHandle: 'trinitybatco',
    },
    browserSignals: {
      trackingParams: compactObject({
        ...utmMap(first, 'first'),
        ...utmMap(last, 'last'),
        utm_source: last.utmSource || first.utmSource,
        utm_medium: last.utmMedium || first.utmMedium,
        utm_campaign: last.utmCampaign || first.utmCampaign,
        utm_content: last.utmContent || first.utmContent,
        utm_term: last.utmTerm || first.utmTerm,
      }),
      persistedTrackingIds: {},
      cookies: {},
      consent: {
        analyticsProcessingAllowed: true,
        marketingAllowed: false,
      },
    },
    attribution: {
      sessionId,
      visitorId: customerBackfillVisitorId(order),
      device: 'unknown',
      first: firstTouch,
      last: lastTouch,
      path: [
        {
          path: pathFromUrl(landingPage),
          url: landingPage,
          title: 'Shopify native customer journey backfill',
          at: order.createdAt,
        },
      ],
    },
    context: {
      document: {
        title: 'Shopify native customer journey backfill',
        location: {
          href: landingPage,
        },
        referrer,
      },
      navigator: {
        userAgent: 'Trinity Shopify native journey backfill',
        language: 'en-US',
      },
      window: {
        innerWidth: 1,
        innerHeight: 1,
      },
    },
    data: {
      checkout: {
        order: {
          id: order.id,
          name: order.name,
        },
        totalPrice: {
          amount: value,
          currencyCode: currency,
        },
        currencyCode: currency,
        lineItems: (order.lineItems?.nodes ?? []).map((line) => ({
          id: line.id,
          title: line.title,
          quantity: Number(line.quantity ?? 1),
          merchandise: {
            id: line.variant?.id,
            sku: line.variant?.sku || line.sku,
            title: line.variant?.title || line.variantTitle,
            product: {
              id: line.variant?.product?.id,
              title: line.variant?.product?.title || line.title,
              productType: line.variant?.product?.productType,
            },
          },
          cost: {
            amountPerQuantity: {
              amount: Number(line.originalUnitPriceSet?.shopMoney?.amount ?? 0),
              currencyCode: line.originalUnitPriceSet?.shopMoney?.currencyCode || currency,
            },
          },
        })),
      },
      order: {
        id: order.id,
        name: order.name,
      },
    },
    backfill: {
      source: 'shopify_customer_journey_summary',
      reason: 'collector_schema_overflow_outage',
    },
  }
}

function isBackfillableSession(session) {
  const sessionId = clean(session.sessionId || session.handle)
  if (!sessionId) return false
  if (/trinity-analytics-health|codex|trinity-backfill/i.test(sessionId)) return false
  return Array.isArray(session.events) && session.events.length > 0
}

function buildSessionBackfillEvents(session) {
  const events = Array.isArray(session.events) ? session.events : []
  const firstTouch = touchpointFromSession(session, 'first')
  const lastTouch = touchpointFromSession(session, 'last')

  return events.map((event, index) => {
    const timestamp = normalizeIsoDate(event.at || session.lastEventAt || session.updatedAt) || now.toISOString()
    const url = clean(event.url || session.lastLandingPage || session.firstLandingPage)
    const referrer = clean(event.referrer || session.lastReferrer || session.firstReferrer)
    const trackingParams = event.trackingParams && typeof event.trackingParams === 'object'
      ? event.trackingParams
      : {}

    return {
      id: clean(event.id) || `${session.sessionId}-${index}-${safeHandle(event.name || 'event')}`,
      name: clean(event.name || session.lastEventName || 'page_viewed'),
      timestamp,
      clientId: clean(event.shopifyClientId || session.lastShopifyClientId || session.sessionId),
      sessionId: clean(session.sessionId),
      visitorId: clean(session.visitorId || session.sessionId),
      sourcePixel: event.sourcePixel || {
        id: 'trinity-visible-session-backfill',
        name: 'Trinity Visible Session Backfill',
        version: '1',
      },
      integration: {
        ...(session.integration && typeof session.integration === 'object' ? session.integration : {}),
        ...(event.integration && typeof event.integration === 'object' ? event.integration : {}),
        shopifyPixelName:
          clean(event.integration?.shopifyPixelName || session.integration?.shopifyPixelName) ||
          'Trinity Visible Session Backfill',
        shopifyPixelVersion:
          clean(event.integration?.shopifyPixelVersion || session.integration?.shopifyPixelVersion) || '1',
        collector: 'trinity-analytics-collector',
        instagramHandle:
          clean(event.integration?.instagramHandle || session.integration?.instagramHandle || session.instagramHandle) ||
          'trinitybatco',
      },
      browserSignals: {
        trackingParams,
        persistedTrackingIds:
          event.trackingIds && typeof event.trackingIds === 'object'
            ? event.trackingIds
            : session.trackingIds && typeof session.trackingIds === 'object'
              ? session.trackingIds
              : {},
        cookies:
          event.cookies && typeof event.cookies === 'object'
            ? event.cookies
            : session.browserCookies && typeof session.browserCookies === 'object'
              ? session.browserCookies
              : {},
        consent:
          event.consent && typeof event.consent === 'object'
            ? event.consent
            : session.consent && typeof session.consent === 'object'
              ? session.consent
              : {},
      },
      attribution: {
        sessionId: clean(session.sessionId),
        visitorId: clean(session.visitorId || session.sessionId),
        device: clean(session.device),
        first: firstTouch,
        last: lastTouch,
        path: [
          {
            path: clean(event.path || pathFromUrl(url)),
            url,
            title: clean(event.title),
            at: timestamp,
          },
        ],
      },
      context: {
        document: {
          title: clean(event.title),
          location: {
            href: url,
          },
          referrer,
        },
        navigator: {
          userAgent: `Trinity visible session backfill ${clean(session.device)}`.trim(),
          language: 'en-US',
        },
        window: {
          innerWidth: 1,
          innerHeight: 1,
        },
      },
      data: buildSessionEventData(event),
      backfill: {
        source: 'visible_customer_session_metaobject',
        reason: 'collector_schema_overflow_outage',
      },
    }
  })
}

function buildSessionEventData(event) {
  const value = parseOptionalNumber(event.value)
  const currency = clean(event.currency) || 'USD'
  const orderId = clean(event.orderId)
  const orderName = clean(event.orderName)
  const items = Array.isArray(event.items) ? event.items : []
  const data = {}

  if (Number.isFinite(value) || orderId || orderName || items.length > 0) {
    data.checkout = {
      order: compactObject({
        id: orderId,
        name: orderName,
      }),
      totalPrice: Number.isFinite(value)
        ? {
            amount: value,
            currencyCode: currency,
          }
        : undefined,
      currencyCode: currency,
      lineItems: items,
    }
    data.order = compactObject({
      id: orderId,
      name: orderName,
    })
  }

  if (event.searchQuery) {
    data.search = {
      query: clean(event.searchQuery),
    }
  }

  return compactObject(data)
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function sendBackfillEvents(events) {
  const batches = []
  let accepted = 0
  let sessionsUpdated = 0
  let sessionWritesVerified = 0

  for (let index = 0; index < events.length; index += batchSize) {
    const batch = events.slice(index, index + batchSize)
    const response = await fetch(collectorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trinity-Analytics-Verify': '1',
        Origin: 'https://www.trinitybatco.com',
      },
      body: JSON.stringify({ events: batch }),
    })
    const body = await response.json().catch(async () => ({ raw: await response.text() }))
    if (!response.ok || !body.ok) {
      throw new Error(`Collector backfill failed: ${response.status} ${JSON.stringify(body)}`)
    }

    batches.push({
      index: batches.length + 1,
      events: batch.length,
      response: body,
    })
    accepted += Number(body.accepted ?? 0)
    sessionsUpdated += Number(body.sessionsUpdated ?? 0)
    sessionWritesVerified += Number(body.sessionWritesVerified ?? 0)
  }

  return {
    accepted,
    sessionsUpdated,
    sessionWritesVerified,
    batches,
  }
}

async function shopifyGraphQL(query, variables = {}, attempt = 0) {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const body = await response.text()
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 8) {
      await sleep(getRetryDelayMs(attempt, response))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    const retryable = payload.errors.some((error) =>
      /throttled|temporarily unavailable/i.test(error.message),
    )
    if (retryable && attempt < 8) {
      await sleep(getRetryDelayMs(attempt, response))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((error) => error.message).join(', '))
  }

  return payload
}

function normalizeVisit(visit) {
  const utm = visit?.utmParameters ?? {}
  return {
    occurredAt: clean(visit?.occurredAt),
    landingPage: clean(visit?.landingPage),
    referrerUrl: clean(visit?.referrerUrl),
    source: clean(visit?.source),
    sourceType: clean(visit?.sourceType),
    utmCampaign: clean(utm.campaign),
    utmContent: clean(utm.content),
    utmMedium: clean(utm.medium),
    utmSource: clean(utm.source),
    utmTerm: clean(utm.term),
  }
}

function touchpointFromVisit(visit, fallbackAt) {
  return {
    source: normalizeTrafficSource(visit.utmSource || visit.source || inferSourceFromReferrer(visit.referrerUrl)),
    medium: clean(visit.utmMedium || visit.sourceType || sourceMediumFromReferrer(visit.referrerUrl)),
    campaign: clean(visit.utmCampaign),
    content: clean(visit.utmContent),
    term: clean(visit.utmTerm),
    landingPage: clean(visit.landingPage),
    referrer: clean(visit.referrerUrl),
    capturedAt: normalizeIsoDate(visit.occurredAt || fallbackAt),
  }
}

function touchpointFromSession(session, side) {
  return {
    source: normalizeTrafficSource(session[`${side}Source`]),
    medium: clean(session[`${side}Medium`]),
    campaign: clean(session[`${side}Campaign`]),
    content: clean(session[`${side}Content`]),
    term: clean(session[`${side}Term`]),
    landingPage: clean(session[`${side}LandingPage`]),
    referrer: clean(session[`${side}Referrer`]),
    capturedAt: normalizeIsoDate(session.lastEventAt || session.updatedAt || session.createdAt),
  }
}

function classifyOrder(order) {
  const attributes = Object.fromEntries((order.customAttributes ?? []).map((item) => [item.key, item.value]))
  if (attributes.trinity_origin === 'internal_sales' || order.tags?.includes('Internal Sales')) {
    return 'internal_sales'
  }
  if (order.sourceName === 'web' || order.app?.name === 'Online Store') return 'online_store'
  if (order.sourceName === 'shopify_draft_order' || order.app?.name === 'Draft Orders') {
    return 'draft_order'
  }
  return clean(order.sourceName || order.app?.name || 'unknown')
}

function customerBackfillVisitorId(order) {
  const raw = clean(order.customer?.id || order.name)
  return `backfill-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20)}`
}

function utmMap(visit, prefix) {
  return compactObject({
    [`${prefix}_utm_source`]: visit.utmSource,
    [`${prefix}_utm_medium`]: visit.utmMedium,
    [`${prefix}_utm_campaign`]: visit.utmCampaign,
    [`${prefix}_utm_content`]: visit.utmContent,
    [`${prefix}_utm_term`]: visit.utmTerm,
  })
}

function toBackfillCsv(events) {
  const columns = [
    'sessionId',
    'id',
    'name',
    'timestamp',
    'source',
    'medium',
    'campaign',
    'landingPage',
    'orderName',
    'backfillSource',
  ]
  return [
    columns.join(','),
    ...events.map((event) =>
      [
        event.sessionId,
        event.id,
        event.name,
        event.timestamp,
        event.attribution?.last?.source || event.attribution?.first?.source,
        event.attribution?.last?.medium || event.attribution?.first?.medium,
        event.attribution?.last?.campaign || event.attribution?.first?.campaign,
        event.attribution?.last?.landingPage || event.attribution?.first?.landingPage,
        event.data?.checkout?.order?.name || event.data?.order?.name,
        event.backfill?.source,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n') + '\n'
}

function toBackfillMarkdown(summary) {
  return `# Trinity Analytics Backfill Run

Generated: ${formatDateTime(summary.generatedAt)}

Window: ${formatDate(summary.since)} through ${formatDate(summary.generatedAt)}

Collector: ${summary.collectorUrl}

## Backfilled

| Source | Count |
| --- | ---: |
| Online-store orders found | ${summary.orders.onlineOrders} |
| Online-store orders already Trinity-attributed | ${summary.orders.alreadyTrinityAttributed} |
| Online-store order journeys synthesized from Shopify native attribution | ${summary.orders.backfilledFromShopifyNativeJourney} |
| Visible customer-session metaobjects found | ${summary.customerSessions.visibleSessions} |
| Visible customer sessions backfilled | ${summary.customerSessions.backfilledSessions} |
| Visible customer-session events replayed | ${summary.customerSessions.backfilledEvents} |
| Total events prepared | ${summary.totals.eventsPrepared} |
| Collector accepted | ${summary.totals.collectorAccepted} |
| Sessions updated | ${summary.totals.sessionsUpdated} |
| Session writes verified by production collector | ${summary.totals.sessionWritesVerified} |

## Not Recoverable

${summary.unrecoverable.map((item) => `- ${item}`).join('\n')}
`
}

function dedupeEvents(events) {
  const byKey = new Map()
  for (const event of events) {
    const key = `${event.sessionId}:${event.id}`
    if (!byKey.has(key)) byKey.set(key, event)
  }
  return [...byKey.values()].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
}

function normalizeTrafficSource(value) {
  const source = clean(value).toLowerCase()
  if (!source) return ''
  if (
    ['ig', 'instagram', 'instagram.com', 'l.instagram.com', 'lm.instagram.com'].includes(source) ||
    source.includes('instagram')
  ) {
    return 'instagram'
  }
  if (
    ['fb', 'facebook', 'facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com'].includes(source) ||
    source.includes('facebook')
  ) {
    return 'facebook'
  }
  if (
    ['meta', 'facebook-instagram', 'fbig', 'metaads', 'meta-ads'].includes(source) ||
    source.includes('threads.net')
  ) {
    return 'meta'
  }
  if (source.includes('google')) return 'google'
  if (source.includes('bing')) return 'bing'
  if (source.includes('yahoo')) return 'yahoo'
  if (source.includes('duckduckgo')) return 'duckduckgo'
  if (source.includes('klaviyo') || source === 'email') return 'email'
  return source
}

function inferSourceFromReferrer(referrer) {
  const host = hostnameFromUrl(referrer)
  if (!host) return 'direct'
  if (host.includes('instagram')) return 'instagram'
  if (host.includes('facebook')) return 'facebook'
  if (host.includes('google')) return 'google'
  if (host.includes('bing')) return 'bing'
  if (host.includes('duckduckgo')) return 'duckduckgo'
  if (host.includes('yahoo')) return 'yahoo'
  return host.replace(/^www\./, '')
}

function sourceMediumFromReferrer(referrer) {
  const host = hostnameFromUrl(referrer)
  if (!host) return 'direct'
  if (/(google|bing|duckduckgo|yahoo)/i.test(host)) return 'organic'
  if (/(instagram|facebook|threads\.net|tiktok|pinterest|twitter|x\.com)/i.test(host)) return 'social'
  return 'referral'
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function pathFromUrl(value) {
  try {
    return new URL(value).pathname || '/'
  } catch {
    return clean(value).split('?')[0] || '/'
  }
}

function safeHandle(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, item]) => {
      if (item === undefined || item === null || item === '') return false
      if (Array.isArray(item) && item.length === 0) return false
      if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) {
        return false
      }
      return true
    }),
  )
}

function parseArgs(argv) {
  const parsed = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, value = 'true'] = arg.slice(2).split('=')
    parsed[key] = value
  }
  return parsed
}

function parseDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function normalizeIsoDate(value) {
  const date = parseDate(value)
  return date ? date.toISOString() : ''
}

function formatDate(value) {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function csvCell(value) {
  const stringValue = value === undefined || value === null ? '' : String(value)
  if (!/[",\n\r]/.test(stringValue)) return stringValue
  return `"${stringValue.replace(/"/g, '""')}"`
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function getRetryDelayMs(attempt, response) {
  const retryAfterSeconds = Number(response?.headers?.get('retry-after'))
  const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0
  return Math.max(retryAfterMs, Math.min(1000 * 2 ** attempt, 15000))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
