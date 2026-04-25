import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
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
        fieldValue('has_barrel_knot', toBooleanValue(item.hasBarrelKnot)),
        fieldValue('source', item.source),
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
      definitionField('source', 'Source', 'single_line_text_field'),
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
        fieldValue('shopify_product_id', item.shopifyProductId),
        fieldValue('shopify_variant_id', item.shopifyVariantId),
        fieldValue('length', item.length),
        fieldValue('weight', item.weight),
        fieldValue('billet_ids_json', JSON.stringify(item.billetIds ?? [])),
        fieldValue('cupped', item.cupped),
        fieldValue('modifications', item.modifications),
        fieldValue('created_at', item.createdAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('model_id', 'Model ID', 'single_line_text_field'),
      definitionField('shopify_product_id', 'Shopify Product ID', 'single_line_text_field'),
      definitionField('shopify_variant_id', 'Shopify Variant ID', 'single_line_text_field'),
      definitionField('length', 'Length', 'single_line_text_field'),
      definitionField('weight', 'Weight', 'single_line_text_field'),
      definitionField('billet_ids_json', 'Billet IDs JSON', 'json'),
      definitionField('cupped', 'Cupped', 'single_line_text_field'),
      definitionField('modifications', 'Modifications', 'multi_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
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
    const [billets, players, producedBats, customBatModels] = await Promise.all([
      listRecords(resourceConfigs.billets),
      listRecords(resourceConfigs.players),
      listRecords(resourceConfigs.producedBats),
      listRecords(resourceConfigs.customBatModels),
    ])

    response.json({
      ok: true,
      billets,
      players,
      producedBats,
      customBatModels,
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
    ])

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

async function upsertRecords(config, items) {
  const desiredHandles = new Set()

  for (const item of items) {
    const handle = sanitizeHandle(item.id ?? config.labelFor(item))
    desiredHandles.add(handle)
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
              code
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
  }

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
            code
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

function toNumericValue(value) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}
