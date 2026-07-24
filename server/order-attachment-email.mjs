import path from 'node:path'

import { isAllowedShopifyAttachmentUrl } from './security-policy.mjs'

const defaultAttachmentMaxBytes = 20 * 1024 * 1024
const defaultAttachmentTimeoutMs = 15_000

export async function downloadUploadedOrderEmailAttachment({
  attachment,
  fetchImpl = globalThis.fetch,
  maxBytes = defaultAttachmentMaxBytes,
  timeoutMs = defaultAttachmentTimeoutMs,
} = {}) {
  const downloadUrl = cleanString(attachment?.downloadUrl || attachment?.url)
  if (!downloadUrl) throw new Error('Uploaded attachment URL is required.')
  if (!isAllowedShopifyAttachmentUrl(downloadUrl)) {
    throw new Error('Uploaded attachment URL is not a trusted Shopify file.')
  }
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')

  const recordedBytes = Number(attachment?.bytes)
  if (Number.isFinite(recordedBytes) && recordedBytes > maxBytes) {
    throw new Error('Uploaded attachment exceeds the email attachment size limit.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(downloadUrl, {
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Uploaded attachment download failed (${response.status}).`)
    }

    const advertisedBytes = Number(response.headers.get('content-length'))
    if (Number.isFinite(advertisedBytes) && advertisedBytes > maxBytes) {
      throw new Error('Uploaded attachment exceeds the email attachment size limit.')
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
      throw new Error('Uploaded attachment is empty or exceeds the email attachment size limit.')
    }

    return {
      filename: sanitizeEmailAttachmentFilename(attachment?.filename),
      content: Buffer.from(bytes).toString('base64'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizeEmailAttachmentFilename(filename) {
  const parsed = path.parse(cleanString(filename) || 'trinity-order-attachment')
  const basename = parsed.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._ -]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const extension = parsed.ext.replace(/[^a-z0-9.]+/gi, '').slice(0, 16)

  return `${basename || 'trinity-order-attachment'}${extension}`.slice(0, 140)
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}
