import type { ProductionJob } from './production-documents'

export function productionShortcut(search: string) {
  const params = new URLSearchParams(search)
  const resource = params.get('productionResource')
  if (resource !== 'Order' && resource !== 'DraftOrder') return null
  const ids = [...params.getAll('id'), ...params.getAll('ids[]'), ...params.getAll('ids')]
    .flatMap(value => value.split(',')).filter(Boolean)
  const unique = [...new Set(ids)]
  const value = unique.length === 1 ? unique[0] : ''
  const numeric = /^\d+$/.test(value) ? value : value.match(new RegExp(`^gid://shopify/${resource}/(\\d+)$`))?.[1]
  return { resource, id: numeric ? `gid://shopify/${resource}/${numeric}` : '', invalid: !numeric }
}

export function matchesProductionShortcut(job: ProductionJob, shortcut: ReturnType<typeof productionShortcut>) {
  if (!shortcut) return true
  if (shortcut.invalid) return false
  const id = shortcut.resource === 'Order' ? job.shopifyOrderId : job.shopifyDraftOrderId
  return id === shortcut.id || id === shortcut.id.split('/').pop()
}
