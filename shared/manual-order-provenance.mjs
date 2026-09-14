export const manualOrderSourceName = 'trinity_manual_order'
export const manualOrderSourceLabel = 'Trinity manual order entry'

const text = (value) => String(value ?? '').trim().toLowerCase()
export function getOrderAttributes(order) {
  const attributes = order?.customAttributes ?? order?.note_attributes ?? []
  return Object.fromEntries(attributes.map((attribute) => [attribute.key ?? attribute.name, attribute.value]))
}

// Shopify's native source describes the creation route. It is not the business
// category: drafts, API-created orders and pro orders can all be manual entries.
export function hasTrinityManualOrderMarker(order, matchingJobs = [], linkedDraft = null) {
  const attributes = getOrderAttributes(order)
  const tags = Array.isArray(order?.tags) ? order.tags : String(order?.tags ?? '').split(',')
  return text(attributes.trinity_origin) === 'internal_sales' ||
    text(attributes.trinity_entry_source) === 'trinity_inventory_tool' ||
    Boolean(text(attributes.trinity_intake_id)) ||
    text(order?.sourceName ?? order?.source_name) === manualOrderSourceName ||
    text(order?.app?.name) === 'trinity billet inventory' ||
    tags.some((tag) => ['internal sales', 'trinity intake'].includes(text(tag))) ||
    matchingJobs.some((job) => text(job?.origin) === 'internal_sales') ||
    Boolean(linkedDraft && hasTrinityManualOrderMarker(linkedDraft))
}

export function getManualOrderSourceDetail(order, hasInventoryMarker) {
  if (hasInventoryMarker) return manualOrderSourceLabel
  return [order?.app?.name, order?.sourceName].filter(Boolean).join(' · ') || 'Unknown source'
}
