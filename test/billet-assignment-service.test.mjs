import test from 'node:test'
import assert from 'node:assert/strict'
import { performBilletAssignment } from '../server/billet-assignment-service.mjs'

function makeStore({ failBilletOnce = false } = {}) {
  const jobs = new Map([['job-1', { id: 'job-1', assignedBilletId: '', productionStatus: 'ready', productTitle: 'Game bat', specs: { wood: 'Maple' } }]])
  const billets = new Map([['billet-1', { id: 'billet-1', status: 'storage', species: 'Maple', suitabilityCategories: ['MLB capable'] }]])
  const syncs = []
  let shouldFail = failBilletOnce
  const copy = (value) => value ? structuredClone(value) : null
  return {
    jobs, billets, syncs,
    store: {
      listJobs: async () => Array.from(jobs.values()).map(copy),
      loadJob: async (id) => copy(jobs.get(id)),
      loadBillet: async (id) => copy(billets.get(id)),
      saveJob: async (job) => { jobs.set(job.id, copy(job)) },
      saveBillet: async (billet) => {
        billets.set(billet.id, copy(billet))
        if (shouldFail) { shouldFail = false; throw new Error('Shopify response lost') }
      },
      syncJob: async (job) => { syncs.push(copy(job)) },
      invalidate: () => {},
    },
  }
}

test('assignment saves job, production billet, and audit after read-back', async () => {
  const fixture = makeStore()
  const result = await performBilletAssignment({
    jobId: 'job-1', nextBilletId: 'billet-1', expectedBilletId: '', operator: 'operator@example.com',
    store: fixture.store, now: () => '2026-11-01T12:00:00.000Z',
  })
  assert.equal(result.status, 200)
  assert.equal(fixture.jobs.get('job-1').assignedBilletId, 'billet-1')
  assert.equal(fixture.billets.get('billet-1').status, 'production')
  assert.deepEqual(fixture.jobs.get('job-1').billetAssignmentHistory, [{
    at: '2026-11-01T12:00:00.000Z', fromBilletId: '', toBilletId: 'billet-1', by: 'operator@example.com',
  }])
  assert.equal(fixture.syncs.length, 1)
})

test('conflicting assignment leaves both records untouched', async () => {
  const fixture = makeStore()
  fixture.jobs.set('job-2', { id: 'job-2', assignedBilletId: 'billet-1', productionStatus: 'ready', specs: { wood: 'Maple' } })
  const result = await performBilletAssignment({
    jobId: 'job-1', nextBilletId: 'billet-1', expectedBilletId: '', operator: 'operator', store: fixture.store,
  })
  assert.equal(result.status, 409)
  assert.equal(fixture.jobs.get('job-1').assignedBilletId, '')
  assert.equal(fixture.billets.get('billet-1').status, 'storage')
})

test('a failed Shopify billet write restores the original job and billet', async () => {
  const fixture = makeStore({ failBilletOnce: true })
  await assert.rejects(performBilletAssignment({
    jobId: 'job-1', nextBilletId: 'billet-1', expectedBilletId: '', operator: 'operator', store: fixture.store,
  }), /Shopify response lost/)
  assert.equal(fixture.jobs.get('job-1').assignedBilletId, '')
  assert.equal(fixture.billets.get('billet-1').status, 'storage')
  assert.equal(fixture.syncs.at(-1).assignedBilletId, '')
})

test('reassignment returns the old billet to storage and verifies both billets', async () => {
  const fixture = makeStore()
  fixture.jobs.get('job-1').assignedBilletId = 'billet-1'
  fixture.billets.get('billet-1').status = 'production'
  fixture.billets.set('billet-2', { id: 'billet-2', status: 'storage', species: 'Maple', suitabilityCategories: ['MLB capable'] })
  const result = await performBilletAssignment({
    jobId: 'job-1', nextBilletId: 'billet-2', expectedBilletId: 'billet-1', operator: 'operator', store: fixture.store,
  })
  assert.equal(result.status, 200)
  assert.equal(fixture.jobs.get('job-1').assignedBilletId, 'billet-2')
  assert.equal(fixture.billets.get('billet-1').status, 'storage')
  assert.equal(fixture.billets.get('billet-2').status, 'production')
})

test('a stale readback of the released billet restores all records', async () => {
  const fixture = makeStore()
  fixture.jobs.get('job-1').assignedBilletId = 'billet-1'
  fixture.billets.get('billet-1').status = 'production'
  fixture.billets.set('billet-2', { id: 'billet-2', status: 'storage', species: 'Maple', suitabilityCategories: ['MLB capable'] })
  const originalLoadBillet = fixture.store.loadBillet
  let previousReads = 0
  fixture.store.loadBillet = async (id) => {
    const billet = await originalLoadBillet(id)
    if (id === 'billet-1' && ++previousReads === 2) return { ...billet, status: 'production' }
    return billet
  }
  await assert.rejects(performBilletAssignment({
    jobId: 'job-1', nextBilletId: 'billet-2', expectedBilletId: 'billet-1', operator: 'operator', store: fixture.store,
  }), /Shopify did not confirm/)
  assert.equal(fixture.jobs.get('job-1').assignedBilletId, 'billet-1')
  assert.equal(fixture.billets.get('billet-1').status, 'production')
  assert.equal(fixture.billets.get('billet-2').status, 'storage')
})
