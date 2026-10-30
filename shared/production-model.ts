const nonGamePurpose = /\b(?:trainers?|training|fungos?|troph(?:y|ies)|towel|shirt|surcharge|blade barrel|short heavy|sledge|weighted skinny|one[ -]hand|overload|underload)\b/i

export function supportsPuckKnob(productTitle: unknown, itemType = 'bat'): boolean {
  const title = String(productTitle ?? '').trim()
  return itemType === 'bat' && Boolean(title) && !nonGamePurpose.test(title)
}

// Derived internal label only. Keep the Shopify/customer model unchanged.
export function productionModelLabel(specs: Record<string, unknown> = {}, productTitle = ''): string {
  const model = String(specs.model || productTitle || '').trim()
  const puckKnob = String(specs.puckKnob ?? specs['Puck Knob'] ?? '').trim()
  if (!model || !/^yes$/i.test(puckKnob)) return model
  // The game-bat customizer owns this option; never apply it to a non-game item.
  if (!supportsPuckKnob(`${model} ${productTitle}`)) return model
  const [, base, build = ''] = model.match(/^(.*?)(\s+(?:(?:semi|fully|pro)[ -])?custom)?$/i) || []
  if (!base) return model
  return `${base.replace(/(?:\.pk)+$/i, '')}.pk${build}`
}
