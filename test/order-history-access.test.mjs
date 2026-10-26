import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const serverUrl = new URL('../server/index.mjs', import.meta.url)
const source = fs.readFileSync(serverUrl, 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const modules = {}
for (const statement of ast.statements) {
  if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('.')) {
    Object.assign(modules, await import(new URL(statement.moduleSpecifier.text, serverUrl)))
  }
}
const context = vm.createContext({ ...modules, permanentOrderReferencesEnabled: true, path, URL, Buffer, shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', internalOrderNotificationEmails: [], structuredClone, draftInvoiceHost: 'test.myshopify.com', shopDomain: 'test.myshopify.com' })
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(ast)).join('\n'), context)


const owners = modules.trinityTeamMembers.filter(modules.isSalesTeamMember).map(member => ({ ...member, key: member.email || member.key }))
context.salesPortalTeamMembers = owners
context.salesPortalTeamByEmail = new Map(owners.map(owner => [owner.email, owner]))
context.orderHistoryCache = null
context.resourceConfigs = { orderJobs: {} }
const shane = { email: 'shane@trinitybats.com', role: 'sales', isAdmin: false }
const keith = { email: 'keith@trinitybats.com', role: 'admin', isAdmin: true }
const jobs = [
  { id: 'shane-job', intakeId: 's', origin: 'internal_sales', salesRep: 'Shane Telfer', salesRepEmail: shane.email, productTitle: 'Test bat', quantity: 1, totalPrice: '155', submissionSnapshot: modules.createSubmissionSnapshot({ playerName: 'Test Player', notes: 'PRIVATE_SHANE', lines: [{ title: 'Test bat', quantity: 1, unitPrice: '155' }] }) },
  { id: 'keith-job', intakeId: 'k', origin: 'internal_sales', salesRep: 'Keith Frye', salesRepEmail: keith.email, internalNotes: 'PRIVATE_KEITH' },
  { id: 'website-job', origin: 'website', salesRepEmail: shane.email },
]
context.listRecords = async () => jobs
context.shopifyGraphQL = async () => { throw new Error('Unexpected external call') }
const routes = new Map()
context.app = { get: (route, ...handlers) => routes.set(route, handlers) }
for (const statement of ast.statements) {
  if (ts.isExpressionStatement(statement) && statement.getText(ast).startsWith("app.get('/api/my-orders")) vm.runInContext(statement.getText(ast), context)
}
async function request(route, session, id = '') {
  context.getValidatedSalesPortalSession = async () => session
  const req = { params: { id }, query: {} }
  const result = { status: 200, body: null }
  const res = { set: () => res, status: code => { result.status = code; return res }, json: body => { result.body = body; return res } }
  const [middleware, handler] = routes.get(route)
  let authorized = false
  await middleware(req, res, () => { authorized = true })
  if (authorized) await handler(req, res)
  return result
}

test('history requires a valid login, with no customer data returned while logged out', async () => {
  const result = await request('/api/my-orders', null)
  assert.equal(result.status, 401)
  assert.equal(result.body.orders, undefined)
})

test('history is scoped to the signed-in member even for admins', async () => {
  for (const [session, expected] of [[shane, 'shane-job'], [keith, 'keith-job']]) {
    const result = await request('/api/my-orders', session)
    assert.equal(result.status, 200)
    assert.equal(result.body.orders.length, 1)
    assert.equal(result.body.orders[0].id, expected)
    assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false)
  }
})

test('changing the reorder ID cannot access another team member order', async () => {
  const result = await request('/api/my-orders/:id/reorder', shane, 'keith-job')
  assert.equal(result.status, 404)
  assert.equal(JSON.stringify(result.body).includes('PRIVATE_KEITH'), false)
})

test('reorder loads owned private fields without making any Shopify writes or sending email', async () => {
  const result = await request('/api/my-orders/:id/reorder', shane, 'shane-job')
  assert.equal(result.status, 200)
  assert.equal(result.body.draft.notes, 'PRIVATE_SHANE')
  assert.equal(result.body.draft.salesRepEmail, shane.email)
  assert.equal(result.body.draft.lines[0].id, undefined)
})

test('production accounts retain the restriction on creating orders', async () => {
  const result = await request('/api/my-orders/:id/reorder', { email: 'henry@trinitybats.com', role: 'production' }, 'shane-job')
  assert.equal(result.status, 403)
})

test('snapshot and intake identity survive order webhook merges', () => {
  const existing = { ...jobs[0], createdAt: '2026-01-01T00:00:00Z' }
  const result = context.mergeOrderJob(existing, { ...existing, intakeId: '', submissionSnapshot: undefined })
  assert.equal(result.submissionSnapshot, existing.submissionSnapshot)
  assert.equal(result.intakeId, 's')
})
