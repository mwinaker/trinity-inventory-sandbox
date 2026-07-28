import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appSource = fs.readFileSync(path.join(repoRoot, 'src/App.tsx'), 'utf8')

test('shows sales-order submission feedback beside the submit button in every order form', () => {
  assert.match(appSource, /className="order-submit-message"/)
  assert.match(appSource, /aria-live="polite"/)
  assert.equal((appSource.match(/submissionMessage=/g) ?? []).length, 3)
  assert.match(appSource, /submissionMessage=\{message\}/)
  assert.match(appSource, /submissionMessage=\{orderActionMessage\}/)
  assert.match(appSource, /submissionMessage=\{portalMessage\}/)
})
