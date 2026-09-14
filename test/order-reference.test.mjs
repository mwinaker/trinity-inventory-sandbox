import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveOrderReference, referenceStamp, getTrinityOrderReference, createReferenceStore } from '../server/order-reference.mjs'
function store(initial=0){
 let value=initial
 const claims=new Map(),bindings=new Map()
 return {claims,bindings,get value(){return value},readBinding:async id=>bindings.get(id),readClaim:async ref=>claims.get(ref),readSequence:async()=>({value:String(value)}),
 async claim(reference,ownerId){if(!claims.has(reference))claims.set(reference,{reference,ownerId});return claims.get(reference)},
 async bind(ownerId,reference){if(!bindings.has(ownerId))bindings.set(ownerId,{reference,ownerId});return bindings.get(ownerId)},
 async advanceSequence(n){value=n},resetHint(n){value=n}}
}
test('concurrent distinct drafts and duplicate requests use unique immutable bindings',async()=>{
 const s=store();const ids=['a','a','b','c','b','d','e'];const refs=await Promise.all(ids.map(id=>reserveOrderReference(s,id)))
 const unique=new Map();ids.forEach((id,i)=>{if(unique.has(id))assert.equal(refs[i],unique.get(id));unique.set(id,refs[i])});assert.equal(new Set(unique.values()).size,5);assert(refs.every(r=>/^T-\d{5}$/.test(r)))
})
test('a stale or regressed counter hint cannot reuse a reserved number',async()=>{
 const s=store();assert.equal(await reserveOrderReference(s,'first'),'T-00001');s.resetHint(0);assert.equal(await reserveOrderReference(s,'second'),'T-00002');assert.equal(await reserveOrderReference(s,'first'),'T-00001')
})
test('deleting the Shopify order does not delete its number or binding',async()=>{
 const s=store();await reserveOrderReference(s,'deleted');assert.equal(await reserveOrderReference(s,'next'),'T-00002');assert.equal(s.claims.get('T-00001').ownerId,'deleted')
})
test('a new copied draft cannot use another source binding',async()=>{
 const s=store();assert.notEqual(await reserveOrderReference(s,'source'),await reserveOrderReference(s,'copy'))
})
test('missing sequence stops a new reservation without writing',async()=>{
 const s=store();s.readSequence=async()=>null;await assert.rejects(reserveOrderReference(s,'draft'),/never be reset/);assert.equal(s.claims.size,0)
})
test('five digit sequence never wraps',async()=>{const s=store(99999);await assert.rejects(reserveOrderReference(s,'new'),/exhausted/);assert.equal(s.claims.size,0)})
test('a binding whose number is owned by another source is rejected',async()=>{
 const s=store();s.bindings.set('wrong',{ownerId:'wrong',reference:'T-00001'});s.claims.set('T-00001',{ownerId:'right',reference:'T-00001'});await assert.rejects(reserveOrderReference(s,'wrong'),/does not match/)
})
test('Shopify automatic handle suffixes and lost responses cannot assign the losing claim',async()=>{
 const records=new Map();let seq=0;let lose=true;let suffixes=0
 const graph=async(q,v)=>{
  if(q.includes('ReferenceDefinition'))return{data:{metaobjectDefinitionByType:{id:'definition'}}}
  if(q.includes('query ReferenceClaim'))return{data:{metaobjectByHandle:records.get(v.handle.handle)??null}}
  if(q.includes('mutation CreateReferenceClaim')){
   const input=v.metaobject;let handle=input.handle;if(records.has(handle)){suffixes++;handle+=`-${suffixes}`}
   const record={id:handle,handle,fields:input.fields};records.set(handle,record)
   if(lose){lose=false;throw Error('Connection lost after save')}
   return{data:{metaobjectCreate:{metaobject:record,userErrors:[]}}}
  }
  if(q.includes('query ReferenceSequence'))return{data:{shop:{id:'shop',sequence:{value:String(seq),compareDigest:'digest'}}}}
  if(q.includes('mutation AdvanceReferenceHint')){seq=Number(v.metafields[0].value);return{data:{metafieldsSet:{userErrors:[]}}}}
  throw Error('Unexpected operation')
 }
 const s=createReferenceStore(graph);const a='gid://shopify/DraftOrder/1',b='gid://shopify/DraftOrder/2'
 const refs=await Promise.all([reserveOrderReference(s,a),reserveOrderReference(s,a),reserveOrderReference(s,b)])
 assert.equal(refs[0],refs[1]);assert.notEqual(refs[0],refs[2]);assert(suffixes>0)
 for(const [id,ref]of[[a,refs[0]],[b,refs[2]]])assert.equal((await s.readClaim(ref)).ownerId,id)
})
test('stamping preserves unrelated tags and customer attributes',()=>{
 const input={id:'gid://shopify/DraftOrder/456',tags:['Internal Sales','T-00001','T-REF-D123','customer-tag'],customAttributes:[{key:'trinity_order_reference',value:'T-00001'},{key:'trinity_purchase_order',value:'PO-44'}]}
 const stamped=referenceStamp(input,'T-00002',input.id);assert.deepEqual(stamped.tags,['Internal Sales','customer-tag','T-00002','T-REF-D456']);assert(stamped.customAttributes.some(a=>a.value==='PO-44'));assert.equal(getTrinityOrderReference(stamped),'T-00002')
 const paid=referenceStamp({...input,id:'gid://shopify/Order/789'},'T-00002',input.id);assert(paid.tags.includes('T-REF-O789'));assert(paid.tags.includes('T-REF-D456'))
})
