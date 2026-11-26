// The customizer keeps these original swatch values in Shopify order properties.
export function storefrontFinishLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'natural': return 'Unfinished'
    case 'clear gloss': return 'Natural gloss'
    default: return value
  }
}
