import { isAllowedShopifyAttachmentUrl } from './security-policy.mjs'

const orderGidPattern = /^gid:\/\/shopify\/Order\/\d+$/

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanFilename(value) {
  return cleanString(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 255)
}

export function isShopifyOrderGid(value) {
  return orderGidPattern.test(cleanString(value))
}

export function parseOrderAttachmentLink(orderId, metafieldValue) {
  if (!isShopifyOrderGid(orderId)) return null

  let attachment
  try {
    attachment = JSON.parse(cleanString(metafieldValue))
  } catch {
    return null
  }

  if (!attachment || typeof attachment !== 'object') return null

  const downloadUrl = cleanString(attachment.downloadUrl || attachment.url)
  if (!isAllowedShopifyAttachmentUrl(downloadUrl)) return null

  return {
    orderId: cleanString(orderId),
    filename: cleanFilename(attachment.filename) || 'Production attachment',
    downloadUrl,
  }
}
