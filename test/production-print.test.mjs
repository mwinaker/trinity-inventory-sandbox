import test from 'node:test'
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
      const response = await fetch(base+urls[layout]); const html=await response.text()
      assert.equal(response.status,200); assert.match(html,/CS271/); assert.match(html,/PRIVATE SPEC/)
      assert.doesNotMatch(html,/OTHER ORDER|onclick|<script/); assert.match(response.headers.get('cache-control'),/no-store/)
      assert.match(html,layout==='landscape'?/size:letter landscape/:/size:letter portrait/)
    }
    assert.equal((await fetch(base+urls.detail+'x')).status,403)
    assert.equal((await fetch(base+'/api/production-print?orderId=gid://shopify/Order/123')).status,403)
    now+=300001
    assert.equal((await fetch(base+urls.detail)).status,403)
  } finally { await new Promise(resolve=>server.close(resolve)) }
})
