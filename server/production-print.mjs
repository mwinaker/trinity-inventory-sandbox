import crypto from 'node:crypto'
import { buildProductionDocument, productionOrderJobs } from '../shared/production-documents.ts'

export function installProductionPrintRoutes(app, { authorize, getJobs, secret, now = Date.now }) {
  const sign = value => crypto.createHmac('sha256', secret).update(value).digest('base64url')
  const privateHeaders = response => response.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' })
  const cors = (request, response, next) => {
    privateHeaders(response)
    const origin = request.get('Origin')
    if (['https://extensions.shopifycdn.com', 'https://admin.shopify.com'].includes(origin)) response.set('Access-Control-Allow-Origin', origin)
    response.set({ 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' })
    next()
  }
  const findJobs = async id => {
    const all = await getJobs()
    const key = id.includes('/DraftOrder/') ? 'shopifyDraftOrderId' : 'shopifyOrderId'
    const selected = all.find(job => job[key] === id)
    return selected ? productionOrderJobs(all, selected) : []
  }
  app.options('/api/production-print-link', cors, (_request, response) => response.sendStatus(204))
  app.get('/api/production-print-link', cors, authorize, async (request, response) => {
    try {
      const id = request.query.orderId
      if (typeof id !== 'string' || !/^gid:\/\/shopify\/(Order|DraftOrder)\/\d+$/.test(id)) return response.status(400).json({ message: 'Select one valid Shopify order.' })
      if (!secret) return response.status(503).json({ message: 'Document signing is unavailable.' })
      if (!(await findJobs(id)).length) return response.status(404).json({ message: 'No internal production records are linked to this order.' })
      const urls = {}
      for (const layout of ['detail', 'landscape']) {
        const payload = Buffer.from(JSON.stringify({ id, layout, expires: now() + 5 * 60_000, nonce: crypto.randomBytes(12).toString('hex') })).toString('base64url')
        urls[layout] = `/api/production-print?ticket=${payload}.${sign(payload)}`
      }
      response.json({ urls })
    } catch { response.status(503).json({ message: 'Production documents are temporarily unavailable. Please reopen this action.' }) }
  })
  app.options('/api/production-print', cors, (_request, response) => response.sendStatus(204))
  app.get('/api/production-print', cors, async (request, response) => {
    privateHeaders(response)
    try {
      const ticket = request.query.ticket
      if (!secret || typeof ticket !== 'string' || ticket.length > 2000) throw new Error('Invalid ticket')
      const parts = ticket.split('.')
      if (parts.length !== 2) throw new Error('Invalid ticket')
      const [payload, signature] = parts
      const expected = sign(payload)
      if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid ticket')
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
      if (!/^gid:\/\/shopify\/(Order|DraftOrder)\/\d+$/.test(data.id) || !['detail', 'landscape'].includes(data.layout) || !Number.isFinite(data.expires) || data.expires <= now()) throw new Error('Expired ticket')
      const jobs = await findJobs(data.id)
      if (!jobs.length) return response.status(404).send('No production records are linked to this order.')
      // Native Shopify previews require static HTML without scripts or inline handlers.
      const html = buildProductionDocument(jobs, data.layout).replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')
      response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https://cdn.shopify.com; base-uri 'none'; form-action 'none'")
      response.type('html').send(html)
    } catch { response.status(403).type('text').send('This internal print link is invalid or expired. Reopen Production documents from Shopify to get a new link.') }
  })
}
