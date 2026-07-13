import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
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

type ActiveSection = 'inventory' | 'orders' | 'sales' | 'crm' | 'players' | 'models' | 'costs'
type BilletStatus = 'storage' | 'production'
type OrderOrigin = 'website' | 'internal_sales'
type ProductionStatus = 'new' | 'waiting_payment' | 'ready' | 'in_production' | 'complete' | 'cancelled'
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'not_required'

type Species = 'Maple' | 'Birch' | 'Ash'
type Grade = 'Prime' | 'Select' | 'Choice' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type KnotStatus = 'Yes' | 'No' | 'N/A'
type WoodTier = 'Prime' | 'Select' | 'Choice' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type Source = "RJ's Tree Farms" | 'Great Lakes Veneer' | 'Champeau' | 'Cahan'
type ProfileKind = 'Player' | 'Trainer'

type Billet = {
  id: string
  barcode: string
  species: Species
  grade: Grade
  trophyEligible: boolean
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
type InventoryTrophyFilter = 'yes' | 'no'

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
  source: Source | ''
  species: Species
  woodTier: WoodTier
  colorPreferences: string
  idealBilletWeight: string
  compatibleBilletIds: string[]
  notes: string
}

type EditingVariantTarget = {
  profileId: string
  variantId: string
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
  bandColor: string
  logoColor: string
  engraving: string
  cupped: string
  notes: string
}

type OrderAttachment = {
  id: string
  shopifyFileId: string
  filename: string
  downloadUrl: string
  contentType: string
  bytes: number
  uploadedAt: string
  fileStatus: string
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
  salesRepEmail: string
  salesRepSubmissionNotificationSentAt: string
  salesRepPaidNotificationSentAt: string
  totalPrice: string
  currency: string
  specs: OrderSpecs
  lineItems: Array<{
    title: string
    quantity: number
    variantId: string
    productId: string
  }>
  internalAttachment: OrderAttachment | null
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
  bandColor: string
  logoColor: string
  engraving: string
  cupped: 'Yes' | 'No'
  wood: Species | 'Other'
  notes: string
}

type ShippingSpeedOption = 'standard' | 'fast' | 'really_fast' | 'comped'
type ProductionTimelineOption = 'normal' | 'rush'
const maxSalesOrderAttachmentBytes = 20 * 1024 * 1024

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
  salesRepEmail: string
  attachment: OrderAttachment | null
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
  crmContacts: CrmContact[]
}

type RemoteStateDeletes = Partial<Record<keyof RemoteState, string[]>>
type RemoteStatePatch = Partial<RemoteState> & {
  deletes?: RemoteStateDeletes
}

type SalesDashboardRange = '30' | '90' | 'all'

type SalesDashboardSale = {
  key: string
  draftOrderName: string
  paidOrderName: string
  salesRep: string
  salesRepEmail: string
  customerName: string
  payerName: string
  submittedAt: string
  paidAt: string
  invoiceStatus: InvoiceStatus
  isPaid: boolean
  total: number
  quantity: number
  lineCount: number
  productSummary: string
}

type SalesRepSummary = {
  key: string
  label: string
  email: string
  submittedCount: number
  submittedValue: number
  paidCount: number
  paidValue: number
  openCount: number
  openValue: number
  averageDaysToPay: number | null
}

type CrmStage =
  | 'lead'
  | 'qualified'
  | 'quoted'
  | 'invoice_sent'
  | 'active_customer'
  | 'nurture'
  | 'lost'

type CrmPriority = 'hot' | 'warm' | 'steady' | 'low'
type CrmWorkspaceView = 'new_contact' | 'contact_list' | 'leads' | 'engagements' | 'assistant'
type CrmTouchpointType =
  | 'call'
  | 'text'
  | 'email'
  | 'instagram_dm'
  | 'in_person'
  | 'social'
  | 'quote'
  | 'invoice'
  | 'note'
type SalesPortalView = 'crm' | 'order_form' | 'orders' | 'reports'

type CrmTouchpoint = {
  id: string
  type: CrmTouchpointType
  contactedAt: string
  salesRep: string
  summary: string
  sentiment: string
  nextStep: string
  nextFollowUpAt: string
  relatedOrderId: string
}

type CrmContact = {
  id: string
  name: string
  company: string
  role: string
  email: string
  phone: string
  alternateContacts: string
  playerNames: string[]
  salesOwner: string
  ownerEmail: string
  stage: CrmStage
  priority: CrmPriority
  source: string
  tags: string[]
  preferredContactMethod: string
  buyingContext: string
  batPreferences: string
  relationshipNotes: string
  objections: string
  opportunities: string
  followUpAt: string
  lastContactedAt: string
  createdAt: string
  updatedAt: string
  touchpoints: CrmTouchpoint[]
  sandboxOnly: boolean
}

type CrmTouchpointDraft = {
  type: CrmTouchpointType
  contactedAt: string
  salesRep: string
  summary: string
  sentiment: string
  nextStep: string
  nextFollowUpAt: string
  relatedOrderId: string
}

type CrmContactSummary = {
  contact: CrmContact
  orders: OrderJob[]
  orderCount: number
  submittedValue: number
  paidValue: number
  openValue: number
  openInvoiceCount: number
  lastOrderAt: string
  lastActivityAt: string
  followUpDue: boolean
  derivedFromOrders: boolean
}

type CrmOwnerOption = {
  key: string
  label: string
  name: string
  email: string
}

type SalesPortalSession = {
  email: string
  name?: string
  label?: string
  isAdmin?: boolean
  loggedInAt: string
}

type SalesPortalOrder = {
  id: string
  ownerName: string
  ownerEmail: string
  submittedAt: string
  contactId: string
  playerName: string
  payerName: string
  payerEmail: string
  payerPhone: string
  total: number
  status: 'local_saved' | 'submitted'
  draft: SalesOrderDraft
}

const billetStorageKey = 'trinity-billet-sandbox-v5'
const playerStorageKey = 'trinity-player-profiles-v3'
const producedBatStorageKey = 'trinity-produced-bats-v1'
const customBatModelStorageKey = 'trinity-custom-bat-models-v1'
const orderJobStorageKey = 'trinity-order-jobs-v1'
const billingContactStorageKey = 'trinity-billing-contacts-v1'
const crmContactStorageKey = 'trinity-crm-sandbox-contacts-v1'
const crmActiveOwnerStorageKey = 'trinity-crm-sandbox-active-owner-v1'
const salesPortalSessionStorageKey = 'trinity-sales-portal-session-v1'
const salesPortalOrderStorageKey = 'trinity-sales-portal-orders-v1'
const legacyLocalStateBackupKey = 'trinity-local-recovery-backup-v1'
const legacyLocalStateKeys = [
  billetStorageKey,
  playerStorageKey,
  producedBatStorageKey,
  customBatModelStorageKey,
  orderJobStorageKey,
  billingContactStorageKey,
  crmContactStorageKey,
  crmActiveOwnerStorageKey,
]

const standardBilletLength = 37
const standardBilletDiameter = 2.75
const rjBilletDiameter = 2.79
const billetDiameterWeightCorrectionOz = 1.75
const defaultMoisture = 8
const speciesOptions: Species[] = ['Maple', 'Birch', 'Ash']
const allGradeOptions: Grade[] = ['Prime', 'Select', 'Choice', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceGradeOptions: Record<Source, Grade[]> = {
  "RJ's Tree Farms": ['Prime', 'Select', 'Choice'],
  'Great Lakes Veneer': ['Prime', 'Select', 'Choice'],
  Cahan: ['Prime', 'Select', 'Choice'],
  Champeau: ['Pro', 'Semi-Pro', 'Promo', 'Blem'],
}
const woodTierOptions: WoodTier[] = ['Prime', 'Select', 'Choice', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceOptions: Source[] = ["RJ's Tree Farms", 'Great Lakes Veneer', 'Cahan', 'Champeau']
const oversizedDiameterSources = new Set<Source>(["RJ's Tree Farms", 'Cahan'])
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
const salesDashboardRangeOptions: Array<{ value: SalesDashboardRange; label: string }> = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]
const crmStageOptions: Array<{ value: CrmStage; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'invoice_sent', label: 'Invoice sent' },
  { value: 'active_customer', label: 'Active customer' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'lost', label: 'Lost' },
]
const crmPriorityOptions: Array<{ value: CrmPriority; label: string }> = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'steady', label: 'Steady' },
  { value: 'low', label: 'Low' },
]
const crmTouchpointTypeOptions: Array<{ value: CrmTouchpointType; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'instagram_dm', label: 'IG DM' },
  { value: 'in_person', label: 'In person' },
  { value: 'social', label: 'Social' },
  { value: 'quote', label: 'Quote' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'note', label: 'Note' },
]
const crmContactMethodOptions = ['Call', 'Text', 'Email', 'In person', 'Instagram', 'Any']
const crmWorkspaceViews: Array<{ value: CrmWorkspaceView; label: string }> = [
  { value: 'new_contact', label: 'New contact' },
  { value: 'contact_list', label: 'Contact list' },
  { value: 'leads', label: 'Leads' },
  { value: 'engagements', label: 'Engagements' },
  { value: 'assistant', label: 'CRM assistant' },
]
const seedCrmOwnerOptions: CrmOwnerOption[] = [
  { key: 'keith@trinitybats.com', label: 'Keith', name: 'Keith', email: 'keith@trinitybats.com' },
  { key: 'daniel@trinitybats.com', label: 'Daniel', name: 'Daniel', email: 'daniel@trinitybats.com' },
  { key: 'shane@trinitybats.com', label: 'Shane', name: 'Shane', email: 'shane@trinitybats.com' },
  { key: 'steve@trinitybats.com', label: 'Steve', name: 'Steve', email: 'steve@trinitybats.com' },
  { key: 'jeremy-maddox', label: 'Jeremy Maddox', name: 'Jeremy Maddox', email: '' },
  {
    key: 'jeremy@trinitybats.com',
    label: 'Jeremy McKee',
    name: 'Jeremy McKee',
    email: 'jeremy@trinitybats.com',
  },
  { key: 'matt@trinitybats.com', label: 'Matt', name: 'Matt', email: 'matt@trinitybats.com' },
  { key: 'stefan@trinitybats.com', label: 'Stefan', name: 'Stefan', email: 'stefan@trinitybats.com' },
  { key: 'henry@trinitybats.com', label: 'Henry', name: 'Henry', email: 'henry@trinitybats.com' },
  { key: 'nick@trinitybats.com', label: 'Nick', name: 'Nick', email: 'nick@trinitybats.com' },
  { key: 'scott@trinitybats.com', label: 'Scott', name: 'Scott', email: 'scott@trinitybats.com' },
  { key: 'brandon@trinitybats.com', label: 'Brandon', name: 'Brandon', email: 'brandon@trinitybats.com' },
]
const salesPortalAdminEmails = new Set([
  'matt@trinitybats.com',
  'stefan@trinitybats.com',
  'jeremy@trinitybats.com',
  'keith@trinitybats.com',
])
const salesPortalViews: Array<{ value: SalesPortalView; label: string; adminOnly?: boolean }> = [
  { value: 'crm', label: 'CRM' },
  { value: 'order_form', label: 'Order form' },
  { value: 'orders', label: 'Orders' },
  { value: 'reports', label: 'Reports' },
]
const handleColorOptions = [
  'Natural',
  'Red',
  'Walnut Stain',
  'Blood Red',
  'Crimson Stain',
  'White Wash',
  'White',
  'Gray',
  'Black',
  'Clear Gloss',
  'Matte Black',
  'Forest Green',
  'Navy Blue',
  'Royal Blue',
  'Electric Blue',
  'Spa Blue',
  'Denim Blue Stain',
  'Pecan Stain',
  'Ebony Stain',
  'Classic Brown Stain',
  'Yellow',
  'Purple',
  'Matte Army Tank Green',
  'Maroon',
  'Pink',
  'Orange',
  'Seaside',
  'Flamed',
  'Smoke Flame',
]
const barrelColorOptions = [
  'Natural',
  'Red',
  'Walnut Stain',
  'Black',
  'Blood Red',
  'Forest Green',
  'Crimson Stain',
  'Gray',
  'White Wash',
  'White',
  'Matte Black',
  'Clear Gloss',
  'Navy Blue',
  'Royal Blue',
  'Electric Blue',
  'Spa Blue',
  'Denim Blue Stain',
  'Pecan Stain',
  'Ebony Stain',
  'Brown Stain',
  'Yellow',
  'Purple',
  'Matte Army Tank Green',
  'Maroon',
  'Pink',
  'Orange',
  'Seaside',
  'Flamed',
  'Smoke Flame',
]
const bandColorOptions = ['Yellow', 'White', 'Red', 'Natural', 'Gray', 'Gold', 'Black']
const logoColorOptions = [
  'Black',
  'Electric Blue',
  'Forest Green',
  'Gold',
  'Gray',
  'Maroon',
  'Navy Blue',
  'Orange',
  'Pink',
  'Purple',
  'Red',
  'Royal Blue',
  'Seaside',
  'Spa Blue',
  'White',
  'Yellow',
  'Silver',
  'Cosmic-Black',
  'Iridescent Chrome',
  'Silver Foil',
  'Gold Foil',
  'Red Hologram',
  'Light Blue Hologram',
  'Lime Green',
]
const batTypeOptions: ProducedBatRecord['batType'][] = ['Game', 'Trainer', 'Trophy']
const autoNonMlbGrades = new Set<Grade>(['Choice', 'Semi-Pro', 'Promo', 'Blem'])

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
    trophyEligible: false,
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
    trophyEligible: false,
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
    trophyEligible: false,
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
        source: 'Great Lakes Veneer',
        species: 'Birch',
        woodTier: 'Prime',
        colorPreferences: 'All black',
        idealBilletWeight: '91',
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
  trophyEligible: false,
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
  source: '',
  species: 'Maple',
  woodTier: 'Prime',
  colorPreferences: '',
  idealBilletWeight: '',
  compatibleBilletIds: [],
  notes: '',
}

function createBatDraftFromVariation(bat: BatVariation): Omit<BatVariation, 'id'> {
  return {
    modelNumber: bat.modelNumber,
    length: bat.length,
    weight: bat.weight,
    source: bat.source,
    species: bat.species,
    woodTier: bat.woodTier,
    colorPreferences: bat.colorPreferences,
    idealBilletWeight: bat.idealBilletWeight,
    compatibleBilletIds: [...bat.compatibleBilletIds],
    notes: bat.notes,
  }
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
  bandColor: '',
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
  salesRepEmail: '',
  attachment: null,
  notes: '',
  createDraftOrder: true,
  sendInvoice: false,
  lines: [emptySalesLine()],
})

const emptyCrmTouchpointDraft = (): CrmTouchpointDraft => ({
  type: 'call',
  contactedAt: new Date().toISOString().slice(0, 10),
  salesRep: '',
  summary: '',
  sentiment: '',
  nextStep: '',
  nextFollowUpAt: '',
  relatedOrderId: '',
})

const emptyCrmContact = (): CrmContact => {
  const now = new Date().toISOString()

  return {
    id: createId('crm-contact'),
    name: '',
    company: '',
    role: '',
    email: '',
    phone: '',
    alternateContacts: '',
    playerNames: [],
    salesOwner: '',
    ownerEmail: '',
    stage: 'lead',
    priority: 'steady',
    source: '',
    tags: [],
    preferredContactMethod: 'Any',
    buyingContext: '',
    batPreferences: '',
    relationshipNotes: '',
    objections: '',
    opportunities: '',
    followUpAt: '',
    lastContactedAt: '',
    createdAt: now,
    updatedAt: now,
    touchpoints: [],
    sandboxOnly: true,
  }
}

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
  if (standardBilletLength < build.length + 2.5) return 0

  const targetBilletWeight = build.targetWeight + 18
  const billetWeight = typeof billet.weight === 'number' ? billet.weight : targetBilletWeight
  const weightScore = Math.max(0, 40 - Math.abs(billetWeight - targetBilletWeight) * 4)
  const lengthScore = Math.min(30, (standardBilletLength - build.length) * 5)
  const gradeScore = billet.grade === build.grade ? 15 : 8
  const moistureScore = billet.moisture >= 6.5 && billet.moisture <= 9 ? 15 : 5

  return Math.round(weightScore + lengthScore + gradeScore + moistureScore)
}

function getAdjustedTargetBilletWeight(
  referenceSource: Source,
  idealWeight: number,
  candidateSource: Source,
) {
  const referenceIsOversized = oversizedDiameterSources.has(referenceSource)
  const candidateIsOversized = oversizedDiameterSources.has(candidateSource)

  if (referenceIsOversized === candidateIsOversized) return idealWeight
  return referenceIsOversized
    ? idealWeight - billetDiameterWeightCorrectionOz
    : idealWeight + billetDiameterWeightCorrectionOz
}

function getProfileBilletMatches(bat: BatVariation, billets: Billet[]) {
  const idealWeight = Number(bat.idealBilletWeight)
  if (!bat.source || !Number.isFinite(idealWeight)) return []

  return billets
    .map((billet) => {
      const billetWeight = typeof billet.weight === 'number' ? billet.weight : null
      const adjustedTargetWeight = getAdjustedTargetBilletWeight(
        bat.source as Source,
        idealWeight,
        billet.source,
      )

      return {
        billet,
        billetWeight,
        adjustedTargetWeight,
      }
    })
    .filter(({ billet, billetWeight, adjustedTargetWeight }) =>
      (
        billet.status === 'storage' &&
        billet.mlbEligible &&
        billet.hasBarrelKnot !== 'Yes' &&
        billet.species === bat.species &&
        billetWeight !== null &&
        Math.abs(billetWeight - adjustedTargetWeight) <= 0.5
      ),
    )
    .sort((a, b) => {
      const aDifference = Math.abs((a.billetWeight ?? 0) - a.adjustedTargetWeight)
      const bDifference = Math.abs((b.billetWeight ?? 0) - b.adjustedTargetWeight)
      if (aDifference !== bDifference) return aDifference - bDifference
      return compareText(a.billet.source, b.billet.source) || compareWeight(a.billet, b.billet, 'asc')
    })
    .map(({ billet }) => billet)
}

function isProPlayerProfile(profile: PlayerProfile) {
  return profile.profileKind === 'Player' && profile.bats.length > 0
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

function normalizeTrophyEligible(billet: Partial<Billet> & { grade?: string }) {
  if (typeof billet.trophyEligible === 'boolean') return billet.trophyEligible
  return String(billet.grade ?? '').toLowerCase() === 'trophy'
}

function normalizeBillet(billet: Billet | (Partial<Billet> & Pick<Billet, 'id'>)): Billet {
  const source = sourceOptions.includes(billet.source as Source)
    ? (billet.source as Source)
    : "RJ's Tree Farms"
  const weight = normalizeBilletWeight(billet.weight)

  return {
    ...emptyBillet,
    ...billet,
    source,
    weight,
    grade: normalizeGradeForSource(source, billet.grade),
    trophyEligible: normalizeTrophyEligible(billet),
    hasBarrelKnot: normalizeKnotStatus(billet.hasBarrelKnot),
    deliveryDate: billet.deliveryDate ?? '',
    status: normalizeBilletStatus(billet.status),
  }
}

function normalizeBilletWeight(value: Billet['weight'] | string | null | undefined): Billet['weight'] {
  if (value === '' || value === null || value === undefined) return ''
  const weight = Number(value)
  return Number.isFinite(weight) && weight >= 0 ? weight : ''
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

function normalizeGradeForSource(source: Source, grade: Grade | string | null | undefined): Grade {
  const validGrades = getGradeOptionsForSource(source)
  return validGrades.includes(grade as Grade) ? (grade as Grade) : validGrades[0]
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
    billetGrade: allGradeOptions.includes(record.billetGrade as Grade)
      ? (record.billetGrade as Grade)
      : 'Prime',
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

function normalizeOrderAttachment(
  attachment: Partial<OrderAttachment> | null | undefined,
): OrderAttachment | null {
  if (!attachment || typeof attachment !== 'object') return null
  const filename = String(attachment.filename ?? '').trim()
  const downloadUrl = String(attachment.downloadUrl ?? '').trim()
  if (!filename || !downloadUrl) return null

  return {
    id: String(attachment.id ?? ''),
    shopifyFileId: String(attachment.shopifyFileId ?? ''),
    filename,
    downloadUrl,
    contentType: String(attachment.contentType ?? ''),
    bytes: Number(attachment.bytes ?? 0) || 0,
    uploadedAt: String(attachment.uploadedAt ?? ''),
    fileStatus: String(attachment.fileStatus ?? ''),
  }
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
    salesRepEmail: record.salesRepEmail ?? '',
    salesRepSubmissionNotificationSentAt: record.salesRepSubmissionNotificationSentAt ?? '',
    salesRepPaidNotificationSentAt: record.salesRepPaidNotificationSentAt ?? '',
    totalPrice: record.totalPrice ?? '',
    currency: record.currency ?? '',
    specs: {
      model: specs.model ?? '',
      length: specs.length ?? '',
      targetWeight: specs.targetWeight ?? '',
      wood: specs.wood ?? '',
      handleColor: specs.handleColor ?? '',
      barrelColor: specs.barrelColor ?? '',
      bandColor: specs.bandColor ?? '',
      logoColor: specs.logoColor ?? '',
      engraving: specs.engraving ?? '',
      cupped: specs.cupped ?? '',
      notes: specs.notes ?? '',
    },
    lineItems: record.lineItems ?? [],
    internalAttachment: normalizeOrderAttachment(record.internalAttachment),
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

function normalizeCrmStage(value: CrmStage | string | null | undefined): CrmStage {
  if (crmStageOptions.some((option) => option.value === value)) return value as CrmStage
  return 'lead'
}

function normalizeCrmPriority(value: CrmPriority | string | null | undefined): CrmPriority {
  if (crmPriorityOptions.some((option) => option.value === value)) return value as CrmPriority
  return 'steady'
}

function normalizeCrmTouchpointType(
  value: CrmTouchpointType | string | null | undefined,
): CrmTouchpointType {
  if (crmTouchpointTypeOptions.some((option) => option.value === value)) {
    return value as CrmTouchpointType
  }
  return 'note'
}

function normalizeCrmList(values: string[] | string | null | undefined) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values ?? '')
        .split(/[,;\n]/)
        .map((value) => value.trim())

  const seen = new Set<string>()
  return rawValues
    .map((value) => String(value ?? '').trim())
    .filter((value) => {
      const key = value.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function getCrmStageLabel(stage: CrmStage) {
  return crmStageOptions.find((option) => option.value === stage)?.label ?? 'Lead'
}

function getCrmPriorityLabel(priority: CrmPriority) {
  return crmPriorityOptions.find((option) => option.value === priority)?.label ?? 'Steady'
}

function getCrmTouchpointTypeLabel(type: CrmTouchpointType) {
  return crmTouchpointTypeOptions.find((option) => option.value === type)?.label ?? 'Note'
}

function getCrmOwnerKey(name: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail) return normalizedEmail

  const normalizedName = normalizeCrmSearchText(name)
  const matchedOwner = seedCrmOwnerOptions.find((owner) =>
    [owner.name, owner.label]
      .map((value) => normalizeCrmSearchText(value))
      .filter(Boolean)
      .includes(normalizedName),
  )
  if (matchedOwner?.email) return matchedOwner.email

  return normalizedName || 'unassigned'
}

function normalizeTrinityEmail(value: string) {
  return value.trim().toLowerCase()
}

function isTrinityEmail(value: string) {
  return /^[^\s@]+@trinitybats\.com$/i.test(value.trim())
}

function getCrmOwnerByEmail(email: string) {
  const normalizedEmail = normalizeTrinityEmail(email)
  return seedCrmOwnerOptions.find((owner) => owner.email.toLowerCase() === normalizedEmail) ?? null
}

function createCrmOwnerFromEmail(email: string): CrmOwnerOption {
  const normalizedEmail = normalizeTrinityEmail(email)
  const firstName = normalizedEmail.split('@')[0] || 'Team member'
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  return {
    key: normalizedEmail,
    label: name,
    name,
    email: normalizedEmail,
  }
}

function getSalesPortalOwnerForEmail(email: string) {
  return getCrmOwnerByEmail(email) ?? createCrmOwnerFromEmail(email)
}

function createCrmOwnerOption(name: string, email: string): CrmOwnerOption | null {
  const label = name.trim() || email.trim()
  const key = getCrmOwnerKey(name, email)
  if (!label || key === 'unassigned') return null
  return {
    key,
    label,
    name: name.trim() || label,
    email: email.trim(),
  }
}

function getCrmSummaryOwnerKey(summary: CrmContactSummary) {
  return getCrmOwnerKey(summary.contact.salesOwner, summary.contact.ownerEmail)
}

function matchesCrmOwnerFilter(summary: CrmContactSummary, ownerFilter: string) {
  if (ownerFilter === 'all') return true
  if (ownerFilter === 'unassigned') return getCrmSummaryOwnerKey(summary) === 'unassigned'
  return getCrmSummaryOwnerKey(summary) === ownerFilter
}

function getCrmDateInputValue(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function getCrmDateFromInput(value: string) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function getCrmContactedAtFromInput(value: string) {
  if (!value) return new Date().toISOString()
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  const date = new Date(`${value}T${hours}:${minutes}:${seconds}.${milliseconds}`)
  return Number.isNaN(date.getTime()) ? getCrmDateFromInput(value) || now.toISOString() : date.toISOString()
}

function getCrmTodayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function extractCrmEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
}

function extractCrmPhone(value: string) {
  const match = value.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)
  return match?.[0]?.trim() ?? ''
}

function extractCrmLabeledValue(value: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|[\\n,.;])\\s*${label}\\s*(?:is|=|:|-)?\\s*([^\\n,.;]+)`,
      'i',
    )
    const match = value.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return ''
}

function inferCrmContactNameFromText(value: string) {
  const labeled = extractCrmLabeledValue(value, ['contact', 'customer', 'name', 'buyer'])
  if (labeled) return labeled

  const match = value.match(
    /\b(?:called|texted|emailed|met with|spoke with|talked to|followed up with)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/,
  )
  return match?.[1]?.trim() ?? ''
}

function inferCrmTouchpointTypeFromText(value: string): CrmTouchpointType {
  const normalized = value.toLowerCase()
  if (/\b(text|sms|message)\b/.test(normalized)) return 'text'
  if (/\b(email|emailed)\b/.test(normalized)) return 'email'
  if (/\b(call|called|phone|voicemail)\b/.test(normalized)) return 'call'
  if (/\b(ig|instagram|dm|direct message)\b/.test(normalized)) return 'instagram_dm'
  if (/\b(met|meeting|visit|in person|showcase|tournament)\b/.test(normalized)) return 'in_person'
  if (/\b(facebook|x\.com|social)\b/.test(normalized)) return 'social'
  if (/\b(quote|quoted|estimate)\b/.test(normalized)) return 'quote'
  if (/\b(invoice|invoiced|payment link)\b/.test(normalized)) return 'invoice'
  return 'note'
}

function inferCrmStageFromText(value: string): CrmStage {
  const normalized = value.toLowerCase()
  if (/\b(lost|dead|no longer|not interested|passed)\b/.test(normalized)) return 'lost'
  if (/\b(customer|paid|ordered|closed|won)\b/.test(normalized)) return 'active_customer'
  if (/\b(invoice|payment link|sent invoice)\b/.test(normalized)) return 'invoice_sent'
  if (/\b(quote|quoted|estimate|pricing)\b/.test(normalized)) return 'quoted'
  if (/\b(qualified|real lead|good lead|strong lead|serious|interested)\b/.test(normalized)) {
    return 'qualified'
  }
  if (/\b(nurture|later|next season|not now)\b/.test(normalized)) return 'nurture'
  return 'lead'
}

function inferCrmPriorityFromText(value: string): CrmPriority {
  const normalized = value.toLowerCase()
  if (/\b(hot|urgent|ready|asap|this week|strong|serious)\b/.test(normalized)) return 'hot'
  if (/\b(warm|interested|promising|likely|good fit)\b/.test(normalized)) return 'warm'
  if (/\b(low|cold|maybe|not now|later)\b/.test(normalized)) return 'low'
  return 'steady'
}

function inferCrmFollowUpInputFromText(value: string) {
  const normalized = value.toLowerCase()
  const explicit = normalized.match(/\b(?:follow(?:-| )?up|follow up|next step|remind)\D{0,20}(\d{4}-\d{2}-\d{2})/)
  if (explicit?.[1]) return explicit[1]

  const slashDate = normalized.match(
    /\b(?:follow(?:-| )?up|follow up|next step|remind)\D{0,20}(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  )
  if (slashDate?.[1] && slashDate?.[2]) {
    const now = new Date()
    const year = slashDate[3]
      ? Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3])
      : now.getFullYear()
    const date = new Date(year, Number(slashDate[1]) - 1, Number(slashDate[2]), 12)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  }

  const days = normalized.match(/\b(?:in|after)\s+(\d{1,2})\s+days?\b/)
  if (days?.[1]) {
    const date = new Date()
    date.setDate(date.getDate() + Number(days[1]))
    return date.toISOString().slice(0, 10)
  }

  if (/\btomorrow\b/.test(normalized)) {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
  }

  if (/\bnext week\b/.test(normalized)) {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }

  return ''
}

function normalizeCrmTouchpoint(
  record: Partial<CrmTouchpoint> & Pick<CrmTouchpoint, 'id'>,
): CrmTouchpoint {
  return {
    id: record.id,
    type: normalizeCrmTouchpointType(record.type),
    contactedAt: record.contactedAt || new Date().toISOString(),
    salesRep: record.salesRep ?? '',
    summary: record.summary ?? '',
    sentiment: record.sentiment ?? '',
    nextStep: record.nextStep ?? '',
    nextFollowUpAt: record.nextFollowUpAt ?? '',
    relatedOrderId: record.relatedOrderId ?? '',
  }
}

function normalizeCrmContact(record: Partial<CrmContact> & Pick<CrmContact, 'id'>): CrmContact {
  const now = new Date().toISOString()

  return {
    ...emptyCrmContact(),
    ...record,
    id: record.id,
    name: record.name ?? '',
    company: record.company ?? '',
    role: record.role ?? '',
    email: record.email ?? '',
    phone: record.phone ?? '',
    alternateContacts: record.alternateContacts ?? '',
    playerNames: normalizeCrmList(record.playerNames),
    salesOwner: record.salesOwner ?? '',
    ownerEmail: record.ownerEmail ?? '',
    stage: normalizeCrmStage(record.stage),
    priority: normalizeCrmPriority(record.priority),
    source: record.source ?? '',
    tags: normalizeCrmList(record.tags),
    preferredContactMethod: record.preferredContactMethod ?? 'Any',
    buyingContext: record.buyingContext ?? '',
    batPreferences: record.batPreferences ?? '',
    relationshipNotes: record.relationshipNotes ?? '',
    objections: record.objections ?? '',
    opportunities: record.opportunities ?? '',
    followUpAt: record.followUpAt ?? '',
    lastContactedAt: record.lastContactedAt ?? '',
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
    touchpoints: Array.isArray(record.touchpoints)
      ? record.touchpoints.map((touchpoint) => normalizeCrmTouchpoint(touchpoint))
      : [],
    sandboxOnly: record.sandboxOnly ?? true,
  }
}

function createSalesPortalDemoContacts() {
  const now = new Date().toISOString()
  const shane = getSalesPortalOwnerForEmail('shane@trinitybats.com')

  return [
    normalizeCrmContact({
      id: 'demo-shane-engagement-review-contact',
      name: 'Demo Engagement Review',
      company: 'Trinity Demo Account',
      role: 'Player family / prospect',
      email: 'demo-engagement-review@example.com',
      phone: '555-0100',
      salesOwner: shane.name,
      ownerEmail: shane.email,
      stage: 'qualified',
      priority: 'warm',
      source: 'Sales portal demo',
      preferredContactMethod: 'Call',
      buyingContext: 'Demo profile for showing how a sales rep reviews stored CRM engagements.',
      batPreferences: 'Interested in a maple gamer, 33 inch, balanced feel.',
      lastContactedAt: now,
      createdAt: now,
      updatedAt: now,
      touchpoints: [
        normalizeCrmTouchpoint({
          id: 'demo-shane-call-engagement',
          type: 'call',
          contactedAt: now,
          salesRep: shane.name,
          summary:
            'Shane called the player and confirmed interest in a maple gamer with a quick follow-up quote.',
          nextStep: 'Send quote details and follow up tomorrow.',
        }),
      ],
      sandboxOnly: true,
    }),
  ]
}

function normalizeCrmSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeCrmPhone(value: string) {
  return value.replace(/\D/g, '')
}

function getCrmStableId(prefix: string, value: string) {
  const slug = normalizeCrmSearchText(value).replace(/\s+/g, '-')
  return `${prefix}-${slug || 'unknown'}`
}

function getCrmIdentityCandidates(contact: Pick<CrmContact, 'email' | 'phone' | 'name' | 'company'>) {
  const email = contact.email.trim().toLowerCase()
  const phone = normalizeCrmPhone(contact.phone)
  const name = normalizeCrmSearchText(contact.name)
  const company = normalizeCrmSearchText(contact.company)
  return [
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : '',
    name && company ? `name-company:${name}:${company}` : '',
    name ? `name:${name}` : '',
  ].filter(Boolean)
}

function hasSharedCrmIdentity(first: CrmContact, second: CrmContact) {
  const firstCandidates = new Set(getCrmIdentityCandidates(first))
  return getCrmIdentityCandidates(second).some((candidate) => firstCandidates.has(candidate))
}

function mergeCrmContacts(base: CrmContact, incoming: CrmContact): CrmContact {
  const touchpoints = new Map<string, CrmTouchpoint>()
  for (const touchpoint of incoming.touchpoints) touchpoints.set(touchpoint.id, touchpoint)
  for (const touchpoint of base.touchpoints) touchpoints.set(touchpoint.id, touchpoint)

  return normalizeCrmContact({
    ...incoming,
    ...base,
    name: base.name || incoming.name,
    company: base.company || incoming.company,
    role: base.role || incoming.role,
    email: base.email || incoming.email,
    phone: base.phone || incoming.phone,
    salesOwner: base.salesOwner || incoming.salesOwner,
    ownerEmail: base.ownerEmail || incoming.ownerEmail,
    source: base.source || incoming.source,
    playerNames: normalizeCrmList([...incoming.playerNames, ...base.playerNames]),
    tags: normalizeCrmList([...incoming.tags, ...base.tags]),
    lastContactedAt: getLaterDate(base.lastContactedAt, incoming.lastContactedAt),
    followUpAt: base.followUpAt || incoming.followUpAt,
    createdAt: getEarlierDate(base.createdAt, incoming.createdAt),
    updatedAt: getLaterDate(base.updatedAt, incoming.updatedAt),
    touchpoints: Array.from(touchpoints.values()).sort(
      (a, b) => getDateTimestamp(b.contactedAt) - getDateTimestamp(a.contactedAt),
    ),
  })
}

function inferCrmStageFromOrder(job: OrderJob): CrmStage {
  if (isSalesDashboardPaid(job)) return 'active_customer'
  if (job.invoiceStatus === 'sent') return 'invoice_sent'
  if (job.invoiceStatus === 'draft') return 'quoted'
  return 'qualified'
}

function inferCrmPriorityFromOrder(job: OrderJob): CrmPriority {
  if (!isSalesDashboardPaid(job) && getSalesDashboardLineValue(job) >= 500) return 'hot'
  if (job.origin === 'internal_sales') return 'warm'
  return 'steady'
}

function createCrmContactFromOrder(job: OrderJob): CrmContact {
  const name = job.billingName || job.customerName || job.playerName
  const email = job.billingEmail || job.customerEmail || job.playerEmail
  const phone = job.billingPhone
  const company = job.billingCompany
  const identity = email || phone || `${name}-${company}` || job.id

  return normalizeCrmContact({
    id: getCrmStableId('crm-order-contact', identity),
    name,
    company,
    role: job.billingRelationship,
    email,
    phone,
    playerNames: normalizeCrmList([job.playerName, job.customerName].filter(Boolean)),
    salesOwner: job.salesRep,
    ownerEmail: job.salesRepEmail,
    stage: inferCrmStageFromOrder(job),
    priority: inferCrmPriorityFromOrder(job),
    source: job.origin === 'internal_sales' ? 'Sales intake' : 'Website order',
    tags: normalizeCrmList([
      job.origin === 'internal_sales' ? 'Manual sales order' : 'Website customer',
      job.billingCompany ? 'Team or agency' : '',
      job.specs.wood,
      job.specs.model,
    ]),
    batPreferences: [job.specs.model, job.specs.wood, job.specs.length, job.specs.targetWeight]
      .filter(Boolean)
      .join(' / '),
    opportunities: isSalesDashboardPaid(job)
      ? 'Potential reorder or companion bat opportunity.'
      : 'Open invoice or quote needs follow-up.',
    lastContactedAt: job.orderSubmittedAt || job.createdAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  })
}

function createCrmContactFromBillingContact(contact: BillingContact): CrmContact {
  return normalizeCrmContact({
    id: getCrmStableId('crm-billing-contact', contact.email || contact.phone || contact.name),
    name: contact.name,
    company: contact.company,
    role: contact.relationship,
    email: contact.email,
    phone: contact.phone,
    stage: 'qualified',
    priority: 'warm',
    source: 'Saved payer contact',
    tags: normalizeCrmList(['Saved billing contact', contact.company]),
    relationshipNotes: contact.notes,
  })
}

function getCrmOrdersForContact(contact: CrmContact, orderJobs: OrderJob[]) {
  const contactEmails = new Set(
    [contact.email]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
  const contactPhone = normalizeCrmPhone(contact.phone)
  const contactName = normalizeCrmSearchText(contact.name)
  const contactCompany = normalizeCrmSearchText(contact.company)
  const playerNames = contact.playerNames.map((value) => normalizeCrmSearchText(value)).filter(Boolean)

  return orderJobs
    .filter((job) => {
      const jobEmails = [job.billingEmail, job.customerEmail, job.playerEmail]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      if (jobEmails.some((email) => contactEmails.has(email))) return true

      const jobPhone = normalizeCrmPhone(job.billingPhone)
      if (contactPhone && jobPhone && contactPhone === jobPhone) return true

      const jobNames = [job.billingName, job.customerName, job.playerName]
        .map((value) => normalizeCrmSearchText(value))
        .filter(Boolean)
      if (contactName && jobNames.includes(contactName)) return true
      if (playerNames.some((playerName) => jobNames.includes(playerName))) return true

      const jobCompany = normalizeCrmSearchText(job.billingCompany)
      return Boolean(contactCompany && jobCompany && contactCompany === jobCompany)
    })
    .sort(
      (a, b) =>
        getDateTimestamp(b.orderSubmittedAt || b.createdAt) -
        getDateTimestamp(a.orderSubmittedAt || a.createdAt),
    )
}

function buildCrmContactDirectory(
  savedContacts: CrmContact[],
  orderJobs: OrderJob[],
  billingContacts: BillingContact[],
) {
  const directory: Array<{ contact: CrmContact; derivedFromOrders: boolean }> = []

  function addCandidate(candidate: CrmContact, derivedFromOrders: boolean) {
    const existingIndex = directory.findIndex(({ contact }) => hasSharedCrmIdentity(contact, candidate))
    if (existingIndex === -1) {
      directory.push({ contact: candidate, derivedFromOrders })
      return
    }

    const existing = directory[existingIndex]
    directory[existingIndex] = {
      contact: mergeCrmContacts(existing.contact, candidate),
      derivedFromOrders: existing.derivedFromOrders && derivedFromOrders,
    }
  }

  for (const contact of savedContacts) {
    addCandidate(normalizeCrmContact(contact), false)
  }

  for (const contact of billingContacts) {
    addCandidate(createCrmContactFromBillingContact(contact), true)
  }

  for (const job of orderJobs) {
    addCandidate(createCrmContactFromOrder(job), true)
  }

  return directory.sort((a, b) => {
    const aDate = getDateTimestamp(a.contact.followUpAt) || getDateTimestamp(a.contact.updatedAt)
    const bDate = getDateTimestamp(b.contact.followUpAt) || getDateTimestamp(b.contact.updatedAt)
    return bDate - aDate
  })
}

function buildCrmContactSummaries(
  directory: Array<{ contact: CrmContact; derivedFromOrders: boolean }>,
  orderJobs: OrderJob[],
): CrmContactSummary[] {
  return directory.map(({ contact, derivedFromOrders }) => {
    const orders = getCrmOrdersForContact(contact, orderJobs)
    const submittedValue = orders.reduce((total, job) => total + getSalesDashboardLineValue(job), 0)
    const paidValue = orders
      .filter((job) => isSalesDashboardPaid(job))
      .reduce((total, job) => total + getSalesDashboardLineValue(job), 0)
    const openValue = submittedValue - paidValue
    const openInvoiceCount = orders.filter((job) => !isSalesDashboardPaid(job)).length
    const lastOrderAt = orders[0]?.orderSubmittedAt || orders[0]?.createdAt || ''
    const lastTouchpointAt = contact.touchpoints[0]?.contactedAt || ''
    const lastActivityAt = getLaterDate(getLaterDate(lastOrderAt, lastTouchpointAt), contact.lastContactedAt)
    const followUpAt = contact.followUpAt || contact.touchpoints[0]?.nextFollowUpAt || ''
    const followUpDue = Boolean(followUpAt && getDateTimestamp(followUpAt) <= Date.now())

    return {
      contact,
      orders,
      orderCount: orders.length,
      submittedValue,
      paidValue,
      openValue,
      openInvoiceCount,
      lastOrderAt,
      lastActivityAt,
      followUpDue,
      derivedFromOrders,
    }
  })
}

function getSalesPortalOrderTotal(draft: SalesOrderDraft) {
  return getSalesOrderTotal(draft)
}

function createSalesPortalOrder(
  draft: SalesOrderDraft,
  owner: CrmOwnerOption,
  contactId: string,
): SalesPortalOrder {
  const payerName = draft.billingDifferent ? draft.billingName : draft.playerName
  const payerEmail = draft.billingDifferent ? draft.billingEmail : draft.playerEmail
  const payerPhone = draft.billingDifferent ? draft.billingPhone : draft.playerPhone

  return {
    id: createId('portal-order'),
    ownerName: owner.name,
    ownerEmail: owner.email,
    submittedAt: new Date().toISOString(),
    contactId,
    playerName: draft.playerName,
    payerName,
    payerEmail,
    payerPhone,
    total: getSalesPortalOrderTotal(draft),
    status: 'local_saved',
    draft: cloneSalesOrderDraft(draft),
  }
}

function createSalesDashboardSaleFromPortalOrder(order: SalesPortalOrder): SalesDashboardSale {
  return {
    key: order.id,
    draftOrderName: 'Demo order',
    paidOrderName: '',
    salesRep: order.ownerName,
    salesRepEmail: order.ownerEmail,
    customerName: order.playerName,
    payerName: order.payerName,
    submittedAt: order.submittedAt,
    paidAt: '',
    invoiceStatus: 'draft',
    isPaid: false,
    total: order.total,
    quantity: order.draft.lines.reduce((total, line) => total + line.quantity, 0),
    lineCount: order.draft.lines.length,
    productSummary: order.draft.lines.map((line) => line.title || 'Custom bat').join(', '),
  }
}

function createCrmContactFromSalesPortalDraft(
  draft: SalesOrderDraft,
  owner: CrmOwnerOption,
): CrmContact {
  const now = new Date().toISOString()
  const payerName = draft.billingDifferent ? draft.billingName : draft.playerName
  const payerEmail = draft.billingDifferent ? draft.billingEmail : draft.playerEmail
  const payerPhone = draft.billingDifferent ? draft.billingPhone : draft.playerPhone

  return normalizeCrmContact({
    ...emptyCrmContact(),
    name: payerName,
    company: draft.billingCompany,
    role: draft.billingRelationship,
    email: payerEmail,
    phone: payerPhone,
    playerNames: normalizeCrmList([draft.playerName]),
    salesOwner: owner.name,
    ownerEmail: owner.email,
    stage: draft.createDraftOrder ? 'quoted' : 'active_customer',
    priority: draft.sendInvoice ? 'hot' : 'warm',
    source: 'Sales portal order',
    tags: normalizeCrmList(['Sales portal', 'Order form']),
    buyingContext: draft.notes,
    batPreferences: draft.lines
      .map((line) => [line.title, line.wood, line.length, line.targetWeight].filter(Boolean).join(' / '))
      .filter(Boolean)
      .join('; '),
    opportunities: draft.createDraftOrder ? 'Invoice/order follow-up required.' : 'Order saved.',
    lastContactedAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

function isCrmSummaryOwnedBy(summary: CrmContactSummary, owner: CrmOwnerOption) {
  return getCrmSummaryOwnerKey(summary) === owner.key
}

function isSalesDashboardSaleOwnedBy(sale: SalesDashboardSale, owner: CrmOwnerOption) {
  return getCrmOwnerKey(sale.salesRep, sale.salesRepEmail) === owner.key
}

function salesPortalContactMatchesSearch(
  summary: CrmContactSummary,
  sales: SalesDashboardSale[],
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true

  const contactSales = sales.filter((sale) =>
    [sale.customerName, sale.payerName, sale.salesRep, sale.salesRepEmail].some(
      (value) =>
        value &&
        normalizeCrmSearchText(value) &&
        [
          summary.contact.name,
          summary.contact.company,
          summary.contact.email,
          summary.contact.phone,
          ...summary.contact.playerNames,
        ]
          .map((field) => normalizeCrmSearchText(field))
          .filter(Boolean)
          .includes(normalizeCrmSearchText(value)),
    ),
  )
  const searchable = normalizeCrmSearchText(
    [
      summary.contact.name,
      summary.contact.company,
      summary.contact.role,
      summary.contact.email,
      summary.contact.phone,
      summary.contact.alternateContacts,
      summary.contact.salesOwner,
      summary.contact.ownerEmail,
      summary.contact.stage,
      summary.contact.priority,
      summary.contact.source,
      summary.contact.preferredContactMethod,
      summary.contact.buyingContext,
      summary.contact.batPreferences,
      summary.contact.relationshipNotes,
      summary.contact.objections,
      summary.contact.opportunities,
      ...summary.contact.playerNames,
      ...summary.contact.tags,
      ...summary.contact.touchpoints.flatMap((touchpoint) => [
        touchpoint.type,
        getCrmTouchpointTypeLabel(touchpoint.type),
        touchpoint.salesRep,
        touchpoint.summary,
        touchpoint.sentiment,
        touchpoint.nextStep,
      ]),
      ...contactSales.flatMap((sale) => [
        sale.customerName,
        sale.payerName,
        sale.salesRep,
        sale.salesRepEmail,
        sale.draftOrderName,
        sale.paidOrderName,
        sale.invoiceStatus,
        sale.productSummary,
      ]),
    ].join(' '),
  )

  return searchable.includes(normalizedQuery)
}

function normalizePlayerProfile(
  record: Partial<PlayerProfile> & Pick<PlayerProfile, 'id'>,
): PlayerProfile {
  return {
    id: record.id,
    profileKind: record.profileKind === 'Trainer' ? 'Trainer' : 'Player',
    playerName: record.playerName ?? '',
    bats: Array.isArray(record.bats) ? record.bats.map((bat) => normalizeBatVariation(bat)) : [],
  }
}

function normalizeBatVariation(record: Partial<BatVariation> & Pick<BatVariation, 'id'>): BatVariation {
  return {
    id: record.id,
    modelNumber: record.modelNumber ?? '',
    length: record.length ?? '',
    weight: record.weight ?? '',
    source: sourceOptions.includes(record.source as Source) ? (record.source as Source) : '',
    species: speciesOptions.includes(record.species as Species) ? (record.species as Species) : 'Maple',
    woodTier: woodTierOptions.includes(record.woodTier as WoodTier)
      ? (record.woodTier as WoodTier)
      : 'Prime',
    colorPreferences: record.colorPreferences ?? '',
    idealBilletWeight: record.idealBilletWeight ?? '',
    compatibleBilletIds: Array.isArray(record.compatibleBilletIds)
      ? record.compatibleBilletIds
      : [],
    notes: record.notes ?? '',
  }
}

function inferSpeciesFromText(value: string): Species | null {
  const normalized = value.toLowerCase()
  return speciesOptions.find((species) => normalized.includes(species.toLowerCase())) ?? null
}

function inferSourceFromText(value: string): Source | null {
  const normalized = value.toLowerCase()
  if (normalized.includes('great lakes') || normalized.includes('glv')) return 'Great Lakes Veneer'
  if (normalized.includes('champeau')) return 'Champeau'
  if (normalized.includes('cahan')) return 'Cahan'
  if (normalized.includes('rj') || normalized.includes("rj's") || normalized.includes('tree farm')) {
    return "RJ's Tree Farms"
  }

  return null
}

function inferBilletWeightFromText(value: string) {
  const match = value.match(/\b(\d{2,3}(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i)
  const weight = match?.[1] ? Number(match[1]) : null
  return weight !== null && weight >= 70 && weight <= 120 ? String(weight) : ''
}

function hydratePlayerProfileBilletTargets(profile: PlayerProfile, billets: Billet[]): PlayerProfile {
  return {
    ...profile,
    bats: profile.bats.map((bat) => {
      const legacyBillet = bat.compatibleBilletIds
        .map((id) => billets.find((billet) => billet.id === id))
        .find((billet): billet is Billet => Boolean(billet))
      const inferredWeight =
        bat.idealBilletWeight.trim() ||
        (typeof legacyBillet?.weight === 'number'
          ? String(legacyBillet.weight)
          : inferBilletWeightFromText(bat.notes))
      const inferredSource = bat.source || legacyBillet?.source || inferSourceFromText(bat.notes)
      const inferredSpecies = legacyBillet?.species ?? inferSpeciesFromText(bat.notes)

      return {
        ...bat,
        source: inferredSource ?? bat.source,
        species: inferredSpecies ?? bat.species,
        idealBilletWeight: inferredWeight,
      }
    }),
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
    bandColor: primary?.bandColor || fallback?.bandColor || '',
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

function getDateTimestamp(value: string) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function getEarlierDate(first: string, second: string) {
  if (!first) return second
  if (!second) return first
  return getDateTimestamp(second) < getDateTimestamp(first) ? second : first
}

function getLaterDate(first: string, second: string) {
  if (!first) return second
  if (!second) return first
  return getDateTimestamp(second) > getDateTimestamp(first) ? second : first
}

function formatSalesDashboardDate(value: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function formatSalesDashboardSyncTime(value: string) {
  if (!value) return 'Not synced'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatSalesDashboardPercent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function parseSalesDashboardAmount(value: string) {
  const normalized = String(value ?? '').replace(/[^0-9.-]/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

function getSalesDashboardLineValue(job: OrderJob) {
  const unitAmount = parseSalesDashboardAmount(job.totalPrice)
  const quantity = Number.isFinite(job.quantity) && job.quantity > 0 ? job.quantity : 1
  return unitAmount * quantity
}

function isSalesDashboardPaid(job: OrderJob) {
  return (
    job.invoiceStatus === 'paid' ||
    job.financialStatus.toLowerCase().includes('paid') ||
    Boolean(job.salesRepPaidNotificationSentAt)
  )
}

function getInvoiceStatusPriority(status: InvoiceStatus) {
  if (status === 'paid') return 3
  if (status === 'sent') return 2
  if (status === 'draft') return 1
  return 0
}

function getSalesDashboardOrderKey(job: OrderJob) {
  return (
    job.intakeId ||
    job.shopifyDraftOrderId ||
    job.shopifyOrderId ||
    job.shopifyDraftOrderName ||
    job.shopifyOrderName ||
    job.id
  )
}

function getSalesDashboardRowKey(job: OrderJob, orderKey: string, isPaid: boolean) {
  return (
    job.id ||
    job.lineItemId ||
    [
      orderKey,
      isPaid ? 'paid' : 'draft',
      job.productTitle,
      job.variantTitle,
      job.quantity,
      job.totalPrice,
      job.invoiceStatus,
    ].join('|')
  )
}

function getSalesRepSummaryKey(sale: Pick<SalesDashboardSale, 'salesRep' | 'salesRepEmail'>) {
  const email = sale.salesRepEmail.trim().toLowerCase()
  if (email) return email

  const name = sale.salesRep.trim().toLowerCase()
  return name || 'unassigned'
}

function getSalesRepSummaryLabel(sale: Pick<SalesDashboardSale, 'salesRep' | 'salesRepEmail'>) {
  return sale.salesRep.trim() || sale.salesRepEmail.trim() || 'Unassigned'
}

function buildSalesDashboardSales(orderJobs: OrderJob[]): SalesDashboardSale[] {
  const sales = new Map<
    string,
    SalesDashboardSale & {
      draftLineCount: number
      draftProductTitles: Set<string>
      draftQuantity: number
      draftTotal: number
      countedRowKeys: Set<string>
      paidLineCount: number
      paidProductTitles: Set<string>
      paidQuantity: number
      paidTotal: number
    }
  >()

  for (const job of orderJobs) {
    if (job.origin !== 'internal_sales') continue

    const key = getSalesDashboardOrderKey(job)
    const jobIsPaid = isSalesDashboardPaid(job)
    const jobQuantity = Number.isFinite(job.quantity) && job.quantity > 0 ? job.quantity : 1
    const jobValue = getSalesDashboardLineValue(job)
    const existing =
      sales.get(key) ??
      ({
        key,
        draftOrderName: '',
        paidOrderName: '',
        salesRep: '',
        salesRepEmail: '',
        customerName: '',
        payerName: '',
        submittedAt: '',
        paidAt: '',
        invoiceStatus: 'draft',
        isPaid: false,
        total: 0,
        quantity: 0,
        lineCount: 0,
        productSummary: '',
        draftLineCount: 0,
        draftProductTitles: new Set<string>(),
        draftQuantity: 0,
        draftTotal: 0,
        countedRowKeys: new Set<string>(),
        paidLineCount: 0,
        paidProductTitles: new Set<string>(),
        paidQuantity: 0,
        paidTotal: 0,
      } satisfies SalesDashboardSale & {
        draftLineCount: number
        draftProductTitles: Set<string>
        draftQuantity: number
        draftTotal: number
        countedRowKeys: Set<string>
        paidLineCount: number
        paidProductTitles: Set<string>
        paidQuantity: number
        paidTotal: number
      })

    const rowKey = getSalesDashboardRowKey(job, key, jobIsPaid)
    if (existing.countedRowKeys.has(rowKey)) continue
    existing.countedRowKeys.add(rowKey)

    existing.draftOrderName ||= job.shopifyDraftOrderName
    existing.paidOrderName ||= job.shopifyOrderName
    existing.salesRep ||= job.salesRep
    existing.salesRepEmail ||= job.salesRepEmail
    existing.customerName ||= job.playerName || job.customerName
    existing.payerName ||= job.billingName || job.customerName
    existing.submittedAt = getEarlierDate(existing.submittedAt, job.orderSubmittedAt || job.createdAt)
    if (jobIsPaid) {
      existing.paidTotal += jobValue
      existing.paidQuantity += jobQuantity
      existing.paidLineCount += 1
      if (job.productTitle) existing.paidProductTitles.add(job.productTitle)
    } else {
      existing.draftTotal += jobValue
      existing.draftQuantity += jobQuantity
      existing.draftLineCount += 1
      if (job.productTitle) existing.draftProductTitles.add(job.productTitle)
    }

    if (getInvoiceStatusPriority(job.invoiceStatus) > getInvoiceStatusPriority(existing.invoiceStatus)) {
      existing.invoiceStatus = job.invoiceStatus
    }

    if (jobIsPaid) {
      existing.isPaid = true
      existing.invoiceStatus = 'paid'
      existing.paidAt = getLaterDate(
        existing.paidAt,
        job.salesRepPaidNotificationSentAt || job.updatedAt || job.createdAt,
      )
    }

    sales.set(key, existing)
  }

  return Array.from(sales.values())
    .map(
      ({
        draftLineCount,
        draftProductTitles,
        draftQuantity,
        draftTotal,
        countedRowKeys,
        paidLineCount,
        paidProductTitles,
        paidQuantity,
        paidTotal,
        ...sale
      }) => {
        void countedRowKeys
        const hasDraftBasis = draftLineCount > 0
        const productTitles = hasDraftBasis ? draftProductTitles : paidProductTitles
        return {
          ...sale,
          lineCount: hasDraftBasis ? draftLineCount : paidLineCount,
          productSummary: Array.from(productTitles).join(', ') || 'Custom bat order',
          quantity: hasDraftBasis ? draftQuantity : paidQuantity,
          total: hasDraftBasis ? draftTotal : paidTotal,
        }
      },
    )
    .sort((a, b) => {
      const first = getDateTimestamp(a.paidAt || a.submittedAt)
      const second = getDateTimestamp(b.paidAt || b.submittedAt)
      return second - first
    })
}

function buildSalesRepSummaries(sales: SalesDashboardSale[]): SalesRepSummary[] {
  const summaries = new Map<string, SalesRepSummary & { daysToPay: number[] }>()

  for (const sale of sales) {
    const key = getSalesRepSummaryKey(sale)
    const existing =
      summaries.get(key) ??
      ({
        key,
        label: getSalesRepSummaryLabel(sale),
        email: sale.salesRepEmail,
        submittedCount: 0,
        submittedValue: 0,
        paidCount: 0,
        paidValue: 0,
        openCount: 0,
        openValue: 0,
        averageDaysToPay: null,
        daysToPay: [],
      } satisfies SalesRepSummary & { daysToPay: number[] })

    existing.submittedCount += 1
    existing.submittedValue += sale.total

    if (sale.isPaid) {
      existing.paidCount += 1
      existing.paidValue += sale.total

      const submittedAt = getDateTimestamp(sale.submittedAt)
      const paidAt = getDateTimestamp(sale.paidAt)
      if (submittedAt && paidAt && paidAt >= submittedAt) {
        existing.daysToPay.push((paidAt - submittedAt) / (1000 * 60 * 60 * 24))
      }
    } else {
      existing.openCount += 1
      existing.openValue += sale.total
    }

    summaries.set(key, existing)
  }

  return Array.from(summaries.values())
    .map(({ daysToPay, ...summary }) => ({
      ...summary,
      averageDaysToPay:
        daysToPay.length > 0
          ? daysToPay.reduce((total, days) => total + days, 0) / daysToPay.length
          : null,
    }))
    .sort((a, b) => b.paidValue - a.paidValue || b.submittedValue - a.submittedValue)
}

function isSaleInsideDashboardRange(sale: SalesDashboardSale, range: SalesDashboardRange) {
  if (range === 'all') return true

  const days = Number(range)
  const submittedAt = getDateTimestamp(sale.submittedAt)
  if (!submittedAt) return true

  return submittedAt >= Date.now() - days * 24 * 60 * 60 * 1000
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
      salesRepEmail: job.salesRepEmail || existing?.salesRepEmail || '',
      salesRepSubmissionNotificationSentAt:
        job.salesRepSubmissionNotificationSentAt ||
        existing?.salesRepSubmissionNotificationSentAt ||
        '',
      salesRepPaidNotificationSentAt:
        job.salesRepPaidNotificationSentAt || existing?.salesRepPaidNotificationSentAt || '',
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

function createEmptyRemoteState(): RemoteState {
  return {
    billets: [],
    players: [],
    producedBats: [],
    customBatModels: [],
    orderJobs: [],
    billingContacts: [],
    crmContacts: [],
  }
}

function getRemoteStateRecordKey(collection: keyof RemoteState, item: unknown) {
  const record = item as {
    id?: string
    barcode?: string
    profileKind?: string
    playerName?: string
    createdAt?: string
  }

  switch (collection) {
    case 'billets':
      return record.barcode || record.id || ''
    case 'players':
      return record.id || `${record.profileKind ?? ''}:${record.playerName ?? ''}`
    case 'producedBats':
      return record.id || record.createdAt || ''
    default:
      return record.id || ''
  }
}

function getChangedRemoteRecords<T>(
  current: T[],
  base: T[],
  getKey: (item: T) => string,
) {
  const baseRecords = new Map<string, string>()

  for (const item of base) {
    const key = getKey(item).trim()
    if (key) baseRecords.set(key, JSON.stringify(item))
  }

  return current.filter((item) => {
    const key = getKey(item).trim()
    if (!key) return false
    return baseRecords.get(key) !== JSON.stringify(item)
  })
}

function getDeletedRemoteRecordIds<T>(
  current: T[],
  base: T[],
  getKey: (item: T) => string,
) {
  const currentKeys = new Set(current.map((item) => getKey(item).trim()).filter(Boolean))

  return base
    .filter((item) => {
      const key = getKey(item).trim()
      return key && !currentKeys.has(key)
    })
    .map((item) => {
      const record = item as { id?: string }
      return (record.id || getKey(item)).trim()
    })
    .filter(Boolean)
}

function buildRemoteStatePatch(current: RemoteState, base: RemoteState | null): RemoteStatePatch {
  const baseState = base ?? createEmptyRemoteState()
  const patch: RemoteStatePatch = {}
  const changedBillets = getChangedRemoteRecords(current.billets, baseState.billets, (item) =>
    getRemoteStateRecordKey('billets', item),
  )
  const changedPlayers = getChangedRemoteRecords(current.players, baseState.players, (item) =>
    getRemoteStateRecordKey('players', item),
  )
  const changedProducedBats = getChangedRemoteRecords(
    current.producedBats,
    baseState.producedBats,
    (item) => getRemoteStateRecordKey('producedBats', item),
  )
  const changedCustomBatModels = getChangedRemoteRecords(
    current.customBatModels,
    baseState.customBatModels,
    (item) => getRemoteStateRecordKey('customBatModels', item),
  )
  const changedOrderJobs = getChangedRemoteRecords(current.orderJobs, baseState.orderJobs, (item) =>
    getRemoteStateRecordKey('orderJobs', item),
  )
  const changedBillingContacts = getChangedRemoteRecords(
    current.billingContacts,
    baseState.billingContacts,
    (item) => getRemoteStateRecordKey('billingContacts', item),
  )
  const changedCrmContacts = getChangedRemoteRecords(
    current.crmContacts,
    baseState.crmContacts,
    (item) => getRemoteStateRecordKey('crmContacts', item),
  )
  const deletedProducedBatIds = getDeletedRemoteRecordIds(
    current.producedBats,
    baseState.producedBats,
    (item) => getRemoteStateRecordKey('producedBats', item),
  )

  if (changedBillets.length > 0) patch.billets = changedBillets
  if (changedPlayers.length > 0) patch.players = changedPlayers
  if (changedProducedBats.length > 0) patch.producedBats = changedProducedBats
  if (changedCustomBatModels.length > 0) patch.customBatModels = changedCustomBatModels
  if (changedOrderJobs.length > 0) patch.orderJobs = changedOrderJobs
  if (changedBillingContacts.length > 0) patch.billingContacts = changedBillingContacts
  if (changedCrmContacts.length > 0) patch.crmContacts = changedCrmContacts
  if (deletedProducedBatIds.length > 0) {
    patch.deletes = {
      producedBats: deletedProducedBatIds,
    }
  }

  return patch
}

function hasRemoteStatePatchChanges(patch: RemoteStatePatch) {
  const hasUpserts = (Object.keys(createEmptyRemoteState()) as Array<keyof RemoteState>).some(
    (collection) => (patch[collection]?.length ?? 0) > 0,
  )
  const hasDeletes = Object.values(patch.deletes ?? {}).some(
    (deletedIds) => (deletedIds?.length ?? 0) > 0,
  )

  return hasUpserts || hasDeletes
}

function countRemoteStatePatchRecords(patch: RemoteStatePatch) {
  const upsertCount = (Object.keys(createEmptyRemoteState()) as Array<keyof RemoteState>).reduce(
    (total, collection) => total + (patch[collection]?.length ?? 0),
    0,
  )
  const deleteCount = Object.values(patch.deletes ?? {}).reduce(
    (total, deletedIds) => total + (deletedIds?.length ?? 0),
    0,
  )

  return upsertCount + deleteCount
}

function applyRemoteStatePatchToSnapshot(
  base: RemoteState | null,
  patch: RemoteStatePatch,
): RemoteState {
  const nextState = base ?? createEmptyRemoteState()
  const deletedProducedBatIds = new Set(patch.deletes?.producedBats ?? [])

  return {
    billets: patch.billets
      ? mergeRecordsByKey(nextState.billets, patch.billets, (item) =>
          getRemoteStateRecordKey('billets', item),
        )
      : nextState.billets,
    players: patch.players
      ? mergeRecordsByKey(nextState.players, patch.players, (item) =>
          getRemoteStateRecordKey('players', item),
        )
      : nextState.players,
    producedBats: patch.producedBats
      ? mergeRecordsByKey(nextState.producedBats, patch.producedBats, (item) =>
          getRemoteStateRecordKey('producedBats', item),
        ).filter((record) => !deletedProducedBatIds.has(record.id))
      : nextState.producedBats.filter((record) => !deletedProducedBatIds.has(record.id)),
    customBatModels: patch.customBatModels
      ? mergeRecordsByKey(nextState.customBatModels, patch.customBatModels, (item) =>
          getRemoteStateRecordKey('customBatModels', item),
        )
      : nextState.customBatModels,
    orderJobs: patch.orderJobs
      ? mergeRecordsByKey(nextState.orderJobs, patch.orderJobs, (item) =>
          getRemoteStateRecordKey('orderJobs', item),
        )
      : nextState.orderJobs,
    billingContacts: patch.billingContacts
      ? mergeRecordsByKey(nextState.billingContacts, patch.billingContacts, (item) =>
          getRemoteStateRecordKey('billingContacts', item),
        )
      : nextState.billingContacts,
    crmContacts: patch.crmContacts
      ? mergeRecordsByKey(nextState.crmContacts, patch.crmContacts, (item) =>
          getRemoteStateRecordKey('crmContacts', item),
        )
      : nextState.crmContacts,
  }
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
  if (/\b(no|not|non)\b[^.\n]{0,20}\btrophy\b/.test(normalized)) {
    next.trophyEligible = false
  } else if (/\btrophy\b/.test(normalized)) {
    next.trophyEligible = true
  }
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
  const trophyText = billet.trophyEligible ? ', trophy capable' : ''
  return `${billet.barcode} - ${billet.source}, ${billet.species} ${billet.grade}${trophyText}, ${billet.weight || 'no weight'} oz`
}

function getBatModelName(modelId: string, models: BatModelProduct[]) {
  return models.find((model) => model.id === modelId)?.name ?? modelId
}

function normalizeContactSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function getBillingContactOptionLabel(contact: BillingContact) {
  return [contact.company, contact.email, contact.phone, contact.relationship]
    .filter(Boolean)
    .join(' · ')
}

function getBillingContactSearchOptions(contact: BillingContact): BillingContactSearchOption[] {
  const label = getBillingContactOptionLabel(contact)
  const values = [
    [contact.name, contact.company].filter(Boolean).join(' · '),
    contact.email,
    contact.phone,
    contact.company,
  ].filter(Boolean)

  return Array.from(new Set(values)).map((value, index) => ({
    id: `${contact.id}-${index}`,
    value,
    label,
    contactId: contact.id,
  }))
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
  payerNotificationRecipient?: string
  internalOrderNotificationSent?: boolean
  internalOrderNotificationMethod?: string
  internalOrderNotificationError?: string
  salesRepSubmissionNotificationSent?: boolean
  salesRepSubmissionNotificationError?: string
  orderJobs?: OrderJob[]
  players?: PlayerProfile[]
  billingContacts?: BillingContact[]
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

type SalesPortalApiResponse = {
  ok?: boolean
  message?: string
  email?: string
  devCode?: string
  loginCode?: string
  accessCode?: string
  expiresAt?: string
  session?: SalesPortalSession
  crmContacts?: CrmContact[]
  orderJobs?: OrderJob[]
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

const salesPortalPaths = new Set(['/sales-portal', '/sales-crm'])
const internalToolPaths = new Set(['/', '/internal-tool', '/inventory-tool'])
const defaultDemoEmail = 'keith@trinitybats.com'
const salesPortalDemoOnly =
  import.meta.env.VITE_SALES_PORTAL_DEMO_ONLY === 'true' ||
  window.location.hostname.includes('trinity-sales-portal-demo')

function getSalesPortalDemoEmail() {
  const params = new URLSearchParams(window.location.search)
  const demoValue = (params.get('demo') ?? params.get('demoUser') ?? '').trim().toLowerCase()
  const demoEmails = new Map([
    ['keith', 'keith@trinitybats.com'],
    ['keith@trinitybats.com', 'keith@trinitybats.com'],
    ['shane', 'shane@trinitybats.com'],
    ['shane@trinitybats.com', 'shane@trinitybats.com'],
  ])
  const requestedEmail = demoEmails.get(demoValue)

  if (requestedEmail) return requestedEmail
  return salesPortalDemoOnly ? defaultDemoEmail : ''
}

function createDemoSalesPortalSession(email: string): SalesPortalSession {
  const owner = getSalesPortalOwnerForEmail(email)
  return {
    email,
    name: owner.name,
    label: owner.label,
    isAdmin: salesPortalAdminEmails.has(normalizeTrinityEmail(email)),
    loggedInAt: new Date().toISOString(),
  }
}

function getCurrentAppPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function isPublicOrderFormRoute() {
  return publicOrderFormPaths.has(getCurrentAppPath())
}

function isSalesPortalRoute() {
  return salesPortalPaths.has(getCurrentAppPath())
}

function isInternalToolRoute() {
  return internalToolPaths.has(getCurrentAppPath())
}

function isLocalPreviewHost() {
  return ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
}

function isCrmSandboxPreviewRoute() {
  const params = new URLSearchParams(window.location.search)
  return isLocalPreviewHost() && params.get('crmSandbox') === '1'
}

function getInitialActiveSection(): ActiveSection {
  const params = new URLSearchParams(window.location.search)
  return isCrmSandboxPreviewRoute() && params.get('section') === 'crm' ? 'crm' : 'inventory'
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
      : ` and invoice sent${payload.payerNotificationRecipient ? ` to ${payload.payerNotificationRecipient}` : ''}`
    : ''
  const draftReviewMessage =
    draft.createDraftOrder && payload.draftInvoiceReadyForReview
      ? ' and the draft invoice is ready for review'
      : ''
  const internalCopyMessage = payload.internalOrderNotificationError
    ? `, but internal order-copy emails failed: ${payload.internalOrderNotificationError}`
    : payload.internalOrderNotificationSent
      ? ' and internal order-copy emails sent'
      : ''

  return `${payload.order?.name ?? payload.draftOrder?.name ?? 'Shopify order'} created${emailMessage}${draftReviewMessage}${internalCopyMessage}.`
}

function getCrmTouchpointDayTimestamp(touchpoint: CrmTouchpoint) {
  const dateValue = getCrmDateInputValue(touchpoint.contactedAt)
  return getDateTimestamp(getCrmDateFromInput(dateValue)) || getDateTimestamp(touchpoint.contactedAt)
}

function getCrmTouchpointSequenceTimestamp(touchpoint: CrmTouchpoint, fallbackIndex: number) {
  const idTimestamp = Number(touchpoint.id.match(/-(\d{12,})-/)?.[1] ?? '')
  if (Number.isFinite(idTimestamp) && idTimestamp > 0) return idTimestamp

  const contactedTimestamp = getDateTimestamp(touchpoint.contactedAt)
  return contactedTimestamp || fallbackIndex
}

function hasInvalidSalesOrderDraft(draft: SalesOrderDraft) {
  const payerEmail = draft.billingDifferent ? draft.billingEmail : draft.playerEmail
  const payerPhone = draft.billingDifferent ? draft.billingPhone : draft.playerPhone
  const hasMissingShippingAddress =
    draft.requiresShipping &&
    (!draft.shippingAddress1.trim() ||
      !draft.shippingCity.trim() ||
      !draft.shippingProvinceCode.trim() ||
      !draft.shippingZip.trim() ||
      !draft.shippingCountryCode.trim())
  const hasInvalidLine = draft.lines.some(
    (line) =>
      !line.title.trim() ||
      !line.unitPrice.trim() ||
      !Number.isFinite(Number(line.unitPrice)) ||
      Number(line.unitPrice) < 0 ||
      !line.quantity ||
      line.quantity < 1,
  )

  return (
    !draft.playerName.trim() ||
    !payerEmail.trim() ||
    !payerPhone.trim() ||
    hasMissingShippingAddress ||
    hasInvalidLine
  )
}

function ContactEngagementReview({
  touchpoints,
  emptyMessage = 'No engagements have been saved for this contact yet.',
}: {
  touchpoints: CrmTouchpoint[]
  emptyMessage?: string
}) {
  const sortedTouchpoints = touchpoints
    .map((touchpoint, originalIndex) => ({
      touchpoint,
      originalIndex,
      dayTimestamp: getCrmTouchpointDayTimestamp(touchpoint),
      sequenceTimestamp: getCrmTouchpointSequenceTimestamp(touchpoint, originalIndex),
    }))
    .sort(
      (first, second) =>
        first.dayTimestamp - second.dayTimestamp ||
        first.sequenceTimestamp - second.sequenceTimestamp ||
        first.originalIndex - second.originalIndex,
    )
    .map(({ touchpoint }) => touchpoint)

  if (sortedTouchpoints.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>
  }

  return (
    <div className="crm-contact-engagement-list">
      {sortedTouchpoints.map((touchpoint, index) => (
        <details className="crm-contact-engagement-item" key={touchpoint.id}>
          <summary>
            <span className="crm-engagement-number">{index + 1}</span>
            <strong>{getCrmTouchpointTypeLabel(touchpoint.type)}</strong>
            <small>{formatSalesDashboardDate(touchpoint.contactedAt)}</small>
          </summary>
          <div className="crm-contact-engagement-summary">
            <p>{touchpoint.summary || 'No summary was saved for this engagement.'}</p>
            {touchpoint.nextStep ? (
              <p>
                <strong>Next step:</strong> {touchpoint.nextStep}
              </p>
            ) : null}
            {touchpoint.nextFollowUpAt ? (
              <small>Follow up {formatSalesDashboardDate(touchpoint.nextFollowUpAt)}</small>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  )
}

type SalesOrderDraftFieldUpdater = <K extends keyof SalesOrderDraft>(
  key: K,
  value: SalesOrderDraft[K],
) => void

function SalesOrderShippingAddressFields({
  draft,
  updateField,
}: {
  draft: SalesOrderDraft
  updateField: SalesOrderDraftFieldUpdater
}) {
  return (
    <div className="billing-panel">
      <div className="form-row">
        <label>
          {draft.billingDifferent ? 'Shipping recipient phone' : 'Payer phone'}
          <input
            type="tel"
            value={draft.playerPhone}
            placeholder="Example: (321) 652-1800"
            onChange={(event) => updateField('playerPhone', event.target.value)}
          />
        </label>
        {draft.requiresShipping ? (
          <label>
            Shipping country code
            <input
              value={draft.shippingCountryCode}
              placeholder="US"
              onChange={(event) =>
                updateField('shippingCountryCode', event.target.value.toUpperCase())
              }
            />
          </label>
        ) : null}
      </div>

      {draft.requiresShipping ? (
        <>
          <div className="form-row">
            <label>
              Shipping address
              <input
                value={draft.shippingAddress1}
                placeholder="Street address"
                onChange={(event) => updateField('shippingAddress1', event.target.value)}
              />
            </label>
            <label>
              Apartment, suite, etc.
              <input
                value={draft.shippingAddress2}
                placeholder="Optional"
                onChange={(event) => updateField('shippingAddress2', event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Shipping city
              <input
                value={draft.shippingCity}
                placeholder="City"
                onChange={(event) => updateField('shippingCity', event.target.value)}
              />
            </label>
            <label>
              Shipping state
              <input
                value={draft.shippingProvinceCode}
                placeholder="Example: CO"
                onChange={(event) =>
                  updateField('shippingProvinceCode', event.target.value.toUpperCase())
                }
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Shipping ZIP
              <input
                value={draft.shippingZip}
                placeholder="ZIP code"
                onChange={(event) => updateField('shippingZip', event.target.value)}
              />
            </label>
          </div>

        </>
      ) : null}
    </div>
  )
}

type SalesOrderFormFieldsProps = {
  draft: SalesOrderDraft
  setDraft: Dispatch<SetStateAction<SalesOrderDraft>>
  updateField: SalesOrderDraftFieldUpdater
  updateLine: (id: string, patch: Partial<SalesOrderLineDraft>) => void
  addLine: () => void
  removeLine: (id: string) => void
  shopifyCatalog: ShopifyCatalogProduct[]
  productDatalistId: string
  playerNameDatalistId?: string
  billingContactDatalistId?: string
  updateBillingName?: (value: string) => void
  billingContacts?: BillingContact[]
  applyBillingContact?: (contact: BillingContact) => void
  attachmentFile: File | null
  setAttachmentFile: Dispatch<SetStateAction<File | null>>
  isSubmitting: boolean
  hideSalesRepFields?: boolean
}

function SalesOrderFormFields({
  draft,
  setDraft,
  updateField,
  updateLine,
  addLine,
  removeLine,
  shopifyCatalog,
  productDatalistId,
  playerNameDatalistId,
  billingContactDatalistId,
  updateBillingName,
  billingContacts = [],
  applyBillingContact,
  attachmentFile,
  setAttachmentFile,
  isSubmitting,
  hideSalesRepFields = false,
}: SalesOrderFormFieldsProps) {
  return (
    <>
      <div className={`form-row ${draft.billingDifferent ? 'single-field-row' : ''}`}>
        <label>
          Player name
          <input
            list={playerNameDatalistId}
            value={draft.playerName}
            placeholder="Example: Jordan Smith"
            onChange={(event) => updateField('playerName', event.target.value)}
          />
        </label>
        {!draft.billingDifferent ? (
          <label>
            Payer email
            <input
              type="email"
              value={draft.playerEmail}
              placeholder="payer@example.com"
              onChange={(event) => updateField('playerEmail', event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <label className="checkbox-row billing-toggle">
        <input
          type="checkbox"
          checked={draft.billingDifferent}
          onChange={(event) => {
            const billingDifferent = event.target.checked
            setDraft((current) => ({
              ...current,
              billingDifferent,
            }))
          }}
        />
        <span>Bill a team, agent, or other payer</span>
      </label>

      <label className="checkbox-row billing-toggle">
        <input
          type="checkbox"
          checked={!draft.requiresShipping}
          onChange={(event) => {
            const requiresShipping = !event.target.checked
            setDraft((current) => ({
              ...current,
              requiresShipping,
              shippingSpeed: requiresShipping ? current.shippingSpeed : 'standard',
              shippingAddress1: requiresShipping ? current.shippingAddress1 : '',
              shippingAddress2: requiresShipping ? current.shippingAddress2 : '',
              shippingCity: requiresShipping ? current.shippingCity : '',
              shippingProvinceCode: requiresShipping ? current.shippingProvinceCode : '',
              shippingZip: requiresShipping ? current.shippingZip : '',
              shippingCountryCode: requiresShipping ? current.shippingCountryCode : 'US',
            }))
          }}
        />
        <span>Local delivery / no shipping required</span>
      </label>

      <div className="form-row fulfillment-options-row">
        <label>
          Shipping speed
          <select
            value={draft.shippingSpeed}
            disabled={!draft.requiresShipping}
            onChange={(event) =>
              updateField('shippingSpeed', event.target.value as ShippingSpeedOption)
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
            value={draft.productionTimeline}
            onChange={(event) =>
              updateField('productionTimeline', event.target.value as ProductionTimelineOption)
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

      {draft.billingDifferent ? (
        <div className="billing-panel">
          <div className="form-row">
            <label>
              Payer name
              <input
                list={billingContactDatalistId}
                value={draft.billingName}
                placeholder={
                  billingContactDatalistId
                    ? 'Search name, team, agent, or agency'
                    : 'Team, agent, agency, or payer name'
                }
                onChange={(event) => {
                  const value = event.target.value
                  if (updateBillingName) {
                    updateBillingName(value)
                  } else {
                    updateField('billingName', value)
                  }
                }}
              />
            </label>
            <label>
              Payer email
              <input
                type="email"
                value={draft.billingEmail}
                placeholder="billing@example.com"
                onChange={(event) => updateField('billingEmail', event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Payer phone
              <input
                type="tel"
                value={draft.billingPhone}
                placeholder="Example: (321) 652-1800"
                onChange={(event) => updateField('billingPhone', event.target.value)}
              />
            </label>
            <label>
              Team or agency
              <input
                value={draft.billingCompany}
                placeholder="Example: New York Mets"
                onChange={(event) => updateField('billingCompany', event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Billing relationship
              <input
                value={draft.billingRelationship}
                placeholder="Example: Minor league clubhouse manager"
                onChange={(event) => updateField('billingRelationship', event.target.value)}
              />
            </label>
          </div>

          {billingContacts.length > 0 && applyBillingContact ? (
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
                    {[contact.name, contact.company].filter(Boolean).join(' · ') ||
                      contact.email ||
                      contact.phone}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <SalesOrderShippingAddressFields draft={draft} updateField={updateField} />

      {!hideSalesRepFields ? (
        <>
          <label>
            Sales rep
            <input
              value={draft.salesRep}
              placeholder="Example: Matt"
              onChange={(event) => updateField('salesRep', event.target.value)}
            />
          </label>

          <label>
            Sales rep email
            <input
              type="email"
              value={draft.salesRepEmail}
              placeholder="rep@trinitybats.com"
              onChange={(event) => updateField('salesRepEmail', event.target.value)}
            />
          </label>
        </>
      ) : null}

      <div className="sales-line-list">
        {draft.lines.map((line, index) => {
          const lineProduct = shopifyCatalog.find((product) => product.id === line.productId)
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
                {draft.lines.length > 1 ? (
                  <button
                    type="button"
                    className="secondary-button destructive-button compact-button"
                    onClick={() => removeLine(line.id)}
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
                      updateLine(line.id, {
                        isProOrder,
                        productId: '',
                        variantId: '',
                        title: line.title || lineProduct?.name || '',
                      })
                      return
                    }

                    updateLine(line.id, {
                      isProOrder,
                      ...getTypedBatModelPatch(shopifyCatalog, line.title, line),
                    })
                  }}
                />
                <span>Pro order</span>
              </label>

              <div className="form-row">
                <label>
                  Bat model
                  <input
                    list={line.isProOrder ? undefined : productDatalistId}
                    value={productInputValue}
                    placeholder={
                      line.isProOrder
                        ? 'Example: T141 pro custom'
                        : 'Type a model or choose a Shopify product'
                    }
                    onChange={(event) => {
                      const typedProduct = event.target.value
                      if (line.isProOrder) {
                        updateLine(line.id, {
                          productId: '',
                          variantId: '',
                          title: typedProduct,
                        })
                        return
                      }

                      updateLine(line.id, getTypedBatModelPatch(shopifyCatalog, typedProduct, line))
                    }}
                  />
                </label>
                <label>
                  Wood species
                  <select
                    value={line.wood}
                    onChange={(event) =>
                      updateLine(line.id, {
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
                  Unit price
                  <input
                    inputMode="decimal"
                    value={line.unitPrice}
                    placeholder="Example: 189.00"
                    onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })}
                  />
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Length
                  <input
                    value={line.length}
                    placeholder="Example: 34"
                    onChange={(event) => updateLine(line.id, { length: event.target.value })}
                  />
                </label>
                <label>
                  Weight
                  <input
                    value={line.targetWeight}
                    placeholder="Example: 31.5"
                    onChange={(event) => updateLine(line.id, { targetWeight: event.target.value })}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Handle color
                  <select
                    value={line.handleColor}
                    onChange={(event) => updateLine(line.id, { handleColor: event.target.value })}
                  >
                    <option value="">Select handle color</option>
                    {handleColorOptions.map((color) => (
                      <option key={color}>{color}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Barrel color
                  <select
                    value={line.barrelColor}
                    onChange={(event) => updateLine(line.id, { barrelColor: event.target.value })}
                  >
                    <option value="">Select barrel color</option>
                    {barrelColorOptions.map((color) => (
                      <option key={color}>{color}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Band color
                  <select
                    value={line.bandColor}
                    onChange={(event) => updateLine(line.id, { bandColor: event.target.value })}
                  >
                    <option value="">Select band color</option>
                    {bandColorOptions.map((color) => (
                      <option key={color}>{color}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Logo color
                  <select
                    value={line.logoColor}
                    onChange={(event) => updateLine(line.id, { logoColor: event.target.value })}
                  >
                    <option value="">Select logo color</option>
                    {logoColorOptions.map((color) => (
                      <option key={color}>{color}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Cup
                  <select
                    value={line.cupped}
                    onChange={(event) =>
                      updateLine(line.id, {
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
                    onChange={(event) => updateLine(line.id, { engraving: event.target.value })}
                  />
                </label>
              </div>
            </article>
          )
        })}
      </div>

      <button type="button" className="secondary-button" onClick={addLine}>
        Add another line
      </button>

      <div className="attachment-field">
        <label>
          Internal attachment
          <input
            type="file"
            onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {attachmentFile ? (
          <div className="attachment-chip">
            <span>{attachmentFile.name}</span>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => setAttachmentFile(null)}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      <label className="notes-field">
        Internal order notes
        <textarea
          value={draft.notes}
          placeholder="Payment terms, delivery promise, team contact, or packaging notes"
          onChange={(event) => updateField('notes', event.target.value)}
        />
      </label>

      <label className="checkbox-row invoice-toggle">
        <input
          type="checkbox"
          checked={draft.createDraftOrder}
          onChange={(event) => {
            const createDraftOrder = event.target.checked
            setDraft((current) => ({
              ...current,
              createDraftOrder,
              sendInvoice: createDraftOrder ? false : current.sendInvoice,
            }))
          }}
        />
        <span>Create and send Shopify draft invoice</span>
      </label>

      {!draft.createDraftOrder ? (
        <label className="checkbox-row invoice-toggle">
          <input
            type="checkbox"
            checked={draft.sendInvoice}
            onChange={(event) => updateField('sendInvoice', event.target.checked)}
          />
          <span>Send Shopify invoice/documentation after order creation</span>
        </label>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? draft.createDraftOrder
            ? 'Creating draft...'
            : 'Creating order...'
          : draft.createDraftOrder
            ? 'Create and send Shopify draft invoice'
            : 'Create Shopify order'}
      </button>
    </>
  )
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
    variantId: '',
    title: product?.name ?? typedModelName,
    unitPrice: firstVariant?.price ?? currentLine.unitPrice,
  }
}

function cloneSalesOrderDraft(draft: SalesOrderDraft): SalesOrderDraft {
  return {
    ...draft,
    attachment: draft.attachment ? { ...draft.attachment } : null,
    lines: draft.lines.map((line) => ({ ...line })),
  }
}

async function uploadSalesOrderAttachment(file: File): Promise<OrderAttachment> {
  if (file.size > maxSalesOrderAttachmentBytes) {
    throw new Error('Attachment must be 20 MB or smaller.')
  }

  const response = await fetch(getApiPath('/api/order-attachments'), {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-trinity-attachment-name': encodeURIComponent(file.name),
      'x-trinity-attachment-type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  const payload = (await response.json()) as {
    ok?: boolean
    message?: string
    attachment?: Partial<OrderAttachment>
  }
  const attachment = normalizeOrderAttachment(payload.attachment)
  if (!response.ok || !payload.ok || !attachment) {
    throw new Error(payload.message ?? 'Could not upload attachment.')
  }

  return attachment
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
  const [salesOrderAttachmentFile, setSalesOrderAttachmentFile] = useState<File | null>(null)
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
        'Add the player, payer email, payer phone, shipping address, bat model, unit price, and complete each line before submitting.',
      )
      return
    }

    try {
      setIsSubmitting(true)
      setMessage(
        salesOrderDraft.createDraftOrder
          ? salesOrderAttachmentFile
            ? 'Uploading attachment and creating/sending Shopify draft invoice...'
            : 'Creating and sending Shopify draft invoice...'
          : salesOrderAttachmentFile
            ? 'Uploading attachment and creating Shopify order...'
            : 'Creating Shopify order...',
      )
      const attachment = salesOrderAttachmentFile
        ? await uploadSalesOrderAttachment(salesOrderAttachmentFile)
        : null
      const submittedDraft = {
        ...cloneSalesOrderDraft(salesOrderDraft),
        attachment,
      }
      const response = await fetch(getApiPath('/api/sales-orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submittedDraft),
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
      setSalesOrderAttachmentFile(null)
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
        <div className="public-order-logo" aria-label="Trinity Bat Company">
          Trinity Bat Company
        </div>
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

          <SalesOrderFormFields
            draft={salesOrderDraft}
            setDraft={setSalesOrderDraft}
            updateField={updateSalesDraftField}
            updateLine={updateSalesLine}
            addLine={addSalesLine}
            removeLine={removeSalesLine}
            shopifyCatalog={shopifyCatalog}
            productDatalistId="public-shopify-bat-products"
            attachmentFile={salesOrderAttachmentFile}
            setAttachmentFile={setSalesOrderAttachmentFile}
            isSubmitting={isSubmitting}
          />
        </form>
      </section>
    </main>
  )
}

function InternalApp() {
  const crmSandboxPreviewEnabled = isCrmSandboxPreviewRoute()
  const [activeSection, setActiveSection] = useState<ActiveSection>(() => getInitialActiveSection())
  const [billets, setBillets] = useState<Billet[]>(() => {
    const stored = window.localStorage.getItem(billetStorageKey)
    const parsed = stored ? (JSON.parse(stored) as Billet[]) : seedBillets
    return parsed.map((billet) => normalizeBillet(billet))
  })
  const [players, setPlayers] = useState<PlayerProfile[]>(() => {
    const stored = window.localStorage.getItem(playerStorageKey)
    const parsed = stored ? (JSON.parse(stored) as PlayerProfile[]) : seedPlayers
    return parsed
      .map((player) => normalizePlayerProfile(player))
      .map((player) => hydratePlayerProfileBilletTargets(player, billets))
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
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>(() => {
    const stored = window.localStorage.getItem(crmContactStorageKey)
    return stored ? (JSON.parse(stored) as CrmContact[]).map((contact) => normalizeCrmContact(contact)) : []
  })
  const [draft, setDraft] = useState(emptyBillet)
  const [salesOrderDraft, setSalesOrderDraft] = useState<SalesOrderDraft>(() =>
    emptySalesOrderDraft(),
  )
  const [salesOrderAttachmentFile, setSalesOrderAttachmentFile] = useState<File | null>(null)
  const [salesDashboardRange, setSalesDashboardRange] = useState<SalesDashboardRange>('30')
  const [salesDashboardRepFilter, setSalesDashboardRepFilter] = useState('all')
  const [activeCrmView, setActiveCrmView] = useState<CrmWorkspaceView>('new_contact')
  const [crmQuery, setCrmQuery] = useState('')
  const [crmStageFilter, setCrmStageFilter] = useState<'all' | CrmStage>('all')
  const [crmOwnerFilter, setCrmOwnerFilter] = useState(
    () => window.localStorage.getItem(crmActiveOwnerStorageKey) || 'all',
  )
  const [selectedCrmContactId, setSelectedCrmContactId] = useState('')
  const [selectedCrmEngagementId, setSelectedCrmEngagementId] = useState('')
  const [newCrmContactDraft, setNewCrmContactDraft] = useState<CrmContact>(() =>
    emptyCrmContact(),
  )
  const [newCrmLeadDraft, setNewCrmLeadDraft] = useState<CrmContact>(() =>
    normalizeCrmContact({
      ...emptyCrmContact(),
      stage: 'lead',
      priority: 'warm',
      source: 'Manual lead',
      tags: ['Lead'],
    }),
  )
  const [crmTouchpointDraft, setCrmTouchpointDraft] = useState<CrmTouchpointDraft>(() =>
    emptyCrmTouchpointDraft(),
  )
  const [crmAssistantInput, setCrmAssistantInput] = useState('')
  const [crmAssistantResult, setCrmAssistantResult] = useState('')
  const [crmMessage, setCrmMessage] = useState('')
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
  const [trophyFilters, setTrophyFilters] = useState<InventoryTrophyFilter[]>([])
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
  const [editingVariantTarget, setEditingVariantTarget] = useState<EditingVariantTarget | null>(null)
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
    crmSandboxPreviewEnabled ? 'offline' : 'connecting',
  )
  const [syncRetryNonce, setSyncRetryNonce] = useState(0)
  const [isLoadingRemoteState, setIsLoadingRemoteState] = useState(!crmSandboxPreviewEnabled)
  const [syncMessage, setSyncMessage] = useState(
    crmSandboxPreviewEnabled
      ? 'CRM sandbox preview is local-only and not connected to live Shopify sync.'
      : 'Connecting to Shopify backend...',
  )
  const [lastLiveRefreshAt, setLastLiveRefreshAt] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const hasLoadedRemoteState = useRef(false)
  const skipNextRemoteSync = useRef(false)
  const hasPendingLocalSync = useRef(false)
  const syncInFlight = useRef(false)
  const lastSyncedState = useRef<RemoteState | null>(null)

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

  useEffect(() => {
    window.localStorage.setItem(crmContactStorageKey, JSON.stringify(crmContacts))
  }, [crmContacts])

  useEffect(() => {
    window.localStorage.setItem(crmActiveOwnerStorageKey, crmOwnerFilter)
  }, [crmOwnerFilter])

  function getCurrentRemoteState(): RemoteState {
    return {
      billets,
      players,
      producedBats,
      customBatModels,
      orderJobs,
      billingContacts,
      crmContacts,
    }
  }

  const syncRemoteState = useEffectEvent(async () => {
    if (syncInFlight.current) {
      hasPendingLocalSync.current = true
      return false
    }

    syncInFlight.current = true

    try {
      const snapshot = getCurrentRemoteState()
      const patch = buildRemoteStatePatch(snapshot, lastSyncedState.current)
      const changeCount = countRemoteStatePatchRecords(patch)

      if (!hasRemoteStatePatchChanges(patch)) {
        hasPendingLocalSync.current = false
        if (backendStatus !== 'connected') {
          skipNextRemoteSync.current = true
        }
        setBackendStatus('connected')
        setSyncMessage('Connected to Shopify. Live records are the source of truth.')
        return true
      }

      setSyncMessage(`Syncing ${changeCount} changed record${changeCount === 1 ? '' : 's'} to Shopify...`)
      const response = await fetch(getApiPath('/api/state'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...patch, stateSnapshot: snapshot }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        syncedAt?: string
      }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Sync failed')

      const syncedAt = payload.syncedAt
        ? new Date(payload.syncedAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'just now'

      lastSyncedState.current = applyRemoteStatePatchToSnapshot(lastSyncedState.current, patch)
      if (backendStatus !== 'connected') {
        skipNextRemoteSync.current = true
      }
      setBackendStatus('connected')
      setSyncMessage(
        `Shopify sync complete at ${syncedAt}. Saved ${changeCount} changed record${
          changeCount === 1 ? '' : 's'
        }.`,
      )

      const remainingPatch = buildRemoteStatePatch(getCurrentRemoteState(), lastSyncedState.current)
      if (hasRemoteStatePatchChanges(remainingPatch)) {
        hasPendingLocalSync.current = true
        setSyncRetryNonce((current) => current + 1)
      } else {
        hasPendingLocalSync.current = false
      }

      return true
    } catch (error) {
      setBackendStatus('offline')
      setSyncMessage(
        `Shopify sync failed: ${
          error instanceof Error ? error.message : 'Unknown sync error'
        }. Keep this tab open; the app will retry this record-level save.`,
      )
      return false
    } finally {
      syncInFlight.current = false
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
      const remotePlayers = Array.isArray(remote.players)
        ? remote.players
            .map((player) => normalizePlayerProfile(player))
            .map((player) => hydratePlayerProfileBilletTargets(player, remoteBillets))
        : []
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
      const remoteCrmContacts = Array.isArray(remote.crmContacts)
        ? remote.crmContacts.map((contact) => normalizeCrmContact(contact))
        : []
      const remoteState: RemoteState = {
        billets: remoteBillets,
        players: remotePlayers,
        producedBats: remoteProducedBats,
        customBatModels: remoteCustomBatModels,
        orderJobs: remoteOrderJobs,
        billingContacts: mergeRecordsByKey(
          seedBillingContacts,
          remoteBillingContacts,
          (contact) => contact.id,
        ).map((contact) => normalizeBillingContact(contact)),
        crmContacts: remoteCrmContacts,
      }

      skipNextRemoteSync.current = true
      lastSyncedState.current = remoteState
      setBillets(remoteState.billets)
      setPlayers(remoteState.players)
      setProducedBats(remoteState.producedBats)
      setCustomBatModels(remoteState.customBatModels)
      setOrderJobs(remoteState.orderJobs)
      setBillingContacts(remoteState.billingContacts)
      setCrmContacts(remoteState.crmContacts)
      setLastLiveRefreshAt(new Date().toISOString())

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
    if (crmSandboxPreviewEnabled) {
      hasLoadedRemoteState.current = true
      return
    }

    const timeout = window.setTimeout(() => {
      void loadRemoteState()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [crmSandboxPreviewEnabled])

  useEffect(() => {
    if (backendStatus !== 'offline') return
    if (crmSandboxPreviewEnabled) return

    const retry = window.setInterval(() => {
      if (hasPendingLocalSync.current) {
        void syncRemoteState()
      } else {
        void loadRemoteState()
      }
    }, 10000)

    return () => window.clearInterval(retry)
  }, [backendStatus, crmSandboxPreviewEnabled])

  useEffect(() => {
    if (!hasLoadedRemoteState.current || backendStatus !== 'connected') return
    if (!hasPendingLocalSync.current || syncInFlight.current) return

    const retry = window.setTimeout(() => {
      void syncRemoteState()
    }, 0)

    return () => window.clearTimeout(retry)
  }, [backendStatus, syncRetryNonce])

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
  }, [
    backendStatus,
    billets,
    players,
    producedBats,
    customBatModels,
    orderJobs,
    billingContacts,
    crmContacts,
  ])

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
    setTrophyFilters([])
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
      billet.trophyEligible ? 'trophy capable' : 'not trophy capable',
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
    const matchesTrophy =
      trophyFilters.length === 0 ||
      trophyFilters.some((filter) =>
        filter === 'yes' ? billet.trophyEligible : !billet.trophyEligible,
      )
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
      matchesTrophy &&
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
    if (!isProPlayerProfile(player)) return false

    const searchable = [
      player.playerName,
      player.profileKind,
      ...player.bats.flatMap((bat) => [
        bat.modelNumber,
        bat.weight,
        bat.source,
        bat.species,
        bat.woodTier,
        bat.idealBilletWeight,
        bat.colorPreferences,
        bat.notes,
      ]),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(playerQuery.toLowerCase())
  })

  const billingContactSearchOptions = billingContacts.flatMap((contact) =>
    getBillingContactSearchOptions(contact),
  )

  const shopifyBatModels: BatModelProduct[] = useMemo(
    () =>
      shopifyCatalog.map((product) => ({
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
      })),
    [shopifyCatalog],
  )

  const allBatModels = useMemo(() => {
    const batModelMap = new Map<string, BatModelProduct>()
    ;[...seedBatModels, ...shopifyBatModels, ...customBatModels].forEach((model) => {
      const key = model.source === 'shopify' ? model.id : model.name.toLowerCase()
      if (!batModelMap.has(key) || model.source === 'shopify' || model.source === 'custom') {
        batModelMap.set(key, model)
      }
    })
    return Array.from(batModelMap.values())
  }, [customBatModels, shopifyBatModels])
  const trainerBatModels = useMemo(
    () => allBatModels.filter((model) => isTrainerModel(model)),
    [allBatModels],
  )
  const nonTrainerBatModels = useMemo(
    () => allBatModels.filter((model) => !isTrainerModel(model)),
    [allBatModels],
  )
  const billetById = useMemo(
    () => new Map(billets.map((billet) => [billet.id, billet])),
    [billets],
  )
  const selectableBillets = useMemo(() => {
    const selectedBilletIds = new Set(producedBatDraft.billetIds)
    return billets.filter(
      (billet) => billet.status === 'storage' || selectedBilletIds.has(billet.id),
    )
  }, [billets, producedBatDraft.billetIds])
  const selectedShopifyProduct = useMemo(
    () =>
      shopifyCatalog.find((product) => product.id === producedBatDraft.shopifyProductId) ?? null,
    [producedBatDraft.shopifyProductId, shopifyCatalog],
  )
  const selectedShopifyVariant = useMemo(
    () =>
      selectedShopifyProduct?.variants.find(
        (variant) => variant.id === producedBatDraft.shopifyVariantId,
      ) ?? null,
    [producedBatDraft.shopifyVariantId, selectedShopifyProduct],
  )
  const openOrderJobs = useMemo(
    () =>
      orderJobs.filter(
        (job) => job.productionStatus !== 'complete' && job.productionStatus !== 'cancelled',
      ),
    [orderJobs],
  )
  const readyOrderJobs = useMemo(
    () =>
      orderJobs.filter(
        (job) => job.productionStatus === 'ready' || job.productionStatus === 'in_production',
      ),
    [orderJobs],
  )
  const normalizedOrderQuery = orderQuery.toLowerCase()
  const filteredOrderJobs = useMemo(
    () =>
      orderJobs.filter((job) => {
        const matchesStatus =
          orderStatusFilter === 'all' || job.productionStatus === orderStatusFilter
        if (!matchesStatus) return false
        if (!normalizedOrderQuery) return true

        const assignedBillet = job.assignedBilletId
          ? billetById.get(job.assignedBilletId)?.barcode ?? job.assignedBilletId
          : ''
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
          job.salesRepEmail,
          job.orderSubmittedAt,
          assignedBillet,
          job.specs.model,
          job.specs.length,
          job.specs.targetWeight,
          job.specs.wood,
          job.specs.handleColor,
          job.specs.barrelColor,
          job.specs.bandColor,
          job.specs.logoColor,
          job.specs.engraving,
          job.specs.cupped,
          job.specs.notes,
          job.notes,
          job.internalNotes,
        ]
          .join(' ')
          .toLowerCase()

        return searchable.includes(normalizedOrderQuery)
      }),
    [billetById, normalizedOrderQuery, orderJobs, orderStatusFilter],
  )
  const salesDashboardAllSales = useMemo(() => buildSalesDashboardSales(orderJobs), [orderJobs])
  const salesDashboardRepOptions = useMemo(
    () => buildSalesRepSummaries(salesDashboardAllSales),
    [salesDashboardAllSales],
  )
  const salesDashboardSales = useMemo(
    () =>
      salesDashboardAllSales.filter((sale) => {
        const matchesRange = isSaleInsideDashboardRange(sale, salesDashboardRange)
        const matchesRep =
          salesDashboardRepFilter === 'all' ||
          getSalesRepSummaryKey(sale) === salesDashboardRepFilter

        return matchesRange && matchesRep
      }),
    [salesDashboardAllSales, salesDashboardRange, salesDashboardRepFilter],
  )
  const salesDashboardSummaries = useMemo(
    () => buildSalesRepSummaries(salesDashboardSales),
    [salesDashboardSales],
  )
  const {
    paidSales: salesDashboardPaidSales,
    openSales: salesDashboardOpenSales,
    submittedValue: salesDashboardSubmittedValue,
    paidValue: salesDashboardPaidValue,
    openValue: salesDashboardOpenValue,
  } = useMemo(() => {
    const paidSales: SalesDashboardSale[] = []
    const openSales: SalesDashboardSale[] = []
    let submittedValue = 0
    let paidValue = 0
    let openValue = 0

    for (const sale of salesDashboardSales) {
      submittedValue += sale.total
      if (sale.isPaid) {
        paidSales.push(sale)
        paidValue += sale.total
      } else {
        openSales.push(sale)
        openValue += sale.total
      }
    }

    return { paidSales, openSales, submittedValue, paidValue, openValue }
  }, [salesDashboardSales])
  const salesDashboardRecentSales = useMemo(
    () =>
      [...salesDashboardSales]
        .sort(
          (first, second) =>
            getDateTimestamp(second.paidAt || second.submittedAt) -
            getDateTimestamp(first.paidAt || first.submittedAt),
        )
        .slice(0, 8),
    [salesDashboardSales],
  )
  const salesDashboardAwaitingPayment = useMemo(
    () =>
      [...salesDashboardOpenSales]
        .sort(
          (first, second) =>
            getDateTimestamp(first.submittedAt) - getDateTimestamp(second.submittedAt),
        )
        .slice(0, 8),
    [salesDashboardOpenSales],
  )
  const crmDirectory = useMemo(
    () => buildCrmContactDirectory(crmContacts, orderJobs, billingContacts),
    [billingContacts, crmContacts, orderJobs],
  )
  const crmContactSummaries = useMemo(
    () => buildCrmContactSummaries(crmDirectory, orderJobs),
    [crmDirectory, orderJobs],
  )
  const crmOwnerOptions = useMemo(() => {
    const owners = new Map<string, CrmOwnerOption>(
      seedCrmOwnerOptions.map((owner) => [owner.key, owner]),
    )
    for (const summary of crmContactSummaries) {
      const option = createCrmOwnerOption(summary.contact.salesOwner, summary.contact.ownerEmail)
      if (option) owners.set(option.key, option)
    }
    return Array.from(owners.values()).sort((a, b) => compareText(a.label, b.label))
  }, [crmContactSummaries])
  const activeCrmOwnerOption =
    crmOwnerOptions.find((owner) => owner.key === crmOwnerFilter) ?? null
  const crmOwnerScopedSummaries = useMemo(
    () =>
      crmContactSummaries.filter((summary) => matchesCrmOwnerFilter(summary, crmOwnerFilter)),
    [crmContactSummaries, crmOwnerFilter],
  )
  const filteredCrmSummaries = useMemo(() => {
    const normalizedQuery = normalizeCrmSearchText(crmQuery)

    return crmOwnerScopedSummaries
      .filter((summary) => {
        const matchesStage =
          crmStageFilter === 'all' || summary.contact.stage === crmStageFilter
        if (!matchesStage) return false
        if (!normalizedQuery) return true

        const searchable = normalizeCrmSearchText(
          [
            summary.contact.name,
            summary.contact.company,
            summary.contact.role,
            summary.contact.email,
            summary.contact.phone,
            summary.contact.salesOwner,
            summary.contact.source,
            summary.contact.preferredContactMethod,
            summary.contact.buyingContext,
            summary.contact.batPreferences,
            summary.contact.relationshipNotes,
            summary.contact.objections,
            summary.contact.opportunities,
            ...summary.contact.playerNames,
            ...summary.contact.tags,
            ...summary.orders.flatMap((job) => [
              job.shopifyOrderName,
              job.shopifyDraftOrderName,
              job.productTitle,
              job.specs.model,
              job.specs.wood,
              job.salesRep,
            ]),
          ].join(' '),
        )

        return searchable.includes(normalizedQuery)
      })
      .sort((a, b) => {
        if (a.followUpDue !== b.followUpDue) return a.followUpDue ? -1 : 1
        const priorityOrder: Record<CrmPriority, number> = { hot: 0, warm: 1, steady: 2, low: 3 }
        if (a.contact.priority !== b.contact.priority) {
          return priorityOrder[a.contact.priority] - priorityOrder[b.contact.priority]
        }
        return getDateTimestamp(b.lastActivityAt) - getDateTimestamp(a.lastActivityAt)
      })
  }, [crmOwnerScopedSummaries, crmQuery, crmStageFilter])
  const selectedCrmSummary =
    filteredCrmSummaries.find((summary) => summary.contact.id === selectedCrmContactId) ??
    crmOwnerScopedSummaries.find((summary) => summary.contact.id === selectedCrmContactId) ??
    filteredCrmSummaries[0] ??
    crmOwnerScopedSummaries[0] ??
    null
  const crmMetricTotals = useMemo(() => {
    const dueFollowUps = crmOwnerScopedSummaries.filter((summary) => summary.followUpDue).length
    const hotContacts = crmOwnerScopedSummaries.filter(
      (summary) => summary.contact.priority === 'hot' || summary.contact.stage === 'invoice_sent',
    ).length
    const openValue = crmOwnerScopedSummaries.reduce((total, summary) => total + summary.openValue, 0)
    const repeatCustomers = crmOwnerScopedSummaries.filter((summary) => summary.orderCount > 1).length

    return { dueFollowUps, hotContacts, openValue, repeatCustomers }
  }, [crmOwnerScopedSummaries])
  const crmLeadSummaries = useMemo(
    () =>
      crmOwnerScopedSummaries
        .filter((summary) => {
          const leadStages: CrmStage[] = ['lead', 'qualified', 'quoted', 'invoice_sent', 'nurture']
          const cameFromManualSalesFeed = summary.orders.some((job) => job.origin === 'internal_sales')
          return leadStages.includes(summary.contact.stage) || cameFromManualSalesFeed
        })
        .sort((a, b) => {
          if (a.followUpDue !== b.followUpDue) return a.followUpDue ? -1 : 1
          return getDateTimestamp(b.lastActivityAt) - getDateTimestamp(a.lastActivityAt)
        }),
    [crmOwnerScopedSummaries],
  )
  const crmEngagements = useMemo(
    () =>
      crmOwnerScopedSummaries
        .flatMap((summary) =>
          summary.contact.touchpoints.map((touchpoint) => ({
            contact: summary.contact,
            summary,
            touchpoint,
          })),
        )
        .sort(
          (a, b) =>
            getDateTimestamp(b.touchpoint.contactedAt) -
            getDateTimestamp(a.touchpoint.contactedAt),
        ),
    [crmOwnerScopedSummaries],
  )
  const selectedCrmEngagement =
    crmEngagements.find((item) => item.touchpoint.id === selectedCrmEngagementId) ??
    crmEngagements[0] ??
    null

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

  function updateBilletWeight(id: string, weight: Billet['weight']) {
    setBillets((current) =>
      current.map((billet) =>
        billet.id === id ? { ...billet, weight: normalizeBilletWeight(weight) } : billet,
      ),
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

  function mergeIncomingPlayers(incomingPlayers: PlayerProfile[]) {
    if (incomingPlayers.length === 0) return

    setPlayers((current) =>
      mergeRecordsByKey(
        current,
        incomingPlayers.map((player) => normalizePlayerProfile(player)),
        (player) => player.id || `${player.profileKind}:${player.playerName}`,
      ),
    )
  }

  function mergeIncomingBillingContacts(incomingContacts: BillingContact[]) {
    if (incomingContacts.length === 0) return

    setBillingContacts((current) =>
      mergeRecordsByKey(
        current,
        incomingContacts.map((contact) => normalizeBillingContact(contact)),
        (contact) => contact.id,
      ).map((contact) => normalizeBillingContact(contact)),
    )
  }

  async function createSalesDraftOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payerEmail = salesOrderDraft.billingDifferent
      ? salesOrderDraft.billingEmail
      : salesOrderDraft.playerEmail
    const payerPhone = salesOrderDraft.billingDifferent
      ? salesOrderDraft.billingPhone
      : salesOrderDraft.playerPhone
    const requiresShipping = salesOrderDraft.requiresShipping
    const hasMissingShippingAddress =
      requiresShipping &&
      (!salesOrderDraft.shippingAddress1.trim() ||
        !salesOrderDraft.shippingCity.trim() ||
        !salesOrderDraft.shippingProvinceCode.trim() ||
        !salesOrderDraft.shippingZip.trim() ||
        !salesOrderDraft.shippingCountryCode.trim())
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
      !payerPhone.trim() ||
      hasMissingShippingAddress ||
      hasInvalidLine
    ) {
      setOrderActionMessage(
        'Add the player, payer email, payer phone, shipping address, bat model, unit price, and complete each line before creating the order.',
      )
      return
    }

    try {
      setIsCreatingDraftOrder(true)
      setOrderActionMessage(
        salesOrderDraft.createDraftOrder
          ? salesOrderAttachmentFile
            ? 'Uploading attachment and creating/sending Shopify draft invoice...'
            : 'Creating and sending Shopify draft invoice...'
          : salesOrderAttachmentFile
            ? 'Uploading attachment and creating Shopify order...'
            : 'Creating Shopify order...',
      )
      const attachment = salesOrderAttachmentFile
        ? await uploadSalesOrderAttachment(salesOrderAttachmentFile)
        : null
      const draftToSubmit = {
        ...cloneSalesOrderDraft(salesOrderDraft),
        attachment,
      }
      const response = await fetch(getApiPath('/api/sales-orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftToSubmit),
      })
      const payload = (await response.json()) as SalesOrderApiResponse
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Shopify order failed')

      mergeIncomingOrderJobs(payload.orderJobs ?? [])
      mergeIncomingPlayers(payload.players ?? [])
      mergeIncomingBillingContacts(payload.billingContacts ?? [])
      upsertCrmContactFromSalesOrderDraft(salesOrderDraft, payload.orderJobs ?? [])
      setSalesOrderDraft(emptySalesOrderDraft())
      setSalesOrderAttachmentFile(null)
      setOrderActionMessage(getSalesOrderSuccessMessage(salesOrderDraft, payload))
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
        players?: PlayerProfile[]
        billingContacts?: BillingContact[]
      }
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Order import failed')

      mergeIncomingOrderJobs(payload.orderJobs ?? [])
      mergeIncomingPlayers(payload.players ?? [])
      mergeIncomingBillingContacts(payload.billingContacts ?? [])
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

  function getActiveCrmOwnerAssignment(fallback?: Pick<CrmContact, 'salesOwner' | 'ownerEmail'>) {
    return {
      salesOwner: fallback?.salesOwner || activeCrmOwnerOption?.name || '',
      ownerEmail: fallback?.ownerEmail || activeCrmOwnerOption?.email || '',
    }
  }

  function saveCrmContact(contact: CrmContact) {
    const normalized = normalizeCrmContact({
      ...contact,
      updatedAt: new Date().toISOString(),
      sandboxOnly: true,
    })

    setCrmContacts((current) => {
      const existingIndex = current.findIndex(
        (savedContact) =>
          savedContact.id === normalized.id || hasSharedCrmIdentity(savedContact, normalized),
      )
      if (existingIndex === -1) return [...current, normalized]

      return current.map((savedContact, index) =>
        index === existingIndex ? mergeCrmContacts(normalized, savedContact) : savedContact,
      )
    })
    setSelectedCrmContactId(normalized.id)
  }

  function updateSelectedCrmContact(patch: Partial<CrmContact>) {
    if (!selectedCrmSummary) return
    saveCrmContact({
      ...selectedCrmSummary.contact,
      ...patch,
    })
  }

  function createCrmContact() {
    const contact = normalizeCrmContact({
      ...emptyCrmContact(),
      ...getActiveCrmOwnerAssignment(),
      source: 'Manual CRM entry',
      tags: ['Manual entry'],
    })
    saveCrmContact(contact)
    setSelectedCrmContactId(contact.id)
    setCrmMessage('New sandbox customer profile created.')
  }

  function saveNewCrmContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newCrmContactDraft.name.trim() && !newCrmContactDraft.company.trim()) {
      setCrmMessage('Add at least a name or organization before saving a contact.')
      return
    }

    const now = new Date().toISOString()
    const ownerAssignment = getActiveCrmOwnerAssignment(newCrmContactDraft)
    const firstNote = newCrmContactDraft.buyingContext.trim()
    const firstTouchpoint = firstNote
      ? normalizeCrmTouchpoint({
          id: createId('crm-touchpoint'),
          type: 'note',
          contactedAt: now,
          salesRep: ownerAssignment.salesOwner,
          summary: firstNote,
          sentiment: '',
          nextStep: '',
          nextFollowUpAt: newCrmContactDraft.followUpAt,
          relatedOrderId: '',
        })
      : null
    const contact = normalizeCrmContact({
      ...newCrmContactDraft,
      ...ownerAssignment,
      stage: newCrmContactDraft.stage || 'lead',
      source: newCrmContactDraft.source || 'Manual CRM entry',
      tags: normalizeCrmList([...newCrmContactDraft.tags, 'Manual entry']),
      lastContactedAt: firstTouchpoint ? now : newCrmContactDraft.lastContactedAt,
      createdAt: newCrmContactDraft.createdAt || now,
      updatedAt: now,
      touchpoints: firstTouchpoint
        ? [firstTouchpoint, ...newCrmContactDraft.touchpoints]
        : newCrmContactDraft.touchpoints,
    })
    saveCrmContact(contact)
    setNewCrmContactDraft(emptyCrmContact())
    setActiveCrmView('contact_list')
    setCrmMessage('Contact saved to the CRM sandbox.')
  }

  function saveNewCrmLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newCrmLeadDraft.name.trim() && !newCrmLeadDraft.company.trim()) {
      setCrmMessage('Add at least a lead name or organization before saving.')
      return
    }

    const now = new Date().toISOString()
    const ownerAssignment = getActiveCrmOwnerAssignment(newCrmLeadDraft)
    const firstLeadNote =
      newCrmLeadDraft.buyingContext.trim() ||
      newCrmLeadDraft.opportunities.trim() ||
      newCrmLeadDraft.relationshipNotes.trim()
    const firstLeadTouchpoint = firstLeadNote
      ? normalizeCrmTouchpoint({
          id: createId('crm-touchpoint'),
          type: 'note',
          contactedAt: now,
          salesRep: ownerAssignment.salesOwner,
          summary: firstLeadNote,
          sentiment: '',
          nextStep: newCrmLeadDraft.opportunities,
          nextFollowUpAt: newCrmLeadDraft.followUpAt,
          relatedOrderId: '',
        })
      : null
    const lead = normalizeCrmContact({
      ...newCrmLeadDraft,
      ...ownerAssignment,
      stage: newCrmLeadDraft.stage === 'active_customer' ? 'qualified' : newCrmLeadDraft.stage,
      priority: newCrmLeadDraft.priority || 'warm',
      source: newCrmLeadDraft.source || 'Manual lead',
      tags: normalizeCrmList([...newCrmLeadDraft.tags, 'Lead']),
      lastContactedAt: firstLeadTouchpoint ? now : newCrmLeadDraft.lastContactedAt,
      createdAt: newCrmLeadDraft.createdAt || now,
      updatedAt: now,
      touchpoints: firstLeadTouchpoint
        ? [firstLeadTouchpoint, ...newCrmLeadDraft.touchpoints]
        : newCrmLeadDraft.touchpoints,
    })
    saveCrmContact(lead)
    setNewCrmLeadDraft(
      normalizeCrmContact({
        ...emptyCrmContact(),
        stage: 'lead',
        priority: 'warm',
        source: 'Manual lead',
        tags: ['Lead'],
      }),
    )
    setActiveCrmView('leads')
    setCrmMessage('Lead saved to the CRM sandbox.')
  }

  function addCrmTouchpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCrmSummary) return
    if (!crmTouchpointDraft.summary.trim()) {
      setCrmMessage('Add a short conversation summary before saving the touchpoint.')
      return
    }

    const contactedAt = getCrmContactedAtFromInput(crmTouchpointDraft.contactedAt)
    const nextFollowUpAt = getCrmDateFromInput(crmTouchpointDraft.nextFollowUpAt)
    const ownerAssignment = getActiveCrmOwnerAssignment(selectedCrmSummary.contact)
    const touchpoint = normalizeCrmTouchpoint({
      id: createId('crm-touchpoint'),
      type: crmTouchpointDraft.type,
      contactedAt,
      salesRep: crmTouchpointDraft.salesRep || ownerAssignment.salesOwner,
      summary: crmTouchpointDraft.summary,
      sentiment: '',
      nextStep: crmTouchpointDraft.nextStep,
      nextFollowUpAt,
      relatedOrderId: crmTouchpointDraft.relatedOrderId,
    })

    saveCrmContact({
      ...selectedCrmSummary.contact,
      ...ownerAssignment,
      lastContactedAt: contactedAt,
      followUpAt: nextFollowUpAt || selectedCrmSummary.contact.followUpAt,
      touchpoints: [touchpoint, ...selectedCrmSummary.contact.touchpoints],
    })
    setCrmTouchpointDraft({
      ...emptyCrmTouchpointDraft(),
      salesRep: crmTouchpointDraft.salesRep || ownerAssignment.salesOwner,
    })
    setCrmMessage('Touchpoint saved to this sandbox CRM profile.')
  }

  function applyCrmAssistantRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = crmAssistantInput.trim()
    if (!text) {
      setCrmAssistantResult('Describe the customer, conversation, or follow-up to store.')
      return
    }

    const email = extractCrmEmail(text)
    const phone = extractCrmPhone(text)
    const name = inferCrmContactNameFromText(text)
    const company = extractCrmLabeledValue(text, ['team', 'company', 'organization', 'org', 'agency'])
    const player = extractCrmLabeledValue(text, ['player', 'athlete'])
    const owner = extractCrmLabeledValue(text, ['rep', 'owner', 'sales rep'])
    const ownerAssignment = getActiveCrmOwnerAssignment({
      salesOwner: owner,
      ownerEmail: '',
    })
    const nextStep = extractCrmLabeledValue(text, ['next step', 'todo', 'to do'])
    const followUpInput = inferCrmFollowUpInputFromText(text)
    const followUpAt = getCrmDateFromInput(followUpInput)
    const now = new Date().toISOString()
    const existingContact =
      crmContactSummaries.find((summary) => {
        const contact = summary.contact
        if (email && contact.email.trim().toLowerCase() === email.toLowerCase()) return true
        if (phone && normalizeCrmPhone(contact.phone) === normalizeCrmPhone(phone)) return true
        if (name && normalizeCrmSearchText(contact.name) === normalizeCrmSearchText(name)) return true
        return false
      })?.contact ?? null

    const contact = normalizeCrmContact({
      ...(existingContact ?? emptyCrmContact()),
      name: existingContact?.name || name,
      company: existingContact?.company || company,
      email: existingContact?.email || email,
      phone: existingContact?.phone || phone,
      playerNames: normalizeCrmList([
        ...(existingContact?.playerNames ?? []),
        player,
      ]),
      salesOwner: existingContact?.salesOwner || ownerAssignment.salesOwner,
      ownerEmail: existingContact?.ownerEmail || ownerAssignment.ownerEmail,
      stage: inferCrmStageFromText(text),
      priority: inferCrmPriorityFromText(text),
      source: existingContact?.source || 'CRM assistant',
      tags: normalizeCrmList([...(existingContact?.tags ?? []), 'AI captured']),
      buyingContext: existingContact?.buyingContext || text,
      followUpAt: followUpAt || existingContact?.followUpAt || '',
      lastContactedAt: now,
      updatedAt: now,
    })
    const touchpoint = normalizeCrmTouchpoint({
      id: createId('crm-touchpoint'),
      type: inferCrmTouchpointTypeFromText(text),
      contactedAt: now,
      salesRep: ownerAssignment.salesOwner || contact.salesOwner,
      summary: text,
      sentiment: extractCrmLabeledValue(text, ['sentiment', 'tone', 'vibe']),
      nextStep,
      nextFollowUpAt: followUpAt,
      relatedOrderId: '',
    })

    saveCrmContact({
      ...contact,
      touchpoints: [touchpoint, ...contact.touchpoints],
    })
    setCrmAssistantResult(
      `Saved ${contact.name || contact.company || 'new contact'} as ${getCrmStageLabel(
        contact.stage,
      )} with a ${getCrmTouchpointTypeLabel(touchpoint.type).toLowerCase()} note${
        followUpAt ? ` and follow-up on ${formatSalesDashboardDate(followUpAt)}` : ''
      }.`,
    )
    setCrmAssistantInput('')
    setActiveCrmView('contact_list')
  }

  function upsertCrmContactFromSalesOrderDraft(draftToSave: SalesOrderDraft, jobs: OrderJob[]) {
    const primaryJob = jobs[0]
    const ownerAssignment = getActiveCrmOwnerAssignment({
      salesOwner: draftToSave.salesRep,
      ownerEmail: draftToSave.salesRepEmail,
    })
    const contact = primaryJob
      ? normalizeCrmContact({
          ...createCrmContactFromOrder(primaryJob),
          ...getActiveCrmOwnerAssignment({
            salesOwner: primaryJob.salesRep,
            ownerEmail: primaryJob.salesRepEmail,
          }),
        })
      : normalizeCrmContact({
          ...emptyCrmContact(),
          name: draftToSave.billingName || draftToSave.playerName,
          email: draftToSave.billingEmail || draftToSave.playerEmail,
          phone: draftToSave.billingPhone || draftToSave.playerPhone,
          company: draftToSave.billingCompany,
          role: draftToSave.billingRelationship,
          playerNames: normalizeCrmList([draftToSave.playerName]),
          ...ownerAssignment,
          stage: draftToSave.createDraftOrder ? 'quoted' : 'active_customer',
          priority: draftToSave.sendInvoice ? 'hot' : 'warm',
          source: 'Sales intake',
          tags: ['Manual sales order'],
          buyingContext: draftToSave.notes,
          batPreferences: draftToSave.lines
            .map((line) => [line.title, line.wood, line.length, line.targetWeight].filter(Boolean).join(' / '))
            .filter(Boolean)
            .join('; '),
        })

    saveCrmContact(contact)
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
      !batDraft.weight.trim() ||
      !batDraft.source ||
      !batDraft.idealBilletWeight.trim()
    ) {
      return
    }

    const savedBat: BatVariation = {
      ...batDraft,
      id: editingVariantTarget?.variantId ?? createId('bat'),
      modelNumber: batDraft.modelNumber.trim(),
      weight: batDraft.weight.trim(),
      source: batDraft.source,
      idealBilletWeight: batDraft.idealBilletWeight.trim(),
    }

    if (editingVariantTarget) {
      setPlayers((current) =>
        current.map((player) =>
          player.id === editingVariantTarget.profileId
            ? {
                ...player,
                playerName: profileName,
                bats: player.bats.map((bat) =>
                  bat.id === editingVariantTarget.variantId ? savedBat : bat,
                ),
              }
            : player,
        ),
      )

      resetProfileDraft()
      return
    }

    setPlayers((current) => {
      if (variantTargetProfileId) {
        return current.map((player) =>
          player.id === variantTargetProfileId
            ? { ...player, bats: [savedBat, ...player.bats] }
            : player,
        )
      }

      const existingProfile = current.find(
        (player) =>
          player.profileKind === profileKindDraft &&
          player.playerName.toLowerCase() === profileName.toLowerCase(),
      )

      if (existingProfile) {
        return current.map((player) =>
          player.id === existingProfile.id
            ? { ...player, bats: [savedBat, ...player.bats] }
            : player,
        )
      }

      return [
        {
          id: createId('profile'),
          profileKind: profileKindDraft,
          playerName: profileName,
          bats: [savedBat],
        },
        ...current,
      ]
    })

    resetProfileDraft()
  }

  function resetProfileDraft() {
    setPlayerNameDraft('')
    setBatDraft(emptyBat)
    setVariantTargetProfileId(null)
    setEditingVariantTarget(null)
  }

  function startAddVariant(profile: PlayerProfile) {
    setActiveSection('players')
    setProfileKindDraft(profile.profileKind)
    setPlayerNameDraft(profile.playerName)
    setBatDraft(emptyBat)
    setVariantTargetProfileId(profile.id)
    setEditingVariantTarget(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEditVariant(profile: PlayerProfile, bat: BatVariation) {
    setActiveSection('players')
    setProfileKindDraft(profile.profileKind)
    setPlayerNameDraft(profile.playerName)
    setBatDraft(createBatDraftFromVariation(bat))
    setVariantTargetProfileId(null)
    setEditingVariantTarget({ profileId: profile.id, variantId: bat.id })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
              className={activeSection === 'sales' ? 'active' : ''}
              onClick={() => setActiveSection('sales')}
            >
              Sales Dashboard
            </button>
            <button
              type="button"
              className={activeSection === 'crm' ? 'active' : ''}
              onClick={() => setActiveSection('crm')}
            >
              CRM
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
      ) : backendStatus !== 'connected' && !(crmSandboxPreviewEnabled && activeSection === 'crm') ? (
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
                    placeholder="Example: TBC-BLT-0004 maple prime, RJ's, MLB yes, trophy no, no barrel knot, 48.5 ounces, rack A2"
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
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.trophyEligible}
                    onChange={(event) =>
                      setDraft({ ...draft, trophyEligible: event.target.checked })
                    }
                  />
                  <span>Trophy billet?</span>
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
                  <p className="filter-group-label">Trophy</p>
                  <div className="filter-chip-row">
                    {[
                      ['yes', 'Trophy capable'],
                      ['no', 'Not trophy capable'],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`filter-chip ${trophyFilters.includes(value as InventoryTrophyFilter) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={trophyFilters.includes(value as InventoryTrophyFilter)}
                          onChange={() =>
                            setTrophyFilters((current) =>
                              toggleSelectedValue(current, value as InventoryTrophyFilter),
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
                    <th>Trophy</th>
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
                        <span className={billet.trophyEligible ? 'pill yes' : 'pill no'}>
                          {billet.trophyEligible ? 'Yes' : 'No'}
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
                        <label className="billet-weight-field">
                          Weight (oz)
                          <input
                            aria-label={`Weight for billet ${billet.barcode}`}
                            inputMode="decimal"
                            min="0"
                            step="0.1"
                            type="number"
                            value={billet.weight}
                            placeholder="No weight"
                            onChange={(event) =>
                              updateBilletWeight(
                                billet.id,
                                event.target.value === '' ? '' : Number(event.target.value),
                              )
                            }
                          />
                        </label>
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

                <SalesOrderFormFields
                  draft={salesOrderDraft}
                  setDraft={setSalesOrderDraft}
                  updateField={updateSalesDraftField}
                  updateLine={updateSalesLine}
                  addLine={addSalesLine}
                  removeLine={removeSalesLine}
                  shopifyCatalog={shopifyCatalog}
                  productDatalistId="shopify-bat-products"
                  playerNameDatalistId="player-name-options"
                  billingContactDatalistId="billing-contact-options"
                  updateBillingName={updateBillingName}
                  billingContacts={billingContacts}
                  applyBillingContact={applyBillingContact}
                  attachmentFile={salesOrderAttachmentFile}
                  setAttachmentFile={setSalesOrderAttachmentFile}
                  isSubmitting={isCreatingDraftOrder}
                />
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
                            {job.salesRep ? <p>Sales rep: {job.salesRep}</p> : null}
                            {job.salesRepEmail ? <p>Sales rep email: {job.salesRepEmail}</p> : null}
                            {job.internalAttachment?.downloadUrl ? (
                              <p>
                                Attachment:{' '}
                                <a
                                  href={job.internalAttachment.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {job.internalAttachment.filename}
                                </a>
                              </p>
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
                            <p>Band color: {job.specs.bandColor || 'N/A'}</p>
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

                            <label>
                              Sales rep email
                              <input
                                type="email"
                                value={job.salesRepEmail}
                                onChange={(event) =>
                                  updateOrderJob(job.id, { salesRepEmail: event.target.value })
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
      ) : activeSection === 'sales' ? (
        <section className="sales-dashboard-page">
          <section className="panel sales-dashboard-toolbar">
            <div className="section-heading">
              <p className="eyebrow">Sales performance</p>
              <h2>Team dashboard</h2>
            </div>
            <div className="dashboard-controls">
              <label>
                Period
                <select
                  value={salesDashboardRange}
                  onChange={(event) =>
                    setSalesDashboardRange(event.target.value as SalesDashboardRange)
                  }
                >
                  {salesDashboardRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sales rep
                <select
                  value={salesDashboardRepFilter}
                  onChange={(event) => setSalesDashboardRepFilter(event.target.value)}
                >
                  <option value="all">Whole team</option>
                  {salesDashboardRepOptions.map((summary) => (
                    <option key={summary.key} value={summary.key}>
                      {summary.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="live-sync-stamp">
                <span>Last updated</span>
                <strong>{formatSalesDashboardSyncTime(lastLiveRefreshAt)}</strong>
              </div>
            </div>
          </section>

          <section className="metrics-grid sales-dashboard-metrics" aria-label="Sales summary">
            <article>
              <span>Submitted sales</span>
              <strong>{salesDashboardSales.length}</strong>
            </article>
            <article>
              <span>Submitted value</span>
              <strong>{formatSalesOrderMoney(salesDashboardSubmittedValue)}</strong>
            </article>
            <article>
              <span>Paid value</span>
              <strong>{formatSalesOrderMoney(salesDashboardPaidValue)}</strong>
            </article>
            <article>
              <span>Paid rate</span>
              <strong>
                {formatSalesDashboardPercent(
                  salesDashboardPaidSales.length,
                  salesDashboardSales.length,
                )}
              </strong>
            </article>
          </section>

          <section className="sales-dashboard-grid">
            <section className="panel sales-rep-panel">
              <div className="split-heading">
                <div className="section-heading">
                  <p className="eyebrow">By sales rep</p>
                  <h2>Performance</h2>
                </div>
                <div className="dashboard-total-chip">
                  <span>Awaiting</span>
                  <strong>{formatSalesOrderMoney(salesDashboardOpenValue)}</strong>
                </div>
              </div>

              {salesDashboardSummaries.length === 0 ? (
                <p className="empty-state">No internal sales orders match this view yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="sales-rep-table">
                    <thead>
                      <tr>
                        <th>Sales rep</th>
                        <th>Submitted</th>
                        <th>Paid</th>
                        <th>Awaiting payment</th>
                        <th>Avg. days to pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesDashboardSummaries.map((summary) => (
                        <tr key={summary.key}>
                          <td>
                            <strong>{summary.label}</strong>
                            {summary.email ? <span>{summary.email}</span> : null}
                          </td>
                          <td>
                            {formatSalesOrderMoney(summary.submittedValue)}
                            <span>{summary.submittedCount} sale(s)</span>
                          </td>
                          <td>
                            {formatSalesOrderMoney(summary.paidValue)}
                            <span>{summary.paidCount} paid</span>
                          </td>
                          <td>
                            {formatSalesOrderMoney(summary.openValue)}
                            <span>{summary.openCount} open</span>
                          </td>
                          <td>
                            {summary.averageDaysToPay === null
                              ? 'N/A'
                              : `${summary.averageDaysToPay.toFixed(1)} days`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel sales-aging-panel">
              <div className="section-heading">
                <p className="eyebrow">Open invoices</p>
                <h2>Awaiting payment</h2>
              </div>

              <div className="sales-dashboard-list">
                {salesDashboardAwaitingPayment.length === 0 ? (
                  <p className="empty-state">No draft invoices are waiting on payment.</p>
                ) : (
                  salesDashboardAwaitingPayment.map((sale) => (
                    <article className="sales-dashboard-card" key={sale.key}>
                      <div>
                        <span className="profile-type-pill">
                          {sale.draftOrderName || 'Draft pending'}
                        </span>
                        <h3>{sale.payerName || sale.customerName || 'No payer saved'}</h3>
                        <p>{sale.productSummary}</p>
                      </div>
                      <div className="sales-card-values">
                        <strong>{formatSalesOrderMoney(sale.total)}</strong>
                        <span>{formatSalesDashboardDate(sale.submittedAt)}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </section>

          <section className="panel sales-activity-panel">
            <div className="section-heading">
              <p className="eyebrow">Sales activity</p>
              <h2>Submitted and paid orders</h2>
            </div>

            <div className="sales-dashboard-list activity-list">
              {salesDashboardRecentSales.length === 0 ? (
                <p className="empty-state">No sales activity matches this view yet.</p>
              ) : (
                salesDashboardRecentSales.map((sale) => (
                  <article className="sales-dashboard-card activity-card" key={sale.key}>
                    <div>
                      <span className={`pill ${sale.isPaid ? 'yes' : ''}`}>
                        {sale.isPaid ? 'Paid' : invoiceStatusLabels[sale.invoiceStatus]}
                      </span>
                      <h3>{sale.draftOrderName || sale.paidOrderName || 'Unnumbered sale'}</h3>
                      <p>
                        {sale.salesRep || sale.salesRepEmail || 'Unassigned'} ·{' '}
                        {sale.payerName || sale.customerName || 'No payer saved'}
                      </p>
                    </div>
                    <div className="activity-reference-list">
                      <span>Original draft invoice: {sale.draftOrderName || 'N/A'}</span>
                      <span>Paid Shopify order: {sale.paidOrderName || 'N/A'}</span>
                      <span>
                        {sale.isPaid
                          ? `Paid ${formatSalesDashboardDate(sale.paidAt)}`
                          : `Submitted ${formatSalesDashboardDate(sale.submittedAt)}`}
                      </span>
                    </div>
                    <div className="sales-card-values">
                      <strong>{formatSalesOrderMoney(sale.total)}</strong>
                      <span>
                        {sale.quantity} bat{sale.quantity === 1 ? '' : 's'}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      ) : activeSection === 'crm' ? (
        <section className="crm-page">
          <section className="panel crm-toolbar">
            <div className="section-heading">
              <p className="eyebrow">Sales CRM</p>
              <h2>{crmWorkspaceViews.find((view) => view.value === activeCrmView)?.label}</h2>
            </div>
            <div className="crm-toolbar-actions">
              <label className="crm-owner-selector">
                Team member
                <select
                  value={crmOwnerFilter}
                  onChange={(event) => setCrmOwnerFilter(event.target.value)}
                >
                  <option value="all">All team members</option>
                  {crmOwnerOptions.map((owner) => (
                    <option key={owner.key} value={owner.key}>
                      {owner.label}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </label>
              <div className="crm-tab-strip" role="tablist" aria-label="CRM sections">
                {crmWorkspaceViews.map((view) => (
                  <button
                    type="button"
                    className={activeCrmView === view.value ? 'active' : ''}
                    key={view.value}
                    onClick={() => setActiveCrmView(view.value)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="metrics-grid sales-dashboard-metrics" aria-label="CRM summary">
            <article>
              <span>Contacts</span>
              <strong>{crmOwnerScopedSummaries.length}</strong>
            </article>
            <article>
              <span>Leads</span>
              <strong>{crmLeadSummaries.length}</strong>
            </article>
            <article>
              <span>Follow-ups due</span>
              <strong>{crmMetricTotals.dueFollowUps}</strong>
            </article>
            <article>
              <span>Open value</span>
              <strong>{formatSalesOrderMoney(crmMetricTotals.openValue)}</strong>
            </article>
          </section>

          {crmMessage ? <p className="helper-text crm-message">{crmMessage}</p> : null}

          {activeCrmView === 'new_contact' ? (
            <section className="crm-workspace-grid">
              <form className="panel crm-quick-intake" onSubmit={saveNewCrmContact}>
                <div className="section-heading">
                  <p className="eyebrow">New contact</p>
                  <h2>Quick capture</h2>
                </div>

                <div className="form-row">
                  <label>
                    Name
                    <input
                      value={newCrmContactDraft.name}
                      onChange={(event) =>
                        setNewCrmContactDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Team or company
                    <input
                      value={newCrmContactDraft.company}
                      onChange={(event) =>
                        setNewCrmContactDraft((current) => ({
                          ...current,
                          company: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label>
                    Phone
                    <input
                      value={newCrmContactDraft.phone}
                      onChange={(event) =>
                        setNewCrmContactDraft((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={newCrmContactDraft.email}
                      onChange={(event) =>
                        setNewCrmContactDraft((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label>
                    Follow-up
                    <input
                      type="date"
                      value={getCrmDateInputValue(newCrmContactDraft.followUpAt)}
                      onChange={(event) =>
                        setNewCrmContactDraft((current) => ({
                          ...current,
                          followUpAt: getCrmDateFromInput(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="notes-field">
                  First note
                  <textarea
                    value={newCrmContactDraft.buyingContext}
                    onChange={(event) =>
                      setNewCrmContactDraft((current) => ({
                        ...current,
                        buyingContext: event.target.value,
                      }))
                    }
                  />
                </label>

                <button type="submit">Save contact</button>
              </form>

              <aside className="panel crm-side-panel">
                <div className="section-heading">
                  <p className="eyebrow">Auto-stamped</p>
                  <h2>Entry details</h2>
                </div>
                <div className="crm-stat-grid">
                  <article>
                    <span>Entry date</span>
                    <strong>{formatSalesDashboardDate(new Date().toISOString())}</strong>
                  </article>
                  <article>
                    <span>Owner</span>
                    <strong>{activeCrmOwnerOption?.label ?? 'Unassigned'}</strong>
                  </article>
                  <article>
                    <span>Storage</span>
                    <strong>Sandbox</strong>
                  </article>
                </div>
                <button type="button" className="secondary-button" onClick={createCrmContact}>
                  Blank profile
                </button>
              </aside>
            </section>
          ) : activeCrmView === 'leads' ? (
            <section className="crm-workspace-grid">
              <form className="panel crm-quick-intake" onSubmit={saveNewCrmLead}>
                <div className="section-heading">
                  <p className="eyebrow">Leads</p>
                  <h2>Manual lead entry</h2>
                </div>
                <div className="form-row">
                  <label>
                    Name
                    <input
                      value={newCrmLeadDraft.name}
                      onChange={(event) =>
                        setNewCrmLeadDraft((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Team or company
                    <input
                      value={newCrmLeadDraft.company}
                      onChange={(event) =>
                        setNewCrmLeadDraft((current) => ({
                          ...current,
                          company: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Phone
                    <input
                      value={newCrmLeadDraft.phone}
                      onChange={(event) =>
                        setNewCrmLeadDraft((current) => ({ ...current, phone: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Follow-up
                    <input
                      type="date"
                      value={getCrmDateInputValue(newCrmLeadDraft.followUpAt)}
                      onChange={(event) =>
                        setNewCrmLeadDraft((current) => ({
                          ...current,
                          followUpAt: getCrmDateFromInput(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="notes-field">
                  Why this is promising
                  <textarea
                    value={newCrmLeadDraft.buyingContext}
                    onChange={(event) =>
                      setNewCrmLeadDraft((current) => ({
                        ...current,
                        buyingContext: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Next step
                  <input
                    value={newCrmLeadDraft.opportunities}
                    onChange={(event) =>
                      setNewCrmLeadDraft((current) => ({
                        ...current,
                        opportunities: event.target.value,
                      }))
                    }
                  />
                </label>
                <button type="submit">Save lead</button>
              </form>

              <section className="panel crm-list-panel">
                <div className="section-heading">
                  <p className="eyebrow">Lead pipeline</p>
                  <h2>{crmLeadSummaries.length} tracked leads</h2>
                </div>
                <div className="crm-contact-list">
                  {crmLeadSummaries.length === 0 ? (
                    <p className="empty-state">No leads are being tracked yet.</p>
                  ) : (
                    crmLeadSummaries.map((summary) => (
                      <button
                        type="button"
                        className="crm-contact-card"
                        key={summary.contact.id}
                        onClick={() => {
                          setSelectedCrmContactId(summary.contact.id)
                          setActiveCrmView('contact_list')
                        }}
                      >
                        <span className={`pill crm-priority-${summary.contact.priority}`}>
                          {getCrmPriorityLabel(summary.contact.priority)}
                        </span>
                        <strong>
                          {summary.contact.name || summary.contact.company || 'Unnamed lead'}
                        </strong>
                        <span>{getCrmStageLabel(summary.contact.stage)}</span>
                        <span>
                          {summary.followUpDue
                            ? 'Follow-up due'
                            : summary.contact.followUpAt
                              ? `Next ${formatSalesDashboardDate(summary.contact.followUpAt)}`
                              : 'No follow-up set'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </section>
          ) : activeCrmView === 'engagements' ? (
            <section className="crm-workspace-grid">
              <form className="panel crm-touchpoint-form" onSubmit={addCrmTouchpoint}>
                <div className="section-heading">
                  <p className="eyebrow">Engagements</p>
                  <h2>Log a call or text</h2>
                </div>
                <label>
                  Contact
                  <select
                    value={selectedCrmSummary?.contact.id ?? ''}
                    onChange={(event) => setSelectedCrmContactId(event.target.value)}
                  >
                    <option value="">Select contact</option>
                    {crmContactSummaries.map((summary) => (
                      <option key={summary.contact.id} value={summary.contact.id}>
                        {summary.contact.name || summary.contact.company || summary.contact.email}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    Type
                    <select
                      value={crmTouchpointDraft.type}
                      onChange={(event) =>
                        setCrmTouchpointDraft((current) => ({
                          ...current,
                          type: event.target.value as CrmTouchpointType,
                        }))
                      }
                    >
                      {crmTouchpointTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={crmTouchpointDraft.contactedAt || getCrmTodayInputValue()}
                      onChange={(event) =>
                        setCrmTouchpointDraft((current) => ({
                          ...current,
                          contactedAt: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="notes-field">
                  What happened
                  <textarea
                    value={crmTouchpointDraft.summary}
                    onChange={(event) =>
                      setCrmTouchpointDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="notes-field">
                  Next step
                  <textarea
                    value={crmTouchpointDraft.nextStep}
                    onChange={(event) =>
                      setCrmTouchpointDraft((current) => ({
                        ...current,
                        nextStep: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Follow-up
                  <input
                    type="date"
                    value={crmTouchpointDraft.nextFollowUpAt}
                    onChange={(event) =>
                      setCrmTouchpointDraft((current) => ({
                        ...current,
                        nextFollowUpAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <button type="submit">Save engagement</button>
              </form>

              <section className="panel crm-detail-panel">
                <div className="section-heading">
                  <p className="eyebrow">Engagement history</p>
                  <h2>{crmEngagements.length} logged entries</h2>
                </div>
                <div className="crm-engagement-layout">
                  <div className="crm-engagement-list">
                    {crmEngagements.length === 0 ? (
                      <p className="empty-state">No calls, texts, or notes logged yet.</p>
                    ) : (
                      crmEngagements.map(({ contact, touchpoint }) => (
                        <button
                          type="button"
                          className={`crm-engagement-row ${
                            selectedCrmEngagement?.touchpoint.id === touchpoint.id ? 'active' : ''
                          }`}
                          key={touchpoint.id}
                          onClick={() => setSelectedCrmEngagementId(touchpoint.id)}
                        >
                          <span>{getCrmTouchpointTypeLabel(touchpoint.type)}</span>
                          <strong>{contact.name || contact.company || 'Unnamed contact'}</strong>
                          <p>{touchpoint.summary}</p>
                          <small>{formatSalesDashboardDate(touchpoint.contactedAt)}</small>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedCrmEngagement ? (
                    <article className="crm-engagement-detail">
                      <span className="profile-type-pill">
                        {getCrmTouchpointTypeLabel(selectedCrmEngagement.touchpoint.type)}
                      </span>
                      <h3>
                        {selectedCrmEngagement.contact.name ||
                          selectedCrmEngagement.contact.company ||
                          'Unnamed contact'}
                      </h3>
                      <p>{formatOrderDateTime(selectedCrmEngagement.touchpoint.contactedAt)}</p>
                      <p>{selectedCrmEngagement.touchpoint.summary}</p>
                      {selectedCrmEngagement.touchpoint.nextStep ? (
                        <p>Next: {selectedCrmEngagement.touchpoint.nextStep}</p>
                      ) : null}
                      {selectedCrmEngagement.touchpoint.nextFollowUpAt ? (
                        <p>
                          Follow-up:{' '}
                          {formatSalesDashboardDate(selectedCrmEngagement.touchpoint.nextFollowUpAt)}
                        </p>
                      ) : null}
                    </article>
                  ) : null}
                </div>
              </section>
            </section>
          ) : activeCrmView === 'assistant' ? (
            <section className="crm-workspace-grid">
              <form className="panel crm-assistant-panel" onSubmit={applyCrmAssistantRequest}>
                <div className="section-heading">
                  <p className="eyebrow">CRM assistant</p>
                  <h2>Describe the update</h2>
                </div>
                <label className="notes-field">
                  Natural-language entry
                  <textarea
                    value={crmAssistantInput}
                    onChange={(event) => setCrmAssistantInput(event.target.value)}
                  />
                </label>
                <button type="submit">Store CRM update</button>
              </form>
              <section className="panel crm-side-panel">
                <div className="section-heading">
                  <p className="eyebrow">Assistant result</p>
                  <h2>Structured save</h2>
                </div>
                <p className="empty-state">{crmAssistantResult || 'No assistant update saved yet.'}</p>
              </section>
            </section>
          ) : (
          <section className="crm-layout">
            <section className="panel crm-list-panel">
              <div className="split-heading">
                <div className="section-heading">
                  <p className="eyebrow">Book of business</p>
                  <h2>{filteredCrmSummaries.length} contacts</h2>
                </div>
                <div className="dashboard-total-chip">
                  <span>Repeat buyers</span>
                  <strong>{crmMetricTotals.repeatCustomers}</strong>
                </div>
              </div>

              <div className="crm-filter-row">
                <input
                  aria-label="Search CRM contacts"
                  placeholder="Search customer, team, player..."
                  value={crmQuery}
                  onChange={(event) => setCrmQuery(event.target.value)}
                />
                <select
                  aria-label="Filter CRM stage"
                  value={crmStageFilter}
                  onChange={(event) => setCrmStageFilter(event.target.value as 'all' | CrmStage)}
                >
                  <option value="all">All stages</option>
                  {crmStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="crm-contact-list">
                {filteredCrmSummaries.length === 0 ? (
                  <p className="empty-state">No CRM contacts match this view yet.</p>
                ) : (
                  filteredCrmSummaries.map((summary) => (
                    <button
                      type="button"
                      className={`crm-contact-card ${
                        selectedCrmSummary?.contact.id === summary.contact.id ? 'active' : ''
                      }`}
                      key={summary.contact.id}
                      onClick={() => {
                        setSelectedCrmContactId(summary.contact.id)
                        setCrmTouchpointDraft({
                          ...emptyCrmTouchpointDraft(),
                          salesRep: summary.contact.salesOwner,
                        })
                      }}
                    >
                      <span className={`pill crm-priority-${summary.contact.priority}`}>
                        {getCrmPriorityLabel(summary.contact.priority)}
                      </span>
                      <strong>{summary.contact.name || summary.contact.company || 'Unnamed contact'}</strong>
                      <span>{summary.contact.company || summary.contact.email || 'No company saved'}</span>
                      <span>
                        {getCrmStageLabel(summary.contact.stage)} ·{' '}
                        {summary.orderCount} order{summary.orderCount === 1 ? '' : 's'}
                      </span>
                      <span>
                        {summary.followUpDue
                          ? 'Follow-up due'
                          : summary.contact.followUpAt
                            ? `Next ${formatSalesDashboardDate(summary.contact.followUpAt)}`
                            : 'No follow-up set'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="panel crm-detail-panel">
              {selectedCrmSummary ? (
                <>
                  <div className="crm-detail-header">
                    <div>
                      <p className="eyebrow">
                        {selectedCrmSummary.derivedFromOrders ? 'Order-derived profile' : 'Sandbox CRM profile'}
                      </p>
                      <h2>
                        {selectedCrmSummary.contact.name ||
                          selectedCrmSummary.contact.company ||
                          'Unnamed contact'}
                      </h2>
                      <p>
                        {selectedCrmSummary.contact.company || 'No company saved'} ·{' '}
                        {selectedCrmSummary.contact.salesOwner || 'No owner assigned'}
                      </p>
                    </div>
                    <div className="crm-header-actions">
                      <span className="profile-type-pill">Sandbox only</span>
                      <span className={`pill crm-priority-${selectedCrmSummary.contact.priority}`}>
                        {getCrmPriorityLabel(selectedCrmSummary.contact.priority)}
                      </span>
                    </div>
                  </div>

                  {crmMessage ? <p className="helper-text">{crmMessage}</p> : null}

                  <div className="crm-detail-grid">
                    <section className="crm-profile-editor">
                      <div className="form-row">
                        <label>
                          Customer name
                          <input
                            value={selectedCrmSummary.contact.name}
                            onChange={(event) =>
                              updateSelectedCrmContact({ name: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Team, agency, or company
                          <input
                            value={selectedCrmSummary.contact.company}
                            onChange={(event) =>
                              updateSelectedCrmContact({ company: event.target.value })
                            }
                          />
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Role or relationship
                          <input
                            value={selectedCrmSummary.contact.role}
                            onChange={(event) =>
                              updateSelectedCrmContact({ role: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Preferred contact
                          <select
                            value={selectedCrmSummary.contact.preferredContactMethod}
                            onChange={(event) =>
                              updateSelectedCrmContact({
                                preferredContactMethod: event.target.value,
                              })
                            }
                          >
                            {crmContactMethodOptions.map((method) => (
                              <option key={method}>{method}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Email
                          <input
                            type="email"
                            value={selectedCrmSummary.contact.email}
                            onChange={(event) =>
                              updateSelectedCrmContact({ email: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Phone
                          <input
                            value={selectedCrmSummary.contact.phone}
                            onChange={(event) =>
                              updateSelectedCrmContact({ phone: event.target.value })
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Alternate contacts
                        <input
                          value={selectedCrmSummary.contact.alternateContacts}
                          onChange={(event) =>
                            updateSelectedCrmContact({ alternateContacts: event.target.value })
                          }
                        />
                      </label>

                      <div className="form-row">
                        <label>
                          Sales owner
                          <input
                            value={selectedCrmSummary.contact.salesOwner}
                            onChange={(event) =>
                              updateSelectedCrmContact({ salesOwner: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Owner email
                          <input
                            type="email"
                            value={selectedCrmSummary.contact.ownerEmail}
                            onChange={(event) =>
                              updateSelectedCrmContact({ ownerEmail: event.target.value })
                            }
                          />
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Stage
                          <select
                            value={selectedCrmSummary.contact.stage}
                            onChange={(event) =>
                              updateSelectedCrmContact({ stage: event.target.value as CrmStage })
                            }
                          >
                            {crmStageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Priority
                          <select
                            value={selectedCrmSummary.contact.priority}
                            onChange={(event) =>
                              updateSelectedCrmContact({
                                priority: event.target.value as CrmPriority,
                              })
                            }
                          >
                            {crmPriorityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="form-row">
                        <label>
                          Source
                          <input
                            value={selectedCrmSummary.contact.source}
                            onChange={(event) =>
                              updateSelectedCrmContact({ source: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Next follow-up
                          <input
                            type="date"
                            value={getCrmDateInputValue(selectedCrmSummary.contact.followUpAt)}
                            onChange={(event) =>
                              updateSelectedCrmContact({
                                followUpAt: getCrmDateFromInput(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Players tied to this buyer
                        <input
                          value={selectedCrmSummary.contact.playerNames.join(', ')}
                          onChange={(event) =>
                            updateSelectedCrmContact({
                              playerNames: normalizeCrmList(event.target.value),
                            })
                          }
                        />
                      </label>

                      <label>
                        Tags
                        <input
                          value={selectedCrmSummary.contact.tags.join(', ')}
                          onChange={(event) =>
                            updateSelectedCrmContact({ tags: normalizeCrmList(event.target.value) })
                          }
                        />
                      </label>

                      <label className="notes-field">
                        Buying context
                        <textarea
                          value={selectedCrmSummary.contact.buyingContext}
                          onChange={(event) =>
                            updateSelectedCrmContact({ buyingContext: event.target.value })
                          }
                        />
                      </label>

                      <label className="notes-field">
                        Bat preferences
                        <textarea
                          value={selectedCrmSummary.contact.batPreferences}
                          onChange={(event) =>
                            updateSelectedCrmContact({ batPreferences: event.target.value })
                          }
                        />
                      </label>

                      <label className="notes-field">
                        Relationship notes
                        <textarea
                          value={selectedCrmSummary.contact.relationshipNotes}
                          onChange={(event) =>
                            updateSelectedCrmContact({ relationshipNotes: event.target.value })
                          }
                        />
                      </label>

                      <div className="form-row">
                        <label className="notes-field">
                          Objections or concerns
                          <textarea
                            value={selectedCrmSummary.contact.objections}
                            onChange={(event) =>
                              updateSelectedCrmContact({ objections: event.target.value })
                            }
                          />
                        </label>
                        <label className="notes-field">
                          Opportunities
                          <textarea
                            value={selectedCrmSummary.contact.opportunities}
                            onChange={(event) =>
                              updateSelectedCrmContact({ opportunities: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <aside className="crm-intelligence-panel">
                      <div className="crm-stat-grid">
                        <article>
                          <span>Orders</span>
                          <strong>{selectedCrmSummary.orderCount}</strong>
                        </article>
                        <article>
                          <span>Paid value</span>
                          <strong>{formatSalesOrderMoney(selectedCrmSummary.paidValue)}</strong>
                        </article>
                        <article>
                          <span>Open value</span>
                          <strong>{formatSalesOrderMoney(selectedCrmSummary.openValue)}</strong>
                        </article>
                        <article>
                          <span>Open invoices</span>
                          <strong>{selectedCrmSummary.openInvoiceCount}</strong>
                        </article>
                      </div>

                      <form className="crm-touchpoint-form" onSubmit={addCrmTouchpoint}>
                        <div className="section-heading">
                          <p className="eyebrow">Log touchpoint</p>
                          <h2>Conversation note</h2>
                        </div>
                        <div className="form-row">
                          <label>
                            Type
                            <select
                              value={crmTouchpointDraft.type}
                              onChange={(event) =>
                                setCrmTouchpointDraft((current) => ({
                                  ...current,
                                  type: event.target.value as CrmTouchpointType,
                                }))
                              }
                            >
                              {crmTouchpointTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Date
                            <input
                              type="date"
                              value={crmTouchpointDraft.contactedAt}
                              onChange={(event) =>
                                setCrmTouchpointDraft((current) => ({
                                  ...current,
                                  contactedAt: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label className="notes-field">
                          Summary
                          <textarea
                            value={crmTouchpointDraft.summary}
                            onChange={(event) =>
                              setCrmTouchpointDraft((current) => ({
                                ...current,
                                summary: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="notes-field">
                          Next step
                          <textarea
                            value={crmTouchpointDraft.nextStep}
                            onChange={(event) =>
                              setCrmTouchpointDraft((current) => ({
                                ...current,
                                nextStep: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="form-row">
                          <label>
                            Follow-up date
                            <input
                              type="date"
                              value={crmTouchpointDraft.nextFollowUpAt}
                              onChange={(event) =>
                                setCrmTouchpointDraft((current) => ({
                                  ...current,
                                  nextFollowUpAt: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Related order
                            <select
                              value={crmTouchpointDraft.relatedOrderId}
                              onChange={(event) =>
                                setCrmTouchpointDraft((current) => ({
                                  ...current,
                                  relatedOrderId: event.target.value,
                                }))
                              }
                            >
                              <option value="">No related order</option>
                              {selectedCrmSummary.orders.map((job) => (
                                <option key={job.id} value={job.id}>
                                  {job.shopifyOrderName ||
                                    job.shopifyDraftOrderName ||
                                    job.productTitle ||
                                    job.id}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button type="submit">Save touchpoint</button>
                      </form>
                    </aside>
                  </div>

                  <section className="crm-history-grid">
                    <div className="crm-history-column">
                      <div className="section-heading">
                        <p className="eyebrow">Timeline</p>
                        <h2>{selectedCrmSummary.contact.touchpoints.length} engagements</h2>
                      </div>
                      <ContactEngagementReview
                        touchpoints={selectedCrmSummary.contact.touchpoints}
                        emptyMessage="No logged touchpoints for this profile yet."
                      />
                    </div>

                    <div className="crm-history-column">
                      <div className="section-heading">
                        <p className="eyebrow">Order history</p>
                        <h2>Past orders and invoices</h2>
                      </div>
                      <div className="crm-order-history">
                        {selectedCrmSummary.orders.length === 0 ? (
                          <p className="empty-state">No linked Trinity orders yet.</p>
                        ) : (
                          selectedCrmSummary.orders.map((job) => (
                            <article className="sales-dashboard-card" key={job.id}>
                              <div>
                                <span className={`pill ${isSalesDashboardPaid(job) ? 'yes' : ''}`}>
                                  {isSalesDashboardPaid(job)
                                    ? 'Paid'
                                    : invoiceStatusLabels[job.invoiceStatus]}
                                </span>
                                <h3>
                                  {job.shopifyOrderName ||
                                    job.shopifyDraftOrderName ||
                                    'Unnumbered order'}
                                </h3>
                                <p>
                                  {job.productTitle || 'Custom bat'} · {job.specs.model || 'No model'} ·{' '}
                                  {job.specs.wood || 'No wood saved'}
                                </p>
                              </div>
                              <div className="sales-card-values">
                                <strong>{formatSalesOrderMoney(getSalesDashboardLineValue(job))}</strong>
                                <span>{formatSalesDashboardDate(job.orderSubmittedAt || job.createdAt)}</span>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <p className="empty-state">Create a customer or import order history to start the CRM.</p>
              )}
            </section>
          </section>
          )}
        </section>
      ) : activeSection === 'players' ? (
        <section className="profiles-page">
          <section className="panel profile-entry-panel">
            <div className="section-heading">
              <p className="eyebrow">{editingVariantTarget ? 'Edit pro player' : 'Add pro player'}</p>
              <h2>{editingVariantTarget ? 'Edit saved variant' : 'Store a bat profile'}</h2>
            </div>

            <form className="bat-form profile-entry-form" onSubmit={addProfileBat}>
              <div className="form-instructions">
                <strong>
                  {editingVariantTarget
                    ? `Edit variant for ${playerNameDraft || 'this profile'}`
                    : variantTargetProfileId
                      ? `Add a new variant to ${playerNameDraft || 'this profile'}`
                      : 'Enter a pro player bat record'}
                </strong>
                <p>
                  Add the model, finished bat specs, wood species, wood tier, color notes, and
                  ideal billet weight. Source sets the weight scale for diameter correction across
                  all MLB-caliber storage billets. If the name already exists, this saves as
                  another bat variation under that profile.
                </p>
                {editingVariantTarget ? (
                  <p>
                    Changes will update the saved variant and keep its matched billet lookup
                    connected to this profile.
                  </p>
                ) : variantTargetProfileId ? (
                  <p>
                    This will be saved inside the existing pro player profile for {playerNameDraft}.
                  </p>
                ) : null}
              </div>

              <div className="form-row single-field-row">
                <label>
                  Name
                  <input
                    value={playerNameDraft}
                    placeholder="Example: Corey Seager"
                    onChange={(event) => {
                      setPlayerNameDraft(event.target.value)
                      if (!editingVariantTarget) {
                        setVariantTargetProfileId(null)
                      }
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
                  Finished weight
                  <input
                    value={batDraft.weight}
                    placeholder="Example: 32"
                    onChange={(event) => setBatDraft({ ...batDraft, weight: event.target.value })}
                  />
                </label>
                <label>
                  Ideal billet weight
                  <input
                    type="number"
                    step="0.1"
                    value={batDraft.idealBilletWeight}
                    placeholder="Example: 91"
                    onChange={(event) =>
                      setBatDraft({ ...batDraft, idealBilletWeight: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Source
                  <select
                    value={batDraft.source}
                    onChange={(event) =>
                      setBatDraft({ ...batDraft, source: event.target.value as Source | '' })
                    }
                  >
                    <option value="">Select source</option>
                    {sourceOptions.map((source) => (
                      <option key={source}>{source}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Wood species
                  <select
                    value={batDraft.species}
                    onChange={(event) =>
                      setBatDraft({ ...batDraft, species: event.target.value as Species })
                    }
                  >
                    {speciesOptions.map((species) => (
                      <option key={species}>{species}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
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
              </div>

              <label className="notes-field">
                Notes
                <textarea
                  value={batDraft.notes}
                  placeholder="Feel, balance, knob, cup, pro-player preference, or production notes"
                  onChange={(event) => setBatDraft({ ...batDraft, notes: event.target.value })}
                />
              </label>

              <div className="input-action-row">
                <button type="submit">
                  {editingVariantTarget
                    ? 'Save changes'
                    : variantTargetProfileId
                      ? 'Save variant'
                      : 'Save pro bat profile'}
                </button>
                {variantTargetProfileId || editingVariantTarget ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetProfileDraft}
                  >
                    {editingVariantTarget ? 'Cancel edit' : 'Cancel variant'}
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
                aria-label="Search pro player profiles"
                placeholder="Search pro player, model, source, species, weight, wood tier..."
                value={playerQuery}
                onChange={(event) => setPlayerQuery(event.target.value)}
              />
            </div>

            <div className="profile-results">
              {filteredPlayers.length === 0 ? (
                <p className="empty-state">No pro player profiles match that search yet.</p>
              ) : (
                filteredPlayers.map((profile) => (
                  <article className="profile-result-card" key={profile.id}>
                    <div className="split-heading">
                      <div>
                        <span className="profile-type-pill">Pro player</span>
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
                      {profile.bats.map((bat) => {
                        const profileBilletMatches = getProfileBilletMatches(bat, billets)

                        return (
                          <article className="bat-card" key={bat.id}>
                            <div>
                              <div className="bat-card-heading">
                                <div>
                                  <span>Model {bat.modelNumber}</span>
                                  <strong>
                                    {bat.length} in / {bat.weight} oz
                                  </strong>
                                </div>
                                <button
                                  type="button"
                                  className="secondary-button compact-button"
                                  onClick={() => startEditVariant(profile, bat)}
                                >
                                  Edit
                                </button>
                              </div>
                              <p>
                                {bat.source || 'No source selected'} / {bat.species} / {bat.woodTier}
                              </p>
                              <p>Ideal billet: {bat.idealBilletWeight || 'N/A'} oz</p>
                              <p>{bat.colorPreferences || 'No color preferences saved.'}</p>
                              {bat.notes ? <p>{bat.notes}</p> : null}
                            </div>
                            <div className="compatible-list">
                              <span>Storage billets that match</span>
                              <strong>
                                {profileBilletMatches.length} billet
                                {profileBilletMatches.length === 1 ? '' : 's'}
                              </strong>
                              {profileBilletMatches.length === 0 ? (
                                <p>
                                  No MLB storage billets match the source-adjusted species and
                                  ideal weight.
                                </p>
                              ) : (
                                profileBilletMatches.map((billet) => (
                                  <p key={billet.id}>{getBilletLabel(billet)}</p>
                                ))
                              )}
                            </div>
                          </article>
                        )
                      })}
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

function SalesPortalApp() {
  const demoEmail = getSalesPortalDemoEmail()
  const isDemoSession = Boolean(demoEmail)
  const [session, setSession] = useState<SalesPortalSession | null>(() => {
    if (demoEmail) return createDemoSalesPortalSession(demoEmail)
    const stored = window.localStorage.getItem(salesPortalSessionStorageKey)
    return stored ? (JSON.parse(stored) as SalesPortalSession) : null
  })
  const [loginEmail, setLoginEmail] = useState(session?.email ?? '')
  const [loginMessage, setLoginMessage] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [canIssueLoginCode, setCanIssueLoginCode] = useState(false)
  const [codeIssuerEmail, setCodeIssuerEmail] = useState(
    seedCrmOwnerOptions.find((owner) => owner.email)?.email ?? '',
  )
  const [issuedLoginCode, setIssuedLoginCode] = useState<{
    email: string
    code: string
    expiresAt: string
  } | null>(null)
  const [isIssuingLoginCode, setIsIssuingLoginCode] = useState(false)
  const [activeView, setActiveView] = useState<SalesPortalView>('crm')
  const [adminOwnerFilter, setAdminOwnerFilter] = useState('all')
  const [crmSearchQuery, setCrmSearchQuery] = useState('')
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>(() => {
    if (!isDemoSession) return []
    const stored = window.localStorage.getItem(crmContactStorageKey)
    if (stored) {
      const savedContacts = (JSON.parse(stored) as CrmContact[]).map((contact) =>
        normalizeCrmContact(contact),
      )
      return isDemoSession && savedContacts.length === 0 ? createSalesPortalDemoContacts() : savedContacts
    }
    return isDemoSession ? createSalesPortalDemoContacts() : []
  })
  const [portalOrders, setPortalOrders] = useState<SalesPortalOrder[]>(() => {
    if (!isDemoSession) return []
    const stored = window.localStorage.getItem(salesPortalOrderStorageKey)
    return stored ? (JSON.parse(stored) as SalesPortalOrder[]) : []
  })
  const [orderJobs, setOrderJobs] = useState<OrderJob[]>(() => {
    return []
  })
  const [shopifyCatalog, setShopifyCatalog] = useState<ShopifyCatalogProduct[]>([])
  const [orderDraft, setOrderDraft] = useState<SalesOrderDraft>(() => emptySalesOrderDraft())
  const [orderAttachmentFile, setOrderAttachmentFile] = useState<File | null>(null)
  const [portalMessage, setPortalMessage] = useState('')
  const [isLoadingPortalData, setIsLoadingPortalData] = useState(!isDemoSession)
  const [isSubmittingPortalOrder, setIsSubmittingPortalOrder] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [touchpointDraft, setTouchpointDraft] = useState<CrmTouchpointDraft>(() =>
    emptyCrmTouchpointDraft(),
  )
  const [newContactDraft, setNewContactDraft] = useState<CrmContact>(() => emptyCrmContact())
  const [reportStartDate, setReportStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 6)
    return date.toISOString().slice(0, 10)
  })
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportTypeFilter, setReportTypeFilter] = useState<'all' | CrmTouchpointType>('all')

  const portalOwner = session ? getSalesPortalOwnerForEmail(session.email) : null
  const isAdmin = Boolean(
    session?.isAdmin ?? (session && salesPortalAdminEmails.has(normalizeTrinityEmail(session.email))),
  )
  const portalOwnerOptions = useMemo(() => {
    const owners = new Map<string, CrmOwnerOption>(
      seedCrmOwnerOptions.map((owner) => [owner.key, owner]),
    )
    for (const contact of crmContacts) {
      const option = createCrmOwnerOption(contact.salesOwner, contact.ownerEmail)
      if (option) owners.set(option.key, option)
    }
    return Array.from(owners.values()).sort((a, b) => compareText(a.label, b.label))
  }, [crmContacts])
  const activeScopeOwner =
    isAdmin && adminOwnerFilter !== 'all'
      ? portalOwnerOptions.find((owner) => owner.key === adminOwnerFilter) ?? null
      : portalOwner
  const crmDirectory = useMemo(
    () => buildCrmContactDirectory(crmContacts, orderJobs, []),
    [crmContacts, orderJobs],
  )
  const crmContactSummaries = useMemo(
    () => buildCrmContactSummaries(crmDirectory, orderJobs),
    [crmDirectory, orderJobs],
  )
  const visibleContactSummaries = useMemo(
    () =>
      crmContactSummaries.filter((summary) => {
        if (isAdmin && adminOwnerFilter === 'all') return true
        if (!activeScopeOwner) return false
        return isCrmSummaryOwnedBy(summary, activeScopeOwner)
      }),
    [activeScopeOwner, adminOwnerFilter, crmContactSummaries, isAdmin],
  )
  const portalSales = useMemo(
    () =>
      isDemoSession
        ? portalOrders.map((order) => createSalesDashboardSaleFromPortalOrder(order))
        : buildSalesDashboardSales(orderJobs),
    [isDemoSession, orderJobs, portalOrders],
  )
  const visibleSales = useMemo(
    () =>
      portalSales.filter((sale) => {
        if (isAdmin && adminOwnerFilter === 'all') return true
        if (!activeScopeOwner) return false
        return isSalesDashboardSaleOwnedBy(sale, activeScopeOwner)
      }),
    [activeScopeOwner, adminOwnerFilter, isAdmin, portalSales],
  )
  const searchedContactSummaries = useMemo(() => {
    const normalizedQuery = normalizeCrmSearchText(crmSearchQuery)
    return visibleContactSummaries.filter((summary) =>
      salesPortalContactMatchesSearch(summary, visibleSales, normalizedQuery),
    )
  }, [crmSearchQuery, visibleContactSummaries, visibleSales])
  const selectedSummary =
    searchedContactSummaries.find((summary) => summary.contact.id === selectedContactId) ??
    searchedContactSummaries[0] ??
    null
  const visibleEngagements = useMemo(
    () =>
      visibleContactSummaries
        .flatMap((summary) =>
          summary.contact.touchpoints.map((touchpoint) => ({
            contact: summary.contact,
            touchpoint,
          })),
        )
        .sort(
          (first, second) =>
            getDateTimestamp(second.touchpoint.contactedAt) -
            getDateTimestamp(first.touchpoint.contactedAt),
        ),
    [visibleContactSummaries],
  )
  const reportDateWindow = useMemo(() => {
    const start = getDateTimestamp(getCrmDateFromInput(reportStartDate))
    const end = getDateTimestamp(getCrmDateFromInput(reportEndDate)) + 24 * 60 * 60 * 1000 - 1
    return { start, end }
  }, [reportEndDate, reportStartDate])

  const reportEngagements = useMemo(() => {
    return visibleEngagements.filter(({ touchpoint }) => {
      const timestamp = getDateTimestamp(touchpoint.contactedAt)
      const matchesType = reportTypeFilter === 'all' || touchpoint.type === reportTypeFilter
      return matchesType && timestamp >= reportDateWindow.start && timestamp <= reportDateWindow.end
    })
  }, [reportDateWindow, reportTypeFilter, visibleEngagements])
  const reportSales = useMemo(
    () =>
      visibleSales.filter((sale) => {
        const timestamp = getDateTimestamp(sale.submittedAt)
        return timestamp >= reportDateWindow.start && timestamp <= reportDateWindow.end
      }),
    [reportDateWindow, visibleSales],
  )
  const reportNewContacts = useMemo(
    () =>
      visibleContactSummaries.filter((summary) => {
        const timestamp = getDateTimestamp(summary.contact.createdAt)
        return timestamp >= reportDateWindow.start && timestamp <= reportDateWindow.end
      }),
    [reportDateWindow, visibleContactSummaries],
  )
  const activeLeadCount = useMemo(
    () =>
      visibleContactSummaries.filter((summary) =>
        ['lead', 'qualified', 'quoted', 'invoice_sent', 'nurture'].includes(summary.contact.stage),
      ).length,
    [visibleContactSummaries],
  )
  const reportRevenue = useMemo(
    () => reportSales.reduce((total, sale) => total + sale.total, 0),
    [reportSales],
  )
  const conversionRate =
    reportNewContacts.length > 0 ? Math.round((reportSales.length / reportNewContacts.length) * 100) : 0
  const reportCountsByType = useMemo(() => {
    const counts = new Map<CrmTouchpointType, number>()
    for (const { touchpoint } of reportEngagements) {
      counts.set(touchpoint.type, (counts.get(touchpoint.type) ?? 0) + 1)
    }
    return crmTouchpointTypeOptions.map((option) => ({
      ...option,
      count: counts.get(option.value) ?? 0,
    }))
  }, [reportEngagements])
  const reportRowsByRep = useMemo(() => {
    const rows = new Map<
      string,
      {
        key: string
        label: string
        email: string
        engagements: number
        calls: number
        texts: number
        emails: number
        instagramDms: number
        submittedSales: number
        submittedValue: number
        paidSales: number
        paidValue: number
        openValue: number
      }
    >()

    function getRow(key: string, label: string, email = '') {
      const existing = rows.get(key)
      if (existing) return existing

      const row = {
        key,
        label,
        email,
        engagements: 0,
        calls: 0,
        texts: 0,
        emails: 0,
        instagramDms: 0,
        submittedSales: 0,
        submittedValue: 0,
        paidSales: 0,
        paidValue: 0,
        openValue: 0,
      }
      rows.set(key, row)
      return row
    }

    for (const { contact, touchpoint } of reportEngagements) {
      const salesRep = touchpoint.salesRep || contact.salesOwner || 'Unassigned'
      const ownerEmail = contact.ownerEmail
      const row = getRow(getCrmOwnerKey(salesRep, ownerEmail), salesRep, ownerEmail)
      row.engagements += 1
      if (touchpoint.type === 'call') row.calls += 1
      if (touchpoint.type === 'text') row.texts += 1
      if (touchpoint.type === 'email') row.emails += 1
      if (touchpoint.type === 'instagram_dm') row.instagramDms += 1
    }

    for (const sale of reportSales) {
      const key = getSalesRepSummaryKey(sale)
      const row = getRow(key, getSalesRepSummaryLabel(sale), sale.salesRepEmail)
      row.submittedSales += 1
      row.submittedValue += sale.total
      if (sale.isPaid) {
        row.paidSales += 1
        row.paidValue += sale.total
      } else {
        row.openValue += sale.total
      }
    }

    return Array.from(rows.values()).sort(
      (a, b) =>
        b.paidValue - a.paidValue ||
        b.submittedValue - a.submittedValue ||
        b.engagements - a.engagements ||
        compareText(a.label, b.label),
    )
  }, [reportEngagements, reportSales])

  useEffect(() => {
    if (isDemoSession && session) {
      window.localStorage.setItem(salesPortalSessionStorageKey, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(salesPortalSessionStorageKey)
    }
  }, [isDemoSession, session])

  useEffect(() => {
    if (isDemoSession) {
      window.localStorage.setItem(crmContactStorageKey, JSON.stringify(crmContacts))
    }
  }, [crmContacts, isDemoSession])

  useEffect(() => {
    if (isDemoSession) {
      window.localStorage.setItem(salesPortalOrderStorageKey, JSON.stringify(portalOrders))
    }
  }, [isDemoSession, portalOrders])

  useEffect(() => {
    if (isDemoSession) return

    let cancelled = false

    async function loadPortalSession() {
      try {
        const response = await fetch(getApiPath('/api/sales-portal/session'), { cache: 'no-store' })
        const payload = (await response.json()) as SalesPortalApiResponse
        if (cancelled) return
        if (response.ok && payload.ok && payload.session) {
          setSession(payload.session)
          setLoginEmail(payload.session.email)
          setLoginMessage('')
        } else {
          setSession(null)
        }
      } catch {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setIsLoadingPortalData(false)
      }
    }

    void loadPortalSession()

    return () => {
      cancelled = true
    }
  }, [isDemoSession])

  useEffect(() => {
    if (isDemoSession || session) return

    let cancelled = false

    async function checkCodeIssuerAccess() {
      try {
        const response = await fetch(getApiPath('/api/internal-session'), { cache: 'no-store' })
        if (!cancelled) setCanIssueLoginCode(response.ok)
      } catch {
        if (!cancelled) setCanIssueLoginCode(false)
      }
    }

    void checkCodeIssuerAccess()

    return () => {
      cancelled = true
    }
  }, [isDemoSession, session])

  useEffect(() => {
    if (isDemoSession || !session) return

    let cancelled = false

    async function loadPortalData() {
      try {
        setIsLoadingPortalData(true)
        const [stateResponse, catalogResponse] = await Promise.all([
          fetch(getApiPath('/api/sales-portal/state'), { cache: 'no-store' }),
          fetch(getApiPath('/api/catalog'), { cache: 'no-store' }),
        ])
        const statePayload = (await stateResponse.json()) as SalesPortalApiResponse
        const catalogPayload = (await catalogResponse.json()) as { products?: ShopifyCatalogProduct[] }
        if (cancelled) return

        if (stateResponse.status === 401) {
          setSession(null)
          setLoginMessage('Sign in again to continue.')
          return
        }

        if (!stateResponse.ok || !statePayload.ok) {
          throw new Error(statePayload.message ?? 'Could not load sales portal data.')
        }

        setCrmContacts(
          Array.isArray(statePayload.crmContacts)
            ? statePayload.crmContacts.map((contact) => normalizeCrmContact(contact))
            : [],
        )
        setOrderJobs(
          Array.isArray(statePayload.orderJobs)
            ? statePayload.orderJobs.map((job) => normalizeOrderJob(job))
            : [],
        )
        setShopifyCatalog(Array.isArray(catalogPayload.products) ? catalogPayload.products : [])
      } catch (error) {
        if (!cancelled) {
          setPortalMessage(error instanceof Error ? error.message : 'Could not load sales portal data.')
        }
      } finally {
        if (!cancelled) setIsLoadingPortalData(false)
      }
    }

    void loadPortalData()

    return () => {
      cancelled = true
    }
  }, [isDemoSession, session])

  async function issueSalesPortalLoginCode() {
    const email = normalizeTrinityEmail(codeIssuerEmail)
    const owner = getCrmOwnerByEmail(email)
    if (!owner) {
      setIssuedLoginCode(null)
      setLoginMessage('Choose an approved Trinity sales team member.')
      return
    }

    try {
      setIsIssuingLoginCode(true)
      const response = await fetch(getApiPath('/api/sales-portal/admin-login-code'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      const payload = (await response.json()) as SalesPortalApiResponse
      const issuedCode = payload.loginCode ?? payload.accessCode
      if (!response.ok || !payload.ok || !issuedCode) {
        throw new Error(payload.message ?? 'Could not create a sign-in code.')
      }

      setIssuedLoginCode({
        email,
        code: issuedCode,
        expiresAt: payload.expiresAt ?? '',
      })
      if (!session) {
        setLoginEmail(email)
        setLoginCode(issuedCode)
      }
      setLoginMessage(payload.message ?? `Access code created for ${owner.label}.`)
    } catch (error) {
      setIssuedLoginCode(null)
      setLoginMessage(error instanceof Error ? error.message : 'Could not create a sign-in code.')
    } finally {
      setIsIssuingLoginCode(false)
    }
  }

  async function loginToPortal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = normalizeTrinityEmail(loginEmail)
    if (!isTrinityEmail(email)) {
      setLoginMessage('Use a Trinity email address ending in @trinitybats.com.')
      return
    }

    if (isDemoSession) {
      setSession(createDemoSalesPortalSession(email))
      setLoginMessage('')
      return
    }

    try {
      const isVerifyingCode = Boolean(loginCode.trim())
      const response = await fetch(
        getApiPath(isVerifyingCode ? '/api/sales-portal/verify-code' : '/api/sales-portal/login-code'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(isVerifyingCode ? { email, code: loginCode } : { email }),
        },
      )
      const payload = (await response.json()) as SalesPortalApiResponse
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Sales portal sign-in failed.')

      if (isVerifyingCode) {
        if (!payload.session) throw new Error('Sales portal session was not returned.')
        setSession(payload.session)
        setLoginCode('')
        setLoginMessage('')
      } else {
        setLoginCode('')
        setLoginMessage(
          payload.devCode
            ? `Use local preview code ${payload.devCode}.`
            : payload.message ??
                `A sign-in code was sent to ${email}. You can also enter an admin-issued access code.`,
        )
      }
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : 'Could not sign in.')
    }
  }

  async function handlePortalSignOut() {
    if (demoEmail) {
      setSession(createDemoSalesPortalSession(demoEmail))
      setPortalMessage(`${getSalesPortalOwnerForEmail(demoEmail).label} demo refreshed.`)
      return
    }

    try {
      await fetch(getApiPath('/api/sales-portal/logout'), { method: 'POST' })
    } catch {
      // Clearing the local shell is still the right user outcome if logout cannot reach the server.
    }
    setSession(null)
    setCrmContacts([])
    setOrderJobs([])
    setPortalOrders([])
    setShopifyCatalog([])
    setLoginCode('')
  }

  function mergePortalCrmContactIntoList(current: CrmContact[], contact: CrmContact) {
    const normalized = normalizeCrmContact({
      ...contact,
      updatedAt: new Date().toISOString(),
      sandboxOnly: isDemoSession,
    })
    const existingIndex = current.findIndex(
      (savedContact) =>
        savedContact.id === normalized.id || hasSharedCrmIdentity(savedContact, normalized),
    )
    if (existingIndex === -1) return { contacts: [...current, normalized], contact: normalized }

    const savedContact = mergeCrmContacts(normalized, current[existingIndex])
    return {
      contacts: current.map((contactItem, index) =>
        index === existingIndex ? savedContact : contactItem,
      ),
      contact: savedContact,
    }
  }

  async function savePortalCrmContact(contact: CrmContact) {
    const merged = mergePortalCrmContactIntoList(crmContacts, contact)

    if (!isDemoSession) {
      const response = await fetch(getApiPath('/api/sales-portal/state'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ crmContacts: [merged.contact] }),
      })
      const payload = (await response.json()) as SalesPortalApiResponse
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? 'Could not save the CRM contact.')
      }
    }

    setCrmContacts(merged.contacts)
    setSelectedContactId(merged.contact.id)
    return merged.contact
  }

  async function savePortalNewContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!portalOwner) return
    if (!newContactDraft.name.trim() && !newContactDraft.company.trim()) {
      setPortalMessage('Add a name or company before saving.')
      return
    }
    const now = new Date().toISOString()
    try {
      const contact = await savePortalCrmContact({
        ...newContactDraft,
        salesOwner: portalOwner.name,
        ownerEmail: portalOwner.email,
        source: newContactDraft.source || 'Sales portal',
        createdAt: newContactDraft.createdAt || now,
        updatedAt: now,
      })
      setNewContactDraft({
        ...emptyCrmContact(),
        salesOwner: portalOwner.name,
        ownerEmail: portalOwner.email,
      })
      setSelectedContactId(contact.id)
      setPortalMessage('Contact saved.')
    } catch (error) {
      setPortalMessage(error instanceof Error ? error.message : 'Could not save the contact.')
    }
  }

  function startPortalOrderForContact(contact: CrmContact) {
    if (!portalOwner) return
    setOrderDraft({
      ...emptySalesOrderDraft(),
      playerName: contact.playerNames[0] || contact.name,
      playerEmail: contact.email,
      playerPhone: contact.phone,
      billingDifferent: Boolean(contact.company),
      billingName: contact.name,
      billingEmail: contact.email,
      billingPhone: contact.phone,
      billingCompany: contact.company,
      billingRelationship: contact.role,
      salesRep: portalOwner.name,
      salesRepEmail: portalOwner.email,
      notes: contact.buyingContext,
    })
    setSelectedContactId(contact.id)
    setActiveView('order_form')
  }

  function updatePortalSalesDraftField<K extends keyof SalesOrderDraft>(
    key: K,
    value: SalesOrderDraft[K],
  ) {
    setOrderDraft((current) => ({ ...current, [key]: value }))
  }

  function updatePortalSalesLine(id: string, patch: Partial<SalesOrderLineDraft>) {
    setOrderDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }))
  }

  async function submitPortalOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!portalOwner) return
    const draft = {
      ...cloneSalesOrderDraft(orderDraft),
      salesRep: portalOwner.name,
      salesRepEmail: portalOwner.email,
    }
    if (hasInvalidSalesOrderDraft(draft)) {
      setPortalMessage('Add player, payer email, payer phone, shipping info, bat model, and price.')
      return
    }
    try {
      setIsSubmittingPortalOrder(true)
      if (isDemoSession) {
        const contact = await savePortalCrmContact(
          createCrmContactFromSalesPortalDraft(draft, portalOwner),
        )
        const order = createSalesPortalOrder(draft, portalOwner, contact.id)
        setPortalOrders((current) => [order, ...current])
        setPortalMessage('Order saved to this sales portal demo.')
        setSelectedContactId(contact.id)
      } else {
        setPortalMessage(
          orderAttachmentFile
            ? 'Uploading attachment and creating Shopify order...'
            : 'Creating Shopify order...',
        )
        const attachment = orderAttachmentFile
          ? await uploadSalesOrderAttachment(orderAttachmentFile)
          : null
        const submittedDraft = {
          ...draft,
          attachment,
        }
        const response = await fetch(getApiPath('/api/sales-orders'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submittedDraft),
        })
        const payload = (await response.json()) as SalesOrderApiResponse
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? 'Shopify order failed')

        const contact = await savePortalCrmContact(
          createCrmContactFromSalesPortalDraft(submittedDraft, portalOwner),
        )
        setOrderJobs((current) =>
          mergeOrderJobs(
            (payload.orderJobs ?? []).map((job) => normalizeOrderJob(job)),
            current,
          ),
        )
        setSelectedContactId(contact.id)
        setPortalMessage(getSalesOrderSuccessMessage(submittedDraft, payload))
      }

      setOrderDraft({
        ...emptySalesOrderDraft(),
        salesRep: portalOwner.name,
        salesRepEmail: portalOwner.email,
      })
      setOrderAttachmentFile(null)
      setActiveView('orders')
    } catch (error) {
      setPortalMessage(error instanceof Error ? error.message : 'Could not create the order.')
    } finally {
      setIsSubmittingPortalOrder(false)
    }
  }

  async function savePortalEngagement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSummary || !portalOwner) return
    if (!touchpointDraft.summary.trim()) {
      setPortalMessage('Add a summary before saving the engagement.')
      return
    }
    const touchpoint = normalizeCrmTouchpoint({
      id: createId('portal-touchpoint'),
      type: touchpointDraft.type,
      contactedAt: getCrmContactedAtFromInput(touchpointDraft.contactedAt),
      salesRep: portalOwner.name,
      summary: touchpointDraft.summary,
      sentiment: '',
      nextStep: touchpointDraft.nextStep,
      nextFollowUpAt: getCrmDateFromInput(touchpointDraft.nextFollowUpAt),
      relatedOrderId: touchpointDraft.relatedOrderId,
    })
    try {
      await savePortalCrmContact({
        ...selectedSummary.contact,
        salesOwner: selectedSummary.contact.salesOwner || portalOwner.name,
        ownerEmail: selectedSummary.contact.ownerEmail || portalOwner.email,
        lastContactedAt: touchpoint.contactedAt,
        followUpAt: touchpoint.nextFollowUpAt || selectedSummary.contact.followUpAt,
        touchpoints: [touchpoint, ...selectedSummary.contact.touchpoints],
      })
      setTouchpointDraft({ ...emptyCrmTouchpointDraft(), salesRep: portalOwner.name })
      setPortalMessage('Engagement saved.')
    } catch (error) {
      setPortalMessage(error instanceof Error ? error.message : 'Could not save the engagement.')
    }
  }

  if (!session || !portalOwner) {
    return (
      <main className="sales-portal-shell">
        <section className="panel sales-portal-login">
          <div className="sales-portal-login-brand">
            <img src="/trinity-logo-cropped.png" alt="Trinity Bat Company" className="sales-portal-logo" />
            <div className="section-heading">
              <p className="eyebrow">Trinity Bat Co.</p>
              <h1>Sales portal</h1>
            </div>
          </div>
          <form className="bat-form" onSubmit={loginToPortal}>
            <label>
              Trinity email
              <input
                type="email"
                value={loginEmail}
                placeholder="name@trinitybats.com"
                onChange={(event) => {
                  setLoginEmail(event.target.value)
                  setLoginCode('')
                }}
              />
            </label>
            <label>
              Access code
              <input
                value={loginCode}
                placeholder="TRI-XXXXX-XXXXX or 6-digit email code"
                onChange={(event) => setLoginCode(event.target.value)}
              />
            </label>
            <button type="submit">{loginCode.trim() ? 'Sign in' : 'Send email code'}</button>
          </form>
          {canIssueLoginCode ? (
            <div className="sales-portal-code-issuer">
              <div className="form-row">
                <label>
                  Issue access
                  <select
                    value={codeIssuerEmail}
                    onChange={(event) => {
                      setCodeIssuerEmail(event.target.value)
                      setIssuedLoginCode(null)
                    }}
                  >
                    {seedCrmOwnerOptions
                      .filter((owner) => owner.email)
                      .map((owner) => (
                        <option key={owner.email} value={owner.email}>
                          {owner.label}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isIssuingLoginCode}
                  onClick={issueSalesPortalLoginCode}
                >
                  {isIssuingLoginCode ? 'Creating...' : 'Create access code'}
                </button>
              </div>
              {issuedLoginCode ? (
                <div className="helper-text sales-portal-issued-code">
                  Code <strong>{issuedLoginCode.code}</strong>
                  {issuedLoginCode.expiresAt
                    ? ` expires at ${new Date(issuedLoginCode.expiresAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}.`
                    : ' stays active until an admin reissues it.'}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void navigator.clipboard?.writeText(issuedLoginCode.code)}
                  >
                    Copy
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {isLoadingPortalData && !loginMessage ? <p className="helper-text">Checking session...</p> : null}
          {loginMessage ? <p className="helper-text">{loginMessage}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="sales-portal-shell">
      <section className="panel sales-portal-header">
        <div className="sales-portal-brand-lockup">
          <img src="/trinity-logo-cropped.png" alt="Trinity Bat Company" className="sales-portal-logo" />
          <div className="section-heading sales-portal-brand-copy">
            <p className="eyebrow">Trinity Bat Co.</p>
            <h1>{portalOwner.label}</h1>
            <p className="sales-portal-brand-line">Sales CRM and order entry</p>
          </div>
        </div>
        <div className="sales-portal-session">
          {isAdmin ? (
            <label>
              View
              <select value={adminOwnerFilter} onChange={(event) => setAdminOwnerFilter(event.target.value)}>
                <option value="all">Full team</option>
                {portalOwnerOptions.map((owner) => (
                  <option key={owner.key} value={owner.key}>
                    {owner.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="secondary-button sales-portal-signout"
            onClick={handlePortalSignOut}
          >
            {isDemoSession ? 'Reset demo' : 'Sign out'}
          </button>
        </div>
        <nav className="crm-tab-strip sales-portal-nav" aria-label="Sales portal sections">
          {salesPortalViews
            .filter((view) => !view.adminOnly || isAdmin)
            .map((view) => (
              <button
                type="button"
                className={activeView === view.value ? 'active' : ''}
                key={view.value}
                onClick={() => setActiveView(view.value)}
              >
                {view.label}
              </button>
            ))}
        </nav>
      </section>

      {isLoadingPortalData ? <p className="helper-text crm-message">Syncing live portal data...</p> : null}
      {portalMessage ? <p className="helper-text crm-message">{portalMessage}</p> : null}

      {activeView === 'crm' ? (
        <section className="sales-portal-crm-layout">
          <aside className="sales-portal-crm-sidebar" aria-label="CRM intake and contacts">
            <form className="panel crm-quick-intake" onSubmit={savePortalNewContact}>
              <div className="section-heading">
                <p className="eyebrow">CRM</p>
                <h2>New contact</h2>
              </div>
              <div className="form-row">
                <label>
                  Name
                  <input
                    value={newContactDraft.name}
                    onChange={(event) =>
                      setNewContactDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Company
                  <input
                    value={newContactDraft.company}
                    onChange={(event) =>
                      setNewContactDraft((current) => ({ ...current, company: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Phone
                  <input
                    value={newContactDraft.phone}
                    onChange={(event) =>
                      setNewContactDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={newContactDraft.email}
                    onChange={(event) =>
                      setNewContactDraft((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="notes-field">
                Summary
                <textarea
                  value={newContactDraft.buyingContext}
                  onChange={(event) =>
                    setNewContactDraft((current) => ({ ...current, buyingContext: event.target.value }))
                  }
                />
              </label>
              <button type="submit">Save contact</button>
            </form>

            <section className="panel crm-list-panel">
              <div className="section-heading">
                <p className="eyebrow">Contacts</p>
                <h2>{searchedContactSummaries.length} visible</h2>
              </div>
              <label className="sales-portal-search">
                Search CRM
                <input
                  type="search"
                  value={crmSearchQuery}
                  placeholder="Search names, teams, players, notes, bat specs..."
                  onChange={(event) => setCrmSearchQuery(event.target.value)}
                />
              </label>
              <div className="crm-contact-list">
                {searchedContactSummaries.length === 0 ? (
                  <p className="empty-state">
                    {crmSearchQuery.trim() ? 'No contacts match that search.' : 'No contacts yet.'}
                  </p>
                ) : (
                  searchedContactSummaries.map((summary) => (
                    <button
                      type="button"
                      className={`crm-contact-card ${selectedSummary?.contact.id === summary.contact.id ? 'active' : ''}`}
                      key={summary.contact.id}
                      onClick={() => setSelectedContactId(summary.contact.id)}
                    >
                      <span className={`pill crm-priority-${summary.contact.priority}`}>
                        {getCrmPriorityLabel(summary.contact.priority)}
                      </span>
                      <strong>{summary.contact.name || summary.contact.company || 'Unnamed contact'}</strong>
                      <span>{summary.contact.company || summary.contact.email || summary.contact.phone}</span>
                      <span>{summary.contact.salesOwner || 'Unassigned'}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="panel crm-detail-panel sales-portal-crm-main">
            {selectedSummary ? (
              <>
                <div className="crm-detail-header">
                  <div>
                    <p className="eyebrow">Selected contact</p>
                    <h2>{selectedSummary.contact.name || selectedSummary.contact.company}</h2>
                    <p>{selectedSummary.contact.email || selectedSummary.contact.phone || 'No contact method saved'}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => startPortalOrderForContact(selectedSummary.contact)}
                  >
                    Start order
                  </button>
                </div>
                <form className="crm-touchpoint-form" onSubmit={savePortalEngagement}>
                  <div className="section-heading">
                    <p className="eyebrow">Engagement</p>
                    <h2>Log activity</h2>
                  </div>
                  <div className="form-row">
                    <label>
                      Type
                      <select
                        value={touchpointDraft.type}
                        onChange={(event) =>
                          setTouchpointDraft((current) => ({
                            ...current,
                            type: event.target.value as CrmTouchpointType,
                          }))
                        }
                      >
                        {crmTouchpointTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date
                      <input
                        type="date"
                        value={touchpointDraft.contactedAt || getCrmTodayInputValue()}
                        onChange={(event) =>
                          setTouchpointDraft((current) => ({
                            ...current,
                            contactedAt: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="notes-field">
                    Summary
                    <textarea
                      value={touchpointDraft.summary}
                      onChange={(event) =>
                        setTouchpointDraft((current) => ({ ...current, summary: event.target.value }))
                      }
                    />
                  </label>
                  <label className="notes-field">
                    Next step
                    <textarea
                      value={touchpointDraft.nextStep}
                      onChange={(event) =>
                        setTouchpointDraft((current) => ({ ...current, nextStep: event.target.value }))
                      }
                    />
                  </label>
                  <button type="submit">Save engagement</button>
                </form>
                <section className="crm-contact-engagement-section">
                  <div className="section-heading">
                    <p className="eyebrow">Saved engagements</p>
                    <h2>{selectedSummary.contact.touchpoints.length} stored</h2>
                  </div>
                  <ContactEngagementReview touchpoints={selectedSummary.contact.touchpoints} />
                </section>
              </>
            ) : (
              <p className="empty-state">Select a contact to log activity or start an order.</p>
            )}
          </section>
        </section>
      ) : null}

      {activeView === 'order_form' ? (
        <section className="panel crm-detail-panel">
          <form className="bat-form order-intake-form" onSubmit={submitPortalOrder}>
            <div className="section-heading">
              <p className="eyebrow">Order form</p>
              <h2>Sales order</h2>
            </div>
            <datalist id="portal-shopify-bat-products">
              {shopifyCatalog.map((product) => (
                <option key={product.id} value={product.name} />
              ))}
            </datalist>
            <SalesOrderFormFields
              draft={orderDraft}
              setDraft={setOrderDraft}
              updateField={updatePortalSalesDraftField}
              updateLine={updatePortalSalesLine}
              addLine={() =>
                setOrderDraft((current) => ({
                  ...current,
                  lines: [...current.lines, emptySalesLine()],
                }))
              }
              removeLine={(id) =>
                setOrderDraft((current) => ({
                  ...current,
                  lines: current.lines.filter((line) => line.id !== id),
                }))
              }
              shopifyCatalog={shopifyCatalog}
              productDatalistId="portal-shopify-bat-products"
              attachmentFile={orderAttachmentFile}
              setAttachmentFile={setOrderAttachmentFile}
              isSubmitting={isSubmittingPortalOrder}
              hideSalesRepFields
            />
          </form>
        </section>
      ) : null}

      {activeView === 'orders' ? (
        <section className="panel crm-list-panel">
          <div className="section-heading">
            <p className="eyebrow">Orders</p>
            <h2>{visibleSales.length} visible</h2>
          </div>
          <div className="sales-dashboard-list">
            {visibleSales.length === 0 ? (
              <p className="empty-state">No sales orders found yet.</p>
            ) : (
              visibleSales.map((sale) => (
                <article className="sales-dashboard-card" key={sale.key}>
                  <div>
                    <span className="profile-type-pill">
                      {sale.isPaid ? 'Paid' : invoiceStatusLabels[sale.invoiceStatus]}
                    </span>
                    <h3>{sale.payerName || sale.customerName || 'Unnamed order'}</h3>
                    <p>{sale.productSummary}</p>
                    <p>{sale.salesRep || sale.salesRepEmail || 'Unassigned'}</p>
                  </div>
                  <div className="sales-card-values">
                    <strong>{formatSalesOrderMoney(sale.total)}</strong>
                    <span>{formatSalesDashboardDate(sale.submittedAt)}</span>
                    <span>{sale.paidAt ? `Paid ${formatSalesDashboardDate(sale.paidAt)}` : 'Open'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeView === 'reports' ? (
        <section className="sales-portal-report-layout">
          <section className="panel crm-side-panel">
            <div className="section-heading">
              <p className="eyebrow">{isAdmin ? 'Admin report' : 'My report'}</p>
              <h2>Activity counts</h2>
            </div>
            <div className="form-row">
              <label>
                Start
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(event) => setReportStartDate(event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(event) => setReportEndDate(event.target.value)}
                />
              </label>
            </div>
            <label>
              Activity type
              <select
                value={reportTypeFilter}
                onChange={(event) => setReportTypeFilter(event.target.value as 'all' | CrmTouchpointType)}
              >
                <option value="all">All activity</option>
                {crmTouchpointTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin ? (
              <div className="sales-portal-code-issuer sales-portal-admin-access">
                <div className="section-heading">
                  <p className="eyebrow">Team access</p>
                  <h2>Issue access codes</h2>
                </div>
                <div className="form-row">
                  <label>
                    Team member
                    <select
                      value={codeIssuerEmail}
                      onChange={(event) => {
                        setCodeIssuerEmail(event.target.value)
                        setIssuedLoginCode(null)
                      }}
                    >
                      {seedCrmOwnerOptions
                        .filter((owner) => owner.email)
                        .map((owner) => (
                          <option key={owner.email} value={owner.email}>
                            {owner.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isIssuingLoginCode}
                    onClick={issueSalesPortalLoginCode}
                  >
                    {isIssuingLoginCode ? 'Creating...' : 'Create access code'}
                  </button>
                </div>
                {issuedLoginCode ? (
                  <div className="helper-text sales-portal-issued-code">
                    Code <strong>{issuedLoginCode.code}</strong> for {issuedLoginCode.email}. It stays active
                    until an admin reissues it.
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void navigator.clipboard?.writeText(issuedLoginCode.code)}
                    >
                      Copy
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="crm-stat-grid sales-portal-report-stats">
              <article>
                <span>Contacts created</span>
                <strong>{reportNewContacts.length}</strong>
              </article>
              <article>
                <span>Active leads</span>
                <strong>{activeLeadCount}</strong>
              </article>
              <article>
                <span>Conversions</span>
                <strong>{reportSales.length}</strong>
              </article>
              <article>
                <span>Portal sales</span>
                <strong>{formatSalesOrderMoney(reportRevenue)}</strong>
              </article>
              <article>
                <span>Engagements</span>
                <strong>{reportEngagements.length}</strong>
              </article>
              <article>
                <span>Conversion rate</span>
                <strong>{conversionRate}%</strong>
              </article>
            </div>
            <div className="crm-stat-grid">
              {reportCountsByType.map((item) => (
                <article key={item.value}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="panel crm-detail-panel">
            <div className="section-heading">
              <p className="eyebrow">{isAdmin ? 'By team member' : 'My activity'}</p>
              <h2>{reportRowsByRep.length} rows</h2>
            </div>
            <div className="crm-engagement-list">
              {reportRowsByRep.length === 0 ? (
                <p className="empty-state">No activity or sales in this date range.</p>
              ) : (
                reportRowsByRep.map((row) => (
                  <article className="crm-engagement-detail sales-portal-report-row" key={row.key}>
                    <div>
                      <h3>{row.label}</h3>
                      <p>{row.email || 'No email stored'}</p>
                    </div>
                    <div className="sales-portal-report-row-grid">
                      <span>{row.engagements} engagements</span>
                      <span>{row.calls} calls</span>
                      <span>{row.texts} texts</span>
                      <span>{row.emails} emails</span>
                      <span>{row.instagramDms} IG DMs</span>
                      <span>{row.submittedSales} sales</span>
                      <span>{formatSalesOrderMoney(row.submittedValue)} submitted</span>
                      <span>{formatSalesOrderMoney(row.paidValue)} paid</span>
                      <span>{formatSalesOrderMoney(row.openValue)} open</span>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="sales-portal-report-section">
              <div className="section-heading">
                <p className="eyebrow">Sales records</p>
                <h2>{reportSales.length} sales</h2>
              </div>
              <div className="sales-dashboard-list">
                {reportSales.length === 0 ? (
                  <p className="empty-state">No sales in this range.</p>
                ) : (
                  reportSales.map((sale) => (
                    <article className="sales-dashboard-card" key={sale.key}>
                      <div>
                        <span className="profile-type-pill">
                          {sale.isPaid ? 'Paid' : invoiceStatusLabels[sale.invoiceStatus]}
                        </span>
                        <h3>{sale.payerName || sale.customerName || 'Unnamed sale'}</h3>
                        <p>{sale.productSummary}</p>
                        <p>{sale.salesRep || sale.salesRepEmail || 'Unassigned'}</p>
                      </div>
                      <div className="sales-card-values">
                        <strong>{formatSalesOrderMoney(sale.total)}</strong>
                        <span>{formatSalesDashboardDate(sale.submittedAt)}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="sales-portal-report-section">
              <div className="section-heading">
                <p className="eyebrow">Engagement log</p>
                <h2>{reportEngagements.length} entries</h2>
              </div>
              <div className="crm-engagement-list">
                {reportEngagements.length === 0 ? (
                  <p className="empty-state">No engagements in this range.</p>
                ) : (
                  reportEngagements.map(({ contact, touchpoint }, index) => (
                    <article className="crm-engagement-detail" key={touchpoint.id || `${contact.id}-${index}`}>
                      <h3>
                        {index + 1}. {getCrmTouchpointTypeLabel(touchpoint.type)}
                      </h3>
                      <p>{contact.name || contact.company || 'Unnamed contact'}</p>
                      <p>{touchpoint.salesRep || contact.salesOwner || 'Unassigned'}</p>
                      <p>{formatSalesDashboardDate(touchpoint.contactedAt)}</p>
                      <p>{touchpoint.summary || 'No summary saved.'}</p>
                      {touchpoint.nextStep ? <p>Next: {touchpoint.nextStep}</p> : null}
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  )
}

function App() {
  if (salesPortalDemoOnly) {
    return <SalesPortalApp />
  }

  // Keep the public order form on explicit public paths only. Every other
  // route should open the internal inventory tool so the two experiences
  // never silently fall back into each other.
  if (isSalesPortalRoute()) {
    return <SalesPortalApp />
  }

  if (isPublicOrderFormRoute()) {
    return <PublicSalesOrderForm />
  }

  if (isInternalToolRoute()) {
    return <InternalApp />
  }

  return <InternalApp />
}

export default App
