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

const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const sessionType = '$app:trinity_customer_session'
const outputDir = path.resolve(
  rootDir,
  process.env.TRINITY_ANALYTICS_REPORT_DIR ?? 'reports/analytics',
)

const options = parseArgs(process.argv.slice(2))
const now = new Date()
const reportDate = now.toISOString().slice(0, 10)
const since = resolveSinceDate(options)

if (!shopDomain || !adminToken) {
  throw new Error(`Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_ACCESS_TOKEN in ${envPath}`)
}

await fs.mkdir(outputDir, { recursive: true })

const resolvedType = await resolveCustomerSessionType()
const sessions = await listCustomerSessions(resolvedType)
const filteredSessions = since
  ? sessions.filter((session) => {
      const activeAt = parseDate(session.updatedAt || session.lastEventAt || lastEventAt(session))
      return activeAt && activeAt >= since
    })
  : sessions
const rows = filteredSessions.map(buildSessionRow)
const summary = buildSummary(rows)

const baseName = `customer-sessions-${reportDate}`
const jsonPath = path.join(outputDir, `${baseName}.json`)
const csvPath = path.join(outputDir, `${baseName}.csv`)
const markdownPath = path.join(outputDir, `${baseName}.md`)

await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: now.toISOString(), since, summary, rows }, null, 2)}\n`)
await fs.writeFile(csvPath, toCsv(rows))
await fs.writeFile(markdownPath, toMarkdown(summary, rows, { generatedAt: now, since }))

console.log(`Exported ${rows.length} customer sessions`)
console.log(`JSON: ${path.relative(rootDir, jsonPath)}`)
console.log(`CSV: ${path.relative(rootDir, csvPath)}`)
console.log(`Report: ${path.relative(rootDir, markdownPath)}`)
console.log(
  `Funnel: ${summary.totalSessions} sessions, ${summary.productViewSessions} product views, ${summary.addToCartSessions} add-to-cart, ${summary.checkoutStartedSessions} checkout starts, ${summary.purchaseSessions} purchases`,
)

async function resolveCustomerSessionType() {
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
  return (
    types.find((type) => type === sessionType) ||
    types.find((type) => type.endsWith('--trinity_customer_session')) ||
    sessionType
  )
}

async function listCustomerSessions(type) {
  const sessions = []
  let cursor = null
  let hasNextPage = true
  const limit = Number(options.limit ?? process.env.TRINITY_ANALYTICS_EXPORT_LIMIT ?? 5000)

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
      if (node?.payload?.jsonValue) {
        sessions.push({
          metaobjectId: node.id,
          handle: node.handle,
          shopifyUpdatedAt: node.updatedAt,
          ...node.payload.jsonValue,
        })
      }
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return sessions
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
    const retryable = payload.errors.some((error) => /throttled|temporarily unavailable/i.test(error.message))
    if (retryable && attempt < 8) {
      await sleep(getRetryDelayMs(attempt, response))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((error) => error.message).join(', '))
  }

  return payload
}

function buildSessionRow(session) {
  const events = Array.isArray(session.events) ? session.events : []
  const counts = countEvents(events)
  const viewedProducts = unique(
    events
      .filter((event) => event.name === 'product_viewed' || pathFromUrl(event.path).startsWith('/products/'))
      .map((event) => clean(event.title) || productHandleFromPath(event.path)),
  )
  const searchTerms = unique(events.map((event) => clean(event.searchQuery)).filter(Boolean))
  const journey = events
    .slice(-20)
    .map((event) => `${event.name}${event.path ? `:${pathFromUrl(event.path)}` : ''}`)
    .join(' > ')

  return {
    sessionId: clean(session.sessionId),
    visitorId: clean(session.visitorId),
    firstSource: normalizeTrafficSource(session.firstSource) || 'direct',
    firstMedium: clean(session.firstMedium) || 'direct',
    firstCampaign: clean(session.firstCampaign),
    firstContent: clean(session.firstContent),
    firstLandingPage: clean(session.firstLandingPage),
    firstLandingPath: pathFromUrl(session.firstLandingPage),
    firstReferrer: clean(session.firstReferrer),
    lastSource:
      normalizeTrafficSource(session.lastSource) ||
      normalizeTrafficSource(session.firstSource) ||
      'direct',
    lastMedium: clean(session.lastMedium) || clean(session.firstMedium) || 'direct',
    lastCampaign: clean(session.lastCampaign),
    lastContent: clean(session.lastContent),
    lastLandingPage: clean(session.lastLandingPage),
    lastLandingPath: pathFromUrl(session.lastLandingPage),
    lastReferrer: clean(session.lastReferrer),
    device: clean(session.device),
    lastEventName: clean(session.lastEventName),
    lastEventAt: clean(session.lastEventAt),
    orderName: clean(session.orderName),
    customerEmailHash: clean(session.customerEmailHash),
    metaDatasetId: clean(session.metaDatasetId || session.integration?.metaDatasetId),
    metaBusinessId: clean(session.metaBusinessId || session.integration?.metaBusinessId),
    facebookPageId: clean(session.facebookPageId || session.integration?.facebookPageId),
    instagramHandle: clean(session.instagramHandle || session.integration?.instagramHandle),
    dataSharingPreference: clean(
      session.dataSharingPreference || session.integration?.dataSharingPreference,
    ),
    sourcePixel: clean(session.integration?.shopifyPixelName),
    sourcePixelVersion: clean(session.integration?.shopifyPixelVersion),
    lastShopifyClientId: clean(session.lastShopifyClientId),
    firstMetaClickId: clean(session.firstMetaClickId),
    lastMetaClickId: clean(session.lastMetaClickId),
    lastMetaBrowserId: clean(session.lastMetaBrowserId),
    lastMetaClickCookie: clean(session.lastMetaClickCookie),
    trackingIds: compactJson(session.trackingIds),
    browserCookies: compactJson(session.browserCookies),
    consent: compactJson(session.consent),
    createdAt: clean(session.createdAt),
    updatedAt: clean(session.updatedAt || session.shopifyUpdatedAt),
    eventCount: events.length,
    pageViews: counts.page_viewed,
    productViews: counts.product_viewed,
    customizerStarts: counts.trinity_customizer_started,
    customizerOptionChanges: counts.trinity_customizer_option_changed,
    productOptionChanges: counts.trinity_product_option_changed,
    productCtaClicks: counts.trinity_product_cta_clicked,
    addToCarts: counts.product_added_to_cart,
    checkoutStarts: counts.checkout_started,
    purchases: counts.checkout_completed,
    searches: counts.search_submitted,
    viewedProducts: viewedProducts.join(' | '),
    searchTerms: searchTerms.join(' | '),
    journey,
  }
}

function buildSummary(rows) {
  const totalSessions = rows.length
  const productViewSessions = rows.filter((row) => row.productViews > 0).length
  const customizerSessions = rows.filter((row) => row.customizerStarts > 0).length
  const addToCartSessions = rows.filter((row) => row.addToCarts > 0).length
  const checkoutStartedSessions = rows.filter((row) => row.checkoutStarts > 0).length
  const purchaseSessions = rows.filter((row) => row.purchases > 0 || row.orderName).length

  return {
    totalSessions,
    uniqueVisitors: new Set(rows.map((row) => row.visitorId).filter(Boolean)).size,
    productViewSessions,
    customizerSessions,
    addToCartSessions,
    checkoutStartedSessions,
    purchaseSessions,
    metaClickSessions: rows.filter((row) => row.lastMetaClickId || row.firstMetaClickId).length,
    metaBrowserIdSessions: rows.filter((row) => row.lastMetaBrowserId).length,
    fbcCookieSessions: rows.filter((row) => row.lastMetaClickCookie).length,
    facebookInstagramSourceSessions: rows.filter((row) =>
      ['facebook', 'instagram', 'meta'].includes(row.lastSource),
    ).length,
    addToCartRate: rate(addToCartSessions, totalSessions),
    checkoutStartRate: rate(checkoutStartedSessions, totalSessions),
    purchaseRate: rate(purchaseSessions, totalSessions),
    checkoutCompletionRate: rate(purchaseSessions, checkoutStartedSessions),
    topLastSources: topBy(rows, (row) => row.lastSource || 'direct'),
    topFirstSources: topBy(rows, (row) => row.firstSource || 'direct'),
    topLandingPages: topBy(rows, (row) => row.firstLandingPath || '/'),
    topDevices: topBy(rows, (row) => row.device || 'unknown'),
    topProducts: topMulti(rows, (row) => row.viewedProducts),
    topSearchTerms: topMulti(rows, (row) => row.searchTerms),
  }
}

function toCsv(rows) {
  const columns = [
    'sessionId',
    'visitorId',
    'firstSource',
    'firstMedium',
    'firstCampaign',
    'firstContent',
    'firstLandingPath',
    'firstLandingPage',
    'firstReferrer',
    'lastSource',
    'lastMedium',
    'lastCampaign',
    'lastContent',
    'lastLandingPath',
    'lastLandingPage',
    'lastReferrer',
    'device',
    'lastEventName',
    'lastEventAt',
    'orderName',
    'metaDatasetId',
    'metaBusinessId',
    'facebookPageId',
    'instagramHandle',
    'dataSharingPreference',
    'sourcePixel',
    'sourcePixelVersion',
    'lastShopifyClientId',
    'firstMetaClickId',
    'lastMetaClickId',
    'lastMetaBrowserId',
    'lastMetaClickCookie',
    'trackingIds',
    'browserCookies',
    'consent',
    'createdAt',
    'updatedAt',
    'eventCount',
    'pageViews',
    'productViews',
    'customizerStarts',
    'customizerOptionChanges',
    'productOptionChanges',
    'productCtaClicks',
    'addToCarts',
    'checkoutStarts',
    'purchases',
    'searches',
    'viewedProducts',
    'searchTerms',
    'journey',
  ]
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n') + '\n'
}

function toMarkdown(summary, rows, context) {
  const abandonedCheckouts = rows.filter((row) => row.checkoutStarts > 0 && !row.purchases && !row.orderName)
  return `# Trinity Customer Session Export

Generated: ${context.generatedAt.toLocaleString('en-US', { timeZone: 'America/Denver' })}

Window: ${context.since ? `${context.since.toISOString().slice(0, 10)} through ${reportDate}` : 'All captured sessions'}

## Funnel

| Metric | Count | Rate |
| --- | ---: | ---: |
| Sessions | ${summary.totalSessions} | 100.0% |
| Visitors | ${summary.uniqueVisitors} |  |
| Product view sessions | ${summary.productViewSessions} | ${formatPercent(rate(summary.productViewSessions, summary.totalSessions))} |
| Customizer sessions | ${summary.customizerSessions} | ${formatPercent(rate(summary.customizerSessions, summary.totalSessions))} |
| Add-to-cart sessions | ${summary.addToCartSessions} | ${formatPercent(summary.addToCartRate)} |
| Checkout starts | ${summary.checkoutStartedSessions} | ${formatPercent(summary.checkoutStartRate)} |
| Purchases | ${summary.purchaseSessions} | ${formatPercent(summary.purchaseRate)} |
| Checkout completion | ${summary.purchaseSessions} / ${summary.checkoutStartedSessions} | ${formatPercent(summary.checkoutCompletionRate)} |

## Meta, Facebook, and Instagram Signals

| Signal | Sessions |
| --- | ---: |
| Facebook/Instagram/Meta last-touch source | ${summary.facebookInstagramSourceSessions} |
| Meta click ID captured \`fbclid\` | ${summary.metaClickSessions} |
| Meta browser ID captured \`_fbp\` | ${summary.metaBrowserIdSessions} |
| Meta click cookie captured \`_fbc\` | ${summary.fbcCookieSessions} |

## Top Last-Touch Sources

${markdownCountTable(summary.topLastSources, 'Source')}

## Top First Landing Pages

${markdownCountTable(summary.topLandingPages, 'Landing page')}

## Top Devices

${markdownCountTable(summary.topDevices, 'Device')}

## Top Viewed Products

${markdownCountTable(summary.topProducts, 'Product')}

## Top Search Terms

${markdownCountTable(summary.topSearchTerms, 'Term')}

## Checkout Abandonment Watchlist

${abandonedCheckouts.length === 0 ? 'No checkout-start sessions without purchase in this export.' : abandonedCheckouts.slice(0, 20).map((row) => `- ${row.lastEventAt || row.updatedAt}: ${row.lastSource}/${row.lastMedium}, ${row.device || 'unknown device'}, landing ${row.firstLandingPath || '/'}, viewed ${row.viewedProducts || 'unknown products'}`).join('\n')}
`
}

function markdownCountTable(items, label) {
  if (items.length === 0) return `No ${label.toLowerCase()} data yet.`
  return [`| ${label} | Sessions |`, '| --- | ---: |', ...items.map((item) => `| ${escapeMarkdown(item.key)} | ${item.count} |`)].join('\n')
}

function countEvents(events) {
  const counts = Object.create(null)
  for (const event of events) {
    const name = clean(event.name)
    if (!name) continue
    counts[name] = (counts[name] ?? 0) + 1
  }
  return new Proxy(counts, {
    get(target, property) {
      return target[property] ?? 0
    },
  })
}

function topBy(rows, selector, limit = 10) {
  const counts = new Map()
  for (const row of rows) {
    const key = clean(selector(row)) || 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit)
}

function topMulti(rows, selector, limit = 10) {
  const counts = new Map()
  for (const row of rows) {
    for (const key of selector(row).split('|').map(clean).filter(Boolean)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit)
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

function resolveSinceDate(parsed) {
  if (parsed.all === 'true') return null
  if (parsed.since) return parseDate(parsed.since)
  const days = Number(parsed.days ?? process.env.TRINITY_ANALYTICS_REPORT_DAYS ?? 30)
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function lastEventAt(session) {
  const events = Array.isArray(session.events) ? session.events : []
  return events.at(-1)?.at || ''
}

function parseDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function pathFromUrl(value) {
  try {
    return new URL(value).pathname || '/'
  } catch {
    return clean(value).split('?')[0] || ''
  }
}

function productHandleFromPath(value) {
  return pathFromUrl(value).split('/products/')[1]?.split('/')[0] || ''
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function csvCell(value) {
  const stringValue = value === undefined || value === null ? '' : String(value)
  if (!/[",\n\r]/.test(stringValue)) return stringValue
  return `"${stringValue.replace(/"/g, '""')}"`
}

function escapeMarkdown(value) {
  return clean(value).replace(/\|/g, '\\|')
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function compactJson(value) {
  if (!value || typeof value !== 'object') return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function normalizeTrafficSource(value) {
  const source = clean(value).toLowerCase()
  if (!source) return ''
  if (['ig', 'instagram', 'instagram.com', 'l.instagram.com'].includes(source)) return 'instagram'
  if (['fb', 'facebook', 'facebook.com', 'm.facebook.com', 'l.facebook.com'].includes(source)) return 'facebook'
  if (['meta', 'facebook-instagram', 'fbig'].includes(source)) return 'meta'
  if (['x', 'twitter', 'twitter.com', 't.co'].includes(source)) return 'x'
  return source
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(attempt, response) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000
  }
  return Math.min(1000 * 2 ** attempt, 15000)
}
