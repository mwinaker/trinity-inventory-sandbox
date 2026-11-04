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
  'hasRemoteStatePatchChanges', 'countRemoteStatePatchRecords', 'applyRemoteStatePatchToSnapshot'])
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && helperNames.has(node.name?.text))
let saveFunction
function findSave(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'syncRemoteStateNow') saveFunction = node.initializer
  ts.forEachChild(node, findSave)
}
findSave(ast)
assert.ok(saveFunction, 'The client save function must be exercised')
const code = ts.transpileModule(`${helpers.map(node => node.getText(ast)).join('\n')}\nvar save = ${saveFunction.getText(ast)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

function fixture({ duringSave, reject = false, endpoint = '/api/team-tool/state' } = {}) {
  const base = {
    billets: [{ id: 'billet-1991', barcode: '1991', status: 'storage', species: 'Birch', weight: 82.6 },
      { id: 'billet-1992', barcode: '1992', status: 'storage', species: 'Maple' }],
    players: [], producedBats: [], customBatModels: [], billingContacts: [], crmContacts: [],
    orderJobs: [{ id: 'unrelated-order', notes: 'x'.repeat(6 * 1024 * 1024) }],
  }
  let current = { ...base, billets: base.billets.map((billet, i) => i ? billet : { ...billet, status: 'production' }) }
  const requests = []
  const statuses = []
  const context = vm.createContext({
    Error, Date, console,
    getNonManualCrmContactIds: () => [], getManualCrmContacts: contacts => contacts,
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
      const ok = !reject && bytes <= 5 * 1024 * 1024
      return { ok, json: async () => ok ? { ok: true } : { ok: false, message: 'Request rejected' } }
    },
  })
  vm.runInContext(code, context)
  return { context, requests, statuses, base }
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
