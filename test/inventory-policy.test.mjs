import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidWorkableWeightRange,
  normalizeBilletSuitability,
  updateBilletSuitability,
} from '../src/inventory-policy.ts'

test('legacy billet flags migrate into suitability categories', () => {
  assert.deepEqual(normalizeBilletSuitability(undefined, { mlbEligible: true }), [
    'MLB capable',
  ])
  assert.deepEqual(
    normalizeBilletSuitability(undefined, { mlbEligible: true, trophyEligible: true }),
    ['Trophy'],
  )
})

test('Trophy suitability is exclusive while playable categories can be combined', () => {
  const playable = updateBilletSuitability(
    updateBilletSuitability(['MLB capable'], 'Indy ball/International', true),
    'High school',
    true,
  )
  assert.deepEqual(playable, ['MLB capable', 'Indy ball/International', 'High school'])
  assert.deepEqual(updateBilletSuitability(playable, 'Trophy', true), ['Trophy'])
  assert.deepEqual(updateBilletSuitability(['Trophy'], 'Trainer only', true), ['Trainer only'])
  assert.deepEqual(normalizeBilletSuitability(['MLB capable', 'Trophy']), ['Trophy'])
})

test('model data points require an ordered workable weight range', () => {
  assert.equal(isValidWorkableWeightRange('89', '94'), true)
  assert.equal(isValidWorkableWeightRange('94', '89'), false)
  assert.equal(isValidWorkableWeightRange('', '94'), false)
  assert.equal(isValidWorkableWeightRange('89', ''), false)
})
