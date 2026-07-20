import assert from 'node:assert/strict'
import test from 'node:test'

import {
  billetSourceOptions,
  inferBilletSourceFromText,
} from '../shared/source-options.mjs'

test('Maine Billets is a supported billet source throughout the tool', () => {
  assert.deepEqual(billetSourceOptions, [
    "RJ's Tree Farms",
    'Great Lakes Veneer',
    'Maine Billets',
    'Cahan',
    'Champeau',
  ])
  assert.equal(inferBilletSourceFromText('Maine Billets maple prime'), 'Maine Billets')
  assert.equal(inferBilletSourceFromText('delivery from Maine'), 'Maine Billets')
})
