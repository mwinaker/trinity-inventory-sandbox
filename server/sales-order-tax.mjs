export const salesOrderTaxSelection = `
  taxesIncluded
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  taxLines { title rate priceSet { shopMoney { amount currencyCode } } }
  customer { taxExempt }
`

export async function calculateSalesOrderTax(graphql, input) {
  const result = await graphql(`mutation PreviewSalesOrderTax($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) {
      calculatedDraftOrder { ${salesOrderTaxSelection} }
      userErrors { field message }
    }
  }`, { input })
  const payload = result?.data?.draftOrderCalculate
  const errors = [...(result?.errors ?? []), ...(payload?.userErrors ?? [])]
  if (errors.length) throw new Error(`Sales tax calculation failed: ${errors.map(item => item.message).join(', ')}`)
  const quote = payload?.calculatedDraftOrder
  for (const key of ['totalTaxSet', 'totalPriceSet']) {
    const amount = quote?.[key]?.shopMoney?.amount
    if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      throw new Error('Shopify did not return a valid tax calculation. The order has not been submitted.')
    }
  }
  // California is an existing collection jurisdiction. Fail closed if a priced,
  // non-exempt merchandise order unexpectedly returns no tax.
  const address = input.shippingAddress
  if (address?.countryCode === 'US' && address.provinceCode === 'CA' &&
      Number(quote.subtotalPriceSet?.shopMoney?.amount) > 0 &&
      Number(quote.totalTaxSet.shopMoney.amount) === 0 && !quote.customer?.taxExempt) {
    throw new Error('Shopify returned no California sales tax for priced merchandise. Review the address, product tax settings, and tax registration before submitting.')
  }
  return { ...quote, calculatedAt: new Date().toISOString() }
}
