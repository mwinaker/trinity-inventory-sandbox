import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readStorageValue,
  removeStorageValue,
  shouldUseLocalToolStorage,
  writeStorageValue,
} from '../src/app-storage.ts'

test('live Shopify hosts never hydrate or persist legacy inventory caches', () => {
  assert.equal(shouldUseLocalToolStorage('trinity-billet-inventory.onrender.com'), false)
  assert.equal(shouldUseLocalToolStorage('admin.shopify.com'), false)
  assert.equal(shouldUseLocalToolStorage('localhost'), true)
  assert.equal(shouldUseLocalToolStorage('127.0.0.1'), true)
})

test('browser storage reads fail closed when a mobile webview denies access', () => {
  const deniedStorage = {
    getItem() {
      throw new DOMException('Storage access denied', 'SecurityError')
    },
    setItem() {},
    removeItem() {},
  }

  assert.equal(readStorageValue(deniedStorage, 'key'), null)
})

test('browser storage writes do not crash when a mobile webview reaches quota', () => {
  const fullStorage = {
    getItem() {
      return null
    },
    setItem() {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    },
    removeItem() {},
  }

  assert.equal(writeStorageValue(fullStorage, 'key', 'value'), false)
})

test('browser storage removal is best effort', () => {
  const values = new Map([['key', 'value']])
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    removeItem(key) {
      values.delete(key)
    },
  }

  assert.equal(removeStorageValue(storage, 'key'), true)
  assert.equal(values.has('key'), false)
})
