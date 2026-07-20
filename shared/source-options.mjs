export const billetSourceOptions = [
  "RJ's Tree Farms",
  'Great Lakes Veneer',
  'Maine Billets',
  'Cahan',
  'Champeau',
]

export function inferBilletSourceFromText(value) {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized.includes('great lakes') || normalized.includes('glv')) {
    return 'Great Lakes Veneer'
  }
  if (normalized.includes('maine billet') || /\bmaine\b/.test(normalized)) {
    return 'Maine Billets'
  }
  if (normalized.includes('champeau')) return 'Champeau'
  if (normalized.includes('cahan')) return 'Cahan'
  if (
    normalized.includes('rj') ||
    normalized.includes("rj's") ||
    normalized.includes('tree farm')
  ) {
    return "RJ's Tree Farms"
  }

  return null
}
