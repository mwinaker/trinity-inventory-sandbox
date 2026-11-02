import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSalesBatCategoryReport, classifySalesBatLine, summarizeSalesBatCategoryLines } from '../shared/sales-bat-categories.mjs'

function line(id, title, quantity, value, attributes = [], productType = '') {
  return { id: `gid://shopify/LineItem/${id}`, title, quantity, currentQuantity: quantity,
    priceAfterAllDiscountsBeforeTaxesSet: { shopMoney: { amount: String(value) } },
    customAttributes: attributes.map(([key, attributeValue]) => ({ key, value: attributeValue })),
    variant: productType ? { product: { title, productType } } : null }
}

function order(id, channel, rep, financialStatus, lines, extra = {}) {
  return { orderId: `gid://shopify/Order/${id}`, orderName: `#TBC${id}`,
    reportingCategory: channel, salesRep: rep, salesRepEmail: '', financialStatus,
    lineItems: lines, ...extra }
}

test('mixed orders allocate each paid line to its physical category and seller', () => {
  const report = buildSalesBatCategoryReport([
    order(1, 'manual_sales_order_entry', 'Jeremy McKee', 'PAID', [
      line(11, 'Pro Model RA13', 2, 300),
      line(12, 'Pro Order - Underload Trainer', 1, 109),
      line(13, 'Trophy Bat', 1, 90),
      line(14, 'Pro Fungo FS3000', 1, 99),
      line(15, 'Shipping', 1, 15),
    ]),
    order(2, 'online_store', '', 'PAID', [line(21, 'Fungo FS3000', 1, 120)]),
  ], (row) => row.salesRep.toLowerCase().replaceAll(' ', '_'))
  assert.deepEqual(report.lines.map((item) => item.category), ['game', 'training', 'trophy', 'fungo', 'fungo'])
  assert.deepEqual(report.lines.map((item) => item.repKey), [
    'jeremy_mckee', 'jeremy_mckee', 'jeremy_mckee', 'jeremy_mckee', 'online_store',
  ])
  const summary = summarizeSalesBatCategoryLines(report.lines)
  assert.equal(summary.all.orderCount, 2)
  assert.equal(summary.all.paidUnits, 6)
  assert.equal(summary.all.netSales, 718)
  assert.equal(summary.all.average, 119.67)
  assert.equal(summary.game.median, 150)
  assert.equal(summary.fungo.average, 109.5)
})

test('a first-name-only Jeremy is flagged instead of assigned to either team member', () => {
  const report = buildSalesBatCategoryReport([
    order(1540, 'manual_sales_order_entry', 'Jeremy', 'PAID', [line(60, 'Pro Model RA13', 1, 99)]),
  ], (row) => row.salesRep.toLowerCase())
  assert.equal(report.lines[0].repKey, 'jeremy')
  assert.equal(report.lines[0].repLabel, 'Jeremy (unresolved)')
})

test('comped and pending bats stay visible without changing paid average', () => {
  const report = buildSalesBatCategoryReport([
    order(1, 'manual_sales_order_entry', 'Keith Frye', 'PAID', [line(31, 'Trophy Bats', 2, 0)], { isComped: true }),
    order(2, 'manual_sales_order_entry', 'Keith Frye', 'PENDING', [line(32, 'Trophy Bats', 3, 300)]),
    order(3, 'online_store', '', 'PAID', [line(33, 'Trophy Bats', 1, 100)]),
  ])
  const summary = summarizeSalesBatCategoryLines(report.lines)
  assert.equal(summary.trophy.paidUnits, 1)
  assert.equal(summary.trophy.compedUnits, 2)
  assert.equal(summary.trophy.pendingUnits, 3)
  assert.equal(summary.trophy.average, 100)
  assert.equal(summary.trophy.orderCount, 3)
})

test('ambiguous bundles are reviewable; known-purpose balances add revenue without double-counting bats', () => {
  const report = buildSalesBatCategoryReport([
    order(1, 'manual_sales_order_entry', '', 'PAID', [
      line(41, '24 Game Bats, 12 Trophy Bats, 30 t-shirts', 1, 1200),
      line(42, 'trophy bats - remaining balance for 22 bats', 1, 500),
      line(43, 'Shipping chosen bats', 1, 172.65),
      line(44, 'TEST ONLY — DO NOT PRODUCE', 1, 1),
    ]),
  ])
  assert.deepEqual(report.lines.map((item) => item.category), ['review', 'trophy'])
  assert.deepEqual(report.lines.map((item) => item.saleStatus), ['paid_unallocated', 'paid_unallocated'])
  assert.equal(report.lines[1].quantity, 1)
  const summary = summarizeSalesBatCategoryLines(report.lines)
  assert.equal(summary.all.netSales, 500)
  assert.equal(summary.trophy.paidUnits, 0)
  assert.equal(summary.trophy.unallocatedSales, 500)
  assert.equal(summary.trophy.average, null)
  assert.equal(summary.review.reviewLines, 2)
})

test('separate trophy deposit and final balance count once in units and twice in revenue', () => {
  const report = buildSalesBatCategoryReport([
    order(1493, 'manual_sales_order_entry', 'Jeremy McKee', 'PAID', [
      line(18001376575727, '50% deposit for Trophy bats - 22 bats', 1, 1199),
    ]),
    order(1558, 'manual_sales_order_entry', '', 'PAID', [
      line(18156501041391, 'Trophy bats - remaining balance for 22 bats', 1, 1199),
    ]),
  ])
  const summary = summarizeSalesBatCategoryLines(report.lines)
  assert.equal(summary.trophy.netSales, 2398)
  assert.equal(summary.trophy.unallocatedSales, 2398)
  assert.equal(summary.trophy.paidUnits, 0)
  assert.equal(summary.trophy.average, null)
  assert.equal(summary.trophy.orderCount, 2)
  assert.deepEqual(report.lines.map((item) => item.needsReview), [true, true])
})

test('line attributes and owner-resolved historical exceptions supply classification evidence', () => {
  assert.equal(classifySalesBatLine(line(51, 'Custom', 1, 150,
    [['trinity_item_type', 'bat'], ['trinity_model', 'Pro Model RA13']])).category, 'game')
  assert.equal(classifySalesBatLine(line(52, 'Custom', 1, 150,
    [['trinity_item_type', 'bat']])).category, 'review')
  assert.equal(classifySalesBatLine(line(17087447564527, 'Towel Bat', 1, 0)).category, 'training')
  assert.equal(classifySalesBatLine(line(53, 'Short One-Hand Trainer', 1, 109, [], 'Training Series')).category, 'training')
  assert.equal(classifySalesBatLine(line(54, 'On-Deck bat', 1, 85)).category, 'training')
  assert.equal(classifySalesBatLine(line(55, 'White Lizard Grip', 1, 15)).category, 'non_bat')
  assert.equal(classifySalesBatLine(line(56, 'Skinny Bat', 1, 89)).category, 'training')
  assert.equal(classifySalesBatLine(line(57, 'The Big Grip', 1, 89)).category, 'training')
  assert.equal(classifySalesBatLine(line(58, 'Split Grip', 1, 89)).category, 'training')
  assert.equal(classifySalesBatLine(line(59, 'X-Load', 1, 89)).category, 'training')
  assert.equal(classifySalesBatLine(line(17345740898543, 'Puck Knob', 1, 108)).category, 'review')
  assert.equal(classifySalesBatLine(line(17533758144751, 'Blem maple - 34"', 1, 85)).category, 'review')
  assert.equal(classifySalesBatLine(line(17913895911663, 'Blem - 34"', 1, 85)).category, 'review')
})

test('documented multi-bat invoice quantities drive units and average without multiplying sales', () => {
  const report = buildSalesBatCategoryReport([
    order(1123, 'manual_sales_order_entry', 'Keith Frye', 'PAID', [
      line(17197609943279, 'Custom trainer order - 8 (FTC Corona)', 1, 680),
    ]),
    order(1129, 'manual_sales_order_entry', 'Keith Frye', 'PAID', [
      line(17209193791727, 'Custom trainer order - 4 (FTC LB)', 1, 340),
    ]),
    order(1171, 'manual_sales_order_entry', 'Scott Tubbs', 'PAID', [
      line(17313490632943, 'See Notes', 1, 476),
    ]),
  ])
  assert.deepEqual(report.lines.map((item) => [item.category, item.quantity, item.shopifyQuantity]), [
    ['training', 8, 1], ['training', 4, 1], ['game', 4, 1],
  ])
  const summary = summarizeSalesBatCategoryLines(report.lines)
  assert.equal(summary.training.paidUnits, 12)
  assert.equal(summary.training.netSales, 1020)
  assert.equal(summary.training.average, 85)
  assert.equal(summary.game.average, 119)
})
