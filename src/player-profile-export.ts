export const unverifiedPlayerLevelLabel = 'Level not verified'

const preferredPlayerLevelOrder = [
  'MLB',
  'MILB',
  'Indy Ball',
  'Mexican League',
  'International',
  'Free Agent',
  'Drafted - unsigned',
  'Amateur',
]

export function getPlayerLevelLabel(value: unknown) {
  const level = String(value ?? '').trim()
  return level || unverifiedPlayerLevelLabel
}

export function getPlayerLevelFilterOptions(values: unknown[]) {
  const options = Array.from(new Set(values.map(getPlayerLevelLabel)))
  return options.sort((a, b) => {
    const aIndex = preferredPlayerLevelOrder.indexOf(a)
    const bIndex = preferredPlayerLevelOrder.indexOf(b)
    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      if (aIndex !== bIndex) return aIndex - bIndex
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function matchesPlayerLevelFilters(value: unknown, selectedLevels: string[]) {
  return selectedLevels.length === 0 || selectedLevels.includes(getPlayerLevelLabel(value))
}

function escapeCsvValue(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function buildCsvFile(headers: string[], rows: unknown[][]) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')
}
