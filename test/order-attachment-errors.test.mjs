import assert from 'node:assert/strict'
import test from 'node:test'

import { formatOrderAttachmentUploadError } from '../server/order-attachment-errors.mjs'

test('turns missing Shopify Files access into an actionable attachment message', () => {
  const failure = formatOrderAttachmentUploadError(
    new Error('Access denied for stagedUploadsCreate field.'),
  )

  assert.equal(failure.status, 503)
  assert.match(failure.message, /Shopify Files access is not enabled/)
  assert.match(failure.message, /Remove the attachment to submit the order/)
  assert.equal(failure.internalMessage, 'Access denied for stagedUploadsCreate field.')
})

test('preserves other attachment upload errors for troubleshooting', () => {
  const failure = formatOrderAttachmentUploadError(
    new Error('Attachment upload failed (502): upstream unavailable'),
  )

  assert.deepEqual(failure, {
    status: 500,
    message: 'Attachment upload failed (502): upstream unavailable',
    internalMessage: 'Attachment upload failed (502): upstream unavailable',
  })
})
