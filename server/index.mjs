import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import crypto from 'node:crypto'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envPath =
  process.env.SHOPIFY_ENV_FILE ?? path.join(rootDir, '.env.shopify-custom-app.local')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const requiredEnv = ['SHOPIFY_SHOP', 'SHOPIFY_ADMIN_ACCESS_TOKEN']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing ${key}. Shopify sync endpoints will be unavailable.`)
  }
}

const app = express()
app.set('trust proxy', 1)
const port = Number(process.env.PORT ?? 4177)
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const shopifyApiKey = process.env.SHOPIFY_API_KEY ?? ''
const shopifyApiSecret = process.env.SHOPIFY_API_SECRET ?? process.env.SHOPIFY_WEBHOOK_SECRET ?? ''
const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? shopifyApiSecret
const shopCurrencyCode = process.env.SHOPIFY_CURRENCY_CODE ?? 'USD'
const draftInvoiceHost =
  normalizeHostname(process.env.TRINITY_DRAFT_INVOICE_HOST) || normalizeHostname(shopDomain)
const defaultShippingSpeed = 'standard'
const draftOrderShippingOptions = {
  standard: {
    key: 'standard',
    label: 'Standard',
    title:
      cleanString(
        process.env.TRINITY_DRAFT_SHIPPING_STANDARD_TITLE ??
          process.env.TRINITY_DRAFT_SHIPPING_TITLE,
      ) || 'Standard Shipping',
    amount: normalizePositiveMoneyAmount(
      process.env.TRINITY_DRAFT_SHIPPING_STANDARD_AMOUNT ??
        process.env.TRINITY_DRAFT_SHIPPING_AMOUNT ??
        '15.00',
    ),
  },
  fast: {
    key: 'fast',
    label: 'Fast',
    title: cleanString(process.env.TRINITY_DRAFT_SHIPPING_FAST_TITLE) || 'Fast Shipping',
    amount: normalizePositiveMoneyAmount(
      process.env.TRINITY_DRAFT_SHIPPING_FAST_AMOUNT ?? '50.00',
    ),
  },
  really_fast: {
    key: 'really_fast',
    label: 'Really fast',
    title:
      cleanString(process.env.TRINITY_DRAFT_SHIPPING_REALLY_FAST_TITLE) ||
      'Really Fast Shipping',
    amount: normalizePositiveMoneyAmount(
      process.env.TRINITY_DRAFT_SHIPPING_REALLY_FAST_AMOUNT ?? '75.00',
    ),
  },
  comped: {
    key: 'comped',
    label: 'Comped',
    title: cleanString(process.env.TRINITY_DRAFT_SHIPPING_COMPED_TITLE) || 'Comped Shipping',
    amount: normalizeNonNegativeMoneyAmount(
      process.env.TRINITY_DRAFT_SHIPPING_COMPED_AMOUNT ?? '0.00',
    ),
  },
}
const rushProductionSurchargeTitle =
  cleanString(process.env.TRINITY_RUSH_PRODUCTION_TITLE) || 'Rush Production Surcharge'
const rushProductionSurchargeAmount = normalizePositiveMoneyAmount(
  process.env.TRINITY_RUSH_PRODUCTION_AMOUNT ?? '50.00',
)
const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID ?? ''
const ga4ApiSecret = process.env.GA4_API_SECRET ?? ''
const internalSessionCookieName = 'trinity_internal_session'
const internalSessionMaxAgeDays = 90
const internalSessionMaxAgeMs = internalSessionMaxAgeDays * 24 * 60 * 60 * 1000
const invoiceSendTokenMaxAgeMs = 24 * 60 * 60 * 1000
const internalSessionSecret =
  process.env.TRINITY_INTERNAL_SESSION_SECRET ?? shopifyApiSecret ?? adminToken ?? ''
const standaloneInternalAccessQueryParam = 'access'
const embeddedAnalyticsCollectorEnabled =
  process.env.ENABLE_EMBEDDED_ANALYTICS_COLLECTOR === 'true'
const metaobjectsPageSize = readPositiveIntegerEnv('TRINITY_METAOBJECTS_PAGE_SIZE', 50)
const stateCacheTtlMs = 60 * 60 * 1000
const stateCacheStaleMaxAgeMs = 24 * 60 * 60 * 1000
const stateCacheFilePath =
  process.env.TRINITY_STATE_CACHE_PATH ?? path.join('/tmp', 'trinity-inventory-state-cache.json')
const catalogCacheTtlMs = 10 * 60 * 1000
const shopifyGraphqlMaxAttempts = readPositiveIntegerEnv('TRINITY_SHOPIFY_GRAPHQL_MAX_ATTEMPTS', 20)
const billetDiameterWeightCorrectionOz = 1.75
const oversizedBilletDiameterSources = new Set(["RJ's Tree Farms", 'Cahan'])
const billetSourceOptions = new Set(["RJ's Tree Farms", 'Great Lakes Veneer', 'Champeau', 'Cahan'])
const billetSpeciesOptions = new Set(['Maple', 'Birch', 'Ash'])
const defaultInternalOrderNotificationEmails = [
  'matt@trinitybats.com',
  'jeremy@trinitybats.com',
  'stefan@trinitybats.com',
  'keith@trinitybats.com',
]
const requiredInternalOrderNotificationEmails = ['matt@trinitybats.com']
const internalOrderNotificationEmails = parseEmailList(
  process.env.TRINITY_ORDER_NOTIFICATION_EMAILS ??
    process.env.SHOPIFY_STAFF_NOTIFICATION_BCC ??
    '',
  defaultInternalOrderNotificationEmails,
  requiredInternalOrderNotificationEmails,
)

const resourceConfigs = {
  billets: {
    type: '$app:trinity_billet',
    name: 'Trinity Billet',
    deleteMissing: false,
    labelFor(item) {
      return `${item.barcode || item.id} ${item.species || ''} ${item.grade || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('barcode', item.barcode),
        fieldValue('species', item.species),
        fieldValue('grade', item.grade),
        fieldValue('trophy_eligible', toBooleanValue(item.trophyEligible)),
        fieldValue('mlb_eligible', toBooleanValue(item.mlbEligible)),
        fieldValue('has_barrel_knot', toLegacyBarrelKnotValue(item.hasBarrelKnot)),
        fieldValue('barrel_knot_status', item.hasBarrelKnot),
        fieldValue('source', item.source),
        fieldValue('delivery_date', item.deliveryDate),
        fieldValue('length', toNumericValue(item.length)),
        fieldValue('weight', item.weight === '' ? null : toNumericValue(item.weight)),
        fieldValue('moisture', toNumericValue(item.moisture)),
        fieldValue('status', item.status),
        fieldValue('location', item.location),
        fieldValue('notes', item.notes),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('barcode', 'Barcode', 'single_line_text_field'),
      definitionField('species', 'Species', 'single_line_text_field'),
      definitionField('grade', 'Grade', 'single_line_text_field'),
      definitionField('trophy_eligible', 'Trophy Eligible', 'boolean'),
      definitionField('mlb_eligible', 'MLB Eligible', 'boolean'),
      definitionField('has_barrel_knot', 'Barrel Knot', 'boolean'),
      definitionField('barrel_knot_status', 'Barrel Knot Status', 'single_line_text_field'),
      definitionField('source', 'Source', 'single_line_text_field'),
      definitionField('delivery_date', 'Delivery Date', 'single_line_text_field'),
      definitionField('length', 'Length', 'number_decimal'),
      definitionField('weight', 'Weight', 'number_decimal'),
      definitionField('moisture', 'Moisture', 'number_decimal'),
      definitionField('status', 'Status', 'single_line_text_field'),
      definitionField('location', 'Location', 'single_line_text_field'),
      definitionField('notes', 'Notes', 'multi_line_text_field'),
    ],
  },
  players: {
    type: '$app:trinity_player_profile',
    name: 'Trinity Player Profile',
    deleteMissing: false,
    labelFor(item) {
      return `${item.profileKind || 'Profile'} ${item.playerName || item.id}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('profile_kind', item.profileKind),
        fieldValue('player_name', item.playerName),
        fieldValue('bats_json', JSON.stringify(item.bats ?? [])),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('profile_kind', 'Profile Kind', 'single_line_text_field'),
      definitionField('player_name', 'Pro Player Name', 'single_line_text_field'),
      definitionField('bats_json', 'Bats JSON', 'json'),
    ],
  },
  producedBats: {
    type: '$app:trinity_produced_bat',
    name: 'Trinity Produced Bat',
    deleteMissing: false,
    labelFor(item) {
      return `${item.modelId || item.id} ${item.length || ''} ${item.weight || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('model_id', item.modelId),
        fieldValue('bat_type', item.batType),
        fieldValue('custom_model_name', item.customModelName),
        fieldValue('source_model_id', item.sourceModelId),
        fieldValue('source_billet_statuses_json', JSON.stringify(item.sourceBilletStatuses ?? {})),
        fieldValue('shopify_product_id', item.shopifyProductId),
        fieldValue('shopify_variant_id', item.shopifyVariantId),
        fieldValue('length', item.length),
        fieldValue('weight', item.weight),
        fieldValue('billet_weight', item.billetWeight),
        fieldValue('billet_grade', item.billetGrade),
        fieldValue('billet_ids_json', JSON.stringify(item.billetIds ?? [])),
        fieldValue('cupped', item.cupped),
        fieldValue('modifications', item.modifications),
        fieldValue('created_at', item.createdAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('model_id', 'Model ID', 'single_line_text_field'),
      definitionField('bat_type', 'Bat Type', 'single_line_text_field'),
      definitionField('custom_model_name', 'Custom Model Name', 'single_line_text_field'),
      definitionField('source_model_id', 'Source Model ID', 'single_line_text_field'),
      definitionField('source_billet_statuses_json', 'Source Billet Statuses JSON', 'json'),
      definitionField('shopify_product_id', 'Shopify Product ID', 'single_line_text_field'),
      definitionField('shopify_variant_id', 'Shopify Variant ID', 'single_line_text_field'),
      definitionField('length', 'Length', 'single_line_text_field'),
      definitionField('weight', 'Weight', 'single_line_text_field'),
      definitionField('billet_weight', 'Billet Weight', 'single_line_text_field'),
      definitionField('billet_grade', 'Billet Grade', 'single_line_text_field'),
      definitionField('billet_ids_json', 'Billet IDs JSON', 'json'),
      definitionField('cupped', 'Cupped', 'single_line_text_field'),
      definitionField('modifications', 'Modifications', 'multi_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
    ],
  },
  orderJobs: {
    type: '$app:trinity_order_job',
    name: 'Trinity Order Job',
    deleteMissing: false,
    labelFor(item) {
      return `${item.shopifyOrderName || item.shopifyDraftOrderName || item.id} ${
        item.productTitle || ''
      }`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('origin', item.origin),
        fieldValue('shopify_order_id', item.shopifyOrderId),
        fieldValue('shopify_order_name', item.shopifyOrderName),
        fieldValue('shopify_draft_order_id', item.shopifyDraftOrderId),
        fieldValue('shopify_draft_order_name', item.shopifyDraftOrderName),
        fieldValue('shopify_draft_invoice_url', item.shopifyDraftInvoiceUrl),
        fieldValue('line_item_id', item.lineItemId),
        fieldValue('order_submitted_at', item.orderSubmittedAt),
        fieldValue('customer_name', item.customerName),
        fieldValue('customer_email', item.customerEmail),
        fieldValue('player_name', item.playerName),
        fieldValue('player_email', item.playerEmail),
        fieldValue('billing_different', item.billingDifferent ? 'true' : ''),
        fieldValue('billing_name', item.billingName),
        fieldValue('billing_email', item.billingEmail),
        fieldValue('billing_phone', item.billingPhone),
        fieldValue('billing_company', item.billingCompany),
        fieldValue('billing_relationship', item.billingRelationship),
        fieldValue('product_title', item.productTitle),
        fieldValue('variant_title', item.variantTitle),
        fieldValue('quantity', item.quantity),
        fieldValue('financial_status', item.financialStatus),
        fieldValue('fulfillment_status', item.fulfillmentStatus),
        fieldValue('invoice_status', item.invoiceStatus),
        fieldValue('production_status', item.productionStatus),
        fieldValue('assigned_billet_id', item.assignedBilletId),
        fieldValue('sales_rep', item.salesRep),
        fieldValue('sales_rep_email', item.salesRepEmail),
        fieldValue(
          'sales_rep_submission_notification_sent_at',
          item.salesRepSubmissionNotificationSentAt,
        ),
        fieldValue('sales_rep_paid_notification_sent_at', item.salesRepPaidNotificationSentAt),
        fieldValue('total_price', item.totalPrice),
        fieldValue('specs_json', JSON.stringify(item.specs ?? {})),
        fieldValue('line_items_json', JSON.stringify(item.lineItems ?? [])),
        fieldValue('internal_notes', item.internalNotes),
        fieldValue('created_at', item.createdAt),
        fieldValue('updated_at', item.updatedAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('origin', 'Origin', 'single_line_text_field'),
      definitionField('shopify_order_id', 'Shopify Order ID', 'single_line_text_field'),
      definitionField('shopify_order_name', 'Shopify Order Name', 'single_line_text_field'),
      definitionField('shopify_draft_order_id', 'Shopify Draft Order ID', 'single_line_text_field'),
      definitionField('shopify_draft_order_name', 'Shopify Draft Order Name', 'single_line_text_field'),
      definitionField(
        'shopify_draft_invoice_url',
        'Shopify Draft Invoice URL',
        'single_line_text_field',
      ),
      definitionField('line_item_id', 'Line Item ID', 'single_line_text_field'),
      definitionField('order_submitted_at', 'Order Submitted At', 'single_line_text_field'),
      definitionField('customer_name', 'Customer Name', 'single_line_text_field'),
      definitionField('customer_email', 'Customer Email', 'single_line_text_field'),
      definitionField('player_name', 'Player Name', 'single_line_text_field'),
      definitionField('player_email', 'Player Email', 'single_line_text_field'),
      definitionField('billing_different', 'Billing Different', 'single_line_text_field'),
      definitionField('billing_name', 'Billing Name', 'single_line_text_field'),
      definitionField('billing_email', 'Billing Email', 'single_line_text_field'),
      definitionField('billing_phone', 'Billing Phone', 'single_line_text_field'),
      definitionField('billing_company', 'Billing Company', 'single_line_text_field'),
      definitionField('billing_relationship', 'Billing Relationship', 'single_line_text_field'),
      definitionField('product_title', 'Product Title', 'single_line_text_field'),
      definitionField('variant_title', 'Variant Title', 'single_line_text_field'),
      definitionField('quantity', 'Quantity', 'number_integer'),
      definitionField('financial_status', 'Financial Status', 'single_line_text_field'),
      definitionField('fulfillment_status', 'Fulfillment Status', 'single_line_text_field'),
      definitionField('invoice_status', 'Invoice Status', 'single_line_text_field'),
      definitionField('production_status', 'Production Status', 'single_line_text_field'),
      definitionField('assigned_billet_id', 'Assigned Billet ID', 'single_line_text_field'),
      definitionField('sales_rep', 'Sales Rep', 'single_line_text_field'),
      definitionField('sales_rep_email', 'Sales Rep Email', 'single_line_text_field'),
      definitionField(
        'sales_rep_submission_notification_sent_at',
        'Sales Rep Submission Notification Sent At',
        'single_line_text_field',
      ),
      definitionField(
        'sales_rep_paid_notification_sent_at',
        'Sales Rep Paid Notification Sent At',
        'single_line_text_field',
      ),
      definitionField('total_price', 'Total Price', 'single_line_text_field'),
      definitionField('specs_json', 'Specs JSON', 'json'),
      definitionField('line_items_json', 'Line Items JSON', 'json'),
      definitionField('internal_notes', 'Internal Notes', 'multi_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
    ],
  },
  customBatModels: {
    type: '$app:trinity_bat_model',
    name: 'Trinity Bat Model',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.id}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('name', item.name),
        fieldValue('category', item.category),
        fieldValue('url', item.url),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('category', 'Category', 'single_line_text_field'),
      definitionField('url', 'URL', 'single_line_text_field'),
    ],
  },
  billingContacts: {
    type: '$app:trinity_billing_contact',
    name: 'Trinity Billing Contact',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.id} ${item.company || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('name', item.name),
        fieldValue('email', item.email),
        fieldValue('phone', item.phone),
        fieldValue('company', item.company),
        fieldValue('relationship', item.relationship),
        fieldValue('notes', item.notes),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('email', 'Email', 'single_line_text_field'),
      definitionField('phone', 'Phone', 'single_line_text_field'),
      definitionField('company', 'Company', 'single_line_text_field'),
      definitionField('relationship', 'Relationship', 'single_line_text_field'),
      definitionField('notes', 'Notes', 'multi_line_text_field'),
    ],
  },
  customerSessions: {
    type: '$app:trinity_customer_session',
    name: 'Trinity Customer Session',
    deleteMissing: false,
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
      definitionField('order_name', 'Order Name', 'single_line_text_field'),
      definitionField('customer_email_hash', 'Customer Email Hash', 'single_line_text_field'),
      definitionField('events_json', 'Events JSON', 'json'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
    ],
  },
}

let definitionPromise = null
let stateCacheValue = null
let stateCacheExpiresAt = 0
let stateCachePromise = null
let catalogCacheValue = null
let catalogCacheExpiresAt = 0
let catalogCachePromise = null
let stateWriteQueue = Promise.resolve()

app.post('/api/webhooks/orders', express.raw({ type: 'application/json' }), async (request, response) => {
  try {
    if (!verifyShopifyWebhook(request)) {
      response.status(401).send('Invalid webhook signature')
      return
    }

    if (!shopDomain || !adminToken) {
      response.status(503).send('Shopify credentials are not configured')
      return
    }

    const topic = String(request.get('x-shopify-topic') ?? '')
    const payload = JSON.parse(request.body.toString('utf8'))
    const incomingJobs = mapOrderWebhookToJobs(payload, topic)

    if (incomingJobs.length > 0) {
      await ensureDefinitions()
      const existingJobs = await listRecords(resourceConfigs.orderJobs)
      const mergedJobs = incomingJobs.map((job) =>
        mergeOrderJob(
          findMatchingOrderJob(existingJobs, job),
          job,
        ),
      )
      const paidNotification = await trySendSalesRepPaidNotification({
        order: payload,
        topic,
        jobs: mergedJobs,
        existingJobs,
      })
      const jobsToSave = paidNotification.sentAt
        ? mergedJobs.map((job) =>
            shouldMarkSalesRepPaidNotification(job)
              ? {
                  ...job,
                  salesRepPaidNotificationSentAt: paidNotification.sentAt,
                }
              : job,
          )
        : mergedJobs
      await Promise.all([
        Promise.all(jobsToSave.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
        rememberOrderJobContacts(jobsToSave),
      ])
    }

    response.status(200).json({ ok: true, jobs: incomingJobs.length })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify webhook error.',
    })
  }
})

app.use(express.json({ limit: '5mb' }))
app.use(establishInternalSession)

app.options('/api/analytics/events', (request, response) => {
  setAnalyticsCorsHeaders(response)
  response.status(204).send()
})

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: Boolean(shopDomain && adminToken),
    service: 'trinity-billet-inventory',
    shop: shopDomain ?? null,
    apiVersion,
    analytics: {
      embeddedCollector: embeddedAnalyticsCollectorEnabled,
      ga4Forwarding: Boolean(ga4MeasurementId && ga4ApiSecret),
    },
  })
})

app.post('/api/analytics/events', async (request, response) => {
  setAnalyticsCorsHeaders(response)

  try {
    if (!embeddedAnalyticsCollectorEnabled) {
      response.status(404).json({
        ok: false,
        message: 'Analytics collection is handled by the separate Trinity analytics service.',
      })
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

app.get('/api/internal-session', requireInternalAccess, (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.json({ ok: true })
})

app.get('/api/state', requireInternalAccess, async (_request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    response.json(await getSharedState())
  } catch (error) {
    const fallback = getStateCacheFallback()
    if (fallback) {
      response.set('X-Trinity-State-Cache', 'stale-fallback')
      response.json(fallback)
      return
    }

    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
    })
  }
})

app.get('/api/billets/game-model-matches', requireInternalAccess, async (request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const source = cleanString(request.query?.source)
    const species = cleanString(request.query?.species)
    const idealBilletWeight = cleanString(request.query?.idealBilletWeight)
    const state = await getSharedState()
    const billets = getGameModelBilletMatches(state.billets, {
      source,
      species,
      idealBilletWeight,
    })

    response.json({
      ok: true,
      source,
      species,
      idealBilletWeight,
      toleranceOz: 0.5,
      diameterCorrectionOz: billetDiameterWeightCorrectionOz,
      count: billets.length,
      billets,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message:
        error instanceof Error ? error.message : 'Unknown game model billet match error.',
    })
  }
})

app.get('/api/catalog', async (_request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const { products, cacheStatus } = await getCatalogProducts()
    response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
    response.set('X-Trinity-Catalog-Cache', cacheStatus)
    response.json({ ok: true, products })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify catalog error.',
    })
  }
})

app.put('/api/state', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const payload = request.body ?? {}
    const result = await enqueueStateWrite(async () => {
      await ensureDefinitions()

      const currentState = await getSharedState()
      const nextPlayers = mergeRecordsByKey(
        currentState.players,
        arrayFromPayload(payload.players),
        (item) => item.id || `${item.profileKind}:${item.playerName}`,
      )
      const nextProducedBats = mergeRecordsByKey(
        currentState.producedBats,
        arrayFromPayload(payload.producedBats),
        (item) => item.id || item.createdAt,
      )
      const nextCustomBatModels = mergeRecordsByKey(
        currentState.customBatModels,
        arrayFromPayload(payload.customBatModels),
        (item) => item.id,
      )
      const nextOrderJobs = mergeRecordsByKey(
        currentState.orderJobs,
        arrayFromPayload(payload.orderJobs),
        (item) => item.id,
      )
      const nextBillingContacts = mergeRecordsByKey(
        currentState.billingContacts,
        arrayFromPayload(payload.billingContacts),
        (item) => item.id,
      )
      const nextBillets = reconcileBilletProductionStatuses(
        mergeRecordsByKey(
          currentState.billets,
          arrayFromPayload(payload.billets),
          (item) => item.barcode || item.id,
        ),
        nextProducedBats,
      )
      const nextState = {
        ok: true,
        billets: nextBillets,
        players: nextPlayers,
        producedBats: nextProducedBats,
        customBatModels: nextCustomBatModels,
        orderJobs: nextOrderJobs,
        billingContacts: nextBillingContacts,
      }
      const patch = buildStatePatchFromStates(currentState, nextState)
      const applied = await applyStatePatch(patch, { ensureDefinitions: false })

      primeStateCache(nextState)
      return applied
    })

    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      mode: 'full-compat-diff',
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
    })
  }
})

app.patch('/api/state', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const result = await enqueueStateWrite(() => applyStatePatch(request.body ?? {}))
    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      mode: 'delta',
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify delta sync error.',
    })
  }
})

app.post('/api/sales-orders', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const payload = request.body ?? {}
    const validationMessage = validateSalesOrderPayload(payload)
    if (validationMessage) {
      response.status(400).json({
        ok: false,
        message: validationMessage,
      })
      return
    }

    const intakeId = createPlainId('sales')
    const orderSubmittedAt = new Date().toISOString()
    const shouldCreateDraftOrder = payload.createDraftOrder !== false
    const isZeroDollarOrder = isZeroDollarSalesOrder(payload)

    await ensureDefinitions()
    if (shouldCreateDraftOrder) {
      const draftInput = buildDraftOrderInput(payload, intakeId, orderSubmittedAt)
      const draftOrder = await createDraftOrder(draftInput)
      const salesRepSubmissionNotification = await trySendSalesRepDraftSubmissionNotification(
        draftOrder,
        payload,
      )
      const jobs = mapDraftOrderToJobs(draftOrder, payload, intakeId, false, orderSubmittedAt).map(
        (job) =>
          salesRepSubmissionNotification.sentAt
            ? {
                ...job,
                salesRepSubmissionNotificationSentAt: salesRepSubmissionNotification.sentAt,
              }
            : job,
      )
      const [rememberedContacts] = await Promise.all([
        rememberOrderJobContacts(jobs),
        Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
      ])
      await syncOrderJobMetafields(jobs)

      response.json({
        ok: true,
        draftOrder,
        invoiceSendToken: createDraftInvoiceSendToken(draftOrder, intakeId),
        invoiceSendTokenExpiresAt: new Date(Date.now() + invoiceSendTokenMaxAgeMs).toISOString(),
        invoiceSent: false,
        emailNotificationMethod: 'none',
        draftInvoiceReadyForReview: Boolean(draftOrder?.invoiceUrl),
        internalNotificationRecipients: salesRepSubmissionNotification.recipients,
        salesRepSubmissionNotificationSent: Boolean(salesRepSubmissionNotification.sentAt),
        salesRepSubmissionNotificationError: salesRepSubmissionNotification.error,
        staffNotificationFlow: 'shopify_draft_order_review',
        orderJobs: jobs,
        players: rememberedContacts.players,
        billingContacts: rememberedContacts.billingContacts,
      })
      return
    }

    const shouldSendInvoice = payload.sendInvoice !== false || isZeroDollarOrder
    const orderInput = buildOrderCreateInput(payload, intakeId, orderSubmittedAt)
    const order = await createPendingOrder(orderInput, {
      sendReceipt: shouldSendInvoice && isZeroDollarOrder,
    })

    let invoiceSent = shouldSendInvoice && isZeroDollarOrder
    if (shouldSendInvoice && !isZeroDollarOrder && order?.id) {
      await sendOrderInvoice(order.id, buildOrderInvoiceEmailInput(payload, order))
      invoiceSent = true
    }

    const jobs = mapCreatedOrderToJobs(order, payload, intakeId, invoiceSent, orderSubmittedAt)
    const [rememberedContacts] = await Promise.all([
      rememberOrderJobContacts(jobs),
      Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
    ])
    await syncOrderJobMetafields(jobs)

    response.json({
      ok: true,
      order,
      invoiceSent,
      zeroDollarDocumentationInvoice: isZeroDollarOrder,
      emailNotificationMethod: shouldSendInvoice
        ? isZeroDollarOrder
          ? 'order_receipt'
          : 'order_invoice'
        : 'none',
      internalNotificationRecipients: internalOrderNotificationEmails,
      staffNotificationFlow: 'shopify_new_order',
      orderJobs: jobs,
      players: rememberedContacts.players,
      billingContacts: rememberedContacts.billingContacts,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify draft order error.',
    })
  }
})

app.post('/api/sales-orders/send-draft-invoice', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const token = cleanString(request.body?.invoiceSendToken)
    const tokenPayload = verifyDraftInvoiceSendToken(token)
    if (!tokenPayload?.draftOrderId || !tokenPayload?.intakeId) {
      response.status(401).json({
        ok: false,
        message: 'This invoice send link is invalid or expired.',
      })
      return
    }

    await ensureDefinitions()
    const matchingJobs = await markDraftInvoiceSent({
      draftOrderId: tokenPayload.draftOrderId,
      intakeId: tokenPayload.intakeId,
      sendInvoice: true,
    })

    response.json({
      ok: true,
      invoiceSent: true,
      emailNotificationMethod: 'order_invoice',
      draftOrder: {
        id: tokenPayload.draftOrderId,
        name: matchingJobs[0]?.shopifyDraftOrderName ?? '',
        invoiceUrl: normalizeDraftInvoiceUrl(matchingJobs[0]?.shopifyDraftInvoiceUrl),
      },
      orderJobs: matchingJobs,
    })
  } catch (error) {
    const status = isMissingDraftInvoiceError(error) ? 404 : 500
    response.status(status).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown invoice send error.',
    })
  }
})

app.post('/api/draft-orders/send-invoice', requireInternalAccess, async (request, response) => {
  try {
    const draftOrderId = request.body?.draftOrderId
    if (!draftOrderId) {
      response.status(400).json({ ok: false, message: 'draftOrderId is required.' })
      return
    }

    const orderJobs = await markDraftInvoiceSent({ draftOrderId, sendInvoice: true })
    response.json({ ok: true, orderJobs })
  } catch (error) {
    const status = isMissingDraftInvoiceError(error) ? 404 : 500
    response.status(status).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown invoice send error.',
    })
  }
})

app.post('/api/orders/import', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const first = Math.min(Math.max(Number(request.body?.first ?? 50), 1), 100)
    await ensureDefinitions()
    const orders = await listRecentOrders(first)
    const existingJobs = await listRecords(resourceConfigs.orderJobs)
    const jobs = orders.flatMap((order) => mapGraphQLOrderToJobs(order))
    const mergedJobs = jobs.map((job) => mergeOrderJob(findMatchingOrderJob(existingJobs, job), job))

    const [rememberedContacts] = await Promise.all([
      rememberOrderJobContacts(mergedJobs),
      Promise.all(mergedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
    ])

    response.json({
      ok: true,
      importedOrders: orders.length,
      orderJobs: mergedJobs,
      players: rememberedContacts.players,
      billingContacts: rememberedContacts.billingContacts,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify order import error.',
    })
  }
})

app.post('/api/webhooks/register', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const baseUrl = resolvePublicBaseUrl(request, request.body?.baseUrl)
    if (!baseUrl) {
      response.status(400).json({
        ok: false,
        message: 'Set SHOPIFY_APP_URL or APP_URL before registering webhooks.',
      })
      return
    }

    const uri = `${baseUrl.replace(/\/$/, '')}/api/webhooks/orders`
    const topics = ['ORDERS_CREATE', 'ORDERS_PAID', 'ORDERS_UPDATED', 'ORDERS_CANCELLED']
    const subscriptions = await Promise.all(topics.map((topic) => registerWebhook(topic, uri)))

    response.json({
      ok: true,
      uri,
      subscriptions,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown webhook registration error.',
    })
  }
})

app.use(
  express.static(path.join(rootDir, 'dist'), {
    setHeaders(response, filePath) {
      if (filePath.endsWith('index.html')) {
        response.setHeader('Cache-Control', 'no-store')
      }
    },
  }),
)

app.get('/{*path}', (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.sendFile(path.join(rootDir, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Trinity billet server listening on http://127.0.0.1:${port}`)
})

function establishInternalSession(request, response, next) {
  const hasStandaloneAccess = hasValidStandaloneInternalAccess(request)
  const hasTrustedEmbeddedContext = hasTrustedEmbeddedShopifyContext(request)
  const hasCryptographicallyVerifiedLaunch = hasValidShopifyLaunch(request)
  const isNavigationRequest = isHtmlNavigationRequest(request)

  if (
    isNavigationRequest &&
    hasTrustedEmbeddedContext &&
    !hasStandaloneAccess &&
    !hasValidInternalSession(request)
  ) {
    const fallbackToken = createStandaloneInternalAccessToken()
    if (fallbackToken) {
      const redirectUrl = new URL(request.originalUrl, getRequestOrigin(request))
      redirectUrl.searchParams.set(standaloneInternalAccessQueryParam, fallbackToken)
      response.redirect(302, `${redirectUrl.pathname}${redirectUrl.search}`)
      return
    }
  }

  if (
    isNavigationRequest &&
    (hasCryptographicallyVerifiedLaunch || hasTrustedEmbeddedContext || hasStandaloneAccess)
  ) {
    const token = createInternalSessionToken()
    if (token) {
      response.cookie(internalSessionCookieName, token, {
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: isSecureRequest(request) ? 'none' : 'lax',
        maxAge: internalSessionMaxAgeMs,
        path: '/',
      })
    }
  }

  if (hasStandaloneAccess && !hasTrustedEmbeddedContext) {
    const redirectUrl = new URL(request.originalUrl, getRequestOrigin(request))
    redirectUrl.searchParams.delete(standaloneInternalAccessQueryParam)
    const sanitizedPath = `${redirectUrl.pathname}${redirectUrl.search}`
    if (sanitizedPath !== request.originalUrl) {
      response.redirect(302, sanitizedPath)
      return
    }
  }

  next()
}

function isHtmlNavigationRequest(request) {
  if (request.method !== 'GET') return false

  const destination = cleanString(request.get('sec-fetch-dest')).toLowerCase()
  if (destination === 'document' || destination === 'iframe') return true

  const mode = cleanString(request.get('sec-fetch-mode')).toLowerCase()
  if (mode === 'navigate') return true

  const accept = cleanString(request.get('accept')).toLowerCase()
  return accept.includes('text/html')
}

function requireInternalAccess(request, response, next) {
  if (
    isLocalRequest(request) ||
    hasValidInternalSession(request) ||
    hasValidBearerSession(request) ||
    hasValidShopifyLaunch(request) ||
    hasTrustedEmbeddedShopifyContext(request) ||
    hasValidEmbeddedAdminReferer(request)
  ) {
    next()
    return
  }

  response.status(401).json({
    ok: false,
    message: 'Internal inventory access requires a verified Shopify session.',
  })
}

function hasValidShopifyLaunch(request) {
  return hasValidShopifyHmac(request) || hasValidShopifySessionToken(getQueryParam(request, 'id_token'))
}

function hasValidStandaloneInternalAccess(request) {
  const providedToken = cleanString(getQueryParam(request, standaloneInternalAccessQueryParam))
  if (!providedToken) return false

  const expectedToken = createStandaloneInternalAccessToken()
  if (!expectedToken) return false

  return safeEqual(expectedToken, providedToken, 'utf8')
}

function hasTrustedEmbeddedShopifyContext(request) {
  const requestShop = cleanString(getQueryParam(request, 'shop'))
  if (shopDomain && requestShop !== shopDomain) return false

  const embedded = cleanString(getQueryParam(request, 'embedded'))
  const host = cleanString(getQueryParam(request, 'host'))
  if (!requestShop || (embedded !== '1' && !host)) return false

  const shopSlug = shopDomain?.replace('.myshopify.com', '') ?? ''
  const trustedHostPath = shopSlug ? `admin.shopify.com/store/${shopSlug}` : ''
  const decodedHost = host ? decodeBase64Url(host) : ''
  if (trustedHostPath && decodedHost.includes(trustedHostPath)) return true

  return hasValidEmbeddedAdminReferer(request)
}

function hasValidEmbeddedAdminReferer(request) {
  const referer = cleanString(request.get('referer'))
  if (!referer) return false

  try {
    const url = new URL(referer)
    if (url.hostname !== 'admin.shopify.com') return false

    const requestShop = cleanString(getQueryParam(request, 'shop'))
    if (shopDomain && requestShop && requestShop !== shopDomain) return false
    if (shopDomain && !requestShop && !referer.includes(`/store/${shopDomain.replace('.myshopify.com', '')}/`)) {
      return false
    }

    return url.pathname.includes('/apps/trinity-billet-inventory')
  } catch {
    return false
  }
}

function hasValidShopifyHmac(request) {
  if (!shopifyApiSecret) return false

  const hmac = getQueryParam(request, 'hmac')
  if (!hmac) return false

  const url = new URL(request.originalUrl, 'https://trinity.local')
  const messageParts = []
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'hmac' || key === 'signature') continue
    messageParts.push(`${key}=${value}`)
  }
  messageParts.sort()

  const digest = crypto
    .createHmac('sha256', shopifyApiSecret)
    .update(messageParts.join('&'))
    .digest('hex')

  if (!safeEqual(digest, hmac, 'hex')) return false

  const requestShop = getQueryParam(request, 'shop')
  return !shopDomain || !requestShop || requestShop === shopDomain
}

function hasValidBearerSession(request) {
  const authorization = request.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return Boolean(match?.[1] && hasValidShopifySessionToken(match[1]))
}

function hasValidShopifySessionToken(token) {
  if (!shopifyApiSecret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 3) return false

  try {
    const [encodedHeader, encodedPayload, signature] = parts
    const header = JSON.parse(decodeBase64Url(encodedHeader))
    const payload = JSON.parse(decodeBase64Url(encodedPayload))

    if (header.alg !== 'HS256') return false

    const expectedSignature = crypto
      .createHmac('sha256', shopifyApiSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url')

    if (!safeEqual(expectedSignature, signature, 'utf8')) return false

    const nowInSeconds = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < nowInSeconds) return false
    if (typeof payload.nbf === 'number' && payload.nbf > nowInSeconds) return false
    if (shopifyApiKey && payload.aud !== shopifyApiKey) return false

    if (shopDomain) {
      const dest = String(payload.dest ?? '')
      const issuer = String(payload.iss ?? '')
      if (!dest.includes(shopDomain) && !issuer.includes(shopDomain)) return false
    }

    return true
  } catch {
    return false
  }
}

function createInternalSessionToken() {
  if (!internalSessionSecret) return ''

  const payload = Buffer.from(
    JSON.stringify({
      shop: shopDomain ?? '',
      exp: Date.now() + internalSessionMaxAgeMs,
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
}

function createStandaloneInternalAccessToken() {
  if (!internalSessionSecret) return ''

  return crypto
    .createHmac('sha256', internalSessionSecret)
    .update(`standalone-internal-access:${shopDomain ?? 'trinity'}`)
    .digest('base64url')
}

function hasValidInternalSession(request) {
  if (!internalSessionSecret) return false

  const token = getCookie(request, internalSessionCookieName)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false

  const expectedSignature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(payload)
    .digest('base64url')
  if (!safeEqual(expectedSignature, signature, 'utf8')) return false

  try {
    const session = JSON.parse(decodeBase64Url(payload))
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return false
    return !shopDomain || !session.shop || session.shop === shopDomain
  } catch {
    return false
  }
}

function getQueryParam(request, name) {
  const value = request.query?.[name]
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}

function getRequestOrigin(request) {
  const protocol = cleanString(request.get('x-forwarded-proto')) || request.protocol || 'https'
  const host = cleanString(request.get('x-forwarded-host')) || cleanString(request.get('host'))
  return `${protocol}://${host || 'trinity.local'}`
}

function getCookie(request, name) {
  const cookies = String(request.get('cookie') ?? '').split(';')
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=')
    if (rawName === name) return decodeURIComponent(rawValueParts.join('='))
  }
  return ''
}

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function safeEqual(left, right, encoding) {
  try {
    const leftBuffer = Buffer.from(left, encoding)
    const rightBuffer = Buffer.from(right, encoding)
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

function isSecureRequest(request) {
  return request.secure || request.get('x-forwarded-proto') === 'https'
}

function isLocalRequest(request) {
  return ['localhost', '127.0.0.1', '::1'].includes(request.hostname)
}

function createDraftInvoiceSendToken(draftOrder, intakeId) {
  if (!internalSessionSecret || !draftOrder?.id || !intakeId) return ''

  return createSignedPayload({
    purpose: 'draft_invoice_send',
    draftOrderId: draftOrder.id,
    intakeId,
    exp: Date.now() + invoiceSendTokenMaxAgeMs,
  })
}

function verifyDraftInvoiceSendToken(token) {
  const payload = verifySignedPayload(token)
  if (payload?.purpose !== 'draft_invoice_send') return null
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
  return payload
}

function createSignedPayload(payload) {
  if (!internalSessionSecret) return ''

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

function verifySignedPayload(token) {
  if (!internalSessionSecret || !token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(encodedPayload)
    .digest('base64url')
  if (!safeEqual(expectedSignature, signature, 'utf8')) return null

  try {
    return JSON.parse(decodeBase64Url(encodedPayload))
  } catch {
    return null
  }
}

async function markDraftInvoiceSent({ draftOrderId, intakeId = '', sendInvoice = false }) {
  const normalizedDraftOrderId = cleanString(draftOrderId)
  if (!normalizedDraftOrderId) throw new Error('draftOrderId is required.')

  const existingJobs = await listRecords(resourceConfigs.orderJobs)
  const matchingJobs = existingJobs
    .filter(
      (job) =>
        cleanString(job.shopifyDraftOrderId) === normalizedDraftOrderId &&
        (!intakeId || cleanString(job.intakeId) === intakeId),
    )
    .map((job) => ({
      ...job,
      shopifyDraftInvoiceUrl: normalizeDraftInvoiceUrl(job.shopifyDraftInvoiceUrl),
    }))

  if (matchingJobs.length === 0) {
    throw new Error('Could not find the submitted draft invoice in the production queue.')
  }

  const alreadySent = matchingJobs.every((job) => cleanString(job.invoiceStatus) === 'sent')
  if (sendInvoice && !alreadySent) {
    await sendDraftOrderInvoice(
      normalizedDraftOrderId,
      buildDraftOrderInvoiceEmailInput(matchingJobs),
    )
  }

  const now = new Date().toISOString()
  const updatedJobs = matchingJobs.map((job) => ({
    ...job,
    invoiceStatus: 'sent',
    updatedAt: now,
  }))

  await Promise.all(updatedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))
  await syncOrderJobMetafields(updatedJobs)

  return updatedJobs
}

async function trySendSalesRepDraftSubmissionNotification(draftOrder, payload) {
  const emailInput = buildSalesRepDraftSubmissionEmailInput(payload, draftOrder)
  if (!emailInput) return { sentAt: '', recipients: [], error: '' }

  try {
    await sendDraftOrderInvoice(draftOrder.id, emailInput)
    return {
      sentAt: new Date().toISOString(),
      recipients: uniqueEmails([emailInput.to].concat(emailInput.bcc ?? [])),
      error: '',
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown sales rep submission notification error.'
    console.error(`Sales rep submission notification error: ${message}`)
    return {
      sentAt: '',
      recipients: [],
      error: message,
    }
  }
}

async function trySendSalesRepPaidNotification({ order, topic, jobs, existingJobs }) {
  if (!isPaidOrderWebhook(order, topic)) return { sentAt: '', recipients: [], error: '' }

  const notificationJobs = salesRepNotificationJobs(jobs)
  if (notificationJobs.length === 0) return { sentAt: '', recipients: [], error: '' }
  if (hasExistingSalesRepPaidNotification(existingJobs, notificationJobs)) {
    return { sentAt: '', recipients: [], error: '' }
  }

  const emailJobs = salesRepPaidNotificationContextJobs(notificationJobs, existingJobs)
  const salesRepEmail = normalizeEmail(
    emailJobs.find((job) => normalizeEmail(job.salesRepEmail))?.salesRepEmail,
  )
  if (!salesRepEmail) return { sentAt: '', recipients: [], error: '' }

  try {
    await sendOrderInvoice(
      order.admin_graphql_api_id ?? toShopifyGid('Order', order.id),
      buildSalesRepPaidOrderEmailInput(order, emailJobs, salesRepEmail),
    )
    return {
      sentAt: new Date().toISOString(),
      recipients: [salesRepEmail],
      error: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown paid notification error.'
    console.error(`Sales rep paid notification error: ${message}`)
    return {
      sentAt: '',
      recipients: [],
      error: message,
    }
  }
}

function isPaidOrderWebhook(order, topic) {
  return (
    String(topic).toLowerCase() === 'orders/paid' ||
    String(order?.financial_status ?? '').toLowerCase() === 'paid' ||
    String(order?.displayFinancialStatus ?? '').toLowerCase() === 'paid'
  )
}

function salesRepNotificationJobs(jobs) {
  return jobs.filter(
    (job) => job.origin === 'internal_sales' && normalizeEmail(job.salesRepEmail),
  )
}

function salesRepPaidNotificationContextJobs(notificationJobs, existingJobs) {
  const intakeIds = new Set(notificationJobs.map((job) => cleanString(job.intakeId)).filter(Boolean))
  const draftOrderIds = new Set(
    notificationJobs.map((job) => cleanString(job.shopifyDraftOrderId)).filter(Boolean),
  )
  const orderIds = new Set(
    notificationJobs.map((job) => cleanString(job.shopifyOrderId)).filter(Boolean),
  )

  const existingContextJobs = existingJobs.filter((job) => {
    if (job.origin !== 'internal_sales') return false

    const intakeId = cleanString(job.intakeId)
    const draftOrderId = cleanString(job.shopifyDraftOrderId)
    const orderId = cleanString(job.shopifyOrderId)
    return (
      (intakeId && intakeIds.has(intakeId)) ||
      (draftOrderId && draftOrderIds.has(draftOrderId)) ||
      (orderId && orderIds.has(orderId))
    )
  })

  return uniqueOrderJobs(notificationJobs.concat(existingContextJobs))
}

function uniqueOrderJobs(jobs) {
  const seen = new Set()
  return jobs.filter((job) => {
    const key =
      cleanString(job.id) ||
      cleanString(job.lineItemId) ||
      [
        cleanString(job.intakeId),
        cleanString(job.shopifyDraftOrderId),
        cleanString(job.shopifyOrderId),
        cleanString(job.productTitle),
      ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function shouldMarkSalesRepPaidNotification(job) {
  return job.origin === 'internal_sales' && normalizeEmail(job.salesRepEmail)
}

function hasExistingSalesRepPaidNotification(existingJobs, notificationJobs) {
  const matchingIds = new Set(notificationJobs.map((job) => job.id).filter(Boolean))
  const matchingLineIds = new Set(notificationJobs.map((job) => job.lineItemId).filter(Boolean))
  const matchingOrderIds = new Set(notificationJobs.map((job) => job.shopifyOrderId).filter(Boolean))
  const matchingIntakeIds = new Set(notificationJobs.map((job) => job.intakeId).filter(Boolean))

  return existingJobs.some((job) => {
    const isMatch =
      matchingIds.has(job.id) ||
      matchingLineIds.has(job.lineItemId) ||
      matchingOrderIds.has(job.shopifyOrderId) ||
      matchingIntakeIds.has(job.intakeId)

    if (!isMatch) return false

    return Boolean(cleanString(job.salesRepPaidNotificationSentAt))
  })
}

function isMissingDraftInvoiceError(error) {
  return (
    error instanceof Error &&
    error.message === 'Could not find the submitted draft invoice in the production queue.'
  )
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

function invalidateStateCache() {
  stateCacheValue = null
  stateCacheExpiresAt = 0
  stateCachePromise = null
}

function primeStateCache(value) {
  stateCacheValue = value
  stateCacheExpiresAt = Date.now() + stateCacheTtlMs
  stateCachePromise = null
  writeStateCacheFile(value)
}

async function getSharedState() {
  const now = Date.now()
  if (stateCacheValue && stateCacheExpiresAt > now) {
    return stateCacheValue
  }

  if (!stateCachePromise) {
    stateCachePromise = loadSharedState()
      .then((value) => {
        primeStateCache(value)
        return value
      })
      .finally(() => {
        stateCachePromise = null
      })
  }

  try {
    return await stateCachePromise
  } catch (error) {
    const fallback = getStateCacheFallback()
    if (fallback) return fallback
    throw error
  }
}

function arrayFromPayload(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStateSnapshot(value) {
  if (!value || typeof value !== 'object') return null

  return {
    ok: true,
    billets: arrayFromPayload(value.billets),
    players: arrayFromPayload(value.players),
    producedBats: arrayFromPayload(value.producedBats),
    customBatModels: arrayFromPayload(value.customBatModels),
    orderJobs: arrayFromPayload(value.orderJobs),
    billingContacts: arrayFromPayload(value.billingContacts),
  }
}

function writeStateCacheFile(value) {
  try {
    fs.mkdirSync(path.dirname(stateCacheFilePath), { recursive: true })
    fs.writeFileSync(
      stateCacheFilePath,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        value: normalizeStateSnapshot(value),
      }),
      'utf8',
    )
  } catch (error) {
    console.warn(
      `Unable to write Trinity state cache file: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}

function readStateCacheFile() {
  try {
    if (!fs.existsSync(stateCacheFilePath)) return null
    const payload = JSON.parse(fs.readFileSync(stateCacheFilePath, 'utf8'))
    const savedAtMs = Date.parse(payload?.savedAt)
    if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > stateCacheStaleMaxAgeMs) {
      return null
    }

    return normalizeStateSnapshot(payload?.value)
  } catch (error) {
    console.warn(
      `Unable to read Trinity state cache file: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
    return null
  }
}

function getStateCacheFallback() {
  if (
    stateCacheValue &&
    stateCacheExpiresAt > 0 &&
    Date.now() - stateCacheExpiresAt <= stateCacheStaleMaxAgeMs
  ) {
    return normalizeStateSnapshot(stateCacheValue)
  }

  return readStateCacheFile()
}

function enqueueStateWrite(operation) {
  const queued = stateWriteQueue.catch(() => undefined).then(operation)
  stateWriteQueue = queued.catch(() => undefined)
  return queued
}

function getStateResourcePatchConfigs() {
  return [
    {
      key: 'billets',
      config: resourceConfigs.billets,
      getKey: (item) => item.barcode || item.id,
    },
    {
      key: 'players',
      config: resourceConfigs.players,
      getKey: (item) => item.id || `${item.profileKind}:${item.playerName}`,
    },
    {
      key: 'producedBats',
      config: resourceConfigs.producedBats,
      getKey: (item) => item.id || item.createdAt,
    },
    {
      key: 'customBatModels',
      config: resourceConfigs.customBatModels,
      getKey: (item) => item.id,
    },
    {
      key: 'orderJobs',
      config: resourceConfigs.orderJobs,
      getKey: (item) => item.id,
    },
    {
      key: 'billingContacts',
      config: resourceConfigs.billingContacts,
      getKey: (item) => item.id,
    },
  ]
}

function normalizeStatePatch(payload) {
  const patch = Object.fromEntries(
    getStateResourcePatchConfigs().map((entry) => [
      entry.key,
      arrayFromPayload(payload?.[entry.key]).filter(Boolean),
    ]),
  )
  patch.deletes = Object.fromEntries(
    getStateResourcePatchConfigs().map((entry) => [
      entry.key,
      arrayFromPayload(payload?.deletes?.[entry.key])
        .map((id) => cleanString(id))
        .filter(Boolean),
    ]),
  )

  return patch
}

function getChangedRecords(base, next, getKey) {
  const baseRecords = new Map()
  for (const item of arrayFromPayload(base)) {
    const key = cleanString(getKey(item))
    if (key) baseRecords.set(key, JSON.stringify(item))
  }

  return arrayFromPayload(next).filter((item) => {
    const key = cleanString(getKey(item))
    if (!key) return false
    return baseRecords.get(key) !== JSON.stringify(item)
  })
}

function buildStatePatchFromStates(baseState, nextState) {
  const patch = {}
  for (const entry of getStateResourcePatchConfigs()) {
    const changedRecords = getChangedRecords(
      baseState?.[entry.key],
      nextState?.[entry.key],
      entry.getKey,
    )
    if (changedRecords.length > 0) {
      patch[entry.key] = changedRecords
    }
  }

  return patch
}

function applyStatePatchToCachedState(state, patch) {
  if (!state) return null

  const nextState = {
    ok: true,
    billets: arrayFromPayload(state.billets),
    players: arrayFromPayload(state.players),
    producedBats: arrayFromPayload(state.producedBats),
    customBatModels: arrayFromPayload(state.customBatModels),
    orderJobs: arrayFromPayload(state.orderJobs),
    billingContacts: arrayFromPayload(state.billingContacts),
  }

  for (const entry of getStateResourcePatchConfigs()) {
    const items = arrayFromPayload(patch?.[entry.key])
    const deletedIds = new Set(arrayFromPayload(patch?.deletes?.[entry.key]).map((id) => cleanString(id)))
    if (deletedIds.size > 0) {
      nextState[entry.key] = nextState[entry.key].filter((item) => {
        const id = cleanString(item?.id)
        const key = cleanString(entry.getKey(item))
        return !deletedIds.has(id) && !deletedIds.has(key)
      })
    }
    if (items.length === 0) continue
    nextState[entry.key] = mergeRecordsByKey(nextState[entry.key], items, entry.getKey)
  }

  return nextState
}

async function applyStatePatch(payload, options = {}) {
  if (options.ensureDefinitions !== false) {
    await ensureDefinitions()
  }

  const patch = normalizeStatePatch(payload)
  const cachedStateBeforeWrite = stateCacheValue
  const applied = {}

  for (const entry of getStateResourcePatchConfigs()) {
    const items = patch[entry.key]
    const deletedIds = patch.deletes[entry.key]
    applied[entry.key] = items.length
    applied[`${entry.key}Deleted`] = deletedIds.length

    for (const id of deletedIds) {
      await deleteRecord(entry.config, id)
    }

    for (const item of items) {
      await upsertRecord(entry.config, item)
    }
  }

  if (patch.orderJobs.length > 0) {
    await syncOrderJobMetafields(patch.orderJobs)
  }

  const patchedCache = applyStatePatchToCachedState(cachedStateBeforeWrite, patch)
  const payloadSnapshot = normalizeStateSnapshot(payload?.stateSnapshot)
  if (patchedCache) {
    primeStateCache(patchedCache)
  } else if (payloadSnapshot) {
    primeStateCache(payloadSnapshot)
  } else {
    invalidateStateCache()
  }

  return { applied }
}

function mergeRecordsByKey(base, overrides, getKey) {
  const merged = new Map()

  for (const item of base) {
    const key = cleanString(getKey(item))
    if (key) merged.set(key, item)
  }

  for (const item of overrides) {
    const key = cleanString(getKey(item))
    if (key) merged.set(key, item)
  }

  return Array.from(merged.values())
}

function reconcileBilletProductionStatuses(billets, producedBats) {
  const productionBilletIds = new Set(
    producedBats.flatMap((record) => (Array.isArray(record.billetIds) ? record.billetIds : [])),
  )

  if (productionBilletIds.size === 0) return billets

  return billets.map((billet) =>
    productionBilletIds.has(billet.id)
      ? {
          ...billet,
          status: 'production',
        }
      : billet,
  )
}

function getGameModelBilletMatches(billets, { source, species, idealBilletWeight }) {
  const normalizedSource = cleanString(source)
  const normalizedSpecies = cleanString(species)
  const targetWeight = Number(idealBilletWeight)
  if (
    !billetSourceOptions.has(normalizedSource) ||
    !billetSpeciesOptions.has(normalizedSpecies) ||
    !Number.isFinite(targetWeight)
  ) {
    return []
  }

  return arrayFromPayload(billets)
    .map((billet) => {
      const billetWeight = Number(billet?.weight)
      const adjustedTargetWeight = getAdjustedTargetBilletWeight(
        normalizedSource,
        targetWeight,
        cleanString(billet?.source),
      )

      return { billet, billetWeight, adjustedTargetWeight }
    })
    .filter(({ billet, billetWeight, adjustedTargetWeight }) => (
      cleanString(billet?.status) === 'storage' &&
      isTruthy(billet?.mlbEligible) &&
      cleanString(billet?.hasBarrelKnot) !== 'Yes' &&
      cleanString(billet?.species) === normalizedSpecies &&
      Number.isFinite(billetWeight) &&
      Math.abs(billetWeight - adjustedTargetWeight) <= 0.5
    ))
    .sort((a, b) => {
      const aDifference = Math.abs(a.billetWeight - a.adjustedTargetWeight)
      const bDifference = Math.abs(b.billetWeight - b.adjustedTargetWeight)
      if (aDifference !== bDifference) return aDifference - bDifference
      return cleanString(a.billet?.source).localeCompare(cleanString(b.billet?.source))
    })
    .map(({ billet }) => billet)
}

function getAdjustedTargetBilletWeight(referenceSource, idealWeight, candidateSource) {
  const referenceIsOversized = oversizedBilletDiameterSources.has(referenceSource)
  const candidateIsOversized = oversizedBilletDiameterSources.has(candidateSource)

  if (referenceIsOversized === candidateIsOversized) return idealWeight
  return referenceIsOversized
    ? idealWeight - billetDiameterWeightCorrectionOz
    : idealWeight + billetDiameterWeightCorrectionOz
}

function primeCatalogCache(products) {
  catalogCacheValue = products
  catalogCacheExpiresAt = Date.now() + catalogCacheTtlMs
  catalogCachePromise = null
}

async function getCatalogProducts() {
  const now = Date.now()
  if (catalogCacheValue && catalogCacheExpiresAt > now) {
    return { products: catalogCacheValue, cacheStatus: 'hit' }
  }

  if (!catalogCachePromise) {
    catalogCachePromise = listCatalogProducts()
      .then((products) => {
        primeCatalogCache(products)
        return { products, cacheStatus: 'refreshed' }
      })
      .finally(() => {
        catalogCachePromise = null
      })
  }

  try {
    return await catalogCachePromise
  } catch (error) {
    if (catalogCacheValue) {
      return { products: catalogCacheValue, cacheStatus: 'stale-fallback' }
    }

    throw error
  }
}

async function loadSharedState() {
  await ensureDefinitions()
  const billets = await listRecords(resourceConfigs.billets)
  const players = await listRecords(resourceConfigs.players)
  const producedBats = await listRecords(resourceConfigs.producedBats)
  const customBatModels = await listRecords(resourceConfigs.customBatModels)
  const orderJobs = await listRecords(resourceConfigs.orderJobs)
  const billingContacts = await listRecords(resourceConfigs.billingContacts)

  return {
    ok: true,
    billets,
    players,
    producedBats,
    customBatModels,
    orderJobs,
    billingContacts,
  }
}

async function ensureDefinitionsInternal() {
  for (const config of Object.values(resourceConfigs)) {
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
            name: config.name,
            type: config.type,
            access: {
              admin: 'MERCHANT_READ_WRITE',
              storefront: 'NONE',
            },
            displayNameKey: 'label',
            fieldDefinitions: [
              definitionField('label', 'Label', 'single_line_text_field'),
              definitionField('payload', 'Payload', 'json'),
              ...config.fieldDefinitions,
            ],
          },
        },
      )

      const errors = result?.data?.metaobjectDefinitionCreate?.userErrors ?? []
      throwIfRetryableShopifyUserErrors(errors, `Definition error for ${config.type}`)
      const meaningfulErrors = errors.filter((item) => {
        const message = String(item?.message ?? '').toLowerCase()
        return !message.includes('already exists') && !message.includes('already been taken')
      })

      if (meaningfulErrors.length > 0) {
        throw new Error(
          `Definition error for ${config.type}: ${meaningfulErrors
            .map((item) => item.message)
            .join(', ')}`,
        )
      }

      const definitionId =
        result?.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id ??
        (await getDefinitionByType(config.type))?.id

      if (!definitionId) {
        throw new Error(`Could not resolve definition id for ${config.type}`)
      }

      await ensureDefinitionFields(definitionId, config)
    })
  }
}

async function listRecords(config) {
  const nodes = await listMetaobjectNodes(config.type)
  return nodes
    .map((node) => node?.payload?.jsonValue)
    .filter(Boolean)
}

async function listMetaobjectNodes(type) {
  const nodes = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query ListMetaobjects($type: String!, $after: String) {
          metaobjects(type: $type, first: ${metaobjectsPageSize}, after: $after, sortKey: "updated_at", reverse: true) {
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
    nodes.push(...(connection?.nodes ?? []))
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return nodes
}

async function upsertRecords(config, items, options = {}) {
  const deleteMissing = options.deleteMissing ?? config.deleteMissing ?? true
  const desiredHandles = new Set()

  await mapWithConcurrency(items, 4, async (item) => {
    const handle = await upsertRecord(config, item)
    desiredHandles.add(handle)
  })

  if (!deleteMissing) return

  const existingNodes = await listMetaobjectNodes(config.type)
  const nodesToDelete = existingNodes.filter((node) => !desiredHandles.has(node.handle))

  await mapWithConcurrency(nodesToDelete, 4, async (node) => {
    const result = await shopifyGraphQL(
      `
        mutation DeleteMetaobject($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { id: node.id },
    )

    const errors = result?.data?.metaobjectDelete?.userErrors ?? []
    if (errors.length > 0) {
      throw new Error(
        `Metaobject delete error for ${config.type}/${node.handle}: ${errors
          .map((item) => item.message)
          .join(', ')}`,
      )
    }

    invalidateStateCache()
  })
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
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
        fields: [
          {
            key: 'label',
            value: config.labelFor(item),
          },
          {
            key: 'payload',
            value: JSON.stringify(item),
          },
          ...config.fieldsFor(item),
        ],
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

  invalidateStateCache()
  return handle
}

async function deleteRecord(config, id) {
  const handle = sanitizeHandle(id)
  if (!handle) return false

  const existing = await shopifyGraphQL(
    `
      query MetaobjectIdByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
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
  const metaobjectId = existing?.data?.metaobjectByHandle?.id
  if (!metaobjectId) return false

  const result = await shopifyGraphQL(
    `
      mutation DeleteMetaobject($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { id: metaobjectId },
  )
  const errors = result?.data?.metaobjectDelete?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Metaobject delete error for ${config.type}/${handle}: ${errors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  invalidateStateCache()
  return true
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

async function ensureDefinitionFields(definitionId, config) {
  const existing = await getDefinitionByType(config.type)
  const existingKeys = new Set(existing?.fieldDefinitions?.map((item) => item.key) ?? [])
  const missingFields = config.fieldDefinitions.filter((field) => !existingKeys.has(field.key))

  if (missingFields.length === 0) return

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
        fieldDefinitions: missingFields.map((field) => ({
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
    if (
      [429, 500, 502, 503, 504].includes(response.status) &&
      attempt < shopifyGraphqlMaxAttempts - 1
    ) {
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
    if (shouldRetry && attempt < shopifyGraphqlMaxAttempts - 1) {
      await sleep(getShopifyGraphQLRetryDelayMs(payload, attempt))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((item) => item.message).join(', '))
  }

  await maybePauseForShopifyThrottleBudget(payload)
  return payload
}

async function runWithShopifyRetry(operation, attempt = 0) {
  try {
    return await operation()
  } catch (error) {
    if (isRetryableShopifyError(error) && attempt < shopifyGraphqlMaxAttempts - 1) {
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
    return Math.max(1500, Math.ceil((deficit / restoreRate) * 1000) + 750)
  }

  return getRetryDelayMs(attempt)
}

async function maybePauseForShopifyThrottleBudget(payload) {
  const cost = payload?.extensions?.cost
  const throttleStatus = cost?.throttleStatus
  const requestedCost = Number(cost?.requestedQueryCost)
  const available = Number(throttleStatus?.currentlyAvailable)
  const restoreRate = Number(throttleStatus?.restoreRate)

  if (
    !Number.isFinite(requestedCost) ||
    !Number.isFinite(available) ||
    !Number.isFinite(restoreRate) ||
    restoreRate <= 0
  ) {
    return
  }

  const targetAvailable = Math.max(requestedCost * 2, 150)
  if (available >= targetAvailable) return

  const deficit = targetAvailable - available
  const waitMs = Math.ceil((deficit / restoreRate) * 1000) + 250
  await sleep(Math.max(waitMs, 250))
}

function getRetryDelayMs(attempt) {
  return Math.min(1000 * 2 ** attempt, 10000)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function listCatalogProducts() {
  const allProducts = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage && allProducts.length < 250) {
    const result = await shopifyGraphQL(
      `
        query CatalogProducts($cursor: String) {
          products(first: 100, after: $cursor, sortKey: TITLE) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
              status
              productType
              tags
              onlineStoreUrl
              featuredImage {
                url
              }
              variants(first: 50) {
                nodes {
                  id
                  title
                  price
                  inventoryQuantity
                  sku
                }
              }
            }
          }
        }
      `,
      { cursor },
    )

    const connection = result?.data?.products
    const nodes = connection?.nodes ?? []
    allProducts.push(
      ...nodes
        .filter(isBatProductLike)
        .map((product) => ({
          id: product.id,
          name: product.title,
          category: product.productType || 'Uncategorized',
          handle: product.handle,
          url: product.onlineStoreUrl || `https://${shopDomain}/products/${product.handle}`,
          status: product.status,
          tags: product.tags ?? [],
          imageUrl: product.featuredImage?.url ?? '',
          variants: (product.variants?.nodes ?? []).map((variant) => ({
            id: variant.id,
            title: variant.title,
            price: cleanString(variant.price),
            inventoryQuantity: variant.inventoryQuantity ?? 0,
            sku: variant.sku ?? '',
          })),
        })),
    )

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return allProducts
}

async function createDraftOrder(input) {
  const result = await shopifyGraphQL(
    `
      mutation CreateSalesDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            email
            createdAt
            updatedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingLine {
              title
              originalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            customer {
              id
              displayName
              email
            }
            lineItems(first: 50) {
              nodes {
                id
                name
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                product {
                  id
                  title
                  productType
                }
                variant {
                  id
                  title
                  sku
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input },
  )

  const errors = result?.data?.draftOrderCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Draft order error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return normalizeDraftOrderInvoiceUrl(result?.data?.draftOrderCreate?.draftOrder)
}

async function createPendingOrder(order, options = {}) {
  const result = await shopifyGraphQL(
    `
      mutation CreatePendingSalesOrder(
        $order: OrderCreateOrderInput!
        $options: OrderCreateOptionsInput
      ) {
        orderCreate(order: $order, options: $options) {
          order {
            id
            name
            email
            createdAt
            updatedAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
            customAttributes {
              key
              value
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              displayName
              email
            }
            lineItems(first: 50) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  title
                  sku
                  product {
                    id
                    title
                    productType
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      order,
      options: {
        inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
        sendReceipt: Boolean(options.sendReceipt),
        sendFulfillmentReceipt: false,
      },
    },
  )

  const errors = result?.data?.orderCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Shopify order error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return result?.data?.orderCreate?.order
}

async function completeDraftOrderAsPending(draftOrderId) {
  const result = await shopifyGraphQL(
    `
      mutation CompleteSalesDraftOrder($id: ID!) {
        draftOrderComplete(id: $id) {
          draftOrder {
            id
            name
            status
            order {
              id
              name
              email
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              tags
              note
              customAttributes {
                key
                value
              }
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                displayName
                email
              }
              lineItems(first: 50) {
                nodes {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  originalTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    title
                    sku
                    product {
                      id
                      title
                      productType
                    }
                  }
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: draftOrderId },
  )

  const errors = result?.data?.draftOrderComplete?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Draft order completion error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return result?.data?.draftOrderComplete?.draftOrder
}

async function sendDraftOrderInvoice(draftOrderId, emailInput) {
  const result = await shopifyGraphQL(
    `
      mutation SendDraftOrderInvoice($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: draftOrderId, email: emailInput },
  )

  const errors = result?.data?.draftOrderInvoiceSend?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Invoice send error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

async function sendOrderInvoice(orderId, emailInput) {
  const result = await shopifyGraphQL(
    `
      mutation SendOrderInvoice($orderId: ID!, $email: EmailInput) {
        orderInvoiceSend(id: $orderId, email: $email) {
          order {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { orderId, email: emailInput },
  )

  const errors = result?.data?.orderInvoiceSend?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Order invoice send error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

async function listRecentOrders(first) {
  const result = await shopifyGraphQL(
    `
      query RecentOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            email
            createdAt
            updatedAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
            customAttributes {
              key
              value
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              displayName
              email
            }
            lineItems(first: 50) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  title
                  sku
                  product {
                    id
                    title
                    productType
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `,
    { first },
  )

  return result?.data?.orders?.nodes ?? []
}

async function registerWebhook(topic, uri) {
  const result = await shopifyGraphQL(
    `
      mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
            topic
            uri
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      topic,
      webhookSubscription: {
        uri,
      },
    },
  )

  const errors = result?.data?.webhookSubscriptionCreate?.userErrors ?? []
  const meaningfulErrors = errors.filter((item) => {
    const message = String(item?.message ?? '').toLowerCase()
    return !message.includes('already') && !message.includes('taken')
  })

  if (meaningfulErrors.length > 0) {
    throw new Error(
      `Webhook subscription error for ${topic}: ${meaningfulErrors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  return (
    result?.data?.webhookSubscriptionCreate?.webhookSubscription ?? {
      topic,
      uri,
      alreadyRegistered: errors.length > 0,
    }
  )
}

async function syncOrderJobMetafields(orderJobs) {
  const jobsWithOrders = orderJobs.filter((job) => job.shopifyOrderId)
  for (const job of jobsWithOrders) {
    const ownerId = toShopifyGid('Order', job.shopifyOrderId)
    const metafields = [
      orderMetafield(ownerId, 'production_job_id', job.id),
      orderMetafield(ownerId, 'production_status', job.productionStatus),
      orderMetafield(ownerId, 'assigned_billet', job.assignedBilletId),
      orderMetafield(ownerId, 'order_submitted_at', job.orderSubmittedAt),
      orderMetafield(ownerId, 'sales_rep', job.salesRep),
      orderMetafield(ownerId, 'sales_rep_email', job.salesRepEmail),
      orderMetafield(
        ownerId,
        'sales_rep_submission_notification_sent_at',
        job.salesRepSubmissionNotificationSentAt,
      ),
      orderMetafield(
        ownerId,
        'sales_rep_paid_notification_sent_at',
        job.salesRepPaidNotificationSentAt,
      ),
      orderMetafield(ownerId, 'player_name', job.playerName),
      orderMetafield(ownerId, 'player_email', job.playerEmail),
      orderMetafield(ownerId, 'billing_name', job.billingName),
      orderMetafield(ownerId, 'billing_email', job.billingEmail),
      orderMetafield(ownerId, 'billing_phone', job.billingPhone),
      orderMetafield(ownerId, 'billing_company', job.billingCompany),
      orderMetafield(ownerId, 'billing_relationship', job.billingRelationship),
      {
        namespace: 'trinity',
        key: 'specs',
        ownerId,
        type: 'json',
        value: JSON.stringify(job.specs ?? {}),
      },
    ].filter((field) => field.value !== undefined && field.value !== null && field.value !== '')

    if (metafields.length === 0) continue

    const result = await shopifyGraphQL(
      `
        mutation SetOrderMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              namespace
              value
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
      throw new Error(`Order metafield sync error: ${errors.map((item) => item.message).join(', ')}`)
    }
  }
}

function setAnalyticsCorsHeaders(response) {
  response.set('Access-Control-Allow-Origin', '*')
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Content-Type')
  response.set('Access-Control-Max-Age', '86400')
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
    landingPage: cleanString(value.landingPage).slice(0, 512),
    referrer: cleanString(value.referrer).slice(0, 512),
    capturedAt: normalizeIsoDate(value.capturedAt) || '',
  }
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
    viewport: cleanString(windowContext.innerWidth && windowContext.innerHeight
      ? `${windowContext.innerWidth}x${windowContext.innerHeight}`
      : context.viewport).slice(0, 64),
  }
}

async function upsertCustomerSessionFromEvent(event, cachedSessions) {
  const existing =
    cachedSessions.get(event.sessionId) ?? (await getRecordByHandle(resourceConfigs.customerSessions, event.sessionId))
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
    events,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  await upsertRecord(resourceConfigs.customerSessions, session)
  return session
}

async function getRecordByHandle(config, id) {
  const handle = sanitizeHandle(id)
  if (!handle) return null

  const result = await shopifyGraphQL(
    `
      query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          handle
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
    journey: (session.events ?? []).map((item) => ({
      name: item.name,
      at: item.at,
      path: item.path,
      title: item.title,
      searchQuery: item.searchQuery,
      value: item.value,
      orderName: item.orderName,
      items: item.items,
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
  if (['ig', 'instagram.com', 'l.instagram.com'].includes(source)) return 'instagram'
  if (['fb', 'facebook.com', 'm.facebook.com', 'l.facebook.com'].includes(source)) return 'facebook'
  if (['x', 'twitter', 'twitter.com', 't.co'].includes(source)) return 'x'
  return source
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

function resolvePayer(payload) {
  const billingDifferent = isTruthy(payload.billingDifferent)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail || payload.customerEmail)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)

  if (!billingDifferent) {
    return {
      name: playerName,
      email: playerEmail,
      phone: playerPhone,
      company: '',
      relationship: '',
    }
  }

  return {
    name: cleanString(payload.billingName || payload.customerName),
    email: cleanString(payload.billingEmail || payload.customerEmail),
    phone: cleanString(payload.billingPhone),
    company: cleanString(payload.billingCompany),
    relationship: cleanString(payload.billingRelationship),
  }
}

function buildDirectOrderAddresses(payload) {
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const shippingAddress = buildMailingAddressInput(payload, 'shipping', playerName, playerPhone)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const billingAddressDifferent = isTruthy(payload.billingAddressDifferent)
  const billingAddress = billingAddressDifferent
    ? buildMailingAddressInput(payload, 'billing', playerName, playerPhone)
    : billingDifferent
      ? null
      : shippingAddress

  return {
    shippingAddress,
    billingAddress,
    billingAddressDifferent,
  }
}

function buildMailingAddressInput(payload, prefix, fullName, phone) {
  const address1 = cleanString(payload[`${prefix}Address1`])
  const address2 = cleanString(payload[`${prefix}Address2`])
  const city = cleanString(payload[`${prefix}City`])
  const provinceCode = cleanString(payload[`${prefix}ProvinceCode`]).toUpperCase()
  const zip = cleanString(payload[`${prefix}Zip`])
  const countryCode = cleanString(payload[`${prefix}CountryCode`] || 'US').toUpperCase()

  if (!address1 && !city && !provinceCode && !zip) return null

  const { firstName, lastName } = splitName(fullName)
  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(address1 ? { address1 } : {}),
    ...(address2 ? { address2 } : {}),
    ...(city ? { city } : {}),
    ...(provinceCode ? { provinceCode } : {}),
    ...(zip ? { zip } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(phone ? { phone } : {}),
  }
}

function splitName(fullName) {
  const parts = cleanString(fullName).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function formatMailingAddress(address) {
  if (!address) return ''

  return [
    address.address1,
    address.address2,
    [address.city, address.provinceCode, address.zip].filter(Boolean).join(', '),
    address.countryCode,
  ]
    .filter(Boolean)
    .join(' | ')
}

function validateSalesOrderPayload(payload) {
  const playerName = cleanString(payload?.playerName || payload?.customerName)
  const salesRepEmail = normalizeEmail(payload?.salesRepEmail)
  const billingDifferent = isTruthy(payload?.billingDifferent)
  const payer = resolvePayer(payload ?? {})
  const requiresShipping = requiresShippingForOrder(payload ?? {})
  const lines = Array.isArray(payload?.lines) ? payload.lines : []

  if (!playerName) return 'Player name is required.'
  if (!payer.email) return 'Payer email is required.'
  if (!isPlausibleEmail(payer.email)) return 'Payer email must be a valid email address.'
  if (cleanString(payload?.salesRepEmail) && !salesRepEmail) {
    return 'Sales rep email must be a valid email address.'
  }

  if (!billingDifferent && !payer.phone) {
    return 'Player phone is required for direct-bill orders.'
  }

  if (requiresShipping) {
    const missingShippingAddress =
      !cleanString(payload?.shippingAddress1) ||
      !cleanString(payload?.shippingCity) ||
      !cleanString(payload?.shippingProvinceCode) ||
      !cleanString(payload?.shippingZip) ||
      !cleanString(payload?.shippingCountryCode)
    if (missingShippingAddress) return 'Shipping address is required for shipped orders.'

    if (isTruthy(payload?.billingAddressDifferent)) {
      const missingBillingAddress =
        !cleanString(payload?.billingAddress1) ||
        !cleanString(payload?.billingCity) ||
        !cleanString(payload?.billingProvinceCode) ||
        !cleanString(payload?.billingZip) ||
        !cleanString(payload?.billingCountryCode)
      if (missingBillingAddress) return 'Billing address is required when it differs from shipping.'
    }
  }

  if (lines.length === 0) return 'At least one order line is required.'

  for (const [index, line] of lines.entries()) {
    const title = cleanString(line?.title || line?.model)
    const unitPrice = Number(cleanString(line?.unitPrice))
    const quantity = Number(line?.quantity)

    if (!title) return `Line ${index + 1} needs a bat model.`
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return `Line ${index + 1} needs a valid unit price.`
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return `Line ${index + 1} needs a quantity of at least 1.`
    }
  }

  return ''
}

function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value))
}

function isZeroDollarSalesOrder(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : []
  if (lines.length === 0) return false

  let total = 0
  for (const line of lines) {
    const priceText = cleanString(line?.unitPrice)
    const quantity = Number(line?.quantity || 1)
    const unitPrice = Number(priceText)
    if (
      priceText === '' ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isFinite(quantity) ||
      quantity < 1
    ) {
      return false
    }
    total += unitPrice * quantity
  }

  return Math.abs(total) < 0.005
}

function normalizePersonKey(value) {
  return cleanString(value).toLowerCase().replace(/\s+/g, ' ')
}

function normalizeEmailKey(value) {
  return cleanString(value).toLowerCase()
}

function normalizePhoneKey(value) {
  return cleanString(value).replace(/\D/g, '')
}

function createStablePeopleRecordId(prefix, ...parts) {
  const slug = sanitizeHandle(parts.map((part) => cleanString(part)).filter(Boolean).join('-'))
  return slug ? `${prefix}-${slug}` : createPlainId(prefix)
}

function buildRememberedPlayerFromJob(job) {
  if (job?.origin !== 'internal_sales') return null

  const playerName = cleanString(job?.playerName || job?.customerName)
  if (!playerName) return null

  return {
    id: createStablePeopleRecordId('player', playerName),
    profileKind: 'Player',
    playerName,
    bats: [],
  }
}

function buildRememberedBillingContactFromJob(job) {
  const billingDifferent = isTruthy(job?.billingDifferent)
  const name = cleanString(job?.billingName || job?.customerName || job?.playerName || job?.billingEmail)
  const email = cleanString(job?.billingEmail || job?.customerEmail || job?.playerEmail)
  const phone = cleanString(job?.billingPhone)
  const company = cleanString(job?.billingCompany)
  const relationship =
    cleanString(job?.billingRelationship) || (billingDifferent ? '' : 'Direct customer')

  if (!name && !email && !phone && !company) return null

  const playerName = cleanString(job?.playerName)
  const orderName = cleanString(job?.shopifyOrderName || job?.shopifyDraftOrderName)
  const orderSubmittedAt = cleanString(job?.orderSubmittedAt || job?.createdAt)
  const notes = [
    orderSubmittedAt ? `Last invoice/order: ${orderSubmittedAt}` : '',
    orderName ? `Shopify order: ${orderName}` : '',
    playerName && normalizePersonKey(playerName) !== normalizePersonKey(name)
      ? `Player: ${playerName}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: createStablePeopleRecordId('billing-contact', email || phone || name, company),
    name: name || email || phone,
    email,
    phone,
    company,
    relationship,
    notes,
  }
}

function getBillingContactDedupeKey(contact) {
  const email = normalizeEmailKey(contact?.email)
  if (email) return `email:${email}`

  const phone = normalizePhoneKey(contact?.phone)
  if (phone) return `phone:${phone}`

  const name = normalizePersonKey(contact?.name)
  const company = normalizePersonKey(contact?.company)
  return [name, company].filter(Boolean).join('|')
}

function findExistingPlayerProfile(existingPlayers, incomingPlayer) {
  const playerKey = normalizePersonKey(incomingPlayer?.playerName)
  if (!playerKey) return null

  return existingPlayers.find((player) => normalizePersonKey(player?.playerName) === playerKey) ?? null
}

function findExistingBillingContact(existingContacts, incomingContact) {
  const incomingEmail = normalizeEmailKey(incomingContact?.email)
  if (incomingEmail) {
    const match = existingContacts.find((contact) => normalizeEmailKey(contact?.email) === incomingEmail)
    if (match) return match
  }

  const incomingPhone = normalizePhoneKey(incomingContact?.phone)
  if (incomingPhone) {
    const match = existingContacts.find((contact) => normalizePhoneKey(contact?.phone) === incomingPhone)
    if (match) return match
  }

  const incomingName = normalizePersonKey(incomingContact?.name)
  const incomingCompany = normalizePersonKey(incomingContact?.company)
  if (!incomingName && !incomingCompany) return null

  return (
    existingContacts.find((contact) => {
      const contactName = normalizePersonKey(contact?.name)
      const contactCompany = normalizePersonKey(contact?.company)
      return contactName === incomingName && contactCompany === incomingCompany
    }) ?? null
  )
}

function mergeRememberedPlayer(existingPlayer, incomingPlayer) {
  return {
    id: cleanString(existingPlayer?.id) || incomingPlayer.id,
    profileKind: cleanString(existingPlayer?.profileKind) || incomingPlayer.profileKind,
    playerName: cleanString(existingPlayer?.playerName) || incomingPlayer.playerName,
    bats: Array.isArray(existingPlayer?.bats) ? existingPlayer.bats : incomingPlayer.bats,
  }
}

function mergeRememberedBillingContact(existingContact, incomingContact) {
  return {
    id: cleanString(existingContact?.id) || incomingContact.id,
    name: cleanString(existingContact?.name) || incomingContact.name,
    email: cleanString(existingContact?.email) || incomingContact.email,
    phone: cleanString(existingContact?.phone) || incomingContact.phone,
    company: cleanString(existingContact?.company) || incomingContact.company,
    relationship: cleanString(existingContact?.relationship) || incomingContact.relationship,
    notes: cleanString(existingContact?.notes) || incomingContact.notes,
  }
}

async function rememberOrderJobContacts(jobs) {
  const jobList = Array.isArray(jobs) ? jobs : []
  const playerDrafts = mergeRecordsByKey(
    [],
    jobList.map((job) => buildRememberedPlayerFromJob(job)).filter(Boolean),
    (player) => normalizePersonKey(player.playerName),
  )
  const billingContactDrafts = mergeRecordsByKey(
    [],
    jobList.map((job) => buildRememberedBillingContactFromJob(job)).filter(Boolean),
    (contact) => getBillingContactDedupeKey(contact),
  )

  if (playerDrafts.length === 0 && billingContactDrafts.length === 0) {
    return { players: [], billingContacts: [] }
  }

  const [existingPlayers, existingBillingContacts] = await Promise.all([
    playerDrafts.length > 0 ? listRecords(resourceConfigs.players) : Promise.resolve([]),
    billingContactDrafts.length > 0
      ? listRecords(resourceConfigs.billingContacts)
      : Promise.resolve([]),
  ])

  const players = playerDrafts.map((player) =>
    mergeRememberedPlayer(findExistingPlayerProfile(existingPlayers, player), player),
  )
  const billingContacts = billingContactDrafts.map((contact) =>
    mergeRememberedBillingContact(findExistingBillingContact(existingBillingContacts, contact), contact),
  )

  await Promise.all([
    Promise.all(players.map((player) => upsertRecord(resourceConfigs.players, player))),
    Promise.all(
      billingContacts.map((contact) => upsertRecord(resourceConfigs.billingContacts, contact)),
    ),
  ])

  return { players, billingContacts }
}

function formatSalesLineShopifyTitle(line, isProOrder) {
  const title = cleanString(line?.title || line?.model) || 'Custom Trinity bat'
  if (!isProOrder) return title

  return /^pro order\b/i.test(title) ? title : `Pro Order - ${title}`
}

function buildProOrderNotificationLabel(payload, payer) {
  const playerName = cleanString(payload?.playerName || payload?.customerName)
  const teamOrAgency = cleanString(payload?.billingCompany || payer?.company)
  const payerName = cleanString(payload?.billingName || payer?.name)
  const displayName = isTruthy(payload?.billingDifferent)
    ? teamOrAgency || payerName || playerName
    : playerName || teamOrAgency || payerName

  return ['Pro Order', displayName].filter(Boolean).join(' - ').slice(0, 255)
}

function buildOrderInvoiceEmailInput(payload, order) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const hasProOrder = lines.some((line) => isTruthy(line.isProOrder))
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const salesRepMessage = formatSalesRepNotificationMessage(salesRep, salesRepEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const billingCompany = cleanString(payload.billingCompany)
  const customMessage = [
    'A Trinity Bat Company invoice has been created from an internal sales order.',
    salesRepMessage,
    hasProOrder ? 'Order type: Pro Order' : '',
    isZeroDollarOrder ? '$0 sample order: no payment is due; invoice sent for documentation.' : '',
    playerName ? `Player: ${playerName}` : '',
    billingCompany ? `Team/agency: ${billingCompany}` : '',
    cleanString(payload.notes) ? `Notes: ${cleanString(payload.notes)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const emailInput = {
    to: payer.email,
    subject: isZeroDollarOrder
      ? `${order?.name ?? 'Shopify order'} $0 sample documentation from Trinity Bat Company`
      : `${order?.name ?? 'Shopify order'} Draft Order Submitted`,
    customMessage,
  }

  const bcc = salesRepNotificationRecipients(salesRepEmail)
  if (bcc.length > 0) {
    emailInput.bcc = bcc
  }

  return emailInput
}

function buildDraftOrderInvoiceEmailInput(jobs) {
  const primaryJob = Array.isArray(jobs) ? (jobs[0] ?? {}) : {}
  const invoiceUrl = normalizeDraftInvoiceUrl(primaryJob.shopifyDraftInvoiceUrl)
  const draftOrderName = cleanString(primaryJob.shopifyDraftOrderName) || 'Trinity order'
  const recipientEmail = cleanString(primaryJob.billingEmail || primaryJob.customerEmail)
  const salesRep = cleanString(primaryJob.salesRep)
  const salesRepEmail = normalizeEmail(primaryJob.salesRepEmail)
  const salesRepMessage = formatSalesRepNotificationMessage(salesRep, salesRepEmail)
  const playerName = cleanString(primaryJob.playerName)
  const billingCompany = cleanString(primaryJob.billingCompany)
  const notes = cleanString(primaryJob.internalNotes || primaryJob.notes)
  const customMessage = [
    'A Trinity Sports Group invoice has been created from an internal sales order.',
    salesRepMessage,
    invoiceUrl
      ? `If the payment button does not open correctly, use this secure invoice link: ${invoiceUrl}`
      : '',
    playerName ? `Player: ${playerName}` : '',
    billingCompany ? `Team/agency: ${billingCompany}` : '',
    notes ? `Notes: ${notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const emailInput = {
    subject: `${draftOrderName} Draft Order Submitted`,
    customMessage,
  }

  if (recipientEmail) {
    emailInput.to = recipientEmail
  }
  const bcc = salesRepNotificationRecipients(salesRepEmail)
  if (bcc.length > 0) {
    emailInput.bcc = bcc
  }

  return emailInput
}

function buildSalesRepDraftSubmissionEmailInput(payload, draftOrder) {
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  if (!salesRepEmail) return null

  const salesRep = cleanString(payload.salesRep)
  const draftOrderName = cleanString(draftOrder?.name) || 'Trinity draft order'
  const playerName = cleanString(payload.playerName || payload.customerName)
  const payer = resolvePayer(payload)
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const lineSummary = summarizeSalesOrderLines(lines)
  const customMessage = [
    'A Trinity Bat Company draft order has been submitted from the manual sales form.',
    formatSalesRepNotificationMessage(salesRep, salesRepEmail),
    playerName ? `Player: ${playerName}` : '',
    payer.name ? `Bill to: ${payer.name}` : '',
    payer.email ? `Payer email: ${payer.email}` : '',
    lineSummary ? `Order lines: ${lineSummary}` : '',
    draftOrder?.invoiceUrl
      ? `Draft invoice preview: ${normalizeDraftInvoiceUrl(draftOrder.invoiceUrl)}`
      : '',
    cleanString(payload.notes) ? `Notes: ${cleanString(payload.notes)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    to: salesRepEmail,
    subject: `${draftOrderName} Draft Order Submitted`,
    customMessage,
    ...(internalOrderNotificationEmails.length > 0
      ? { bcc: internalOrderNotificationEmails }
      : {}),
  }
}

function buildSalesRepPaidOrderEmailInput(order, jobs, salesRepEmail) {
  const relevantJobs = (Array.isArray(jobs) ? jobs : []).filter(
    (job) => job.origin === 'internal_sales',
  )
  const primaryJob =
    relevantJobs.find((job) => cleanString(job.shopifyOrderName)) ?? relevantJobs[0] ?? {}
  const originalDraftInvoiceName = cleanString(
    relevantJobs.find((job) => cleanString(job.shopifyDraftOrderName))?.shopifyDraftOrderName,
  )
  const paidOrderName = cleanString(
    relevantJobs.find((job) => cleanString(job.shopifyOrderName))?.shopifyOrderName || order?.name,
  )
  const emailReferenceName = originalDraftInvoiceName || paidOrderName
  const salesRep = cleanString(
    relevantJobs.find((job) => cleanString(job.salesRep))?.salesRep || primaryJob.salesRep,
  )
  const customerName = cleanString(
    [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(' '),
  )
  const playerName =
    cleanString(primaryJob.playerName || primaryJob.customerName) || customerName
  const payerName = cleanString(primaryJob.billingName || primaryJob.customerName)
  const payerEmail = cleanString(primaryJob.billingEmail || primaryJob.customerEmail || order?.email)
  const paidJobs = relevantJobs.filter(isPaidOrderJob)
  const lineSummary = summarizeOrderJobs(paidJobs.length > 0 ? paidJobs : relevantJobs)
  const paidAt = cleanString(order?.processed_at || order?.updated_at || new Date().toISOString())
  const customMessage = [
    'Payment received for a Trinity Bat Company draft order.',
    originalDraftInvoiceName
      ? `Original draft invoice: ${originalDraftInvoiceName}`
      : '',
    paidOrderName ? `Paid Shopify order: ${paidOrderName}` : '',
    formatSalesRepNotificationMessage(salesRep, salesRepEmail),
    playerName ? `Player: ${playerName}` : '',
    payerName ? `Bill to: ${payerName}` : '',
    payerEmail ? `Payer email: ${payerEmail}` : '',
    lineSummary ? `Order lines: ${lineSummary}` : '',
    paidAt ? `Paid notification received: ${paidAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    to: salesRepEmail,
    subject: `${emailReferenceName || 'Trinity draft order'} Draft Order Paid`,
    customMessage,
  }
}

function isPaidOrderJob(job) {
  return (
    cleanString(job.invoiceStatus).toLowerCase() === 'paid' ||
    cleanString(job.financialStatus).toLowerCase().includes('paid') ||
    Boolean(cleanString(job.salesRepPaidNotificationSentAt))
  )
}

function formatSalesRepNotificationMessage(salesRep, salesRepEmail = '') {
  const name = cleanString(salesRep)
  const email = normalizeEmail(salesRepEmail)
  if (name && email) return `Order submitted by sales rep: ${name} <${email}>`
  if (name) return `Order submitted by sales rep: ${name}`
  if (email) return `Order submitted by sales rep: ${email}`
  return ''
}

function salesRepNotificationRecipients(salesRepEmail) {
  return uniqueEmails(internalOrderNotificationEmails.concat(normalizeEmail(salesRepEmail)))
}

function summarizeSalesOrderLines(lines) {
  return lines
    .map((line) => {
      const title = cleanString(line?.title || line?.model) || 'Custom Trinity bat'
      const quantity = Number(line?.quantity || 1)
      return `${quantity} x ${title}`
    })
    .filter(Boolean)
    .join(', ')
}

function summarizeOrderJobs(jobs) {
  return jobs
    .map((job) => {
      const title = cleanString(job.productTitle) || 'Custom Trinity bat'
      const quantity = Number(job.quantity || 1)
      return `${quantity} x ${title}`
    })
    .filter(Boolean)
    .join(', ')
}

function buildOrderCreateInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
  const shippingOption = resolveShippingOption(payload, requiresShipping)
  const shippingLine = buildOrderCreateShippingLine(shippingOption)
  const productionTimeline = normalizeProductionTimeline(payload.productionTimeline)
  const rushSurchargeLine = buildOrderRushProductionSurchargeLine(payload)
  const hasProOrder = lines.some((line) => isTruthy(line.isProOrder))
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const proOrderNotificationLabel = hasProOrder
    ? buildProOrderNotificationLabel(payload, payer)
    : ''
  const directAddresses = buildDirectOrderAddresses(payload)
  const shippingAddress = requiresShipping ? directAddresses.shippingAddress : null
  const billingAddress = directAddresses.billingAddress
  const billingAddressDifferent = requiresShipping
    ? directAddresses.billingAddressDifferent
    : false
  const formattedShippingAddress = formatMailingAddress(shippingAddress)
  const formattedBillingAddress = formatMailingAddress(billingAddress)
  const note = [
    cleanString(payload.notes),
    hasProOrder ? 'Order type: Pro Order' : '',
    requiresShipping ? '' : 'Fulfillment: Local delivery / no shipping required',
    shippingOption ? `Shipping speed: ${shippingOption.label} (${shippingOption.title})` : '',
    productionTimeline === 'rush'
      ? `Production timeline: Rush (${rushProductionSurchargeAmount} per bat)`
      : 'Production timeline: Normal',
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    playerPhone ? `Player phone: ${playerPhone}` : '',
    formattedShippingAddress ? `Shipping address: ${formattedShippingAddress}` : '',
    billingAddressDifferent ? 'Billing address differs from shipping address' : '',
    billingAddressDifferent && formattedBillingAddress
      ? `Billing address: ${formattedBillingAddress}`
      : '',
    billingDifferent ? `Bill to: ${payer.name || payer.email}` : '',
    billingDifferent && payer.phone ? `Payer phone: ${payer.phone}` : '',
    payer.company ? `Team/agency: ${payer.company}` : '',
    payer.relationship ? `Billing relationship: ${payer.relationship}` : '',
    salesRep ? `Sales rep: ${salesRep}` : '',
    salesRepEmail ? `Sales rep email: ${salesRepEmail}` : '',
    orderSubmittedAt ? `Order submitted: ${orderSubmittedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    currency: shopCurrencyCode,
    financialStatus: 'PENDING',
    ...(proOrderNotificationLabel
      ? {
          sourceName: proOrderNotificationLabel,
          sourceIdentifier: intakeId,
          poNumber: proOrderNotificationLabel,
        }
      : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(shippingLine ? { shippingLines: [shippingLine] } : {}),
    note,
    tags: ['Trinity Intake', 'Internal Sales'].concat(
      salesRep ? [`Sales Rep: ${salesRep}`] : [],
      playerName ? [`Player: ${playerName}`] : [],
      hasProOrder ? ['Pro Order'] : [],
    ),
    customAttributes: compactAttributes({
      trinity_origin: 'internal_sales',
      trinity_intake_id: intakeId,
      trinity_has_pro_order: hasProOrder ? 'true' : '',
      trinity_order_type: hasProOrder ? 'Pro Order' : '',
      trinity_notification_label: proOrderNotificationLabel,
      trinity_zero_dollar_sample: isZeroDollarOrder ? 'true' : '',
      trinity_requires_shipping: requiresShipping ? 'true' : 'false',
      trinity_shipping_speed: shippingOption?.key ?? '',
      trinity_shipping_title: shippingOption?.title ?? '',
      trinity_shipping_amount: shippingOption?.amount ?? '',
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_production_timeline: productionTimeline,
      trinity_rush_production_surcharge: rushSurchargeLine
        ? `${rushProductionSurchargeAmount} ${shopCurrencyCode} per bat`
        : '',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_sales_rep_email: salesRepEmail,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: playerPhone,
      trinity_shipping_address: formattedShippingAddress,
      trinity_billing_address_different: billingAddressDifferent ? 'true' : '',
      trinity_billing_address: billingAddressDifferent ? formattedBillingAddress : '',
      trinity_billing_different: billingDifferent ? 'true' : '',
      trinity_billing_name: payer.name,
      trinity_billing_email: payer.email,
      trinity_billing_phone: payer.phone,
      trinity_billing_company: payer.company,
      trinity_billing_relationship: payer.relationship,
      trinity_staff_notification_recipients: internalOrderNotificationEmails.join(', '),
    }),
    lineItems: lines
      .map((line) => {
        const unitPrice = toMoneyBagInput(line.unitPrice)
        const isProOrder = isTruthy(line.isProOrder)
        const variantId = isProOrder ? '' : cleanString(line.variantId)
        const title = formatSalesLineShopifyTitle(line, isProOrder)
        const properties = compactLineItemProperties({
          'Order type': isProOrder ? 'Pro Order' : '',
          trinity_player_name: playerName,
          trinity_pro_order: isProOrder ? 'true' : '',
          trinity_model: cleanString(line.title || line.model),
          trinity_length: line.length,
          trinity_weight: line.targetWeight,
          trinity_wood: line.wood,
          trinity_handle_color: line.handleColor,
          trinity_barrel_color: line.barrelColor,
          trinity_band_color: line.bandColor,
          trinity_logo_color: line.logoColor,
          trinity_engraving: line.engraving,
          trinity_cupped: line.cupped,
          trinity_notes: line.notes,
          trinity_product_title: line.title,
          trinity_requires_shipping: requiresShipping ? 'true' : 'false',
        })

        return {
          ...(variantId ? { variantId } : {}),
          title,
          quantity: Number(line.quantity || 1),
          requiresShipping,
          taxable: false,
          ...(unitPrice ? { priceSet: unitPrice } : {}),
          properties,
        }
      })
      .concat(rushSurchargeLine ? [rushSurchargeLine] : []),
  }
}

function buildDraftOrderInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
  const shippingOption = resolveShippingOption(payload, requiresShipping)
  const shippingLine = buildDraftOrderShippingLine(shippingOption)
  const productionTimeline = normalizeProductionTimeline(payload.productionTimeline)
  const rushSurchargeLine = buildDraftRushProductionSurchargeLine(payload)
  const hasProOrder = lines.some((line) => isTruthy(line.isProOrder))
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const directAddresses = buildDirectOrderAddresses(payload)
  const shippingAddress = requiresShipping ? directAddresses.shippingAddress : null
  const billingAddress = directAddresses.billingAddress
  const billingAddressDifferent = requiresShipping
    ? directAddresses.billingAddressDifferent
    : false
  const formattedShippingAddress = formatMailingAddress(shippingAddress)
  const formattedBillingAddress = formatMailingAddress(billingAddress)
  const note = [
    cleanString(payload.notes),
    hasProOrder ? 'Order type: Pro Order' : '',
    requiresShipping ? '' : 'Fulfillment: Local delivery / no shipping required',
    shippingOption ? `Shipping speed: ${shippingOption.label} (${shippingOption.title})` : '',
    productionTimeline === 'rush'
      ? `Production timeline: Rush (${rushProductionSurchargeAmount} per bat)`
      : 'Production timeline: Normal',
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    playerPhone ? `Player phone: ${playerPhone}` : '',
    formattedShippingAddress ? `Shipping address: ${formattedShippingAddress}` : '',
    billingAddressDifferent ? 'Billing address differs from shipping address' : '',
    billingAddressDifferent && formattedBillingAddress
      ? `Billing address: ${formattedBillingAddress}`
      : '',
    billingDifferent ? `Bill to: ${payer.name || payer.email}` : '',
    billingDifferent && payer.phone ? `Payer phone: ${payer.phone}` : '',
    payer.company ? `Team/agency: ${payer.company}` : '',
    payer.relationship ? `Billing relationship: ${payer.relationship}` : '',
    salesRep ? `Sales rep: ${salesRep}` : '',
    salesRepEmail ? `Sales rep email: ${salesRepEmail}` : '',
    orderSubmittedAt ? `Order submitted: ${orderSubmittedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(shippingLine ? { shippingLine } : {}),
    note,
    tags: ['Trinity Intake', 'Internal Sales'].concat(
      salesRep ? [`Sales Rep: ${salesRep}`] : [],
      playerName ? [`Player: ${playerName}`] : [],
      hasProOrder ? ['Pro Order'] : [],
    ),
    customAttributes: compactAttributes({
      trinity_origin: 'internal_sales',
      trinity_intake_id: intakeId,
      trinity_has_pro_order: hasProOrder ? 'true' : '',
      trinity_order_type: hasProOrder ? 'Pro Order' : '',
      trinity_zero_dollar_sample: isZeroDollarOrder ? 'true' : '',
      trinity_requires_shipping: requiresShipping ? 'true' : 'false',
      trinity_shipping_charge: shippingLine
        ? `${shippingLine.title} ${shippingLine.priceWithCurrency.amount} ${shippingLine.priceWithCurrency.currencyCode}`
        : '',
      trinity_shipping_speed: shippingOption?.key ?? '',
      trinity_shipping_title: shippingOption?.title ?? '',
      trinity_shipping_amount: shippingOption?.amount ?? '',
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_production_timeline: productionTimeline,
      trinity_rush_production_surcharge: rushSurchargeLine
        ? `${rushProductionSurchargeAmount} ${shopCurrencyCode} per bat`
        : '',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_sales_rep_email: salesRepEmail,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: playerPhone,
      trinity_shipping_address: formattedShippingAddress,
      trinity_billing_address_different: billingAddressDifferent ? 'true' : '',
      trinity_billing_address: billingAddressDifferent ? formattedBillingAddress : '',
      trinity_billing_different: billingDifferent ? 'true' : '',
      trinity_billing_name: payer.name,
      trinity_billing_email: payer.email,
      trinity_billing_phone: payer.phone,
      trinity_billing_company: payer.company,
      trinity_billing_relationship: payer.relationship,
      trinity_staff_notification_recipients: internalOrderNotificationEmails.join(', '),
    }),
    lineItems: lines
      .map((line) => {
        const unitPrice = toMoneyInput(line.unitPrice)
        const isProOrder = isTruthy(line.isProOrder)
        const variantId = isProOrder ? '' : cleanString(line.variantId)
        const title = formatSalesLineShopifyTitle(line, isProOrder)
        const customAttributes = compactAttributes({
          order_type: isProOrder ? 'Pro Order' : '',
          trinity_player_name: playerName,
          trinity_pro_order: isProOrder ? 'true' : '',
          trinity_model: cleanString(line.title || line.model),
          trinity_length: line.length,
          trinity_weight: line.targetWeight,
          trinity_wood: line.wood,
          trinity_handle_color: line.handleColor,
          trinity_barrel_color: line.barrelColor,
          trinity_band_color: line.bandColor,
          trinity_logo_color: line.logoColor,
          trinity_engraving: line.engraving,
          trinity_cupped: line.cupped,
          trinity_notes: line.notes,
          trinity_product_title: line.title,
          trinity_requires_shipping: requiresShipping ? 'true' : 'false',
        })

        if (variantId) {
          return {
            variantId,
            quantity: Number(line.quantity || 1),
            ...(unitPrice ? { priceOverride: unitPrice } : {}),
            requiresShipping,
            taxable: false,
            customAttributes,
          }
        }

        return {
          title,
          originalUnitPriceWithCurrency: unitPrice ?? {
            amount: '0',
            currencyCode: shopCurrencyCode,
          },
          quantity: Number(line.quantity || 1),
          requiresShipping,
          taxable: false,
          customAttributes,
        }
      })
      .concat(rushSurchargeLine ? [rushSurchargeLine] : []),
  }
}

function buildDraftOrderShippingLine(shippingOption) {
  if (!shippingOption?.amount) return null

  return {
    title: shippingOption.title,
    priceWithCurrency: {
      amount: shippingOption.amount,
      currencyCode: shopCurrencyCode,
    },
  }
}

function buildOrderCreateShippingLine(shippingOption) {
  if (!shippingOption?.amount) return null

  const priceSet = toMoneyBagInput(shippingOption.amount)
  if (!priceSet) return null

  return {
    title: shippingOption.title,
    code: shippingOption.key,
    source: 'trinity_order_form',
    priceSet,
  }
}

function resolveShippingOption(payload = {}, requiresShipping = true) {
  if (!requiresShipping) return null

  const shippingSpeed = normalizeShippingSpeed(payload.shippingSpeed)
  const option =
    draftOrderShippingOptions[shippingSpeed] ?? draftOrderShippingOptions[defaultShippingSpeed]

  return option?.amount ? option : null
}

function normalizeShippingSpeed(value) {
  const key = cleanString(value).toLowerCase().replace(/[\s-]+/g, '_')
  return Object.prototype.hasOwnProperty.call(draftOrderShippingOptions, key)
    ? key
    : defaultShippingSpeed
}

function normalizeProductionTimeline(value) {
  return cleanString(value).toLowerCase() === 'rush' ? 'rush' : 'normal'
}

function buildDraftRushProductionSurchargeLine(payload = {}) {
  const quantity = getSalesOrderQuantity(payload)
  if (
    normalizeProductionTimeline(payload.productionTimeline) !== 'rush' ||
    !rushProductionSurchargeAmount ||
    quantity < 1
  ) {
    return null
  }

  return {
    title: rushProductionSurchargeTitle,
    originalUnitPriceWithCurrency: {
      amount: rushProductionSurchargeAmount,
      currencyCode: shopCurrencyCode,
    },
    quantity,
    requiresShipping: false,
    taxable: false,
    customAttributes: compactAttributes({
      trinity_surcharge_type: 'rush_production',
      trinity_production_timeline: 'rush',
      trinity_surcharge_unit_amount: rushProductionSurchargeAmount,
    }),
  }
}

function buildOrderRushProductionSurchargeLine(payload = {}) {
  const quantity = getSalesOrderQuantity(payload)
  const priceSet = toMoneyBagInput(rushProductionSurchargeAmount)
  if (
    normalizeProductionTimeline(payload.productionTimeline) !== 'rush' ||
    !priceSet ||
    quantity < 1
  ) {
    return null
  }

  return {
    title: rushProductionSurchargeTitle,
    quantity,
    requiresShipping: false,
    taxable: false,
    priceSet,
    properties: compactLineItemProperties({
      trinity_surcharge_type: 'rush_production',
      trinity_production_timeline: 'rush',
      trinity_surcharge_unit_amount: rushProductionSurchargeAmount,
    }),
  }
}

function getSalesOrderQuantity(payload = {}) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []

  return lines.reduce((total, line) => {
    const quantity = Number(line?.quantity || 1)
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0)
  }, 0)
}

function specsFromSalesLine(line = {}) {
  return {
    model: cleanString(line.title || line.model),
    length: cleanString(line.length),
    targetWeight: cleanString(line.targetWeight),
    wood: cleanString(line.wood),
    handleColor: cleanString(line.handleColor),
    barrelColor: cleanString(line.barrelColor),
    bandColor: cleanString(line.bandColor),
    logoColor: cleanString(line.logoColor),
    engraving: cleanString(line.engraving),
    cupped: cleanString(line.cupped),
    notes: cleanString(line.notes),
  }
}

function mergeSpecs(primary = {}, fallback = {}) {
  return {
    model: cleanString(primary.model) || cleanString(fallback.model),
    length: cleanString(primary.length) || cleanString(fallback.length),
    targetWeight: cleanString(primary.targetWeight) || cleanString(fallback.targetWeight),
    wood: cleanString(primary.wood) || cleanString(fallback.wood),
    handleColor: cleanString(primary.handleColor) || cleanString(fallback.handleColor),
    barrelColor: cleanString(primary.barrelColor) || cleanString(fallback.barrelColor),
    bandColor: cleanString(primary.bandColor) || cleanString(fallback.bandColor),
    logoColor: cleanString(primary.logoColor) || cleanString(fallback.logoColor),
    engraving: cleanString(primary.engraving) || cleanString(fallback.engraving),
    cupped: cleanString(primary.cupped) || cleanString(fallback.cupped),
    notes: cleanString(primary.notes) || cleanString(fallback.notes),
  }
}

function mapDraftOrderToJobs(
  draftOrder,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = draftOrder?.createdAt ?? new Date().toISOString(),
) {
  const now = new Date().toISOString()
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const draftLines = (draftOrder?.lineItems?.nodes ?? []).filter(
    (line) => !isGraphQLSurchargeLine(line),
  )
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const payer = resolvePayer(payload)
  const draftInvoiceUrl = normalizeDraftInvoiceUrl(draftOrder?.invoiceUrl)

  return lines.map((line, index) => {
    const draftLine = draftLines[index] ?? {}
    const variant = draftLine.variant ?? null
    const product = draftLine.product ?? null
    const specs = specsFromSalesLine(line)

    return {
      id: `draft-${extractNumericId(draftOrder.id)}-line-${index + 1}`,
      origin: 'internal_sales',
      intakeId,
      shopifyOrderId: '',
      shopifyOrderName: '',
      shopifyDraftOrderId: draftOrder.id,
      shopifyDraftOrderName: draftOrder.name ?? '',
      shopifyDraftInvoiceUrl: draftInvoiceUrl,
      lineItemId: draftLine.id ?? '',
      orderSubmittedAt,
      customerName: payer.name || playerName,
      customerEmail: payer.email || draftOrder.email || playerEmail,
      playerName,
      playerEmail,
      billingDifferent,
      billingName: payer.name,
      billingEmail: payer.email,
      billingPhone: payer.phone,
      billingCompany: payer.company,
      billingRelationship: payer.relationship,
      productTitle: draftLine.name || cleanString(line.title) || product?.title || 'Custom Trinity bat',
      variantTitle: variant?.title ?? '',
      shopifyProductId: product?.id ?? '',
      shopifyVariantId: variant?.id ?? cleanString(line.variantId),
      quantity: Number(line.quantity || draftLine.quantity || 1),
      financialStatus: 'draft',
      fulfillmentStatus: 'unfulfilled',
      invoiceStatus: invoiceSent ? 'sent' : 'draft',
      productionStatus: 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: cleanString(payload.salesRep),
      salesRepEmail: normalizeEmail(payload.salesRepEmail),
      totalPrice: cleanString(line.unitPrice),
      currency: draftOrder?.totalPriceSet?.shopMoney?.currencyCode ?? '',
      specs,
      lineItems: [
        {
          title: draftLine.name || cleanString(line.title),
          quantity: Number(line.quantity || 1),
          variantId: variant?.id ?? cleanString(line.variantId),
          productId: product?.id ?? '',
        },
      ],
      notes: cleanString(line.notes),
      internalNotes: cleanString(payload.notes),
      createdAt: draftOrder.createdAt ?? now,
      updatedAt: now,
    }
  })
}

function mapCompletedDraftOrderToJobs(
  order,
  draftOrder,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = draftOrder?.createdAt ?? order?.createdAt ?? new Date().toISOString(),
) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return mapGraphQLOrderToJobs(order).map((job, index) => {
    const line = lines[index] ?? {}
    const fallbackSpecs = specsFromSalesLine(line)

    return {
      ...job,
      origin: 'internal_sales',
      intakeId,
      shopifyDraftOrderId: draftOrder.id,
      shopifyDraftOrderName: draftOrder.name ?? '',
      shopifyDraftInvoiceUrl: normalizeDraftInvoiceUrl(draftOrder.invoiceUrl),
      orderSubmittedAt: job.orderSubmittedAt || orderSubmittedAt,
      invoiceStatus: invoiceSent ? 'sent' : job.invoiceStatus,
      salesRep: job.salesRep || cleanString(payload.salesRep),
      salesRepEmail: job.salesRepEmail || normalizeEmail(payload.salesRepEmail),
      specs: mergeSpecs(job.specs, fallbackSpecs),
      internalNotes: cleanString(payload.notes),
      notes: job.notes || cleanString(line.notes),
      totalPrice: cleanString(line.unitPrice) || job.totalPrice,
    }
  })
}

function mapCreatedOrderToJobs(
  order,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = order?.createdAt ?? new Date().toISOString(),
) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return mapGraphQLOrderToJobs(order).map((job, index) => {
    const line = lines[index] ?? {}
    const fallbackSpecs = specsFromSalesLine(line)

    return {
      ...job,
      origin: 'internal_sales',
      intakeId,
      orderSubmittedAt: job.orderSubmittedAt || orderSubmittedAt,
      invoiceStatus: invoiceSent ? 'sent' : job.invoiceStatus,
      salesRep: job.salesRep || cleanString(payload.salesRep),
      salesRepEmail: job.salesRepEmail || normalizeEmail(payload.salesRepEmail),
      specs: mergeSpecs(job.specs, fallbackSpecs),
      internalNotes: cleanString(payload.notes),
      notes: job.notes || cleanString(line.notes),
      totalPrice: cleanString(line.unitPrice) || job.totalPrice,
    }
  })
}

function mapGraphQLOrderToJobs(order) {
  const orderAttributes = attributesToRecord(order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const rawLines = order.lineItems?.nodes ?? []
  const lines =
    origin === 'internal_sales'
      ? rawLines.filter((line) => !isGraphQLSurchargeLine(line))
      : rawLines.filter((line) => isBatProductLike(line.variant?.product ?? { title: line.title }))
  const money = order.currentTotalPriceSet?.shopMoney ?? {}

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.customAttributes)
    const variant = line.variant ?? null
    const product = variant?.product ?? null
    const specs = extractSpecs(orderAttributes, lineAttributes)
    const identity = extractOrderIdentity(
      orderAttributes,
      lineAttributes,
      order.customer?.displayName ?? '',
      order.email ?? order.customer?.email ?? '',
    )

    return {
      id: `order-${extractNumericId(order.id)}-line-${extractNumericId(line.id)}`,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      shopifyOrderId: order.id,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: '',
      shopifyDraftOrderName: '',
      lineItemId: line.id,
      orderSubmittedAt: orderAttributes.trinity_order_submitted_at ?? order.createdAt,
      customerName: order.customer?.displayName ?? '',
      customerEmail: order.email ?? order.customer?.email ?? '',
      playerName: identity.playerName,
      playerEmail: identity.playerEmail,
      billingDifferent: identity.billingDifferent,
      billingName: identity.billingName,
      billingEmail: identity.billingEmail,
      billingPhone: identity.billingPhone,
      billingCompany: identity.billingCompany,
      billingRelationship: identity.billingRelationship,
      productTitle: line.title ?? product?.title ?? '',
      variantTitle: variant?.title ?? '',
      shopifyProductId: product?.id ?? '',
      shopifyVariantId: variant?.id ?? '',
      quantity: Number(line.quantity || 1),
      financialStatus: order.displayFinancialStatus ?? '',
      fulfillmentStatus: order.displayFulfillmentStatus ?? '',
      invoiceStatus: String(order.displayFinancialStatus ?? '').toLowerCase().includes('paid')
        ? 'paid'
        : origin === 'website'
          ? 'not_required'
          : 'sent',
      productionStatus: 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: orderAttributes.trinity_sales_rep ?? '',
      salesRepEmail: normalizeEmail(orderAttributes.trinity_sales_rep_email),
      totalPrice: getGraphQLLineUnitPrice(line, money.amount),
      currency: money.currencyCode ?? '',
      specs,
      lineItems: [
        {
          title: line.title,
          quantity: Number(line.quantity || 1),
          variantId: variant?.id ?? '',
          productId: product?.id ?? '',
        },
      ],
      notes: lineAttributes.trinity_notes ?? order.note ?? '',
      internalNotes: '',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? new Date().toISOString(),
    }
  })
}

function getGraphQLLineUnitPrice(line, fallbackAmount = '') {
  const unitAmount =
    getGraphQLMoneyAmount(line?.discountedUnitPriceSet) ||
    getGraphQLMoneyAmount(line?.originalUnitPriceSet)
  if (unitAmount) return unitAmount

  const quantity = Number(line?.quantity || 1)
  const totalAmount =
    getGraphQLMoneyAmount(line?.discountedTotalSet) ||
    getGraphQLMoneyAmount(line?.originalTotalSet)
  const total = Number(totalAmount)
  if (Number.isFinite(total) && Number.isFinite(quantity) && quantity > 0) {
    return String(total / quantity)
  }

  return cleanString(fallbackAmount)
}

function getGraphQLMoneyAmount(moneySet) {
  return cleanString(moneySet?.shopMoney?.amount)
}

function mapOrderWebhookToJobs(order, topic) {
  const orderAttributes = attributesToRecord(order.note_attributes ?? order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const rawLines = order.line_items ?? []
  const lines =
    origin === 'internal_sales'
      ? rawLines.filter((line) => !isWebhookSurchargeLine(line))
      : rawLines.filter((line) =>
          isBatProductLike({
            title: line.title ?? line.name,
            productType: line.product_type,
            tags: line.tags,
          }),
        )
  const orderId = order.admin_graphql_api_id ?? toShopifyGid('Order', order.id)
  const isCancelled = Boolean(order.cancelled_at) || topic === 'orders/cancelled'

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.properties)
    const lineItemId = line.admin_graphql_api_id ?? toShopifyGid('LineItem', line.id)
    const specs = extractSpecs(orderAttributes, lineAttributes)
    const identity = extractOrderIdentity(
      orderAttributes,
      lineAttributes,
      customerNameFromWebhook(order.customer),
      order.email ?? order.customer?.email ?? '',
    )

    return {
      id: `order-${extractNumericId(orderId)}-line-${extractNumericId(lineItemId)}`,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      shopifyOrderId: orderId,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: orderAttributes.trinity_draft_order_id ?? '',
      shopifyDraftOrderName: '',
      lineItemId,
      orderSubmittedAt: orderAttributes.trinity_order_submitted_at ?? order.created_at,
      customerName: customerNameFromWebhook(order.customer),
      customerEmail: order.email ?? order.customer?.email ?? '',
      playerName: identity.playerName,
      playerEmail: identity.playerEmail,
      billingDifferent: identity.billingDifferent,
      billingName: identity.billingName,
      billingEmail: identity.billingEmail,
      billingPhone: identity.billingPhone,
      billingCompany: identity.billingCompany,
      billingRelationship: identity.billingRelationship,
      productTitle: line.title ?? line.name ?? '',
      variantTitle: line.variant_title ?? '',
      shopifyProductId: line.product_id ? toShopifyGid('Product', line.product_id) : '',
      shopifyVariantId: line.variant_id ? toShopifyGid('ProductVariant', line.variant_id) : '',
      quantity: Number(line.quantity || 1),
      financialStatus: order.financial_status ?? '',
      fulfillmentStatus: order.fulfillment_status ?? 'unfulfilled',
      invoiceStatus:
        String(order.financial_status ?? '').toLowerCase() === 'paid'
          ? 'paid'
          : origin === 'website'
            ? 'not_required'
            : 'sent',
      productionStatus: isCancelled ? 'cancelled' : 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: orderAttributes.trinity_sales_rep ?? '',
      salesRepEmail: normalizeEmail(orderAttributes.trinity_sales_rep_email),
      totalPrice: cleanString(line.price),
      currency: order.currency ?? '',
      specs,
      lineItems: [
        {
          title: line.title ?? '',
          quantity: Number(line.quantity || 1),
          variantId: line.variant_id ? toShopifyGid('ProductVariant', line.variant_id) : '',
          productId: line.product_id ? toShopifyGid('Product', line.product_id) : '',
        },
      ],
      notes: lineAttributes.trinity_notes ?? order.note ?? '',
      internalNotes: '',
      createdAt: order.created_at,
      updatedAt: order.updated_at ?? new Date().toISOString(),
    }
  })
}

function mergeOrderJob(existing, incoming) {
  if (!existing) return incoming

  return {
    ...existing,
    ...incoming,
    productionStatus:
      incoming.productionStatus === 'cancelled'
        ? 'cancelled'
        : existing.productionStatus || incoming.productionStatus,
    shopifyDraftOrderId: existing.shopifyDraftOrderId || incoming.shopifyDraftOrderId,
    shopifyDraftOrderName: existing.shopifyDraftOrderName || incoming.shopifyDraftOrderName,
    shopifyDraftInvoiceUrl: existing.shopifyDraftInvoiceUrl || incoming.shopifyDraftInvoiceUrl,
    assignedBilletId: existing.assignedBilletId || incoming.assignedBilletId,
    linkedProducedBatId: existing.linkedProducedBatId || incoming.linkedProducedBatId,
    orderSubmittedAt:
      existing.orderSubmittedAt ||
      incoming.orderSubmittedAt ||
      existing.createdAt ||
      incoming.createdAt,
    salesRep: existing.salesRep || incoming.salesRep,
    salesRepEmail: existing.salesRepEmail || incoming.salesRepEmail,
    salesRepSubmissionNotificationSentAt:
      existing.salesRepSubmissionNotificationSentAt ||
      incoming.salesRepSubmissionNotificationSentAt,
    salesRepPaidNotificationSentAt:
      existing.salesRepPaidNotificationSentAt || incoming.salesRepPaidNotificationSentAt,
    playerName: existing.playerName || incoming.playerName,
    playerEmail: existing.playerEmail || incoming.playerEmail,
    billingDifferent: existing.billingDifferent || incoming.billingDifferent,
    billingName: existing.billingName || incoming.billingName,
    billingEmail: existing.billingEmail || incoming.billingEmail,
    billingPhone: existing.billingPhone || incoming.billingPhone,
    billingCompany: existing.billingCompany || incoming.billingCompany,
    billingRelationship: existing.billingRelationship || incoming.billingRelationship,
    specs: mergeSpecs(existing.specs, incoming.specs),
    internalNotes: existing.internalNotes || incoming.internalNotes,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  }
}

function findMatchingOrderJob(existingJobs, incomingJob) {
  return existingJobs.find((job) => {
    if (job.id === incomingJob.id) return true
    if (job.lineItemId && job.lineItemId === incomingJob.lineItemId) return true
    return Boolean(
      job.intakeId &&
        incomingJob.intakeId &&
        job.intakeId === incomingJob.intakeId &&
        job.productTitle === incomingJob.productTitle,
    )
  })
}

function extractSpecs(orderAttributes, lineAttributes) {
  return {
    model: lineAttributes.trinity_model ?? orderAttributes.trinity_model ?? '',
    length: lineAttributes.trinity_length ?? orderAttributes.trinity_length ?? '',
    targetWeight: lineAttributes.trinity_weight ?? orderAttributes.trinity_weight ?? '',
    wood: lineAttributes.trinity_wood ?? orderAttributes.trinity_wood ?? '',
    handleColor: lineAttributes.trinity_handle_color ?? orderAttributes.trinity_handle_color ?? '',
    barrelColor: lineAttributes.trinity_barrel_color ?? orderAttributes.trinity_barrel_color ?? '',
    bandColor: lineAttributes.trinity_band_color ?? orderAttributes.trinity_band_color ?? '',
    logoColor: lineAttributes.trinity_logo_color ?? orderAttributes.trinity_logo_color ?? '',
    engraving: lineAttributes.trinity_engraving ?? orderAttributes.trinity_engraving ?? '',
    cupped: lineAttributes.trinity_cupped ?? orderAttributes.trinity_cupped ?? '',
    notes: lineAttributes.trinity_notes ?? orderAttributes.trinity_notes ?? '',
  }
}

function extractOrderIdentity(orderAttributes, lineAttributes, fallbackName, fallbackEmail) {
  const playerName =
    attributeValue([lineAttributes, orderAttributes], [
      'trinity_player_name',
      'player_name',
      'player',
      'player name',
      'name on bat',
    ]) || cleanString(fallbackName)
  const playerEmail =
    attributeValue([lineAttributes, orderAttributes], [
      'trinity_player_email',
      'player_email',
      'player email',
    ]) || ''
  const billingName =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_name',
      'billing_name',
      'bill_to_name',
      'bill to',
      'payer_name',
      'team',
      'agent',
    ]) || cleanString(fallbackName)
  const billingEmail =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_email',
      'billing_email',
      'bill_to_email',
      'payer_email',
    ]) || cleanString(fallbackEmail)
  const billingPhone =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_phone',
      'billing_phone',
      'bill_to_phone',
      'payer_phone',
      'phone',
    ]) || ''
  const billingCompany =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_company',
      'billing_company',
      'team',
      'agency',
    ]) || ''
  const billingRelationship =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_relationship',
      'billing_relationship',
      'payer_relationship',
      'relationship',
    ]) || ''
  const explicitDifferent = attributeValue([orderAttributes, lineAttributes], [
    'trinity_billing_different',
    'billing_different',
  ])

  return {
    playerName,
    playerEmail,
    billingDifferent:
      isTruthy(explicitDifferent) ||
      Boolean(playerName && billingName && playerName.toLowerCase() !== billingName.toLowerCase()),
    billingName,
    billingEmail,
    billingPhone,
    billingCompany,
    billingRelationship,
  }
}

function attributeValue(records, keys) {
  const normalizedKeys = keys.map(normalizeAttributeKey)

  for (const record of records) {
    for (const [key, value] of Object.entries(record ?? {})) {
      if (normalizedKeys.includes(normalizeAttributeKey(key))) {
        return cleanString(value)
      }
    }
  }

  return ''
}

function normalizeAttributeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function isTruthy(value) {
  return ['true', 'yes', '1', 'on'].includes(cleanString(value).toLowerCase())
}

function requiresShippingForOrder(payload = {}) {
  const value = payload.requiresShipping
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined || cleanString(value) === '') return true
  return !['false', 'no', '0', 'off'].includes(cleanString(value).toLowerCase())
}

function normalizePositiveMoneyAmount(value) {
  const amount = Number(cleanString(value))
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return amount.toFixed(2)
}

function normalizeNonNegativeMoneyAmount(value) {
  const amount = Number(cleanString(value))
  if (!Number.isFinite(amount) || amount < 0) return ''
  return amount.toFixed(2)
}

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function isBatProductLike(product) {
  const title = cleanString(product?.title ?? product?.name).toLowerCase()
  const productType = cleanString(product?.productType ?? product?.category).toLowerCase()
  const tags = Array.isArray(product?.tags)
    ? product.tags.map((tag) => cleanString(tag).toLowerCase())
    : cleanString(product?.tags)
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
  const text = [title, productType, ...tags].join(' ')

  if (
    productType.includes('apparel') ||
    text.includes('accessor') ||
    title.includes('shirt') ||
    title.includes('hat') ||
    title.includes('sleeve') ||
    title.includes('grip') ||
    title.includes('glove')
  ) {
    return false
  }

  return (
    productType.includes('series') ||
    title.includes('bat') ||
    title.includes('pro model') ||
    title.includes('pro select') ||
    title.includes('fungo') ||
    title.includes('trainer') ||
    title.includes('boom stick') ||
    title.includes('platinum') ||
    title.includes('scvbb') ||
    tags.some((tag) => ['ash', 'birch', 'maple', 'stock', 'custom', 'semi custom'].includes(tag))
  )
}

function isGraphQLSurchargeLine(line) {
  return isRushProductionSurchargeAttributes(attributesToRecord(line?.customAttributes))
}

function isWebhookSurchargeLine(line) {
  return isRushProductionSurchargeAttributes(attributesToRecord(line?.properties))
}

function isRushProductionSurchargeAttributes(attributes = {}) {
  for (const [key, value] of Object.entries(attributes)) {
    if (
      normalizeAttributeKey(key) === 'trinity_surcharge_type' &&
      cleanString(value).toLowerCase() === 'rush_production'
    ) {
      return true
    }
  }

  return false
}

function attributesToRecord(attributes) {
  const record = {}
  if (!Array.isArray(attributes)) return record

  for (const attribute of attributes) {
    const key = attribute?.key ?? attribute?.name
    if (!key) continue
    record[key] = attribute?.value ?? ''
  }

  return record
}

function compactAttributes(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => ({ key, value: String(value) }))
}

function compactLineItemProperties(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([name, value]) => ({ name, value: String(value) }))
}

function verifyShopifyWebhook(request) {
  if (!webhookSecret) return true

  const hmac = request.get('x-shopify-hmac-sha256') ?? ''
  const digest = crypto.createHmac('sha256', webhookSecret).update(request.body).digest('base64')
  const received = Buffer.from(hmac)
  const expected = Buffer.from(digest)

  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

function resolvePublicBaseUrl(request, explicitBaseUrl) {
  if (explicitBaseUrl) return String(explicitBaseUrl)
  if (process.env.SHOPIFY_APP_URL) return process.env.SHOPIFY_APP_URL
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL

  const host = request.get('x-forwarded-host') ?? request.get('host')
  if (!host || host.includes('127.0.0.1') || host.includes('localhost')) return ''

  const protocol = request.get('x-forwarded-proto') ?? request.protocol ?? 'https'
  return `${protocol}://${host}`
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

function normalizeHostname(value) {
  const host = cleanString(value)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim()
    .toLowerCase()

  return host
}

function normalizeDraftInvoiceUrl(invoiceUrl) {
  const rawUrl = cleanString(invoiceUrl)
  if (!rawUrl || !draftInvoiceHost) return rawUrl

  try {
    const url = new URL(rawUrl)
    const knownInvoiceHosts = new Set(
      [shopDomain, draftInvoiceHost, 'trinitybatco.com', 'www.trinitybatco.com']
        .map(normalizeHostname)
        .filter(Boolean),
    )

    if (!knownInvoiceHosts.has(normalizeHostname(url.hostname))) return rawUrl

    url.protocol = 'https:'
    url.hostname = draftInvoiceHost
    url.port = ''
    return url.toString()
  } catch {
    return rawUrl
  }
}

function normalizeDraftOrderInvoiceUrl(draftOrder) {
  if (!draftOrder) return draftOrder

  return {
    ...draftOrder,
    invoiceUrl: normalizeDraftInvoiceUrl(draftOrder.invoiceUrl),
  }
}

function createPlainId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseEmailList(value, fallback = [], required = []) {
  const configuredEmails = cleanString(value)
    .split(/[\s,;]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
  const emails = (configuredEmails.length > 0 ? configuredEmails : fallback).concat(required)

  return uniqueEmails(emails)
}

function uniqueEmails(emails) {
  return Array.from(new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean)))
}

function normalizeEmail(email) {
  const normalized = cleanString(email).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

function toMoneyInput(value) {
  const amount = cleanString(value)
  if (!amount) return null

  const normalizedAmount = Number(amount)
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) return null

  return {
    amount,
    currencyCode: shopCurrencyCode,
  }
}

function toMoneyBagInput(value) {
  const money = toMoneyInput(value)
  if (!money) return null

  return {
    shopMoney: money,
    presentmentMoney: money,
  }
}

function cleanString(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function customerNameFromWebhook(customer) {
  if (!customer) return ''
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
  return name || customer.email || ''
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

function toBooleanValue(value) {
  return value ? 'true' : 'false'
}

function toLegacyBarrelKnotValue(value) {
  if (value === 'N/A' || value === undefined || value === null || value === '') return null
  if (value === 'Yes' || value === true) return 'true'
  return 'false'
}

function toNumericValue(value) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}
