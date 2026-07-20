import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidWorkableWeightRange,
  normalizeBilletWorkflowStatus,
  normalizeBilletSuitability,
  reconcileBilletStatusForOrderAssignment,
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

test('billets enter storage and legacy production states normalize to production', () => {
  assert.equal(normalizeBilletWorkflowStatus(undefined), 'storage')
  assert.equal(normalizeBilletWorkflowStatus('received'), 'storage')
  assert.equal(normalizeBilletWorkflowStatus('production'), 'production')
  assert.equal(normalizeBilletWorkflowStatus('in_production'), 'production')
})

test('order assignment moves the selected billet into production and releases an unused billet', () => {
  assert.equal(
    reconcileBilletStatusForOrderAssignment('billet-new', 'storage', {
      previousBilletId: 'billet-old',
      nextBilletId: 'billet-new',
      assignedBilletIds: ['billet-new'],
    }),
    'production',
  )
  assert.equal(
    reconcileBilletStatusForOrderAssignment('billet-old', 'production', {
      previousBilletId: 'billet-old',
      nextBilletId: '',
      assignedBilletIds: [],
    }),
    'storage',
  )
  assert.equal(
    reconcileBilletStatusForOrderAssignment('billet-old', 'production', {
      previousBilletId: 'billet-old',
      nextBilletId: '',
      assignedBilletIds: ['billet-old'],
    }),
    'production',
  )
})
