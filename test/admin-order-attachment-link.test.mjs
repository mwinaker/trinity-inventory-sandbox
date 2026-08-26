import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isShopifyOrderGid,
  parseOrderAttachmentLink,
} from '../server/admin-order-attachment-link.mjs'

const orderId = 'gid://shopify/Order/7388772925679'

test('accepts an internal Shopify production attachment for a Shopify order', () => {
  assert.equal(isShopifyOrderGid(orderId), true)
  assert.deepEqual(
    parseOrderAttachmentLink(
      orderId,
      JSON.stringify({
        filename: 'Swing plane reference.pdf',
        downloadUrl: 'https://cdn.shopify.com/s/files/1/0797/7281/1503/files/reference.pdf',
      }),
    ),
    {
      orderId,
      filename: 'Swing plane reference.pdf',
      downloadUrl: 'https://cdn.shopify.com/s/files/1/0797/7281/1503/files/reference.pdf',
    },
  )
})

test('rejects invalid order IDs, malformed data, and non-Shopify attachment URLs', () => {
  assert.equal(isShopifyOrderGid('gid://shopify/DraftOrder/7388772925679'), false)
  assert.equal(parseOrderAttachmentLink('gid://shopify/DraftOrder/1', '{}'), null)
  assert.equal(parseOrderAttachmentLink(orderId, '{not json}'), null)
  assert.equal(
    parseOrderAttachmentLink(
      orderId,
      JSON.stringify({ filename: 'outside.pdf', downloadUrl: 'https://example.com/outside.pdf' }),
    ),
    null,
  )
})

test('normalizes an attachment filename before returning it to the admin extension', () => {
  assert.deepEqual(
    parseOrderAttachmentLink(
      orderId,
      JSON.stringify({
        filename: ' reference\u0000\nimage.png ',
        downloadUrl: 'https://cdn.shopify.com/s/files/1/0797/7281/1503/files/reference.png',
      }),
    ),
    {
      orderId,
      filename: 'reference image.png',
      downloadUrl: 'https://cdn.shopify.com/s/files/1/0797/7281/1503/files/reference.png',
    },
  )
})
