import { getSuccessfulPaymentTimestamp } from '../shared/sales-payment-reconciliation.mjs'
import { productionLineDetails } from './production-line-details.mjs'
const moneyFields = 'shopMoney { amount currencyCode }'
const payment = `displayFinancialStatus cancelledAt totalOutstandingSet { ${moneyFields} } totalReceivedSet { ${moneyFields} } totalRefundedSet { ${moneyFields} } transactions { id kind status processedAt amountSet { ${moneyFields} } }`
const lines = `id name lineItems(first: 100, after: $after) { nodes { id title customAttributes { key value } } pageInfo { hasNextPage endCursor } }`
export const documentSourceQuery = `query OrderDocumentSource($id: ID!, $after: String) { node(id: $id) { ... on DraftOrder { ${lines} } ... on Order { ${lines} } } }`
export const documentStatusQuery = `query OrderDocumentStatus($ids: [ID!]!) { nodes(ids: $ids) {
 ... on DraftOrder { id name invoiceSentAt status order { id name ${payment} totalPriceSet { ${moneyFields} } } }
 ... on Order { id name ${payment} totalPriceSet { ${moneyFields} } }
} }`
export const amount = bag => Number(bag?.shopMoney?.amount || 0)
export function resourceIds(group) {
 return [...new Set([group.primary,...(group.sourceJobs||group.jobs)].flatMap(j=>[j.shopifyOrderId,j.shopifyDraftOrderId]).filter(Boolean))]
}
export function statusFromSources(sources, stored = {}) {
 const order = sources.find(s=>s?.id?.includes('/Order/')) || sources.find(s=>s?.order)?.order
 const dates = sources.map(s=>s?.invoiceSentAt).filter(Boolean)
 const invoiceSentAt = [...dates, stored.invoiceSentAt].filter(Boolean).sort().at(-1) || ''
 const status = order?.cancelledAt ? 'CANCELLED' : order?.displayFinancialStatus || (sources.some(s=>s?.status==='INVOICE_SENT')?'UNPAID':'DRAFT')
 const paidAt = order ? getSuccessfulPaymentTimestamp(order.transactions, amount(order.totalPriceSet)) || stored.paidAt || '' : stored.paidAt || ''
 return { invoiceSentAt, paidAt, paymentStatus:status, outstanding:order ? amount(order.totalOutstandingSet) : null, orderId:order?.id || '', verifiedAt:new Date().toISOString() }
}
export function collectOrderAttachments(group, source) {
 const attachments = [...(group.sourceJobs||group.jobs),group.primary].flatMap(j=>[...(j.internalAttachment?[j.internalAttachment]:[]),...(j.additionalInternalAttachments||[])])
 for(const line of source?.lineItems?.nodes||[]) attachments.push(...productionLineDetails(line.customAttributes,{},line.title).attachments)
 return [...new Map(attachments.filter(a=>{try {const u=new URL(a.downloadUrl);return u.protocol==='https:'&&u.hostname==='cdn.shopify.com'}catch{return false}}).map(a=>[a.downloadUrl,{filename:a.filename,downloadUrl:a.downloadUrl,contentType:a.contentType||''}])).values()]
}

// These are the existing, approved Order Printer Pro templates, read from its PDF setup.
export function customerDocumentUrl(source, kind) {
 const config = {receipt:{token:'91dcb7f04d15f1a08673',multiplier:7276n},quote:{token:'d373b096caf265a4ab9f',multiplier:9689n}}[kind]
 const match = source?.id?.match(/^gid:\/\/shopify\/(Order|DraftOrder)\/(\d+)$/)
 if (!config || !match) throw new Error('Invalid customer document source.')
 const name = String(source.name||'order').replace(/[^a-z0-9-]/gi,'').toLowerCase()
 return `https://trinitybatco.com/apps/download-pdf/${match[1]==='Order'?'orders':'drafts'}/${config.token}/${BigInt(match[2])*config.multiplier}/${name}.pdf`
}
