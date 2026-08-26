import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverSource = fs.readFileSync(path.join(repoRoot, 'server/index.mjs'), 'utf8')

function extractFunctionSource(name) {
  const start = serverSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} was not found`)

  const rest = serverSource.slice(start + 1)
  const nextFunction = rest.match(/\n(?:async\s+)?function\s+\w+\(/)
  const end = nextFunction ? start + 1 + nextFunction.index : serverSource.length
  return serverSource.slice(start, end)
}

test('customer-facing Shopify order payloads do not expose uploaded attachments', () => {
  for (const functionName of ['buildOrderCreateInput', 'buildDraftOrderInput']) {
    const source = extractFunctionSource(functionName)

    assert.equal(source.includes('Internal attachment:'), false)
    assert.equal(source.includes('trinity_internal_attachment_'), false)
    assert.equal(source.includes('formatAttachmentLine(internalAttachment)'), false)
  }
})

test('attachment-bearing orders carry only a neutral tag for the paid Flow workflow', () => {
  for (const functionName of ['buildOrderCreateInput', 'buildDraftOrderInput']) {
    const source = extractFunctionSource(functionName)

    assert.equal(
      source.includes("hasInternalAttachment ? ['Trinity Attachment'] : []"),
      true,
    )
    assert.equal(source.includes('trinity_internal_attachment_url'), false)
  }
})

test('order-job metafield sync provides Flow with the internal attachment URL', () => {
  const syncSource = extractFunctionSource('syncOrderJobMetafields')

  assert.equal(syncSource.includes("key: 'internal_attachment_url'"), true)
  assert.equal(syncSource.includes("type: 'single_line_text_field'"), true)
  assert.equal(syncSource.includes('value: job.internalAttachment.downloadUrl'), true)
})

test('paid Shopify orders receive a pinned internal file reference for production attachments', () => {
  const syncSource = extractFunctionSource('syncOrderJobMetafields')
  const draftSyncSource = extractFunctionSource('syncDraftOrderJobAttachmentMetafields')
  const definitionSource = extractFunctionSource(
    'ensureOrderProductionAttachmentMetafieldDefinitionInternal',
  )
  const linkDefinitionSource = extractFunctionSource(
    'ensureOrderProductionAttachmentLinkMetafieldDefinitionInternal',
  )

  assert.equal(syncSource.includes("key: 'production_attachment'"), true)
  assert.equal(syncSource.includes("type: 'file_reference'"), true)
  assert.equal(syncSource.includes('value: job.internalAttachment.shopifyFileId'), true)
  assert.equal(definitionSource.includes("ownerType: 'ORDER'"), true)
  assert.equal(definitionSource.includes("pin: true"), true)
  assert.equal(definitionSource.includes("admin: 'MERCHANT_READ'"), true)
  assert.equal(definitionSource.includes("storefront: 'NONE'"), true)
  assert.equal(draftSyncSource.includes("toShopifyGid('DraftOrder'"), true)
  assert.equal(draftSyncSource.includes("key: 'production_attachment'"), true)
  assert.equal(draftSyncSource.includes("type: 'file_reference'"), true)
  assert.equal(draftSyncSource.includes('value: job.internalAttachment.shopifyFileId'), true)
  assert.equal(syncSource.includes("key: 'production_attachment_link'"), true)
  assert.equal(syncSource.includes("type: 'link'"), true)
  assert.equal(syncSource.includes("text: 'View / print attachment'"), true)
  assert.equal(syncSource.includes('url: job.internalAttachment.downloadUrl'), true)
  assert.equal(linkDefinitionSource.includes("ownerType: 'ORDER'"), true)
  assert.equal(linkDefinitionSource.includes("pin: true"), true)
  assert.equal(linkDefinitionSource.includes("storefront: 'NONE'"), true)
  assert.equal(draftSyncSource.includes("key: 'production_attachment_link'"), true)
  assert.equal(draftSyncSource.includes("type: 'link'"), true)
  assert.equal(draftSyncSource.includes("text: 'View / print attachment'"), true)
  assert.equal(draftSyncSource.includes('url: job.internalAttachment.downloadUrl'), true)
})

test('internal order notifications include a prominent Shopify Files download link', () => {
  const messageSource = extractFunctionSource('buildInternalOrderCopyMessage')
  const emailSource = extractFunctionSource('sendInternalOrderCopyEmail')
  const shopifyEmailSource = extractFunctionSource('sendShopifyInternalOrderCopies')

  assert.equal(
    messageSource.includes(
      'ORDER ATTACHMENT — DOWNLOAD FILE: ${formatAttachmentLine(internalAttachment)}',
    ),
    true,
  )
  assert.equal(shopifyEmailSource.includes('customMessage: text'), true)
  assert.equal(emailSource.includes('uploadedAttachmentAttached: Boolean(uploadedEmailAttachment)'), true)
})
