import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isBatProductLike,
  isSalesOrderCatalogProduct,
  isSalesOrderProductLike,
  isShirtProductLike,
} from '../server/product-catalog-policy.mjs'

test('sales-order catalog includes shirts while the bat catalog stays bat-only', () => {
  const shirt = {
    title: 'Distressed Logo T-shirt',
    productType: 'T-Shirts',
    tags: ['apparel'],
  }
  const bat = {
    title: 'Pro Model CS271',
    productType: 'Pro Series',
    tags: ['maple'],
  }

  assert.equal(isShirtProductLike(shirt), true)
  assert.equal(isBatProductLike(shirt), false)
  assert.equal(isSalesOrderProductLike(shirt), true)
  assert.equal(isBatProductLike(bat), true)
  assert.equal(isSalesOrderProductLike(bat), true)
})

test('archived shirt placeholders stay out of manual-order choices', () => {
  const archivedShirt = {
    title: 'Archived shirt placeholder',
    productType: 'T-Shirts',
    status: 'ARCHIVED',
  }
  const draftShirt = { ...archivedShirt, status: 'DRAFT' }

  assert.equal(isSalesOrderCatalogProduct(archivedShirt), false)
  assert.equal(isSalesOrderCatalogProduct(draftShirt), true)
})

test('unrelated apparel and accessories stay out of the sales-order catalog', () => {
  assert.equal(
    isSalesOrderProductLike({ title: 'Trinity Hat', productType: 'Apparel', tags: [] }),
    false,
  )
  assert.equal(
    isSalesOrderProductLike({ title: 'Bat Grip', productType: 'Accessories', tags: [] }),
    false,
  )
})
