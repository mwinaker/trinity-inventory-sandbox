const defaultPdfMaxBytes = 10 * 1024 * 1024
const defaultPdfTimeoutMs = 15_000

export function createOrderPrinterProDraftPdfConfig({
  origin,
  pathToken,
  idMultiplier,
} = {}) {
  const normalizedOrigin = cleanString(origin).replace(/\/+$/, '')
  const normalizedPathToken = cleanString(pathToken).replace(/^\/+|\/+$/g, '')
  const normalizedMultiplier = cleanString(idMultiplier)

  if (!normalizedOrigin || !normalizedPathToken || !/^\d+$/.test(normalizedMultiplier)) {
    return null
  }

  try {
    if (BigInt(normalizedMultiplier) <= 0n) return null
    new URL(normalizedOrigin)
  } catch {
    return null
  }

  return {
    origin: normalizedOrigin,
    pathToken: normalizedPathToken,
    idMultiplier: normalizedMultiplier,
  }
}

export function buildOrderPrinterProDraftPdfUrl(draftOrder, config) {
  if (!draftOrder || !config) return ''

  const numericId = cleanString(draftOrder.id).match(/(\d+)$/)?.[1] ?? ''
  const orderHandle = toShopifyHandle(draftOrder.name)
  if (!numericId || !orderHandle) return ''

  try {
    const encodedId = BigInt(numericId) * BigInt(config.idMultiplier)
    return new URL(
      `/apps/download-pdf/drafts/${encodeURIComponent(config.pathToken)}/${encodedId}/${orderHandle}.pdf`,
      config.origin,
    ).toString()
  } catch {
    return ''
  }
}

export function buildOrderPrinterProPdfFilename(draftOrder) {
  const orderName = cleanString(draftOrder?.name).replace(/^#+/, '')
  const filenameStem = orderName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  return `${filenameStem || 'trinity-order'}-invoice.pdf`
}

export async function downloadOrderPrinterProPdfAttachment({
  url,
  filename,
  fetchImpl = globalThis.fetch,
  maxBytes = defaultPdfMaxBytes,
  timeoutMs = defaultPdfTimeoutMs,
} = {}) {
  if (!cleanString(url)) throw new Error('Order Printer Pro PDF URL is required.')
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/pdf' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Order Printer Pro PDF download failed (${response.status}).`)
    }

    const advertisedBytes = Number(response.headers.get('content-length'))
    if (Number.isFinite(advertisedBytes) && advertisedBytes > maxBytes) {
      throw new Error('Order Printer Pro PDF exceeds the attachment size limit.')
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
      throw new Error('Order Printer Pro PDF is empty or exceeds the attachment size limit.')
    }

    const signature = new TextDecoder().decode(bytes.slice(0, 5))
    if (signature !== '%PDF-') {
      throw new Error('Order Printer Pro did not return a PDF document.')
    }

    return {
      filename: cleanString(filename) || 'trinity-order-invoice.pdf',
      content: Buffer.from(bytes).toString('base64'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function toShopifyHandle(value) {
  return cleanString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}
