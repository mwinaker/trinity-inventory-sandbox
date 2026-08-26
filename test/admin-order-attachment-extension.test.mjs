import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverSource = fs.readFileSync(path.join(repoRoot, 'server/index.mjs'), 'utf8')
const extensionSource = fs.readFileSync(
  path.join(repoRoot, 'extensions/production-attachment-link/src/BlockExtension.jsx'),
  'utf8',
)
const extensionConfig = fs.readFileSync(
  path.join(repoRoot, 'extensions/production-attachment-link/shopify.extension.toml'),
  'utf8',
)

test('the production attachment block renders on paid Shopify order details', () => {
  assert.match(extensionConfig, /target = "admin\.order-details\.block\.render"/)
  assert.match(extensionSource, /shopify\.auth\.idToken\(\)/)
  assert.match(extensionSource, /https:\/\/trinity-billet-inventory\.onrender\.com/)
  assert.match(extensionSource, /\/api\/order-attachment-link\?orderId=/)
  assert.match(extensionSource, /Authorization: `Bearer \$\{token\}`/)
  assert.match(extensionSource, /<s-link/)
  assert.match(extensionSource, /href=\{attachment\.downloadUrl\}/)
  assert.match(extensionSource, /target="_blank"/)
})

test('the order attachment endpoint requires authenticated Shopify access and returns only trusted URLs', () => {
  assert.match(serverSource, /app\.get\('\/api\/order-attachment-link',[\s\S]*?requireInternalAccess/)
  assert.match(serverSource, /Access-Control-Allow-Origin', 'https:\/\/extensions\.shopifycdn\.com'/)
  assert.match(serverSource, /key: "internal_attachment"/)
  assert.match(serverSource, /parseOrderAttachmentLink\(/)
  assert.match(serverSource, /isAllowedShopifyAttachmentUrl\(attachment\.downloadUrl\)/)
})
