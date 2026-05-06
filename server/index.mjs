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

const resourceConfigs = {
  billets: {
    type: '$app:trinity_billet',
    name: 'Trinity Billet',
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
        fieldValue('customer_name', item.customerName),
        fieldValue('customer_email', item.customerEmail),
        fieldValue('product_title', item.productTitle),
        fieldValue('variant_title', item.variantTitle),
        fieldValue('quantity', item.quantity),
        fieldValue('financial_status', item.financialStatus),
        fieldValue('fulfillment_status', item.fulfillmentStatus),
        fieldValue('invoice_status', item.invoiceStatus),
        fieldValue('production_status', item.productionStatus),
        fieldValue('assigned_billet_id', item.assignedBilletId),
        fieldValue('due_date', item.dueDate),
        fieldValue('sales_rep', item.salesRep),
        fieldValue('total_price', item.totalPrice),
        fieldValue('specs_json', JSON.stringify(item.specs ?? {})),
        fieldValue('line_items_json', JSON.stringify(item.lineItems ?? [])),
        fieldValue('internal_notes', item.internalNotes),
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
      definitionField('customer_name', 'Customer Name', 'single_line_text_field'),
      definitionField('customer_email', 'Customer Email', 'single_line_text_field'),
      definitionField('product_title', 'Product Title', 'single_line_text_field'),
      definitionField('variant_title', 'Variant Title', 'single_line_text_field'),
      definitionField('quantity', 'Quantity', 'number_integer'),
      definitionField('financial_status', 'Financial Status', 'single_line_text_field'),
      definitionField('fulfillment_status', 'Fulfillment Status', 'single_line_text_field'),
      definitionField('invoice_status', 'Invoice Status', 'single_line_text_field'),
      definitionField('production_status', 'Production Status', 'single_line_text_field'),
      definitionField('assigned_billet_id', 'Assigned Billet ID', 'single_line_text_field'),
      definitionField('due_date', 'Due Date', 'single_line_text_field'),
      definitionField('sales_rep', 'Sales Rep', 'single_line_text_field'),
      definitionField('total_price', 'Total Price', 'single_line_text_field'),
      definitionField('specs_json', 'Specs JSON', 'json'),
      definitionField('line_items_json', 'Line Items JSON', 'json'),
      definitionField('internal_notes', 'Internal Notes', 'multi_line_text_field'),
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
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    await ensureDefinitions()
    const [billets, players, producedBats, customBatModels, orderJobs] = await Promise.all([
      listRecords(resourceConfigs.billets),
      listRecords(resourceConfigs.players),
      listRecords(resourceConfigs.producedBats),
      listRecords(resourceConfigs.customBatModels),
      listRecords(resourceConfigs.orderJobs),
    ])

    response.json({
      ok: true,
      billets,
      players,
      producedBats,
      customBatModels,
      orderJobs,
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
    const draftInput = buildDraftOrderInput(payload, intakeId)

    await ensureDefinitions()
    const draftOrder = await createDraftOrder(draftInput)

    let invoiceSent = false
    if (payload.sendInvoice !== false) {
      await sendDraftOrderInvoice(draftOrder.id)
      invoiceSent = true
    }

    const jobs = mapDraftOrderToJobs(draftOrder, payload, intakeId, invoiceSent)
    await Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))

    response.json({
      ok: true,
      draftOrder,
      invoiceSent,
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

app.use(express.static(path.join(rootDir, 'dist')))

app.get('/{*path}', (_request, response) => {
  response.sendFile(path.join(rootDir, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Trinity billet server listening on http://127.0.0.1:${port}`)
})

async function ensureDefinitions() {
  if (!definitionPromise) {
    definitionPromise = Promise.all(
      Object.values(resourceConfigs).map(async (config) => {
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
        const meaningfulErrors = errors.filter(
          (item) => {
            const message = String(item?.message ?? '').toLowerCase()
            return !message.includes('already exists') && !message.includes('already been taken')
          },
        )

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
      }),
    )
  }

  return definitionPromise
}

async function listRecords(config) {
  const nodes = await listMetaobjectNodes(config.type)
  return nodes
    .map((node) => node?.payload?.jsonValue)
    .filter(Boolean)
}

async function listMetaobjectNodes(type) {
  const result = await shopifyGraphQL(
    `
      query ListMetaobjects($type: String!) {
        metaobjects(type: $type, first: 250, sortKey: "updated_at", reverse: true) {
          nodes {
            id
            handle
            updatedAt
            payload: field(key: "payload") {
              jsonValue
            }
          }
        }
      }
    `,
    { type },
  )

  return result?.data?.metaobjects?.nodes ?? []
}

async function upsertRecords(config, items, options = {}) {
  const deleteMissing = options.deleteMissing ?? config.deleteMissing ?? true
  const desiredHandles = new Set()

  for (const item of items) {
    const handle = await upsertRecord(config, item)
    desiredHandles.add(handle)
  }

  if (!deleteMissing) return

  const existingNodes = await listMetaobjectNodes(config.type)
  for (const node of existingNodes) {
    if (!desiredHandles.has(node.handle)) {
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
    }
  }
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
    const body = await response.text()
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join(', '))
  }

  return payload
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
      ...nodes.map((product) => ({
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
      orderMetafield(ownerId, 'due_date', job.dueDate),
      orderMetafield(ownerId, 'sales_rep', job.salesRep),
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

function buildDraftOrderInput(payload, intakeId) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const salesRep = cleanString(payload.salesRep)
  const dueDate = cleanString(payload.dueDate)
  const note = [
    cleanString(payload.notes),
    salesRep ? `Sales rep: ${salesRep}` : '',
    dueDate ? `Due date: ${dueDate}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: cleanString(payload.customerEmail) || undefined,
    note,
    tags: ['Trinity Intake', 'Internal Sales'].concat(salesRep ? [`Sales Rep: ${salesRep}`] : []),
    customAttributes: compactAttributes({
      trinity_origin: 'internal_sales',
      trinity_intake_id: intakeId,
      trinity_sales_rep: salesRep,
      trinity_due_date: dueDate,
    }),
    lineItems: lines.map((line) => {
      const customAttributes = compactAttributes({
        trinity_model: line.model,
        trinity_length: line.length,
        trinity_weight: line.targetWeight,
        trinity_wood: line.wood,
        trinity_notes: line.notes,
      })

      if (line.variantId) {
        return {
          variantId: line.variantId,
          quantity: Number(line.quantity || 1),
          customAttributes,
        }
      }

      return {
        title: cleanString(line.title) || 'Custom Trinity bat',
        originalUnitPrice: Number(line.unitPrice || 0),
        quantity: Number(line.quantity || 1),
        customAttributes,
      }
    }),
  }
}

function mapDraftOrderToJobs(draftOrder, payload, intakeId, invoiceSent) {
  const now = new Date().toISOString()
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const draftLines = draftOrder?.lineItems?.nodes ?? []

  return lines.map((line, index) => {
    const draftLine = draftLines[index] ?? {}
    const variant = draftLine.variant ?? null
    const product = draftLine.product ?? null
    const specs = {
      model: cleanString(line.model),
      length: cleanString(line.length),
      targetWeight: cleanString(line.targetWeight),
      wood: cleanString(line.wood),
      notes: cleanString(line.notes),
    }

    return {
      id: `draft-${extractNumericId(draftOrder.id)}-line-${index + 1}`,
      origin: 'internal_sales',
      intakeId,
      shopifyOrderId: '',
      shopifyOrderName: '',
      shopifyDraftOrderId: draftOrder.id,
      shopifyDraftOrderName: draftOrder.name ?? '',
      lineItemId: draftLine.id ?? '',
      customerName: cleanString(payload.customerName),
      customerEmail: cleanString(payload.customerEmail) || draftOrder.email || '',
      productTitle: draftLine.name ?? cleanString(line.title) ?? product?.title ?? 'Custom Trinity bat',
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
      dueDate: cleanString(payload.dueDate),
      salesRep: cleanString(payload.salesRep),
      totalPrice: cleanString(line.unitPrice),
      currency: draftOrder?.totalPriceSet?.shopMoney?.currencyCode ?? '',
      specs,
      lineItems: [
        {
          title: draftLine.name ?? cleanString(line.title),
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

function mapGraphQLOrderToJobs(order) {
  const orderAttributes = attributesToRecord(order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const lines = order.lineItems?.nodes ?? []
  const money = order.currentTotalPriceSet?.shopMoney ?? {}

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.customAttributes)
    const variant = line.variant ?? null
    const product = variant?.product ?? null
    const specs = extractSpecs(orderAttributes, lineAttributes)

    return {
      id: `order-${extractNumericId(order.id)}-line-${extractNumericId(line.id)}`,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      shopifyOrderId: order.id,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: '',
      shopifyDraftOrderName: '',
      lineItemId: line.id,
      customerName: order.customer?.displayName ?? '',
      customerEmail: order.email ?? order.customer?.email ?? '',
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
      dueDate: orderAttributes.trinity_due_date ?? '',
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
  const lines = order.line_items ?? []
  const orderId = order.admin_graphql_api_id ?? toShopifyGid('Order', order.id)
  const isCancelled = Boolean(order.cancelled_at) || topic === 'orders/cancelled'

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.properties)
    const lineItemId = line.admin_graphql_api_id ?? toShopifyGid('LineItem', line.id)
    const specs = extractSpecs(orderAttributes, lineAttributes)

    return {
      id: `order-${extractNumericId(orderId)}-line-${extractNumericId(lineItemId)}`,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      shopifyOrderId: orderId,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: orderAttributes.trinity_draft_order_id ?? '',
      shopifyDraftOrderName: '',
      lineItemId,
      customerName: customerNameFromWebhook(order.customer),
      customerEmail: order.email ?? order.customer?.email ?? '',
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
      dueDate: orderAttributes.trinity_due_date ?? '',
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
    dueDate: existing.dueDate || incoming.dueDate,
    salesRep: existing.salesRep || incoming.salesRep,
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
    notes: lineAttributes.trinity_notes ?? orderAttributes.trinity_notes ?? '',
  }
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
