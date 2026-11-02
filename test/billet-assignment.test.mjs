import test from 'node:test'
import assert from 'node:assert/strict'
import { getBilletAssignmentCandidate, getBilletAssignmentConflict } from '../shared/billet-assignment.mjs'

const job = { id: 'job-1', assignedBilletId: '', productionStatus: 'ready', specs: { wood: 'Maple' } }
const billet = { id: 'billet-1', status: 'storage', species: 'Maple', weight: 49, grade: 'Prime' }

test('assignment rejects stale jobs, claimed billets, and species mismatches', () => {
  assert.match(getBilletAssignmentConflict({ job, nextBillet: billet, allJobs: [job], expectedBilletId: 'old' }), /changed/)
  assert.match(getBilletAssignmentConflict({ job, nextBillet: billet, allJobs: [job, { ...job, id: 'job-2', assignedBilletId: billet.id }], expectedBilletId: '' }), /already assigned/)
  assert.match(getBilletAssignmentConflict({ job, nextBillet: { ...billet, species: 'Birch' }, allJobs: [job], expectedBilletId: '' }), /species/)
  assert.match(getBilletAssignmentConflict({ job, nextBillet: { ...billet, status: 'production' }, allJobs: [job], expectedBilletId: '' }), /no longer in storage/)
  assert.match(getBilletAssignmentConflict({ job, nextBillet: { ...billet, suitabilityCategories: ['Trophy'] }, allJobs: [job], expectedBilletId: '' }), /purpose/)
  assert.equal(getBilletAssignmentConflict({ job, nextBillet: billet, allJobs: [job], expectedBilletId: '' }), '')
})

test('candidate finder separates unweighed billets from measured ones', () => {
  assert.deepEqual(getBilletAssignmentCandidate(job, billet), { needsWeightCheck: false, needsGradeCheck: false })
  assert.deepEqual(getBilletAssignmentCandidate(job, { ...billet, weight: '' }), { needsWeightCheck: true, needsGradeCheck: false })
  assert.equal(getBilletAssignmentCandidate(job, { ...billet, species: 'Birch' }), null)
  assert.equal(getBilletAssignmentCandidate(job, billet, new Set([billet.id])), null)
  assert.equal(getBilletAssignmentCandidate(job, { ...billet, suitabilityCategories: ['Trophy'] }), null)
})
