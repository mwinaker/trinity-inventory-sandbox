import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'InternalToolApp')
const code = ts.transpileModule(component.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText

function render(session, checking, embedded) {
  const states = [session, checking]
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useState: () => [states.shift(), () => {}], useEffect: () => {},
    InternalApp: 'InternalApp', TeamPinLoginForm: 'TeamPinLoginForm',
    isShopifyEmbeddedApp: () => embedded,
  })
  vm.runInContext(code, context)
  return context.InternalToolApp()
}

function contains(tree, type) {
  return tree?.type === type || (tree?.children ?? []).flat().some(child => contains(child, type))
}

for (const embedded of [false, true]) {
  const entry = embedded ? 'Shopify' : 'standalone web'
  test(`${entry} waits for remembered team access before opening the tool`, () => {
    const tree = render(null, true, embedded)
    assert.equal(contains(tree, 'InternalApp'), false)
    assert.equal(contains(tree, 'TeamPinLoginForm'), false)
  })
  test(`${entry} requires a PIN when no valid team session was restored`, () => {
    const tree = render(null, false, embedded)
    assert.equal(contains(tree, 'TeamPinLoginForm'), true)
    assert.equal(contains(tree, 'InternalApp'), false)
  })
  test(`${entry} opens the tool with the restored member identity`, () => {
    const session = { email: 'matt@trinitybats.com', name: 'Matt Winaker', role: 'admin', isAdmin: true }
    const tree = render(session, false, embedded)
    assert.equal(tree.type, 'InternalApp')
    assert.equal(tree.props.accessSession, session)
    assert.equal(contains(tree, 'TeamPinLoginForm'), false)
  })
}
