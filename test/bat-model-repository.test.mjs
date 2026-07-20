import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getOptionalWeightValue,
  isValidEditableWeightRange,
  mergeBatModelSources,
  upsertBatModelOverride,
} from '../src/bat-model-repository.ts'

test('saved model edits replace the loaded model without creating a duplicate', () => {
  const loaded = [{ id: 'model-1', name: 'Original model' }]
  const override = { id: 'model-1', name: 'Updated model' }

  const overrides = upsertBatModelOverride([], override)
  assert.deepEqual(mergeBatModelSources(loaded, overrides), [override])
})

test('model range editing accepts one-sided ranges and rejects reversed ranges', () => {
  assert.equal(isValidEditableWeightRange('87', '90'), true)
  assert.equal(isValidEditableWeightRange('102', ''), true)
  assert.equal(isValidEditableWeightRange('', '82'), true)
  assert.equal(isValidEditableWeightRange('94', '89'), false)
  assert.equal(isValidEditableWeightRange('not-a-number', '90'), false)
  assert.equal(getOptionalWeightValue(''), undefined)
  assert.equal(getOptionalWeightValue('91.5'), 91.5)
})
