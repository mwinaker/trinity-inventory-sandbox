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

test('internal order notifications still carry uploaded attachments for staff', () => {
  const messageSource = extractFunctionSource('buildInternalOrderCopyMessage')
  const emailSource = extractFunctionSource('sendInternalOrderCopyEmail')

  assert.equal(messageSource.includes('Attachment: ${formatAttachmentLine(internalAttachment)}'), true)
  assert.equal(emailSource.includes('tryDownloadUploadedOrderEmailAttachment(uploadedAttachment)'), true)
  assert.equal(emailSource.includes('uploadedAttachmentAttached: Boolean(uploadedEmailAttachment)'), true)
})
