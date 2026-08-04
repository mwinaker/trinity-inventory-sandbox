import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTimestampInsideSalesDashboardWindow,
  resolveSalesDashboardWindow,
} from '../shared/sales-dashboard-window.mjs'

test('preset dashboard windows use the requested rolling period', () => {
  const now = Date.parse('2026-08-04T18:00:00.000Z')
  const window = resolveSalesDashboardWindow({ range: '30' }, now)

  assert.equal(window.range, '30')
  assert.equal(window.windowDays, 30)
  assert.equal(window.since, '2026-07-05T18:00:00.000Z')
  assert.equal(window.through, '2026-08-04T18:00:00.000Z')
  assert.equal(window.cacheKey, 'preset:30')
})

test('custom dashboard windows include both exact boundaries', () => {
  const window = resolveSalesDashboardWindow({
    range: 'custom',
    since: '2026-05-01T06:00:00.000Z',
    through: '2026-06-01T05:59:59.999Z',
  })

  assert.equal(
    isTimestampInsideSalesDashboardWindow('2026-05-01T06:00:00.000Z', window),
    true,
  )
  assert.equal(
    isTimestampInsideSalesDashboardWindow('2026-06-01T05:59:59.999Z', window),
    true,
  )
  assert.equal(
    isTimestampInsideSalesDashboardWindow('2026-06-01T06:00:00.000Z', window),
    false,
  )
})

test('all-time dashboard windows have no lower boundary', () => {
  const window = resolveSalesDashboardWindow(
    { range: 'all' },
    Date.parse('2026-08-04T18:00:00.000Z'),
  )

  assert.equal(window.since, '')
  assert.equal(
    isTimestampInsideSalesDashboardWindow('2019-01-01T00:00:00.000Z', window),
    true,
  )
})

test('custom dashboard windows reject missing or reversed dates', () => {
  assert.throws(
    () => resolveSalesDashboardWindow({ range: 'custom', since: '', through: '' }),
    /Custom start must be a valid date and time/,
  )
  assert.throws(
    () =>
      resolveSalesDashboardWindow({
        range: 'custom',
        since: '2026-08-02T00:00:00.000Z',
        through: '2026-08-01T23:59:59.999Z',
      }),
    /Custom start must be on or before custom end/,
  )
})
