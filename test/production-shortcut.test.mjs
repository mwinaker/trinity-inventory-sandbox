import test from 'node:test'
import assert from 'node:assert/strict'
import { productionShortcut, matchesProductionShortcut } from '../src/production-shortcut.ts'

test('Shopify shortcuts match only the exact order and resource type', () => {
  for (const query of ['id=123', 'ids[]=123', 'ids=123', 'id=gid://shopify/Order/123']) {
    const target = productionShortcut('?productionResource=Order&' + query)
    assert.equal(matchesProductionShortcut({id:'a',shopifyOrderId:'gid://shopify/Order/123'},target),true)
    assert.equal(matchesProductionShortcut({id:'b',shopifyOrderId:'gid://shopify/Order/1234'},target),false)
    assert.equal(matchesProductionShortcut({id:'c',shopifyDraftOrderId:'gid://shopify/DraftOrder/123'},target),false)
  }
  const draft = productionShortcut('?productionResource=DraftOrder&id=123')
  assert.equal(matchesProductionShortcut({id:'d',shopifyDraftOrderId:'gid://shopify/DraftOrder/123'},draft),true)
})
test('missing, multiple or malformed order IDs fail closed', () => {
  for (const query of ['', '&ids[]=123&ids[]=456', '&id=gid://shopify/DraftOrder/123', '&id=abc', '&id=1234abc']) {
    const target = productionShortcut('?productionResource=Order'+query)
    assert.equal(target.invalid,true)
    assert.equal(matchesProductionShortcut({id:'a',shopifyOrderId:'gid://shopify/Order/123'},target),false)
  }
  assert.equal(productionShortcut('?id=123'),null)
  assert.equal(matchesProductionShortcut({id:'a'},null),true)
})
