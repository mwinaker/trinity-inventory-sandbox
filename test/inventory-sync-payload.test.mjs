import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Exercise the actual client save function, including its body, acknowledgement and retry handling.
const source = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const helperNames = new Set(['mergeRecordsByKey', 'createEmptyRemoteState', 'getRemoteStateRecordKey',
  'getChangedRemoteRecords', 'getDeletedRemoteRecordIds', 'buildRemoteStatePatch',
  'hasRemoteStatePatchChanges', 'countRemoteStatePatchRecords', 'applyRemoteStatePatchToSnapshot',
  'getManualCrmContacts', 'getNonManualCrmContactIds', 'isManualCrmContact', 'normalizeCrmContact',
  'normalizeCrmTouchpoint', 'normalizeCrmTouchpointType', 'normalizeCrmStage', 'normalizeCrmPriority',
  'normalizeCrmList', 'normalizeCrmSearchText', 'createId'])
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && helperNames.has(node.name?.text))
const constantNames = new Set(['manualCrmSourceLabels', 'manualCrmTagLabels', 'emptyCrmContact',
  'crmStageOptions', 'crmPriorityOptions', 'crmTouchpointTypeOptions'])
const constants = ast.statements.filter(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(declaration => constantNames.has(declaration.name.getText(ast))))
let saveFunction
function findSave(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'syncRemoteStateNow') saveFunction = node.initializer
  ts.forEachChild(node, findSave)
}
findSave(ast)
assert.ok(saveFunction, 'The client save function must be exercised')
const code = ts.transpileModule(`${[...constants, ...helpers].map(node => node.getText(ast)).join('\n')}\nvar save = ${saveFunction.getText(ast)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

const collections = ['billets', 'players', 'producedBats', 'customBatModels', 'orderJobs', 'billingContacts', 'crmContacts']
const changedFields = {
  billets: { weight: 83.2, grade: 'Prime', suitabilityCategories: ['MLB capable'] },
  players: { playerName: 'Updated Player', bats: [{ id: 'spec', model: 'RA13', length: '33' }] },
  producedBats: { model: 'RA13', billetWeightMin: '82', billetWeightMax: '84' },
  customBatModels: { name: 'Updated Model', notes: 'Revised specification' },
  orderJobs: { productionStatus: 'in_production', internalNotes: 'Check engraving' },
  billingContacts: { name: 'Updated Payer', email: 'payer@example.test' },
  crmContacts: { relationshipNotes: 'Follow up next week', touchpoints: [{ id: 'touchpoint', type: 'call', contactedAt: '2026-11-04T12:00:00Z', summary: 'Spoke with buyer' }] },
}
const plain = value => JSON.parse(JSON.stringify(value))

function fixture({ duringSave, reject = false, endpoint = '/api/team-tool/state', edit } = {}) {
  const base = {
    billets: [{ id: 'billet-1991', barcode: '1991', status: 'storage', species: 'Birch', weight: 82.6 },
      { id: 'billet-1992', barcode: '1992', status: 'storage', species: 'Maple' }],
    players: [{ id: 'player', playerName: 'Player', bats: [] }, { id: 'other-player', playerName: 'Unrelated Player' }],
    producedBats: [{ id: 'result', model: 'Model' }, { id: 'other-result', model: 'Unrelated Model' }],
    customBatModels: [{ id: 'model', name: 'Model' }, { id: 'other-model', name: 'Unrelated Model' }],
    billingContacts: [{ id: 'payer', name: 'Payer' }, { id: 'other-payer', name: 'Unrelated Payer' }],
    crmContacts: [{ id: 'contact', source: 'Manual CRM entry' }, { id: 'other-contact', source: 'Manual CRM entry' }],
    orderJobs: [{ id: 'job', productionStatus: 'ready' }, { id: 'unrelated-order', notes: 'x'.repeat(6 * 1024 * 1024) }],
  }
  let current
  const requests = []
  const statuses = []
  const context = vm.createContext({
    Error, Date, console,
    syncInFlight: { current: false }, hasPendingLocalSync: { current: true },
    skipNextRemoteSync: { current: false }, lastSyncedState: { current: base },
    backendStatus: 'connected', stateEndpoint: endpoint,
    getCurrentRemoteState: () => current,
    setBackendStatus: status => statuses.push(status), setSyncMessage: () => {}, setSyncRetryNonce: () => {},
    fetchApi: async (url, options) => {
      const bytes = Buffer.byteLength(options.body)
      const body = JSON.parse(options.body)
      requests.push({ url, bytes, body })
      if (duringSave && requests.length === 1) current = duringSave(current)
      const rejected = typeof reject === 'function' ? reject(requests.length) : reject
      const ok = !rejected && bytes <= 5 * 1024 * 1024
      return { ok, json: async () => ok ? { ok: true } : { ok: false, message: 'Request rejected' } }
    },
  })
  vm.runInContext(code, context)
  base.crmContacts = plain(context.getManualCrmContacts(base.crmContacts))
  current = edit ? edit(base, context) : { ...base, billets: base.billets.map((billet, i) => i ? billet : { ...billet, status: 'production' }) }
  return { context, requests, statuses, base }
}

for (const endpoint of ['/api/team-tool/state', '/api/state']) {
  for (const collection of collections) {
    for (const operation of ['edit', 'add']) {
      test(`${operation} ${collection} sends only the affected record: ${endpoint}`, async () => {
        let changed
        const { context, requests, base } = fixture({ endpoint, edit: (state, client) => {
          changed = { ...state[collection][0], ...changedFields[collection] }
          if (operation === 'add') {
            changed.id = `new-${collection}`
            if (collection === 'billets') changed.barcode = 'new-barcode'
          }
          if (collection === 'crmContacts') changed = plain(client.normalizeCrmContact(changed))
          return { ...state, [collection]: operation === 'add'
            ? [...state[collection], changed] : [changed, ...state[collection].slice(1)] }
        } })
        assert.equal(await context.save(), true)
        assert.equal(requests.length, 1)
        assert.equal(requests[0].url, endpoint)
        assert.ok(requests[0].bytes < 4096, `${collection} must not include unrelated workspace data`)
        assert.deepEqual(requests[0].body, { [collection]: [changed] })
        const saved = context.lastSyncedState.current
        assert.deepEqual(plain(saved[collection].find(record => record.id === changed.id)), changed)
        assert.deepEqual(plain(saved[collection][1]), base[collection][1])
        for (const other of collections.filter(key => key !== collection)) assert.deepEqual(plain(saved[other]), base[other])
        assert.equal(context.hasPendingLocalSync.current, false)
        assert.equal(await context.save(), true)
        assert.equal(requests.length, 1, 'An acknowledged edit must not be resent')
      })
    }
  }
}

for (const endpoint of ['/api/team-tool/state', '/api/state']) {
  test(`one billet status change stays small despite a workspace over 5 MiB: ${endpoint}`, async () => {
    const { context, requests, base } = fixture({ endpoint })
    assert.ok(Buffer.byteLength(JSON.stringify(base)) > 5 * 1024 * 1024)
    assert.equal(await context.save(), true)
    assert.equal(requests[0].url, endpoint)
    assert.ok(requests[0].bytes < 1024)
    assert.deepEqual(Object.keys(requests[0].body), ['billets'])
    assert.equal(requests[0].body.billets.length, 1)
    assert.equal(requests[0].body.billets[0].barcode, '1991')
    assert.equal(requests[0].body.billets[0].status, 'production')
    assert.equal(context.lastSyncedState.current.billets[0].status, 'production')
    assert.equal(context.lastSyncedState.current.billets[1].status, 'storage')
    assert.equal(context.lastSyncedState.current.orderJobs, base.orderJobs)
    assert.equal(context.hasPendingLocalSync.current, false)
  })
}

test('an edit made while a billet save is in flight remains pending and saves next', async () => {
  const { context, requests } = fixture({ duringSave: current => ({ ...current,
    billets: current.billets.map(billet => billet.barcode === '1992' ? { ...billet, status: 'production' } : billet),
  }) })
  assert.equal(await context.save(), true)
  assert.equal(context.hasPendingLocalSync.current, true)
  assert.equal(context.lastSyncedState.current.billets[1].status, 'storage')
  assert.equal(await context.save(), true)
  assert.equal(requests.length, 2)
  assert.deepEqual(requests.map(request => request.body.billets.map(billet => billet.barcode)), [['1991'], ['1992']])
  assert.equal(context.hasPendingLocalSync.current, false)
})

test('a rejected save does not acknowledge the pending billet change', async () => {
  const { context, statuses } = fixture({ reject: true })
  assert.equal(await context.save(), false)
  assert.equal(context.lastSyncedState.current.billets[0].status, 'storage')
  assert.equal(context.hasPendingLocalSync.current, true)
  assert.equal(context.syncInFlight.current, false)
  assert.deepEqual(statuses, ['offline'])
})

test('a combined model creation and recorded bat save keeps both changes in one small request', async () => {
  const { context, requests } = fixture({ edit: base => ({ ...base,
    customBatModels: [...base.customBatModels, { id: 'new-model', name: 'New Model' }],
    producedBats: [...base.producedBats, { id: 'new-result', modelId: 'new-model', model: 'New Model' }],
  }) })
  assert.equal(await context.save(), true)
  assert.deepEqual(requests[0].body, {
    producedBats: [{ id: 'new-result', modelId: 'new-model', model: 'New Model' }],
    customBatModels: [{ id: 'new-model', name: 'New Model' }],
  })
  assert.ok(requests[0].bytes < 1024)
  assert.equal(context.lastSyncedState.current.customBatModels.length, 3)
  assert.equal(context.lastSyncedState.current.producedBats.length, 3)
})

test('deleting a bat data point sends its ID and preserves the other records', async () => {
  const { context, requests, base } = fixture({ edit: state => ({ ...state,
    producedBats: state.producedBats.slice(1),
  }) })
  assert.equal(await context.save(), true)
  assert.deepEqual(requests[0].body, { deletes: { producedBats: ['result'] } })
  assert.deepEqual(plain(context.lastSyncedState.current.producedBats), base.producedBats.slice(1))
  assert.deepEqual(plain(context.lastSyncedState.current.orderJobs), base.orderJobs)
})

test('an unchanged workspace creates no save request', async () => {
  const { context, requests } = fixture({ edit: state => state })
  assert.equal(await context.save(), true)
  assert.equal(requests.length, 0)
  assert.equal(context.hasPendingLocalSync.current, false)
})

test('a failed edit can retry without losing or resending unrelated data', async () => {
  const { context, requests } = fixture({ reject: attempt => attempt === 1, edit: base => ({ ...base,
    players: [{ ...base.players[0], ...changedFields.players }, base.players[1]],
  }) })
  assert.equal(await context.save(), false)
  assert.equal(context.lastSyncedState.current.players[0].playerName, 'Player')
  assert.equal(context.hasPendingLocalSync.current, true)
  assert.equal(await context.save(), true)
  assert.deepEqual(requests[1].body, requests[0].body)
  assert.equal(context.lastSyncedState.current.players[0].playerName, 'Updated Player')
  assert.equal(context.hasPendingLocalSync.current, false)
})

test('an edit to another category during a save remains pending until its own acknowledgement', async () => {
  const { context, requests } = fixture({ duringSave: current => ({ ...current,
    billingContacts: [{ ...current.billingContacts[0], ...changedFields.billingContacts }, current.billingContacts[1]],
  }) })
  assert.equal(await context.save(), true)
  assert.equal(context.hasPendingLocalSync.current, true)
  assert.equal(context.lastSyncedState.current.billingContacts[0].name, 'Payer')
  assert.equal(await context.save(), true)
  assert.deepEqual(requests.map(request => Object.keys(request.body)), [['billets'], ['billingContacts']])
  assert.equal(context.lastSyncedState.current.billingContacts[0].name, 'Updated Payer')
  assert.equal(context.hasPendingLocalSync.current, false)
})
