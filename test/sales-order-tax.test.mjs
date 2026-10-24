import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
const serverUrl = new URL('../server/index.mjs', import.meta.url)
const source = fs.readFileSync(serverUrl, 'utf8')
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const modules = {}
for (const statement of ast.statements) {
  if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('.')) {
    Object.assign(modules, await import(new URL(statement.moduleSpecifier.text, serverUrl)))
  }
}
const context = vm.createContext({ ...modules, permanentOrderReferencesEnabled: false, URL, Buffer,
  shopCurrencyCode: 'USD', rushProductionSurchargeAmount: '50.00', rushProductionSurchargeTitle: 'Rush Production Surcharge',
  internalOrderNotificationEmails: [], defaultShippingSpeed: 'standard',
  draftOrderShippingOptions: { standard: {title:'Standard Shipping',amount:'15.00'}, comped: {title:'Comped Shipping',amount:'0.00'} },
})
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(ast)).join('\n'), context)
const payload = {playerName:'Tax Test',playerPhone:'555-0100',payerEmail:'tax-test@example.com',shippingAddress1:'123 Tax Verification Street',shippingCity:'Fullerton',shippingProvinceCode:'CA',shippingZip:'92831',shippingCountryCode:'US',requiresShipping:true,lines:[{itemType:'bat',title:'Custom bat',quantity:1,unitPrice:'100.00'}]}
for (const local of [false,true]) {
  for(const payerDifferent of [false,true]) {
    test(`Taxable physical merchandise and address survive local=${local}, third-party payer=${payerDifferent}`,()=>{
      const input=context.buildDraftOrderInput({...payload,requiresShipping:!local,billingDifferent:payerDifferent,billingEmail:'payer@example.com'},'tax-test')
      assert.equal(input.taxExempt,false)
      assert.equal(input.useCustomerDefaultAddress,false)
      assert.equal(input.shippingAddress.provinceCode,'CA')
      assert.equal(input.lineItems[0].taxable,true)
      assert.equal(input.lineItems[0].requiresShipping,true)
      assert.equal(input.shippingLine.priceWithCurrency.amount,local?'0.00':'15.00')
    })
  }
}
test('Local orders cannot bypass the tax address requirement',()=>{
 assert.equal(context.validateSalesOrderPayload({...payload,requiresShipping:false}), '')
 assert.match(context.validateSalesOrderPayload({...payload,requiresShipping:false,shippingAddress1:''}),/delivery or pickup address/)
})
test('Rush production remains taxable while gifts retain their original zero price',()=>{
 const input=context.buildDraftOrderInput({...payload,productionTimeline:'rush',lines:[{...payload.lines[0],unitPrice:'0.00'}]},'tax-test')
 assert.equal(input.lineItems[0].originalUnitPriceWithCurrency.amount,'0.00')
 assert.equal(input.lineItems[1].taxable,true)
 assert.equal(input.lineItems[1].requiresShipping,true)
 assert.equal(input.lineItems[1].originalUnitPriceWithCurrency.amount,'50.00')
})
test('Variant merchandise uses Shopify product identity with no forced tax exemption',()=>{
 const input=context.buildDraftOrderInput({...payload,lines:[{...payload.lines[0],variantId:'gid://shopify/ProductVariant/1'}]},'tax-test')
 assert.equal(input.lineItems[0].variantId,'gid://shopify/ProductVariant/1')
 assert.equal(input.lineItems[0].taxable,true)
})
test('Direct orders complete a calculated Shopify draft with payment pending, never orderCreate',async()=>{
 const calls=[]
 context.createDraftOrder=async input=>{calls.push({input});return {id:'gid://shopify/DraftOrder/123',name:'#D123'}}
 context.shopifyGraphQL=async(query,variables)=>{calls.push({query,variables});return {data:{draftOrderComplete:{draftOrder:{order:{id:'gid://shopify/Order/456',displayFinancialStatus:'PENDING'}},userErrors:[]}}}}
 const result=await context.createTaxCalculatedPendingOrder({lineItems:[]})
 assert.equal(result.sourceDraft.name,'#D123')
 assert.equal(result.order.displayFinancialStatus,'PENDING')
 assert.match(calls[1].query,/paymentPending: true/)
 assert.doesNotMatch(calls[1].query,/orderCreate\(/)
 assert.equal(calls[1].variables.id,'gid://shopify/DraftOrder/123')
})
test('Failed completion identifies existing draft instead of claiming order success',async()=>{
 context.shopifyGraphQL=async()=>({data:{draftOrderComplete:{draftOrder:null,userErrors:[{message:'Unable to complete'}]}}})
 await assert.rejects(context.createTaxCalculatedPendingOrder({}),/Review existing Shopify draft #D123 before retrying/)
})

test('Tax calculation fails closed on API errors and absent totals',async()=>{
 await assert.rejects(modules.calculateSalesOrderTax(async()=>({errors:[{message:'Access denied'}]}),{}),/Access denied/)
 await assert.rejects(modules.calculateSalesOrderTax(async()=>({data:{draftOrderCalculate:{calculatedDraftOrder:null,userErrors:[]}}}),{}),/valid tax calculation/)
})
test('Unexpected zero California tax blocks priced goods but allows a documented Shopify customer exemption',async()=>{
 const quote={subtotalPriceSet:{shopMoney:{amount:'100.00'}},totalPriceSet:{shopMoney:{amount:'100.00'}},totalTaxSet:{shopMoney:{amount:'0.00'}}}
 const graphql=async()=>({data:{draftOrderCalculate:{calculatedDraftOrder:quote,userErrors:[]}}})
 const input={shippingAddress:{countryCode:'US',provinceCode:'CA'}}
 await assert.rejects(modules.calculateSalesOrderTax(graphql,input),/no California sales tax/)
 quote.customer={taxExempt:true}
 assert.equal((await modules.calculateSalesOrderTax(graphql,input)).totalTaxSet.shopMoney.amount,'0.00')
})
test('Zero-price merchandise and states without configured collection do not get invented tax',async()=>{
 const quote={subtotalPriceSet:{shopMoney:{amount:'0.00'}},totalPriceSet:{shopMoney:{amount:'15.00'}},totalTaxSet:{shopMoney:{amount:'0.00'}}}
 const graphql=async()=>({data:{draftOrderCalculate:{calculatedDraftOrder:quote,userErrors:[]}}})
 assert.equal((await modules.calculateSalesOrderTax(graphql,{shippingAddress:{countryCode:'US',provinceCode:'CA'}})).totalTaxSet.shopMoney.amount,'0.00')
 quote.subtotalPriceSet.shopMoney.amount='100.00'
 assert.equal((await modules.calculateSalesOrderTax(graphql,{shippingAddress:{countryCode:'US',provinceCode:'CO'}})).totalTaxSet.shopMoney.amount,'0.00')
})

test('An invoice error after creation is reported without failing the existing order',async()=>{
 context.buildOrderInvoiceEmailInput=()=>({})
 context.sendOrderInvoice=async()=>{throw new Error('Invoice unavailable for this order')}
 const result=await context.trySendCompletedOrderInvoice({id:'gid://shopify/Order/456'},{},true)
 assert.equal(result.sent,false)
 assert.match(result.error,/Invoice/)
})
