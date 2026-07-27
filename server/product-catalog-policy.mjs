function cleanProductText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getProductSearchParts(product = {}) {
  const title = cleanProductText(product.title ?? product.name)
  const productType = cleanProductText(product.productType ?? product.category)
  const tags = Array.isArray(product.tags)
    ? product.tags.map(cleanProductText)
    : cleanProductText(product.tags)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

  return { title, productType, tags, text: [title, productType, ...tags].join(' ') }
}

export function isShirtProductLike(product) {
  const { title, productType, tags } = getProductSearchParts(product)

  return (
    title.includes('shirt') ||
    title.includes('t-shirt') ||
    /\btee\b/.test(title) ||
    productType.includes('shirt') ||
    productType.includes('t-shirt') ||
    tags.some((tag) => ['shirt', 't-shirt', 'tee'].includes(tag))
  )
}

export function isBatProductLike(product) {
  const { title, productType, tags, text } = getProductSearchParts(product)

  if (
    productType.includes('apparel') ||
    text.includes('accessor') ||
    isShirtProductLike(product) ||
    title.includes('hat') ||
    title.includes('sleeve') ||
    title.includes('grip') ||
    title.includes('glove')
  ) {
    return false
  }

  return (
    productType.includes('series') ||
    title.includes('bat') ||
    title.includes('pro model') ||
    title.includes('pro select') ||
    title.includes('birch') ||
    title.includes('maple') ||
    title.includes('ash') ||
    /\b[a-z]{1,5}\d+(?:\.\d+)?[a-z]*\b/i.test(title) ||
    title.includes('fungo') ||
    title.includes('trainer') ||
    title.includes('boom stick') ||
    title.includes('platinum') ||
    title.includes('scvbb') ||
    tags.some((tag) => ['ash', 'birch', 'maple', 'stock', 'custom', 'semi custom'].includes(tag))
  )
}

export function isSalesOrderProductLike(product) {
  return isBatProductLike(product) || isShirtProductLike(product)
}

export function isSalesOrderCatalogProduct(product) {
  return (
    cleanProductText(product?.status) !== 'archived' && isSalesOrderProductLike(product)
  )
}
