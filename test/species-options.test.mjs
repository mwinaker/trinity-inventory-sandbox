import assert from 'node:assert/strict'
import test from 'node:test'

import {
  billetSpeciesOptions,
  inferBilletSpeciesFromText,
} from '../shared/species-options.mjs'

test('Soft Maple is a distinct billet species throughout the tool', () => {
  assert.deepEqual(billetSpeciesOptions, ['Maple', 'Soft Maple', 'Birch', 'Ash'])
  assert.equal(inferBilletSpeciesFromText('RJ soft maple prime billet'), 'Soft Maple')
  assert.equal(inferBilletSpeciesFromText('hard maple billet'), 'Maple')
})
