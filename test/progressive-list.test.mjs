import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getNextProgressiveListLimit,
  getProgressiveListSlice,
} from '../src/progressive-list.ts'

test('progressive lists render only the requested initial batch', () => {
  const items = Array.from({ length: 857 }, (_, index) => index + 1)

  assert.equal(getProgressiveListSlice(items, 50).length, 50)
  assert.deepEqual(getProgressiveListSlice(items, 3), [1, 2, 3])
})

test('progressive list limits advance in bounded batches', () => {
  assert.equal(getNextProgressiveListLimit(50, 857, 50), 100)
  assert.equal(getNextProgressiveListLimit(850, 857, 50), 857)
  assert.equal(getNextProgressiveListLimit(10, 10, 10), 10)
})

test('progressive list helpers fail closed for invalid limits', () => {
  assert.deepEqual(getProgressiveListSlice([1, 2, 3], Number.NaN), [])
  assert.equal(getNextProgressiveListLimit(Number.NaN, 3, Number.NaN), 1)
})
