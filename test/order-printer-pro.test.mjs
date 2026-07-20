import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOrderPrinterProDraftPdfUrl,
  buildOrderPrinterProPdfFilename,
  createOrderPrinterProDraftPdfConfig,
  downloadOrderPrinterProPdfAttachment,
} from '../server/order-printer-pro.mjs'

test('builds the same draft PDF URL format used by Order Printer Pro', () => {
  const config = createOrderPrinterProDraftPdfConfig({
    origin: 'https://trinitybatco.com/',
    pathToken: 'draft-template-token',
    idMultiplier: '9689',
  })

  assert.equal(
    buildOrderPrinterProDraftPdfUrl(
      { id: 'gid://shopify/DraftOrder/1270882861295', name: '#D158' },
      config,
    ),
    'https://trinitybatco.com/apps/download-pdf/drafts/draft-template-token/12313584043087255/d158.pdf',
  )
})

test('uses integer-safe math for Shopify IDs larger than Number.MAX_SAFE_INTEGER', () => {
  const config = createOrderPrinterProDraftPdfConfig({
    origin: 'https://trinitybatco.com',
    pathToken: 'token',
    idMultiplier: '9689',
  })
  const numericId = '999999999999999999'

  const url = buildOrderPrinterProDraftPdfUrl(
    { id: `gid://shopify/DraftOrder/${numericId}`, name: '#D 152' },
    config,
  )

  assert.match(url, new RegExp(`/${BigInt(numericId) * 9689n}/d-152\\.pdf$`))
})

test('rejects incomplete PDF configuration and malformed draft orders', () => {
  assert.equal(createOrderPrinterProDraftPdfConfig({ origin: 'https://example.com' }), null)
  assert.equal(
    buildOrderPrinterProDraftPdfUrl(
      { id: 'gid://shopify/DraftOrder/not-a-number', name: '#D1' },
      createOrderPrinterProDraftPdfConfig({
        origin: 'https://example.com',
        pathToken: 'token',
        idMultiplier: '12',
      }),
    ),
    '',
  )
})

test('creates a safe invoice filename', () => {
  assert.equal(buildOrderPrinterProPdfFilename({ name: '#D 152 / José' }), 'D-152-Jose-invoice.pdf')
})

test('downloads and base64 encodes a verified PDF attachment', async () => {
  const pdfBytes = Buffer.from('%PDF-1.4\nverified')
  const attachment = await downloadOrderPrinterProPdfAttachment({
    url: 'https://example.com/invoice.pdf',
    filename: 'D152-invoice.pdf',
    fetchImpl: async () =>
      new Response(pdfBytes, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
  })

  assert.deepEqual(attachment, {
    filename: 'D152-invoice.pdf',
    content: pdfBytes.toString('base64'),
  })
})

test('rejects a non-PDF response instead of attaching an error page', async () => {
  await assert.rejects(
    downloadOrderPrinterProPdfAttachment({
      url: 'https://example.com/invoice.pdf',
      fetchImpl: async () => new Response('<html>not a PDF</html>', { status: 200 }),
    }),
    /did not return a PDF/,
  )
})
