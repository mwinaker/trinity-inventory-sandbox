import assert from 'node:assert/strict'
import test from 'node:test'

import { getAppErrorDiagnostic } from '../src/app-error.ts'

test('the display recovery screen receives a bounded technical diagnostic', () => {
  const error = new DOMException('Quota exceeded', 'QuotaExceededError')
  const diagnostic = getAppErrorDiagnostic(error)

  assert.equal(diagnostic, 'QuotaExceededError: Quota exceeded')
  assert.ok(diagnostic.length <= 500)
})
