export type ProductionJob = {
  id: string; intakeId?: string; shopifyOrderId?: string; shopifyDraftOrderId?: string;
  shopifyOrderName?: string; shopifyDraftOrderName?: string; orderReference?: string;
  lineItemId?: string; productTitle?: string; variantTitle?: string; quantity?: number;
  customerName?: string; playerName?: string; salesRep?: string; purchaseOrder?: string;
  productionStatus?: string; financialStatus?: string; invoiceStatus?: string;
  assignedBilletId?: string; linkedProducedBatId?: string; notes?: string; internalNotes?: string;
  totalPrice?: string; currency?: string; itemType?: string; specs?: object;
  orderSubmittedAt?: string; createdAt?: string; updatedAt?: string; cancelledAt?: string;
  submissionSnapshot?: { draft: object };
  internalAttachment?: { filename: string; downloadUrl: string; contentType?: string } | null;
}
export type ProductionLayout = 'detail' | 'landscape'
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const values = (value: object | undefined): Record<string, unknown> => value ? { ...value } : {}
const labels: Record<string, string> = {
  model:'Model', length:'Length (in)', targetWeight:'Weight / drop', wood:'Wood', handleColor:'Handle color',
  barrelColor:'Barrel color', bandColor:'Band color', logoColor:'Logo color', engraving:'Engraving',
  cupped:'Cupped', notes:'Line notes', title:'Product / model', variantTitle:'Variant', itemType:'Item type',
  unitPrice:'Unit price', quantity:'Quantity', isProOrder:'Pro order', productId:'Product ID', variantId:'Variant ID',
}
const label = (key: string) => labels[key] || key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')
const display = (v: unknown) => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')
const identifiers = (job: ProductionJob) => [job.intakeId,job.shopifyOrderId,job.shopifyDraftOrderId].filter(Boolean) as string[]

export function productionOrderJobs(all: ProductionJob[], selected: ProductionJob): ProductionJob[] {
  const keys = new Set(identifiers(selected)); const ids = new Set([selected.id])
  let changed = true
  while (changed) {
    changed = false
    for (const job of all) if (ids.has(job.id) || identifiers(job).some(id => keys.has(id))) {
      if (!ids.has(job.id)) { ids.add(job.id); changed = true }
      for (const id of identifiers(job)) if (!keys.has(id)) { keys.add(id); changed = true }
    }
  }
  const seen = new Set<string>()
  return all.filter(job => ids.has(job.id)).filter(job => {
    const id = job.lineItemId || job.id
    if (seen.has(id)) return false
    seen.add(id); return true
  })
}
function safeUrl(value: string): string {
  try { const u=new URL(value); return u.protocol==='https:' ? u.href : '' } catch { return '' }
}
function rows(fields: Record<string, unknown>, includeEmpty = false): string {
  return Object.entries(fields).filter(([,v])=>includeEmpty || (v !== '' && v !== undefined && v !== null))
    .map(([k,v])=>`<div class="field"><dt>${escape(label(k))}</dt><dd>${escape(display(v) || 'Not recorded')}</dd></div>`).join('')
}
export function buildProductionDocument(jobs: ProductionJob[], layout: ProductionLayout, generatedAt = new Date().toISOString()): string {
  if (!jobs.length) throw new Error('No production lines are available for this order.')
  const primary = jobs.find(j=>j.submissionSnapshot) || jobs[0]
  const snapshot = values(primary.submissionSnapshot?.draft)
  const originalLines = Array.isArray(snapshot.lines) ? snapshot.lines as Record<string, unknown>[] : []
  const reference = primary.orderReference || primary.shopifyOrderName || primary.shopifyDraftOrderName || primary.id
  const orderFields = Object.fromEntries(Object.entries(snapshot).filter(([k])=>!['lines','notes','sendInvoice','createDraftOrder','attachment'].includes(k)))
  const attachments = [...new Map(jobs.flatMap(j=>j.internalAttachment ? [j.internalAttachment] : []).map(a=>[a.downloadUrl,a])).values()]
  const notes = [...new Set(jobs.map(j=>j.internalNotes?.trim()).filter(Boolean))]
  const cards = jobs.map((job,index)=>{
    // Snapshot line order is only used when the stored draft job index proves its identity.
    const lineIndex = job.id.match(/-line-(\d+)$/)
    const original = lineIndex ? originalLines[Number(lineIndex[1])-1] || {} : {}
    const fields: Record<string, unknown> = { ...original, ...values(job.specs), itemType:job.itemType, variantTitle:job.variantTitle,
      quantity:job.quantity, unitPrice:job.totalPrice, productionStatus:job.productionStatus,
      assignedBilletId:job.assignedBilletId, linkedProducedBatId:job.linkedProducedBatId,
      notes:job.notes || values(job.specs).notes }
    delete fields.id
    delete fields.title
    delete fields.quantity
    delete fields.model
    const required = ['length','targetWeight','wood','handleColor','barrelColor','bandColor','logoColor','engraving','cupped']
    for (const key of required) if (!(key in fields)) fields[key] = ''
    return `<article class="product"><h2>${index+1}. ${escape(values(job.specs).model || job.productTitle)}</h2><div class="qty">Quantity: ${escape(job.quantity)} · ${escape(job.productionStatus || 'Not recorded')}</div><dl>${rows(fields,layout==='detail')}</dl>${notes.length > 1 && job.internalNotes ? `<div class="line-note"><b>Internal notes</b><p>${escape(job.internalNotes)}</p></div>` : ''}<small>Job: ${escape(job.id)}<br>Updated: ${escape(job.updatedAt || 'Not recorded')}</small></article>`
  }).join('')
  const attachmentHtml = attachments.map(a=>{
    const url = safeUrl(a.downloadUrl)
    const image = url && new URL(url).hostname === 'cdn.shopify.com' && /^image\/(png|jpeg|webp|gif)$/i.test(a.contentType || '')
    return `<div class="attachment"><b>${escape(a.filename)}</b>${url ? `<br><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open / print original attachment</a>` : '<p>Attachment link unavailable</p>'}${image ? `<img src="${escape(url)}" alt="${escape(a.filename)}">` : '<p>Original file is linked above; print it separately if required.</p>'}</div>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>PRODUCTION ONLY - ${escape(reference)} - ${layout}</title><style>
@page {size:letter ${layout==='landscape'?'landscape':'portrait'};margin:0.35in}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:${layout==='landscape'?'10':'12'}px;line-height:1.25}.toolbar{background:#eee;padding:12px;margin-bottom:18px;font-size:14px}.toolbar button{padding:9px 16px;margin-right:10px;cursor:pointer}.banner{border:3px solid #111;padding:8px 12px;font-size:17px;font-weight:800;letter-spacing:.05em}header{margin-bottom:12px}h1{font-size:21px;margin:12px 0 5px}header p{margin:4px 0}h2{font-size:${layout==='landscape'?'12':'15'}px;margin:0 0 6px;overflow-wrap:anywhere}.products{display:grid;grid-template-columns:repeat(${layout==='landscape'?'4':'2'},minmax(0,1fr));gap:10px}.product{border:1px solid #aaa;padding:9px;break-inside:avoid;overflow-wrap:anywhere}.qty{font-weight:bold;margin-bottom:7px}dl{margin:0}.field{display:grid;grid-template-columns:42% 58%;border-bottom:1px solid #ddd;padding:3px 0;break-inside:avoid}dt{font-weight:bold;padding-right:5px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}small{display:block;color:#555;margin-top:8px;font-size:8px}.section{margin-top:14px;border-top:2px solid #111;padding-top:8px}.section h2{font-size:14px}.note,.line-note p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.line-note{margin-top:8px;border-left:3px solid #111;padding-left:6px}.order-fields{columns:2;column-gap:24px}.order-fields .field{break-inside:avoid}.attachments{display:flex;flex-wrap:wrap;gap:14px}.attachment{max-width:46%;break-inside:avoid;overflow-wrap:anywhere}.attachment img{display:block;max-width:100%;max-height:${layout==='landscape'?'90':'180'}px;margin-top:8px;object-fit:contain}a{color:#164f8c}footer{margin-top:14px;border-top:1px solid #aaa;padding-top:7px;font-size:9px}.warning{font-weight:bold} @media print{body{margin:0}.toolbar{display:none}a{color:#111}.product{break-inside:avoid}.banner{font-size:14px}header{break-after:avoid}}
</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button>Internal team copy. Never send to a customer. ${layout==='landscape'?'Use Letter landscape, 100% scale.':'Use Letter portrait, 100% scale.'}</div><header><div class="banner">PRODUCTION ONLY - INTERNAL USE - DO NOT SEND TO CUSTOMER</div><h1>${escape(reference)} · ${layout==='landscape'?'Compact production sheet':'Production work order'}</h1><p>${escape(primary.playerName || primary.customerName)} · ${jobs.length} product lines · ${jobs.reduce((n,j)=>n+Number(j.quantity || 0),0)} units</p><p>Shopify: ${escape([primary.shopifyOrderName,primary.shopifyDraftOrderName].filter(Boolean).join(' / '))} · Sales rep: ${escape(primary.salesRep || 'Not recorded')} · Submitted: ${escape(primary.orderSubmittedAt || primary.createdAt)}</p><p class="warning">Payment: ${escape(primary.financialStatus || primary.invoiceStatus || 'Not recorded')}${primary.cancelledAt?' · CANCELLED':''} · Production status shown per line. This document is not an invoice or authorization to start work.</p></header><section class="products">${cards}</section><section class="section"><h2>Order internal notes</h2>${notes.length===1?`<p class="note">${escape(notes[0])}</p>`:notes.length>1?'<p>See the internal notes under each product above.</p>':'<p>No internal notes recorded.</p>'}</section><section class="section"><h2>Attachments (${attachments.length})</h2><div class="attachments">${attachmentHtml || '<p>No attachment recorded.</p>'}</div></section>${Object.keys(orderFields).length?`<section class="section"><h2>Saved order selections</h2><dl class="order-fields">${rows(orderFields)}</dl></section>`:''}<footer>PRODUCTION ONLY · Generated ${escape(generatedAt)} · Snapshot of the internal production queue at time of opening. Reopen for updates. All saved details are retained; longer orders continue on additional pages.</footer></body></html>`
}
export function openProductionDocument(all: ProductionJob[], selected: ProductionJob, layout: ProductionLayout) {
  const html = buildProductionDocument(productionOrderJobs(all,selected),layout)
  const popup=window.open('','_blank')
  if (!popup) throw new Error('Allow pop-ups for this app to open the internal production document.')
  popup.opener=null
  popup.document.open(); popup.document.write(html); popup.document.close()
}
