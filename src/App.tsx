import { useEffect, useRef, useState } from 'react'
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

type ActiveSection = 'inventory' | 'players' | 'models' | 'costs'
type BilletStatus =
  | 'received'
  | 'measured'
  | 'reserved'
  | 'in_production'
  | 'consumed'
  | 'rejected'

type Species = 'Maple' | 'Birch' | 'Ash'
type Grade = 'Prime' | 'Select' | 'Choice' | 'Trophy' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type KnotStatus = 'Yes' | 'No' | 'N/A'
type WoodTier = 'Prime' | 'Select' | 'Choice' | 'Pro' | 'Semi-Pro' | 'Promo' | 'Blem'
type Source = "RJ's Tree Farms" | 'Great Lakes Veneer' | 'Champeau'
type ProfileKind = 'Player' | 'Trainer'

type Billet = {
  id: string
  barcode: string
  species: Species
  grade: Grade
  mlbEligible: boolean
  hasBarrelKnot: KnotStatus
  source: Source
  length: number
  weight: number | ''
  moisture: number
  status: BilletStatus
  location: string
  notes: string
}

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
    inventoryQuantity: number
    sku: string
  }[]
}

type ProducedBatRecord = {
  id: string
  modelId: string
  batType: 'Game' | 'Trainer' | 'Trophy'
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
}

const billetStorageKey = 'trinity-billet-sandbox-v5'
const playerStorageKey = 'trinity-player-profiles-v3'
const producedBatStorageKey = 'trinity-produced-bats-v1'
const customBatModelStorageKey = 'trinity-custom-bat-models-v1'

const standardBilletLength = 37
const standardBilletDiameter = 2.75
const rjBilletDiameter = 2.79
const defaultMoisture = 8
const speciesOptions: Species[] = ['Maple', 'Birch', 'Ash']
const allGradeOptions: Grade[] = ['Prime', 'Select', 'Choice', 'Trophy', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceGradeOptions: Record<Source, Grade[]> = {
  "RJ's Tree Farms": ['Prime', 'Select', 'Choice', 'Trophy'],
  'Great Lakes Veneer': ['Prime', 'Select', 'Choice', 'Trophy'],
  Champeau: ['Pro', 'Semi-Pro', 'Promo', 'Blem'],
}
const woodTierOptions: WoodTier[] = ['Prime', 'Select', 'Choice', 'Pro', 'Semi-Pro', 'Promo', 'Blem']
const sourceOptions: Source[] = ["RJ's Tree Farms", 'Great Lakes Veneer', 'Champeau']
const cupOptions: ProducedBatRecord['cupped'][] = ['Yes', 'No']
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
  received: 'Received',
  measured: 'Measured',
  reserved: 'Reserved',
  in_production: 'In Production',
  consumed: 'Consumed',
  rejected: 'Rejected',
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
    length: standardBilletLength,
    weight: 91,
    moisture: 7.8,
    status: 'measured',
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
    length: standardBilletLength,
    weight: 82,
    moisture: 8.2,
    status: 'received',
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
    length: standardBilletLength,
    weight: 104,
    moisture: 7.1,
    status: 'reserved',
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

const emptyBillet: Omit<Billet, 'id'> = {
  barcode: '',
  species: 'Maple',
  grade: 'Prime',
  mlbEligible: true,
  hasBarrelKnot: 'No',
  source: "RJ's Tree Farms",
  length: standardBilletLength,
  weight: '',
  moisture: defaultMoisture,
  status: 'received',
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

function getFitScore(billet: Billet, build: CustomBuild) {
  if (billet.status === 'consumed' || billet.status === 'rejected') return 0
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
  return source === "RJ's Tree Farms" ? rjBilletDiameter : standardBilletDiameter
}

function normalizeKnotStatus(value: KnotStatus | boolean | null | undefined) {
  if (value === 'Yes' || value === 'No' || value === 'N/A') return value
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'No'
}

function getGradeOptionsForSource(source: Source) {
  return sourceGradeOptions[source]
}

function normalizeGradeForSource(source: Source, grade: Grade): Grade {
  const validGrades = getGradeOptionsForSource(source)
  return validGrades.includes(grade) ? grade : validGrades[0]
}

function normalizeProducedBatRecord(
  record: Partial<ProducedBatRecord> & Pick<ProducedBatRecord, 'id' | 'modelId'>,
): ProducedBatRecord {
  return {
    ...emptyProducedBat,
    ...record,
    batType: record.batType ?? 'Game',
    billetWeight: record.billetWeight ?? '',
    billetGrade: record.billetGrade ?? 'Prime',
    cupped: record.cupped ?? 'No',
    modifications: record.modifications ?? '',
    createdAt: record.createdAt ?? new Date().toISOString(),
  }
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

  if (species) next.species = species
  if (grade) next.grade = grade

  if (normalized.includes('great lakes')) next.source = 'Great Lakes Veneer'
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
  next.notes = text.trim()

  return applyBilletGradeRules(next)
}

function getBilletLabel(billet: Billet) {
  return `${billet.barcode} - ${billet.species} ${billet.grade}, ${billet.weight || 'no weight'} oz`
}

function getBatModelName(modelId: string, models: BatModelProduct[]) {
  return models.find((model) => model.id === modelId)?.name ?? modelId
}

function createModelId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `custom-${slug || Date.now()}`
}

function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('inventory')
  const [billets, setBillets] = useState<Billet[]>(() => {
    const stored = window.localStorage.getItem(billetStorageKey)
    const parsed = stored ? (JSON.parse(stored) as Billet[]) : seedBillets
    return parsed.map((billet) => ({
      ...billet,
      hasBarrelKnot: normalizeKnotStatus(billet.hasBarrelKnot),
    }))
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
  const [draft, setDraft] = useState(emptyBillet)
  const [quickEntry, setQuickEntry] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | BilletStatus>('all')
  const [speciesFilter, setSpeciesFilter] = useState<'all' | Species>('all')
  const [build, setBuild] = useState(initialBuild)
  const [profileKindDraft, setProfileKindDraft] = useState<ProfileKind>('Player')
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [batDraft, setBatDraft] = useState(emptyBat)
  const [playerQuery, setPlayerQuery] = useState('')
  const [scannerMessage, setScannerMessage] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [producedBatDraft, setProducedBatDraft] = useState(emptyProducedBat)
  const [showNewModelForm, setShowNewModelForm] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelCategory, setNewModelCategory] = useState('Internal / Prototype')
  const [costQuery, setCostQuery] = useState('')
  const [costSourceFilter, setCostSourceFilter] = useState<'all' | Source>('all')
  const [costSpeciesFilter, setCostSpeciesFilter] = useState<'all' | Species>('all')
  const [shopifyCatalog, setShopifyCatalog] = useState<ShopifyCatalogProduct[]>([])
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'offline'>(
    'connecting',
  )
  const [syncMessage, setSyncMessage] = useState('Connecting to Shopify backend...')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const hasLoadedRemoteState = useRef(false)

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
    let cancelled = false

    async function loadRemoteState() {
      try {
        const response = await fetch('/api/state')
        if (!response.ok) throw new Error('Shopify sync is not ready on this host.')
        const remote = (await response.json()) as Partial<RemoteState> & { ok?: boolean }
        if (cancelled) return

        if (Array.isArray(remote.billets) && remote.billets.length > 0) {
          setBillets(
            remote.billets.map((billet) => ({
              ...billet,
              hasBarrelKnot: normalizeKnotStatus(billet.hasBarrelKnot),
            })),
          )
        }
        if (Array.isArray(remote.players) && remote.players.length > 0) setPlayers(remote.players)
        if (Array.isArray(remote.producedBats) && remote.producedBats.length > 0) {
          setProducedBats(remote.producedBats.map((record) => normalizeProducedBatRecord(record)))
        }
        if (Array.isArray(remote.customBatModels) && remote.customBatModels.length > 0) {
          setCustomBatModels(remote.customBatModels)
        }

        setBackendStatus('connected')
        setSyncMessage('Connected to Shopify. Internal records will sync automatically.')
      } catch {
        if (cancelled) return
        setBackendStatus('offline')
        setSyncMessage('Using device storage only until the Shopify sync server is available.')
      } finally {
        hasLoadedRemoteState.current = true
      }
    }

    void loadRemoteState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const response = await fetch('/api/catalog')
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

    const timeout = window.setTimeout(async () => {
      try {
        setSyncMessage('Syncing to Shopify...')
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            billets,
            players,
            producedBats,
            customBatModels,
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

        setSyncMessage(`Shopify sync complete at ${syncedAt}.`)
      } catch {
        setSyncMessage('Shopify sync paused. Local changes are still saved on this device.')
      }
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [backendStatus, billets, players, producedBats, customBatModels])

  const filteredBillets = billets.filter((billet) => {
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
      billet.location,
      billet.notes,
    ]
      .join(' ')
      .toLowerCase()
    const matchesQuery = searchable.includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'all' || billet.status === statusFilter
    const matchesSpecies = speciesFilter === 'all' || billet.species === speciesFilter
    return matchesQuery && matchesStatus && matchesSpecies
  })

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
  const selectedShopifyProduct =
    shopifyCatalog.find((product) => product.id === producedBatDraft.shopifyProductId) ?? null
  const selectedShopifyVariant =
    selectedShopifyProduct?.variants.find(
      (variant) => variant.id === producedBatDraft.shopifyVariantId,
    ) ?? null

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

  const availableCount = billets.filter(
    (billet) => billet.status === 'received' || billet.status === 'measured',
  ).length
  const reservedCount = billets.filter((billet) => billet.status === 'reserved').length
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

    setBillets((current) => [
      {
        ...applyBilletGradeRules(draft),
        id: createId('billet'),
        barcode: draft.barcode.trim().toUpperCase(),
        length: standardBilletLength,
        moisture: defaultMoisture,
      },
      ...current,
    ])
    setDraft({
      ...emptyBillet,
      barcode: getNextBilletBarcode(billets),
    })
  }

  function updateStatus(id: string, status: BilletStatus) {
    setBillets((current) =>
      current.map((billet) => (billet.id === id ? { ...billet, status } : billet)),
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

  function toggleProducedBatBillet(id: string) {
    setProducedBatDraft((current) => {
      const exists = current.billetIds.includes(id)
      return {
        ...current,
        billetIds: exists
          ? current.billetIds.filter((billetId) => billetId !== id)
          : [...current.billetIds, id],
      }
    })
  }

  function addProducedBatRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !producedBatDraft.modelId ||
      !producedBatDraft.length.trim() ||
      !producedBatDraft.weight.trim() ||
      !producedBatDraft.billetWeight.trim()
    ) {
      return
    }

    setProducedBats((current) => [
      {
        ...producedBatDraft,
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
    setProducedBatDraft(emptyProducedBat)
  }

  function addCustomBatModel() {
    const name = newModelName.trim()
    if (!name) return

    const baseId = createModelId(name)
    const existingIds = new Set(allBatModels.map((model) => model.id))
    let id = baseId
    let counter = 2

    while (existingIds.has(id)) {
      id = `${baseId}-${counter}`
      counter += 1
    }

    const model = {
      id,
      name,
      category: newModelCategory.trim() || 'Internal / Prototype',
      url: '',
    }

    setCustomBatModels((current) => [model, ...current])
    setProducedBatDraft((current) => ({ ...current, modelId: model.id }))
    setNewModelName('')
    setNewModelCategory('Internal / Prototype')
    setShowNewModelForm(false)
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
            {backendStatus === 'connected' ? 'Shopify-backed internal tool' : 'Internal offline mode'}
          </strong>
          <p>{syncMessage}</p>
        </div>
      </section>

      {activeSection === 'inventory' ? (
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
                {draft.source === "RJ's Tree Farms"
                  ? " for RJ's billets only."
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
              <span>Available</span>
              <strong>{availableCount}</strong>
            </article>
            <article>
              <span>Reserved</span>
              <strong>{reservedCount}</strong>
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
                  <p className="empty-state">No available billets match this build yet.</p>
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
              <div className="filters">
                <input
                  aria-label="Search billets"
                  placeholder="Search barcode, source, location..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  aria-label="Filter by species"
                  value={speciesFilter}
                  onChange={(event) => setSpeciesFilter(event.target.value as 'all' | Species)}
                >
                  <option value="all">All species</option>
                  {speciesOptions.map((species) => (
                    <option value={species} key={species}>
                      {species}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | BilletStatus)}
                >
                  <option value="all">All statuses</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Barcode</th>
                    <th>Wood</th>
                    <th>Source</th>
                    <th>MLB</th>
                    <th>Barrel knot</th>
                    <th>Specs</th>
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
      ) : activeSection === 'players' ? (
        <section className="profiles-page">
          <section className="panel profile-entry-panel">
            <div className="section-heading">
              <p className="eyebrow">Add Player/Trainer</p>
              <h2>Store a bat profile</h2>
            </div>

            <form className="bat-form profile-entry-form" onSubmit={addProfileBat}>
              <div className="form-instructions">
                <strong>Enter a new Player or Trainer bat record</strong>
                <p>
                  Choose whether this is a Player or Trainer first, then add the model,
                  finished bat specs, wood tier, color notes, and any billets that can make it.
                  If the name already exists, this saves as another bat variation under that profile.
                </p>
              </div>

              <div className="form-row">
                <label>
                  Player or Trainer
                  <select
                    value={profileKindDraft}
                    onChange={(event) => setProfileKindDraft(event.target.value as ProfileKind)}
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
                    onChange={(event) => setPlayerNameDraft(event.target.value)}
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

              <button type="submit">Save Player/Trainer bat</button>
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
                      <span className="profile-count">{profile.bats.length} bats</span>
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

              <label>
                Model or one-off run name
                <div className="input-action-row">
                  <select
                    value={producedBatDraft.modelId}
                    onChange={(event) =>
                      setProducedBatDraft({ ...producedBatDraft, modelId: event.target.value })
                    }
                  >
                    {allBatModels.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.name} - {model.category}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowNewModelForm((current) => !current)}
                  >
                    Add new
                  </button>
                </div>
              </label>

              {showNewModelForm ? (
                <div className="nested-form">
                  <div className="form-row">
                    <label>
                      New model name
                      <input
                        value={newModelName}
                        placeholder="Example: MT7.2"
                        onChange={(event) => setNewModelName(event.target.value)}
                      />
                    </label>
                    <label>
                      Category
                      <input
                        value={newModelCategory}
                        placeholder="Example: One-Off Pro Run"
                        onChange={(event) => setNewModelCategory(event.target.value)}
                      />
                    </label>
                  </div>
                  <button type="button" onClick={addCustomBatModel}>
                    Add and select model
                  </button>
                </div>
              ) : null}

              <div className="form-row">
                <label>
                  Bat type
                  <select
                    value={producedBatDraft.batType}
                    onChange={(event) =>
                      setProducedBatDraft({
                        ...producedBatDraft,
                        batType: event.target.value as ProducedBatRecord['batType'],
                      })
                    }
                  >
                    {batTypeOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
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

              <div className="form-row">
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

              <fieldset className="billet-picker">
                <legend>Billet or billets used</legend>
                <div>
                  {billets.map((billet) => (
                    <label className="checkbox-row" key={billet.id}>
                      <input
                        type="checkbox"
                        checked={producedBatDraft.billetIds.includes(billet.id)}
                        onChange={() => toggleProducedBatBillet(billet.id)}
                      />
                      <span>{getBilletLabel(billet)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="notes-field">
                Modifications
                <textarea
                  value={producedBatDraft.modifications}
                  placeholder="Any knob, handle, barrel, balance, cup depth, finish, or one-off modification notes"
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

export default App
