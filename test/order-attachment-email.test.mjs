import assert from 'node:assert/strict'
import test from 'node:test'

import { downloadUploadedOrderEmailAttachment } from '../server/order-attachment-email.mjs'

test('downloads uploaded Shopify attachment for internal order email', async () => {
  const bytes = Buffer.from('swing plane notes')
  const attachment = await downloadUploadedOrderEmailAttachment({
    attachment: {
      filename: 'Swing Plane Notes.pdf',
      downloadUrl: 'https://cdn.shopify.com/s/files/1/0000/files/swing-notes.pdf',
      bytes: bytes.byteLength,
    },
    fetchImpl: async () =>
      new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.byteLength) },
      }),
  })

  assert.deepEqual(attachment, {
    filename: 'Swing Plane Notes.pdf',
    content: bytes.toString('base64'),
  })
})

test('rejects uploaded email attachments from non-Shopify URLs', async () => {
  await assert.rejects(
    downloadUploadedOrderEmailAttachment({
      attachment: {
        filename: 'spec.pdf',
        downloadUrl: 'https://example.com/spec.pdf',
      },
      fetchImpl: async () => new Response('nope', { status: 200 }),
    }),
    /trusted Shopify file/,
  )
})

test('rejects uploaded email attachments over the size limit before reading the body', async () => {
  await assert.rejects(
    downloadUploadedOrderEmailAttachment({
      attachment: {
        filename: 'huge.pdf',
        downloadUrl: 'https://cdn.shopify.com/s/files/1/0000/files/huge.pdf',
        bytes: 11,
      },
      maxBytes: 10,
      fetchImpl: async () => {
        throw new Error('fetch should not be called')
      },
    }),
    /size limit/,
  )
})
