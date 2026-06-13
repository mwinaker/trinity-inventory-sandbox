import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envPath =
  process.env.SHOPIFY_ENV_FILE ?? path.join(rootDir, '.env.shopify-custom-app.local')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const app = express()
const port = Number(process.env.PORT ?? 4178)
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const analyticsCollectorVersion = '2026-06-06-meta-instagram-visibility'
const shopDomain = process.env.SHOPIFY_SHOP
const analyticsAdminToken =
  process.env.TRINITY_ANALYTICS_SHOPIFY_ADMIN_ACCESS_TOKEN ??
  process.env.SHOPIFY_ANALYTICS_ADMIN_ACCESS_TOKEN ??
  ''
const sharedAdminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? ''
const adminToken = analyticsAdminToken || sharedAdminToken
const adminTokenSource = analyticsAdminToken
  ? 'dedicated_analytics_token'
  : sharedAdminToken
    ? 'shared_fallback_token'
    : 'missing'
const shopCurrencyCode = process.env.SHOPIFY_CURRENCY_CODE ?? 'USD'
const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID ?? ''
const ga4ApiSecret = process.env.GA4_API_SECRET ?? ''
const allowedOrigins = parseOriginList(
  process.env.TRINITY_ANALYTICS_ALLOWED_ORIGINS ?? '*',
)
const metaobjectDefinitionFieldLimit = 40

if (!shopDomain || !adminToken) {
  console.warn(
    'Missing SHOPIFY_SHOP or analytics Shopify token. Analytics collection is unavailable.',
  )
} else if (adminTokenSource === 'shared_fallback_token') {
  console.warn(
    'Analytics collector is using SHOPIFY_ADMIN_ACCESS_TOKEN fallback. Set TRINITY_ANALYTICS_SHOPIFY_ADMIN_ACCESS_TOKEN to isolate analytics API throttling from the inventory app.',
  )
}

const customerSessionConfig = {
  type: '$app:trinity_customer_session',
  name: 'Trinity Customer Session',
  labelFor(item) {
    return `${item.sessionId || item.id} ${item.lastEventName || ''}`.trim()
  },
  fieldsFor(item) {
    return [
      fieldValue('session_id', item.sessionId),
      fieldValue('visitor_id', item.visitorId),
      fieldValue('first_source', item.firstSource),
      fieldValue('first_medium', item.firstMedium),
      fieldValue('first_campaign', item.firstCampaign),
      fieldValue('first_content', item.firstContent),
      fieldValue('first_term', item.firstTerm),
      fieldValue('first_landing_page', item.firstLandingPage),
      fieldValue('first_referrer', item.firstReferrer),
      fieldValue('last_source', item.lastSource),
      fieldValue('last_medium', item.lastMedium),
      fieldValue('last_campaign', item.lastCampaign),
      fieldValue('last_content', item.lastContent),
      fieldValue('last_term', item.lastTerm),
      fieldValue('last_landing_page', item.lastLandingPage),
      fieldValue('last_referrer', item.lastReferrer),
      fieldValue('device', item.device),
      fieldValue('last_event_name', item.lastEventName),
      fieldValue('last_event_at', item.lastEventAt),
      fieldValue('order_id', item.orderId),
      fieldValue('order_name', item.orderName),
      fieldValue('customer_email_hash', item.customerEmailHash),
      fieldValue('meta_dataset_id', item.metaDatasetId),
      fieldValue('meta_business_id', item.metaBusinessId),
      fieldValue('facebook_page_id', item.facebookPageId),
      fieldValue('instagram_handle', item.instagramHandle),
      fieldValue('data_sharing_preference', item.dataSharingPreference),
      fieldValue('last_shopify_client_id', item.lastShopifyClientId),
      fieldValue('first_meta_click_id', item.firstMetaClickId),
      fieldValue('last_meta_click_id', item.lastMetaClickId),
      fieldValue('first_instagram_click_id', item.firstInstagramClickId),
      fieldValue('last_instagram_click_id', item.lastInstagramClickId),
      fieldValue('last_meta_browser_id', item.lastMetaBrowserId),
      fieldValue('last_meta_click_cookie', item.lastMetaClickCookie),
      fieldValue('tracking_ids_json', JSON.stringify(item.trackingIds ?? {})),
      fieldValue('integration_json', JSON.stringify(item.integration ?? {})),
      fieldValue('consent_json', JSON.stringify(item.consent ?? {})),
      fieldValue('browser_cookies_json', JSON.stringify(item.browserCookies ?? {})),
      fieldValue('events_json', JSON.stringify(item.events ?? [])),
      fieldValue('created_at', item.createdAt),
      fieldValue('updated_at', item.updatedAt),
    ].filter(Boolean)
  },
  fieldDefinitions: [
    definitionField('session_id', 'Session ID', 'single_line_text_field'),
    definitionField('visitor_id', 'Visitor ID', 'single_line_text_field'),
    definitionField('first_source', 'First Source', 'single_line_text_field'),
    definitionField('first_medium', 'First Medium', 'single_line_text_field'),
    definitionField('first_campaign', 'First Campaign', 'single_line_text_field'),
    definitionField('first_content', 'First Content', 'single_line_text_field'),
    definitionField('first_term', 'First Term', 'single_line_text_field'),
    definitionField('first_landing_page', 'First Landing Page', 'single_line_text_field'),
    definitionField('first_referrer', 'First Referrer', 'single_line_text_field'),
    definitionField('last_source', 'Last Source', 'single_line_text_field'),
    definitionField('last_medium', 'Last Medium', 'single_line_text_field'),
    definitionField('last_campaign', 'Last Campaign', 'single_line_text_field'),
    definitionField('last_content', 'Last Content', 'single_line_text_field'),
    definitionField('last_term', 'Last Term', 'single_line_text_field'),
    definitionField('last_landing_page', 'Last Landing Page', 'single_line_text_field'),
    definitionField('last_referrer', 'Last Referrer', 'single_line_text_field'),
    definitionField('device', 'Device', 'single_line_text_field'),
    definitionField('last_event_name', 'Last Event Name', 'single_line_text_field'),
    definitionField('last_event_at', 'Last Event At', 'single_line_text_field'),
    definitionField('order_id', 'Order ID', 'single_line_text_field'),
    definitionField('order_name', 'Shopify Order Name', 'single_line_text_field'),
    definitionField('customer_email_hash', 'Customer Email Hash', 'single_line_text_field'),
    definitionField('meta_dataset_id', 'Meta Dataset ID', 'single_line_text_field'),
    definitionField('meta_business_id', 'Meta Business ID', 'single_line_text_field'),
    definitionField('facebook_page_id', 'Facebook Page ID', 'single_line_text_field'),
    definitionField('instagram_handle', 'Instagram Handle', 'single_line_text_field'),
    definitionField('data_sharing_preference', 'Meta Data Sharing Preference', 'single_line_text_field'),
    definitionField('last_shopify_client_id', 'Last Shopify Client ID', 'single_line_text_field'),
    definitionField('first_meta_click_id', 'First Meta Click ID', 'single_line_text_field'),
    definitionField('last_meta_click_id', 'Last Meta Click ID', 'single_line_text_field'),
    definitionField('first_instagram_click_id', 'First Instagram Click ID', 'single_line_text_field'),
    definitionField('last_instagram_click_id', 'Last Instagram Click ID', 'single_line_text_field'),
    definitionField('last_meta_browser_id', 'Last Meta Browser ID', 'single_line_text_field'),
    definitionField('last_meta_click_cookie', 'Last Meta Click Cookie', 'single_line_text_field'),
    definitionField('tracking_ids_json', 'Tracking IDs JSON', 'json'),
    definitionField('integration_json', 'Integration JSON', 'json'),
    definitionField('consent_json', 'Consent JSON', 'json'),
    definitionField('browser_cookies_json', 'Browser Cookies JSON', 'json'),
    definitionField('events_json', 'Events JSON', 'json'),
    definitionField('created_at', 'Created At', 'single_line_text_field'),
    definitionField('updated_at', 'Updated At', 'single_line_text_field'),
  ],
}

let definitionPromise = null

app.use(express.json({ limit: '2mb' }))

app.options('/api/analytics/events', (request, response) => {
  setAnalyticsCorsHeaders(request, response)
  response.status(204).send()
})

app.get('/api/health', (_request, response) => {
  response.json({
    ok: Boolean(shopDomain && adminToken),
    service: 'trinity-analytics-collector',
    version: analyticsCollectorVersion,
    shop: shopDomain ?? null,
    apiVersion,
    analytics: {
      collector: true,
      ga4Forwarding: Boolean(ga4MeasurementId && ga4ApiSecret),
      allowedOrigins,
      shopifyTokenSource: adminTokenSource,
      capturesMetaShopifySignals: true,
    },
  })
})

app.post('/api/analytics/events', async (request, response) => {
  setAnalyticsCorsHeaders(request, response)

  try {
    if (!isAllowedOrigin(request)) {
      response.status(403).json({ ok: false, message: 'Origin is not allowed.' })
      return
    }

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const incomingEvents = Array.isArray(request.body?.events)
      ? request.body.events
      : [request.body].filter(Boolean)
    const acceptedEvents = incomingEvents
      .map((event) => normalizeAnalyticsEvent(event, request))
      .filter(Boolean)

    if (acceptedEvents.length === 0) {
      response.status(400).json({ ok: false, message: 'No valid analytics events supplied.' })
      return
    }

    await ensureDefinitions()
    const sessions = new Map()
    const orderAttributionUpdates = []
    const ga4Results = []

    for (const event of acceptedEvents) {
      const session = await upsertCustomerSessionFromEvent(event, sessions)
      sessions.set(session.sessionId, session)

      const orderId = resolveOrderIdFromAnalyticsEvent(event)
      if (orderId) {
        orderAttributionUpdates.push(syncOrderAttributionMetafields(orderId, session, event))
      }

      ga4Results.push(forwardAnalyticsEventToGa4(event, session))
    }

    const attributionResults = await Promise.allSettled(orderAttributionUpdates)
    const ga4SettledResults = await Promise.allSettled(ga4Results)
    const failedAttributionUpdates = attributionResults.filter((item) => item.status === 'rejected')
    const failedGa4Events = ga4SettledResults.filter((item) => item.status === 'rejected')
    const forwardedGa4Events = ga4SettledResults.filter(
      (item) => item.status === 'fulfilled' && item.value?.ok,
    ).length

    response.json({
      ok: true,
      accepted: acceptedEvents.length,
      sessionsUpdated: sessions.size,
      orderAttributionUpdated: attributionResults.length - failedAttributionUpdates.length,
      ga4Forwarded: forwardedGa4Events,
      ga4Configured: Boolean(ga4MeasurementId && ga4ApiSecret),
      warnings: failedAttributionUpdates.concat(failedGa4Events).map((item) =>
        item.reason instanceof Error ? item.reason.message : String(item.reason),
      ),
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown analytics collector error.',
    })
  }
})

app.get('/{*path}', (_request, response) => {
  response.status(404).json({ ok: false, message: 'Not found.' })
})

app.listen(port, () => {
  console.log(`Trinity analytics collector listening on http://127.0.0.1:${port}`)
})

function setAnalyticsCorsHeaders(request, response) {
  const origin = request.get('origin')
  const allowedOrigin = allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || '*'
  response.set('Access-Control-Allow-Origin', allowedOrigin)
  response.set('Vary', 'Origin')
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Content-Type')
  response.set('Access-Control-Max-Age', '86400')
}

function isAllowedOrigin(request) {
  const origin = request.get('origin')
  if (!origin) return true
  return allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)
}

function parseOriginList(value) {
  return cleanString(value)
    .split(/[\s,;]+/)
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean)
}

async function ensureDefinitions() {
  if (!definitionPromise) {
    definitionPromise = ensureDefinitionsInternal().catch((error) => {
      definitionPromise = null
      throw error
    })
  }

  return definitionPromise
}

async function ensureDefinitionsInternal() {
  await runWithShopifyRetry(async () => {
    const result = await shopifyGraphQL(
      `
        mutation CreateDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              type
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      {
        definition: {
          name: customerSessionConfig.name,
          type: customerSessionConfig.type,
          access: {
            admin: 'MERCHANT_READ_WRITE',
            storefront: 'NONE',
          },
          displayNameKey: 'label',
          fieldDefinitions: fieldDefinitionsForCreate(customerSessionConfig),
        },
      },
    )

    const errors = result?.data?.metaobjectDefinitionCreate?.userErrors ?? []
    throwIfRetryableShopifyUserErrors(errors, `Definition error for ${customerSessionConfig.type}`)
    const meaningfulErrors = errors.filter((item) => {
      const message = String(item?.message ?? '').toLowerCase()
      return !message.includes('already exists') && !message.includes('already been taken')
    })

    if (meaningfulErrors.length > 0) {
      throw new Error(
        `Definition error for ${customerSessionConfig.type}: ${meaningfulErrors
          .map((item) => item.message)
          .join(', ')}`,
      )
    }

    const definitionId =
      result?.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id ??
      (await getDefinitionByType(customerSessionConfig.type))?.id

    if (!definitionId) {
      throw new Error(`Could not resolve definition id for ${customerSessionConfig.type}`)
    }

    await ensureDefinitionFields(definitionId, customerSessionConfig)
  })
}

async function ensureDefinitionFields(definitionId, config) {
  const existing = await getDefinitionByType(config.type)
  const existingKeys = new Set(existing?.fieldDefinitions?.map((item) => item.key) ?? [])
  const missingFields = config.fieldDefinitions.filter((field) => !existingKeys.has(field.key))
  const availableSlots = Math.max(0, metaobjectDefinitionFieldLimit - existingKeys.size)
  const fieldsToCreate = missingFields.slice(0, availableSlots)

  if (missingFields.length > fieldsToCreate.length) {
    console.warn(
      `Skipping ${missingFields.length - fieldsToCreate.length} direct field definition(s) for ${config.type}; Shopify allows ${metaobjectDefinitionFieldLimit} fields and the payload JSON field remains authoritative.`,
    )
  }

  if (fieldsToCreate.length === 0) {
    config.definitionFieldKeys = existingKeys
    return
  }

  const result = await shopifyGraphQL(
    `
      mutation UpdateDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition {
            id
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: definitionId,
      definition: {
        fieldDefinitions: fieldsToCreate.map((field) => ({
          create: field,
        })),
      },
    },
  )

  const errors = result?.data?.metaobjectDefinitionUpdate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Definition update error for ${config.type}: ${errors.map((item) => item.message).join(', ')}`,
    )
  }

  for (const field of fieldsToCreate) existingKeys.add(field.key)
  config.definitionFieldKeys = existingKeys
}

async function getDefinitionByType(type) {
  const result = await shopifyGraphQL(
    `
      query MetaobjectDefinitions {
        metaobjectDefinitions(first: 100) {
          nodes {
            id
            type
            fieldDefinitions {
              key
            }
          }
        }
      }
    `,
  )

  const nodes = result?.data?.metaobjectDefinitions?.nodes ?? []
  return nodes.find((node) => typeMatches(node.type, type)) ?? null
}

async function getRecordByHandle(config, id) {
  const handle = sanitizeHandle(id)
  if (!handle) return null

  const result = await shopifyGraphQL(
    `
      query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          payload: field(key: "payload") {
            jsonValue
          }
        }
      }
    `,
    {
      handle: {
        type: config.type,
        handle,
      },
    },
  )

  return result?.data?.metaobjectByHandle?.payload?.jsonValue ?? null
}

async function upsertRecord(config, item) {
  const handle = sanitizeHandle(item.id ?? config.labelFor(item))
  const result = await shopifyGraphQL(
    `
      mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      handle: {
        type: config.type,
        handle,
      },
      metaobject: {
        fields: filterDefinedMetaobjectFields(config, [
          {
            key: 'label',
            value: config.labelFor(item),
          },
          {
            key: 'payload',
            value: JSON.stringify(item),
          },
          ...config.fieldsFor(item),
        ]),
      },
    },
  )

  const errors = result?.data?.metaobjectUpsert?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Metaobject sync error for ${config.type}/${handle}: ${errors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  return handle
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
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 10) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'))
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0
      await sleep(Math.max(retryAfterMs, getRetryDelayMs(attempt)))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    const shouldRetry = payload.errors.some((item) => isRetryableShopifyError(item))
    if (shouldRetry && attempt < 10) {
      await sleep(getShopifyGraphQLRetryDelayMs(payload, attempt))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((item) => item.message).join(', '))
  }

  return payload
}

async function runWithShopifyRetry(operation, attempt = 0) {
  try {
    return await operation()
  } catch (error) {
    if (isRetryableShopifyError(error) && attempt < 10) {
      await sleep(getRetryDelayMs(attempt))
      return runWithShopifyRetry(operation, attempt + 1)
    }

    throw error
  }
}

class RetryableShopifyError extends Error {}

function throwIfRetryableShopifyUserErrors(errors, context) {
  if (!errors.some((item) => isRetryableShopifyError(item))) return

  throw new RetryableShopifyError(
    `${context}: ${errors.map((item) => item?.message ?? 'Shopify is throttling').join(', ')}`,
  )
}

function isRetryableShopifyError(item) {
  if (item instanceof RetryableShopifyError) return true
  const code = item?.extensions?.code ?? item?.code
  return code === 'THROTTLED' || /throttled|temporarily unavailable|try again/i.test(item?.message ?? '')
}

function getShopifyGraphQLRetryDelayMs(payload, attempt) {
  const cost = payload?.extensions?.cost
  const throttleStatus = cost?.throttleStatus
  const requestedCost = Number(cost?.requestedQueryCost)
  const available = Number(throttleStatus?.currentlyAvailable)
  const restoreRate = Number(throttleStatus?.restoreRate)

  if (
    Number.isFinite(requestedCost) &&
    Number.isFinite(available) &&
    Number.isFinite(restoreRate) &&
    restoreRate > 0
  ) {
    const deficit = Math.max(0, requestedCost - available)
    return Math.max(750, Math.ceil((deficit / restoreRate) * 1000) + 500)
  }

  return getRetryDelayMs(attempt)
}

function getRetryDelayMs(attempt) {
  return Math.min(1000 * 2 ** attempt, 15000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fieldDefinitionsForCreate(config) {
  const fields = [
    definitionField('label', 'Label', 'single_line_text_field'),
    definitionField('payload', 'Payload', 'json'),
    ...config.fieldDefinitions,
  ]

  if (fields.length <= metaobjectDefinitionFieldLimit) return fields

  console.warn(
    `Creating ${config.type} with the first ${metaobjectDefinitionFieldLimit} direct field definitions; ${fields.length - metaobjectDefinitionFieldLimit} overflow field(s) stay in payload JSON.`,
  )
  return fields.slice(0, metaobjectDefinitionFieldLimit)
}

function filterDefinedMetaobjectFields(config, fields) {
  if (!config.definitionFieldKeys) return fields
  return fields.filter((field) => config.definitionFieldKeys.has(field.key))
}

function normalizeAnalyticsEvent(rawEvent, request) {
  if (!rawEvent || typeof rawEvent !== 'object') return null

  const name = cleanString(rawEvent.name || rawEvent.eventName).slice(0, 96)
  if (!name) return null

  const attribution = normalizeAttribution(rawEvent.attribution ?? {})
  const context = normalizeAnalyticsContext(rawEvent.context ?? {}, request)
  const visitorId = cleanString(rawEvent.visitorId || attribution.visitorId || rawEvent.clientId)
    .slice(0, 128)
  const sessionId =
    cleanString(rawEvent.sessionId || attribution.sessionId || context.sessionId).slice(0, 128) ||
    createPlainId('session')
  const eventId =
    cleanString(rawEvent.id || rawEvent.eventId).slice(0, 128) ||
    crypto
      .createHash('sha256')
      .update(`${sessionId}:${name}:${rawEvent.timestamp || Date.now()}`)
      .digest('hex')
      .slice(0, 32)
  const timestamp = normalizeIsoDate(rawEvent.timestamp) || new Date().toISOString()

  return {
    id: eventId,
    name,
    timestamp,
    receivedAt: new Date().toISOString(),
    clientId: cleanString(rawEvent.clientId).slice(0, 128),
    sessionId,
    visitorId: visitorId || sessionId,
    sourcePixel: normalizeSourcePixel(rawEvent.sourcePixel),
    integration: normalizeIntegration(
      rawEvent.integration ?? rawEvent.browserSignals?.integration ?? rawEvent.attribution?.metaIntegration,
    ),
    browserSignals: normalizeBrowserSignals(rawEvent.browserSignals),
    attribution,
    context,
    data: rawEvent.data && typeof rawEvent.data === 'object' ? rawEvent.data : {},
    customerEmailHash: hashEmail(extractEmailFromAnalyticsEvent(rawEvent)),
  }
}

function normalizeAttribution(value) {
  const attribution = value && typeof value === 'object' ? value : {}
  const first = attribution.first && typeof attribution.first === 'object' ? attribution.first : {}
  const last = attribution.last && typeof attribution.last === 'object' ? attribution.last : {}

  return {
    sessionId: cleanString(attribution.sessionId).slice(0, 128),
    visitorId: cleanString(attribution.visitorId).slice(0, 128),
    device: cleanString(attribution.device).slice(0, 64),
    first: normalizeTouchpoint(first),
    last: normalizeTouchpoint(last),
    path: Array.isArray(attribution.path)
      ? attribution.path.map(normalizePathEntry).filter(Boolean).slice(-50)
      : [],
  }
}

function normalizeTouchpoint(value) {
  return {
    source: normalizeTrafficSource(value.source).slice(0, 128),
    medium: cleanString(value.medium).slice(0, 128),
    campaign: cleanString(value.campaign).slice(0, 128),
    content: cleanString(value.content).slice(0, 128),
    term: cleanString(value.term).slice(0, 128),
    campaignId: cleanString(value.campaignId).slice(0, 128),
    fbclid: cleanString(value.fbclid).slice(0, 256),
    gclid: cleanString(value.gclid).slice(0, 256),
    msclkid: cleanString(value.msclkid).slice(0, 256),
    ttclid: cleanString(value.ttclid).slice(0, 256),
    igshid: cleanString(value.igshid).slice(0, 256),
    landingPage: cleanString(value.landingPage).slice(0, 512),
    referrer: cleanString(value.referrer).slice(0, 512),
    capturedAt: normalizeIsoDate(value.capturedAt) || '',
  }
}

function normalizeSourcePixel(value) {
  const sourcePixel = value && typeof value === 'object' ? value : {}
  return {
    id: cleanString(sourcePixel.id).slice(0, 128),
    name: cleanString(sourcePixel.name).slice(0, 128),
    version: cleanString(sourcePixel.version).slice(0, 64),
  }
}

function normalizeIntegration(value) {
  const integration = value && typeof value === 'object' ? value : {}
  return compactObject({
    shopifyPixelName: cleanString(integration.shopifyPixelName).slice(0, 128),
    shopifyPixelId: cleanString(integration.shopifyPixelId).slice(0, 128),
    shopifyPixelVersion: cleanString(integration.shopifyPixelVersion).slice(0, 64),
    collector: cleanString(integration.collector).slice(0, 128),
    collectorHost: cleanString(integration.collectorHost).slice(0, 128),
    officialMetaChannel: cleanString(integration.officialMetaChannel).slice(0, 128),
    dataSharingPreference: cleanString(integration.dataSharingPreference).slice(0, 64),
    dataSharingIncludes: Array.isArray(integration.dataSharingIncludes)
      ? integration.dataSharingIncludes.map((item) => cleanString(item).slice(0, 64)).filter(Boolean)
      : [],
    metaDatasetId: cleanString(integration.metaDatasetId).slice(0, 128),
    metaDatasetName: cleanString(integration.metaDatasetName).slice(0, 128),
    metaBusinessId: cleanString(integration.metaBusinessId).slice(0, 128),
    facebookPageId: cleanString(integration.facebookPageId).slice(0, 128),
    facebookPageName: cleanString(integration.facebookPageName).slice(0, 128),
    instagramHandle: cleanString(integration.instagramHandle).replace(/^@/, '').slice(0, 128),
    fallbackPixelId: cleanString(integration.fallbackPixelId).slice(0, 128),
    fallbackPixelName: cleanString(integration.fallbackPixelName).slice(0, 128),
    fallbackPixelStatus: cleanString(integration.fallbackPixelStatus).slice(0, 128),
  })
}

function normalizeBrowserSignals(value) {
  const signals = value && typeof value === 'object' ? value : {}
  return {
    integration: normalizeIntegration(signals.integration),
    trackingParams: normalizeStringMap(signals.trackingParams, 256),
    persistedTrackingIds: normalizeTrackingIdMap(signals.persistedTrackingIds ?? signals.trackingIds),
    cookies: normalizeStringMap(signals.cookies, 512),
    consent: normalizeConsent(signals.consent),
    init: normalizeInitSnapshot(signals.init),
  }
}

function normalizeTrackingIdMap(value) {
  const ids = value && typeof value === 'object' ? value : {}
  const normalized = {}

  for (const [key, raw] of Object.entries(ids).slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue
    const normalizedKey = cleanString(key).slice(0, 64)
    if (!normalizedKey) continue
    normalized[normalizedKey] = compactObject({
      first: cleanString(raw.first).slice(0, 256),
      firstCapturedAt: normalizeIsoDate(raw.firstCapturedAt) || '',
      last: cleanString(raw.last).slice(0, 256),
      lastCapturedAt: normalizeIsoDate(raw.lastCapturedAt) || '',
    })
  }

  return normalized
}

function normalizeStringMap(value, maxLength) {
  const source = value && typeof value === 'object' ? value : {}
  const normalized = {}

  for (const [key, raw] of Object.entries(source).slice(0, 100)) {
    const normalizedKey = cleanString(key).slice(0, 64)
    const normalizedValue = cleanString(raw).slice(0, maxLength)
    if (normalizedKey && normalizedValue) normalized[normalizedKey] = normalizedValue
  }

  return normalized
}

function normalizeConsent(value) {
  const consent = value && typeof value === 'object' ? value : {}
  return compactObject({
    analyticsProcessingAllowed: toNullableBoolean(consent.analyticsProcessingAllowed),
    marketingAllowed: toNullableBoolean(consent.marketingAllowed),
    preferencesProcessingAllowed: toNullableBoolean(consent.preferencesProcessingAllowed),
    saleOfDataAllowed: toNullableBoolean(consent.saleOfDataAllowed),
  })
}

function normalizeInitSnapshot(value) {
  const init = value && typeof value === 'object' ? value : {}
  const shop = init.shop && typeof init.shop === 'object' ? init.shop : {}
  return compactObject({
    shop: compactObject({
      name: cleanString(shop.name).slice(0, 128),
      myshopifyDomain: cleanString(shop.myshopifyDomain).slice(0, 128),
      storefrontUrl: cleanString(shop.storefrontUrl).slice(0, 256),
      countryCode: cleanString(shop.countryCode).slice(0, 16),
      currencyCode: cleanString(shop.currencyCode).slice(0, 16),
    }),
    hasCustomer: toNullableBoolean(init.hasCustomer),
    hasCart: toNullableBoolean(init.hasCart),
    hasCheckout: toNullableBoolean(init.hasCheckout),
    productVariantCount: toFiniteNumber(init.productVariantCount),
  })
}

function normalizePathEntry(value) {
  if (!value || typeof value !== 'object') return null
  const path = cleanString(value.path).slice(0, 512)
  const url = cleanString(value.url).slice(0, 512)
  if (!path && !url) return null
  return {
    path,
    url,
    title: cleanString(value.title).slice(0, 256),
    at: normalizeIsoDate(value.at) || '',
  }
}

function normalizeAnalyticsContext(value, request) {
  const context = value && typeof value === 'object' ? value : {}
  const document = context.document && typeof context.document === 'object' ? context.document : {}
  const navigator = context.navigator && typeof context.navigator === 'object' ? context.navigator : {}
  const windowContext = context.window && typeof context.window === 'object' ? context.window : {}
  const url = cleanString(document.location || document.url || context.url).slice(0, 512)
  const userAgent = cleanString(navigator.userAgent || request.get('user-agent')).slice(0, 512)

  return {
    sessionId: cleanString(context.sessionId).slice(0, 128),
    pageTitle: cleanString(document.title || context.pageTitle).slice(0, 256),
    pageLocation: url,
    pagePath: pathFromUrl(url),
    referrer: cleanString(document.referrer || context.referrer).slice(0, 512),
    userAgent,
    device: inferDevice(userAgent),
    viewport: cleanString(
      windowContext.innerWidth && windowContext.innerHeight
        ? `${windowContext.innerWidth}x${windowContext.innerHeight}`
        : context.viewport,
    ).slice(0, 64),
  }
}

async function upsertCustomerSessionFromEvent(event, cachedSessions) {
  const existing =
    cachedSessions.get(event.sessionId) ?? (await getRecordByHandle(customerSessionConfig, event.sessionId))
  const now = new Date().toISOString()
  const firstTouch = firstPopulatedTouchpoint(existing, event.attribution.first, event.attribution.last, {
    landingPage: event.context.pageLocation || event.context.pagePath,
    referrer: event.context.referrer,
  })
  const lastTouch = lastPopulatedTouchpoint(event.attribution.last, event.attribution.first, {
    landingPage: event.context.pageLocation || event.context.pagePath,
    referrer: event.context.referrer,
  })
  const eventSummary = summarizeAnalyticsEvent(event)
  const existingEvents = Array.isArray(existing?.events) ? existing.events : []
  const events = existingEvents
    .filter((item) => item?.id !== eventSummary.id)
    .concat(eventSummary)
    .slice(-200)
  const orderId = resolveOrderIdFromAnalyticsEvent(event) || cleanString(existing?.orderId)
  const orderName = resolveOrderNameFromAnalyticsEvent(event) || cleanString(existing?.orderName)
  const integration = mergeIntegrationSnapshots(
    existing?.integration,
    event.integration,
    event.browserSignals.integration,
  )
  const trackingIds = mergeTrackingIdMaps(
    existing?.trackingIds,
    event.browserSignals.persistedTrackingIds,
    trackingIdsFromParams(event.browserSignals.trackingParams, event.timestamp),
  )
  const browserCookies = {
    ...(existing?.browserCookies && typeof existing.browserCookies === 'object'
      ? existing.browserCookies
      : {}),
    ...event.browserSignals.cookies,
  }
  const consent = Object.keys(event.browserSignals.consent).length
    ? event.browserSignals.consent
    : existing?.consent ?? {}
  const firstMetaClickId =
    cleanString(existing?.firstMetaClickId) ||
    firstMetaTrackingId(trackingIds) ||
    cleanString(firstTouch.fbclid) ||
    cleanString(firstTouch.igshid)
  const lastMetaClickId =
    lastMetaTrackingId(trackingIds) ||
    cleanString(lastTouch.fbclid) ||
    cleanString(lastTouch.igshid) ||
    cleanString(existing?.lastMetaClickId)
  const firstInstagramClickId =
    cleanString(existing?.firstInstagramClickId) ||
    firstTrackingId(trackingIds, 'igshid') ||
    cleanString(firstTouch.igshid)
  const lastInstagramClickId =
    lastTrackingId(trackingIds, 'igshid') ||
    cleanString(lastTouch.igshid) ||
    cleanString(existing?.lastInstagramClickId)
  const lastMetaBrowserId = cleanString(browserCookies._fbp || existing?.lastMetaBrowserId)
  const lastMetaClickCookie = cleanString(browserCookies._fbc || existing?.lastMetaClickCookie)

  const session = {
    id: event.sessionId,
    sessionId: event.sessionId,
    visitorId: event.visitorId || existing?.visitorId || event.sessionId,
    firstSource: firstTouch.source,
    firstMedium: firstTouch.medium,
    firstCampaign: firstTouch.campaign,
    firstContent: firstTouch.content,
    firstTerm: firstTouch.term,
    firstLandingPage: firstTouch.landingPage,
    firstReferrer: firstTouch.referrer,
    lastSource: lastTouch.source,
    lastMedium: lastTouch.medium,
    lastCampaign: lastTouch.campaign,
    lastContent: lastTouch.content,
    lastTerm: lastTouch.term,
    lastLandingPage: lastTouch.landingPage,
    lastReferrer: lastTouch.referrer,
    device: event.attribution.device || existing?.device || event.context.device,
    lastEventName: event.name,
    lastEventAt: event.timestamp,
    orderId,
    orderName,
    customerEmailHash: event.customerEmailHash || existing?.customerEmailHash || '',
    integration,
    metaDatasetId: integration.metaDatasetId || cleanString(existing?.metaDatasetId),
    metaBusinessId: integration.metaBusinessId || cleanString(existing?.metaBusinessId),
    facebookPageId: integration.facebookPageId || cleanString(existing?.facebookPageId),
    instagramHandle: integration.instagramHandle || cleanString(existing?.instagramHandle),
    dataSharingPreference:
      integration.dataSharingPreference || cleanString(existing?.dataSharingPreference),
    lastShopifyClientId: event.clientId || cleanString(existing?.lastShopifyClientId),
    firstMetaClickId,
    lastMetaClickId,
    firstInstagramClickId,
    lastInstagramClickId,
    lastMetaBrowserId,
    lastMetaClickCookie,
    trackingIds,
    browserCookies,
    consent,
    events,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  await upsertRecord(customerSessionConfig, session)
  return session
}

function firstPopulatedTouchpoint(existing, primary, secondary, fallback) {
  return {
    source:
      normalizeTrafficSource(existing?.firstSource) ||
      normalizeTrafficSource(primary?.source) ||
      normalizeTrafficSource(secondary?.source) ||
      inferSourceFromReferrer(fallback?.referrer),
    medium:
      cleanString(existing?.firstMedium) ||
      cleanString(primary?.medium) ||
      cleanString(secondary?.medium) ||
      inferMediumFromReferrer(fallback?.referrer),
    campaign:
      cleanString(existing?.firstCampaign) ||
      cleanString(primary?.campaign) ||
      cleanString(secondary?.campaign),
    content:
      cleanString(existing?.firstContent) ||
      cleanString(primary?.content) ||
      cleanString(secondary?.content),
    term:
      cleanString(existing?.firstTerm) ||
      cleanString(primary?.term) ||
      cleanString(secondary?.term),
    campaignId:
      cleanString(existing?.firstCampaignId) ||
      cleanString(primary?.campaignId) ||
      cleanString(secondary?.campaignId),
    fbclid:
      cleanString(existing?.firstFbclid) ||
      cleanString(primary?.fbclid) ||
      cleanString(secondary?.fbclid),
    igshid:
      cleanString(existing?.firstIgshid) ||
      cleanString(primary?.igshid) ||
      cleanString(secondary?.igshid),
    landingPage:
      cleanString(existing?.firstLandingPage) ||
      cleanString(primary?.landingPage) ||
      cleanString(secondary?.landingPage) ||
      cleanString(fallback?.landingPage),
    referrer:
      cleanString(existing?.firstReferrer) ||
      cleanString(primary?.referrer) ||
      cleanString(secondary?.referrer) ||
      cleanString(fallback?.referrer),
  }
}

function lastPopulatedTouchpoint(primary, secondary, fallback) {
  return {
    source:
      normalizeTrafficSource(primary?.source) ||
      normalizeTrafficSource(secondary?.source) ||
      inferSourceFromReferrer(fallback?.referrer),
    medium:
      cleanString(primary?.medium) ||
      cleanString(secondary?.medium) ||
      inferMediumFromReferrer(fallback?.referrer),
    campaign: cleanString(primary?.campaign) || cleanString(secondary?.campaign),
    content: cleanString(primary?.content) || cleanString(secondary?.content),
    term: cleanString(primary?.term) || cleanString(secondary?.term),
    campaignId: cleanString(primary?.campaignId) || cleanString(secondary?.campaignId),
    fbclid: cleanString(primary?.fbclid) || cleanString(secondary?.fbclid),
    igshid: cleanString(primary?.igshid) || cleanString(secondary?.igshid),
    landingPage:
      cleanString(primary?.landingPage) ||
      cleanString(secondary?.landingPage) ||
      cleanString(fallback?.landingPage),
    referrer:
      cleanString(primary?.referrer) ||
      cleanString(secondary?.referrer) ||
      cleanString(fallback?.referrer),
  }
}

function summarizeAnalyticsEvent(event) {
  const items = extractAnalyticsItems(event.data)
  const productVariant = event.data?.productVariant ?? event.data?.product ?? {}
  const collection = event.data?.collection ?? {}
  const searchResult = event.data?.searchResult ?? event.data?.search ?? {}

  return {
    id: event.id,
    name: event.name,
    at: event.timestamp,
    source: event.attribution.last.source || event.attribution.first.source || '',
    medium: event.attribution.last.medium || event.attribution.first.medium || '',
    campaign: event.attribution.last.campaign || event.attribution.first.campaign || '',
    path: event.context.pagePath,
    url: event.context.pageLocation,
    referrer: event.context.referrer,
    title:
      cleanString(productVariant.product?.title) ||
      cleanString(productVariant.title) ||
      cleanString(collection.title) ||
      cleanString(event.context.pageTitle),
    searchQuery:
      cleanString(searchResult.query) ||
      cleanString(event.data?.searchQuery) ||
      cleanString(event.data?.query),
    sourcePixel: event.sourcePixel,
    integration: event.integration,
    trackingParams: event.browserSignals.trackingParams,
    trackingIds: event.browserSignals.persistedTrackingIds,
    cookies: event.browserSignals.cookies,
    consent: event.browserSignals.consent,
    shopifyClientId: event.clientId,
    metaDatasetId: event.integration.metaDatasetId,
    metaBusinessId: event.integration.metaBusinessId,
    facebookPageId: event.integration.facebookPageId,
    instagramHandle: event.integration.instagramHandle,
    dataSharingPreference: event.integration.dataSharingPreference,
    metaClickId: lastMetaTrackingId(event.browserSignals.persistedTrackingIds),
    instagramClickId: lastTrackingId(event.browserSignals.persistedTrackingIds, 'igshid'),
    metaBrowserId: event.browserSignals.cookies._fbp || '',
    metaClickCookie: event.browserSignals.cookies._fbc || '',
    value: extractAnalyticsValue(event.data),
    currency: extractAnalyticsCurrency(event.data),
    orderId: resolveOrderIdFromAnalyticsEvent(event),
    orderName: resolveOrderNameFromAnalyticsEvent(event),
    items,
  }
}

async function syncOrderAttributionMetafields(orderId, session, event) {
  const ownerId = toShopifyGid('Order', orderId)
  if (!ownerId) return

  const attribution = buildOrderAttributionPayload(session, event)
  const metafields = [
    {
      namespace: 'trinity',
      key: 'attribution',
      ownerId,
      type: 'json',
      value: JSON.stringify(attribution),
    },
    orderMetafield(ownerId, 'first_source', attribution.first.source),
    orderMetafield(ownerId, 'first_medium', attribution.first.medium),
    orderMetafield(ownerId, 'first_campaign', attribution.first.campaign),
    orderMetafield(ownerId, 'first_landing_page', attribution.first.landingPage),
    orderMetafield(ownerId, 'last_source', attribution.last.source),
    orderMetafield(ownerId, 'last_medium', attribution.last.medium),
    orderMetafield(ownerId, 'last_campaign', attribution.last.campaign),
    orderMetafield(ownerId, 'last_landing_page', attribution.last.landingPage),
    orderMetafield(ownerId, 'customer_session_id', session.sessionId),
  ].filter((field) => field.value !== undefined && field.value !== null && field.value !== '')

  const result = await shopifyGraphQL(
    `
      mutation SetOrderAttributionMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { metafields },
  )

  const errors = result?.data?.metafieldsSet?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Order attribution sync error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

function buildOrderAttributionPayload(session, event) {
  return {
    capturedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    device: session.device,
    first: {
      source: session.firstSource,
      medium: session.firstMedium,
      campaign: session.firstCampaign,
      content: session.firstContent,
      term: session.firstTerm,
      landingPage: session.firstLandingPage,
      referrer: session.firstReferrer,
    },
    last: {
      source: session.lastSource,
      medium: session.lastMedium,
      campaign: session.lastCampaign,
      content: session.lastContent,
      term: session.lastTerm,
      landingPage: session.lastLandingPage,
      referrer: session.lastReferrer,
    },
    order: {
      id: resolveOrderIdFromAnalyticsEvent(event),
      name: resolveOrderNameFromAnalyticsEvent(event),
      value: extractAnalyticsValue(event.data),
      currency: extractAnalyticsCurrency(event.data),
    },
    metaIntegration: session.integration ?? {},
    tracking: {
      firstMetaClickId: session.firstMetaClickId,
      lastMetaClickId: session.lastMetaClickId,
      firstInstagramClickId: session.firstInstagramClickId,
      lastInstagramClickId: session.lastInstagramClickId,
      lastMetaBrowserId: session.lastMetaBrowserId,
      lastMetaClickCookie: session.lastMetaClickCookie,
      lastShopifyClientId: session.lastShopifyClientId,
      trackingIds: session.trackingIds ?? {},
      browserCookies: session.browserCookies ?? {},
      consent: session.consent ?? {},
    },
    journey: (session.events ?? []).map((item) => ({
      name: item.name,
      at: item.at,
      path: item.path,
      title: item.title,
      searchQuery: item.searchQuery,
      value: item.value,
      orderName: item.orderName,
      items: item.items,
      metaClickId: item.metaClickId,
      instagramClickId: item.instagramClickId,
      metaBrowserId: item.metaBrowserId,
      shopifyClientId: item.shopifyClientId,
    })),
    customerEmailHash: session.customerEmailHash,
  }
}

async function forwardAnalyticsEventToGa4(event, session) {
  if (!ga4MeasurementId || !ga4ApiSecret) return { skipped: true }

  const ga4Event = mapAnalyticsEventToGa4(event, session)
  if (!ga4Event) return { skipped: true }

  const url = new URL('https://www.google-analytics.com/mp/collect')
  url.searchParams.set('measurement_id', ga4MeasurementId)
  url.searchParams.set('api_secret', ga4ApiSecret)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: normalizeGa4ClientId(event.clientId || session.visitorId || session.sessionId),
      timestamp_micros: String(new Date(event.timestamp).getTime() * 1000),
      non_personalized_ads: false,
      events: [ga4Event],
    }),
  })

  if (!response.ok) {
    throw new Error(`GA4 forwarding failed: ${response.status} ${await response.text()}`)
  }

  return { ok: true }
}

function mapAnalyticsEventToGa4(event, session) {
  const eventNameMap = {
    page_viewed: 'page_view',
    collection_viewed: 'view_item_list',
    product_viewed: 'view_item',
    product_added_to_cart: 'add_to_cart',
    cart_viewed: 'view_cart',
    checkout_started: 'begin_checkout',
    checkout_address_info_submitted: 'add_shipping_info',
    checkout_shipping_info_submitted: 'add_shipping_info',
    payment_info_submitted: 'add_payment_info',
    checkout_completed: 'purchase',
    search_submitted: 'search',
    trinity_customizer_started: 'trinity_customizer_started',
    trinity_customizer_option_changed: 'trinity_customizer_option_changed',
    trinity_product_cta_clicked: 'trinity_product_cta_clicked',
    trinity_product_form_submitted: 'trinity_product_form_submitted',
    trinity_product_option_changed: 'trinity_product_option_changed',
  }
  const name = eventNameMap[event.name] ?? event.name.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 40)
  if (!name) return null

  const params = {
    page_location: event.context.pageLocation,
    page_path: event.context.pagePath,
    page_title: event.context.pageTitle,
    source: session.lastSource,
    medium: session.lastMedium,
    campaign: session.lastCampaign,
    content: session.lastContent,
    term: session.lastTerm,
    trinity_session_id: session.sessionId,
    trinity_first_source: session.firstSource,
    trinity_first_medium: session.firstMedium,
    trinity_first_campaign: session.firstCampaign,
    trinity_first_landing_page: session.firstLandingPage,
    trinity_source_pixel: session.integration?.shopifyPixelName,
    trinity_meta_dataset_id: session.metaDatasetId,
    trinity_facebook_page_id: session.facebookPageId,
    trinity_instagram_handle: session.instagramHandle,
    trinity_meta_data_sharing: session.dataSharingPreference,
    search_term: summarizeAnalyticsEvent(event).searchQuery,
    currency: extractAnalyticsCurrency(event.data),
    value: extractAnalyticsValue(event.data),
    transaction_id: resolveOrderNameFromAnalyticsEvent(event) || resolveOrderIdFromAnalyticsEvent(event),
    items: extractAnalyticsItems(event.data),
  }

  return {
    name,
    params: compactGa4Params(params),
  }
}

function compactGa4Params(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false
      if (Array.isArray(value) && value.length === 0) return false
      return true
    }),
  )
}

function extractAnalyticsItems(data = {}) {
  const checkoutLines = data.checkout?.lineItems ?? data.checkout?.lineItems?.nodes
  const cartLines = data.cart?.lines ?? data.cart?.lines?.nodes
  const singleLine = data.cartLine ? [data.cartLine] : []
  const productVariant = data.productVariant ? [data.productVariant] : []
  const sourceLines = Array.isArray(checkoutLines)
    ? checkoutLines
    : Array.isArray(cartLines)
      ? cartLines
      : singleLine.length > 0
        ? singleLine
        : productVariant

  return sourceLines.slice(0, 100).map((line, index) => {
    const merchandise = line.merchandise ?? line.variant ?? line
    const product = merchandise.product ?? line.product ?? {}
    const price = line.cost?.totalAmount ?? line.cost?.amountPerQuantity ?? merchandise.price ?? {}
    return compactGa4Params({
      item_id: cleanString(merchandise.sku || merchandise.id || product.id || line.id),
      item_name: cleanString(product.title || merchandise.product?.title || merchandise.title || line.title),
      item_variant: cleanString(merchandise.title || line.variantTitle || line.variant?.title),
      item_category: cleanString(product.type || product.productType || data.collection?.title),
      price: toFiniteNumber(price.amount ?? line.price ?? merchandise.price),
      quantity: toFiniteNumber(line.quantity) || 1,
      index,
    })
  })
}

function extractAnalyticsValue(data = {}) {
  return (
    toFiniteNumber(data.checkout?.totalPrice?.amount) ??
    toFiniteNumber(data.checkout?.subtotalPrice?.amount) ??
    toFiniteNumber(data.cart?.cost?.totalAmount?.amount) ??
    toFiniteNumber(data.cartLine?.cost?.totalAmount?.amount) ??
    null
  )
}

function extractAnalyticsCurrency(data = {}) {
  return (
    cleanString(data.checkout?.currencyCode) ||
    cleanString(data.checkout?.totalPrice?.currencyCode) ||
    cleanString(data.cart?.cost?.totalAmount?.currencyCode) ||
    cleanString(data.cartLine?.cost?.totalAmount?.currencyCode) ||
    shopCurrencyCode
  )
}

function resolveOrderIdFromAnalyticsEvent(event) {
  return (
    cleanString(event.data?.checkout?.order?.id) ||
    cleanString(event.data?.checkout?.orderId) ||
    cleanString(event.data?.order?.id)
  )
}

function resolveOrderNameFromAnalyticsEvent(event) {
  return (
    cleanString(event.data?.checkout?.order?.name) ||
    cleanString(event.data?.checkout?.order?.orderNumber) ||
    cleanString(event.data?.order?.name)
  )
}

function extractEmailFromAnalyticsEvent(event) {
  return (
    cleanString(event.customer?.email) ||
    cleanString(event.data?.checkout?.email) ||
    cleanString(event.data?.checkout?.customer?.email) ||
    ''
  )
}

function hashEmail(email) {
  const normalized = cleanString(email).toLowerCase()
  if (!normalized) return ''
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function normalizeIsoDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function pathFromUrl(value) {
  try {
    if (!value) return ''
    return new URL(value).pathname
  } catch {
    return cleanString(value).split('?')[0]
  }
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

function normalizeTrafficSource(value) {
  const source = cleanString(value).toLowerCase()
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
  if (['x', 'twitter', 'twitter.com', 't.co'].includes(source)) return 'x'
  return source
}

function mergeIntegrationSnapshots(...snapshots) {
  const merged = {}

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value) && value.length === 0) continue
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        continue
      }
      merged[key] = value
    }
  }

  return compactObject(merged)
}

function mergeTrackingIdMaps(...maps) {
  const merged = {}

  for (const map of maps) {
    if (!map || typeof map !== 'object') continue

    for (const [key, raw] of Object.entries(map)) {
      if (!raw || typeof raw !== 'object') continue
      const normalizedKey = cleanString(key)
      const current = merged[normalizedKey] ?? {}
      const next = normalizeTrackingIdMap({ [normalizedKey]: raw })[normalizedKey]
      if (!normalizedKey || !next) continue

      merged[normalizedKey] = compactObject({
        first: current.first || next.first,
        firstCapturedAt: current.firstCapturedAt || next.firstCapturedAt,
        last: next.last || current.last,
        lastCapturedAt: next.lastCapturedAt || current.lastCapturedAt,
      })
    }
  }

  return merged
}

function trackingIdsFromParams(params, timestamp) {
  const ids = {}
  const capturedAt = normalizeIsoDate(timestamp) || new Date().toISOString()

  for (const [key, value] of Object.entries(params ?? {})) {
    const cleaned = cleanString(value).slice(0, 256)
    if (!cleaned) continue
    ids[key] = {
      first: cleaned,
      firstCapturedAt: capturedAt,
      last: cleaned,
      lastCapturedAt: capturedAt,
    }
  }

  return ids
}

function firstTrackingId(trackingIds, key) {
  return cleanString(trackingIds?.[key]?.first)
}

function lastTrackingId(trackingIds, key) {
  return cleanString(trackingIds?.[key]?.last)
}

function firstMetaTrackingId(trackingIds) {
  return firstTrackingId(trackingIds, 'fbclid') || firstTrackingId(trackingIds, 'igshid')
}

function lastMetaTrackingId(trackingIds) {
  return lastTrackingId(trackingIds, 'fbclid') || lastTrackingId(trackingIds, 'igshid')
}

function inferMediumFromReferrer(referrer) {
  const host = hostnameFromUrl(referrer)
  if (!host) return 'direct'
  if (/(instagram|facebook|tiktok|pinterest|x\.com|twitter)/i.test(host)) return 'social'
  if (/(google|bing|duckduckgo|yahoo)/i.test(host)) return 'organic'
  return 'referral'
}

function hostnameFromUrl(value) {
  try {
    if (!value) return ''
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function inferDevice(userAgent) {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet'
  if (/mobile|iphone|android/i.test(userAgent)) return 'mobile'
  return userAgent ? 'desktop' : ''
}

function normalizeGa4ClientId(value) {
  const cleaned = cleanString(value)
  if (!cleaned) return createPlainId('ga4')
  return cleaned.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 128) || createPlainId('ga4')
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toNullableBoolean(value) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
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

function orderMetafield(ownerId, key, value) {
  return {
    namespace: 'trinity',
    key,
    ownerId,
    type: 'single_line_text_field',
    value: value === undefined || value === null ? '' : String(value),
  }
}

function toShopifyGid(type, value) {
  if (!value) return ''
  const stringValue = String(value)
  if (stringValue.startsWith('gid://')) return stringValue
  return `gid://shopify/${type}/${extractNumericId(stringValue)}`
}

function extractNumericId(value) {
  const match = String(value ?? '').match(/(\d+)$/)
  return match?.[1] ?? String(value ?? '')
}

function createPlainId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanString(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function sanitizeHandle(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64)
}

function typeMatches(actualType, configuredType) {
  if (actualType === configuredType) return true
  if (!configuredType.startsWith('$app:')) return false
  const suffix = configuredType.replace('$app:', '')
  return actualType.endsWith(`--${suffix}`)
}

function definitionField(key, name, type) {
  return { key, name, type }
}

function fieldValue(key, value) {
  if (value === undefined || value === null || value === '') return null
  return { key, value: String(value) }
}
