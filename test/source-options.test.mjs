import assert from 'node:assert/strict'
import test from 'node:test'

import {
  billetSourceOptions,
  getBilletDimensionsForSource,
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

test('Maine Billets uses the standard 37 by 2.75 billet dimensions', () => {
  const standardDimensions = { length: 37, diameter: 2.75 }

  assert.deepEqual(getBilletDimensionsForSource('Maine Billets'), standardDimensions)
  assert.deepEqual(getBilletDimensionsForSource('Great Lakes Veneer'), standardDimensions)
  assert.deepEqual(getBilletDimensionsForSource('Champeau'), standardDimensions)
  assert.deepEqual(getBilletDimensionsForSource("RJ's Tree Farms"), {
    length: 37,
    diameter: 2.79,
  })
  assert.deepEqual(getBilletDimensionsForSource('Cahan'), {
    length: 37,
    diameter: 2.79,
  })
})
