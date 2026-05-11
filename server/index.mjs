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
const port = Number(process.env.PORT ?? 4177)
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_API_SECRET
const shopCurrencyCode = process.env.SHOPIFY_CURRENCY_CODE ?? 'USD'
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
      definitionField('player_name', 'Player or Trainer Name', 'single_line_text_field'),
      definitionField('bats_json', 'Bats JSON', 'json'),
    ],
  },
  producedBats: {
    type: '$app:trinity_produced_bat',
    name: 'Trinity Produced Bat',
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
}

let definitionPromise = null

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
      await Promise.all(
        incomingJobs.map((job) =>
          upsertRecord(
            resourceConfigs.orderJobs,
            mergeOrderJob(
              findMatchingOrderJob(existingJobs, job),
              job,
            ),
          ),
        ),
      )
    }

    response.status(200).json({ ok: true, jobs: incomingJobs.length })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify webhook error.',
    })
  }
})

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: Boolean(shopDomain && adminToken),
    shop: shopDomain ?? null,
    apiVersion,
  })
})

app.get('/api/state', async (_request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    await ensureDefinitions()
    const billets = await listRecords(resourceConfigs.billets)
    const players = await listRecords(resourceConfigs.players)
    const producedBats = await listRecords(resourceConfigs.producedBats)
    const customBatModels = await listRecords(resourceConfigs.customBatModels)
    const orderJobs = await listRecords(resourceConfigs.orderJobs)
    const billingContacts = await listRecords(resourceConfigs.billingContacts)

    response.json({
      ok: true,
      billets,
      players,
      producedBats,
      customBatModels,
      orderJobs,
      billingContacts,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
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

    const products = await listCatalogProducts()
    response.json({ ok: true, products })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify catalog error.',
    })
  }
})

app.put('/api/state', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const payload = request.body ?? {}
    await ensureDefinitions()

    await Promise.all([
      upsertRecords(resourceConfigs.billets, payload.billets ?? []),
      upsertRecords(resourceConfigs.players, payload.players ?? []),
      upsertRecords(resourceConfigs.producedBats, payload.producedBats ?? []),
      upsertRecords(resourceConfigs.customBatModels, payload.customBatModels ?? []),
      upsertRecords(resourceConfigs.orderJobs, payload.orderJobs ?? [], {
        deleteMissing: false,
      }),
      upsertRecords(resourceConfigs.billingContacts, payload.billingContacts ?? [], {
        deleteMissing: false,
      }),
    ])

    await syncOrderJobMetafields(payload.orderJobs ?? [])

    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
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
    const intakeId = createPlainId('sales')
    const orderSubmittedAt = new Date().toISOString()
    const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
    const shouldSendInvoice = payload.sendInvoice !== false || isZeroDollarOrder
    const orderInput = buildOrderCreateInput(payload, intakeId, orderSubmittedAt)

    await ensureDefinitions()
    const order = await createPendingOrder(orderInput, {
      sendReceipt: shouldSendInvoice && isZeroDollarOrder,
    })

    let invoiceSent = shouldSendInvoice && isZeroDollarOrder
    if (shouldSendInvoice && !isZeroDollarOrder && order?.id) {
      await sendOrderInvoice(order.id, buildOrderInvoiceEmailInput(payload, order))
      invoiceSent = true
    }

    const jobs = mapCreatedOrderToJobs(order, payload, intakeId, invoiceSent, orderSubmittedAt)
    await Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))
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
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify draft order error.',
    })
  }
})

app.post('/api/draft-orders/send-invoice', async (request, response) => {
  try {
    const draftOrderId = request.body?.draftOrderId
    if (!draftOrderId) {
      response.status(400).json({ ok: false, message: 'draftOrderId is required.' })
      return
    }

    await sendDraftOrderInvoice(draftOrderId)
    response.json({ ok: true })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown invoice send error.',
    })
  }
})

app.post('/api/orders/import', async (request, response) => {
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

    await Promise.all(mergedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))

    response.json({
      ok: true,
      importedOrders: orders.length,
      orderJobs: mergedJobs,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify order import error.',
    })
  }
})

app.post('/api/webhooks/register', async (request, response) => {
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

  return handle
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

  return result?.data?.draftOrderCreate?.draftOrder
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

async function sendDraftOrderInvoice(draftOrderId) {
  const result = await shopifyGraphQL(
    `
      mutation SendDraftOrderInvoice($id: ID!) {
        draftOrderInvoiceSend(id: $id) {
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
    { id: draftOrderId },
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
  if (isTruthy(payload.billingDifferent)) {
    return {
      shippingAddress: null,
      billingAddress: null,
      billingAddressDifferent: false,
    }
  }

  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const shippingAddress = buildMailingAddressInput(payload, 'shipping', playerName, playerPhone)
  const billingAddressDifferent = isTruthy(payload.billingAddressDifferent)
  const billingAddress = billingAddressDifferent
    ? buildMailingAddressInput(payload, 'billing', playerName, playerPhone)
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
  const playerName = cleanString(payload.playerName || payload.customerName)
  const billingCompany = cleanString(payload.billingCompany)
  const customMessage = [
    'A Trinity Bat Company invoice has been created from an internal sales order.',
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
      : `${order?.name ?? 'Shopify order'} invoice from Trinity Bat Company`,
    customMessage,
  }

  if (internalOrderNotificationEmails.length > 0) {
    emailInput.bcc = internalOrderNotificationEmails
  }

  return emailInput
}

function buildOrderCreateInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const salesRep = cleanString(payload.salesRep)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
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
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    !billingDifferent && payer.phone ? `Player phone: ${payer.phone}` : '',
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
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: !billingDifferent ? payer.phone : '',
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
    lineItems: lines.map((line) => {
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
    }),
  }
}

function buildDraftOrderInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const salesRep = cleanString(payload.salesRep)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
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
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    !billingDifferent && payer.phone ? `Player phone: ${payer.phone}` : '',
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
    orderSubmittedAt ? `Order submitted: ${orderSubmittedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
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
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: !billingDifferent ? payer.phone : '',
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
    lineItems: lines.map((line) => {
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
        customAttributes,
      }
    }),
  }
}

function specsFromSalesLine(line = {}) {
  return {
    model: cleanString(line.title || line.model),
    length: cleanString(line.length),
    targetWeight: cleanString(line.targetWeight),
    wood: cleanString(line.wood),
    handleColor: cleanString(line.handleColor),
    barrelColor: cleanString(line.barrelColor),
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
  const draftLines = draftOrder?.lineItems?.nodes ?? []
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const payer = resolvePayer(payload)

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
      orderSubmittedAt: job.orderSubmittedAt || orderSubmittedAt,
      invoiceStatus: invoiceSent ? 'sent' : job.invoiceStatus,
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
      ? rawLines
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
      totalPrice: money.amount ?? '',
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

function mapOrderWebhookToJobs(order, topic) {
  const orderAttributes = attributesToRecord(order.note_attributes ?? order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const rawLines = order.line_items ?? []
  const lines =
    origin === 'internal_sales'
      ? rawLines
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
    assignedBilletId: existing.assignedBilletId || incoming.assignedBilletId,
    linkedProducedBatId: existing.linkedProducedBatId || incoming.linkedProducedBatId,
    orderSubmittedAt:
      existing.orderSubmittedAt ||
      incoming.orderSubmittedAt ||
      existing.createdAt ||
      incoming.createdAt,
    salesRep: existing.salesRep || incoming.salesRep,
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

function createPlainId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseEmailList(value, fallback = [], required = []) {
  const configuredEmails = cleanString(value)
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  const emails = (configuredEmails.length > 0 ? configuredEmails : fallback).concat(required)

  return Array.from(
    new Set(
      emails
        .map((email) => cleanString(email).toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  )
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
