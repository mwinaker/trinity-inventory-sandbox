import test from 'node:test'
import assert from 'node:assert/strict'
import {productionLineDetails} from '../server/production-line-details.mjs'
import {mergeCurrentPrintJobs} from '../server/production-print-records.mjs'
import {buildProductionDocument} from '../shared/production-documents.ts'
const pairs = [['_Wood Type','Maple'],['_Length (in)','30"'],['_Cupped','Yes'],['_Weight (oz)','-8'],['_Handle Colors','Clear Gloss'],['_Barrel Color','Denim Blue Stain'],['_Band Color','White'],['_Logo','White'],['_Dark Top Text - Light Barrel','PRO MODEL'],['_Dark Bottom Text - Light Barrel','SELECT WOOD 33'],['_Engraved Text (26 Characters Max)','Jaxon Buccheri #5'],['_Bat model','Youth Pro Model HK47'],['_Build','Custom'],['_Production and shipping','2–3 weeks'],['_Preview','https://cdn.shopify.com/s/files/1/0797/7281/1503/uploads/eb62e4f55e8a00a0df9166a6b47b3b06.png'],['__pplr_line_ref','KXJMOR']]
test('1547 personalizer selections and preview survive both production print layouts',()=>{
 const details=productionLineDetails(pairs.map(([key,value])=>({key,value})),{length:'',wood:'',engraving:''},'Youth Pro Model HK47 Custom')
 assert.equal(details.specs.targetWeight,'-8'); assert.equal(details.specs.engraving,'Jaxon Buccheri #5')
 const jobs=mergeCurrentPrintJobs([{id:'order-1547-line-1',lineItemId:'line-1',quantity:1,productTitle:'Youth Pro Model HK47 Custom',specs:details.specs,additionalInternalAttachments:details.attachments}],[])
 for(const layout of ['detail','landscape']) {
  const html=buildProductionDocument(jobs,layout)
  for(const value of ['Maple','30&quot;','-8','Clear Gloss','Denim Blue Stain','White','PRO MODEL','SELECT WOOD 33','Jaxon Buccheri #5','Youth Pro Model HK47','Custom','2–3 weeks','<img src="https://cdn.shopify.com/']) assert.ok(html.includes(value),value)
  assert.ok(!html.includes('KXJMOR'))
 }
})
test('unknown selections are preserved, escaped, and stay on the correct product',()=>{
 const a=productionLineDetails([{key:'_New custom option',value:'<script>bad()</script>'},{key:'_Preview',value:'javascript:alert(1)'}],{},'A')
 const b=productionLineDetails([{key:'_Length (in)',value:'34'}],{},'B')
 const html=buildProductionDocument([{id:'a',quantity:1,productTitle:'A',specs:a.specs},{id:'b',quantity:1,productTitle:'B',specs:b.specs}],'detail')
 assert.match(html,/New custom option/); assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/<script>|<img/);assert.equal(b.specs.length,'34');assert.equal(b.specs['New custom option'],undefined)
})
test('manual specifications remain authoritative while conflicting personalizer fields stay visible',()=>{
 const result=productionLineDetails([{key:'_Length (in)',value:'32'},{key:'trinity_wood',value:'Birch'}],{length:'33',model:'T26'})
 assert.equal(result.specs.length,'33'); assert.equal(result.specs['Length (in)'],'32'); assert.equal(result.specs.wood,'Birch');assert.equal(result.specs.model,'T26')
})
