import { normalizePlayerLevel } from './player-level.ts'

export type ProductionContact = {
  customerName?: string; email?: string; phone?: string; recipientName?: string;
  addressLines?: string[]; shippingMethod?: string; requiresShipping?: boolean;
}
export type ProductionJob = {
  id: string; intakeId?: string; shopifyOrderId?: string; shopifyDraftOrderId?: string;
  shopifyOrderName?: string; shopifyDraftOrderName?: string; orderReference?: string;
  lineItemId?: string; productTitle?: string; variantTitle?: string; quantity?: number;
  origin?: string; customerName?: string; customerEmail?: string; playerName?: string; playerEmail?: string;
  levelOfPlay?: string; productionContact?: ProductionContact; salesRep?: string; purchaseOrder?: string;
  productionStatus?: string; financialStatus?: string; invoiceStatus?: string;
  assignedBilletId?: string; assignedBilletIds?: string[]; assignedBilletBarcodes?: string[];
  linkedProducedBatId?: string; notes?: string; internalNotes?: string; sourceOrderNotes?: string;
  totalPrice?: string; currency?: string; itemType?: string; specs?: object;
  orderSubmittedAt?: string; createdAt?: string; updatedAt?: string; cancelledAt?: string;
  submissionSnapshot?: { draft: object };
  additionalInternalAttachments?: { filename: string; downloadUrl: string; contentType?: string }[];
  internalAttachment?: { filename: string; downloadUrl: string; contentType?: string } | null;
}
export type ProductionLayout = 'detail' | 'landscape'
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const values = (value: object | undefined): Record<string, unknown> => value ? { ...value } : {}
const text = (value: unknown) => String(value ?? '').trim()
const labels: Record<string, string> = {
  puckKnob:'Puck knob', length:'Length (in)', targetWeight:'Weight / drop', wood:'Wood', handleColor:'Handle color',
  barrelColor:'Barrel color', bandColor:'Band color', logoColor:'Logo color', engraving:'Engraving', cupped:'Cupped',
}
const label = (key: string) => labels[key] || key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')
const display = (v: unknown): string => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.map(display).join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : text(v)
const identifiers = (job: ProductionJob) => [job.intakeId,job.shopifyOrderId,job.shopifyDraftOrderId].filter(Boolean) as string[]
const unique = (items: unknown[]) => [...new Set(items.map(text).filter(Boolean))]

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
  return Object.entries(fields).filter(([,v])=>includeEmpty || display(v) !== '')
    .map(([k,v])=>`<div class="field"><dt>${escape(label(k))}</dt><dd>${escape(display(v) || 'Not recorded')}</dd></div>`).join('')
}
const keyId = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase()
// Hide only known administrative/duplicate fields. Unknown customizer selections
// stay visible so a future engraving or finish option cannot silently disappear.
const administrative = new Set([
  'id','title','model','productionModel','quantity','itemType','unitPrice','productId','variantId','variantTitle',
  'isProOrder','productionStatus','assignedBilletId','assignedBilletIds','assignedBilletNumbers','assignedBilletBarcodes',
  'linkedProducedBatId','notes','levelOfPlay','trinity_player_name','trinity_item_type','trinity_pro_order',
  'trinity_product_title','trinity_requires_shipping','order type','__pplr_line_ref',
].map(keyId))
const requiredSpecs = ['length','targetWeight','wood','handleColor','barrelColor','bandColor','logoColor','engraving','cupped','puckKnob']

function contactFields(primary: ProductionJob, snapshot: Record<string, unknown>): Record<string, unknown> {
  const contact = primary.productionContact
  const snapshotAddress = unique([
    snapshot.shippingAddress1, snapshot.shippingAddress2,
    [snapshot.shippingCity, snapshot.shippingProvinceCode, snapshot.shippingZip].map(text).filter(Boolean).join(' '),
    snapshot.shippingCountryCode,
  ])
  // A current Shopify contact, even one with a missing address, takes precedence
  // over the historical form. Never print an old address after an order edit.
  const address = contact ? contact.addressLines || [] : snapshotAddress
  const shippingRequired = contact ? contact.requiresShipping : snapshot.requiresShipping
  return {
    'Customer / payer': contact?.customerName || primary.customerName || snapshot.billingName || snapshot.playerName || 'Not recorded',
    'Customer email': contact ? contact.email || 'Not recorded' : primary.customerEmail || snapshot.payerEmail || snapshot.billingEmail || snapshot.playerEmail || 'Not recorded',
    'Recipient / player': contact?.recipientName || primary.playerName || snapshot.playerName || 'Not recorded',
    'Contact phone': contact ? contact.phone || 'Not recorded' : snapshot.playerPhone || snapshot.billingPhone || 'Not recorded',
    'Delivery address': address.length ? address.join('\n') : 'Not recorded — verify before shipping',
    'Delivery method': contact?.shippingMethod || (shippingRequired === false ? 'Local delivery / no shipping required' : snapshot.shippingSpeed || 'Not recorded'),
    'Shipping required': shippingRequired === undefined ? 'Not recorded' : shippingRequired,
    ...(snapshot.playerEmail && snapshot.playerEmail !== contact?.email ? {'Player email': snapshot.playerEmail} : {}),
    ...(snapshot.billingDifferent ? {
      'Billing contact': snapshot.billingName, 'Billing email': snapshot.billingEmail,
      'Billing phone': snapshot.billingPhone, 'Team / agency': snapshot.billingCompany,
    } : {}),
    'Purchase order': primary.purchaseOrder || snapshot.purchaseOrder,
    'Sales rep': primary.salesRep || snapshot.salesRep,
    'Production timeline': snapshot.productionTimeline,
  }
}

export function buildProductionDocument(jobs: ProductionJob[], layout: ProductionLayout, generatedAt = new Date().toISOString()): string {
  if (!jobs.length) throw new Error('No production lines are available for this order.')
  const primary = jobs.find(j=>j.submissionSnapshot) || jobs[0]
  const snapshot = values(primary.submissionSnapshot?.draft)
  const originalLines = Array.isArray(snapshot.lines) ? snapshot.lines as Record<string, unknown>[] : []
  const shopifyReference = jobs.find(j=>j.shopifyOrderName)?.shopifyOrderName
  const reference = shopifyReference || primary.shopifyDraftOrderName || primary.orderReference || 'Reference not recorded'
  const referenceLabel = shopifyReference ? 'Shopify order · Bat engraving reference' : 'DRAFT · Shopify order number not yet assigned'
  const internalReferences = unique(jobs.map(j=>j.orderReference)).filter(r=>r!==reference)
  const attachments = [...new Map(jobs.flatMap(j=>[...(j.internalAttachment ? [j.internalAttachment] : []), ...(j.additionalInternalAttachments || [])]).map(a=>[a.downloadUrl,a])).values()]
  const notes = unique(jobs.map(j=>j.internalNotes))
  const sourceNotes = unique(jobs.map(j=>j.sourceOrderNotes)).filter(note=>!notes.includes(note))
  const referenceNotes: string[] = []
  const frontSourceNotes = sourceNotes.map(note => {
    // Recognize the app-generated manual-order summary by its exact submission
    // timestamp. Keep every line; contact/routing details belong on the back.
    if (primary.origin !== 'internal_sales' || !primary.orderSubmittedAt || !note.includes(`Order submitted: ${primary.orderSubmittedAt}`)) return note
    const front: string[] = [], back: string[] = []
    for (const line of note.split('\n')) {
      if (/^(Shipping:|Player:|Player email:|Player phone:|Shipping address:|Sales rep:|Sales rep email:|Order submitted:|Purchase order:|Bill to:|Payer phone:|Team\/agency:|Billing relationship:)/.test(line)) back.push(line)
      else front.push(line)
    }
    if (back.length) referenceNotes.push(back.join('\n'))
    return front.join('\n').trim()
  }).filter(Boolean)
  const orderNoteHtml = notes.length <= 1
    ? notes.map(note=>`<p class="note">${escape(note)}</p>`).join('')
    : jobs.filter(j=>text(j.internalNotes)).map(j=>`<div class="instruction"><b>${escape(values(j.specs).productionModel || values(j.specs).model || j.productTitle)}</b><p class="note">${escape(j.internalNotes)}</p></div>`).join('')
  const cards = jobs.map((job,index)=>{
    // Never pair completed Shopify lines with historical draft lines by position.
    const lineIndex = job.id.match(/^draft-\d+-line-(\d+)$/)
    const original = lineIndex ? originalLines[Number(lineIndex[1])-1] || {} : {}
    const specs = { ...original, ...values(job.specs) }
    const fields: Record<string, unknown> = {}
    const isBat = !job.itemType || job.itemType === 'bat'
    if (isBat) for (const key of requiredSpecs) fields[key] = specs[key] ?? ''
    for (const [key,value] of Object.entries(specs)) {
      if (!administrative.has(keyId(key)) && !(key in fields) && display(value)) fields[key] = value
    }
    if (job.variantTitle && job.variantTitle !== 'Default Title' && job.variantTitle !== job.productTitle) fields.Variant = job.variantTitle
    if (job.assignedBilletBarcodes?.length) fields['Assigned billet numbers'] = job.assignedBilletBarcodes
    const level = normalizePlayerLevel(job.levelOfPlay || specs.levelOfPlay || snapshot.levelOfPlay)
    const model = specs.productionModel || specs.model || job.productTitle || 'Product not recorded'
    const lineNotes = unique([job.notes, specs.notes]).filter(note=>!sourceNotes.includes(note) && !notes.includes(note))
    return `<article class="product"><h2>${index+1}. ${escape(model)}</h2><div class="qty">Quantity: ${escape(job.quantity)} · Status: ${escape(job.productionStatus || 'Not recorded')}</div>${isBat?`<p class="play-level"><b>Level of play:</b> ${escape(level || 'Not recorded')}</p>`:''}${lineNotes.length?`<div class="line-note"><b>Bat / line instructions</b>${lineNotes.map(note=>`<p class="note">${escape(note)}</p>`).join('')}</div>`:''}<dl class="specs">${rows(fields,true)}</dl><div class="handwritten-billets"><b>Handwritten billet numbers used for this line</b><div class="write-line"></div><div class="write-line"></div></div></article>`
  }).join('')
  const attachmentHtml = attachments.map(a=>{
    const url = safeUrl(a.downloadUrl)
    const image = url && new URL(url).hostname === 'cdn.shopify.com' && /^image\/(png|jpeg|webp|gif)$/i.test(a.contentType || '')
    return `<div class="attachment"><b>${escape(a.filename)}</b>${url ? `<br><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open / print original attachment</a>` : '<p>Attachment link unavailable</p>'}${image ? `<img src="${escape(url)}" alt="${escape(a.filename)}">` : '<p>Original file is linked above; print it separately if required.</p>'}</div>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>PRODUCTION ONLY - ${escape(reference)} - ${layout}</title><style>
@page{size:letter ${layout==='landscape'?'landscape':'portrait'};margin:0.55in 0.45in 0.45in}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:24px;font-size:12px;line-height:1.3}.toolbar{background:#eee;padding:12px;margin-bottom:18px;font-size:14px}.toolbar button{padding:9px 16px;margin-right:10px;cursor:pointer}.print-frame{width:100%;border-collapse:collapse}.print-frame>thead>tr>td,.print-frame>tbody>tr>td{padding:0;vertical-align:top}.banner{border:2px solid #111;padding:5px 9px;font-size:11px;font-weight:bold;letter-spacing:.04em}.reference-line{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:7px 0;border-bottom:2px solid #111}.reference-line h1{font-size:28px;line-height:1.1;margin:0}.reference-line span{font-size:13px}.reference-label{font-size:10px;margin:4px 0 9px}.order-summary p{margin:5px 0}.secondary{font-size:10px}.warning{font-size:10px;font-weight:bold}.order-instructions{border:2px solid #111;margin:12px 0;padding:10px}.order-instructions h2{font-size:15px;margin:0 0 6px}.note{white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0;orphans:3;widows:3}.instruction{margin:8px 0}.products{display:grid;grid-template-columns:repeat(${jobs.length===1?1:layout==='landscape'?3:2},minmax(0,1fr));gap:12px;margin-top:12px}.product{border:1px solid #666;padding:11px;break-inside:avoid;overflow-wrap:anywhere}.product h2{font-size:16px;margin:0 0 5px;break-after:avoid}.qty{font-weight:bold}.play-level{margin:6px 0;padding:5px 0;border-bottom:2px solid #111}.specs{margin:6px 0}.field{display:grid;grid-template-columns:43% 57%;border-bottom:1px solid #ddd;padding:4px 0;break-inside:avoid}dt{font-weight:bold;padding-right:7px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.line-note{border-left:3px solid #111;padding-left:8px;margin:8px 0}.handwritten-billets{margin-top:12px;padding:8px;border:2px solid #111;break-inside:avoid}.handwritten-billets b{font-size:11px}.write-line{height:25px;border-bottom:1px solid #777}.support{margin-top:24px;break-before:page}.support h2{font-size:19px;margin:0 0 14px}.contact-fields{columns:2;column-gap:26px;margin:0}.section{margin-top:20px;border-top:2px solid #111;padding-top:10px}.section h2{font-size:15px}.attachments{display:flex;flex-wrap:wrap;gap:15px}.attachment{max-width:46%;break-inside:avoid;overflow-wrap:anywhere}.attachment img{display:block;max-width:100%;max-height:200px;margin-top:8px;object-fit:contain}a{color:#164f8c}footer{margin-top:18px;border-top:1px solid #aaa;padding-top:7px;font-size:9px}
${jobs.length===1?'.specs{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}.specs .field{min-width:0}':''}
@media print{body{margin:0}.toolbar{display:none}.print-frame>thead{display:table-header-group}.reference-line h1{font-size:25px}.support{margin-top:12px}a{color:#111}.order-instructions h2{break-after:avoid}.product{break-inside:avoid}}
</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button>Internal team copy. Never send to a customer. Use Letter ${layout==='landscape'?'landscape':'portrait'}, 100% scale.</div><table class="print-frame"><thead><tr><td><div class="banner">PRODUCTION ONLY - INTERNAL USE - DO NOT SEND TO CUSTOMER</div><div class="reference-line"><h1>${escape(reference)}</h1><span>${layout==='landscape'?'Compact production sheet':'Production work order'}</span></div><p class="reference-label">${escape(referenceLabel)}</p></td></tr></thead><tbody><tr><td><div class="order-summary"><p><b>${escape(primary.playerName || primary.customerName || snapshot.playerName || 'Player not recorded')}</b> · ${jobs.length} product lines · ${jobs.reduce((n,j)=>n+Number(j.quantity || 0),0)} units</p><p class="secondary">${internalReferences.length?`Internal reference: ${escape(internalReferences.join(' / '))} · `:''}Sales rep: ${escape(primary.salesRep || 'Not recorded')} · Submitted: ${escape(primary.orderSubmittedAt || primary.createdAt || 'Not recorded')}</p><p class="warning">Payment: ${escape(primary.financialStatus || primary.invoiceStatus || 'Not recorded')}${primary.cancelledAt?' · CANCELLED':''}. This document is not an invoice or authorization to start work.</p></div><section class="order-instructions"><h2>Production instructions / Order notes</h2>${orderNoteHtml || (!frontSourceNotes.length?'<p>No order notes recorded.</p>':'')}${frontSourceNotes.length?`<div class="source-notes"><b>Shopify order notes</b>${frontSourceNotes.map(note=>`<p class="note">${escape(note)}</p>`).join('')}</div>`:''}</section><section class="products">${cards}</section><section class="support"><h2>Customer &amp; shipping details</h2><dl class="contact-fields">${rows(contactFields(primary,snapshot))}</dl>${referenceNotes.length?`<section class="section"><h2>Saved order reference details</h2>${referenceNotes.map(note=>`<p class="note">${escape(note)}</p>`).join('')}</section>`:''}${attachments.length?`<section class="section"><h2>Attachments (${attachments.length})</h2><div class="attachments">${attachmentHtml}</div></section>`:''}<footer>PRODUCTION ONLY · Generated ${escape(generatedAt)} · Reopen for current order details. Longer orders and notes continue on additional pages.</footer></section></td></tr></tbody></table></body></html>`
}
export function openProductionDocument(all: ProductionJob[], selected: ProductionJob, layout: ProductionLayout) {
  const html = buildProductionDocument(productionOrderJobs(all,selected),layout)
  const popup=window.open('','_blank')
  if (!popup) throw new Error('Allow pop-ups for this app to open the internal production document.')
  popup.opener=null
  popup.document.open(); popup.document.write(html); popup.document.close()
}
