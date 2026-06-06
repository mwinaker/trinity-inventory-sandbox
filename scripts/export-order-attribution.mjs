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
const reportDate = now.toISOString().slice(0, 10)
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const outputDir = path.resolve(
  rootDir,
  process.env.TRINITY_ANALYTICS_REPORT_DIR ?? 'reports/analytics',
)
const since = resolveSinceDate(options)
const onlineOnly = options.all !== 'true'

if (!shopDomain || !adminToken) {
  throw new Error(`Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_ACCESS_TOKEN in ${envPath}`)
}

await fs.mkdir(outputDir, { recursive: true })

const orders = await listOrders({
  since,
  query: buildOrderQuery({ since, onlineOnly }),
})
const rows = orders.map(buildOrderRow).filter((row) => !onlineOnly || row.orderClass === 'online_store')
const summary = buildSummary(rows)

const baseName = `order-attribution-${reportDate}`
const jsonPath = path.join(outputDir, `${baseName}.json`)
const csvPath = path.join(outputDir, `${baseName}.csv`)
const markdownPath = path.join(outputDir, `${baseName}.md`)

await fs.writeFile(
  jsonPath,
  `${JSON.stringify({ generatedAt: now.toISOString(), since, onlineOnly, summary, rows }, null, 2)}\n`,
)
await fs.writeFile(csvPath, toCsv(rows))
await fs.writeFile(
  markdownPath,
  toMarkdown(summary, rows, { generatedAt: now, since, onlineOnly }),
)

console.log(`Exported ${rows.length} ${onlineOnly ? 'online-store ' : ''}orders`)
console.log(`JSON: ${path.relative(rootDir, jsonPath)}`)
console.log(`CSV: ${path.relative(rootDir, csvPath)}`)
console.log(`Report: ${path.relative(rootDir, markdownPath)}`)
console.log(
  `Attribution: ${summary.nativeJourneyAttributedOrders}/${summary.totalOrders} Shopify-native attributed, ${summary.trinityAttributedOrders}/${summary.totalOrders} Trinity-attributed, ${summary.instagramOrders} Instagram-attributed`,
)

async function listOrders({ query }) {
  const orders = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query ListOrders($query: String!, $after: String) {
          orders(first: 250, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
            nodes {
              id
              name
              createdAt
              cancelledAt
              displayFinancialStatus
              sourceName
              tags
              app {
                name
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
              customerJourneySummary {
                ready
                daysToConversion
                momentsCount {
                  count
                  precision
                }
                firstVisit {
                  occurredAt
                  landingPage
                  referrerUrl
                  referralCode
                  referralInfoHtml
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
                  referralCode
                  referralInfoHtml
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
              trinityFirstSource: metafield(namespace: "trinity", key: "first_source") {
                value
              }
              trinityFirstMedium: metafield(namespace: "trinity", key: "first_medium") {
                value
              }
              trinityFirstCampaign: metafield(namespace: "trinity", key: "first_campaign") {
                value
              }
              trinityFirstLandingPage: metafield(namespace: "trinity", key: "first_landing_page") {
                value
              }
              trinityLastSource: metafield(namespace: "trinity", key: "last_source") {
                value
              }
              trinityLastMedium: metafield(namespace: "trinity", key: "last_medium") {
                value
              }
              trinityLastCampaign: metafield(namespace: "trinity", key: "last_campaign") {
                value
              }
              trinityLastLandingPage: metafield(namespace: "trinity", key: "last_landing_page") {
                value
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
      await sleep(getRetryDelayMs(attempt))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    const retryable = payload.errors.some((error) => /throttled|temporarily unavailable/i.test(error.message))
    if (retryable && attempt < 8) {
      await sleep(getRetryDelayMs(attempt))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((error) => error.message).join(', '))
  }

  return payload
}

function buildOrderRow(order) {
  const journey = order.customerJourneySummary ?? {}
  const firstVisit = normalizeVisit(journey.firstVisit)
  const lastVisit = normalizeVisit(journey.lastVisit)
  const trinityFirstSource = normalizeSource(order.trinityFirstSource?.value)
  const trinityLastSource = normalizeSource(order.trinityLastSource?.value)
  const nativeFirstSource = normalizeSource(firstVisit.source)
  const nativeLastSource = normalizeSource(lastVisit.source)
  const nativeBestSource = nativeLastSource || nativeFirstSource
  const trinityBestSource = trinityLastSource || trinityFirstSource

  return {
    orderName: order.name,
    createdAt: order.createdAt,
    createdDate: formatDate(order.createdAt),
    financialStatus: clean(order.displayFinancialStatus),
    sourceName: clean(order.sourceName),
    appName: clean(order.app?.name),
    orderClass: classifyOrder(order),
    amount: Number(order.currentTotalPriceSet?.shopMoney?.amount ?? 0),
    currency: clean(order.currentTotalPriceSet?.shopMoney?.currencyCode),
    nativeJourneyReady: Boolean(journey.ready),
    nativeJourneyMoments: Number(journey.momentsCount?.count ?? 0),
    nativeDaysToConversion: Number.isFinite(Number(journey.daysToConversion))
      ? Number(journey.daysToConversion)
      : '',
    nativeFirstSource,
    nativeFirstMedium: normalizeMedium(firstVisit),
    nativeFirstSourceType: clean(firstVisit.sourceType),
    nativeFirstLandingPage: clean(firstVisit.landingPage),
    nativeFirstReferrer: clean(firstVisit.referrerUrl),
    nativeFirstUtmSource: normalizeSource(firstVisit.utmSource),
    nativeFirstUtmMedium: clean(firstVisit.utmMedium),
    nativeFirstUtmCampaign: clean(firstVisit.utmCampaign),
    nativeLastSource,
    nativeLastMedium: normalizeMedium(lastVisit),
    nativeLastSourceType: clean(lastVisit.sourceType),
    nativeLastLandingPage: clean(lastVisit.landingPage),
    nativeLastReferrer: clean(lastVisit.referrerUrl),
    nativeLastUtmSource: normalizeSource(lastVisit.utmSource),
    nativeLastUtmMedium: clean(lastVisit.utmMedium),
    nativeLastUtmCampaign: clean(lastVisit.utmCampaign),
    nativeBestSource,
    trinityFirstSource,
    trinityFirstMedium: clean(order.trinityFirstMedium?.value),
    trinityFirstCampaign: clean(order.trinityFirstCampaign?.value),
    trinityFirstLandingPage: clean(order.trinityFirstLandingPage?.value),
    trinityLastSource,
    trinityLastMedium: clean(order.trinityLastMedium?.value),
    trinityLastCampaign: clean(order.trinityLastCampaign?.value),
    trinityLastLandingPage: clean(order.trinityLastLandingPage?.value),
    trinityBestSource,
    trinityCustomerSessionId: clean(order.trinityCustomerSessionId?.value),
    attributionStatus: attributionStatus({ nativeBestSource, trinityBestSource }),
    sourceAgreement: sourceAgreement(nativeBestSource, trinityBestSource),
  }
}

function normalizeVisit(visit) {
  const utm = visit?.utmParameters ?? {}
  return {
    occurredAt: clean(visit?.occurredAt),
    landingPage: clean(visit?.landingPage),
    referrerUrl: clean(visit?.referrerUrl),
    referralCode: clean(visit?.referralCode),
    referralInfoHtml: clean(visit?.referralInfoHtml),
    source: clean(visit?.source),
    sourceDescription: clean(visit?.sourceDescription),
    sourceType: clean(visit?.sourceType),
    utmCampaign: clean(utm.campaign),
    utmContent: clean(utm.content),
    utmMedium: clean(utm.medium),
    utmSource: clean(utm.source),
    utmTerm: clean(utm.term),
  }
}

function buildSummary(rows) {
  const totalOrders = rows.length
  const totalRevenue = sumMoney(rows)
  const nativeJourneyAttributedOrders = rows.filter((row) => row.nativeBestSource).length
  const trinityAttributedOrders = rows.filter((row) => row.trinityBestSource).length
  const instagramOrders = rows.filter((row) => isInstagramLike(row.nativeBestSource) || isInstagramLike(row.trinityBestSource)).length
  const attributionGapOrders = rows.filter((row) => row.attributionStatus !== 'both_attributed').length

  return {
    totalOrders,
    totalRevenue,
    nativeJourneyAttributedOrders,
    trinityAttributedOrders,
    instagramOrders,
    attributionGapOrders,
    byNativeLastOrFirstSource: summarizeBy(rows, (row) => row.nativeBestSource || 'unknown'),
    byNativeFirstSource: summarizeBy(rows, (row) => row.nativeFirstSource || 'unknown'),
    byTrinityLastOrFirstSource: summarizeBy(rows, (row) => row.trinityBestSource || 'unknown'),
    byAttributionStatus: summarizeBy(rows, (row) => row.attributionStatus),
  }
}

function toCsv(rows) {
  const columns = [
    'orderName',
    'createdAt',
    'createdDate',
    'financialStatus',
    'sourceName',
    'appName',
    'orderClass',
    'amount',
    'currency',
    'nativeJourneyReady',
    'nativeJourneyMoments',
    'nativeDaysToConversion',
    'nativeFirstSource',
    'nativeFirstMedium',
    'nativeFirstSourceType',
    'nativeFirstLandingPage',
    'nativeFirstReferrer',
    'nativeFirstUtmSource',
    'nativeFirstUtmMedium',
    'nativeFirstUtmCampaign',
    'nativeLastSource',
    'nativeLastMedium',
    'nativeLastSourceType',
    'nativeLastLandingPage',
    'nativeLastReferrer',
    'nativeLastUtmSource',
    'nativeLastUtmMedium',
    'nativeLastUtmCampaign',
    'nativeBestSource',
    'trinityFirstSource',
    'trinityFirstMedium',
    'trinityFirstCampaign',
    'trinityFirstLandingPage',
    'trinityLastSource',
    'trinityLastMedium',
    'trinityLastCampaign',
    'trinityLastLandingPage',
    'trinityBestSource',
    'trinityCustomerSessionId',
    'attributionStatus',
    'sourceAgreement',
  ]
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`
}

function toMarkdown(summary, rows, context) {
  return `# Trinity Order Attribution Export

Generated: ${context.generatedAt.toLocaleString('en-US', { timeZone: 'America/Denver' })}

Window: ${context.since ? `${context.since.toISOString().slice(0, 10)} through ${reportDate}` : 'All available orders'}

Scope: ${context.onlineOnly ? 'Online Store orders only' : 'All orders'}

## Summary

| Metric | Value |
| --- | ---: |
| Orders | ${summary.totalOrders} |
| Revenue | ${formatMoney(summary.totalRevenue)} |
| Shopify-native attributed orders | ${summary.nativeJourneyAttributedOrders} |
| Trinity-attributed orders | ${summary.trinityAttributedOrders} |
| Instagram-attributed orders | ${summary.instagramOrders} |
| Orders with any attribution gap | ${summary.attributionGapOrders} |

## Shopify Native Last/Best Source

${markdownSummaryTable(summary.byNativeLastOrFirstSource)}

## Shopify Native First Source

${markdownSummaryTable(summary.byNativeFirstSource)}

## Trinity Custom Attribution Source

${markdownSummaryTable(summary.byTrinityLastOrFirstSource)}

## Attribution Status

${markdownSummaryTable(summary.byAttributionStatus)}

## Orders

| Order | Date | Amount | Shopify first | Shopify last | Trinity first | Trinity last | Status |
| --- | --- | ---: | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${row.orderName} | ${row.createdDate} | ${formatMoney(row.amount)} | ${row.nativeFirstSource || 'unknown'} | ${row.nativeLastSource || 'unknown'} | ${row.trinityFirstSource || 'unknown'} | ${row.trinityLastSource || 'unknown'} | ${row.attributionStatus} |`).join('\n')}
`
}

function markdownSummaryTable(items) {
  if (!items.length) return 'No data.'
  return [
    '| Source | Orders | Revenue |',
    '| --- | ---: | ---: |',
    ...items.map((item) => `| ${escapeMarkdown(item.key)} | ${item.orders} | ${formatMoney(item.revenue)} |`),
  ].join('\n')
}

function summarizeBy(rows, selector) {
  const grouped = new Map()
  for (const row of rows) {
    const key = clean(selector(row)) || 'unknown'
    const current = grouped.get(key) ?? { key, orders: 0, revenue: 0 }
    current.orders += 1
    current.revenue += row.amount
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map((item) => ({ ...item, revenue: roundMoney(item.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.key.localeCompare(b.key))
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

function attributionStatus({ nativeBestSource, trinityBestSource }) {
  if (nativeBestSource && trinityBestSource) return 'both_attributed'
  if (nativeBestSource) return 'shopify_only'
  if (trinityBestSource) return 'trinity_only'
  return 'unattributed'
}

function sourceAgreement(nativeBestSource, trinityBestSource) {
  if (!nativeBestSource || !trinityBestSource) return ''
  return nativeBestSource === trinityBestSource ? 'match' : 'mismatch'
}

function normalizeMedium(visit) {
  return clean(visit.utmMedium || visit.sourceType || sourceMediumFromReferrer(visit.referrerUrl))
}

function sourceMediumFromReferrer(referrer) {
  try {
    const host = new URL(referrer).hostname
    if (/(google|bing|duckduckgo|yahoo)/i.test(host)) return 'organic'
    if (/(instagram|facebook|threads\.net|tiktok|pinterest|twitter|x\.com)/i.test(host)) return 'social'
    return 'referral'
  } catch {
    return ''
  }
}

function isInstagramLike(source) {
  return normalizeSource(source) === 'instagram'
}

function normalizeSource(value) {
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
  if (source.includes('yahoo')) return 'yahoo'
  if (source.includes('bing')) return 'bing'
  if (source.includes('klaviyo') || source === 'email') return 'email'
  if (source.includes('android-app://com.google.android.gm')) return 'email'
  return source
}

function buildOrderQuery({ since, onlineOnly }) {
  const parts = []
  if (since) parts.push(`created_at:>=${since.toISOString().slice(0, 10)}`)
  return parts.join(' ')
}

function resolveSinceDate(parsed) {
  if (parsed.allTime === 'true' || parsed['all-time'] === 'true') return null
  if (parsed.since) return parseDate(parsed.since)
  const days = Number(parsed.days ?? process.env.TRINITY_ORDER_ATTRIBUTION_DAYS ?? 14)
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
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

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function sumMoney(rows) {
  return roundMoney(rows.reduce((sum, row) => sum + row.amount, 0))
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function formatMoney(value) {
  return `$${roundMoney(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function csvCell(value) {
  const stringValue = value === undefined || value === null ? '' : String(value)
  if (!/[",\n\r]/.test(stringValue)) return stringValue
  return `"${stringValue.replace(/"/g, '""')}"`
}

function escapeMarkdown(value) {
  return clean(value).replace(/\|/g, '\\|')
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function getRetryDelayMs(attempt) {
  return Math.min(1000 * 2 ** attempt, 15000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
