export const billetSourceOptions = [
  "RJ's Tree Farms",
  'Great Lakes Veneer',
  'Maine Billets',
  'Cahan',
  'Champeau',
]

export const standardBilletLength = 37
export const standardBilletDiameter = 2.75
export const oversizedBilletDiameter = 2.79

const oversizedBilletSources = new Set(["RJ's Tree Farms", 'Cahan'])

export function isOversizedBilletSource(source) {
  return oversizedBilletSources.has(String(source ?? ''))
}

export function getBilletDimensionsForSource(source) {
  return {
    length: standardBilletLength,
    diameter: isOversizedBilletSource(source)
      ? oversizedBilletDiameter
      : standardBilletDiameter,
  }
}

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
