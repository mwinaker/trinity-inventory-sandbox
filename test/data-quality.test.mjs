import test from 'node:test'
import assert from 'node:assert/strict'
import { getOperationalDataQualityIssues, isCalendarDate } from '../shared/data-quality.mjs'

test('calendar dates reject impossible days', () => {
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2024-02-29'), true)
})

test('quality review identifies outliers without changing source records', () => {
  const billets = [
    { id: '1', barcode: 'TBC-1', deliveryDate: '0026-08-25', weight: 48 },
    { id: '2', barcode: 'tbc-1', deliveryDate: '2026-10-30', weight: 0 },
  ]
  const players = [{ id: 'p1', playerName: 'Player', bats: [{ length: 82.5 }] }]
  const before = JSON.stringify({ billets, players })
  const issues = getOperationalDataQualityIssues(billets, players)
  assert.deepEqual(issues.map((issue) => issue.kind), ['delivery_date', 'duplicate_barcode', 'weight', 'bat_length'])
  assert.equal(JSON.stringify({ billets, players }), before)
})
