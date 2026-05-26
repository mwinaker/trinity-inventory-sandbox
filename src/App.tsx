import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './App.css'

type SpeechRecognitionResultEvent = {
  resultIndex: number
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
      }
    }
  }
}

type SpeechRecognitionController = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionController
type BarcodeDetectorResult = { rawValue: string }
type BarcodeDetectorController = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>
}
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[]
}) => BarcodeDetectorController

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    BarcodeDetector?: BarcodeDetectorConstructor
  }
}

type ActiveSection = 'inventory' | 'orders' | 'players' | 'models' | 'costs'
type BilletStatus = 'storage' | 'production'
type OrderOrigin = 'website' | 'internal_sales'
type ProductionStatus = 'new' | 'waiting_payment' | 'ready' | 'in_production' | 'complete' | 'cancelled'
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'not_required'

type Species = 'Maple' | 'Birch' | 'Ash'
type Grade = 'Prime' | 'Select' | 'Choice' | 'Trophy' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type KnotStatus = 'Yes' | 'No' | 'N/A'
type WoodTier = 'Prime' | 'Select' | 'Choice' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type Source = "RJ's Tree Farms" | 'Great Lakes Veneer' | 'Champeau' | 'Cahan'
type ProfileKind = 'Player' | 'Trainer'

type Billet = {
  id: string
  barcode: string
  species: Species
  grade: Grade
  mlbEligible: boolean
  hasBarrelKnot: KnotStatus
  source: Source
  deliveryDate: string
  length: number
  weight: number | ''
  moisture: number
  status: BilletStatus
  location: string
  notes: string
}

type InventorySort =
  | 'barcode_asc'
  | 'barcode_desc'
  | 'weight_asc'
  | 'weight_desc'
  | 'species_asc'
  | 'grade_asc'
  | 'source_asc'
  | 'delivery_desc'
  | 'delivery_asc'

type SortDirection = 'asc' | 'desc'
type InventoryMlbFilter = 'yes' | 'no'

type CustomBuild = {
  model: string
  length: number
  targetWeight: number
  species: Species | 'Any'
  grade: Grade
  mlbOnly: boolean
}

type BatVariation = {
  id: string
  modelNumber: string
  length: number | ''
  weight: string
  woodTier: WoodTier
  colorPreferences: string
  compatibleBilletIds: string[]
  notes: string
}

type PlayerProfile = {
  id: string
  profileKind: ProfileKind
  playerName: string
  bats: BatVariation[]
}

type BatModelProduct = {
  id: string
  name: string
  category: string
  url: string
  source?: 'seed' | 'shopify' | 'custom'
  status?: string
  handle?: string
  tags?: string[]
  variantCount?: number
  inventoryOnHand?: number
}

type ShopifyCatalogProduct = {
  id: string
  name: string
  category: string
  handle: string
  url: string
  status: string
  tags: string[]
  imageUrl: string
  variants: {
    id: string
    title: string
    price: string
    inventoryQuantity: number
    sku: string
  }[]
}

type ProducedBatRecord = {
  id: string
  modelId: string
  batType: 'Game' | 'Trainer' | 'Trophy'
  customModelName: string
  sourceModelId: string
  sourceBilletStatuses: Record<string, BilletStatus>
  shopifyProductId: string
  shopifyVariantId: string
  length: string
  weight: string
  billetWeight: string
  billetGrade: Grade
  billetIds: string[]
  cupped: 'Yes' | 'No'
  modifications: string
  createdAt: string
}

type OrderSpecs = {
  model: string
  length: string
  targetWeight: string
  wood: string
  handleColor: string
  barrelColor: string
  logoColor: string
  engraving: string
  cupped: string
  notes: string
}

type OrderJob = {
  id: string
  origin: OrderOrigin
  intakeId: string
  shopifyOrderId: string
  shopifyOrderName: string
  shopifyDraftOrderId: string
  shopifyDraftOrderName: string
  shopifyDraftInvoiceUrl: string
  lineItemId: string
  orderSubmittedAt: string
  customerName: string
  customerEmail: string
  playerName: string
  playerEmail: string
  billingDifferent: boolean
  billingName: string
  billingEmail: string
  billingPhone: string
  billingCompany: string
  billingRelationship: string
  productTitle: string
  variantTitle: string
  shopifyProductId: string
  shopifyVariantId: string
  quantity: number
  financialStatus: string
  fulfillmentStatus: string
  invoiceStatus: InvoiceStatus
  productionStatus: ProductionStatus
  assignedBilletId: string
  linkedProducedBatId: string
  salesRep: string
  totalPrice: string
  currency: string
  specs: OrderSpecs
  lineItems: Array<{
    title: string
    quantity: number
    variantId: string
    productId: string
  }>
  notes: string
  internalNotes: string
  createdAt: string
  updatedAt: string
}

type SalesOrderLineDraft = {
  id: string
  isProOrder: boolean
  productId: string
  variantId: string
  title: string
  quantity: number
  unitPrice: string
  length: string
  targetWeight: string
  handleColor: string
  barrelColor: string
  logoColor: string
  engraving: string
  cupped: 'Yes' | 'No'
  wood: Species | 'Other'
  notes: string
}

type ShippingSpeedOption = 'standard' | 'fast' | 'really_fast' | 'comped'
type ProductionTimelineOption = 'normal' | 'rush'

type SalesOrderDraft = {
  playerName: string
  playerEmail: string
  playerPhone: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingProvinceCode: string
  shippingZip: string
  shippingCountryCode: string
  billingAddressDifferent: boolean
  billingAddress1: string
  billingAddress2: string
  billingCity: string
  billingProvinceCode: string
  billingZip: string
  billingCountryCode: string
  billingDifferent: boolean
  requiresShipping: boolean
  shippingSpeed: ShippingSpeedOption
  productionTimeline: ProductionTimelineOption
  billingName: string
  billingEmail: string
  billingPhone: string
  billingCompany: string
  billingRelationship: string
  salesRep: string
  notes: string
  createDraftOrder: boolean
  sendInvoice: boolean
  lines: SalesOrderLineDraft[]
}

type BillingContact = {
  id: string
  name: string
  email: string
  phone: string
  company: string
  relationship: string
  notes: string
}

type BillingContactSearchOption = {
  id: string
  value: string
  label: string
  contactId: string
}

type BilletCostReference = {
  id: string
  source: Source
  species: Species | 'Hard Maple' | 'Yellow Birch' | 'Soft Maple'
  tier: string
  weightRange: string
  price: string
  priceValue: number | null
  notes: string
}

type RemoteState = {
  billets: Billet[]
  players: PlayerProfile[]
  producedBats: ProducedBatRecord[]
  customBatModels: BatModelProduct[]
  orderJobs: OrderJob[]
  billingContacts: BillingContact[]
}

const billetStorageKey = 'trinity-billet-sandbox-v5'
const playerStorageKey = 'trinity-player-profiles-v3'
const producedBatStorageKey = 'trinity-produced-bats-v1'
const customBatModelStorageKey = 'trinity-custom-bat-models-v1'
const orderJobStorageKey = 'trinity-order-jobs-v1'
const billingContactStorageKey = 'trinity-billing-contacts-v1'
const legacyLocalStateBackupKey = 'trinity-local-recovery-backup-v1'
const legacyLocalStateKeys = [
  billetStorageKey,
  playerStorageKey,
  producedBatStorageKey,
  customBatModelStorageKey,
  orderJobStorageKey,
  billingContactStorageKey,
]

const standardBilletLength = 37
const standardBilletDiameter = 2.75
const rjBilletDiameter = 2.79
const defaultMoisture = 8
const speciesOptions: Species[] = ['Maple', 'Birch', 'Ash']
const allGradeOptions: Grade[] = ['Prime', 'Select', 'Choice', 'Trophy', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceGradeOptions: Record<Source, Grade[]> = {
  "RJ's Tree Farms": ['Prime', 'Select', 'Choice', 'Trophy'],
  'Great Lakes Veneer': ['Prime', 'Select', 'Choice', 'Trophy'],
  Cahan: ['Prime', 'Select', 'Choice', 'Trophy'],
  Champeau: ['Pro', 'Semi-Pro', 'Promo', 'Blem'],
}
const woodTierOptions: WoodTier[] = ['Prime', 'Select', 'Choice', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceOptions: Source[] = ["RJ's Tree Farms", 'Great Lakes Veneer', 'Cahan', 'Champeau']
const cupOptions: ProducedBatRecord['cupped'][] = ['Yes', 'No']
const manualCupOptions: SalesOrderLineDraft['cupped'][] = ['No', 'Yes']
const rushProductionSurchargeUnitAmount = 50
const shippingSpeedOptions: Array<{ value: ShippingSpeedOption; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'fast', label: 'Fast' },
  { value: 'really_fast', label: 'Really fast' },
  { value: 'comped', label: 'Comped' },
]
const productionTimelineOptions: Array<{ value: ProductionTimelineOption; label: string }> = [
  { value: 'normal', label: 'Normal' },
  {
    value: 'rush',
    label: `Rush production (+${formatSalesOrderMoney(rushProductionSurchargeUnitAmount)}/bat)`,
  },
]
const customizerColorOptions = [
  'Black',
  'Dark Gray',
  'Light Gray',
  'White',
  'Solid White Gloss',
  'Solid Black Gloss',
  'Walker Black',
  'Cherry',
  'Flame Temper',
  'Medium Brown',
  'Dark Brown',
  'Walnut',
  'Navy Blue',
  'Royal Blue',
  'Sky Blue',
  'Seafoam Green',
  'Forest Green',
  'Yellow',
  'Orange',
  'Red',
  'Maroon',
  'Pink',
  'Purple',
  'Matte Black',
  'Matte Dark Gray',
]
const batTypeOptions: ProducedBatRecord['batType'][] = ['Game', 'Trainer', 'Trophy']
const autoNonMlbGrades = new Set<Grade>(['Choice', 'Trophy', 'Semi-Pro', 'Promo', 'Blem'])

const billetCostReferences: BilletCostReference[] = [
  { id: 'glv-prime-light-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Prime', weightRange: 'Light/Midweight 50/50 mix', price: '$59.95', priceValue: 59.95, notes: 'GLV 2026 Maple Standard Pricing.' },
  { id: 'glv-prime-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Prime', weightRange: '89-96 oz', price: '$45.00', priceValue: 45, notes: 'Sale listed at $35.' },
  { id: 'glv-prime-heavy', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Prime', weightRange: '96+ oz', price: '$19.00', priceValue: 19, notes: 'Heavy Prime Maple.' },
  { id: 'glv-select-light-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Select', weightRange: 'Light/Midweight 50/50 mix', price: '$38.50', priceValue: 38.5, notes: 'GLV 2026 Select Pro Maple.' },
  { id: 'glv-select-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Select', weightRange: '89-96 oz', price: '$32.50', priceValue: 32.5, notes: 'Sale listed at $25.' },
  { id: 'glv-select-heavy', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Select', weightRange: '96+ oz', price: '$16.00', priceValue: 16, notes: 'Heavy Select Pro Maple.' },
  { id: 'glv-choice-light', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Choice', weightRange: '< 89 oz', price: '$34.50', priceValue: 34.5, notes: 'GLV 2026 Choice Premium Maple.' },
  { id: 'glv-choice-light-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Choice', weightRange: 'Light/Midweight 50/50 mix', price: '$24.50', priceValue: 24.5, notes: 'Choice Premium Maple.' },
  { id: 'glv-choice-mid', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Choice', weightRange: '89-96 oz', price: '$20.00', priceValue: 20, notes: 'Sale listed at $14.' },
  { id: 'glv-choice-heavy', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Choice', weightRange: '96+ oz', price: '$13.00', priceValue: 13, notes: 'Heavy Choice Premium Maple.' },
  { id: 'glv-economy', source: 'Great Lakes Veneer', species: 'Maple', tier: 'Economy', weightRange: 'All weights', price: '$12.00', priceValue: 12, notes: 'Sale listed at $9.' },
  { id: 'rj-maple-prime-lights', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Prime', weightRange: '90 oz and less', price: '$55.00', priceValue: 55, notes: 'RJ price list 12/01/24.' },
  { id: 'rj-maple-prime-mixed', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Prime', weightRange: '93.5 oz and less, 50/50', price: '$42.50', priceValue: 42.5, notes: 'Prime Mixed.' },
  { id: 'rj-maple-prime-heavy', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Prime', weightRange: '93.6-99 oz', price: '$26.00', priceValue: 26, notes: 'Prime Heavy.' },
  { id: 'rj-maple-amateur', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Amateur', weightRange: '99 oz and less', price: '$24.00', priceValue: 24, notes: 'RJ Amateur grade.' },
  { id: 'rj-maple-heavy', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Prime Heavy', weightRange: 'Over 100 oz', price: '$10.00', priceValue: 10, notes: "Prime Maple Heavies from RJ's." },
  { id: 'rj-maple-economy', source: "RJ's Tree Farms", species: 'Hard Maple', tier: 'Economy/Paint', weightRange: 'All weights', price: '$8.00', priceValue: 8, notes: 'Economy/paint grade.' },
  { id: 'rj-ash-prime', source: "RJ's Tree Farms", species: 'Ash', tier: 'Prime', weightRange: '80-100 oz', price: '$22.00', priceValue: 22, notes: 'RJ Ash.' },
  { id: 'rj-ash-amateur', source: "RJ's Tree Farms", species: 'Ash', tier: 'Amateur', weightRange: '80-100 oz', price: '$16.00', priceValue: 16, notes: 'RJ Ash Amateur.' },
  { id: 'rj-ash-economy', source: "RJ's Tree Farms", species: 'Ash', tier: 'Economy/Paint', weightRange: 'All weights', price: '$7.00', priceValue: 7, notes: 'RJ Ash Economy.' },
  { id: 'rj-birch-prime-lights', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Prime', weightRange: '90 oz and less', price: '$50.00', priceValue: 50, notes: 'RJ Yellow Birch.' },
  { id: 'rj-birch-prime-mixed', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Prime', weightRange: '93.5 oz and less, 50/50', price: '$40.00', priceValue: 40, notes: 'Prime Mixed Yellow Birch.' },
  { id: 'rj-birch-prime-heavy', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Prime', weightRange: '93.6-99 oz', price: '$26.00', priceValue: 26, notes: 'Prime Heavy Yellow Birch.' },
  { id: 'rj-birch-amateur', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Amateur', weightRange: '99 oz and less', price: '$24.00', priceValue: 24, notes: 'RJ Yellow Birch Amateur.' },
  { id: 'rj-birch-heavy', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Heavy Weights', weightRange: 'Over 100 oz', price: '$10.00', priceValue: 10, notes: 'Heavy weights Yellow Birch.' },
  { id: 'rj-birch-economy', source: "RJ's Tree Farms", species: 'Yellow Birch', tier: 'Economy/Paint', weightRange: 'All weights', price: '$8.00', priceValue: 8, notes: 'Economy/paint Yellow Birch.' },
  { id: 'rj-soft-maple-prime', source: "RJ's Tree Farms", species: 'Soft Maple', tier: 'Prime', weightRange: 'All weights', price: '$27.00', priceValue: 27, notes: 'RJ Soft Maple.' },
  { id: 'rj-soft-maple-amateur', source: "RJ's Tree Farms", species: 'Soft Maple', tier: 'Amateur', weightRange: 'All weights', price: '$20.00', priceValue: 20, notes: 'RJ Soft Maple Amateur.' },
  { id: 'rj-soft-maple-economy', source: "RJ's Tree Farms", species: 'Soft Maple', tier: 'Economy/Paint', weightRange: 'All weights', price: '$7.00', priceValue: 7, notes: 'RJ Soft Maple Economy.' },
  { id: 'champeau-maple-pro-weighted', source: 'Champeau', species: 'Maple', tier: 'Pro', weightRange: '93.9 oz and less', price: '$38.64', priceValue: 38.64, notes: 'Trinity Bat Co. Price List Jan. 2026, Vacubright Hard Maple ProGrade.' },
  { id: 'champeau-birch-pro-millrun', source: 'Champeau', species: 'Birch', tier: 'Pro', weightRange: 'Millrun', price: '$21.96', priceValue: 21.96, notes: 'Birch ProGrade Dowelled Minor flat Millrun.' },
  { id: 'champeau-birch-pro-weighted', source: 'Champeau', species: 'Birch', tier: 'Pro', weightRange: '91.9 oz and less', price: '$27.72', priceValue: 27.72, notes: 'Birch ProGrade weighted.' },
  { id: 'champeau-birch-semi-pro', source: 'Champeau', species: 'Birch', tier: 'Semi-Pro', weightRange: 'Millrun', price: '$15.87', priceValue: 15.87, notes: 'Birch Semi-Pro Grade Dowelled Minor flat Millrun.' },
  { id: 'champeau-birch-promo', source: 'Champeau', species: 'Birch', tier: 'Promo', weightRange: 'All listed Promo Birch', price: '$8.00', priceValue: 8, notes: 'Promo Birch price provided by Trinity.' },
  { id: 'champeau-birch-blem', source: 'Champeau', species: 'Birch', tier: 'Blem', weightRange: 'All listed Blem Birch', price: '$13.00', priceValue: 13, notes: 'Blem Birch price provided by Trinity.' },
]

const seedBatModels: BatModelProduct[] = [
  { id: 'boom-stick', name: 'BOOM Stick', category: 'Youth Series', url: 'https://www.trinitybatco.com/boom-stick-1/' },
  { id: 'el-titan-select-youth', name: 'El Titán (Select Youth)', category: 'Youth Series', url: 'https://www.trinitybatco.com/el-titan-select-youth/' },
  { id: 'on-deck-bat', name: 'On-Deck bat', category: 'Training Series', url: 'https://www.trinitybatco.com/on-deck-bat/' },
  { id: 'overload-trainer', name: 'Overload Trainer', category: 'Training Series', url: 'https://www.trinitybatco.com/products/Heavy-Trainer.html' },
  { id: 'platinum-xx', name: 'Platinum XX', category: 'Platinum Series', url: 'https://www.trinitybatco.com/platinum-xx-1/' },
  { id: 'pro-fungo-fs3000', name: 'Pro Fungo - FS3000', category: 'Training Series', url: 'https://www.trinitybatco.com/pro-fungo-fs3000/' },
  { id: 'pro-fungo-fs7000', name: 'Pro Fungo - FS7000', category: 'Training Series', url: 'https://www.trinitybatco.com/pro-fungo-fs7000/' },
  { id: 'pro-model-bz165', name: 'Pro Model BZ165', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-bz165/' },
  { id: 'pro-model-ch7', name: 'Pro Model CH7', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-ch7/' },
  { id: 'pro-model-cs271', name: 'Pro Model CS271', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-cs271/' },
  { id: 'pro-model-gl1', name: 'Pro Model GL1', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-gl1/' },
  { id: 'pro-model-hk47', name: 'Pro Model HK47', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-hk47/' },
  { id: 'pro-model-jw2', name: 'Pro Model JW2', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-jw2/' },
  { id: 'pro-model-pc35', name: 'Pro Model PC35', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-pc35/' },
  { id: 'pro-model-sm13', name: 'Pro Model SM13', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-sm13/' },
  { id: 'pro-model-tb10', name: 'Pro Model TB10', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-tb10/' },
  { id: 'pro-model-tb415', name: 'Pro Model TB415', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-tb415/' },
  { id: 'pro-model-tb43', name: 'Pro Model TB43', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-tb43/' },
  { id: 'pro-model-tb5', name: 'Pro Model TB5', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-tb5/' },
  { id: 'pro-model-tgjr', name: 'Pro Model TGJR', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-tgjr-1/' },
  { id: 'pro-model-vg27', name: 'Pro Model VG27', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-model-vg27/' },
  { id: 'pro-select-jm14', name: 'Pro Select JM14', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-select-jm14/' },
  { id: 'pro-select-mc37', name: 'Pro Select MC37', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-select-mc37/' },
  { id: 'pro-select-ps-27-1', name: 'Pro Select PS 27:1', category: 'Pro Series', url: 'https://www.trinitybatco.com/pro-select-ps-27-1/' },
  { id: 'short-one-hand-trainer', name: 'Short One-Hand Trainer', category: 'Training Series', url: 'https://www.trinitybatco.com/tdb1-short-one-hand-trainer/' },
  { id: 'skinny-bat', name: 'Skinny Bat', category: 'Training Series', url: 'https://www.trinitybatco.com/hand-eye-coordination-bat/' },
  { id: 'torpedo', name: 'TORPEDO', category: 'Pro Series', url: 'https://www.trinitybatco.com/torpedo/' },
  { id: 'towel-bat', name: 'Towel Bat', category: 'Training Series', url: 'https://www.trinitybatco.com/towel-bat/' },
  { id: 'trinity-model-sb08-softball-series', name: 'Trinity Model SB08 (Softball Series)', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-sb08-softball-series/' },
  { id: 'trinity-model-t110', name: 'Trinity Model T110', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t110/' },
  { id: 'trinity-model-t141', name: 'Trinity Model T141', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t141/' },
  { id: 'trinity-model-t161', name: 'Trinity Model T161', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t161/' },
  { id: 'trinity-model-t271', name: 'Trinity Model T271', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t271/' },
  { id: 'trinity-model-t318', name: 'Trinity Model T318', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t318/' },
  { id: 'trinity-model-t331', name: 'Trinity Model T331', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-t331/' },
  { id: 'trinity-model-ti13', name: 'Trinity Model Ti13', category: 'Trinity Series', url: 'https://www.trinitybatco.com/trinity-model-ti13/' },
  { id: 'underload-trainer', name: 'Underload Trainer', category: 'Training Series', url: 'https://www.trinitybatco.com/t1ht-long-one-hand-trainer/' },
  { id: 'youth-pro-model-ps-27-1', name: 'Youth Pro Model PS 27:1', category: 'Youth Series', url: 'https://www.trinitybatco.com/youth-pro-model-ps-27-1/' },
]

const statusLabels: Record<BilletStatus, string> = {
  storage: 'Storage',
  production: 'Production',
}

const availableBilletStatuses: BilletStatus[] = ['storage']
const productionStatusLabels: Record<ProductionStatus, string> = {
  new: 'New',
  waiting_payment: 'Waiting payment',
  ready: 'Ready',
  in_production: 'In production',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Invoice sent',
  paid: 'Paid',
  not_required: 'Checkout order',
}

const seedBillets: Billet[] = [
  {
    id: 'billet-001',
    barcode: 'TBC-BLT-0001',
    species: 'Birch',
    grade: 'Prime',
    mlbEligible: true,
    hasBarrelKnot: 'No',
    source: 'Great Lakes Veneer',
    deliveryDate: '2026-04-10',
    length: standardBilletLength,
    weight: 91,
    moisture: 7.8,
    status: 'storage',
    location: 'Rack A1',
    notes: 'Corey Seager CS271 candidate billet. Prime birch, MLB capable.',
  },
  {
    id: 'billet-002',
    barcode: 'TBC-BLT-0002',
    species: 'Birch',
    grade: 'Select',
    mlbEligible: true,
    hasBarrelKnot: 'No',
    source: 'Great Lakes Veneer',
    deliveryDate: '2026-04-10',
    length: standardBilletLength,
    weight: 82,
    moisture: 8.2,
    status: 'storage',
    location: 'Pallet 24-03',
    notes: 'Needs final grading before release.',
  },
  {
    id: 'billet-003',
    barcode: 'TBC-BLT-0003',
    species: 'Maple',
    grade: 'Pro',
    mlbEligible: false,
    hasBarrelKnot: 'No',
    source: 'Champeau',
    deliveryDate: '2026-04-15',
    length: standardBilletLength,
    weight: 104,
    moisture: 7.1,
    status: 'production',
    location: 'Rack B4',
    notes: 'Reserved for end-loaded 34 in model test.',
  },
]

const seedPlayers: PlayerProfile[] = [
  {
    id: 'player-001',
    profileKind: 'Player',
    playerName: 'Corey Seager',
    bats: [
      {
        id: 'bat-001',
        modelNumber: 'CS271',
        length: 34,
        weight: '32',
        woodTier: 'Prime',
        colorPreferences: 'All black',
        compatibleBilletIds: ['billet-001'],
        notes: 'Uses a 91 oz Prime Birch billet for this Trinity CS271 profile.',
      },
    ],
  },
]

const seedBillingContacts: BillingContact[] = [
  {
    id: 'billing-contact-john-mullin-mets',
    name: 'John Mullin',
    email: 'jmullin@nymets.com',
    phone: '(321) 652-1800',
    company: 'New York Mets',
    relationship: 'Minor league clubhouse manager',
    notes: 'Primary saved payer contact for Mets minor league player bat orders.',
  },
  {
    id: 'billing-contact-brandon-oliver-futures-training-center',
    name: 'Brandon Oliver',
    email: 'brandon@futurestrainingcenter.com',
    phone: '(951) 454-1640',
    company: 'Futures Training Center',
    relationship: 'Training center recipient / local delivery contact',
    notes: 'Primary contact for Futures Training Center training bat orders.',
  },
]

const emptyBillet: Omit<Billet, 'id'> = {
  barcode: '',
  species: 'Maple',
  grade: 'Prime',
  mlbEligible: true,
  hasBarrelKnot: 'No',
  source: "RJ's Tree Farms",
  deliveryDate: '',
  length: standardBilletLength,
  weight: '',
  moisture: defaultMoisture,
  status: 'storage',
  location: 'Receiving',
  notes: '',
}

const initialBuild: CustomBuild = {
  model: 'T141 Balanced',
  length: 33.5,
  targetWeight: 30,
  species: 'Maple',
  grade: 'Prime',
  mlbOnly: true,
}

const emptyBat: Omit<BatVariation, 'id'> = {
  modelNumber: '',
  length: '',
  weight: '',
  woodTier: 'Prime',
  colorPreferences: '',
  compatibleBilletIds: [],
  notes: '',
}

const emptyProducedBat: Omit<ProducedBatRecord, 'id' | 'createdAt'> = {
  modelId: seedBatModels[0].id,
  batType: 'Game',
  customModelName: '',
  sourceModelId: '',
  sourceBilletStatuses: {},
  shopifyProductId: '',
  shopifyVariantId: '',
  length: '',
  weight: '',
  billetWeight: '',
  billetGrade: 'Prime',
  billetIds: [],
  cupped: 'No',
  modifications: '',
}

const emptySalesLine = (): SalesOrderLineDraft => ({
  id: createId('sales-line'),
  isProOrder: false,
  productId: '',
  variantId: '',
  title: '',
  quantity: 1,
  unitPrice: '',
  length: '',
  targetWeight: '',
  handleColor: '',
  barrelColor: '',
  logoColor: '',
  engraving: '',
  cupped: 'No',
  wood: 'Maple',
  notes: '',
})

const emptySalesOrderDraft = (): SalesOrderDraft => ({
  playerName: '',
  playerEmail: '',
  playerPhone: '',
  shippingAddress1: '',
  shippingAddress2: '',
  shippingCity: '',
  shippingProvinceCode: '',
  shippingZip: '',
  shippingCountryCode: 'US',
  billingAddressDifferent: false,
  billingAddress1: '',
  billingAddress2: '',
  billingCity: '',
  billingProvinceCode: '',
  billingZip: '',
  billingCountryCode: 'US',
  billingDifferent: false,
  requiresShipping: true,
  shippingSpeed: 'standard',
  productionTimeline: 'normal',
  billingName: '',
  billingEmail: '',
  billingPhone: '',
  billingCompany: '',
  billingRelationship: '',
  salesRep: '',
  notes: '',
  createDraftOrder: true,
  sendInvoice: false,
  lines: [emptySalesLine()],
})

function normalizeBilletStatus(status: BilletStatus | string | null | undefined): BilletStatus {
  if (status === 'storage' || status === 'production') return status
  if (
    status === 'received' ||
    status === 'measured' ||
    status === 'reserved' ||
    status === 'rejected'
  ) {
    return 'storage'
  }
  if (status === 'in_production' || status === 'consumed') return 'production'
  return 'storage'
}

function getFitScore(billet: Billet, build: CustomBuild) {
  if (billet.status === 'production') return 0
  if (build.species !== 'Any' && billet.species !== build.species) return 0
  if (build.mlbOnly && !billet.mlbEligible) return 0
  if (build.mlbOnly && billet.hasBarrelKnot === 'Yes') return 0
  if (build.grade === 'Prime' && billet.grade !== 'Prime') return 0
  if (build.grade === 'Trophy' && billet.grade !== 'Trophy') return 0
  if (standardBilletLength < build.length + 2.5) return 0

  const targetBilletWeight = build.targetWeight + 18
  const billetWeight = typeof billet.weight === 'number' ? billet.weight : targetBilletWeight
  const weightScore = Math.max(0, 40 - Math.abs(billetWeight - targetBilletWeight) * 4)
  const lengthScore = Math.min(30, (standardBilletLength - build.length) * 5)
  const gradeScore = billet.grade === build.grade ? 15 : 8
  const moistureScore = billet.moisture >= 6.5 && billet.moisture <= 9 ? 15 : 5

  return Math.round(weightScore + lengthScore + gradeScore + moistureScore)
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getBilletDiameter(source: Source) {
  return source === "RJ's Tree Farms" || source === 'Cahan'
    ? rjBilletDiameter
    : standardBilletDiameter
}

function normalizeKnotStatus(value: KnotStatus | boolean | null | undefined) {
  if (value === 'Yes' || value === 'No' || value === 'N/A') return value
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'No'
}

function normalizeBillet(billet: Billet): Billet {
  return {
    ...billet,
    hasBarrelKnot: normalizeKnotStatus(billet.hasBarrelKnot),
    deliveryDate: billet.deliveryDate ?? '',
    status: normalizeBilletStatus(billet.status),
  }
}

function getGradeOptionsForSource(source: Source) {
  return sourceGradeOptions[source]
}

function getDeliveryDateOptionsForSource(
  source: Source,
  billets: Billet[],
  currentDeliveryDate = '',
) {
  const dates = new Set(
    billets
      .filter((billet) => billet.source === source && billet.deliveryDate)
      .map((billet) => billet.deliveryDate),
  )

  if (currentDeliveryDate) dates.add(currentDeliveryDate)

  return Array.from(dates).sort((a, b) => b.localeCompare(a))
}

function normalizeGradeForSource(source: Source, grade: Grade): Grade {
  const validGrades = getGradeOptionsForSource(source)
  return validGrades.includes(grade) ? grade : validGrades[0]
}

function normalizeProducedBatRecord(
  record: Partial<ProducedBatRecord> & Pick<ProducedBatRecord, 'id' | 'modelId'>,
): ProducedBatRecord {
  const sourceBilletStatuses = Object.fromEntries(
    Object.entries(record.sourceBilletStatuses ?? {}).map(([billetId, status]) => [
      billetId,
      normalizeBilletStatus(status),
    ]),
  ) as Record<string, BilletStatus>

  return {
    ...emptyProducedBat,
    ...record,
    batType: record.batType ?? 'Game',
    customModelName: record.customModelName ?? '',
    sourceModelId: record.sourceModelId ?? '',
    sourceBilletStatuses,
    billetWeight: record.billetWeight ?? '',
    billetGrade: record.billetGrade ?? 'Prime',
    cupped: record.cupped ?? 'No',
    modifications: record.modifications ?? '',
    createdAt: record.createdAt ?? new Date().toISOString(),
  }
}

function normalizeProductionStatus(status: ProductionStatus | string | null | undefined): ProductionStatus {
  if (
    status === 'new' ||
    status === 'waiting_payment' ||
    status === 'ready' ||
    status === 'in_production' ||
    status === 'complete' ||
    status === 'cancelled'
  ) {
    return status
  }

  if (status === 'production') return 'in_production'
  if (status === 'done' || status === 'fulfilled') return 'complete'
  return 'new'
}

function normalizeInvoiceStatus(status: InvoiceStatus | string | null | undefined): InvoiceStatus {
  if (status === 'draft' || status === 'sent' || status === 'paid' || status === 'not_required') {
    return status
  }

  return 'draft'
}

function normalizeOrderJob(record: Partial<OrderJob> & Pick<OrderJob, 'id'>): OrderJob {
  const specs = (record.specs ?? {}) as Partial<OrderSpecs>
  const billingDifferent =
    record.billingDifferent === true || String(record.billingDifferent).toLowerCase() === 'true'
  const billingName = record.billingName ?? ''
  const billingEmail = record.billingEmail ?? ''

  return {
    id: record.id,
    origin: record.origin === 'internal_sales' ? 'internal_sales' : 'website',
    intakeId: record.intakeId ?? '',
    shopifyOrderId: record.shopifyOrderId ?? '',
    shopifyOrderName: record.shopifyOrderName ?? '',
    shopifyDraftOrderId: record.shopifyDraftOrderId ?? '',
    shopifyDraftOrderName: record.shopifyDraftOrderName ?? '',
    shopifyDraftInvoiceUrl: record.shopifyDraftInvoiceUrl ?? '',
    lineItemId: record.lineItemId ?? '',
    orderSubmittedAt: record.orderSubmittedAt ?? record.createdAt ?? new Date().toISOString(),
    customerName: record.customerName ?? '',
    customerEmail: record.customerEmail ?? '',
    playerName: record.playerName ?? '',
    playerEmail: record.playerEmail ?? '',
    billingDifferent,
    billingName,
    billingEmail,
    billingPhone: record.billingPhone ?? '',
    billingCompany: record.billingCompany ?? '',
    billingRelationship: record.billingRelationship ?? '',
    productTitle: record.productTitle ?? '',
    variantTitle: record.variantTitle ?? '',
    shopifyProductId: record.shopifyProductId ?? '',
    shopifyVariantId: record.shopifyVariantId ?? '',
    quantity: Number(record.quantity ?? 1),
    financialStatus: record.financialStatus ?? '',
    fulfillmentStatus: record.fulfillmentStatus ?? '',
    invoiceStatus: normalizeInvoiceStatus(record.invoiceStatus),
    productionStatus: normalizeProductionStatus(record.productionStatus),
    assignedBilletId: record.assignedBilletId ?? '',
    linkedProducedBatId: record.linkedProducedBatId ?? '',
    salesRep: record.salesRep ?? '',
    totalPrice: record.totalPrice ?? '',
    currency: record.currency ?? '',
    specs: {
      model: specs.model ?? '',
      length: specs.length ?? '',
      targetWeight: specs.targetWeight ?? '',
      wood: specs.wood ?? '',
      handleColor: specs.handleColor ?? '',
      barrelColor: specs.barrelColor ?? '',
      logoColor: specs.logoColor ?? '',
      engraving: specs.engraving ?? '',
      cupped: specs.cupped ?? '',
      notes: specs.notes ?? '',
    },
    lineItems: record.lineItems ?? [],
    notes: record.notes ?? '',
    internalNotes: record.internalNotes ?? '',
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  }
}

function normalizeBillingContact(
  record: Partial<BillingContact> & Pick<BillingContact, 'id'>,
): BillingContact {
  return {
    id: record.id,
    name: record.name ?? '',
    email: record.email ?? '',
    phone: record.phone ?? '',
    company: record.company ?? '',
    relationship: record.relationship ?? '',
    notes: record.notes ?? '',
  }
}

function mergeOrderSpecs(primary?: OrderSpecs, fallback?: OrderSpecs): OrderSpecs {
  return {
    model: primary?.model || fallback?.model || '',
    length: primary?.length || fallback?.length || '',
    targetWeight: primary?.targetWeight || fallback?.targetWeight || '',
    wood: primary?.wood || fallback?.wood || '',
    handleColor: primary?.handleColor || fallback?.handleColor || '',
    barrelColor: primary?.barrelColor || fallback?.barrelColor || '',
    logoColor: primary?.logoColor || fallback?.logoColor || '',
    engraving: primary?.engraving || fallback?.engraving || '',
    cupped: primary?.cupped || fallback?.cupped || '',
    notes: primary?.notes || fallback?.notes || '',
  }
}

function formatOrderDateTime(value: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function mergeOrderJobs(remote: OrderJob[], local: OrderJob[]) {
  const merged = new Map<string, OrderJob>()

  for (const job of remote) {
    merged.set(job.id, job)
  }

  for (const job of local) {
    const existing = merged.get(job.id)
    merged.set(job.id, {
      ...existing,
      ...job,
      productionStatus: job.productionStatus || existing?.productionStatus || 'new',
      assignedBilletId: job.assignedBilletId || existing?.assignedBilletId || '',
      linkedProducedBatId: job.linkedProducedBatId || existing?.linkedProducedBatId || '',
      orderSubmittedAt: job.orderSubmittedAt || existing?.orderSubmittedAt || job.createdAt,
      internalNotes: job.internalNotes || existing?.internalNotes || '',
      salesRep: job.salesRep || existing?.salesRep || '',
      playerName: job.playerName || existing?.playerName || '',
      playerEmail: job.playerEmail || existing?.playerEmail || '',
      billingDifferent: job.billingDifferent || existing?.billingDifferent || false,
      billingName: job.billingName || existing?.billingName || '',
      billingEmail: job.billingEmail || existing?.billingEmail || '',
      billingPhone: job.billingPhone || existing?.billingPhone || '',
      billingCompany: job.billingCompany || existing?.billingCompany || '',
      billingRelationship: job.billingRelationship || existing?.billingRelationship || '',
      specs: mergeOrderSpecs(job.specs, existing?.specs),
    })
  }

  return Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function createNextBilletDraft(current: Omit<Billet, 'id'>, allBillets: Billet[]) {
  return {
    ...applyBilletGradeRules(current),
    barcode: getNextBilletBarcode(allBillets),
    weight: '' as Billet['weight'],
    notes: '',
    status: 'storage' as BilletStatus,
  }
}

function backupLegacyLocalState() {
  try {
    if (window.localStorage.getItem(legacyLocalStateBackupKey)) return

    const values = Object.fromEntries(
      legacyLocalStateKeys
        .map((key) => [key, window.localStorage.getItem(key)] as const)
        .filter(([, value]) => value !== null),
    )
    if (Object.keys(values).length === 0) return

    window.localStorage.setItem(
      legacyLocalStateBackupKey,
      JSON.stringify({
        backedUpAt: new Date().toISOString(),
        values,
      }),
    )
  } catch {
    // Recovery backups are best-effort and should never block live sync.
  }
}

function mergeRecordsByKey<T>(base: T[], overrides: T[], getKey: (item: T) => string) {
  const merged = new Map<string, T>()

  for (const item of base) {
    merged.set(getKey(item), item)
  }

  for (const item of overrides) {
    merged.set(getKey(item), item)
  }

  return Array.from(merged.values())
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function compareWeight(a: Billet, b: Billet, direction: 'asc' | 'desc') {
  const aWeight = typeof a.weight === 'number' ? a.weight : direction === 'asc' ? Infinity : -Infinity
  const bWeight = typeof b.weight === 'number' ? b.weight : direction === 'asc' ? Infinity : -Infinity
  return direction === 'asc' ? aWeight - bWeight : bWeight - aWeight
}

function compareDelivery(a: Billet, b: Billet, direction: 'asc' | 'desc') {
  const aDate = a.deliveryDate || (direction === 'asc' ? '9999-12-31' : '')
  const bDate = b.deliveryDate || (direction === 'asc' ? '9999-12-31' : '')
  return direction === 'asc' ? compareText(aDate, bDate) : compareText(bDate, aDate)
}

function sortBillets(billets: Billet[], sort: InventorySort) {
  return [...billets].sort((a, b) => {
    switch (sort) {
      case 'barcode_desc':
        return compareText(b.barcode, a.barcode)
      case 'weight_asc':
        return compareWeight(a, b, 'asc')
      case 'weight_desc':
        return compareWeight(a, b, 'desc')
      case 'species_asc':
        return compareText(`${a.species} ${a.grade}`, `${b.species} ${b.grade}`)
      case 'grade_asc':
        return compareText(a.grade, b.grade)
      case 'source_asc':
        return compareText(a.source, b.source)
      case 'delivery_asc':
        return compareDelivery(a, b, 'asc')
      case 'delivery_desc':
        return compareDelivery(a, b, 'desc')
      case 'barcode_asc':
      default:
        return compareText(a.barcode, b.barcode)
    }
  })
}

function getSortDirection(sort: InventorySort, prefix: string): SortDirection | null {
  if (sort === `${prefix}_asc`) return 'asc'
  if (sort === `${prefix}_desc`) return 'desc'
  return null
}

function applyBilletGradeRules(billet: Omit<Billet, 'id'>): Omit<Billet, 'id'> {
  const normalizedGrade = normalizeGradeForSource(billet.source, billet.grade)
  const nextBillet = {
    ...billet,
    grade: normalizedGrade,
  }

  if (autoNonMlbGrades.has(nextBillet.grade)) {
    return {
      ...nextBillet,
      mlbEligible: false,
      hasBarrelKnot: 'N/A',
    }
  }

  return {
    ...nextBillet,
    hasBarrelKnot: nextBillet.hasBarrelKnot === 'N/A' ? 'No' : nextBillet.hasBarrelKnot,
  }
}

function getKnotOptions(grade: Grade): KnotStatus[] {
  return autoNonMlbGrades.has(grade) ? ['N/A', 'No', 'Yes'] : ['No', 'Yes']
}

function parseFirstNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return Number(match[1])
  }

  return null
}

function hasAnyPhrase(text: string, phrases: RegExp[]) {
  return phrases.some((phrase) => phrase.test(text))
}

function detectGrade(text: string) {
  const gradeMatchers: Array<{ grade: Grade; pattern: RegExp }> = [
    { grade: 'Promo', pattern: /\bpromo\b/ },
    { grade: 'Semi-Pro', pattern: /\bsemi[-\s]?pro\b/ },
    { grade: 'Blem', pattern: /\bblem\b/ },
    { grade: 'Pro', pattern: /\bpro\b/ },
    { grade: 'Trophy', pattern: /\btrophy\b/ },
    { grade: 'Choice', pattern: /\bchoice\b/ },
    { grade: 'Select', pattern: /\bselect\b/ },
    { grade: 'Prime', pattern: /\bprime\b/ },
  ]

  return gradeMatchers.find((option) => option.pattern.test(text))?.grade ?? null
}

function getNextBilletBarcode(billets: Billet[]) {
  const highestNumber = billets.reduce((highest, billet) => {
    const match = billet.barcode.match(/(\d{1,})$/)
    if (!match) return highest

    return Math.max(highest, Number(match[1]))
  }, 0)

  return String(highestNumber + 1).padStart(4, '0')
}

function extractBarcode(text: string) {
  const labeledMatch = text.match(
    /\b(?:barcode|serial|serial number|billet)\s*(?:number|#|no\.?|num(?:ber)?)?\s*[:#-]?\s*([A-Z0-9-]{3,})\b/i,
  )
  if (labeledMatch?.[1]) return labeledMatch[1].toUpperCase()

  const trinityMatch = text.match(/\b(?:TBC-)?BLT-[A-Z0-9-]+\b/i)
  if (trinityMatch?.[0]) return trinityMatch[0].toUpperCase()

  const leadingNumberMatch = text.match(/^\s*(\d{3,6})\b/)
  if (leadingNumberMatch?.[1]) return leadingNumberMatch[1].padStart(4, '0')

  return null
}

function extractWeight(text: string, barcode: string | null) {
  const explicitWeight = parseFirstNumber(text, [
    /(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/,
    /weight\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)/,
  ])

  if (explicitWeight !== null) return explicitWeight

  const standaloneNumbers = Array.from(text.matchAll(/\b(\d{2,3}(?:\.\d+)?)\b/g))
    .map((match) => Number(match[1]))
    .filter((value) => value >= 70 && value <= 110)

  if (standaloneNumbers.length === 0) return null
  if (barcode && Number(barcode) === standaloneNumbers[0]) return standaloneNumbers[1] ?? null

  return standaloneNumbers[0]
}

function parseQuickEntry(
  text: string,
  current: Omit<Billet, 'id'>,
  billets: Billet[],
): Omit<Billet, 'id'> {
  const normalized = text.toLowerCase()
  const next = { ...current }

  const species = speciesOptions.find((option) => normalized.includes(option.toLowerCase()))
  const grade = detectGrade(normalized)
  const deliveryDateMatch =
    text.match(/\b(20\d{2}-\d{2}-\d{2})\b/) ??
    text.match(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/)

  if (species) next.species = species
  if (grade) next.grade = grade

  if (normalized.includes('great lakes')) next.source = 'Great Lakes Veneer'
  if (normalized.includes('cahan')) next.source = 'Cahan'
  if (normalized.includes('champeau')) next.source = 'Champeau'
  if (normalized.includes('rj') || normalized.includes("rj's") || normalized.includes('tree farm')) {
    next.source = "RJ's Tree Farms"
  }

  const mlbYesPhrases = [
    /\bmlb\s*(grade|quality|caliber|worthy|ready|capable|eligible|approved)\b/,
    /\bmlb\s*grade\b.*\b(yes|yeah|yep|correct|true)\b/,
    /\b(mlb|big league|pro)\s*(bat\s*)?(wood|billet|blank)\b/,
    /\b(yes|capable|eligible|approved|good enough|works|suitable)\b[^.\n]{0,30}\b(mlb|big league)\b/,
    /\b(mlb|big league)\b[^.\n]{0,30}\b(yes|capable|eligible|approved|good enough|works|suitable)\b/,
  ]
  const mlbNoPhrases = [
    /\b(no|not|non|isn't|is not|not good enough|not suitable)\b[^.\n]{0,30}\b(mlb|big league)\b/,
    /\b(mlb|big league)\b[^.\n]{0,30}\b(no|not|non|isn't|is not|not good enough|not suitable)\b/,
  ]
  const noBarrelKnotPhrases = [
    /\b(no|without|zero|none|doesn't have|does not have|free of|clear of)\b.*\b(barrel\s*)?(knot|not)\b/,
    /\b(knot|not)\b.*\b(no|none|without|free|clear)\b.*\bbarrel\b/,
    /\bnot\s+in\s+the\s+barrel\b/,
    /\bno\s+not\s+in\s+the\s+barrel\b/,
    /\bbarrel\s+(is\s+)?(clean|clear)\b/,
    /\bclean\s+barrel\b/,
  ]
  const yesBarrelKnotPhrases = [
    /\b(has|with|yes|contains|shows|found)\b.*\b(barrel\s*)?(knot|not)\b/,
    /\b(knot|not)\b.*\b(in|inside|on)\b.*\bbarrel\b/,
    /\bbarrel\b.*\b(has|with|contains|shows)\b.*\b(knot|not)\b/,
  ]

  if (hasAnyPhrase(normalized, mlbYesPhrases)) next.mlbEligible = true
  if (hasAnyPhrase(normalized, mlbNoPhrases)) next.mlbEligible = false
  const describesNoBarrelKnot = hasAnyPhrase(normalized, noBarrelKnotPhrases)
  const describesYesBarrelKnot = hasAnyPhrase(normalized, yesBarrelKnotPhrases)

  if (describesYesBarrelKnot && !describesNoBarrelKnot) next.hasBarrelKnot = 'Yes'
  if (describesNoBarrelKnot) next.hasBarrelKnot = 'No'

  const barcode = extractBarcode(text)
  const weight = extractWeight(normalized, barcode)
  const moisture = parseFirstNumber(normalized, [
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*moisture/,
    /moisture\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)/,
  ])
  const location = text.match(/\b(?:rack|pallet|bin|receiving)\s*[A-Z0-9-]*/i)

  next.length = standardBilletLength
  if (weight !== null) next.weight = weight
  if (moisture !== null) next.moisture = moisture
  next.barcode = barcode ?? (current.barcode || getNextBilletBarcode(billets))
  if (location?.[0]) next.location = location[0].trim()
  if (deliveryDateMatch?.[1]) next.deliveryDate = deliveryDateMatch[1]
  next.notes = text.trim()

  return applyBilletGradeRules(next)
}

function getBilletLabel(billet: Billet) {
  return `${billet.barcode} - ${billet.species} ${billet.grade}, ${billet.weight || 'no weight'} oz`
}

function getBatModelName(modelId: string, models: BatModelProduct[]) {
  return models.find((model) => model.id === modelId)?.name ?? modelId
}

function normalizeContactSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function getBillingContactOptionLabel(contact: BillingContact) {
  return [contact.email, contact.phone, contact.relationship]
    .filter(Boolean)
    .join(' · ')
}

function getBillingContactSearchOptions(contact: BillingContact): BillingContactSearchOption[] {
  const label = getBillingContactOptionLabel(contact)
  const value = [contact.name, contact.company].filter(Boolean).join(' · ')

  return [{
    id: contact.id,
    value,
    label,
    contactId: contact.id,
  }]
}

function getBillingContactForSearchValue(
  value: string,
  contacts: BillingContact[],
  searchOptions: BillingContactSearchOption[],
) {
  const normalizedValue = normalizeContactSearchText(value)
  const selectedOption = searchOptions.find(
    (option) => normalizeContactSearchText(option.value) === normalizedValue,
  )

  if (selectedOption) {
    return contacts.find((contact) => contact.id === selectedOption.contactId) ?? null
  }

  const directMatches = contacts.filter((contact) =>
    [
      contact.name,
      contact.email,
      contact.phone,
      contact.company,
      contact.relationship,
    ].some((field) => normalizeContactSearchText(field) === normalizedValue),
  )

  return directMatches.length === 1 ? directMatches[0] : null
}

function isTrainerModel(model: BatModelProduct) {
  return model.category.toLowerCase().includes('training')
}

function createModelId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `custom-${slug || Date.now()}`
}

type SalesOrderApiResponse = {
  ok?: boolean
  message?: string
  invoiceSent?: boolean
  invoiceSendToken?: string
  invoiceSendTokenExpiresAt?: string
  emailNotificationMethod?: 'order_invoice' | 'order_receipt' | 'none'
  draftInvoiceReadyForReview?: boolean
  orderJobs?: OrderJob[]
  draftOrder?: {
    id?: string
    name?: string
    invoiceUrl?: string
    totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } }
    shippingLine?: {
      title?: string
      originalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } }
    }
    lineItems?: {
      nodes?: Array<{
        id?: string
        name?: string
        quantity?: number
        originalUnitPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } }
        customAttributes?: Array<{ key?: string; value?: string }>
      }>
    }
  }
  order?: { name?: string }
  internalNotificationRecipients?: string[]
}

type PublicDraftInvoiceReview = {
  draft: SalesOrderDraft
  draftOrder: NonNullable<SalesOrderApiResponse['draftOrder']>
  invoiceSendToken: string
  invoiceSent: boolean
}

const publicOrderFormPaths = new Set([
  '/order-submission',
  '/sales-order',
  '/trinity-order-form',
  '/trinity-order-from',
])

const internalToolPaths = new Set(['/', '/internal-tool', '/inventory-tool'])

function getCurrentAppPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function isPublicOrderFormRoute() {
  return publicOrderFormPaths.has(getCurrentAppPath())
}

function isInternalToolRoute() {
  return internalToolPaths.has(getCurrentAppPath())
}

function getEmbeddedAuthSearch() {
  const params = new URLSearchParams(window.location.search)
  const forwarded = new URLSearchParams()
  for (const key of [
    'access',
    'embedded',
    'hmac',
    'host',
    'id_token',
    'locale',
    'session',
    'shop',
    'timestamp',
  ]) {
    const value = params.get(key)
    if (value) forwarded.set(key, value)
  }
  const query = forwarded.toString()
  return query ? `?${query}` : ''
}

function getApiPath(path: string) {
  return `${path}${getEmbeddedAuthSearch()}`
}

function getSalesOrderSuccessMessage(
  draft: SalesOrderDraft,
  payload: SalesOrderApiResponse,
) {
  const emailMessage = payload.invoiceSent
    ? payload.emailNotificationMethod === 'order_receipt'
      ? ' and documentation email sent'
      : ' and invoice sent'
    : ''
  const draftReviewMessage =
    draft.createDraftOrder && payload.draftInvoiceReadyForReview
      ? ' and the draft invoice is ready for review'
      : ''
  const notificationNames = payload.internalNotificationRecipients?.length
    ? ' and Jeremy, Stefan, and Keith copied through Shopify'
    : ''

  return `${payload.order?.name ?? payload.draftOrder?.name ?? 'Shopify order'} created${emailMessage}${draftReviewMessage}${notificationNames}.`
}

function hasInvalidSalesOrderDraft(draft: SalesOrderDraft) {
  const payerEmail = draft.billingDifferent ? draft.billingEmail : draft.playerEmail
  const isDirectBillOrder = !draft.billingDifferent
  const hasMissingDirectContact =
    isDirectBillOrder &&
    (!draft.playerPhone.trim() ||
      (draft.requiresShipping &&
        (!draft.shippingAddress1.trim() ||
          !draft.shippingCity.trim() ||
          !draft.shippingProvinceCode.trim() ||
          !draft.shippingZip.trim() ||
          !draft.shippingCountryCode.trim() ||
          (draft.billingAddressDifferent &&
            (!draft.billingAddress1.trim() ||
              !draft.billingCity.trim() ||
              !draft.billingProvinceCode.trim() ||
              !draft.billingZip.trim() ||
              !draft.billingCountryCode.trim())))))
  const hasInvalidLine = draft.lines.some(
    (line) =>
      !line.title.trim() ||
      !line.unitPrice.trim() ||
      !Number.isFinite(Number(line.unitPrice)) ||
      Number(line.unitPrice) < 0 ||
      !line.quantity ||
      line.quantity < 1,
  )

  return !draft.playerName.trim() || !payerEmail.trim() || hasMissingDirectContact || hasInvalidLine
}

function findShopifyCatalogProductByName(
  catalog: ShopifyCatalogProduct[],
  typedModelName: string,
) {
  const normalizedModelName = typedModelName.trim().toLowerCase()
  if (!normalizedModelName) return undefined

  return catalog.find((product) => product.name.trim().toLowerCase() === normalizedModelName)
}

function getTypedBatModelPatch(
  catalog: ShopifyCatalogProduct[],
  typedModelName: string,
  currentLine: SalesOrderLineDraft,
): Partial<SalesOrderLineDraft> {
  const product = findShopifyCatalogProductByName(catalog, typedModelName)
  const firstVariant = product?.variants[0]

  return {
    productId: product?.id ?? '',
    variantId: firstVariant?.id ?? '',
    title: product?.name ?? typedModelName,
    unitPrice: firstVariant?.price ?? currentLine.unitPrice,
  }
}

function cloneSalesOrderDraft(draft: SalesOrderDraft): SalesOrderDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => ({ ...line })),
  }
}

function getPublicDraftPayerName(draft: SalesOrderDraft) {
  if (!draft.billingDifferent) return draft.playerName
  return draft.billingName || draft.billingCompany || draft.playerName
}

function getPublicDraftPayerEmail(draft: SalesOrderDraft) {
  return draft.billingDifferent ? draft.billingEmail : draft.playerEmail
}

function formatSalesOrderMoney(value: number | string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '$0.00'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function getSalesLineTotal(line: SalesOrderLineDraft) {
  const quantity = Number.isFinite(line.quantity) ? line.quantity : 0
  const unitPrice = Number(line.unitPrice)
  return (Number.isFinite(unitPrice) ? unitPrice : 0) * quantity
}

function getSalesOrderTotal(draft: SalesOrderDraft) {
  return draft.lines.reduce((total, line) => total + getSalesLineTotal(line), 0)
}

function getDraftOrderTotal(review: PublicDraftInvoiceReview) {
  const amount = Number(review.draftOrder.totalPriceSet?.shopMoney?.amount)
  return Number.isFinite(amount) ? amount : getSalesOrderTotal(review.draft)
}

function getDraftOrderShippingLine(review: PublicDraftInvoiceReview) {
  const amount = Number(review.draftOrder.shippingLine?.originalPriceSet?.shopMoney?.amount)
  if (!review.draftOrder.shippingLine?.title || !Number.isFinite(amount) || amount < 0) return null

  return {
    title: review.draftOrder.shippingLine?.title || 'Shipping',
    amount,
  }
}

function getDraftOrderRushSurcharge(review: PublicDraftInvoiceReview) {
  const surchargeLines =
    review.draftOrder.lineItems?.nodes?.filter((line) =>
      line.customAttributes?.some(
        (attribute) =>
          attribute.key === 'trinity_surcharge_type' &&
          String(attribute.value ?? '').toLowerCase() === 'rush_production',
      ),
    ) ?? []
  const surchargeAmount = surchargeLines.reduce((total, line) => {
    const unitAmount = Number(line.originalUnitPriceSet?.shopMoney?.amount)
    const quantity = Number(line.quantity || 1)
    return total + (Number.isFinite(unitAmount) && Number.isFinite(quantity) ? unitAmount * quantity : 0)
  }, 0)

  if (surchargeAmount > 0) {
    return {
      title: surchargeLines[0]?.name || 'Rush production surcharge',
      amount: surchargeAmount,
    }
  }

  if (review.draft.productionTimeline !== 'rush') return null

  const fallbackQuantity = review.draft.lines.reduce(
    (total, line) => total + (Number.isFinite(line.quantity) ? line.quantity : 0),
    0,
  )
  const fallbackAmount = fallbackQuantity * rushProductionSurchargeUnitAmount

  return fallbackAmount > 0
    ? {
        title: 'Rush production surcharge',
        amount: fallbackAmount,
      }
    : null
}

function PublicSalesOrderForm() {
  const [salesOrderDraft, setSalesOrderDraft] = useState<SalesOrderDraft>(() =>
    emptySalesOrderDraft(),
  )
  const [shopifyCatalog, setShopifyCatalog] = useState<ShopifyCatalogProduct[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingInvoice, setIsSendingInvoice] = useState(false)
  const [pendingDraftReview, setPendingDraftReview] = useState<PublicDraftInvoiceReview | null>(
    null,
  )
  const [message, setMessage] = useState('')
  const draftReviewShipping = pendingDraftReview
    ? getDraftOrderShippingLine(pendingDraftReview)
    : null
  const draftReviewRushSurcharge = pendingDraftReview
    ? getDraftOrderRushSurcharge(pendingDraftReview)
    : null
  const draftReviewTotal = pendingDraftReview ? getDraftOrderTotal(pendingDraftReview) : 0

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const response = await fetch(getApiPath('/api/catalog'), { cache: 'no-store' })
        if (!response.ok) throw new Error('Catalog unavailable')
        const payload = (await response.json()) as { products?: ShopifyCatalogProduct[] }
        if (!cancelled) {
          setShopifyCatalog(Array.isArray(payload.products) ? payload.products : [])
        }
      } catch {
        if (!cancelled) {
          setMessage('Product lookup is temporarily unavailable. You can still submit pro or manual bat orders.')
          setShopifyCatalog([])
        }
      } finally {
        if (!cancelled) setIsLoadingCatalog(false)
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [])

  function updateSalesDraftField<K extends keyof SalesOrderDraft>(
    key: K,
    value: SalesOrderDraft[K],
  ) {
    setSalesOrderDraft((current) => ({ ...current, [key]: value }))
  }

  function updateSalesLine(id: string, patch: Partial<SalesOrderLineDraft>) {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }))
  }

  function addSalesLine() {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: [...current.lines, emptySalesLine()],
    }))
  }

  function removeSalesLine(id: string) {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: current.lines.length === 1 ? current.lines : current.lines.filter((line) => line.id !== id),
    }))
  }

  async function submitSalesOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (hasInvalidSalesOrderDraft(salesOrderDraft)) {
      setMessage(
        'Add the player, payer email, direct-bill contact/address details, bat model, unit price, and complete each line before submitting.',
      )
      return
    }

    try {
      setIsSubmitting(true)
      setMessage(
        salesOrderDraft.createDraftOrder
          ? 'Creating Shopify draft invoice...'
          : 'Creating Shopify order...',
      )
      const submittedDraft = cloneSalesOrderDraft(salesOrderDraft)
      const response = await fetch(getApiPath('/api/sales-orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(salesOrderDraft),
      })
      const payload = (await response.json()) as SalesOrderApiResponse
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Shopify order failed')

      if (
        submittedDraft.createDraftOrder &&
        payload.draftInvoiceReadyForReview &&
        payload.draftOrder?.id &&
        payload.invoiceSendToken
      ) {
        setPendingDraftReview({
          draft: submittedDraft,
          draftOrder: payload.draftOrder,
          invoiceSendToken: payload.invoiceSendToken,
          invoiceSent: false,
        })
        setMessage(`${payload.draftOrder.name ?? 'Shopify draft invoice'} is ready for review.`)
      } else {
        setPendingDraftReview(null)
        setMessage(getSalesOrderSuccessMessage(submittedDraft, payload))
      }
      setSalesOrderDraft(emptySalesOrderDraft())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit the order.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function sendReviewedDraftInvoice() {
    if (!pendingDraftReview || pendingDraftReview.invoiceSent) return

    try {
      setIsSendingInvoice(true)
      setMessage(`Sending ${pendingDraftReview.draftOrder.name ?? 'draft invoice'}...`)
      const response = await fetch(getApiPath('/api/sales-orders/send-draft-invoice'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceSendToken: pendingDraftReview.invoiceSendToken,
        }),
      })
      const payload = (await response.json()) as SalesOrderApiResponse
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Invoice send failed')

      setPendingDraftReview((current) => (current ? { ...current, invoiceSent: true } : current))
      setMessage(`${pendingDraftReview.draftOrder.name ?? 'Shopify draft invoice'} sent.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the invoice.')
    } finally {
      setIsSendingInvoice(false)
    }
  }

  return (
    <main className="public-order-shell">
      <section className="public-order-heading">
        <p className="eyebrow">Trinity Bat Company</p>
        <h1>Sales order submission</h1>
        <p>
          Submit phone, team, pro, and custom bat orders into the same Shopify and production
          queue used by the internal command center.
        </p>
        <span>{isLoadingCatalog ? 'Loading product catalog...' : 'Live Shopify order intake'}</span>
      </section>

      {message ? <div className="public-order-message">{message}</div> : null}

      {pendingDraftReview ? (
        <section className="panel public-order-panel public-invoice-review">
          <div className="section-heading">
            <p className="eyebrow">Invoice review</p>
            <h2>{pendingDraftReview.draftOrder.name ?? 'Shopify draft invoice'}</h2>
          </div>

          <div className="invoice-review-summary">
            <div>
              <span>Payer</span>
              <strong>{getPublicDraftPayerName(pendingDraftReview.draft)}</strong>
              <p>{getPublicDraftPayerEmail(pendingDraftReview.draft)}</p>
            </div>
            <div>
              <span>Player</span>
              <strong>{pendingDraftReview.draft.playerName}</strong>
              <p>{pendingDraftReview.draft.salesRep || 'Sales rep not recorded'}</p>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatSalesOrderMoney(draftReviewTotal)}</strong>
              <p>
                {pendingDraftReview.draft.lines.length}{' '}
                {pendingDraftReview.draft.lines.length === 1 ? 'line' : 'lines'}
                {draftReviewShipping ? ' + shipping' : ''}
                {draftReviewRushSurcharge ? ' + rush production' : ''}
              </p>
            </div>
            {draftReviewShipping ? (
              <div>
                <span>Shipping</span>
                <strong>{formatSalesOrderMoney(draftReviewShipping.amount)}</strong>
                <p>{draftReviewShipping.title}</p>
              </div>
            ) : null}
            <div>
              <span>Production</span>
              <strong>
                {pendingDraftReview.draft.productionTimeline === 'rush' ? 'Rush' : 'Normal'}
              </strong>
              <p>
                {draftReviewRushSurcharge
                  ? `${formatSalesOrderMoney(draftReviewRushSurcharge.amount)} surcharge`
                  : 'No rush surcharge'}
              </p>
            </div>
          </div>

          <div className="invoice-review-lines">
            {pendingDraftReview.draft.lines.map((line, index) => {
              const specs = [
                line.length ? `${line.length} in` : '',
                line.targetWeight ? `${line.targetWeight} oz` : '',
                line.wood,
                line.cupped === 'Yes' ? 'Cupped' : 'No cup',
              ].filter(Boolean)

              return (
                <article className="invoice-review-line" key={line.id}>
                  <div>
                    <span>Line {index + 1}</span>
                    <strong>{line.title || 'Custom Trinity bat'}</strong>
                    <p>{line.isProOrder ? 'Pro order' : 'Shopify product order'}</p>
                    {specs.length > 0 ? <p>{specs.join(' / ')}</p> : null}
                  </div>
                  <dl>
                    <div>
                      <dt>Qty</dt>
                      <dd>{line.quantity}</dd>
                    </div>
                    <div>
                      <dt>Unit</dt>
                      <dd>{formatSalesOrderMoney(line.unitPrice)}</dd>
                    </div>
                    <div>
                      <dt>Line total</dt>
                      <dd>{formatSalesOrderMoney(getSalesLineTotal(line))}</dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>

          <div className="invoice-review-actions">
            {pendingDraftReview.draftOrder.invoiceUrl ? (
              <a
                className="secondary-button"
                href={pendingDraftReview.draftOrder.invoiceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open invoice preview
              </a>
            ) : null}
            <button
              type="button"
              onClick={sendReviewedDraftInvoice}
              disabled={isSendingInvoice || pendingDraftReview.invoiceSent}
            >
              {pendingDraftReview.invoiceSent
                ? 'Invoice sent'
                : isSendingInvoice
                  ? 'Sending invoice...'
                  : 'Send invoice now'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel public-order-panel">
        <form className="bat-form order-intake-form public-order-form" onSubmit={submitSalesOrder}>
          <datalist id="public-shopify-bat-products">
            {shopifyCatalog.map((product) => (
              <option key={product.id} value={product.name} />
            ))}
          </datalist>

          <div className="section-heading">
            <p className="eyebrow">Order details</p>
            <h2>Create a Shopify invoice order</h2>
          </div>

          <div className={`form-row ${salesOrderDraft.billingDifferent ? 'single-field-row' : ''}`}>
            <label>
              Player name
              <input
                value={salesOrderDraft.playerName}
                placeholder="Example: Jordan Smith"
                onChange={(event) => updateSalesDraftField('playerName', event.target.value)}
              />
            </label>
            {!salesOrderDraft.billingDifferent ? (
              <label>
                Player email
                <input
                  type="email"
                  value={salesOrderDraft.playerEmail}
                  placeholder="player@example.com"
                  onChange={(event) => updateSalesDraftField('playerEmail', event.target.value)}
                />
              </label>
            ) : null}
          </div>

          <label className="checkbox-row billing-toggle">
            <input
              type="checkbox"
              checked={salesOrderDraft.billingDifferent}
              onChange={(event) => {
                const billingDifferent = event.target.checked
                setSalesOrderDraft((current) => ({
                  ...current,
                  billingDifferent,
                  playerEmail: billingDifferent ? '' : current.playerEmail,
                  playerPhone: billingDifferent ? '' : current.playerPhone,
                  shippingAddress1: billingDifferent ? '' : current.shippingAddress1,
                  shippingAddress2: billingDifferent ? '' : current.shippingAddress2,
                  shippingCity: billingDifferent ? '' : current.shippingCity,
                  shippingProvinceCode: billingDifferent ? '' : current.shippingProvinceCode,
                  shippingZip: billingDifferent ? '' : current.shippingZip,
                  shippingCountryCode: billingDifferent ? 'US' : current.shippingCountryCode,
                  billingAddressDifferent: billingDifferent
                    ? false
                    : current.billingAddressDifferent,
                  billingAddress1: billingDifferent ? '' : current.billingAddress1,
                  billingAddress2: billingDifferent ? '' : current.billingAddress2,
                  billingCity: billingDifferent ? '' : current.billingCity,
                  billingProvinceCode: billingDifferent ? '' : current.billingProvinceCode,
                  billingZip: billingDifferent ? '' : current.billingZip,
                  billingCountryCode: billingDifferent ? 'US' : current.billingCountryCode,
                }))
              }}
            />
            <span>Bill a team, agent, or other payer</span>
          </label>

          <label className="checkbox-row billing-toggle">
            <input
              type="checkbox"
              checked={!salesOrderDraft.requiresShipping}
              onChange={(event) => {
                const requiresShipping = !event.target.checked
                setSalesOrderDraft((current) => ({
                  ...current,
                  requiresShipping,
                  shippingSpeed: requiresShipping ? current.shippingSpeed : 'standard',
                  shippingAddress1: requiresShipping ? current.shippingAddress1 : '',
                  shippingAddress2: requiresShipping ? current.shippingAddress2 : '',
                  shippingCity: requiresShipping ? current.shippingCity : '',
                  shippingProvinceCode: requiresShipping ? current.shippingProvinceCode : '',
                  shippingZip: requiresShipping ? current.shippingZip : '',
                  shippingCountryCode: requiresShipping ? current.shippingCountryCode : 'US',
                  billingAddressDifferent: requiresShipping
                    ? current.billingAddressDifferent
                    : false,
                  billingAddress1: requiresShipping ? current.billingAddress1 : '',
                  billingAddress2: requiresShipping ? current.billingAddress2 : '',
                  billingCity: requiresShipping ? current.billingCity : '',
                  billingProvinceCode: requiresShipping ? current.billingProvinceCode : '',
                  billingZip: requiresShipping ? current.billingZip : '',
                  billingCountryCode: requiresShipping ? current.billingCountryCode : 'US',
                }))
              }}
            />
            <span>Local delivery / no shipping required</span>
          </label>

          <div className="form-row fulfillment-options-row">
            <label>
              Shipping speed
              <select
                value={salesOrderDraft.shippingSpeed}
                disabled={!salesOrderDraft.requiresShipping}
                onChange={(event) =>
                  updateSalesDraftField(
                    'shippingSpeed',
                    event.target.value as ShippingSpeedOption,
                  )
                }
              >
                {shippingSpeedOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Production timeline
              <select
                value={salesOrderDraft.productionTimeline}
                onChange={(event) =>
                  updateSalesDraftField(
                    'productionTimeline',
                    event.target.value as ProductionTimelineOption,
                  )
                }
              >
                {productionTimelineOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {salesOrderDraft.billingDifferent ? (
            <div className="billing-panel">
              <div className="form-row">
                <label>
                  Payer name
                  <input
                    value={salesOrderDraft.billingName}
                    placeholder="Team, agent, agency, or payer name"
                    onChange={(event) => updateSalesDraftField('billingName', event.target.value)}
                  />
                </label>
                <label>
                  Payer email
                  <input
                    type="email"
                    value={salesOrderDraft.billingEmail}
                    placeholder="billing@example.com"
                    onChange={(event) => updateSalesDraftField('billingEmail', event.target.value)}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Payer phone
                  <input
                    type="tel"
                    value={salesOrderDraft.billingPhone}
                    placeholder="Example: (321) 652-1800"
                    onChange={(event) => updateSalesDraftField('billingPhone', event.target.value)}
                  />
                </label>
                <label>
                  Team or agency
                  <input
                    value={salesOrderDraft.billingCompany}
                    placeholder="Example: New York Mets"
                    onChange={(event) =>
                      updateSalesDraftField('billingCompany', event.target.value)
                    }
                  />
                </label>
              </div>

              <label>
                Billing relationship
                <input
                  value={salesOrderDraft.billingRelationship}
                  placeholder="Example: Minor league clubhouse manager"
                  onChange={(event) =>
                    updateSalesDraftField('billingRelationship', event.target.value)
                  }
                />
              </label>
            </div>
          ) : (
            <div className="billing-panel">
              <div className="form-row">
                <label>
                  Player phone
                  <input
                    type="tel"
                    value={salesOrderDraft.playerPhone}
                    placeholder="Example: (321) 652-1800"
                    onChange={(event) => updateSalesDraftField('playerPhone', event.target.value)}
                  />
                </label>
                <label>
                  Shipping country code
                  <input
                    value={salesOrderDraft.shippingCountryCode}
                    placeholder="US"
                    onChange={(event) =>
                      updateSalesDraftField(
                        'shippingCountryCode',
                        event.target.value.toUpperCase(),
                      )
                    }
                  />
                </label>
              </div>

              {salesOrderDraft.requiresShipping ? (
                <>
                  <div className="form-row">
                    <label>
                      Shipping address
                      <input
                        value={salesOrderDraft.shippingAddress1}
                        placeholder="Street address"
                        onChange={(event) =>
                          updateSalesDraftField('shippingAddress1', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Apartment, suite, etc.
                      <input
                        value={salesOrderDraft.shippingAddress2}
                        placeholder="Optional"
                        onChange={(event) =>
                          updateSalesDraftField('shippingAddress2', event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Shipping city
                      <input
                        value={salesOrderDraft.shippingCity}
                        placeholder="City"
                        onChange={(event) =>
                          updateSalesDraftField('shippingCity', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Shipping state
                      <input
                        value={salesOrderDraft.shippingProvinceCode}
                        placeholder="Example: CO"
                        onChange={(event) =>
                          updateSalesDraftField(
                            'shippingProvinceCode',
                            event.target.value.toUpperCase(),
                          )
                        }
                      />
                    </label>
                  </div>

                  <label>
                    Shipping ZIP
                    <input
                      value={salesOrderDraft.shippingZip}
                      placeholder="ZIP code"
                      onChange={(event) => updateSalesDraftField('shippingZip', event.target.value)}
                    />
                  </label>

                  <label className="checkbox-row billing-toggle">
                    <input
                      type="checkbox"
                      checked={salesOrderDraft.billingAddressDifferent}
                      onChange={(event) =>
                        updateSalesDraftField('billingAddressDifferent', event.target.checked)
                      }
                    />
                    <span>Billing address is different from shipping address</span>
                  </label>

                  {salesOrderDraft.billingAddressDifferent ? (
                    <>
                      <div className="form-row">
                        <label>
                          Billing country code
                          <input
                            value={salesOrderDraft.billingCountryCode}
                            placeholder="US"
                            onChange={(event) =>
                              updateSalesDraftField(
                                'billingCountryCode',
                                event.target.value.toUpperCase(),
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Billing address
                          <input
                            value={salesOrderDraft.billingAddress1}
                            placeholder="Street address"
                            onChange={(event) =>
                              updateSalesDraftField('billingAddress1', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Apartment, suite, etc.
                          <input
                            value={salesOrderDraft.billingAddress2}
                            placeholder="Optional"
                            onChange={(event) =>
                              updateSalesDraftField('billingAddress2', event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Billing city
                          <input
                            value={salesOrderDraft.billingCity}
                            placeholder="City"
                            onChange={(event) =>
                              updateSalesDraftField('billingCity', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Billing state
                          <input
                            value={salesOrderDraft.billingProvinceCode}
                            placeholder="Example: CO"
                            onChange={(event) =>
                              updateSalesDraftField(
                                'billingProvinceCode',
                                event.target.value.toUpperCase(),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Billing ZIP
                        <input
                          value={salesOrderDraft.billingZip}
                          placeholder="ZIP code"
                          onChange={(event) =>
                            updateSalesDraftField('billingZip', event.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          )}

          <label>
            Sales rep
            <input
              value={salesOrderDraft.salesRep}
              placeholder="Example: Matt"
              onChange={(event) => updateSalesDraftField('salesRep', event.target.value)}
            />
          </label>

          <div className="sales-line-list">
            {salesOrderDraft.lines.map((line, index) => {
              const lineProduct = shopifyCatalog.find((product) => product.id === line.productId)
              const lineVariant = lineProduct?.variants.find(
                (variant) => variant.id === line.variantId,
              )
              const productInputValue = line.isProOrder
                ? line.title
                : (lineProduct?.name ?? line.title)
              const lineTitle = line.isProOrder
                ? line.title || 'Pro custom bat'
                : lineProduct?.name || line.title || 'Custom bat'

              return (
                <article className="sales-line-card" key={line.id}>
                  <div className="split-heading">
                    <div>
                      <span className="profile-type-pill">Line {index + 1}</span>
                      <h3>{lineTitle}</h3>
                    </div>
                    {salesOrderDraft.lines.length > 1 ? (
                      <button
                        type="button"
                        className="secondary-button destructive-button compact-button"
                        onClick={() => removeSalesLine(line.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <label className="checkbox-row pro-order-toggle">
                    <input
                      type="checkbox"
                      checked={line.isProOrder}
                      onChange={(event) => {
                        const isProOrder = event.target.checked
                        if (isProOrder) {
                          updateSalesLine(line.id, {
                            isProOrder,
                            productId: '',
                            variantId: '',
                            title: line.title || lineProduct?.name || '',
                          })
                          return
                        }

                        updateSalesLine(line.id, {
                          isProOrder,
                          ...getTypedBatModelPatch(shopifyCatalog, line.title, line),
                        })
                      }}
                    />
                    <span>Pro order</span>
                  </label>

                  <div className={`form-row ${line.isProOrder ? 'single-field-row' : ''}`}>
                    <label>
                      Bat model
                      <input
                        list={line.isProOrder ? undefined : 'public-shopify-bat-products'}
                        value={productInputValue}
                        placeholder={
                          line.isProOrder
                            ? 'Example: T141 pro custom'
                            : 'Type a model or choose a Shopify product'
                        }
                        onChange={(event) => {
                          const typedProduct = event.target.value
                          if (line.isProOrder) {
                            updateSalesLine(line.id, {
                              productId: '',
                              variantId: '',
                              title: typedProduct,
                            })
                            return
                          }

                          updateSalesLine(
                            line.id,
                            getTypedBatModelPatch(shopifyCatalog, typedProduct, line),
                          )
                        }}
                      />
                    </label>
                    {!line.isProOrder ? (
                      <label>
                        Variant
                        <select
                          value={line.variantId}
                          disabled={!lineProduct}
                          onChange={(event) => {
                            const variant = lineProduct?.variants.find(
                              (item) => item.id === event.target.value,
                            )
                            updateSalesLine(line.id, {
                              variantId: event.target.value,
                              unitPrice: variant?.price ?? line.unitPrice,
                            })
                          }}
                        >
                          <option value="">
                            {lineProduct
                              ? 'Select variant'
                              : line.title.trim()
                                ? 'Manual model, no Shopify variant'
                                : 'Optional Shopify variant'}
                          </option>
                          {lineProduct?.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.title}
                              {variant.sku ? ` / ${variant.sku}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div className="form-row">
                    <label>
                      Unit price
                      <input
                        inputMode="decimal"
                        value={line.unitPrice}
                        placeholder={lineVariant ? 'Adjust Shopify price' : 'Example: 189.00'}
                        onChange={(event) =>
                          updateSalesLine(line.id, { unitPrice: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(event) =>
                          updateSalesLine(line.id, { quantity: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Length
                      <input
                        value={line.length}
                        placeholder="Example: 34"
                        onChange={(event) =>
                          updateSalesLine(line.id, { length: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Weight
                      <input
                        value={line.targetWeight}
                        placeholder="Example: 31.5"
                        onChange={(event) =>
                          updateSalesLine(line.id, { targetWeight: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Handle color
                      <select
                        value={line.handleColor}
                        onChange={(event) =>
                          updateSalesLine(line.id, { handleColor: event.target.value })
                        }
                      >
                        <option value="">Select handle color</option>
                        {customizerColorOptions.map((color) => (
                          <option key={color}>{color}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Barrel color
                      <select
                        value={line.barrelColor}
                        onChange={(event) =>
                          updateSalesLine(line.id, { barrelColor: event.target.value })
                        }
                      >
                        <option value="">Select barrel color</option>
                        {customizerColorOptions.map((color) => (
                          <option key={color}>{color}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Logo color
                      <select
                        value={line.logoColor}
                        onChange={(event) =>
                          updateSalesLine(line.id, { logoColor: event.target.value })
                        }
                      >
                        <option value="">Select logo color</option>
                        {customizerColorOptions.map((color) => (
                          <option key={color}>{color}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Wood species
                      <select
                        value={line.wood}
                        onChange={(event) =>
                          updateSalesLine(line.id, {
                            wood: event.target.value as SalesOrderLineDraft['wood'],
                          })
                        }
                      >
                        {speciesOptions.map((species) => (
                          <option key={species}>{species}</option>
                        ))}
                        <option>Other</option>
                      </select>
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Cup
                      <select
                        value={line.cupped}
                        onChange={(event) =>
                          updateSalesLine(line.id, {
                            cupped: event.target.value as SalesOrderLineDraft['cupped'],
                          })
                        }
                      >
                        {manualCupOptions.map((cup) => (
                          <option key={cup} value={cup}>
                            {cup === 'Yes' ? 'Cup' : 'No cup'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Engraving
                      <input
                        value={line.engraving}
                        placeholder="Player name, signature, or custom text"
                        onChange={(event) =>
                          updateSalesLine(line.id, { engraving: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </article>
              )
            })}
          </div>

          <button type="button" className="secondary-button" onClick={addSalesLine}>
            Add another line
          </button>

          <label className="notes-field">
            Internal order notes
            <textarea
              value={salesOrderDraft.notes}
              placeholder="Payment terms, delivery promise, team contact, or packaging notes"
              onChange={(event) => updateSalesDraftField('notes', event.target.value)}
            />
          </label>

          <label className="checkbox-row invoice-toggle">
            <input
              type="checkbox"
              checked={salesOrderDraft.createDraftOrder}
              onChange={(event) => {
                const createDraftOrder = event.target.checked
                setSalesOrderDraft((current) => ({
                  ...current,
                  createDraftOrder,
                  sendInvoice: createDraftOrder ? false : current.sendInvoice,
                }))
              }}
            />
            <span>Create Shopify draft invoice for manual review</span>
          </label>

          {!salesOrderDraft.createDraftOrder ? (
            <label className="checkbox-row invoice-toggle">
              <input
                type="checkbox"
                checked={salesOrderDraft.sendInvoice}
                onChange={(event) => updateSalesDraftField('sendInvoice', event.target.checked)}
              />
              <span>Send Shopify invoice/documentation after order creation</span>
            </label>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? salesOrderDraft.createDraftOrder
                ? 'Creating draft...'
                : 'Creating order...'
              : salesOrderDraft.createDraftOrder
                ? 'Create Shopify draft invoice'
                : 'Create Shopify order'}
          </button>
        </form>
      </section>
    </main>
  )
}

function InternalApp() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('inventory')
  const [billets, setBillets] = useState<Billet[]>(() => {
    const stored = window.localStorage.getItem(billetStorageKey)
    const parsed = stored ? (JSON.parse(stored) as Billet[]) : seedBillets
    return parsed.map((billet) => normalizeBillet(billet))
  })
  const [players, setPlayers] = useState<PlayerProfile[]>(() => {
    const stored = window.localStorage.getItem(playerStorageKey)
    return stored ? (JSON.parse(stored) as PlayerProfile[]) : seedPlayers
  })
  const [producedBats, setProducedBats] = useState<ProducedBatRecord[]>(() => {
    const stored = window.localStorage.getItem(producedBatStorageKey)
    return stored
      ? (JSON.parse(stored) as ProducedBatRecord[]).map((record) =>
          normalizeProducedBatRecord(record),
        )
      : []
  })
  const [customBatModels, setCustomBatModels] = useState<BatModelProduct[]>(() => {
    const stored = window.localStorage.getItem(customBatModelStorageKey)
    return stored ? (JSON.parse(stored) as BatModelProduct[]) : []
  })
  const [orderJobs, setOrderJobs] = useState<OrderJob[]>(() => {
    const stored = window.localStorage.getItem(orderJobStorageKey)
    return stored ? (JSON.parse(stored) as OrderJob[]).map((job) => normalizeOrderJob(job)) : []
  })
  const [billingContacts, setBillingContacts] = useState<BillingContact[]>(() => {
    const stored = window.localStorage.getItem(billingContactStorageKey)
    const parsed = stored ? (JSON.parse(stored) as BillingContact[]) : []
    return mergeRecordsByKey(seedBillingContacts, parsed, (contact) => contact.id).map((contact) =>
      normalizeBillingContact(contact),
    )
  })
  const [draft, setDraft] = useState(emptyBillet)
  const [salesOrderDraft, setSalesOrderDraft] = useState<SalesOrderDraft>(() =>
    emptySalesOrderDraft(),
  )
  const [orderQuery, setOrderQuery] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | ProductionStatus>('all')
  const [orderActionMessage, setOrderActionMessage] = useState('')
  const [isCreatingDraftOrder, setIsCreatingDraftOrder] = useState(false)
  const [isImportingOrders, setIsImportingOrders] = useState(false)
  const [isRegisteringWebhooks, setIsRegisteringWebhooks] = useState(false)
  const [newDeliveryDate, setNewDeliveryDate] = useState('')
  const [quickEntry, setQuickEntry] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [query, setQuery] = useState('')
  const [speciesFilters, setSpeciesFilters] = useState<Species[]>([])
  const [sourceFilters, setSourceFilters] = useState<Source[]>([])
  const [gradeFilters, setGradeFilters] = useState<Grade[]>([])
  const [mlbFilters, setMlbFilters] = useState<InventoryMlbFilter[]>([])
  const [knotFilters, setKnotFilters] = useState<KnotStatus[]>([])
  const [deliveryDateFilters, setDeliveryDateFilters] = useState<string[]>([])
  const [inventorySort, setInventorySort] = useState<InventorySort>('barcode_asc')
  const [minWeightFilter, setMinWeightFilter] = useState('')
  const [maxWeightFilter, setMaxWeightFilter] = useState('')
  const [build, setBuild] = useState(initialBuild)
  const [profileKindDraft, setProfileKindDraft] = useState<ProfileKind>('Player')
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [batDraft, setBatDraft] = useState(emptyBat)
  const [variantTargetProfileId, setVariantTargetProfileId] = useState<string | null>(null)
  const [playerQuery, setPlayerQuery] = useState('')
  const [scannerMessage, setScannerMessage] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [producedBatDraft, setProducedBatDraft] = useState(emptyProducedBat)
  const [costQuery, setCostQuery] = useState('')
  const [costSourceFilter, setCostSourceFilter] = useState<'all' | Source>('all')
  const [costSpeciesFilter, setCostSpeciesFilter] = useState<'all' | Species>('all')
  const [shopifyCatalog, setShopifyCatalog] = useState<ShopifyCatalogProduct[]>([])
  const [backendStatus, setBackendStatus] = useState<
    'connecting' | 'connected' | 'offline' | 'unauthorized'
  >(
    'connecting',
  )
  const [isLoadingRemoteState, setIsLoadingRemoteState] = useState(true)
  const [syncMessage, setSyncMessage] = useState('Connecting to Shopify backend...')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const hasLoadedRemoteState = useRef(false)
  const skipNextRemoteSync = useRef(false)
  const hasPendingLocalSync = useRef(false)

  useEffect(() => {
    backupLegacyLocalState()
  }, [])

  useEffect(() => {
    window.localStorage.setItem(billetStorageKey, JSON.stringify(billets))
  }, [billets])

  useEffect(() => {
    window.localStorage.setItem(playerStorageKey, JSON.stringify(players))
  }, [players])

  useEffect(() => {
    window.localStorage.setItem(producedBatStorageKey, JSON.stringify(producedBats))
  }, [producedBats])

  useEffect(() => {
    window.localStorage.setItem(customBatModelStorageKey, JSON.stringify(customBatModels))
  }, [customBatModels])

  useEffect(() => {
    window.localStorage.setItem(orderJobStorageKey, JSON.stringify(orderJobs))
  }, [orderJobs])

  useEffect(() => {
    window.localStorage.setItem(billingContactStorageKey, JSON.stringify(billingContacts))
  }, [billingContacts])

  const syncRemoteState = useEffectEvent(async () => {
    try {
      setSyncMessage('Syncing to Shopify...')
      const response = await fetch(getApiPath('/api/state'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          billets,
          players,
          producedBats,
          customBatModels,
          orderJobs,
          billingContacts,
        } satisfies RemoteState),
      })
      if (!response.ok) throw new Error('Sync failed')

      const payload = (await response.json()) as { syncedAt?: string }
      const syncedAt = payload.syncedAt
        ? new Date(payload.syncedAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'just now'

      hasPendingLocalSync.current = false
      if (backendStatus !== 'connected') {
        skipNextRemoteSync.current = true
      }
      setBackendStatus('connected')
      setSyncMessage(`Shopify sync complete at ${syncedAt}.`)
      return true
    } catch {
      setBackendStatus('offline')
      setSyncMessage(
        'Shopify sync failed. Keep this tab open; editing is paused until live sync recovers.',
      )
      return false
    }
  })

  const loadRemoteState = useEffectEvent(async (options?: { quiet?: boolean }) => {
    try {
      const response = await fetch(getApiPath('/api/state'), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store',
        },
      })
      if (response.status === 401) {
        setBackendStatus('unauthorized')
        setSyncMessage('Use the secure internal access link or launch from Shopify admin.')
        hasLoadedRemoteState.current = true
        setIsLoadingRemoteState(false)
        return false
      }
      if (!response.ok) throw new Error('Shopify sync is not ready on this host.')
      const remote = (await response.json()) as Partial<RemoteState> & { ok?: boolean }

      const remoteBillets = Array.isArray(remote.billets)
        ? remote.billets.map((billet) => normalizeBillet(billet))
        : []
      const remotePlayers = Array.isArray(remote.players) ? remote.players : []
      const remoteProducedBats = Array.isArray(remote.producedBats)
        ? remote.producedBats.map((record) => normalizeProducedBatRecord(record))
        : []
      const remoteCustomBatModels = Array.isArray(remote.customBatModels)
        ? remote.customBatModels
        : []
      const remoteOrderJobs = Array.isArray(remote.orderJobs)
        ? remote.orderJobs.map((job) => normalizeOrderJob(job))
        : []
      const remoteBillingContacts = Array.isArray(remote.billingContacts)
        ? remote.billingContacts.map((contact) => normalizeBillingContact(contact))
        : []

      skipNextRemoteSync.current = true
      setBillets(remoteBillets)
      setPlayers(remotePlayers)
      setProducedBats(remoteProducedBats)
      setCustomBatModels(remoteCustomBatModels)
      setOrderJobs(remoteOrderJobs)
      setBillingContacts(
        mergeRecordsByKey(
          seedBillingContacts,
          remoteBillingContacts,
          (contact) => contact.id,
        ),
      )

      setBackendStatus('connected')
      if (!options?.quiet) {
        setSyncMessage('Connected to Shopify. Live records are the source of truth.')
      }
      hasLoadedRemoteState.current = true
      setIsLoadingRemoteState(false)
      return true
    } catch {
      setBackendStatus('offline')
      setSyncMessage(
        'Live Shopify sync is unavailable. Editing is paused so local-only data cannot be created.',
      )
      hasLoadedRemoteState.current = true
      setIsLoadingRemoteState(false)
      return false
    }
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRemoteState()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (backendStatus !== 'offline') return

    const retry = window.setInterval(() => {
      if (hasPendingLocalSync.current) {
        void syncRemoteState()
      } else {
        void loadRemoteState()
      }
    }, 10000)

    return () => window.clearInterval(retry)
  }, [backendStatus])

  useEffect(() => {
    if (backendStatus !== 'connected') return

    const refresh = window.setInterval(() => {
      if (!hasPendingLocalSync.current) void loadRemoteState({ quiet: true })
    }, 30000)

    return () => window.clearInterval(refresh)
  }, [backendStatus])

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const response = await fetch(getApiPath('/api/catalog'))
        if (!response.ok) throw new Error('Catalog unavailable')
        const payload = (await response.json()) as {
          products?: ShopifyCatalogProduct[]
        }
        if (!cancelled && Array.isArray(payload.products)) {
          setShopifyCatalog(payload.products)
        }
      } catch {
        if (!cancelled) setShopifyCatalog([])
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [backendStatus])

  useEffect(() => {
    if (!hasLoadedRemoteState.current || backendStatus !== 'connected') return
    if (skipNextRemoteSync.current) {
      skipNextRemoteSync.current = false
      return
    }

    hasPendingLocalSync.current = true
    const timeout = window.setTimeout(async () => {
      void syncRemoteState()
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [backendStatus, billets, players, producedBats, customBatModels, orderJobs, billingContacts])

  const deliveryDateOptions = Array.from(
    new Set(billets.map((billet) => billet.deliveryDate).filter(Boolean)),
  ).sort((a, b) => b.localeCompare(a))

  function toggleSelectedValue<T extends string>(current: T[], value: T) {
    return current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
  }

  function clearInventoryFilters() {
    setQuery('')
    setSpeciesFilters([])
    setSourceFilters([])
    setGradeFilters([])
    setMlbFilters([])
    setKnotFilters([])
    setDeliveryDateFilters([])
    setMinWeightFilter('')
    setMaxWeightFilter('')
    setInventorySort('barcode_asc')
  }

  const filteredBillets = sortBillets(billets, inventorySort).filter((billet) => {
    const searchable = [
      billet.barcode,
      billet.species,
      billet.grade,
      billet.mlbEligible ? 'MLB eligible' : 'not MLB eligible',
      billet.hasBarrelKnot === 'Yes'
        ? 'barrel knot'
        : billet.hasBarrelKnot === 'N/A'
          ? 'barrel knot not applicable'
          : 'no barrel knot',
      billet.source,
      billet.deliveryDate,
      billet.location,
      billet.notes,
    ]
      .join(' ')
      .toLowerCase()
    const matchesQuery = searchable.includes(query.toLowerCase())
    const matchesSpecies = speciesFilters.length === 0 || speciesFilters.includes(billet.species)
    const matchesSource = sourceFilters.length === 0 || sourceFilters.includes(billet.source)
    const matchesGrade = gradeFilters.length === 0 || gradeFilters.includes(billet.grade)
    const matchesMlb =
      mlbFilters.length === 0 ||
      mlbFilters.some((filter) => (filter === 'yes' ? billet.mlbEligible : !billet.mlbEligible))
    const matchesKnot = knotFilters.length === 0 || knotFilters.includes(billet.hasBarrelKnot)
    const matchesDelivery =
      deliveryDateFilters.length === 0 || deliveryDateFilters.includes(billet.deliveryDate)
    const matchesVisibility = availableBilletStatuses.includes(billet.status)
    const minWeight = Number(minWeightFilter)
    const maxWeight = Number(maxWeightFilter)
    const billetWeight = typeof billet.weight === 'number' ? billet.weight : null
    const matchesMinWeight =
      !minWeightFilter || (billetWeight !== null && billetWeight >= minWeight)
    const matchesMaxWeight =
      !maxWeightFilter || (billetWeight !== null && billetWeight <= maxWeight)

    return (
      matchesQuery &&
      matchesSpecies &&
      matchesSource &&
      matchesGrade &&
      matchesMlb &&
      matchesKnot &&
      matchesDelivery &&
      matchesVisibility &&
      matchesMinWeight &&
      matchesMaxWeight
    )
  })
  const filteredBilletCount = filteredBillets.length

  function toggleInventorySort(prefix: 'barcode' | 'weight' | 'species' | 'grade' | 'source' | 'delivery') {
    setInventorySort((current) => {
      const direction = getSortDirection(current, prefix)
      return `${prefix}_${direction === 'asc' ? 'desc' : 'asc'}` as InventorySort
    })
  }

  function sortIndicator(prefix: 'barcode' | 'weight' | 'species' | 'grade' | 'source' | 'delivery') {
    const direction = getSortDirection(inventorySort, prefix)
    if (direction === 'asc') return '↑'
    if (direction === 'desc') return '↓'
    return ''
  }

  const filteredPlayers = players.filter((player) => {
    const searchable = [
      player.playerName,
      player.profileKind,
      ...player.bats.flatMap((bat) => [
        bat.modelNumber,
        bat.weight,
        bat.woodTier,
        bat.colorPreferences,
        bat.notes,
        ...bat.compatibleBilletIds.map(
          (id) => billets.find((billet) => billet.id === id)?.barcode ?? id,
        ),
      ]),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(playerQuery.toLowerCase())
  })

  const billingContactSearchOptions = billingContacts.flatMap((contact) =>
    getBillingContactSearchOptions(contact),
  )

  const shopifyBatModels: BatModelProduct[] = shopifyCatalog.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    url: product.url,
    source: 'shopify',
    status: product.status,
    handle: product.handle,
    tags: product.tags,
    variantCount: product.variants.length,
    inventoryOnHand: product.variants.reduce(
      (total, variant) => total + variant.inventoryQuantity,
      0,
    ),
  }))

  const batModelMap = new Map<string, BatModelProduct>()
  ;[...seedBatModels, ...shopifyBatModels, ...customBatModels].forEach((model) => {
    const key = model.source === 'shopify' ? model.id : model.name.toLowerCase()
    if (!batModelMap.has(key) || model.source === 'shopify' || model.source === 'custom') {
      batModelMap.set(key, model)
    }
  })
  const allBatModels = Array.from(batModelMap.values())
  const trainerBatModels = allBatModels.filter((model) => isTrainerModel(model))
  const nonTrainerBatModels = allBatModels.filter((model) => !isTrainerModel(model))
  const selectableBillets = billets.filter(
    (billet) =>
      billet.status === 'storage' ||
      producedBatDraft.billetIds.includes(billet.id),
  )
  const selectedShopifyProduct =
    shopifyCatalog.find((product) => product.id === producedBatDraft.shopifyProductId) ?? null
  const selectedShopifyVariant =
    selectedShopifyProduct?.variants.find(
      (variant) => variant.id === producedBatDraft.shopifyVariantId,
    ) ?? null
  const openOrderJobs = orderJobs.filter(
    (job) => job.productionStatus !== 'complete' && job.productionStatus !== 'cancelled',
  )
  const readyOrderJobs = orderJobs.filter(
    (job) => job.productionStatus === 'ready' || job.productionStatus === 'in_production',
  )
  const filteredOrderJobs = orderJobs.filter((job) => {
    const searchable = [
      job.shopifyOrderName,
      job.shopifyDraftOrderName,
      job.customerName,
      job.customerEmail,
      job.playerName,
      job.playerEmail,
      job.billingName,
      job.billingEmail,
      job.billingPhone,
      job.billingCompany,
      job.billingRelationship,
      job.productTitle,
      job.variantTitle,
      job.origin,
      job.financialStatus,
      job.fulfillmentStatus,
      job.invoiceStatus,
      job.productionStatus,
      job.salesRep,
      job.orderSubmittedAt,
      job.assignedBilletId
        ? billets.find((billet) => billet.id === job.assignedBilletId)?.barcode ?? job.assignedBilletId
        : '',
      job.specs.model,
      job.specs.length,
      job.specs.targetWeight,
      job.specs.wood,
      job.specs.handleColor,
      job.specs.barrelColor,
      job.specs.logoColor,
      job.specs.engraving,
      job.specs.cupped,
      job.specs.notes,
      job.notes,
      job.internalNotes,
    ]
      .join(' ')
      .toLowerCase()

    const matchesQuery = searchable.includes(orderQuery.toLowerCase())
    const matchesStatus =
      orderStatusFilter === 'all' || job.productionStatus === orderStatusFilter

    return matchesQuery && matchesStatus
  })

  const filteredBatModels = allBatModels.filter((model) => {
    const modelText = [
      model.name,
      model.category,
      ...producedBats
        .filter((record) => record.modelId === model.id)
        .flatMap((record) => [
          record.batType,
          record.length,
          record.weight,
          record.billetWeight,
          record.billetGrade,
          record.cupped,
          record.modifications,
        ]),
    ]
      .join(' ')
      .toLowerCase()

    return modelText.includes(modelQuery.toLowerCase())
  })

  const filteredCosts = billetCostReferences.filter((item) => {
    const searchable = [
      item.source,
      item.species,
      item.tier,
      item.weightRange,
      item.price,
      item.notes,
    ]
      .join(' ')
      .toLowerCase()
    const matchesQuery = searchable.includes(costQuery.toLowerCase())
    const matchesSource = costSourceFilter === 'all' || item.source === costSourceFilter
    const matchesSpecies =
      costSpeciesFilter === 'all' ||
      item.species === costSpeciesFilter ||
      (costSpeciesFilter === 'Maple' &&
        (item.species === 'Hard Maple' || item.species === 'Soft Maple')) ||
      (costSpeciesFilter === 'Birch' && item.species === 'Yellow Birch')

    return matchesQuery && matchesSource && matchesSpecies
  })

  const recommendations = billets
    .map((billet) => ({ billet, score: getFitScore(billet, build) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const availableCount = billets.filter((billet) => billet.status === 'storage').length
  const inProductionCount = billets.filter((billet) => billet.status === 'production').length
  const weighedBillets = billets.filter(
    (billet): billet is Billet & { weight: number } => typeof billet.weight === 'number',
  )
  const averageWeight =
    weighedBillets.length === 0
      ? 0
      : weighedBillets.reduce((total, billet) => total + billet.weight, 0) / weighedBillets.length

  function addBillet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.barcode.trim()) return

    const savedBillet = {
      ...applyBilletGradeRules(draft),
      id: createId('billet'),
      barcode: draft.barcode.trim().toUpperCase(),
      length: standardBilletLength,
      moisture: defaultMoisture,
    }
    const nextBillets = [savedBillet, ...billets]

    setBillets(nextBillets)
    setDraft(createNextBilletDraft(savedBillet, nextBillets))
    setQuickEntry('')
  }

  function updateStatus(id: string, status: BilletStatus) {
    setBillets((current) =>
      current.map((billet) => (billet.id === id ? { ...billet, status } : billet)),
    )
  }

  function updateSalesDraftField<K extends keyof SalesOrderDraft>(
    key: K,
    value: SalesOrderDraft[K],
  ) {
    setSalesOrderDraft((current) => ({ ...current, [key]: value }))
  }

  function applyBillingContact(contact: BillingContact) {
    setSalesOrderDraft((current) => ({
      ...current,
      billingDifferent: true,
      billingName: contact.name,
      billingEmail: contact.email,
      billingPhone: contact.phone,
      billingCompany: contact.company,
      billingRelationship: contact.relationship,
    }))
  }

  function updateBillingName(value: string) {
    const matchedContact = getBillingContactForSearchValue(
      value,
      billingContacts,
      billingContactSearchOptions,
    )

    setSalesOrderDraft((current) => ({
      ...current,
      billingName: matchedContact ? matchedContact.name : value,
      ...(matchedContact
        ? {
            billingEmail: matchedContact.email,
            billingPhone: matchedContact.phone,
            billingCompany: matchedContact.company,
            billingRelationship: matchedContact.relationship,
          }
        : {}),
    }))
  }

  function updateSalesLine(id: string, patch: Partial<SalesOrderLineDraft>) {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }))
  }

  function addSalesLine() {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: [...current.lines, emptySalesLine()],
    }))
  }

  function removeSalesLine(id: string) {
    setSalesOrderDraft((current) => ({
      ...current,
      lines: current.lines.length === 1 ? current.lines : current.lines.filter((line) => line.id !== id),
    }))
  }

  function mergeIncomingOrderJobs(incomingJobs: OrderJob[]) {
    setOrderJobs((current) =>
      mergeOrderJobs(
        incomingJobs.map((job) => normalizeOrderJob(job)),
        current,
      ),
    )
  }

  async function createSalesDraftOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payerEmail = salesOrderDraft.billingDifferent
      ? salesOrderDraft.billingEmail
      : salesOrderDraft.playerEmail
    const isDirectBillOrder = !salesOrderDraft.billingDifferent
    const requiresShipping = salesOrderDraft.requiresShipping
    const hasMissingDirectContact =
      isDirectBillOrder &&
      (!salesOrderDraft.playerPhone.trim() ||
        (requiresShipping &&
          (!salesOrderDraft.shippingAddress1.trim() ||
            !salesOrderDraft.shippingCity.trim() ||
            !salesOrderDraft.shippingProvinceCode.trim() ||
            !salesOrderDraft.shippingZip.trim() ||
            !salesOrderDraft.shippingCountryCode.trim() ||
            (salesOrderDraft.billingAddressDifferent &&
              (!salesOrderDraft.billingAddress1.trim() ||
                !salesOrderDraft.billingCity.trim() ||
                !salesOrderDraft.billingProvinceCode.trim() ||
                !salesOrderDraft.billingZip.trim() ||
                !salesOrderDraft.billingCountryCode.trim())))))
    const hasInvalidLine = salesOrderDraft.lines.some(
      (line) =>
        !line.title.trim() ||
        !line.unitPrice.trim() ||
        !Number.isFinite(Number(line.unitPrice)) ||
        Number(line.unitPrice) < 0 ||
        !line.quantity ||
        line.quantity < 1,
    )

    if (
      !salesOrderDraft.playerName.trim() ||
      !payerEmail.trim() ||
      hasMissingDirectContact ||
      hasInvalidLine
    ) {
      setOrderActionMessage(
        'Add the player, payer email, direct-bill contact/address details, bat model, unit price, and complete each line before creating the order.',
      )
      return
    }

    try {
      setIsCreatingDraftOrder(true)
      setOrderActionMessage(
        salesOrderDraft.createDraftOrder
          ? 'Creating Shopify draft invoice...'
          : 'Creating Shopify order...',
      )
      const response = await fetch(getApiPath('/api/sales-orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(salesOrderDraft),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        invoiceSent?: boolean
        emailNotificationMethod?: 'order_invoice' | 'order_receipt' | 'none'
        draftInvoiceReadyForReview?: boolean
        orderJobs?: OrderJob[]
        draftOrder?: { name?: string; invoiceUrl?: string }
        order?: { name?: string }
        internalNotificationRecipients?: string[]
      }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Shopify order failed')

      mergeIncomingOrderJobs(payload.orderJobs ?? [])
      setSalesOrderDraft(emptySalesOrderDraft())
      const notificationNames = payload.internalNotificationRecipients?.length
        ? ' and Jeremy, Stefan, and Keith copied through Shopify'
        : ''
      const emailMessage = payload.invoiceSent
        ? payload.emailNotificationMethod === 'order_receipt'
          ? ' and documentation email sent'
          : ' and invoice sent'
        : ''
      const draftReviewMessage =
        salesOrderDraft.createDraftOrder && payload.draftInvoiceReadyForReview
          ? ' and the draft invoice is ready for review'
          : ''
      setOrderActionMessage(
        `${payload.order?.name ?? payload.draftOrder?.name ?? 'Shopify order'} created${emailMessage}${draftReviewMessage}${notificationNames}.`,
      )
    } catch (error) {
      setOrderActionMessage(error instanceof Error ? error.message : 'Could not create Shopify order.')
    } finally {
      setIsCreatingDraftOrder(false)
    }
  }

  async function importRecentOrders() {
    try {
      setIsImportingOrders(true)
      setOrderActionMessage('Importing recent Shopify orders...')
      const response = await fetch(getApiPath('/api/orders/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ first: 50 }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        importedOrders?: number
        orderJobs?: OrderJob[]
      }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Order import failed')

      mergeIncomingOrderJobs(payload.orderJobs ?? [])
      setOrderActionMessage(
        `Imported ${payload.importedOrders ?? 0} recent Shopify order${
          payload.importedOrders === 1 ? '' : 's'
        }.`,
      )
    } catch (error) {
      setOrderActionMessage(error instanceof Error ? error.message : 'Could not import orders.')
    } finally {
      setIsImportingOrders(false)
    }
  }

  async function registerOrderWebhooks() {
    try {
      setIsRegisteringWebhooks(true)
      setOrderActionMessage('Registering Shopify order webhooks...')
      const response = await fetch(getApiPath('/api/webhooks/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        message?: string
        subscriptions?: unknown[]
      }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Webhook setup failed')

      setOrderActionMessage(
        `Website order webhooks are connected for ${payload.subscriptions?.length ?? 0} topics.`,
      )
    } catch (error) {
      setOrderActionMessage(error instanceof Error ? error.message : 'Could not register webhooks.')
    } finally {
      setIsRegisteringWebhooks(false)
    }
  }

  async function sendInvoiceForJob(job: OrderJob) {
    if (!job.shopifyDraftOrderId) return

    try {
      setOrderActionMessage(`Sending invoice for ${job.shopifyDraftOrderName || 'draft order'}...`)
      const response = await fetch(getApiPath('/api/draft-orders/send-invoice'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draftOrderId: job.shopifyDraftOrderId }),
      })
      const payload = (await response.json()) as { ok?: boolean; message?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Invoice send failed')

      updateOrderJob(job.id, { invoiceStatus: 'sent' })
      setOrderActionMessage(`Invoice sent for ${job.shopifyDraftOrderName || 'draft order'}.`)
    } catch (error) {
      setOrderActionMessage(error instanceof Error ? error.message : 'Could not send invoice.')
    }
  }

  function updateOrderJob(id: string, patch: Partial<OrderJob>) {
    setOrderJobs((current) =>
      current.map((job) =>
        job.id === id
          ? {
              ...job,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : job,
      ),
    )
  }

  function applyQuickEntry() {
    if (!quickEntry.trim()) return
    setDraft((current) => parseQuickEntry(quickEntry, current, billets))
  }

  function startDictation() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!Recognition) {
      setQuickEntry((current) =>
        `${current}${current ? '\n' : ''}Dictation is not supported in this browser. Try typing the intake note here instead.`,
      )
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex][0].transcript
      setQuickEntry((current) => `${current}${current ? ' ' : ''}${transcript}`)
      setDraft((current) => parseQuickEntry(transcript, current, billets))
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    setIsListening(true)
    recognition.start()
  }

  function addProfileBat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const profileName = playerNameDraft.trim()
    if (
      !profileName ||
      !batDraft.modelNumber.trim() ||
      batDraft.length === '' ||
      !batDraft.weight.trim()
    ) {
      return
    }

    const newBat = {
      ...batDraft,
      id: createId('bat'),
      modelNumber: batDraft.modelNumber.trim(),
      weight: batDraft.weight.trim(),
    }

    setPlayers((current) => {
      const existingProfile = current.find(
        (player) =>
          player.profileKind === profileKindDraft &&
          player.playerName.toLowerCase() === profileName.toLowerCase(),
      )

      if (existingProfile) {
        return current.map((player) =>
          player.id === existingProfile.id
            ? { ...player, bats: [newBat, ...player.bats] }
            : player,
        )
      }

      return [
        {
          id: createId('profile'),
          profileKind: profileKindDraft,
          playerName: profileName,
          bats: [newBat],
        },
        ...current,
      ]
    })

    setPlayerNameDraft('')
    setBatDraft(emptyBat)
    setVariantTargetProfileId(null)
  }

  function startAddVariant(profile: PlayerProfile) {
    setActiveSection('players')
    setProfileKindDraft(profile.profileKind)
    setPlayerNameDraft(profile.playerName)
    setBatDraft(emptyBat)
    setVariantTargetProfileId(profile.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleCompatibleBillet(id: string) {
    setBatDraft((current) => {
      const exists = current.compatibleBilletIds.includes(id)
      return {
        ...current,
        compatibleBilletIds: exists
          ? current.compatibleBilletIds.filter((billetId) => billetId !== id)
          : [...current.compatibleBilletIds, id],
      }
    })
  }

  function addProducedBatRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typedModelName = producedBatDraft.customModelName.trim()
    const requiresTypedModel =
      producedBatDraft.batType === 'Game' || producedBatDraft.batType === 'Trophy'

    if (
      !producedBatDraft.length.trim() ||
      !producedBatDraft.weight.trim() ||
      !producedBatDraft.billetWeight.trim() ||
      producedBatDraft.billetIds.length === 0 ||
      (producedBatDraft.batType === 'Trainer' && !producedBatDraft.modelId) ||
      (producedBatDraft.batType === 'Trainer' && !producedBatDraft.sourceModelId) ||
      (requiresTypedModel && !typedModelName)
    ) {
      return
    }

    let resolvedModelId = producedBatDraft.modelId
    let nextCustomModel: BatModelProduct | null = null

    if (requiresTypedModel) {
      const existingModel = allBatModels.find(
        (model) => model.name.toLowerCase() === typedModelName.toLowerCase(),
      )

      if (existingModel) {
        resolvedModelId = existingModel.id
      } else {
        const baseId = createModelId(typedModelName)
        const existingIds = new Set(allBatModels.map((model) => model.id))
        let id = baseId
        let counter = 2

        while (existingIds.has(id)) {
          id = `${baseId}-${counter}`
          counter += 1
        }

        nextCustomModel = {
          id,
          name: typedModelName,
          category: producedBatDraft.batType === 'Trophy' ? 'Trophy Run' : 'Internal Game Run',
          url: '',
        }
        resolvedModelId = nextCustomModel.id
      }
    }

    if (nextCustomModel) {
      setCustomBatModels((current) => [nextCustomModel!, ...current])
    }

    const sourceBilletStatuses = Object.fromEntries(
      billets
        .filter((billet) => producedBatDraft.billetIds.includes(billet.id))
        .map((billet) => [billet.id, billet.status]),
    ) as Record<string, BilletStatus>

    setProducedBats((current) => [
      {
        ...producedBatDraft,
        modelId: resolvedModelId,
        sourceBilletStatuses,
        id: createId('produced-bat'),
        length: producedBatDraft.length.trim(),
        weight: producedBatDraft.weight.trim(),
        billetWeight: producedBatDraft.billetWeight.trim(),
        shopifyProductId: producedBatDraft.shopifyProductId,
        shopifyVariantId: producedBatDraft.shopifyVariantId,
        modifications: producedBatDraft.modifications.trim(),
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])
    setBillets((current) =>
      current.map((billet) =>
        producedBatDraft.billetIds.includes(billet.id)
          ? { ...billet, status: 'production' }
          : billet,
      ),
    )
    setProducedBatDraft(emptyProducedBat)
  }

  function deleteProducedBatRecord(id: string) {
    const record = producedBats.find((item) => item.id === id)
    if (!record) return

    const remainingRecords = producedBats.filter((item) => item.id !== id)

    setProducedBats(remainingRecords)
    setBillets((current) =>
      current.map((billet) => {
        if (!record.billetIds.includes(billet.id)) return billet

        const stillUsed = remainingRecords.some((item) => item.billetIds.includes(billet.id))
        if (stillUsed) return billet

        return {
          ...billet,
          status: normalizeBilletStatus(record.sourceBilletStatuses[billet.id] ?? 'storage'),
        }
      }),
    )
  }

  function stopBarcodeScan() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsScanning(false)
  }

  async function startBarcodeScan() {
    if (!window.BarcodeDetector) {
      setScannerMessage('Barcode scanning is not supported in this browser. Manual entry still works.')
      return
    }

    try {
      setScannerMessage('Starting camera...')
      setIsScanning(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream

      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'qr_code'],
      })

      const scanFrame = async () => {
        if (!videoRef.current || !streamRef.current) return

        const barcodes = await detector.detect(videoRef.current)
        if (barcodes[0]?.rawValue) {
          setDraft((current) => ({ ...current, barcode: barcodes[0].rawValue.toUpperCase() }))
          setScannerMessage(`Scanned ${barcodes[0].rawValue}`)
          stopBarcodeScan()
          return
        }

        window.requestAnimationFrame(scanFrame)
      }

      window.requestAnimationFrame(scanFrame)
    } catch {
      setScannerMessage('Could not open camera. Check browser permissions or enter the barcode manually.')
      stopBarcodeScan()
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Trinity Bat Company internal tool</p>
          <h1>Billet command center</h1>
          <p className="hero-copy">
            Receive, measure, grade, match billets, and store player bat profiles in your
            live Shopify-connected production workflow.
          </p>
          <nav className="section-tabs" aria-label="Primary tool sections">
            <button
              type="button"
              className={activeSection === 'inventory' ? 'active' : ''}
              onClick={() => setActiveSection('inventory')}
            >
              Inventory
            </button>
            <button
              type="button"
              className={activeSection === 'orders' ? 'active' : ''}
              onClick={() => setActiveSection('orders')}
            >
              Orders
            </button>
            <button
              type="button"
              className={activeSection === 'players' ? 'active' : ''}
              onClick={() => setActiveSection('players')}
            >
              Player Profiles
            </button>
            <button
              type="button"
              className={activeSection === 'models' ? 'active' : ''}
              onClick={() => setActiveSection('models')}
            >
              Bat Model Repository
            </button>
            <button
              type="button"
              className={activeSection === 'costs' ? 'active' : ''}
              onClick={() => setActiveSection('costs')}
            >
              Billet Cost Guide
            </button>
          </nav>
        </div>
        <div className="hero-card" aria-label="Connection status">
          <span className="status-dot"></span>
          <strong>
            {backendStatus === 'connected'
              ? 'Shopify-backed internal tool'
              : backendStatus === 'unauthorized'
                ? 'Secure internal access required'
                : 'Live sync unavailable'}
          </strong>
          <p>{syncMessage}</p>
        </div>
      </section>

      {isLoadingRemoteState ? (
        <section className="panel inventory-panel">
          <div className="section-heading">
            <p className="eyebrow">Shopify sync</p>
            <h2>Loading shared inventory</h2>
          </div>
          <p className="empty-state">Checking Shopify before showing device-saved records.</p>
        </section>
      ) : backendStatus === 'unauthorized' ? (
        <section className="panel inventory-panel">
          <div className="section-heading">
            <p className="eyebrow">Secure internal access</p>
            <h2>Use the internal access link</h2>
          </div>
          <p className="empty-state">
            This page is live, but the shared Shopify inventory requires an internal session. Open
            the secure internal link we issued for Trinity or launch the tool from Shopify admin.
          </p>
        </section>
      ) : backendStatus !== 'connected' ? (
        <section className="panel inventory-panel">
          <div className="section-heading">
            <p className="eyebrow">Live sync paused</p>
            <h2>Editing is temporarily locked</h2>
          </div>
          <p className="empty-state">
            This tool could not reach the live Shopify-backed inventory state. To prevent local-only
            records, data entry is disabled until sync reconnects.
          </p>
        </section>
      ) : activeSection === 'inventory' ? (
        <>
          <section className="intake-first">
            <form className="panel intake-panel intake-panel-primary" onSubmit={addBillet}>
              <div className="section-heading">
                <p className="eyebrow">Receiving</p>
                <h2>Add a billet</h2>
              </div>

              <div className="quick-entry">
                <label>
                  Quick entry by typing or dictation
                  <textarea
                    value={quickEntry}
                    placeholder="Example: TBC-BLT-0004 maple prime, RJ's, MLB yes, no barrel knot, 48.5 ounces, rack A2"
                    onChange={(event) => setQuickEntry(event.target.value)}
                  />
                </label>
                <div className="quick-actions">
                  <button type="button" onClick={applyQuickEntry}>
                    Fill form from text
                  </button>
                  <button type="button" className="secondary-button" onClick={startDictation}>
                    {isListening ? 'Listening...' : 'Dictate'}
                  </button>
                </div>
              </div>

              <label>
                Barcode
                <div className="input-action-row">
                  <input
                    value={draft.barcode}
                    placeholder="TBC-BLT-0004"
                    onChange={(event) => setDraft({ ...draft, barcode: event.target.value })}
                  />
                  <button type="button" className="secondary-button" onClick={startBarcodeScan}>
                    Scan
                  </button>
                </div>
              </label>

              {scannerMessage ? <p className="helper-text">{scannerMessage}</p> : null}

              {isScanning ? (
                <div className="scanner-panel">
                  <video ref={videoRef} playsInline muted aria-label="Barcode scanner camera" />
                  <button type="button" className="secondary-button" onClick={stopBarcodeScan}>
                    Stop scanning
                  </button>
                </div>
              ) : null}

              <div className="form-row">
                <label>
                  Species
                  <select
                    value={draft.species}
                    onChange={(event) =>
                      setDraft({ ...draft, species: event.target.value as Species })
                    }
                  >
                    {speciesOptions.map((species) => (
                      <option key={species}>{species}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source
                  <select
                    value={draft.source}
                    onChange={(event) =>
                      setDraft((current) =>
                        applyBilletGradeRules({
                          ...current,
                          source: event.target.value as Source,
                        }),
                      )
                    }
                  >
                    {sourceOptions.map((source) => (
                      <option key={source}>{source}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Grade
                  <select
                    value={draft.grade}
                    onChange={(event) =>
                      setDraft((current) =>
                        applyBilletGradeRules({
                          ...current,
                          grade: event.target.value as Grade,
                        }),
                      )
                    }
                  >
                    {getGradeOptionsForSource(draft.source).map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Delivery date
                  <select
                    value={draft.deliveryDate}
                    onChange={(event) =>
                      setDraft({ ...draft, deliveryDate: event.target.value })
                    }
                  >
                    <option value="">Select delivery date</option>
                    {getDeliveryDateOptionsForSource(draft.source, billets, draft.deliveryDate).map(
                      (date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Add new delivery date
                  <div className="input-action-row">
                    <input
                      type="date"
                      value={newDeliveryDate}
                      onChange={(event) => setNewDeliveryDate(event.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        if (!newDeliveryDate) return
                        setDraft({ ...draft, deliveryDate: newDeliveryDate })
                        setNewDeliveryDate('')
                      }}
                    >
                      Use date
                    </button>
                  </div>
                </label>
                <label>
                  Location
                  <input
                    value={draft.location}
                    onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  MLB bat capable?
                  <select
                    value={draft.mlbEligible ? 'yes' : 'no'}
                    disabled={autoNonMlbGrades.has(draft.grade)}
                    onChange={(event) =>
                      setDraft({ ...draft, mlbEligible: event.target.value === 'yes' })
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  Knot in barrel?
                  <select
                    value={draft.hasBarrelKnot}
                    onChange={(event) =>
                      setDraft({ ...draft, hasBarrelKnot: event.target.value as KnotStatus })
                    }
                  >
                    {getKnotOptions(draft.grade).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="form-hint">
                Billet size: {standardBilletLength} in x {getBilletDiameter(draft.source)} in round
                {draft.source === "RJ's Tree Farms" || draft.source === 'Cahan'
                  ? ` for ${draft.source} billets.`
                  : '.'}
              </p>

              <div className="form-row">
                <label>
                  Weight
                  <input
                    type="number"
                    step="0.1"
                    value={draft.weight}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        weight:
                          event.target.value === '' ? '' : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <label className="notes-field">
                Notes
                <textarea
                  value={draft.notes}
                  placeholder="Grain, defects, pallet notes, or model ideas"
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </label>

              <button type="submit">Add billet</button>
            </form>
          </section>

          <section className="metrics-grid" aria-label="Inventory summary">
            <article>
              <span>Total billets</span>
              <strong>{billets.length}</strong>
            </article>
            <article>
              <span>In storage</span>
              <strong>{availableCount}</strong>
            </article>
            <article>
              <span>In production</span>
              <strong>{inProductionCount}</strong>
            </article>
            <article>
              <span>Avg weight</span>
              <strong>{averageWeight.toFixed(1)} oz</strong>
            </article>
          </section>

          <section className="workspace-grid fit-grid">
            <section className="panel recommendation-panel">
              <div className="section-heading">
                <p className="eyebrow">Production assist</p>
                <h2>Billet fit finder</h2>
              </div>

              <div className="build-grid">
                <label>
                  Model framework
                  <input
                    value={build.model}
                    onChange={(event) => setBuild({ ...build, model: event.target.value })}
                  />
                </label>
                <label>
                  Length
                  <input
                    type="number"
                    step="0.25"
                    value={build.length}
                    onChange={(event) =>
                      setBuild({ ...build, length: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Target weight
                  <input
                    type="number"
                    step="0.1"
                    value={build.targetWeight}
                    onChange={(event) =>
                      setBuild({ ...build, targetWeight: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Species
                  <select
                    value={build.species}
                    onChange={(event) =>
                      setBuild({ ...build, species: event.target.value as Species | 'Any' })
                    }
                  >
                    <option>Any</option>
                    {speciesOptions.map((species) => (
                      <option key={species}>{species}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Grade target
                  <select
                    value={build.grade}
                    onChange={(event) =>
                      setBuild({ ...build, grade: event.target.value as Grade })
                    }
                  >
                    {allGradeOptions.map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label>
                  MLB build only?
                  <select
                    value={build.mlbOnly ? 'yes' : 'no'}
                    onChange={(event) =>
                      setBuild({ ...build, mlbOnly: event.target.value === 'yes' })
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>

              <div className="recommendation-list">
                {recommendations.length === 0 ? (
                  <p className="empty-state">No storage billets match this build yet.</p>
                ) : (
                  recommendations.map(({ billet, score }, index) => (
                    <article className="recommendation-card" key={billet.id}>
                      <span>Option {index + 1}</span>
                      <strong>{billet.barcode}</strong>
                      <p>
                        {score}% fit for {build.model}. {billet.weight || 'unweighed'} oz{' '}
                        {billet.species},{' '}
                        {standardBilletLength} in round, {billet.grade} grade from{' '}
                        {billet.source}.
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </section>

          <section className="panel inventory-panel">
            <div className="inventory-toolbar">
              <div className="section-heading">
                <p className="eyebrow">Inventory</p>
                <h2>Billet records</h2>
              </div>
              <div className="filters inventory-top-filters">
                <input
                  aria-label="Search billets"
                  placeholder="Search barcode, source, delivery date, location..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <input
                  aria-label="Minimum billet weight"
                  inputMode="decimal"
                  placeholder="Min oz"
                  value={minWeightFilter}
                  onChange={(event) => setMinWeightFilter(event.target.value)}
                />
                <input
                  aria-label="Maximum billet weight"
                  inputMode="decimal"
                  placeholder="Max oz"
                  value={maxWeightFilter}
                  onChange={(event) => setMaxWeightFilter(event.target.value)}
                />
                <select
                  aria-label="Sort billets"
                  value={inventorySort}
                  onChange={(event) => setInventorySort(event.target.value as InventorySort)}
                >
                  <option value="barcode_asc">Sort: Barcode A-Z</option>
                  <option value="barcode_desc">Sort: Barcode Z-A</option>
                  <option value="weight_asc">Sort: Weight low-high</option>
                  <option value="weight_desc">Sort: Weight high-low</option>
                  <option value="species_asc">Sort: Species</option>
                  <option value="grade_asc">Sort: Grade</option>
                  <option value="source_asc">Sort: Source</option>
                  <option value="delivery_desc">Sort: Delivery newest</option>
                  <option value="delivery_asc">Sort: Delivery oldest</option>
                </select>
                <button type="button" className="secondary-button" onClick={clearInventoryFilters}>
                  Clear filters
                </button>
              </div>
              <div className="inventory-filter-groups">
                <div className="filter-group">
                  <p className="filter-group-label">Species</p>
                  <div className="filter-chip-row">
                    {speciesOptions.map((species) => (
                      <label
                        key={species}
                        className={`filter-chip ${speciesFilters.includes(species) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={speciesFilters.includes(species)}
                          onChange={() =>
                            setSpeciesFilters((current) => toggleSelectedValue(current, species))
                          }
                        />
                        <span>{species}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-group-label">Source</p>
                  <div className="filter-chip-row">
                    {sourceOptions.map((source) => (
                      <label
                        key={source}
                        className={`filter-chip ${sourceFilters.includes(source) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={sourceFilters.includes(source)}
                          onChange={() =>
                            setSourceFilters((current) => toggleSelectedValue(current, source))
                          }
                        />
                        <span>{source}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-group-label">Grade</p>
                  <div className="filter-chip-row">
                    {allGradeOptions.map((grade) => (
                      <label
                        key={grade}
                        className={`filter-chip ${gradeFilters.includes(grade) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={gradeFilters.includes(grade)}
                          onChange={() =>
                            setGradeFilters((current) => toggleSelectedValue(current, grade))
                          }
                        />
                        <span>{grade}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-group-label">MLB capability</p>
                  <div className="filter-chip-row">
                    {[
                      ['yes', 'MLB capable'],
                      ['no', 'Not MLB capable'],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`filter-chip ${mlbFilters.includes(value as InventoryMlbFilter) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={mlbFilters.includes(value as InventoryMlbFilter)}
                          onChange={() =>
                            setMlbFilters((current) =>
                              toggleSelectedValue(current, value as InventoryMlbFilter),
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-group-label">Knot in barrel</p>
                  <div className="filter-chip-row">
                    {(['No', 'Yes', 'N/A'] as KnotStatus[]).map((status) => (
                      <label
                        key={status}
                        className={`filter-chip ${knotFilters.includes(status) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={knotFilters.includes(status)}
                          onChange={() =>
                            setKnotFilters((current) => toggleSelectedValue(current, status))
                          }
                        />
                        <span>{status}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-group-label">Delivery date</p>
                  <div className="filter-chip-row">
                    {deliveryDateOptions.length > 0 ? (
                      deliveryDateOptions.map((date) => (
                        <label
                          key={date}
                          className={`filter-chip ${deliveryDateFilters.includes(date) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={deliveryDateFilters.includes(date)}
                            onChange={() =>
                              setDeliveryDateFilters((current) =>
                                toggleSelectedValue(current, date),
                              )
                            }
                          />
                          <span>{date}</span>
                        </label>
                      ))
                    ) : (
                      <p className="filter-empty-state">No delivery dates stored yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="inventory-summary-row">
              <p className="inventory-match-count">
                {filteredBilletCount} storage billet{filteredBilletCount === 1 ? '' : 's'} match
                these filters.
              </p>
              <p className="inventory-sort-hint">Tap a column header or use the sort dropdown.</p>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => toggleInventorySort('barcode')}
                      >
                        Barcode {sortIndicator('barcode')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => toggleInventorySort('species')}
                      >
                        Wood {sortIndicator('species')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => toggleInventorySort('source')}
                      >
                        Source {sortIndicator('source')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => toggleInventorySort('delivery')}
                      >
                        Delivery {sortIndicator('delivery')}
                      </button>
                    </th>
                    <th>MLB</th>
                    <th>Barrel knot</th>
                    <th>
                      <button
                        type="button"
                        className="sort-header"
                        onClick={() => toggleInventorySort('weight')}
                      >
                        Specs {sortIndicator('weight')}
                      </button>
                    </th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBillets.map((billet) => (
                    <tr key={billet.id}>
                      <td>
                        <strong>{billet.barcode}</strong>
                      </td>
                      <td>
                        {billet.species}
                        <span>{billet.grade}</span>
                      </td>
                      <td>{billet.source}</td>
                      <td>{billet.deliveryDate || 'No date yet'}</td>
                      <td>
                        <span className={billet.mlbEligible ? 'pill yes' : 'pill no'}>
                          {billet.mlbEligible ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            billet.hasBarrelKnot === 'Yes'
                              ? 'pill no'
                              : billet.hasBarrelKnot === 'N/A'
                                ? 'pill'
                                : 'pill yes'
                          }
                        >
                          {billet.hasBarrelKnot}
                        </span>
                      </td>
                      <td>
                        {standardBilletLength} in x {getBilletDiameter(billet.source)} in round
                        <span>
                          {billet.weight || 'No weight recorded'} oz
                        </span>
                      </td>
                      <td>{billet.location}</td>
                      <td>
                        <select
                          value={billet.status}
                          onChange={(event) =>
                            updateStatus(billet.id, event.target.value as BilletStatus)
                          }
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{billet.notes || 'No notes yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : activeSection === 'orders' ? (
        <section className="orders-page">
          <section className="metrics-grid" aria-label="Order flow summary">
            <article>
              <span>Open jobs</span>
              <strong>{openOrderJobs.length}</strong>
            </article>
            <article>
              <span>Ready / cutting</span>
              <strong>{readyOrderJobs.length}</strong>
            </article>
            <article>
              <span>Website jobs</span>
              <strong>{orderJobs.filter((job) => job.origin === 'website').length}</strong>
            </article>
            <article>
              <span>Sales intake</span>
              <strong>{orderJobs.filter((job) => job.origin === 'internal_sales').length}</strong>
            </article>
          </section>

          <section className="orders-layout">
            <section className="panel order-intake-panel">
              <div className="section-heading">
                <p className="eyebrow">Sales intake</p>
                <h2>Create a Shopify invoice order</h2>
              </div>

              <form className="bat-form order-intake-form" onSubmit={createSalesDraftOrder}>
                <div className="form-instructions">
                  <strong>Internal sales orders create payment-pending Shopify orders</strong>
                  <p>
                    Sales reps can enter phone, team, or custom orders here. The app creates
                    the Shopify order, triggers the same staff order notifications as the site,
                    sends the invoice when selected, and drops each line into the production queue.
                  </p>
                </div>

                <datalist id="player-name-options">
                  {players.map((player) => (
                    <option key={player.id} value={player.playerName} />
                  ))}
                </datalist>

                <datalist id="shopify-bat-products">
                  {shopifyCatalog.map((product) => (
                    <option key={product.id} value={product.name} />
                  ))}
                </datalist>

                <datalist id="billing-contact-options">
                  {billingContactSearchOptions.map((option) => (
                    <option key={option.id} value={option.value} label={option.label} />
                  ))}
                </datalist>

                <div
                  className={`form-row ${
                    salesOrderDraft.billingDifferent ? 'single-field-row' : ''
                  }`}
                >
                  <label>
                    Player name
                    <input
                      list="player-name-options"
                      value={salesOrderDraft.playerName}
                      placeholder="Example: Jordan Smith"
                      onChange={(event) => updateSalesDraftField('playerName', event.target.value)}
                    />
                  </label>
                  {!salesOrderDraft.billingDifferent ? (
                    <label>
                      Player email
                      <input
                        type="email"
                        value={salesOrderDraft.playerEmail}
                        placeholder="player@example.com"
                        onChange={(event) =>
                          updateSalesDraftField('playerEmail', event.target.value)
                        }
                      />
                    </label>
                  ) : null}
                </div>

                <label className="checkbox-row billing-toggle">
                  <input
                    type="checkbox"
                    checked={salesOrderDraft.billingDifferent}
                    onChange={(event) => {
                      const billingDifferent = event.target.checked
                      setSalesOrderDraft((current) => ({
                        ...current,
                        billingDifferent,
                        playerEmail: billingDifferent ? '' : current.playerEmail,
                        playerPhone: billingDifferent ? '' : current.playerPhone,
                        shippingAddress1: billingDifferent ? '' : current.shippingAddress1,
                        shippingAddress2: billingDifferent ? '' : current.shippingAddress2,
                        shippingCity: billingDifferent ? '' : current.shippingCity,
                        shippingProvinceCode: billingDifferent ? '' : current.shippingProvinceCode,
                        shippingZip: billingDifferent ? '' : current.shippingZip,
                        shippingCountryCode: billingDifferent ? 'US' : current.shippingCountryCode,
                        billingAddressDifferent: billingDifferent
                          ? false
                          : current.billingAddressDifferent,
                        billingAddress1: billingDifferent ? '' : current.billingAddress1,
                        billingAddress2: billingDifferent ? '' : current.billingAddress2,
                        billingCity: billingDifferent ? '' : current.billingCity,
                        billingProvinceCode: billingDifferent ? '' : current.billingProvinceCode,
                        billingZip: billingDifferent ? '' : current.billingZip,
                        billingCountryCode: billingDifferent ? 'US' : current.billingCountryCode,
                      }))
                    }}
                  />
                  <span>Bill a team, agent, or other payer</span>
                </label>

                <label className="checkbox-row billing-toggle">
                  <input
                    type="checkbox"
                    checked={!salesOrderDraft.requiresShipping}
                    onChange={(event) => {
                      const requiresShipping = !event.target.checked
                      setSalesOrderDraft((current) => ({
                        ...current,
                        requiresShipping,
                        shippingSpeed: requiresShipping ? current.shippingSpeed : 'standard',
                        shippingAddress1: requiresShipping ? current.shippingAddress1 : '',
                        shippingAddress2: requiresShipping ? current.shippingAddress2 : '',
                        shippingCity: requiresShipping ? current.shippingCity : '',
                        shippingProvinceCode: requiresShipping
                          ? current.shippingProvinceCode
                          : '',
                        shippingZip: requiresShipping ? current.shippingZip : '',
                        shippingCountryCode: requiresShipping ? current.shippingCountryCode : 'US',
                        billingAddressDifferent: requiresShipping
                          ? current.billingAddressDifferent
                          : false,
                        billingAddress1: requiresShipping ? current.billingAddress1 : '',
                        billingAddress2: requiresShipping ? current.billingAddress2 : '',
                        billingCity: requiresShipping ? current.billingCity : '',
                        billingProvinceCode: requiresShipping
                          ? current.billingProvinceCode
                          : '',
                        billingZip: requiresShipping ? current.billingZip : '',
                        billingCountryCode: requiresShipping ? current.billingCountryCode : 'US',
                      }))
                    }}
                  />
                  <span>Local delivery / no shipping required</span>
                </label>

                <div className="form-row fulfillment-options-row">
                  <label>
                    Shipping speed
                    <select
                      value={salesOrderDraft.shippingSpeed}
                      disabled={!salesOrderDraft.requiresShipping}
                      onChange={(event) =>
                        updateSalesDraftField(
                          'shippingSpeed',
                          event.target.value as ShippingSpeedOption,
                        )
                      }
                    >
                      {shippingSpeedOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Production timeline
                    <select
                      value={salesOrderDraft.productionTimeline}
                      onChange={(event) =>
                        updateSalesDraftField(
                          'productionTimeline',
                          event.target.value as ProductionTimelineOption,
                        )
                      }
                    >
                      {productionTimelineOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {salesOrderDraft.billingDifferent ? (
                  <div className="billing-panel">
                    <div className="form-row">
                      <label>
                        Payer name
                        <input
                          list="billing-contact-options"
                          value={salesOrderDraft.billingName}
                          placeholder="Search name, team, agent, or agency"
                          onChange={(event) => updateBillingName(event.target.value)}
                        />
                      </label>
                      <label>
                        Payer email
                        <input
                          type="email"
                          value={salesOrderDraft.billingEmail}
                          placeholder="billing@example.com"
                          onChange={(event) =>
                            updateSalesDraftField('billingEmail', event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        Payer phone
                        <input
                          type="tel"
                          value={salesOrderDraft.billingPhone}
                          placeholder="Example: (321) 652-1800"
                          onChange={(event) =>
                            updateSalesDraftField('billingPhone', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Team or agency
                        <input
                          value={salesOrderDraft.billingCompany}
                          placeholder="Example: New York Mets"
                          onChange={(event) =>
                            updateSalesDraftField('billingCompany', event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        Billing relationship
                        <input
                          value={salesOrderDraft.billingRelationship}
                          placeholder="Example: Minor league clubhouse manager"
                          onChange={(event) =>
                            updateSalesDraftField('billingRelationship', event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <div className="saved-contact-panel">
                      <span>Saved payer contacts</span>
                      <div className="saved-contact-list">
                        {billingContacts.map((contact) => (
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            key={contact.id}
                            onClick={() => applyBillingContact(contact)}
                          >
                            {contact.name} · {contact.company}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="billing-panel">
                    <div className="form-row">
                      <label>
                        Player phone
                        <input
                          type="tel"
                          value={salesOrderDraft.playerPhone}
                          placeholder="Example: (321) 652-1800"
                          onChange={(event) =>
                            updateSalesDraftField('playerPhone', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Shipping country code
                        <input
                          value={salesOrderDraft.shippingCountryCode}
                          placeholder="US"
                          onChange={(event) =>
                            updateSalesDraftField(
                              'shippingCountryCode',
                              event.target.value.toUpperCase(),
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        Shipping address
                        <input
                          value={salesOrderDraft.shippingAddress1}
                          placeholder="Street address"
                          onChange={(event) =>
                            updateSalesDraftField('shippingAddress1', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Apartment, suite, etc.
                        <input
                          value={salesOrderDraft.shippingAddress2}
                          placeholder="Optional"
                          onChange={(event) =>
                            updateSalesDraftField('shippingAddress2', event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        Shipping city
                        <input
                          value={salesOrderDraft.shippingCity}
                          placeholder="City"
                          onChange={(event) =>
                            updateSalesDraftField('shippingCity', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Shipping state
                        <input
                          value={salesOrderDraft.shippingProvinceCode}
                          placeholder="Example: CO"
                          onChange={(event) =>
                            updateSalesDraftField(
                              'shippingProvinceCode',
                              event.target.value.toUpperCase(),
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        Shipping ZIP
                        <input
                          value={salesOrderDraft.shippingZip}
                          placeholder="ZIP code"
                          onChange={(event) =>
                            updateSalesDraftField('shippingZip', event.target.value)
                          }
                        />
                      </label>
                    </div>

                    <label className="checkbox-row billing-toggle">
                      <input
                        type="checkbox"
                        checked={salesOrderDraft.billingAddressDifferent}
                        onChange={(event) =>
                          updateSalesDraftField('billingAddressDifferent', event.target.checked)
                        }
                      />
                      <span>Billing address is different from shipping address</span>
                    </label>

                    {salesOrderDraft.billingAddressDifferent ? (
                      <>
                        <div className="form-row">
                          <label>
                            Billing country code
                            <input
                              value={salesOrderDraft.billingCountryCode}
                              placeholder="US"
                              onChange={(event) =>
                                updateSalesDraftField(
                                  'billingCountryCode',
                                  event.target.value.toUpperCase(),
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Billing address
                            <input
                              value={salesOrderDraft.billingAddress1}
                              placeholder="Street address"
                              onChange={(event) =>
                                updateSalesDraftField('billingAddress1', event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Apartment, suite, etc.
                            <input
                              value={salesOrderDraft.billingAddress2}
                              placeholder="Optional"
                              onChange={(event) =>
                                updateSalesDraftField('billingAddress2', event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Billing city
                            <input
                              value={salesOrderDraft.billingCity}
                              placeholder="City"
                              onChange={(event) =>
                                updateSalesDraftField('billingCity', event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Billing state
                            <input
                              value={salesOrderDraft.billingProvinceCode}
                              placeholder="Example: CO"
                              onChange={(event) =>
                                updateSalesDraftField(
                                  'billingProvinceCode',
                                  event.target.value.toUpperCase(),
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Billing ZIP
                            <input
                              value={salesOrderDraft.billingZip}
                              placeholder="ZIP code"
                              onChange={(event) =>
                                updateSalesDraftField('billingZip', event.target.value)
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}

                <label>
                  Sales rep
                  <input
                    value={salesOrderDraft.salesRep}
                    placeholder="Example: Matt"
                    onChange={(event) => updateSalesDraftField('salesRep', event.target.value)}
                  />
                </label>

                <div className="sales-line-list">
                  {salesOrderDraft.lines.map((line, index) => {
                    const lineProduct = shopifyCatalog.find((product) => product.id === line.productId)
                    const lineVariant = lineProduct?.variants.find(
                      (variant) => variant.id === line.variantId,
                    )
                    const productInputValue = line.isProOrder ? line.title : (lineProduct?.name ?? line.title)
                    const lineTitle = line.isProOrder
                      ? line.title || 'Pro custom bat'
                      : lineProduct?.name || line.title || 'Custom bat'

                    return (
                      <article className="sales-line-card" key={line.id}>
                        <div className="split-heading">
                          <div>
                            <span className="profile-type-pill">Line {index + 1}</span>
                            <h3>{lineTitle}</h3>
                          </div>
                          {salesOrderDraft.lines.length > 1 ? (
                            <button
                              type="button"
                              className="secondary-button destructive-button compact-button"
                              onClick={() => removeSalesLine(line.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        <label className="checkbox-row pro-order-toggle">
                          <input
                            type="checkbox"
                            checked={line.isProOrder}
                            onChange={(event) => {
                              const isProOrder = event.target.checked
                              if (isProOrder) {
                                updateSalesLine(line.id, {
                                  isProOrder,
                                  productId: '',
                                  variantId: '',
                                  title: line.title || lineProduct?.name || '',
                                })
                                return
                              }

                              updateSalesLine(line.id, {
                                isProOrder,
                                ...getTypedBatModelPatch(shopifyCatalog, line.title, line),
                              })
                            }}
                          />
                          <span>Pro order</span>
                        </label>

                        <div className={`form-row ${line.isProOrder ? 'single-field-row' : ''}`}>
                          <label>
                            Bat model
                            <input
                              list={line.isProOrder ? undefined : 'shopify-bat-products'}
                              value={productInputValue}
                              placeholder={
                                line.isProOrder
                                  ? 'Example: T141 pro custom'
                                  : 'Type a model or choose a Shopify product'
                              }
                              onChange={(event) => {
                                const typedProduct = event.target.value
                                if (line.isProOrder) {
                                  updateSalesLine(line.id, {
                                    productId: '',
                                    variantId: '',
                                    title: typedProduct,
                                  })
                                  return
                                }

                                updateSalesLine(
                                  line.id,
                                  getTypedBatModelPatch(shopifyCatalog, typedProduct, line),
                                )
                              }}
                            />
                          </label>
                          {!line.isProOrder ? (
                            <label>
                              Variant
                              <select
                                value={line.variantId}
                                disabled={!lineProduct}
                                onChange={(event) => {
                                  const variant = lineProduct?.variants.find(
                                    (item) => item.id === event.target.value,
                                  )
                                  updateSalesLine(line.id, {
                                    variantId: event.target.value,
                                    unitPrice: variant?.price ?? line.unitPrice,
                                  })
                                }}
                              >
                                <option value="">
                                  {lineProduct
                                    ? 'Select variant'
                                    : line.title.trim()
                                      ? 'Manual model, no Shopify variant'
                                      : 'Optional Shopify variant'}
                                </option>
                                {lineProduct?.variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.title}
                                    {variant.sku ? ` / ${variant.sku}` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <div className="form-row">
                          <label>
                            Unit price
                            <input
                              inputMode="decimal"
                              value={line.unitPrice}
                              placeholder={lineVariant ? 'Adjust Shopify price' : 'Example: 189.00'}
                              onChange={(event) =>
                                updateSalesLine(line.id, { unitPrice: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Quantity
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(event) =>
                                updateSalesLine(line.id, { quantity: Number(event.target.value) })
                              }
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Length
                            <input
                              value={line.length}
                              placeholder="Example: 34"
                              onChange={(event) =>
                                updateSalesLine(line.id, { length: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Weight
                            <input
                              value={line.targetWeight}
                              placeholder="Example: 31.5"
                              onChange={(event) =>
                                updateSalesLine(line.id, { targetWeight: event.target.value })
                              }
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Handle color
                            <select
                              value={line.handleColor}
                              onChange={(event) =>
                                updateSalesLine(line.id, { handleColor: event.target.value })
                              }
                            >
                              <option value="">Select handle color</option>
                              {customizerColorOptions.map((color) => (
                                <option key={color}>{color}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Barrel color
                            <select
                              value={line.barrelColor}
                              onChange={(event) =>
                                updateSalesLine(line.id, { barrelColor: event.target.value })
                              }
                            >
                              <option value="">Select barrel color</option>
                              {customizerColorOptions.map((color) => (
                                <option key={color}>{color}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Logo color
                            <select
                              value={line.logoColor}
                              onChange={(event) =>
                                updateSalesLine(line.id, { logoColor: event.target.value })
                              }
                            >
                              <option value="">Select logo color</option>
                              {customizerColorOptions.map((color) => (
                                <option key={color}>{color}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Wood species
                            <select
                              value={line.wood}
                              onChange={(event) =>
                                updateSalesLine(line.id, {
                                  wood: event.target.value as SalesOrderLineDraft['wood'],
                                })
                              }
                            >
                              {speciesOptions.map((species) => (
                                <option key={species}>{species}</option>
                              ))}
                              <option>Other</option>
                            </select>
                          </label>
                        </div>

                        <div className="form-row">
                          <label>
                            Cup
                            <select
                              value={line.cupped}
                              onChange={(event) =>
                                updateSalesLine(line.id, {
                                  cupped: event.target.value as SalesOrderLineDraft['cupped'],
                                })
                              }
                            >
                              {manualCupOptions.map((cup) => (
                                <option key={cup} value={cup}>
                                  {cup === 'Yes' ? 'Cup' : 'No cup'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Engraving
                            <input
                              value={line.engraving}
                              placeholder="Player name, signature, or custom text"
                              onChange={(event) =>
                                updateSalesLine(line.id, { engraving: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      </article>
                    )
                  })}
                </div>

                <button type="button" className="secondary-button" onClick={addSalesLine}>
                  Add another line
                </button>

                <label className="notes-field">
                  Internal order notes
                  <textarea
                    value={salesOrderDraft.notes}
                    placeholder="Payment terms, delivery promise, team contact, or packaging notes"
                    onChange={(event) => updateSalesDraftField('notes', event.target.value)}
                  />
                </label>

                <label className="checkbox-row invoice-toggle">
                  <input
                    type="checkbox"
                    checked={salesOrderDraft.createDraftOrder}
                    onChange={(event) => {
                      const createDraftOrder = event.target.checked
                      setSalesOrderDraft((current) => ({
                        ...current,
                        createDraftOrder,
                        sendInvoice: createDraftOrder ? false : current.sendInvoice,
                      }))
                    }}
                  />
                  <span>Create Shopify draft invoice for manual review</span>
                </label>

                {!salesOrderDraft.createDraftOrder ? (
                  <label className="checkbox-row invoice-toggle">
                    <input
                      type="checkbox"
                      checked={salesOrderDraft.sendInvoice}
                      onChange={(event) =>
                        updateSalesDraftField('sendInvoice', event.target.checked)
                      }
                    />
                    <span>Send Shopify invoice/documentation after order creation</span>
                  </label>
                ) : null}

                <button type="submit" disabled={isCreatingDraftOrder}>
                  {isCreatingDraftOrder
                    ? salesOrderDraft.createDraftOrder
                      ? 'Creating draft...'
                      : 'Creating order...'
                    : salesOrderDraft.createDraftOrder
                      ? 'Create Shopify draft invoice'
                      : 'Create Shopify order'}
                </button>
              </form>
            </section>

            <section className="panel order-queue-panel">
              <div className="inventory-toolbar profile-toolbar">
                <div className="section-heading">
                  <p className="eyebrow">Order flow</p>
                  <h2>Production queue</h2>
                </div>
                <div className="filters">
                  <input
                    aria-label="Search order jobs"
                    placeholder="Search customer, model, order, billet..."
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                  />
                  <select
                    aria-label="Filter production status"
                    value={orderStatusFilter}
                    onChange={(event) =>
                      setOrderStatusFilter(event.target.value as 'all' | ProductionStatus)
                    }
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(productionStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="order-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={importRecentOrders}
                  disabled={isImportingOrders}
                >
                  {isImportingOrders ? 'Importing...' : 'Import recent website orders'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={registerOrderWebhooks}
                  disabled={isRegisteringWebhooks}
                >
                  {isRegisteringWebhooks ? 'Connecting...' : 'Connect website webhooks'}
                </button>
              </div>

              {orderActionMessage ? <p className="helper-text">{orderActionMessage}</p> : null}

              <div className="order-job-list">
                {filteredOrderJobs.length === 0 ? (
                  <p className="empty-state">No order jobs match this view yet.</p>
                ) : (
                  filteredOrderJobs.map((job) => {
                    const assignedBillet = billets.find((billet) => billet.id === job.assignedBilletId)
                    const availableBilletsForJob = billets.filter(
                      (billet) => billet.status === 'storage' || billet.id === job.assignedBilletId,
                    )
                    const displayPlayerName = job.playerName || job.customerName || 'No player saved'
                    const displayPayerName = job.billingName || job.customerName || 'No payer saved'
                    const displayPayerEmail = job.billingEmail || job.customerEmail

                    return (
                      <article className="order-job-card" key={job.id}>
                        <div className="split-heading">
                          <div>
                            <span className="profile-type-pill">
                              {job.origin === 'website' ? 'Website' : 'Sales intake'}
                            </span>
                            <h3>
                              {job.shopifyOrderName ||
                                job.shopifyDraftOrderName ||
                                'Unnumbered Shopify order'}
                            </h3>
                            <p>
                              {displayPlayerName} ·{' '}
                              {job.productTitle}
                              {job.variantTitle ? ` / ${job.variantTitle}` : ''}
                            </p>
                          </div>
                          <div className="profile-actions">
                            <span className={`pill ${job.invoiceStatus === 'paid' ? 'yes' : ''}`}>
                              {invoiceStatusLabels[job.invoiceStatus]}
                            </span>
                            <span className="profile-count">Qty {job.quantity}</span>
                          </div>
                        </div>

                        <div className="order-job-grid">
                          <div className="compatible-list">
                            <span>Player and billing</span>
                            <p>Order placed: {formatOrderDateTime(job.orderSubmittedAt || job.createdAt)}</p>
                            <p>Player: {displayPlayerName}</p>
                            {job.playerEmail ? <p>Player email: {job.playerEmail}</p> : null}
                            <p>Bill to: {displayPayerName}</p>
                            {displayPayerEmail ? <p>Billing email: {displayPayerEmail}</p> : null}
                            {job.billingPhone ? <p>Billing phone: {job.billingPhone}</p> : null}
                            {job.billingCompany ? <p>Team/agency: {job.billingCompany}</p> : null}
                            {job.billingRelationship ? (
                              <p>Relationship: {job.billingRelationship}</p>
                            ) : null}
                          </div>

                          <div className="compatible-list">
                            <span>Build specs</span>
                            <p>Model: {job.specs.model || 'Not specified'}</p>
                            <p>Length: {job.specs.length || 'N/A'}</p>
                            <p>Weight: {job.specs.targetWeight || 'N/A'}</p>
                            <p>Wood species: {job.specs.wood || 'N/A'}</p>
                            <p>Handle color: {job.specs.handleColor || 'N/A'}</p>
                            <p>Barrel color: {job.specs.barrelColor || 'N/A'}</p>
                            <p>Logo color: {job.specs.logoColor || 'N/A'}</p>
                            <p>Engraving: {job.specs.engraving || 'N/A'}</p>
                            <p>Cup: {job.specs.cupped || 'N/A'}</p>
                            {job.specs.notes ? <p>{job.specs.notes}</p> : null}
                          </div>

                          <div className="job-controls">
                            <label>
                              Production status
                              <select
                                value={job.productionStatus}
                                onChange={(event) =>
                                  updateOrderJob(job.id, {
                                    productionStatus: event.target.value as ProductionStatus,
                                  })
                                }
                              >
                                {Object.entries(productionStatusLabels).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              Assigned billet
                              <select
                                value={job.assignedBilletId}
                                onChange={(event) =>
                                  updateOrderJob(job.id, { assignedBilletId: event.target.value })
                                }
                              >
                                <option value="">No billet assigned</option>
                                {availableBilletsForJob.map((billet) => (
                                  <option key={billet.id} value={billet.id}>
                                    {getBilletLabel(billet)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="form-row">
                              <label>
                                Player
                                <input
                                  value={job.playerName}
                                  onChange={(event) =>
                                    updateOrderJob(job.id, { playerName: event.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Bill to
                                <input
                                  value={job.billingName}
                                  onChange={(event) =>
                                    updateOrderJob(job.id, { billingName: event.target.value })
                                  }
                                />
                              </label>
                            </div>

                            <label>
                              Sales rep
                              <input
                                value={job.salesRep}
                                onChange={(event) =>
                                  updateOrderJob(job.id, { salesRep: event.target.value })
                                }
                              />
                            </label>

                            <label className="notes-field">
                              Internal notes
                              <textarea
                                value={job.internalNotes}
                                placeholder="Production, invoicing, or customer communication notes"
                                onChange={(event) =>
                                  updateOrderJob(job.id, { internalNotes: event.target.value })
                                }
                              />
                            </label>

                            {job.shopifyDraftOrderId && job.invoiceStatus === 'draft' ? (
                              <>
                                {job.shopifyDraftInvoiceUrl ? (
                                  <a
                                    className="secondary-button"
                                    href={job.shopifyDraftInvoiceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Review draft invoice
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => sendInvoiceForJob(job)}
                                >
                                  Send Shopify invoice
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="order-job-footer">
                          <p>
                            Payment: {job.financialStatus || 'unknown'} · Fulfillment:{' '}
                            {job.fulfillmentStatus || 'unknown'}
                          </p>
                          <p>
                            {assignedBillet
                              ? `Billet ${assignedBillet.barcode} assigned`
                              : 'No billet assigned yet'}
                          </p>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          </section>
        </section>
      ) : activeSection === 'players' ? (
        <section className="profiles-page">
          <section className="panel profile-entry-panel">
            <div className="section-heading">
              <p className="eyebrow">Add Player/Trainer</p>
              <h2>Store a bat profile</h2>
            </div>

            <form className="bat-form profile-entry-form" onSubmit={addProfileBat}>
              <div className="form-instructions">
                <strong>
                  {variantTargetProfileId
                    ? `Add a new variant to ${playerNameDraft || 'this profile'}`
                    : 'Enter a new Player or Trainer bat record'}
                </strong>
                <p>
                  Choose whether this is a Player or Trainer first, then add the model,
                  finished bat specs, wood tier, color notes, and any billets that can make it.
                  If the name already exists, this saves as another bat variation under that profile.
                </p>
                {variantTargetProfileId ? (
                  <p>
                    This will be saved inside the existing {profileKindDraft.toLowerCase()} profile
                    for {playerNameDraft}.
                  </p>
                ) : null}
              </div>

              <div className="form-row">
                <label>
                  Player or Trainer
                  <select
                    value={profileKindDraft}
                    onChange={(event) => {
                      setProfileKindDraft(event.target.value as ProfileKind)
                      setVariantTargetProfileId(null)
                    }}
                  >
                    <option>Player</option>
                    <option>Trainer</option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    value={playerNameDraft}
                    placeholder={profileKindDraft === 'Player' ? 'Example: Corey Seager' : 'Example: Team Trainer'}
                    onChange={(event) => {
                      setPlayerNameDraft(event.target.value)
                      setVariantTargetProfileId(null)
                    }}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Model number
                  <input
                    value={batDraft.modelNumber}
                    placeholder="Example: CS271"
                    onChange={(event) =>
                      setBatDraft({ ...batDraft, modelNumber: event.target.value })
                    }
                  />
                </label>
                <label>
                  Length
                  <input
                    type="number"
                    step="0.25"
                    value={batDraft.length}
                    placeholder="Example: 34"
                    onChange={(event) =>
                      setBatDraft({
                        ...batDraft,
                        length: event.target.value === '' ? '' : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Weight
                  <input
                    value={batDraft.weight}
                    placeholder={profileKindDraft === 'Trainer' ? 'Example: 95+ or 30-33' : 'Example: 32'}
                    onChange={(event) => setBatDraft({ ...batDraft, weight: event.target.value })}
                  />
                </label>
                <label>
                  Wood tier
                  <select
                    value={batDraft.woodTier}
                    onChange={(event) =>
                      setBatDraft({ ...batDraft, woodTier: event.target.value as WoodTier })
                    }
                  >
                    {woodTierOptions.map((tier) => (
                      <option key={tier}>{tier}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Color preferences
                <input
                  value={batDraft.colorPreferences}
                  placeholder="Example: all black"
                  onChange={(event) =>
                    setBatDraft({ ...batDraft, colorPreferences: event.target.value })
                  }
                />
              </label>

              <fieldset className="billet-picker">
                <legend>Billets that can make this model</legend>
                <div>
                  {billets.map((billet) => (
                    <label className="checkbox-row" key={billet.id}>
                      <input
                        type="checkbox"
                        checked={batDraft.compatibleBilletIds.includes(billet.id)}
                        onChange={() => toggleCompatibleBillet(billet.id)}
                      />
                      <span>{getBilletLabel(billet)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="notes-field">
                Notes
                <textarea
                  value={batDraft.notes}
                  placeholder="Feel, balance, knob, cup, trainer use case, or production notes"
                  onChange={(event) => setBatDraft({ ...batDraft, notes: event.target.value })}
                />
              </label>

              <div className="input-action-row">
                <button type="submit">
                  {variantTargetProfileId ? 'Save variant' : 'Save Player/Trainer bat'}
                </button>
                {variantTargetProfileId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setVariantTargetProfileId(null)
                      setPlayerNameDraft('')
                      setBatDraft(emptyBat)
                    }}
                  >
                    Cancel variant
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="panel profile-search-panel">
            <div className="inventory-toolbar profile-toolbar">
              <div className="section-heading">
                <p className="eyebrow">Search database</p>
                <h2>Stored profiles</h2>
              </div>
              <input
                aria-label="Search players and trainers"
                placeholder="Search name, type, model, wood tier, color, billet..."
                value={playerQuery}
                onChange={(event) => setPlayerQuery(event.target.value)}
              />
            </div>

            <div className="profile-results">
              {filteredPlayers.length === 0 ? (
                <p className="empty-state">No Player/Trainer profiles match that search yet.</p>
              ) : (
                filteredPlayers.map((profile) => (
                  <article className="profile-result-card" key={profile.id}>
                    <div className="split-heading">
                      <div>
                        <span className="profile-type-pill">{profile.profileKind}</span>
                        <h3>{profile.playerName}</h3>
                      </div>
                      <div className="profile-actions">
                        <span className="profile-count">{profile.bats.length} bats</span>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => startAddVariant(profile)}
                        >
                          Add variant
                        </button>
                      </div>
                    </div>

                    <div className="bat-list">
                      {profile.bats.map((bat) => (
                        <article className="bat-card" key={bat.id}>
                          <div>
                            <span>Model {bat.modelNumber}</span>
                            <strong>
                              {bat.length} in / {bat.weight} oz
                            </strong>
                            <p>Wood tier: {bat.woodTier}</p>
                            <p>{bat.colorPreferences || 'No color preferences saved.'}</p>
                            {bat.notes ? <p>{bat.notes}</p> : null}
                          </div>
                          <div className="compatible-list">
                            <span>Compatible billets</span>
                            {bat.compatibleBilletIds.length === 0 ? (
                              <p>No billets selected.</p>
                            ) : (
                              bat.compatibleBilletIds.map((id) => {
                                const billet = billets.find((item) => item.id === id)
                                return <p key={id}>{billet ? getBilletLabel(billet) : id}</p>
                              })
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      ) : activeSection === 'models' ? (
        <section className="models-page">
          <section className="panel model-entry-panel">
            <div className="section-heading">
              <p className="eyebrow">Bat Model Repository</p>
              <h2>Record a produced bat or one-off run</h2>
            </div>

            <form className="bat-form model-record-form" onSubmit={addProducedBatRecord}>
              <div className="form-instructions">
                <strong>Use this as the first stop after a bat is made</strong>
                <p>
                  Save exact production specs here whenever a bat is made, especially for a
                  one-off pro run, a new trainer variation, or any model that is not yet part
                  of the public website catalog.
                </p>
                <p>
                  {shopifyCatalog.length > 0
                    ? `Shopify catalog sync is live with ${shopifyCatalog.length} products available, but the fields below can also store internal-only runs that are not tied to a live product.`
                    : 'Using the internal model list until Shopify catalog sync is available.'}
                </p>
              </div>

              <div className="form-row">
                <label>
                  Bat type
                  <select
                    value={producedBatDraft.batType}
                    onChange={(event) =>
                      setProducedBatDraft({
                        ...producedBatDraft,
                        batType: event.target.value as ProducedBatRecord['batType'],
                        modelId:
                          event.target.value === 'Trainer'
                            ? trainerBatModels[0]?.id ?? ''
                            : producedBatDraft.modelId,
                        sourceModelId:
                          event.target.value === 'Trainer'
                            ? nonTrainerBatModels[0]?.id ?? ''
                            : '',
                      })
                    }
                  >
                    {batTypeOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                {producedBatDraft.batType === 'Game' ? (
                  <label>
                    Model number
                    <input
                      value={producedBatDraft.customModelName}
                      placeholder="Example: MT7.2"
                      onChange={(event) =>
                        setProducedBatDraft({
                          ...producedBatDraft,
                          customModelName: event.target.value,
                        })
                      }
                    />
                  </label>
                ) : producedBatDraft.batType === 'Trainer' ? (
                  <label>
                    Trainer
                    <select
                      value={producedBatDraft.modelId}
                      onChange={(event) =>
                        setProducedBatDraft({
                          ...producedBatDraft,
                          modelId: event.target.value,
                        })
                      }
                    >
                      {trainerBatModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Trophy model name
                    <input
                      value={producedBatDraft.customModelName}
                      placeholder="Example: MT7.2 Trophy"
                      onChange={(event) =>
                        setProducedBatDraft({
                          ...producedBatDraft,
                          customModelName: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
                <label>
                  Length
                  <input
                    value={producedBatDraft.length}
                    placeholder="Example: 34"
                    onChange={(event) =>
                      setProducedBatDraft({ ...producedBatDraft, length: event.target.value })
                    }
                  />
                </label>
                <label>
                  Bat weight
                  <input
                    value={producedBatDraft.weight}
                    placeholder="Example: 32"
                    onChange={(event) =>
                      setProducedBatDraft({ ...producedBatDraft, weight: event.target.value })
                    }
                  />
                </label>
              </div>

              {producedBatDraft.batType === 'Trainer' ? (
                <div className="form-row">
                  <label>
                    Bat model used to cut this trainer
                    <select
                      value={producedBatDraft.sourceModelId}
                      onChange={(event) =>
                        setProducedBatDraft({
                          ...producedBatDraft,
                          sourceModelId: event.target.value,
                        })
                      }
                    >
                      {nonTrainerBatModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} - {model.category}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="form-row">
                <label>
                  Billet barcode/serial used
                  <select
                    value={producedBatDraft.billetIds[0] ?? ''}
                    onChange={(event) => {
                      const selectedBillet = billets.find((billet) => billet.id === event.target.value)
                      setProducedBatDraft({
                        ...producedBatDraft,
                        billetIds: event.target.value ? [event.target.value] : [],
                        billetWeight:
                          selectedBillet && typeof selectedBillet.weight === 'number'
                            ? String(selectedBillet.weight)
                            : producedBatDraft.billetWeight,
                        billetGrade: selectedBillet?.grade ?? producedBatDraft.billetGrade,
                      })
                    }}
                  >
                    <option value="">Select billet barcode/serial</option>
                    {selectableBillets.map((billet) => (
                      <option key={billet.id} value={billet.id}>
                        {billet.barcode} - {billet.species} {billet.grade}
                        {typeof billet.weight === 'number' ? ` - ${billet.weight} oz` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Billet weight
                  <input
                    value={producedBatDraft.billetWeight}
                    placeholder="Example: 91"
                    onChange={(event) =>
                      setProducedBatDraft({
                        ...producedBatDraft,
                        billetWeight: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Billet grade
                  <select
                    value={producedBatDraft.billetGrade}
                    onChange={(event) =>
                      setProducedBatDraft({
                        ...producedBatDraft,
                        billetGrade: event.target.value as Grade,
                      })
                    }
                  >
                    {allGradeOptions.map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Cupped?
                  <select
                    value={producedBatDraft.cupped}
                    onChange={(event) =>
                      setProducedBatDraft({
                        ...producedBatDraft,
                        cupped: event.target.value as ProducedBatRecord['cupped'],
                      })
                    }
                  >
                    {cupOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="notes-field">
                Notes
                <textarea
                  value={producedBatDraft.modifications}
                  placeholder="Modifications, one-off details, trainer notes, or any other production commentary"
                  onChange={(event) =>
                    setProducedBatDraft({
                      ...producedBatDraft,
                      modifications: event.target.value,
                    })
                  }
                />
              </label>

              <div className="nested-form optional-link-panel">
                <strong>Optional Shopify link</strong>
                <div className="form-row">
                  <label>
                    Linked Shopify product
                    <select
                      value={producedBatDraft.shopifyProductId}
                      onChange={(event) =>
                        setProducedBatDraft((current) => ({
                          ...current,
                          shopifyProductId: event.target.value,
                          shopifyVariantId: '',
                        }))
                      }
                    >
                      <option value="">Not linked yet</option>
                      {shopifyCatalog.map((product) => (
                        <option value={product.id} key={product.id}>
                          {product.name} - {product.category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Linked variant
                    <select
                      value={producedBatDraft.shopifyVariantId}
                      disabled={!selectedShopifyProduct}
                      onChange={(event) =>
                        setProducedBatDraft((current) => ({
                          ...current,
                          shopifyVariantId: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {selectedShopifyProduct ? 'Select a variant' : 'Choose a product first'}
                      </option>
                      {selectedShopifyProduct?.variants.map((variant) => (
                        <option value={variant.id} key={variant.id}>
                          {variant.title}
                          {typeof variant.inventoryQuantity === 'number'
                            ? ` - on hand ${variant.inventoryQuantity}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedShopifyProduct ? (
                  <p className="helper-text">
                    Linked to Shopify product {selectedShopifyProduct.name}
                    {selectedShopifyVariant ? ` / ${selectedShopifyVariant.title}` : ''}.
                  </p>
                ) : null}
              </div>

              <button type="submit">Save production record</button>
            </form>
          </section>

          <section className="panel model-search-panel">
            <div className="inventory-toolbar profile-toolbar">
              <div className="section-heading">
                <p className="eyebrow">Product list</p>
                <h2>{allBatModels.length} bat models</h2>
              </div>
              <input
                aria-label="Search bat model repository"
                placeholder="Search model, category, length, weight, modification..."
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
              />
            </div>

            <div className="model-results">
              {filteredBatModels.map((model) => {
                const records = producedBats.filter((record) => record.modelId === model.id)

                return (
                  <article className="profile-result-card" key={model.id}>
                    <div className="split-heading">
                      <div>
                        <span className="profile-type-pill">{model.category}</span>
                        <h3>{model.name}</h3>
                        <p>
                          {model.source === 'shopify'
                            ? `Shopify product${model.variantCount ? ` · ${model.variantCount} variants` : ''}${typeof model.inventoryOnHand === 'number' ? ` · ${model.inventoryOnHand} on hand` : ''}`
                            : model.source === 'custom'
                              ? 'Internal custom model'
                              : 'Seed catalog model'}
                        </p>
                      </div>
                      <span className="profile-count">{records.length} records</span>
                    </div>

                        {records.length === 0 ? (
                      <p className="empty-state">No production records stored for this model yet.</p>
                    ) : (
                      <div className="bat-list">
                        {records.map((record) => (
                          <article className="bat-card" key={record.id}>
                            <div>
                              <span>{getBatModelName(record.modelId, allBatModels)}</span>
                              <strong>
                                {record.length} in / {record.weight} oz
                              </strong>
                              <p>Bat type: {record.batType}</p>
                              {(record.customModelName || record.batType === 'Trainer') && (
                                <p>
                                  {record.batType === 'Trainer'
                                    ? `Cut from: ${getBatModelName(record.sourceModelId, allBatModels)}`
                                    : `Model number: ${record.customModelName}`}
                                </p>
                              )}
                              <p>
                                Billet: {record.billetWeight} oz / {record.billetGrade}
                              </p>
                              <p>Cup: {record.cupped}</p>
                              {record.shopifyProductId ? (
                                <p>
                                  Shopify link:{' '}
                                  {shopifyCatalog.find((product) => product.id === record.shopifyProductId)
                                    ?.name ?? 'Linked product'}
                                  {record.shopifyVariantId
                                    ? ` / ${
                                        shopifyCatalog
                                          .find((product) => product.id === record.shopifyProductId)
                                          ?.variants.find((variant) => variant.id === record.shopifyVariantId)
                                          ?.title ?? 'Linked variant'
                                      }`
                                    : ''}
                                </p>
                              ) : null}
                              {record.modifications ? <p>{record.modifications}</p> : null}
                            </div>
                            <div className="compatible-list">
                              <span>Billets used</span>
                              {record.billetIds.length === 0 ? (
                                <p>No billets selected.</p>
                              ) : (
                                record.billetIds.map((id) => {
                                  const billet = billets.find((item) => item.id === id)
                                  return <p key={id}>{billet ? getBilletLabel(billet) : id}</p>
                                })
                              )}
                              <button
                                type="button"
                                className="secondary-button destructive-button"
                                onClick={() => deleteProducedBatRecord(record.id)}
                              >
                                Delete record
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </section>
      ) : (
        <section className="costs-page">
          <section className="panel cost-guide-panel">
            <div className="inventory-toolbar profile-toolbar">
              <div className="section-heading">
                <p className="eyebrow">Billet Cost Guide</p>
                <h2>Supplier pricing reference</h2>
              </div>
              <div className="filters">
                <input
                  aria-label="Search billet cost guide"
                  placeholder="Search source, species, tier, weight range..."
                  value={costQuery}
                  onChange={(event) => setCostQuery(event.target.value)}
                />
                <select
                  aria-label="Filter costs by source"
                  value={costSourceFilter}
                  onChange={(event) => setCostSourceFilter(event.target.value as 'all' | Source)}
                >
                  <option value="all">All sources</option>
                  {sourceOptions.map((source) => (
                    <option value={source} key={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter costs by species"
                  value={costSpeciesFilter}
                  onChange={(event) => setCostSpeciesFilter(event.target.value as 'all' | Species)}
                >
                  <option value="all">All species</option>
                  {speciesOptions.map((species) => (
                    <option value={species} key={species}>
                      {species}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-instructions">
              <strong>Use this as the cost reference when choosing a billet</strong>
              <p>
                These prices were transcribed from the attached supplier price lists. This
                guide is intentionally separate from receiving inventory so we can later
                compare compatible billets and choose the cheapest billet that still fits
                the exact bat purpose.
              </p>
            </div>

            <div className="cost-results">
              {filteredCosts.map((item) => (
                <article className="cost-card" key={item.id}>
                  <div>
                    <span className="profile-type-pill">{item.source}</span>
                    <h3>
                      {item.species} / {item.tier}
                    </h3>
                    <p>{item.weightRange}</p>
                  </div>
                  <strong>{item.price}</strong>
                  <p>{item.notes}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}
    </main>
  )
}

function App() {
  // Keep the public order form on explicit public paths only. Every other
  // route should open the internal inventory tool so the two experiences
  // never silently fall back into each other.
  if (isPublicOrderFormRoute()) {
    return <PublicSalesOrderForm />
  }

  if (isInternalToolRoute()) {
    return <InternalApp />
  }

  return <InternalApp />
}

export default App
