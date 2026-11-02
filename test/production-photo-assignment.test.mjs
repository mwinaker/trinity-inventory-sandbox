import test from 'node:test'
import assert from 'node:assert/strict'
import { performBilletAssignments } from '../server/billet-assignment-service.mjs'
import { applyProductionPhotoAssignments } from '../server/production-photo-assignment.mjs'
import { readProductionPhoto, resolveProductionPhoto } from '../server/production-photo-reader.mjs'

function fixture() {
  const jobs = new Map([
    ['job-a', { id: 'job-a', quantity: 2, itemType: 'bat', productionStatus: 'ready', productTitle: 'Pro Maple', specs: { wood: 'Maple' }, orderReference: 'TBC-101', shopifyOrderId: 'gid://shopify/Order/101', playerName: 'Jordan Sample', playerProfileId: 'profile-a', assignedBilletId: '' }],
    ['job-b', { id: 'job-b', quantity: 1, itemType: 'bat', productionStatus: 'ready', productTitle: 'Pro Maple', specs: { wood: 'Maple' }, orderReference: 'TBC-101', shopifyOrderId: 'gid://shopify/Order/101', playerName: 'Jordan Sample', playerProfileId: 'profile-a', assignedBilletId: '' }],
  ])
  const billets = new Map(['0001', '0002', '0003'].map((code) => [
    `billet-${code}`, { id: `billet-${code}`, barcode: `TBC-BLT-${code}`, status: 'storage', species: 'Maple', suitabilityCategories: ['MLB capable'] },
  ]))
  const players = new Map([['profile-a', { id: 'profile-a', profileKind: 'Player', playerName: 'Jordan Sample', levelOfPlay: 'MLB', bats: [] }]])
  const copy = (item) => item ? structuredClone(item) : null
  const syncs = []
  const store = {
    listJobs: async () => [...jobs.values()].map(copy),
    listPlayers: async () => [...players.values()].map(copy),
    loadJob: async (id) => copy(jobs.get(id)),
    loadBillet: async (id) => copy(billets.get(id)),
    loadPlayer: async (id) => copy(players.get(id)),
    saveJob: async (job) => { jobs.set(job.id, copy(job)) },
    saveBillet: async (billet) => { billets.set(billet.id, copy(billet)) },
    savePlayer: async (player) => { players.set(player.id, copy(player)) },
    syncJob: async (job) => { syncs.push(copy(job)) },
    invalidate: () => {},
  }
  return { jobs, billets, players, store, syncs }
}

test('one production line saves two billets, their inventory status, and the existing pro profile', async () => {
  const f = fixture()
  const result = await performBilletAssignments({
    jobId: 'job-a', nextBilletIds: ['billet-0001', 'billet-0002'], expectedBilletIds: [],
    operator: 'jeremy@trinitybats.com', source: 'photo', imageSha256: 'example',
    store: f.store, now: () => '2026-11-02T12:00:00.000Z',
  })
  assert.equal(result.status, 200)
  assert.deepEqual(f.jobs.get('job-a').assignedBilletIds, ['billet-0001', 'billet-0002'])
  assert.deepEqual(f.jobs.get('job-a').assignedBilletBarcodes, ['TBC-BLT-0001', 'TBC-BLT-0002'])
  assert.equal(f.billets.get('billet-0001').status, 'production')
  assert.equal(f.billets.get('billet-0002').status, 'production')
  assert.deepEqual(f.players.get('profile-a').productionBilletAssignments[0].billetIds, ['billet-0001', 'billet-0002'])
  assert.equal(f.jobs.get('job-a').billetAssignmentHistory[0].source, 'photo')
  assert.equal(f.syncs.length, 1)
})

test('releasing one of two billets keeps the other linked and returns only the released billet to storage', async () => {
  const f = fixture()
  await performBilletAssignments({ jobId: 'job-a', nextBilletIds: ['billet-0001', 'billet-0002'], expectedBilletIds: [], operator: 'Jeremy', store: f.store })
  const result = await performBilletAssignments({ jobId: 'job-a', nextBilletIds: ['billet-0002'], expectedBilletIds: ['billet-0001', 'billet-0002'], operator: 'Jeremy', store: f.store })
  assert.equal(result.status, 200)
  assert.equal(f.billets.get('billet-0001').status, 'storage')
  assert.equal(f.billets.get('billet-0002').status, 'production')
  assert.deepEqual(f.players.get('profile-a').productionBilletAssignments[0].billetNumbers, ['TBC-BLT-0002'])
})

test('a repeat assignment repairs a missing pro-profile link and refreshes the order record', async () => {
  const f = fixture()
  await performBilletAssignments({ jobId: 'job-a', nextBilletIds: ['billet-0001'], expectedBilletIds: [], operator: 'Jeremy', store: f.store })
  f.players.get('profile-a').productionBilletAssignments = []
  const syncedBefore = f.syncs.length
  const result = await performBilletAssignments({
    jobId: 'job-a', nextBilletIds: ['billet-0001'], expectedBilletIds: ['billet-0001'], operator: 'Jeremy', store: f.store,
  })
  assert.equal(result.status, 200)
  assert.deepEqual(f.players.get('profile-a').productionBilletAssignments[0].billetIds, ['billet-0001'])
  assert.equal(f.syncs.length, syncedBefore + 1)
})

test('a player-profile write failure restores the order and all billets', async () => {
  const f = fixture()
  let fail = true
  const save = f.store.savePlayer
  f.store.savePlayer = async (player) => {
    await save(player)
    if (fail) { fail = false; throw new Error('profile response lost') }
  }
  await assert.rejects(performBilletAssignments({
    jobId: 'job-a', nextBilletIds: ['billet-0001', 'billet-0002'], expectedBilletIds: [], operator: 'Jeremy', store: f.store,
  }), /profile response lost/)
  assert.equal(f.jobs.get('job-a').assignedBilletId, '')
  assert.equal(f.billets.get('billet-0001').status, 'storage')
  assert.equal(f.billets.get('billet-0002').status, 'storage')
  assert.equal(f.players.get('profile-a').productionBilletAssignments, undefined)
})

test('photo resolution requires matching order and unique inventory numbers for every product line', () => {
  const f = fixture()
  const extraction = {
    orderReferences: ['TBC-101'], uncertainText: [], unassignedBilletNumbers: [],
    lines: [
      { printedJobId: 'job-a', billetNumbers: ['0001', '0002'] },
      { printedJobId: 'job-b', billetNumbers: ['0003'] },
    ],
  }
  const input = { selectedJobId: 'job-a', jobs: [...f.jobs.values()], billets: [...f.billets.values()], extraction }
  const resolved = resolveProductionPhoto(input)
  assert.equal(resolved.status, 200)
  assert.deepEqual(resolved.assignments.map((item) => item.billetIds), [['billet-0001', 'billet-0002'], ['billet-0003']])
  assert.equal(resolveProductionPhoto({ ...input, extraction: { ...extraction, orderReferences: ['TBC-102'] } }).status, 422)
  assert.equal(resolveProductionPhoto({ ...input, extraction: { ...extraction, uncertainText: ['last digit unreadable'] } }).status, 422)
  assert.equal(resolveProductionPhoto({ ...input, extraction: { ...extraction, lines: [{ printedJobId: '', billetNumbers: ['0001'] }] } }).status, 422)
})

test('photo resolution follows the same order across its draft and completed-order records', () => {
  const f = fixture()
  f.jobs.get('job-a').shopifyDraftOrderId = 'gid://shopify/DraftOrder/55'
  f.jobs.get('job-b').shopifyOrderId = ''
  f.jobs.get('job-b').shopifyDraftOrderId = 'gid://shopify/DraftOrder/55'
  const result = resolveProductionPhoto({
    selectedJobId: 'job-a', jobs: [...f.jobs.values()], billets: [...f.billets.values()],
    extraction: { orderReferences: ['TBC-101'], uncertainText: [], unassignedBilletNumbers: [], lines: [
      { printedJobId: 'job-a', billetNumbers: ['0001'] },
      { printedJobId: 'job-b', billetNumbers: ['0003'] },
    ] },
  })
  assert.equal(result.status, 200)
  assert.deepEqual(result.assignments.map((item) => item.jobId), ['job-a', 'job-b'])
})

test('a failed second product line restores the first line and its inventory', async () => {
  const f = fixture()
  const original = f.store.saveJob
  let fail = true
  f.store.saveJob = async (job) => {
    await original(job)
    if (job.id === 'job-b' && job.assignedBilletId && fail) { fail = false; throw new Error('second line failed') }
  }
  await assert.rejects(applyProductionPhotoAssignments({
    assignments: [
      { jobId: 'job-a', billetIds: ['billet-0001'], expectedBilletIds: [] },
      { jobId: 'job-b', billetIds: ['billet-0003'], expectedBilletIds: [] },
    ], operator: 'Jeremy', imageSha256: 'example', store: f.store,
  }), /second line failed/)
  assert.equal(f.jobs.get('job-a').assignedBilletId, '')
  assert.equal(f.jobs.get('job-b').assignedBilletId, '')
  assert.equal(f.billets.get('billet-0001').status, 'storage')
  assert.equal(f.billets.get('billet-0003').status, 'storage')
  assert.equal(f.players.get('profile-a').productionBilletAssignments, undefined)
})

test('photo reader requires two independent matching transcriptions', async () => {
  const image = Buffer.alloc(200, 1)
  let count = 0
  const fetchImpl = async () => {
    const readNumber = ++count
    return { ok: true, json: async () => ({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({
        orderReferences: ['TBC-101'], lines: [{ printedJobId: 'job-a', description: 'Maple', billetNumbers: [readNumber === 1 ? '0001' : '0002'] }],
        unassignedBilletNumbers: [], uncertainText: [],
      }) }] }],
    }) }
  }
  await assert.rejects(readProductionPhoto({ apiKey: 'test-only', image, mimeType: 'image/jpeg', fetchImpl }), /disagreed/)
  assert.equal(count, 2)
})
