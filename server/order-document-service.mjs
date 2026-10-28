import {documentSourceQuery,documentStatusQuery,resourceIds,statusFromSources,collectOrderAttachments} from './order-documents.mjs'
export function createOrderDocumentService({query,read,write,productionJobs}) {
 const pending=new Map();const cache=new Map();const writes=new Map()
 const recordId=id=>'documents-'+id.replace('gid://shopify/','').replaceAll('/','-').toLowerCase()
 async function update(id,patch) {
  const prior=writes.get(id)||Promise.resolve()
  const task=prior.catch(()=>{}).then(async()=>{
   const old=await read(recordId(id))||{}
   const events=[...new Map([...(old.events||[]),...(patch.events||[])].map(e=>[e.id,e])).values()].sort((a,b)=>a.at.localeCompare(b.at))
   const next={...old,...patch,id:recordId(id),resourceId:id,events,updatedAt:new Date().toISOString()}
   await write(next);cache.clear();return next
  });writes.set(id,task)
  try{return await task}finally{if(writes.get(id)===task)writes.delete(id)}
 }
 async function recordSent(id,at=new Date().toISOString()) {
  return update(id,{invoiceSentAt:at,events:[{id:`sent:${id}:${at}`,type:'invoice_sent',at,source:'Tool invoice send confirmed by Shopify'}]})
 }
 async function fetchSource(id) {
  let after=null,source=null;const lines=[]
  do {const result=await query(documentSourceQuery,{id,after});source=result?.data?.node;if(!source)throw new Error('The Shopify order is unavailable.');lines.push(...source.lineItems.nodes);after=source.lineItems.pageInfo.hasNextPage?source.lineItems.pageInfo.endCursor:null}while(after)
  return {...source,lineItems:{nodes:lines}}
 }
 async function reconcile(group,{refresh=false,includeSource=false}={}) {
  const ids=resourceIds(group);if(!ids.length)throw new Error('This saved order has no Shopify document source.')
  const key=ids.slice().sort().join('|')+(includeSource?':source':'')
  if(!refresh&&cache.get(key)?.expires>Date.now())return cache.get(key).value
  if(pending.has(key))return pending.get(key)
  const task=(async()=>{
   const storedRecords=await Promise.all(ids.map(id=>read(recordId(id))))
   const stored=storedRecords.filter(Boolean)
   const previous=stored.reduce((all,r)=>({...all,invoiceSentAt:[all.invoiceSentAt,r.invoiceSentAt].filter(Boolean).sort().at(-1)||'',paidAt:all.paidAt||r.paidAt||''}),{})
   const result=await query(documentStatusQuery,{ids})
   const sources=(result?.data?.nodes||[]).filter(Boolean)
   if(!sources.length) {
    const target=ids[0]
    const attachments=collectOrderAttachments(group,null)
    const source=stored.find(r=>r.source)?.source || {id:target,name:group.primary.shopifyOrderName||group.primary.shopifyDraftOrderName||group.primary.orderReference||'Order'}
    const value={...previous,paymentStatus:'UNAVAILABLE',unavailable:true,sourceUnavailable:true,verifiedAt:new Date().toISOString(),events:stored.flatMap(r=>r.events||[]),resourceId:target,source,attachments,reference:group.primary.orderReference||source.name}
    await update(target,{...value,savedJobs:group.sourceJobs||group.jobs,ownerEmail:group.primary.salesRepEmail||'',documents:['receipt','quote','production','landscape']})
    cache.set(key,{expires:Date.now()+60_000,value});return value
   }
   const status=statusFromSources(sources,previous)
   const target=status.orderId||ids.find(id=>id.includes('/DraftOrder/'))||ids[0]
   const events=stored.flatMap(r=>r.events||[])
   for(const s of sources)if(s.invoiceSentAt)events.push({id:`sent:${s.id}:${s.invoiceSentAt}`,type:'invoice_sent',at:s.invoiceSentAt,source:'Shopify invoiceSentAt'})
   if(status.paidAt)events.push({id:`paid:${target}:${status.paidAt}`,type:'paid',at:status.paidAt,source:'Successful Shopify sale/capture transactions'})
   const eventList=[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>a.at.localeCompare(b.at))
   const source=includeSource?await fetchSource(target):null
   const attachments=collectOrderAttachments(group,source)
   const old=stored.find(r=>r.resourceId===ids[0])
   const patch={...status,events:eventList,reference:group.primary.orderReference||source?.name||group.primary.shopifyOrderName||group.primary.shopifyDraftOrderName,documents:['receipt','quote','production','landscape'],...(includeSource?{source,attachments}:{}),ownerEmail:group.primary.salesRepEmail||''}
   if(includeSource||!old||old.paymentStatus!==status.paymentStatus||old.invoiceSentAt!==status.invoiceSentAt||old.paidAt!==status.paidAt||old.events?.length!==eventList.length) await update(ids[0],patch)
   const value={...status,events:eventList,resourceId:target,source,attachments,reference:patch.reference}
   cache.set(key,{expires:Date.now()+60_000,value});return value
  })();pending.set(key,task)
  try{return await task}finally{pending.delete(key)}
 }
 return {reconcile,recordSent,fetchSource,productionJobs}
}
