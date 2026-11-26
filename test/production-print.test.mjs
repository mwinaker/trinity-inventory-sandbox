import test from 'node:test'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import express from 'express'
import { installProductionPrintRoutes } from '../server/production-print.mjs'
test('production print requires authentication and exact expiring signed order scope', async () => {
  let now = 1000
  const app = express()
  installProductionPrintRoutes(app, { secret: 'test-only-secret', now: () => now, authorize: (req,res,next) => req.headers.authorization === 'Bearer test' ? next() : res.sendStatus(401), getJobs: async () => [{ id:'a', shopifyOrderId:'gid://shopify/Order/123', productTitle:'CS271', quantity:2, internalNotes:'PRIVATE SPEC', specs:{length:33} }, {id:'b',shopifyOrderId:'gid://shopify/Order/456',productTitle:'OTHER ORDER'}] })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening',resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const auth = {headers:{Authorization:'Bearer test'}}
  try {
    assert.equal((await fetch(base+'/api/production-print-link?orderId=gid://shopify/Order/123')).status,401)
    assert.equal((await fetch(base+'/api/production-print-link?orderId=123',auth)).status,400)
    assert.equal((await fetch(base+'/api/production-print-link?orderId=gid://shopify/Order/999',auth)).status,404)
    const {urls} = await (await fetch(base+'/api/production-print-link?orderId=gid://shopify/Order/123',auth)).json()
    for(const layout of ['detail','landscape']) {
      const response = await fetch(base+urls[layout])
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'application/pdf')
      assert.match(response.headers.get('content-disposition'), /^inline;/)
      assert.match(response.headers.get('cache-control'), /no-store/)
      const pdf = Buffer.from(await response.arrayBuffer())
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
      const readPdf = (tool, args) => execFileSync(tool, args, { input: pdf, encoding: 'utf8' })
      const printed = readPdf('pdftotext', ['-layout', '-', '-'])
      assert.match(printed, /CS271/)
      assert.match(printed, /PRIVATE SPEC/)
      assert.doesNotMatch(printed, /OTHER ORDER|Print \/ Save PDF/)
      assert.match(readPdf('pdfinfo', ['-']), layout === 'landscape' ? /792 x 612 pts/ : /612 x 792 pts/)
      const fonts = readPdf('pdffonts', ['-']).trim().split('\n').slice(2)
      assert.ok(fonts.length && fonts.every(font => /\byes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(font)), 'all printed fonts must be embedded')
    }
    assert.equal((await fetch(base+urls.detail+'x')).status,403)
    assert.equal((await fetch(base+'/api/production-print?orderId=gid://shopify/Order/123')).status,403)
    now+=300001
    assert.equal((await fetch(base+urls.detail)).status,403)
  } finally { await new Promise(resolve=>server.close(resolve)) }
})
