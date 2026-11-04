import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { keepOriginalSubmissionSnapshot } from '../server/order-history.mjs'
import { getAssignedBilletIds } from '../shared/billet-assignment.mjs'
import { canAssignCrmContactOwner, canUpdateOwnedRecord, getDerivedCrmContactDeleteIds, isManualCrmContactRecord } from '../server/security-policy.mjs'

// Run the production server's patch, permission and cache functions. Only external
// storage and cache-file I/O are replaced, so these tests never write live records.
const source = fs.readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const code = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(ast)).join('\n')
const collections = ['billets', 'players', 'producedBats', 'customBatModels', 'orderJobs', 'billingContacts', 'crmContacts']
const clone = value => JSON.parse(JSON.stringify(value))
const salesperson = { key: 'test-sales', name: 'Test Sales', email: 'sales@trinitybats.com' }

function fixture({ warm = true } = {}) {
  const base = {
    billets: [{ id: 'billet', barcode: '1991', status: 'production', weight: 82.6 }, { id: 'other-billet', barcode: '1992', status: 'storage' }],
    players: [{ id: 'player', playerName: 'Player', productionBilletAssignments: [{ billetId: 'billet' }] }, { id: 'other-player' }],
    producedBats: [{ id: 'result', model: 'RA13', billetWeightMin: '82', billetWeightMax: '84' }, { id: 'other-result' }],
    customBatModels: [{ id: 'model', name: 'Model' }, { id: 'other-model' }],
    orderJobs: [{ id: 'job', assignedBilletId: '', assignedBilletIds: [], assignedBilletBarcodes: [], billetAssignmentHistory: [], productionStatus: 'ready',
      submissionSnapshot: { version: 1, draft: { playerName: 'Original player', levelOfPlay: 'College' } } }, { id: 'other-job', notes: 'Unrelated job' }],
    billingContacts: [{ id: 'payer', name: 'Payer' }, { id: 'other-payer' }],
    crmContacts: [{ id: 'contact', source: 'Manual CRM entry', tags: ['Manual entry'], salesOwner: salesperson.name, ownerEmail: salesperson.email },
      { id: 'other-contact', source: 'Manual CRM entry', tags: ['Manual entry'], ownerEmail: 'other@trinitybats.com' }],
  }
  const records = clone(base)
  const writes = [], deletes = [], metafieldSyncs = [], cacheFiles = []
  let reads = 0
  const resourceConfigs = Object.fromEntries(collections.map(key => [key, { key }]))
  const context = vm.createContext({
    Date, Error, console, keepOriginalSubmissionSnapshot, getAssignedBilletIds,
    canAssignCrmContactOwner, canUpdateOwnedRecord, getDerivedCrmContactDeleteIds, isManualCrmContactRecord,
    resourceConfigs, stateCacheValue: warm ? clone(base) : null, stateCacheExpiresAt: warm ? Date.now() + 60000 : 0,
    stateCachePromise: null, stateCacheTtlMs: 60000, orderHistoryCache: null,
    salesPortalTeamByEmail: new Map([[salesperson.email, salesperson]]), salesPortalTeamMembers: [salesperson],
  })
  vm.runInContext(code, context)
  Object.assign(context, {
    ensureDefinitions: async () => {},
    getRecordByHandle: async (config, id) => clone(records[config.key].find(record => record.id === id) ?? null),
    listRecords: async config => clone(records[config.key]),
    upsertRecord: async (config, record) => {
      writes.push({ collection: config.key, record: clone(record) })
      const index = records[config.key].findIndex(existing => existing.id === record.id)
      if (index < 0) records[config.key].push(clone(record))
      else records[config.key][index] = clone(record)
    },
    deleteRecord: async (config, id) => {
      deletes.push({ collection: config.key, id })
      records[config.key] = records[config.key].filter(record => record.id !== id)
    },
    syncOrderJobMetafields: async jobs => metafieldSyncs.push(clone(jobs)),
    writeStateCacheFile: value => cacheFiles.push(clone(value)),
    loadSharedState: async () => { reads++; return { ok: true, ...clone(records) } },
  })
  return { context, base, records, writes, deletes, metafieldSyncs, cacheFiles, reads: () => reads }
}

for (const warm of [true, false]) {
  for (const collection of collections) {
    test(`${collection} persists and reads back without a workspace snapshot (${warm ? 'warm' : 'cold'} cache)`, async () => {
      const { context, base, records, writes, deletes, metafieldSyncs, reads, cacheFiles } = fixture({ warm })
      const edited = { ...base[collection][0], notes: 'Changed record only' }
      const result = await context.applyStatePatch({ [collection]: [edited] })
      assert.equal(result.applied[collection], 1)
      assert.deepEqual(writes, [{ collection, record: edited }])
      assert.deepEqual(deletes, [])
      assert.deepEqual(records[collection][0], edited)
      assert.deepEqual(records[collection][1], base[collection][1])
      for (const other of collections.filter(key => key !== collection)) assert.deepEqual(records[other], base[other])
      assert.deepEqual(metafieldSyncs, collection === 'orderJobs' ? [[edited]] : [])
      const readback = clone(await context.getSharedState())
      assert.deepEqual(readback, { ok: true, ...records })
      assert.equal(reads(), warm ? 0 : 1, 'A cold cache must rebuild from canonical stored records')
      assert.deepEqual(cacheFiles.at(-1), readback)
    })
  }
}

test('combined additions and an explicit data-point deletion preserve all unmentioned records', async () => {
  const { context, base, records, writes, deletes } = fixture()
  const model = { id: 'new-model', name: 'New Model' }
  const result = { id: 'new-result', model: 'New Model', billetWeightMin: '81', billetWeightMax: '83' }
  await context.applyStatePatch({ customBatModels: [model], producedBats: [result], deletes: { producedBats: ['result'] } })
  assert.deepEqual(records.producedBats, [base.producedBats[1], result])
  assert.deepEqual(records.customBatModels, [...base.customBatModels, model])
  assert.deepEqual(records.orderJobs, base.orderJobs)
  assert.equal(writes.length, 2)
  assert.deepEqual(deletes, [{ collection: 'producedBats', id: 'result' }])
  assert.deepEqual(clone(await context.getSharedState()), { ok: true, ...records })
})

test('an ordinary player edit cannot overwrite guarded billet assignments', async () => {
  const { context, base, records } = fixture()
  await context.applyStatePatch({ players: [{ ...base.players[0], playerName: 'Updated Player', productionBilletAssignments: [] }] })
  assert.equal(records.players[0].playerName, 'Updated Player')
  assert.deepEqual(records.players[0].productionBilletAssignments, base.players[0].productionBilletAssignments)
})

test('production edits preserve the original manual order submission and assignment history', async () => {
  const { context, base, records, metafieldSyncs } = fixture()
  await context.applyStatePatch({ orderJobs: [{ ...base.orderJobs[0], productionStatus: 'in_production',
    submissionSnapshot: { version: 1, draft: { playerName: 'Overwritten' } }, billetAssignmentHistory: ['overwritten'] }] })
  assert.equal(records.orderJobs[0].productionStatus, 'in_production')
  assert.deepEqual(records.orderJobs[0].submissionSnapshot, base.orderJobs[0].submissionSnapshot)
  assert.deepEqual(records.orderJobs[0].billetAssignmentHistory, [])
  assert.deepEqual(metafieldSyncs, [[records.orderJobs[0]]])
})

test('changing an assignment through an ordinary edit is rejected before any writes', async () => {
  const { context, base, writes } = fixture()
  await assert.rejects(context.applyStatePatch({ orderJobs: [{ ...base.orderJobs[0], assignedBilletId: 'billet' }] }), /guarded assignment action/)
  assert.equal(writes.length, 0)
})

test('an assigned production billet cannot return to storage through a delta save', async () => {
  const { context, base, records, writes } = fixture()
  records.orderJobs[0].assignedBilletId = 'billet'
  records.orderJobs[0].assignedBilletIds = ['billet']
  await assert.rejects(context.applyStatePatch({ billets: [{ ...base.billets[0], status: 'storage' }] }), /Release it from the production job first/)
  assert.equal(writes.length, 0)
  assert.equal(records.billets[0].status, 'production')
})

test('a failed storage write is not reported as applied or added to the cache', async () => {
  const { context, base, cacheFiles } = fixture()
  context.upsertRecord = async () => { throw new Error('Storage temporarily unavailable') }
  await assert.rejects(context.applyStatePatch({ billingContacts: [{ ...base.billingContacts[0], name: 'Updated' }] }), /temporarily unavailable/)
  assert.deepEqual(clone(context.stateCacheValue), base)
  assert.equal(cacheFiles.length, 0)
})

test('production-role edits keep their existing allowed categories and deletion boundary', async () => {
  const { context, base } = fixture()
  const prepared = await context.prepareFullToolStatePatchForSession({ ...base, deletes: { producedBats: ['result'], billets: ['billet'] } }, { role: 'production' })
  assert.equal(prepared.error, '')
  assert.deepEqual(Object.keys(prepared.patch), ['billets', 'players', 'producedBats', 'customBatModels', 'orderJobs', 'deletes'])
  assert.deepEqual(clone(prepared.patch.deletes), { producedBats: ['result'] })
})

test('admin patches work without a snapshot and sales ownership checks remain enforced', async () => {
  const { context, base } = fixture()
  const payload = { crmContacts: [{ ...base.crmContacts[0], relationshipNotes: 'Updated' }] }
  const admin = await context.prepareFullToolStatePatchForSession(payload, { isAdmin: true })
  assert.equal(admin.patch, payload)
  const sales = await context.prepareFullToolStatePatchForSession(payload, { email: salesperson.email, role: 'sales' })
  assert.equal(sales.error, '')
  assert.equal(sales.patch.crmContacts[0].relationshipNotes, 'Updated')
  assert.equal(sales.patch.crmContacts[0].ownerEmail, salesperson.email)
  assert.equal('orderJobs' in sales.patch, false)
  const forbidden = await context.prepareFullToolStatePatchForSession({ crmContacts: [base.crmContacts[1]] }, { email: salesperson.email, role: 'sales' })
  assert.match(forbidden.error, /only update CRM contacts assigned to them/)
})
