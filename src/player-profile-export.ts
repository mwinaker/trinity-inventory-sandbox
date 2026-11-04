export { unverifiedPlayerLevelLabel, playerLevelOptions, normalizePlayerLevel, getPlayerLevelLabel, getPlayerLevelFilterOptions, matchesPlayerLevelFilters } from '../shared/player-level.ts'

function escapeCsvValue(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function buildCsvFile(headers: string[], rows: unknown[][]) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')
}
