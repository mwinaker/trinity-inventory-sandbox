export const unverifiedPlayerLevelLabel = 'Level not verified'

export const playerLevelOptions = ['MLB', 'MILB', 'Indy Ball/International'] as const

export type PlayerLevel = (typeof playerLevelOptions)[number]

export function normalizePlayerLevel(value: unknown): PlayerLevel | '' {
  const level = String(value ?? '').trim().toLowerCase()
  if (!level) return ''

  if (/\b(milb|minor leagues?|minor league baseball)\b/.test(level)) return 'MILB'
  if (/\b(mlb|major leagues?|major league baseball)\b/.test(level)) return 'MLB'
  if (
    /\b(indy|independent|international|mexican league|honkbal|wbc|npb|kbo|cpbl)\b/.test(
      level,
    )
  ) {
    return 'Indy Ball/International'
  }

  return ''
}

export function getPlayerLevelLabel(value: unknown) {
  const level = normalizePlayerLevel(value)
  return level || unverifiedPlayerLevelLabel
}

export function getPlayerLevelFilterOptions() {
  return [...playerLevelOptions]
}

export function matchesPlayerLevelFilters(value: unknown, selectedLevels: string[]) {
  return selectedLevels.length === 0 || selectedLevels.includes(normalizePlayerLevel(value))
}

function escapeCsvValue(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function buildCsvFile(headers: string[], rows: unknown[][]) {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')
}
