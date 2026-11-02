import test from 'node:test'
import assert from 'node:assert/strict'
import { isActionableProductionJob, isProductionBatJob } from '../shared/production-queue.mjs'
import { getBilletAssignmentConflict, getBilletAssignmentCandidate } from '../shared/billet-assignment.mjs'

const billet = { id: 'billet-1', status: 'storage', species: 'Maple', suitabilityCategories: ['MLB capable'], weight: 90 }

test('active queue excludes shipped history and old shirt lines while preserving active bat work', () => {
  const activeBat = { id: 'job-1', itemType: 'bat', productTitle: 'Custom Maple Bat',
    productionStatus: 'new', fulfillmentStatus: 'unfulfilled', specs: { wood: 'Maple' } }
  const fulfilledBat = { ...activeBat, id: 'job-2', fulfillmentStatus: 'fulfilled' }
  const completedBat = { ...activeBat, id: 'job-3', productionStatus: 'complete' }
  const legacyShirt = { ...activeBat, id: 'job-4', productTitle: 'Trinity Signature T-Shirt' }
  assert.equal(isActionableProductionJob(activeBat), true)
  assert.equal(isActionableProductionJob(fulfilledBat), false)
  assert.equal(isActionableProductionJob(completedBat), false)
  assert.equal(isProductionBatJob(legacyShirt), false)
  assert.equal(isActionableProductionJob(legacyShirt), false)
})

test('fulfilled jobs cannot receive billets, but an existing assignment can be released', () => {
  const job = { id: 'job-2', itemType: 'bat', productTitle: 'Custom Maple Bat',
    productionStatus: 'new', fulfillmentStatus: 'fulfilled', assignedBilletId: 'old-billet', specs: { wood: 'Maple' } }
  assert.equal(getBilletAssignmentCandidate(job, billet), null)
  assert.match(getBilletAssignmentConflict({ job, nextBillet: billet, allJobs: [job], expectedBilletId: 'old-billet' }), /fulfilled/)
  assert.equal(getBilletAssignmentConflict({ job, nextBillet: null, allJobs: [job], expectedBilletId: 'old-billet' }), '')
})
