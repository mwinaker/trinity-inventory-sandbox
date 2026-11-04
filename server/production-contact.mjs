const text = value => String(value ?? '').trim()

// Read the order's delivery address, never the customer's mutable default address.
// Undefined means this query did not retrieve the address; null means it is absent.
export function productionContactFromOrder(order, attributes = {}) {
  const address = order.shippingAddress ?? order.shipping_address
  const queried = Object.hasOwn(order, 'shippingAddress') || Object.hasOwn(order, 'shipping_address')
  if (!queried) return undefined
  const a = address || {}
  const region = text(a.provinceCode || a.province_code || a.province)
  const cityRegion = [a.city, region].map(text).filter(Boolean).join(', ')
  const postal = [cityRegion, a.zip].map(text).filter(Boolean).join(' ')
  const recipient = text(a.name) || [a.firstName || a.first_name, a.lastName || a.last_name].map(text).filter(Boolean).join(' ')
  const shippingLines = order.shippingLine ? [order.shippingLine] : order.shipping_lines || []
  return {
    customerName: text(order.customer?.displayName) || [order.customer?.first_name, order.customer?.last_name].map(text).filter(Boolean).join(' '),
    email: text(order.email || order.customer?.email),
    phone: text(a.phone || order.phone || attributes.trinity_player_phone),
    recipientName: recipient,
    addressLines: [a.company, a.address1, a.address2, postal, a.country || a.countryCodeV2 || a.country_code].map(text).filter(Boolean),
    shippingMethod: shippingLines.map(line => text(line.title)).filter(Boolean).join(', ') || text(attributes.trinity_shipping_title || attributes.trinity_fulfillment_method),
    requiresShipping: attributes.trinity_requires_shipping === 'false' ? false : attributes.trinity_requires_shipping === 'true' ? true : order.requiresShipping,
  }
}
