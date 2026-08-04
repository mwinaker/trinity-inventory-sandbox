const dayMs = 24 * 60 * 60 * 1000
const presetDays = new Map([
  ['30', 30],
  ['90', 90],
])

function getTimestamp(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value

  const timestamp = Date.parse(String(value ?? ''))
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function requireTimestamp(value, label) {
  const timestamp = getTimestamp(value)
  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`${label} must be a valid date and time.`)
  }
  return timestamp
}

export function resolveSalesDashboardWindow(input = {}, now = Date.now()) {
  const nowTimestamp = requireTimestamp(now, 'Current time')
  const range = String(input.range ?? '30').trim().toLowerCase()

  if (range === 'all') {
    return {
      range,
      windowDays: null,
      since: '',
      through: new Date(nowTimestamp).toISOString(),
      cacheKey: 'all',
    }
  }

  if (range === 'custom') {
    const sinceTimestamp = requireTimestamp(input.since, 'Custom start')
    const throughTimestamp = requireTimestamp(input.through, 'Custom end')
    if (sinceTimestamp > throughTimestamp) {
      throw new RangeError('Custom start must be on or before custom end.')
    }

    const since = new Date(sinceTimestamp).toISOString()
    const through = new Date(throughTimestamp).toISOString()
    return {
      range,
      windowDays: null,
      since,
      through,
      cacheKey: `custom:${since}:${through}`,
    }
  }

  const days = presetDays.get(range)
  if (!days) throw new RangeError('Sales dashboard range must be 30, 90, all, or custom.')

  return {
    range,
    windowDays: days,
    since: new Date(nowTimestamp - days * dayMs).toISOString(),
    through: new Date(nowTimestamp).toISOString(),
    cacheKey: `preset:${range}`,
  }
}

export function isTimestampInsideSalesDashboardWindow(value, window) {
  const timestamp = getTimestamp(value)
  const throughTimestamp = getTimestamp(window?.through)
  if (!Number.isFinite(timestamp) || !Number.isFinite(throughTimestamp)) return false

  const sinceValue = String(window?.since ?? '').trim()
  if (!sinceValue) return timestamp <= throughTimestamp

  const sinceTimestamp = getTimestamp(sinceValue)
  return (
    Number.isFinite(sinceTimestamp) &&
    timestamp >= sinceTimestamp &&
    timestamp <= throughTimestamp
  )
}
