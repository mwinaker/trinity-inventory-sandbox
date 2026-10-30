import { productionModelLabel } from '../shared/production-model.ts'

// Print the selections saved on this exact Shopify line. Website personalizer
// properties use human-readable labels; manual orders use trinity_* keys.
const aliases = {
  model: 'model', 'bat model': 'model', 'wood type': 'wood', wood: 'wood',
  'length (in)': 'length', length: 'length', 'weight (oz)': 'targetWeight',
  weight: 'targetWeight', 'handle colors': 'handleColor', 'handle color': 'handleColor',
  'barrel color': 'barrelColor', 'band color': 'bandColor', logo: 'logoColor',
  'logo color': 'logoColor', cupped: 'cupped', 'puck knob': 'puckKnob',
  'engraved text (26 characters max)': 'engraving', 'engraved text': 'engraving',
  engraving: 'engraving', notes: 'notes',
}
const manual = {trinity_model:'model',trinity_length:'length',trinity_weight:'targetWeight',trinity_wood:'wood',trinity_handle_color:'handleColor',trinity_barrel_color:'barrelColor',trinity_band_color:'bandColor',trinity_logo_color:'logoColor',trinity_engraving:'engraving',trinity_cupped:'cupped',trinity_puck_knob:'puckKnob',trinity_notes:'notes'}
export function productionLineDetails(attributes = [], baseSpecs = {}, productTitle = '') {
  // This is the current exact line: an absent/unchecked option clears old metadata.
  const specs = { ...baseSpecs, puckKnob: '' }
  const attachments = []
  const selections = {}
  for (const {key, value} of attributes) {
    if (!key || value === undefined || value === null || value === '') continue
    // This is a personalization-app correlation ID, not a purchased selection.
    if (key === '__pplr_line_ref') continue
    const label = key.replace(/^_+/, '').trim()
    const canonical = manual[key] || aliases[label.toLowerCase()]
    if (canonical) {
      // Explicit manual fields take precedence; retain any conflicting website
      // property under its original label so no selection disappears.
      if (specs[canonical] && String(specs[canonical]) !== String(value) && !manual[key]) selections[label] = value
      else specs[canonical] = value
      continue
    }
    if (/preview|attachment|upload|artwork/i.test(label)) {
      try {
        const url = new URL(value)
        const extension = url.pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1]?.toLowerCase()
        if (url.protocol === 'https:' && url.hostname === 'cdn.shopify.com' && extension) {
          attachments.push({filename: `${productTitle} — ${label}`, downloadUrl:url.href, contentType:`image/${extension === 'jpg' ? 'jpeg' : extension}`})
          continue
        }
      } catch { /* Preserve non-URL selections as text below. */ }
    }
    // Keep unrecognized options too, including future personalization fields.
    selections[label] = value
  }
  const result = { ...specs, ...selections }
  result.productionModel = productionModelLabel(result, productTitle)
  return { specs: result, attachments }
}
