import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import {
  canAssignCrmContactOwner,
  canUpdateOwnedRecord,
  createFixedWindowRateLimiter,
  enforcePublicDraftOrderPolicy,
  filterAdminOnlySalesRows,
  getAllowedOrderAttachmentContentType,
  getDerivedCrmContactDeleteIds,
  getSalesOrderBoundsError,
  isFreshShopifyLaunchTimestamp,
  isManualCrmContactRecord,
  isOrderJobLinkedToCrmContacts,
  isSalesPortalSessionCurrent,
  sanitizeOrderJobForTeamReporting,
} from './security-policy.mjs'
import {
  getKnownProPlayerAffiliation,
  normalizePlayerNameKey,
} from '../shared/pro-player-affiliations.mjs'
import {
  buildSalesLeaderboardFromSubmissions,
  buildSalesLeaderboardForWindow,
  buildTrailingSalesLeaderboard,
  buildUnifiedSalesSubmissions,
} from './team-leaderboard.mjs'
import {
  isAdminTeamMember,
  isSalesTeamMember,
  isTeamToolMember,
  trinityTeamMembers,
} from '../shared/team-directory.mjs'
import { billetSpeciesOptions as billetSpeciesValues } from '../shared/species-options.mjs'
import {
  billetSourceOptions as billetSourceValues,
  isOversizedBilletSource,
} from '../shared/source-options.mjs'
import {
  buildOrderPrinterProDraftPdfUrl,
  buildOrderPrinterProPdfFilename,
  createOrderPrinterProDraftPdfConfig,
  downloadOrderPrinterProPdfAttachment,
} from './order-printer-pro.mjs'
import { downloadUploadedOrderEmailAttachment } from './order-attachment-email.mjs'
import { formatOrderAttachmentUploadError } from './order-attachment-errors.mjs'
import {
  buildPaidOrderAttachmentNotification,
  createInternalAttachmentNotification,
  defaultPaidOrderAttachmentRecipient,
  normalizeInternalAttachmentNotifications,
  recordInternalAttachmentNotification,
} from './paid-order-attachment-notification.mjs'
import {
  allowsLocalInternalAccess,
  buildShopifySessionBounceLocation,
  hasEmbeddedShopifyContext,
  isInternalAppShellPath,
  renderAppShell,
  renderShopifySessionBounce,
  setShopifySessionRetryHeader,
  shopifySessionBouncePath,
  shouldRetryShopifySessionRequest,
  verifyShopifySessionToken,
} from './shopify-embedded-auth.mjs'
import {
  createTeamAccessPin,
  getTeamSessionTokenCandidates,
  isValidTeamAccessPin,
  teamAccessSessionHeaderName,
} from './team-access-pin.mjs'
import {
  needsSalesRepPlayerEmailProtection,
  protectSalesRepPlayerEmail,
} from './sales-order-contact-policy.mjs'
import {
  isBatProductLike,
  isSalesOrderCatalogProduct,
  isShirtProductLike,
} from './product-catalog-policy.mjs'
import {
  getSalesOrderProductionQuantity,
  normalizeSalesOrderItemType,
} from './sales-order-line-policy.mjs'
import {
  formatSalesOrderBatCount,
  getSalesOrderShippingQuote,
  normalizeSalesOrderShippingSpeed,
} from '../shared/sales-order-shipping-policy.mjs'
import {
  classifyPaidInvoiceSource,
  getSuccessfulPaymentTimestamp,
  isWebsiteOrderSource,
} from '../shared/sales-payment-reconciliation.mjs'
import {
  isTimestampInsideSalesDashboardWindow,
  resolveSalesDashboardWindow,
} from '../shared/sales-dashboard-window.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envPath =
  process.env.SHOPIFY_ENV_FILE ?? path.join(rootDir, '.env.shopify-custom-app.local')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const requiredEnv = ['SHOPIFY_SHOP', 'SHOPIFY_ADMIN_ACCESS_TOKEN']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing ${key}. Shopify sync endpoints will be unavailable.`)
  }
}

const app = express()
app.set('trust proxy', 1)
const port = Number(process.env.PORT ?? 4177)
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01'
const shopDomain = process.env.SHOPIFY_SHOP
const adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const shopifyApiKey = process.env.SHOPIFY_API_KEY ?? ''
const shopifyApiSecret = process.env.SHOPIFY_API_SECRET ?? process.env.SHOPIFY_WEBHOOK_SECRET ?? ''
const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? shopifyApiSecret
const shopCurrencyCode = process.env.SHOPIFY_CURRENCY_CODE ?? 'USD'
const draftInvoiceHost =
  normalizeHostname(process.env.TRINITY_DRAFT_INVOICE_HOST) || normalizeHostname(shopDomain)
const defaultShippingSpeed = 'standard'
const draftOrderShippingOptions = {
  standard: {
    key: 'standard',
    label: 'Standard',
    title:
      cleanString(
        process.env.TRINITY_DRAFT_SHIPPING_STANDARD_TITLE ??
          process.env.TRINITY_DRAFT_SHIPPING_TITLE,
      ) || 'Standard Shipping',
  },
  fast: {
    key: 'fast',
    label: 'Fast',
    title: cleanString(process.env.TRINITY_DRAFT_SHIPPING_FAST_TITLE) || 'Fast Shipping',
  },
  really_fast: {
    key: 'really_fast',
    label: 'Really fast',
    title:
      cleanString(process.env.TRINITY_DRAFT_SHIPPING_REALLY_FAST_TITLE) ||
      'Really Fast Shipping',
  },
  comped: {
    key: 'comped',
    label: 'Comped',
    title: cleanString(process.env.TRINITY_DRAFT_SHIPPING_COMPED_TITLE) || 'Comped Shipping',
  },
}
const rushProductionSurchargeTitle =
  cleanString(process.env.TRINITY_RUSH_PRODUCTION_TITLE) || 'Rush Production Surcharge'
const rushProductionSurchargeAmount = normalizePositiveMoneyAmount(
  process.env.TRINITY_RUSH_PRODUCTION_AMOUNT ?? '50.00',
)
const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID ?? ''
const ga4ApiSecret = process.env.GA4_API_SECRET ?? ''
const internalSessionCookieName = 'trinity_internal_session'
const internalSessionMaxAgeDays = 90
const internalSessionMaxAgeMs = internalSessionMaxAgeDays * 24 * 60 * 60 * 1000
const salesPortalSessionCookieName = 'trinity_sales_portal_session'
const salesPortalSessionMaxAgeDays = 30
const salesPortalSessionMaxAgeMs = salesPortalSessionMaxAgeDays * 24 * 60 * 60 * 1000
const salesPortalLoginCodeMaxAgeMs = 10 * 60 * 1000
const invoiceSendTokenMaxAgeMs = 24 * 60 * 60 * 1000
const orderAttachmentUploadTokenMaxAgeMs = 2 * 60 * 60 * 1000
const internalSessionSecret =
  process.env.TRINITY_INTERNAL_SESSION_SECRET ?? shopifyApiSecret ?? adminToken ?? ''
const standaloneInternalAccessQueryParam = 'access'
const embeddedAnalyticsCollectorEnabled =
  process.env.ENABLE_EMBEDDED_ANALYTICS_COLLECTOR === 'true'
const metaobjectsPageSize = readPositiveIntegerEnv('TRINITY_METAOBJECTS_PAGE_SIZE', 50)
const stateCacheTtlMs = 60 * 60 * 1000
const stateCacheStaleMaxAgeMs = 24 * 60 * 60 * 1000
const stateCacheFilePath =
  process.env.TRINITY_STATE_CACHE_PATH ?? path.join('/tmp', 'trinity-inventory-state-cache.json')
const catalogCacheTtlMs = 10 * 60 * 1000
const salesPaymentReconciliationCacheTtlMs = 5 * 60 * 1000
const shopifyGraphqlMaxAttempts = readPositiveIntegerEnv('TRINITY_SHOPIFY_GRAPHQL_MAX_ATTEMPTS', 20)
const maxOrderAttachmentBytes = 20 * 1024 * 1024
const orderAttachmentFileUrlMaxAttempts = readPositiveIntegerEnv(
  'TRINITY_ATTACHMENT_FILE_URL_MAX_ATTEMPTS',
  8,
)
const orderAttachmentFileUrlPollMs = readPositiveIntegerEnv(
  'TRINITY_ATTACHMENT_FILE_URL_POLL_MS',
  750,
)
const orderAttachmentTransportRateLimiter = createFixedWindowRateLimiter({
  max: 30,
  windowMs: 15 * 60 * 1000,
  message: 'Too many attachment uploads. Please wait before uploading another file.',
})
const publicOrderAttachmentRateLimiter = createFixedWindowRateLimiter({
  max: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many public attachment uploads. Please wait before trying again.',
})
const publicSalesOrderRateLimiter = createFixedWindowRateLimiter({
  max: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many public order submissions. Please wait before trying again.',
})
const salesPortalLoginRateLimiter = createFixedWindowRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
  message: 'Too many sign-in code requests. Please wait before requesting another code.',
})
const salesPortalVerifyRateLimiter = createFixedWindowRateLimiter({
  max: 20,
  windowMs: 15 * 60 * 1000,
  message: 'Too many sign-in attempts. Please wait and try again.',
})
const teamAccessPinRateLimiter = createFixedWindowRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: 'Too many PIN attempts. Please wait 15 minutes and try again.',
})
const billetDiameterWeightCorrectionOz = 1.75
const billetSourceOptions = new Set(billetSourceValues)
const billetSpeciesOptions = new Set(billetSpeciesValues)
const publicSalesOrderFormPaths = [
  '/order-submission',
  '/sales-order',
  '/trinity-order-form',
  '/trinity-order-from',
]
const salesPortalPaths = ['/sales-portal', '/sales-crm', '/team-tool']
const internalToolPaths = ['/', '/internal-tool', '/inventory-tool']
const publicStaticAssetPaths = [
  '/favicon.svg',
  '/icons.svg',
  '/site.webmanifest',
  '/sw.js',
  '/trinity-logo-cropped.png',
]
const defaultInternalOrderNotificationEmails = [
  'matt@trinitybats.com',
  'jeremy@trinitybats.com',
  'stefan@trinitybats.com',
  'keith@trinitybats.com',
]
const requiredInternalOrderNotificationEmails = defaultInternalOrderNotificationEmails
const internalOrderNotificationEmails = parseEmailList(
  process.env.TRINITY_ORDER_NOTIFICATION_EMAILS ??
    process.env.SHOPIFY_STAFF_NOTIFICATION_BCC ??
    '',
  defaultInternalOrderNotificationEmails,
  requiredInternalOrderNotificationEmails,
)
const teamToolTeamMembers = trinityTeamMembers.filter(isTeamToolMember).map((member) => ({
  ...member,
  label: member.name,
  key: member.key ?? member.email,
}))
const salesPortalTeamMembers = trinityTeamMembers.filter(isSalesTeamMember).map((member) => ({
  ...member,
  label: member.name,
  key: member.key ?? member.email,
}))
const teamToolTeamByEmail = new Map(
  teamToolTeamMembers.filter((member) => member.email).map((member) => [member.email, member]),
)
const salesPortalTeamByEmail = new Map(
  salesPortalTeamMembers.filter((member) => member.email).map((member) => [member.email, member]),
)
const salesPortalAdminEmails = new Set(
  trinityTeamMembers.filter(isAdminTeamMember).map((member) => member.email),
)
const salesPortalLoginCodes = new Map()
const internalEmailProviderApiKey =
  cleanString(process.env.TRINITY_RESEND_API_KEY) || cleanString(process.env.RESEND_API_KEY)
const internalEmailProviderUrl =
  cleanString(process.env.TRINITY_RESEND_API_URL) || 'https://api.resend.com/emails'
const internalEmailFrom =
  cleanString(process.env.TRINITY_INTERNAL_EMAIL_FROM) || cleanString(process.env.RESEND_FROM_EMAIL)
const internalEmailReplyTo = normalizeEmail(process.env.TRINITY_INTERNAL_EMAIL_REPLY_TO)
const orderPrinterProDraftPdfConfig = createOrderPrinterProDraftPdfConfig({
  origin: cleanString(process.env.TRINITY_ORDER_PRINTER_PDF_ORIGIN) || 'https://trinitybatco.com',
  pathToken:
    cleanString(process.env.TRINITY_ORDER_PRINTER_DRAFT_PATH_TOKEN) ||
    'd373b096caf265a4ab9f',
  idMultiplier:
    cleanString(process.env.TRINITY_ORDER_PRINTER_DRAFT_ID_MULTIPLIER) || '9689',
})
const orderPrinterProPdfMaxBytes = readPositiveIntegerEnv(
  'TRINITY_ORDER_PRINTER_PDF_MAX_BYTES',
  10 * 1024 * 1024,
)
const orderPrinterProPdfTimeoutMs = readPositiveIntegerEnv(
  'TRINITY_ORDER_PRINTER_PDF_TIMEOUT_MS',
  15_000,
)

const resourceConfigs = {
  billets: {
    type: '$app:trinity_billet',
    name: 'Trinity Billet',
    deleteMissing: false,
    labelFor(item) {
      return `${item.barcode || item.id} ${item.species || ''} ${item.grade || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('barcode', item.barcode),
        fieldValue('species', item.species),
        fieldValue('grade', item.grade),
        fieldValue(
          'suitability_categories_json',
          JSON.stringify(item.suitabilityCategories ?? []),
        ),
        fieldValue('trophy_eligible', toBooleanValue(item.trophyEligible)),
        fieldValue('mlb_eligible', toBooleanValue(item.mlbEligible)),
        fieldValue('has_barrel_knot', toLegacyBarrelKnotValue(item.hasBarrelKnot)),
        fieldValue('barrel_knot_status', item.hasBarrelKnot),
        fieldValue('source', item.source),
        fieldValue('delivery_date', item.deliveryDate),
        fieldValue('length', toNumericValue(item.length)),
        fieldValue('weight', item.weight === '' ? null : toNumericValue(item.weight)),
        fieldValue('moisture', toNumericValue(item.moisture)),
        fieldValue('status', item.status),
        fieldValue('notes', item.notes),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('barcode', 'Barcode', 'single_line_text_field'),
      definitionField('species', 'Species', 'single_line_text_field'),
      definitionField('grade', 'Grade', 'single_line_text_field'),
      definitionField('suitability_categories_json', 'Suitability Categories JSON', 'json'),
      definitionField('trophy_eligible', 'Trophy Eligible', 'boolean'),
      definitionField('mlb_eligible', 'MLB Eligible', 'boolean'),
      definitionField('has_barrel_knot', 'Barrel Knot', 'boolean'),
      definitionField('barrel_knot_status', 'Barrel Knot Status', 'single_line_text_field'),
      definitionField('source', 'Source', 'single_line_text_field'),
      definitionField('delivery_date', 'Delivery Date', 'single_line_text_field'),
      definitionField('length', 'Length', 'number_decimal'),
      definitionField('weight', 'Weight', 'number_decimal'),
      definitionField('moisture', 'Moisture', 'number_decimal'),
      definitionField('status', 'Status', 'single_line_text_field'),
      definitionField('notes', 'Notes', 'multi_line_text_field'),
    ],
  },
  players: {
    type: '$app:trinity_player_profile',
    name: 'Trinity Player Profile',
    deleteMissing: false,
    labelFor(item) {
      return `${item.profileKind || 'Profile'} ${item.playerName || item.id}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('profile_kind', item.profileKind),
        fieldValue('player_name', item.playerName),
        fieldValue('level_of_play', item.levelOfPlay),
        fieldValue('current_club', item.currentClub),
        fieldValue('mlb_organization', item.mlbOrganization),
        fieldValue('affiliation_verified_at', item.affiliationVerifiedAt),
        fieldValue('affiliation_note', item.affiliationNote),
        fieldValue('bats_json', JSON.stringify(item.bats ?? [])),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('profile_kind', 'Profile Kind', 'single_line_text_field'),
      definitionField('player_name', 'Pro Player Name', 'single_line_text_field'),
      definitionField('level_of_play', 'Level of Play', 'single_line_text_field'),
      definitionField('current_club', 'Current Club', 'single_line_text_field'),
      definitionField('mlb_organization', 'MLB Organization', 'single_line_text_field'),
      definitionField('affiliation_verified_at', 'Affiliation Verified At', 'single_line_text_field'),
      definitionField('affiliation_note', 'Affiliation Note', 'multi_line_text_field'),
      definitionField('bats_json', 'Bats JSON', 'json'),
    ],
  },
  producedBats: {
    type: '$app:trinity_produced_bat',
    name: 'Trinity Produced Bat',
    deleteMissing: false,
    labelFor(item) {
      return `${item.modelId || item.id} ${item.length || ''} ${item.weight || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('model_id', item.modelId),
        fieldValue('bat_type', item.batType),
        fieldValue('custom_model_name', item.customModelName),
        fieldValue('source_model_id', item.sourceModelId),
        fieldValue('shopify_product_id', item.shopifyProductId),
        fieldValue('shopify_variant_id', item.shopifyVariantId),
        fieldValue('length', item.length),
        fieldValue('weight', item.weight),
        fieldValue('billet_weight', item.billetWeight),
        fieldValue('billet_weight_min', item.billetWeightMin),
        fieldValue('billet_weight_max', item.billetWeightMax),
        fieldValue('billet_grade', item.billetGrade),
        fieldValue('cupped', item.cupped),
        fieldValue('modifications', item.modifications),
        fieldValue('created_at', item.createdAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('model_id', 'Model ID', 'single_line_text_field'),
      definitionField('bat_type', 'Bat Type', 'single_line_text_field'),
      definitionField('custom_model_name', 'Custom Model Name', 'single_line_text_field'),
      definitionField('source_model_id', 'Source Model ID', 'single_line_text_field'),
      definitionField('shopify_product_id', 'Shopify Product ID', 'single_line_text_field'),
      definitionField('shopify_variant_id', 'Shopify Variant ID', 'single_line_text_field'),
      definitionField('length', 'Length', 'single_line_text_field'),
      definitionField('weight', 'Weight', 'single_line_text_field'),
      definitionField('billet_weight', 'Billet Weight', 'single_line_text_field'),
      definitionField('billet_weight_min', 'Billet Weight Minimum', 'single_line_text_field'),
      definitionField('billet_weight_max', 'Billet Weight Maximum', 'single_line_text_field'),
      definitionField('billet_grade', 'Billet Grade', 'single_line_text_field'),
      definitionField('cupped', 'Cupped', 'single_line_text_field'),
      definitionField('modifications', 'Modifications', 'multi_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
    ],
  },
  orderJobs: {
    type: '$app:trinity_order_job',
    name: 'Trinity Order Job',
    deleteMissing: false,
    // Shopify's existing order-job definition already uses all 40 fields.
    // playerProfileId remains in the canonical payload JSON instead of a direct field.
    labelFor(item) {
      return `${item.shopifyOrderName || item.shopifyDraftOrderName || item.id} ${
        item.productTitle || ''
      }`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('origin', item.origin),
        fieldValue('shopify_order_id', item.shopifyOrderId),
        fieldValue('shopify_order_name', item.shopifyOrderName),
        fieldValue('shopify_draft_order_id', item.shopifyDraftOrderId),
        fieldValue('shopify_draft_order_name', item.shopifyDraftOrderName),
        fieldValue('shopify_draft_invoice_url', item.shopifyDraftInvoiceUrl),
        fieldValue('line_item_id', item.lineItemId),
        fieldValue('order_submitted_at', item.orderSubmittedAt),
        fieldValue('customer_name', item.customerName),
        fieldValue('customer_email', item.customerEmail),
        fieldValue('player_name', item.playerName),
        fieldValue('player_email', item.playerEmail),
        fieldValue('billing_different', item.billingDifferent ? 'true' : ''),
        fieldValue('billing_name', item.billingName),
        fieldValue('billing_email', item.billingEmail),
        fieldValue('billing_phone', item.billingPhone),
        fieldValue('billing_company', item.billingCompany),
        fieldValue('billing_relationship', item.billingRelationship),
        fieldValue('product_title', item.productTitle),
        fieldValue('variant_title', item.variantTitle),
        fieldValue('quantity', item.quantity),
        fieldValue('financial_status', item.financialStatus),
        fieldValue('fulfillment_status', item.fulfillmentStatus),
        fieldValue('invoice_status', item.invoiceStatus),
        fieldValue('production_status', item.productionStatus),
        fieldValue('assigned_billet_id', item.assignedBilletId),
        fieldValue('sales_rep', item.salesRep),
        fieldValue('sales_rep_email', item.salesRepEmail),
        fieldValue(
          'sales_rep_submission_notification_sent_at',
          item.salesRepSubmissionNotificationSentAt,
        ),
        fieldValue('sales_rep_paid_notification_sent_at', item.salesRepPaidNotificationSentAt),
        fieldValue('total_price', item.totalPrice),
        fieldValue('specs_json', JSON.stringify(item.specs ?? {})),
        fieldValue('line_items_json', JSON.stringify(item.lineItems ?? [])),
        fieldValue('internal_attachment_json', JSON.stringify(item.internalAttachment ?? null)),
        fieldValue('internal_notes', item.internalNotes),
        fieldValue('created_at', item.createdAt),
        fieldValue('updated_at', item.updatedAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('origin', 'Origin', 'single_line_text_field'),
      definitionField('shopify_order_id', 'Shopify Order ID', 'single_line_text_field'),
      definitionField('shopify_order_name', 'Shopify Order Name', 'single_line_text_field'),
      definitionField('shopify_draft_order_id', 'Shopify Draft Order ID', 'single_line_text_field'),
      definitionField('shopify_draft_order_name', 'Shopify Draft Order Name', 'single_line_text_field'),
      definitionField(
        'shopify_draft_invoice_url',
        'Shopify Draft Invoice URL',
        'single_line_text_field',
      ),
      definitionField('line_item_id', 'Line Item ID', 'single_line_text_field'),
      definitionField('order_submitted_at', 'Order Submitted At', 'single_line_text_field'),
      definitionField('customer_name', 'Customer Name', 'single_line_text_field'),
      definitionField('customer_email', 'Customer Email', 'single_line_text_field'),
      definitionField('player_name', 'Player Name', 'single_line_text_field'),
      definitionField('player_email', 'Player Email', 'single_line_text_field'),
      definitionField('billing_different', 'Billing Different', 'single_line_text_field'),
      definitionField('billing_name', 'Billing Name', 'single_line_text_field'),
      definitionField('billing_email', 'Billing Email', 'single_line_text_field'),
      definitionField('billing_phone', 'Billing Phone', 'single_line_text_field'),
      definitionField('billing_company', 'Billing Company', 'single_line_text_field'),
      definitionField('billing_relationship', 'Billing Relationship', 'single_line_text_field'),
      definitionField('product_title', 'Product Title', 'single_line_text_field'),
      definitionField('variant_title', 'Variant Title', 'single_line_text_field'),
      definitionField('quantity', 'Quantity', 'number_integer'),
      definitionField('financial_status', 'Financial Status', 'single_line_text_field'),
      definitionField('fulfillment_status', 'Fulfillment Status', 'single_line_text_field'),
      definitionField('invoice_status', 'Invoice Status', 'single_line_text_field'),
      definitionField('production_status', 'Production Status', 'single_line_text_field'),
      definitionField('assigned_billet_id', 'Assigned Billet ID', 'single_line_text_field'),
      definitionField('sales_rep', 'Sales Rep', 'single_line_text_field'),
      definitionField('sales_rep_email', 'Sales Rep Email', 'single_line_text_field'),
      definitionField(
        'sales_rep_submission_notification_sent_at',
        'Sales Rep Submission Notification Sent At',
        'single_line_text_field',
      ),
      definitionField(
        'sales_rep_paid_notification_sent_at',
        'Sales Rep Paid Notification Sent At',
        'single_line_text_field',
      ),
      definitionField('total_price', 'Total Price', 'single_line_text_field'),
      definitionField('specs_json', 'Specs JSON', 'json'),
      definitionField('line_items_json', 'Line Items JSON', 'json'),
      definitionField('internal_attachment_json', 'Internal Attachment JSON', 'json'),
      definitionField('internal_notes', 'Internal Notes', 'multi_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
    ],
  },
  customBatModels: {
    type: '$app:trinity_bat_model',
    name: 'Trinity Bat Model',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.id}`.trim()
    },
    fieldsFor(item) {
      const compatibility = item.compatibility ?? {}
      const weightRange = compatibility.billetWeightRange ?? {}
      const species =
        compatibility.species === 'Any'
          ? 'Any'
          : Array.isArray(compatibility.species)
            ? compatibility.species.join(', ')
            : ''

      return [
        fieldValue('name', item.name),
        fieldValue('category', item.category),
        fieldValue('url', item.url),
        fieldValue('billet_weight_min_oz', weightRange.minOz),
        fieldValue('billet_weight_max_oz', weightRange.maxOz),
        fieldValue('species', species),
        fieldValue(
          'species_dependent',
          typeof compatibility.speciesDependent === 'boolean'
            ? compatibility.speciesDependent
              ? 'true'
              : 'false'
            : '',
        ),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('category', 'Category', 'single_line_text_field'),
      definitionField('url', 'URL', 'single_line_text_field'),
      definitionField('billet_weight_min_oz', 'Billet Weight Minimum Oz', 'number_decimal'),
      definitionField('billet_weight_max_oz', 'Billet Weight Maximum Oz', 'number_decimal'),
      definitionField('species', 'Species', 'single_line_text_field'),
      definitionField('species_dependent', 'Species Dependent', 'boolean'),
    ],
  },
  billingContacts: {
    type: '$app:trinity_billing_contact',
    name: 'Trinity Billing Contact',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.id} ${item.company || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('name', item.name),
        fieldValue('email', item.email),
        fieldValue('phone', item.phone),
        fieldValue('company', item.company),
        fieldValue('relationship', item.relationship),
        fieldValue('notes', item.notes),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('email', 'Email', 'single_line_text_field'),
      definitionField('phone', 'Phone', 'single_line_text_field'),
      definitionField('company', 'Company', 'single_line_text_field'),
      definitionField('relationship', 'Relationship', 'single_line_text_field'),
      definitionField('notes', 'Notes', 'multi_line_text_field'),
    ],
  },
  crmContacts: {
    type: '$app:trinity_crm_contact',
    name: 'Trinity CRM Contact',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.company || item.email || item.phone || item.id}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('name', item.name),
        fieldValue('company', item.company),
        fieldValue('role', item.role),
        fieldValue('email', item.email),
        fieldValue('phone', item.phone),
        fieldValue('player_names_json', JSON.stringify(item.playerNames ?? [])),
        fieldValue('sales_owner', item.salesOwner),
        fieldValue('owner_email', item.ownerEmail),
        fieldValue('stage', item.stage),
        fieldValue('priority', item.priority),
        fieldValue('source', item.source),
        fieldValue('preferred_contact_method', item.preferredContactMethod),
        fieldValue('personal_notes', item.personalNotes),
        fieldValue('follow_up_at', item.followUpAt),
        fieldValue('last_contacted_at', item.lastContactedAt),
        fieldValue('created_at', item.createdAt),
        fieldValue('updated_at', item.updatedAt),
        fieldValue('touchpoints_json', JSON.stringify(item.touchpoints ?? [])),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('company', 'Company', 'single_line_text_field'),
      definitionField('role', 'Role', 'single_line_text_field'),
      definitionField('email', 'Email', 'single_line_text_field'),
      definitionField('phone', 'Phone', 'single_line_text_field'),
      definitionField('player_names_json', 'Player Names JSON', 'json'),
      definitionField('sales_owner', 'Sales Owner', 'single_line_text_field'),
      definitionField('owner_email', 'Owner Email', 'single_line_text_field'),
      definitionField('stage', 'Stage', 'single_line_text_field'),
      definitionField('priority', 'Priority', 'single_line_text_field'),
      definitionField('source', 'Source', 'single_line_text_field'),
      definitionField('preferred_contact_method', 'Preferred Contact Method', 'single_line_text_field'),
      definitionField('personal_notes', 'Personal Notes', 'multi_line_text_field'),
      definitionField('follow_up_at', 'Follow Up At', 'single_line_text_field'),
      definitionField('last_contacted_at', 'Last Contacted At', 'single_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
      definitionField('touchpoints_json', 'Touchpoints JSON', 'json'),
    ],
  },
  salesPortalUsers: {
    type: '$app:trinity_sales_portal_user',
    name: 'Trinity Sales Portal User',
    deleteMissing: false,
    labelFor(item) {
      return `${item.name || item.email || item.id}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('email', item.email),
        fieldValue('name', item.name),
        fieldValue('role', item.role),
        fieldValue('status', item.status),
        fieldValue('access_code_hash', item.accessCodeHash),
        fieldValue('access_code_rotated_at', item.accessCodeRotatedAt),
        fieldValue('last_login_at', item.lastLoginAt),
        fieldValue('created_at', item.createdAt),
        fieldValue('updated_at', item.updatedAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('email', 'Email', 'single_line_text_field'),
      definitionField('name', 'Name', 'single_line_text_field'),
      definitionField('role', 'Role', 'single_line_text_field'),
      definitionField('status', 'Status', 'single_line_text_field'),
      definitionField('access_code_hash', 'Access Code Hash', 'single_line_text_field'),
      definitionField('access_code_rotated_at', 'Access Code Rotated At', 'single_line_text_field'),
      definitionField('last_login_at', 'Last Login At', 'single_line_text_field'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
    ],
  },
  customerSessions: {
    type: '$app:trinity_customer_session',
    name: 'Trinity Customer Session',
    deleteMissing: false,
    labelFor(item) {
      return `${item.sessionId || item.id} ${item.lastEventName || ''}`.trim()
    },
    fieldsFor(item) {
      return [
        fieldValue('session_id', item.sessionId),
        fieldValue('visitor_id', item.visitorId),
        fieldValue('first_source', item.firstSource),
        fieldValue('first_medium', item.firstMedium),
        fieldValue('first_campaign', item.firstCampaign),
        fieldValue('first_content', item.firstContent),
        fieldValue('first_term', item.firstTerm),
        fieldValue('first_landing_page', item.firstLandingPage),
        fieldValue('first_referrer', item.firstReferrer),
        fieldValue('last_source', item.lastSource),
        fieldValue('last_medium', item.lastMedium),
        fieldValue('last_campaign', item.lastCampaign),
        fieldValue('last_content', item.lastContent),
        fieldValue('last_term', item.lastTerm),
        fieldValue('last_landing_page', item.lastLandingPage),
        fieldValue('last_referrer', item.lastReferrer),
        fieldValue('device', item.device),
        fieldValue('last_event_name', item.lastEventName),
        fieldValue('last_event_at', item.lastEventAt),
        fieldValue('order_id', item.orderId),
        fieldValue('order_name', item.orderName),
        fieldValue('customer_email_hash', item.customerEmailHash),
        fieldValue('events_json', JSON.stringify(item.events ?? [])),
        fieldValue('created_at', item.createdAt),
        fieldValue('updated_at', item.updatedAt),
      ].filter(Boolean)
    },
    fieldDefinitions: [
      definitionField('session_id', 'Session ID', 'single_line_text_field'),
      definitionField('visitor_id', 'Visitor ID', 'single_line_text_field'),
      definitionField('first_source', 'First Source', 'single_line_text_field'),
      definitionField('first_medium', 'First Medium', 'single_line_text_field'),
      definitionField('first_campaign', 'First Campaign', 'single_line_text_field'),
      definitionField('first_content', 'First Content', 'single_line_text_field'),
      definitionField('first_term', 'First Term', 'single_line_text_field'),
      definitionField('first_landing_page', 'First Landing Page', 'single_line_text_field'),
      definitionField('first_referrer', 'First Referrer', 'single_line_text_field'),
      definitionField('last_source', 'Last Source', 'single_line_text_field'),
      definitionField('last_medium', 'Last Medium', 'single_line_text_field'),
      definitionField('last_campaign', 'Last Campaign', 'single_line_text_field'),
      definitionField('last_content', 'Last Content', 'single_line_text_field'),
      definitionField('last_term', 'Last Term', 'single_line_text_field'),
      definitionField('last_landing_page', 'Last Landing Page', 'single_line_text_field'),
      definitionField('last_referrer', 'Last Referrer', 'single_line_text_field'),
      definitionField('device', 'Device', 'single_line_text_field'),
      definitionField('last_event_name', 'Last Event Name', 'single_line_text_field'),
      definitionField('last_event_at', 'Last Event At', 'single_line_text_field'),
      definitionField('order_id', 'Order ID', 'single_line_text_field'),
      definitionField('order_name', 'Order Name', 'single_line_text_field'),
      definitionField('customer_email_hash', 'Customer Email Hash', 'single_line_text_field'),
      definitionField('events_json', 'Events JSON', 'json'),
      definitionField('created_at', 'Created At', 'single_line_text_field'),
      definitionField('updated_at', 'Updated At', 'single_line_text_field'),
    ],
  },
}

let definitionPromise = null
let stateCacheValue = null
let stateCacheExpiresAt = 0
let stateCachePromise = null
let catalogCacheValue = null
let catalogCacheExpiresAt = 0
let catalogCachePromise = null
const salesPaymentReconciliationCache = new Map()
const salesPaymentReconciliationPromises = new Map()
let stateWriteQueue = Promise.resolve()

app.post('/api/webhooks/orders', express.raw({ type: 'application/json' }), async (request, response) => {
  try {
    if (!verifyShopifyWebhook(request)) {
      response.status(401).send('Invalid webhook signature')
      return
    }

    if (!shopDomain || !adminToken) {
      response.status(503).send('Shopify credentials are not configured')
      return
    }

    const topic = String(request.get('x-shopify-topic') ?? '')
    const shopifyEventId = String(request.get('x-shopify-event-id') ?? '')
    const shopifyWebhookId = String(request.get('x-shopify-webhook-id') ?? '')
    const payload = JSON.parse(request.body.toString('utf8'))
    const mappedIncomingJobs = mapOrderWebhookToJobs(payload, topic)
    let paidAttachmentNotification = null

    if (mappedIncomingJobs.length > 0) {
      await ensureDefinitions()
      const incomingJobs = await attachOrderJobsToPlayerProfiles(mappedIncomingJobs)
      const existingJobs = await listRecords(resourceConfigs.orderJobs)
      let mergedJobs = mergeIncomingOrderJobs(existingJobs, incomingJobs)
      paidAttachmentNotification = buildPaidOrderAttachmentNotification({
        topic,
        order: payload,
        jobs: mergedJobs,
        recipient: defaultPaidOrderAttachmentRecipient,
        shopifyEventId,
        shopifyWebhookId,
      })

      if (paidAttachmentNotification) {
        mergedJobs = recordInternalAttachmentNotification(
          mergedJobs,
          paidAttachmentNotification.tracking,
        )
      }

      await Promise.all([
        Promise.all(mergedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
        rememberOrderJobContacts(mergedJobs),
      ])
      await syncOrderJobMetafields(mergedJobs)
      invalidateSalesPaymentReconciliationCache()
    }

    response.status(200).json({
      ok: true,
      jobs: mappedIncomingJobs.length,
      paidAttachmentNotificationQueued: Boolean(paidAttachmentNotification),
      paidAttachmentNotificationRecipient: paidAttachmentNotification?.recipient ?? '',
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify webhook error.',
    })
  }
})

app.use(establishInternalSession)

app.get(shopifySessionBouncePath, (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.type('html').send(renderShopifySessionBounce(shopifyApiKey))
})

app.post(
  '/api/order-attachments',
  orderAttachmentTransportRateLimiter,
  express.raw({ type: '*/*', limit: maxOrderAttachmentBytes }),
  async (request, response) => {
    try {
      if (!shopDomain || !adminToken) {
        response.status(503).json({
          ok: false,
          message: 'Shopify credentials are not configured on this server.',
        })
        return
      }

      const fileBuffer = Buffer.isBuffer(request.body) ? request.body : Buffer.from([])
      if (fileBuffer.length === 0) {
        response.status(400).json({ ok: false, message: 'Attachment file is required.' })
        return
      }
      if (fileBuffer.length > maxOrderAttachmentBytes) {
        response.status(413).json({ ok: false, message: 'Attachment must be 20 MB or smaller.' })
        return
      }

      const isAuthenticatedOperator = await hasAuthenticatedSalesOrderAccess(request)
      if (
        !isAuthenticatedOperator &&
        !applyRateLimit(publicOrderAttachmentRateLimiter, request, response)
      ) {
        return
      }

      const filename = decodeAttachmentHeader(request.get('x-trinity-attachment-name'))
      const declaredContentType =
        cleanString(request.get('x-trinity-attachment-type')) || cleanString(request.get('content-type'))
      const contentType = getAllowedOrderAttachmentContentType(filename, declaredContentType)
      if (!filename || !contentType) {
        response.status(415).json({
          ok: false,
          message:
            'Attachment type is not allowed. Use PDF, JPG, PNG, WEBP, HEIC, TXT, CSV, Word, or Excel.',
        })
        return
      }
      const attachment = await uploadOrderAttachmentToShopifyFiles({
        filename,
        contentType,
        buffer: fileBuffer,
      })

      response.json({
        ok: true,
        attachment: {
          ...attachment,
          uploadToken: createOrderAttachmentUploadToken(attachment),
        },
      })
    } catch (error) {
      const failure = formatOrderAttachmentUploadError(error)
      console.error(`Order attachment upload failed: ${failure.internalMessage}`)
      response.status(failure.status).json({
        ok: false,
        message: failure.message,
      })
    }
  },
)

app.use(express.json({ limit: '5mb' }))

app.options('/api/analytics/events', (request, response) => {
  setAnalyticsCorsHeaders(response)
  response.status(204).send()
})

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: Boolean(shopDomain && adminToken),
    service: 'trinity-billet-inventory',
    shop: shopDomain ?? null,
    apiVersion,
    analytics: {
      embeddedCollector: embeddedAnalyticsCollectorEnabled,
      ga4Forwarding: Boolean(ga4MeasurementId && ga4ApiSecret),
    },
  })
})

app.get('/api/sales-portal/session', async (request, response) => {
  try {
    const session = await getValidatedSalesPortalSession(request)
    response.set('Cache-Control', 'no-store')

    if (!session) {
      response.status(401).json({ ok: false, message: 'Sales portal sign-in required.' })
      return
    }

    response.json({ ok: true, session })
  } catch (error) {
    response.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not validate the sales portal session.',
    })
  }
})

app.post('/api/sales-portal/login-code', salesPortalLoginRateLimiter, async (request, response) => {
  try {
    const email = normalizeSalesPortalEmail(request.body?.email)
    const owner = getTeamToolMemberForEmail(email)
    if (!email || !owner) {
      response.status(400).json({
        ok: false,
        message: 'Use an approved Trinity team email address.',
      })
      return
    }

    const activeUser = await getOrCreateActiveSalesPortalUser(email)
    if (!activeUser) {
      response.status(400).json({
        ok: false,
        message: 'Use an active Trinity team account.',
      })
      return
    }

    const { code } = createSalesPortalLoginCodeEntry(email)

    let devCode = ''
    if (internalEmailProviderApiKey && internalEmailFrom) {
      await sendSalesPortalLoginCodeEmail(email, code)
    } else if (isLocalRequest(request)) {
      devCode = code
    } else {
      response.status(503).json({
        ok: false,
        message:
          'Sales portal email delivery is not configured yet. Enter your access code or ask an admin to create one.',
      })
      return
    }

    response.json({
      ok: true,
      email,
      message: `A sign-in code was sent to ${email}.`,
      ...(devCode ? { devCode } : {}),
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not send the sales portal code.',
    })
  }
})

app.post('/api/sales-portal/admin-login-code', requireSalesPortalAdminOrInternalAccess, async (request, response) => {
  try {
    const email = normalizeSalesPortalEmail(request.body?.email)
    const owner = getTeamToolMemberForEmail(email)
    if (!email || !owner) {
      response.status(400).json({
        ok: false,
        message: 'Choose an approved Trinity team member.',
      })
      return
    }

    const { accessCode, user } = await issueSalesPortalAccessCode(email)
    response.json({
      ok: true,
      email,
      loginCode: accessCode,
      accessCode,
      user: publicSalesPortalUser(user),
      message: `Four-digit PIN created for ${owner.label}.`,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not create a team PIN.',
    })
  }
})

app.post('/api/sales-portal/verify-code', salesPortalVerifyRateLimiter, async (request, response) => {
  const email = normalizeSalesPortalEmail(request.body?.email)
  const rawCode = cleanString(request.body?.code)
  const code = rawCode.replace(/\D/g, '')
  const owner = getTeamToolMemberForEmail(email)
  const savedCode = salesPortalLoginCodes.get(email)

  if (!email || !owner || !rawCode) {
    response.status(400).json({ ok: false, message: 'Enter your Trinity email and access code.' })
    return
  }

  let verified = false
  let verifiedUser = null
  if (savedCode) {
    if (savedCode.expiresAt < Date.now()) {
      salesPortalLoginCodes.delete(email)
    } else if (savedCode.attempts >= 5) {
      salesPortalLoginCodes.delete(email)
      response.status(400).json({ ok: false, message: 'Too many attempts. Request a fresh code.' })
      return
    } else {
      savedCode.attempts += 1
      verified = safeEqual(savedCode.codeHash, hashSalesPortalLoginCode(email, code), 'utf8')
      if (verified) salesPortalLoginCodes.delete(email)
    }
  }

  try {
    if (verified) {
      verifiedUser = await getOrCreateActiveSalesPortalUser(email)
      verified = Boolean(verifiedUser)
    } else {
      verifiedUser = await verifySalesPortalAccessCode(email, rawCode)
      verified = Boolean(verifiedUser)
    }
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not verify the access code.',
    })
    return
  }

  if (!verified) {
    response.status(400).json({ ok: false, message: 'That access code did not match.' })
    return
  }

  const token = createSalesPortalSessionToken(email)
  const session = buildSalesPortalSession(email)
  if (!token || !session) {
    response.status(500).json({ ok: false, message: 'Could not create a sales portal session.' })
    return
  }

  void recordSalesPortalLogin(email)
  response.cookie(salesPortalSessionCookieName, token, getSalesPortalCookieOptions(request))
  response.json({ ok: true, session, sessionToken: token })
})

app.post('/api/team-access/pin', teamAccessPinRateLimiter, async (request, response) => {
  const pin = cleanString(request.body?.pin)
  if (!isValidTeamAccessPin(pin)) {
    response.status(400).json({ ok: false, message: 'Enter your four-digit Trinity PIN.' })
    return
  }

  try {
    const verifiedUser = await verifySalesPortalPin(pin)
    const email = normalizeSalesPortalEmail(verifiedUser?.email)
    const session = email ? buildSalesPortalSession(email) : null
    const token = email ? createSalesPortalSessionToken(email) : ''

    if (!verifiedUser || !session || !token) {
      response.status(400).json({ ok: false, message: 'That PIN did not match.' })
      return
    }

    void recordSalesPortalLogin(email)
    response.cookie(salesPortalSessionCookieName, token, getSalesPortalCookieOptions(request))
    response.set('Cache-Control', 'no-store')
    response.json({ ok: true, session, sessionToken: token })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not verify the PIN.',
    })
  }
})

app.post('/api/sales-portal/logout', (_request, response) => {
  response.clearCookie(salesPortalSessionCookieName, { path: '/' })
  response.json({ ok: true })
})

app.get('/api/sales-portal/state', requireSalesPortalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    response.set('Cache-Control', 'no-store')
    const state = await getSharedState()
    response.json(filterSalesPortalStateForSession(state, request.salesPortalSession))
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown sales portal state error.',
    })
  }
})

app.patch('/api/sales-portal/state', requireSalesPortalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const requestedContacts = arrayFromPayload(request.body?.crmContacts)
    const existingContacts = await listRecords(resourceConfigs.crmContacts)
    const existingContactsById = new Map(
      existingContacts
        .map((contact) => [cleanString(contact?.id), contact])
        .filter(([id]) => Boolean(id)),
    )

    if (!request.salesPortalSession?.isAdmin) {
      const sessionOwner = getSalesPortalOwnerForEmail(request.salesPortalSession?.email)
      const unauthorizedContact = requestedContacts.find((contact) => {
        const existingContact = existingContactsById.get(cleanString(contact?.id))
        return (
          existingContact &&
          (!isManualCrmContactRecord(existingContact) ||
            !canUpdateOwnedRecord({
              isAdmin: false,
              existingOwnerKey: getSalesPortalOwnerKey(
                existingContact?.salesOwner,
                existingContact?.ownerEmail,
              ),
              sessionOwnerKey: sessionOwner?.key,
            }))
        )
      })
      if (unauthorizedContact) {
        response.status(403).json({
          ok: false,
          message: 'Sales team members can only update CRM contacts assigned to them.',
        })
        return
      }
    }

    const crmContacts = requestedContacts
      .map((contact) =>
        prepareSalesPortalCrmContactForSession(
          contact,
          request.salesPortalSession,
          existingContactsById.get(cleanString(contact?.id)),
        ),
      )
      .filter(Boolean)
    const result = await enqueueStateWrite(() => applyStatePatch({ crmContacts }))

    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown sales portal save error.',
    })
  }
})

app.get('/api/team-tool/state', requireSalesPortalAccess, async (request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const state = await getSharedState()
    response.json(filterFullToolStateForSession(state, request.salesPortalSession))
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown team tool state error.',
    })
  }
})

app.get(
  '/api/sales-dashboard/payment-reconciliation',
  requireSalesDashboardAccess,
  async (request, response) => {
    try {
      if (!shopDomain || !adminToken) {
        response.status(503).json({
          ok: false,
          message: 'Shopify credentials are not configured on this server.',
        })
        return
      }

      response.set('Cache-Control', 'no-store')
      const requestedWindow = resolveSalesDashboardWindow({
        range: getQueryParam(request, 'range') || '30',
        since: getQueryParam(request, 'since'),
        through: getQueryParam(request, 'through'),
      })
      const report = await getSalesPaymentReconciliation(requestedWindow)
      response.json({
        ...report,
        orders: filterSalesPaymentsForSession(report.orders, request.salesPortalSession),
        websiteOrders: filterWebsiteOrdersForSession(
          report.websiteOrders,
          request.salesPortalSession,
        ),
      })
    } catch (error) {
      response.status(error instanceof RangeError ? 400 : 500).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown sales payment reconciliation error.',
      })
    }
  },
)

app.patch('/api/team-tool/state', requireSalesPortalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const prepared = await prepareFullToolStatePatchForSession(
      request.body ?? {},
      request.salesPortalSession,
    )
    if (prepared.error) {
      response.status(403).json({ ok: false, message: prepared.error })
      return
    }

    const result = await enqueueStateWrite(() => applyStatePatch(prepared.patch))
    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      mode: 'team-delta',
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown team tool save error.',
    })
  }
})

app.post('/api/analytics/events', async (request, response) => {
  setAnalyticsCorsHeaders(response)

  try {
    if (!embeddedAnalyticsCollectorEnabled) {
      response.status(404).json({
        ok: false,
        message: 'Analytics collection is handled by the separate Trinity analytics service.',
      })
      return
    }

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const incomingEvents = Array.isArray(request.body?.events)
      ? request.body.events
      : [request.body].filter(Boolean)
    const acceptedEvents = incomingEvents
      .map((event) => normalizeAnalyticsEvent(event, request))
      .filter(Boolean)

    if (acceptedEvents.length === 0) {
      response.status(400).json({ ok: false, message: 'No valid analytics events supplied.' })
      return
    }

    await ensureDefinitions()
    const sessions = new Map()
    const orderAttributionUpdates = []
    const ga4Results = []

    for (const event of acceptedEvents) {
      const session = await upsertCustomerSessionFromEvent(event, sessions)
      sessions.set(session.sessionId, session)

      const orderId = resolveOrderIdFromAnalyticsEvent(event)
      if (orderId) {
        orderAttributionUpdates.push(syncOrderAttributionMetafields(orderId, session, event))
      }

      ga4Results.push(forwardAnalyticsEventToGa4(event, session))
    }

    const attributionResults = await Promise.allSettled(orderAttributionUpdates)
    const ga4SettledResults = await Promise.allSettled(ga4Results)
    const failedAttributionUpdates = attributionResults.filter((item) => item.status === 'rejected')
    const failedGa4Events = ga4SettledResults.filter((item) => item.status === 'rejected')
    const forwardedGa4Events = ga4SettledResults.filter(
      (item) => item.status === 'fulfilled' && item.value?.ok,
    ).length

    response.json({
      ok: true,
      accepted: acceptedEvents.length,
      sessionsUpdated: sessions.size,
      orderAttributionUpdated: attributionResults.length - failedAttributionUpdates.length,
      ga4Forwarded: forwardedGa4Events,
      ga4Configured: Boolean(ga4MeasurementId && ga4ApiSecret),
      warnings: failedAttributionUpdates.concat(failedGa4Events).map((item) =>
        item.reason instanceof Error ? item.reason.message : String(item.reason),
      ),
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown analytics collector error.',
    })
  }
})

app.get('/api/internal-session', requireInternalAccess, (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.json({ ok: true })
})

app.get('/api/state', requireInternalAccess, async (_request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    response.json(await getSharedState())
  } catch (error) {
    const fallback = getStateCacheFallback()
    if (fallback) {
      response.set('X-Trinity-State-Cache', 'stale-fallback')
      response.json(fallback)
      return
    }

    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
    })
  }
})

app.get('/api/billets/game-model-matches', requireSalesPortalAdminOrInternalAccess, async (request, response) => {
  try {
    response.set('Cache-Control', 'no-store')

    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const source = cleanString(request.query?.source)
    const species = cleanString(request.query?.species)
    const idealBilletWeight = cleanString(request.query?.idealBilletWeight)
    const state = await getSharedState()
    const billets = getGameModelBilletMatches(state.billets, {
      source,
      species,
      idealBilletWeight,
    })

    response.json({
      ok: true,
      source,
      species,
      idealBilletWeight,
      toleranceOz: 0.5,
      diameterCorrectionOz: billetDiameterWeightCorrectionOz,
      count: billets.length,
      billets,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message:
        error instanceof Error ? error.message : 'Unknown game model billet match error.',
    })
  }
})

app.get('/api/catalog', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const { products, cacheStatus } =
      cleanString(request.query.scope) === 'sales-order'
        ? await getSalesOrderCatalogProducts()
        : await getCatalogProducts()
    response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
    response.set('X-Trinity-Catalog-Cache', cacheStatus)
    response.json({ ok: true, products })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify catalog error.',
    })
  }
})

app.get(['/ai/shoply-bat-knowledge.md', '/api/shoply-bat-knowledge.md'], (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.set('X-Robots-Tag', 'noindex, nofollow')
  response.status(404).type('text/plain').send('Not found.')
})

app.get('/api/shoply-bat-knowledge.json', (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.set('X-Robots-Tag', 'noindex, nofollow')
  response.status(404).json({ ok: false, message: 'Not found.' })
})

app.get('/api/internal/shoply-bat-knowledge.md', requireSalesPortalAdminOrInternalAccess, async (_request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).type('text/plain').send('Shopify credentials are not configured.')
      return
    }

    const knowledge = await getShoplyBatKnowledge()
    response.set('Cache-Control', 'no-store')
    response.set('Content-Type', 'text/markdown; charset=utf-8')
    response.set('X-Robots-Tag', 'noindex, nofollow')
    response.send(renderShoplyBatKnowledgeMarkdown(knowledge))
  } catch (error) {
    response.status(500).type('text/plain').send(
      error instanceof Error ? error.message : 'Unknown Shoply knowledge feed error.',
    )
  }
})

app.get('/api/internal/shoply-bat-knowledge.json', requireSalesPortalAdminOrInternalAccess, async (_request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const knowledge = await getShoplyBatKnowledge()
    response.set('Cache-Control', 'no-store')
    response.set('X-Robots-Tag', 'noindex, nofollow')
    response.json({ ok: true, ...knowledge })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shoply knowledge feed error.',
    })
  }
})

app.put('/api/state', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const payload = request.body ?? {}
    const result = await enqueueStateWrite(async () => {
      await ensureDefinitions()

      const currentState = await getSharedState()
      const nextPlayers = mergeRecordsByKey(
        currentState.players,
        arrayFromPayload(payload.players),
        (item) => item.id || `${item.profileKind}:${item.playerName}`,
      )
      const nextProducedBats = mergeRecordsByKey(
        currentState.producedBats,
        arrayFromPayload(payload.producedBats).map(sanitizeBatModelDataPoint),
        (item) => item.id || item.createdAt,
      )
      const nextCustomBatModels = mergeRecordsByKey(
        currentState.customBatModels,
        arrayFromPayload(payload.customBatModels),
        (item) => item.id,
      )
      const nextOrderJobs = mergeRecordsByKey(
        currentState.orderJobs,
        arrayFromPayload(payload.orderJobs),
        (item) => item.id,
      )
      const nextBillingContacts = mergeRecordsByKey(
        currentState.billingContacts,
        arrayFromPayload(payload.billingContacts),
        (item) => item.id,
      )
      const nextCrmContacts = mergeRecordsByKey(
        currentState.crmContacts,
        getManualCrmContactRecords(payload.crmContacts),
        (item) => item.id,
      )
      const nextBillets = mergeRecordsByKey(
        currentState.billets,
        arrayFromPayload(payload.billets).map(sanitizeBilletWorkflowRecord),
        (item) => item.barcode || item.id,
      )
      const nextState = {
        ok: true,
        billets: nextBillets,
        players: nextPlayers,
        producedBats: nextProducedBats,
        customBatModels: nextCustomBatModels,
        orderJobs: nextOrderJobs,
        billingContacts: nextBillingContacts,
        crmContacts: nextCrmContacts,
      }
      const patch = buildStatePatchFromStates(currentState, nextState)
      const applied = await applyStatePatch(patch, { ensureDefinitions: false })

      primeStateCache(nextState)
      return applied
    })

    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      mode: 'full-compat-diff',
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify sync error.',
    })
  }
})

app.patch('/api/state', requireInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const result = await enqueueStateWrite(() => applyStatePatch(request.body ?? {}))
    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      mode: 'delta',
      applied: result.applied,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify delta sync error.',
    })
  }
})

app.post('/api/sales-orders', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const isAuthenticatedOperator = await hasAuthenticatedSalesOrderAccess(request)
    if (request.salesPortalSession?.role === 'production') {
      response.status(403).json({
        ok: false,
        message: 'Production accounts cannot submit sales orders.',
      })
      return
    }
    if (
      !isAuthenticatedOperator &&
      !applyRateLimit(publicSalesOrderRateLimiter, request, response)
    ) {
      return
    }

    const preparedPayload = prepareSalesOrderPayloadForRequest(request.body ?? {}, {
      isAuthenticatedOperator,
      salesPortalSession: request.salesPortalSession,
    })
    if (preparedPayload.error) {
      response.status(400).json({ ok: false, message: preparedPayload.error })
      return
    }
    let payload = preparedPayload.payload
    const attachmentValidationMessage = validateOrderAttachmentUploadReceipt(payload.attachment)
    if (attachmentValidationMessage) {
      response.status(400).json({ ok: false, message: attachmentValidationMessage })
      return
    }
    const validationMessage = validateSalesOrderPayload(payload)
    if (validationMessage) {
      response.status(400).json({
        ok: false,
        message: validationMessage,
      })
      return
    }

    const intakeId = createPlainId('sales')
    const orderSubmittedAt = new Date().toISOString()
    const shouldCreateDraftOrder = payload.createDraftOrder !== false
    const isZeroDollarOrder = isZeroDollarSalesOrder(payload)

    await ensureDefinitions()
    if (needsSalesRepPlayerEmailProtection(payload)) {
      const savedCrmContacts = getManualCrmContactRecords(
        await listRecords(resourceConfigs.crmContacts),
      )
      payload = protectSalesRepPlayerEmail(payload, savedCrmContacts)
    }
    if (shouldCreateDraftOrder) {
      const draftInput = buildDraftOrderInput(payload, intakeId, orderSubmittedAt)
      const draftOrder = await createDraftOrder(draftInput)
      const payerInvoiceNotification = await trySendDraftOrderPayerInvoice(draftOrder, payload)
      const mappedJobs = mapDraftOrderToJobs(
        draftOrder,
        payload,
        intakeId,
        false,
        orderSubmittedAt,
      ).map(
        (job) =>
          payerInvoiceNotification.sentAt
            ? {
                ...job,
                invoiceStatus: 'sent',
              }
            : job,
      )
      const jobs = await attachOrderJobsToPlayerProfiles(mappedJobs)
      const [rememberedContacts] = await Promise.all([
        rememberOrderJobContacts(jobs),
        Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
      ])
      await syncOrderJobMetafields(jobs)
      const internalOrderNotification = await trySendInternalOrderCopyNotification({
        payload,
        draftOrder,
        orderSubmittedAt,
        invoiceSent: Boolean(payerInvoiceNotification.sentAt),
        invoiceRecipient: payerInvoiceNotification.recipient,
        invoiceError: payerInvoiceNotification.error,
      })
      const attachmentTracking = await tryRecordSubmittedAttachmentNotification({
        jobs,
        payload,
        internalOrderNotification,
        draftOrder,
      })
      const salesRepEmail = normalizeEmail(payload.salesRepEmail)

      response.json({
        ok: true,
        draftOrder,
        invoiceSendToken: createDraftInvoiceSendToken(draftOrder, intakeId),
        invoiceSendTokenExpiresAt: new Date(Date.now() + invoiceSendTokenMaxAgeMs).toISOString(),
        invoiceSent: Boolean(payerInvoiceNotification.sentAt),
        emailNotificationMethod: payerInvoiceNotification.sentAt ? 'order_invoice' : 'none',
        draftInvoiceReadyForReview: Boolean(draftOrder?.invoiceUrl) && !payerInvoiceNotification.sentAt,
        internalNotificationRecipients: internalOrderNotification.recipients,
        internalOrderNotificationSent: Boolean(internalOrderNotification.sentAt),
        internalOrderNotificationMethod: internalOrderNotification.deliveryMethod,
        internalOrderPdfAttached: Boolean(internalOrderNotification.pdfAttached),
        internalOrderUploadedAttachmentAttached: Boolean(
          internalOrderNotification.uploadedAttachmentAttached,
        ),
        internalOrderAttachmentLinkIncluded: Boolean(
          internalOrderNotification.attachmentLinkIncluded,
        ),
        internalOrderAttachmentTracked: attachmentTracking.tracked,
        internalOrderAttachmentTrackingError: attachmentTracking.error,
        internalOrderNotificationError: internalOrderNotification.error,
        payerNotificationSent: Boolean(payerInvoiceNotification.sentAt),
        payerNotificationRecipient: payerInvoiceNotification.recipient,
        payerNotificationError: payerInvoiceNotification.error,
        salesRepSubmissionNotificationSent: Boolean(
          salesRepEmail && internalOrderNotification.sentAt,
        ),
        salesRepSubmissionNotificationError: salesRepEmail
          ? internalOrderNotification.error
          : '',
        staffNotificationFlow: 'shopify_draft_order_review',
        orderJobs: attachmentTracking.jobs,
        players: rememberedContacts.players,
        billingContacts: rememberedContacts.billingContacts,
      })
      return
    }

    const payerEmail = resolvePayer(payload).email
    const shouldSendInvoice =
      Boolean(payerEmail) && (payload.sendInvoice !== false || isZeroDollarOrder)
    const orderInput = buildOrderCreateInput(payload, intakeId, orderSubmittedAt)
    const order = await createPendingOrder(orderInput, {
      sendReceipt: shouldSendInvoice && isZeroDollarOrder,
    })

    let invoiceSent = shouldSendInvoice && isZeroDollarOrder
    if (shouldSendInvoice && !isZeroDollarOrder && order?.id) {
      await sendOrderInvoice(order.id, buildOrderInvoiceEmailInput(payload, order))
      invoiceSent = true
    }

    const jobs = await attachOrderJobsToPlayerProfiles(
      mapCreatedOrderToJobs(order, payload, intakeId, invoiceSent, orderSubmittedAt),
    )
    const [rememberedContacts] = await Promise.all([
      rememberOrderJobContacts(jobs),
      Promise.all(jobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
    ])
    await syncOrderJobMetafields(jobs)
    const internalOrderNotification = await trySendInternalOrderCopyNotification({
      payload,
      order,
      orderSubmittedAt,
      invoiceSent,
      invoiceRecipient: payerEmail,
      invoiceError: '',
    })
    const attachmentTracking = await tryRecordSubmittedAttachmentNotification({
      jobs,
      payload,
      internalOrderNotification,
      order,
    })
    const salesRepEmail = normalizeEmail(payload.salesRepEmail)

    response.json({
      ok: true,
      order,
      invoiceSent,
      zeroDollarDocumentationInvoice: isZeroDollarOrder,
      emailNotificationMethod: shouldSendInvoice
        ? isZeroDollarOrder
          ? 'order_receipt'
          : 'order_invoice'
        : 'none',
      internalNotificationRecipients: internalOrderNotification.recipients,
      internalOrderNotificationSent: Boolean(internalOrderNotification.sentAt),
      internalOrderNotificationMethod: internalOrderNotification.deliveryMethod,
      internalOrderPdfAttached: Boolean(internalOrderNotification.pdfAttached),
      internalOrderUploadedAttachmentAttached: Boolean(
        internalOrderNotification.uploadedAttachmentAttached,
      ),
      internalOrderAttachmentLinkIncluded: Boolean(
        internalOrderNotification.attachmentLinkIncluded,
      ),
      internalOrderAttachmentTracked: attachmentTracking.tracked,
      internalOrderAttachmentTrackingError: attachmentTracking.error,
      internalOrderNotificationError: internalOrderNotification.error,
      payerNotificationRecipient: payerEmail,
      salesRepSubmissionNotificationSent: Boolean(
        salesRepEmail && internalOrderNotification.sentAt,
      ),
      salesRepSubmissionNotificationError: salesRepEmail
        ? internalOrderNotification.error
        : '',
      staffNotificationFlow: 'shopify_new_order',
      orderJobs: attachmentTracking.jobs,
      players: rememberedContacts.players,
      billingContacts: rememberedContacts.billingContacts,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify draft order error.',
    })
  }
})

app.post('/api/sales-orders/send-draft-invoice', async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const token = cleanString(request.body?.invoiceSendToken)
    const tokenPayload = verifyDraftInvoiceSendToken(token)
    if (!tokenPayload?.draftOrderId || !tokenPayload?.intakeId) {
      response.status(401).json({
        ok: false,
        message: 'This invoice send link is invalid or expired.',
      })
      return
    }

    await ensureDefinitions()
    const matchingJobs = await markDraftInvoiceSent({
      draftOrderId: tokenPayload.draftOrderId,
      intakeId: tokenPayload.intakeId,
      sendInvoice: true,
    })

    response.json({
      ok: true,
      invoiceSent: true,
      emailNotificationMethod: 'order_invoice',
      draftOrder: {
        id: tokenPayload.draftOrderId,
        name: matchingJobs[0]?.shopifyDraftOrderName ?? '',
        invoiceUrl: normalizeDraftInvoiceUrl(matchingJobs[0]?.shopifyDraftInvoiceUrl),
      },
      orderJobs: matchingJobs,
    })
  } catch (error) {
    const status = isMissingDraftInvoiceError(error) ? 404 : 500
    response.status(status).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown invoice send error.',
    })
  }
})

app.post('/api/draft-orders/send-invoice', requireSalesPortalAdminOrInternalAccess, async (request, response) => {
  try {
    const draftOrderId = request.body?.draftOrderId
    if (!draftOrderId) {
      response.status(400).json({ ok: false, message: 'draftOrderId is required.' })
      return
    }

    const orderJobs = await markDraftInvoiceSent({ draftOrderId, sendInvoice: true })
    response.json({ ok: true, orderJobs })
  } catch (error) {
    const status = isMissingDraftInvoiceError(error) ? 404 : 500
    response.status(status).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown invoice send error.',
    })
  }
})

app.post('/api/orders/import', requireSalesPortalAdminOrInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const first = Math.min(Math.max(Number(request.body?.first ?? 50), 1), 100)
    await ensureDefinitions()
    const affiliationBackfill = await backfillKnownProPlayerAffiliations()
    const [orders, completedDraftOrders] = await Promise.all([
      listRecentOrders(first),
      listRecentCompletedDraftOrders(first),
    ])
    const existingJobs = await listRecords(resourceConfigs.orderJobs)
    const jobs = await attachOrderJobsToPlayerProfiles(
      linkCompletedDraftMetadataToOrderJobs(
        orders.flatMap((order) => mapGraphQLOrderToJobs(order)),
        completedDraftOrders,
      ),
      affiliationBackfill.players,
    )
    const mergedJobs = mergeIncomingOrderJobs(existingJobs, jobs)

    const [rememberedContacts] = await Promise.all([
      rememberOrderJobContacts(mergedJobs),
      Promise.all(mergedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job))),
    ])
    invalidateSalesPaymentReconciliationCache()

    response.json({
      ok: true,
      importedOrders: orders.length,
      linkedCompletedDraftOrders: completedDraftOrders.length,
      updatedPlayerAffiliations: affiliationBackfill.updatedCount,
      orderJobs: mergedJobs,
      players: rememberedContacts.players,
      billingContacts: rememberedContacts.billingContacts,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Shopify order import error.',
    })
  }
})

app.post('/api/webhooks/register', requireSalesPortalAdminOrInternalAccess, async (request, response) => {
  try {
    if (!shopDomain || !adminToken) {
      response.status(503).json({
        ok: false,
        message: 'Shopify credentials are not configured on this server.',
      })
      return
    }

    const baseUrl = resolvePublicBaseUrl(request, request.body?.baseUrl)
    if (!baseUrl) {
      response.status(400).json({
        ok: false,
        message: 'Set SHOPIFY_APP_URL or APP_URL before registering webhooks.',
      })
      return
    }

    const uri = `${baseUrl.replace(/\/$/, '')}/api/webhooks/orders`
    const topics = ['ORDERS_CREATE', 'ORDERS_PAID', 'ORDERS_UPDATED', 'ORDERS_CANCELLED']
    const subscriptions = await Promise.all(topics.map((topic) => registerWebhook(topic, uri)))

    response.json({
      ok: true,
      uri,
      subscriptions,
    })
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown webhook registration error.',
    })
  }
})

app.get(publicSalesOrderFormPaths, servePublicAppShell)
app.get(salesPortalPaths, servePublicAppShell)
app.get(internalToolPaths, serveInternalAppShell)
app.get(['/apps', '/apps/{*path}'], serveInternalAppShell)
app.use('/assets', express.static(path.join(rootDir, 'dist', 'assets')))
app.get(publicStaticAssetPaths, (request, response) => {
  response.sendFile(path.join(rootDir, 'dist', path.basename(request.path)))
})

app.use(requireInternalAccess)

app.use(
  express.static(path.join(rootDir, 'dist'), {
    index: false,
    setHeaders(response, filePath) {
      if (filePath.endsWith('index.html')) {
        response.setHeader('Cache-Control', 'no-store')
      }
    },
  }),
)

app.get('/{*path}', serveInternalAppShell)

app.listen(port, () => {
  console.log(`Trinity billet server listening on http://127.0.0.1:${port}`)
})

function servePublicAppShell(_request, response) {
  serveAppShell(response)
}

function serveInternalAppShell(request, response) {
  const isInternalShell = isInternalAppShellPath(request.path)
  const isEmbeddedLaunch = hasEmbeddedShopifyContext({
    embedded: getQueryParam(request, 'embedded'),
    host: getQueryParam(request, 'host'),
  })

  serveAppShell(response, {
    includeShopifyAppBridge: isInternalShell && isEmbeddedLaunch,
    includeTeamPinFallback: isInternalShell,
  })
}

function serveAppShell(
  response,
  { includeShopifyAppBridge = false, includeTeamPinFallback = false } = {},
) {
  response.set('Cache-Control', 'no-store')
  response.type('html').send(
    renderAppShell(fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8'), {
      includeShopifyAppBridge,
      includeTeamPinFallback,
      apiKey: shopifyApiKey,
    }),
  )
}

function establishInternalSession(request, response, next) {
  const hasStandaloneAccess = hasValidStandaloneInternalAccess(request)
  const hasCryptographicallyVerifiedLaunch = hasValidShopifyLaunch(request)
  const hasInternalSession = hasValidInternalSession(request)
  const isNavigationRequest = isHtmlNavigationRequest(request)
  const isEmbeddedInternalNavigation =
    isNavigationRequest &&
    isInternalAppShellPath(request.path) &&
    hasEmbeddedShopifyContext({
      embedded: getQueryParam(request, 'embedded'),
      host: getQueryParam(request, 'host'),
    })

  if (
    isEmbeddedInternalNavigation &&
    !hasCryptographicallyVerifiedLaunch &&
    !hasStandaloneAccess &&
    !hasInternalSession
  ) {
    response.redirect(302, buildShopifySessionBounceLocation(request.originalUrl))
    return
  }

  if (
    isNavigationRequest &&
    (hasCryptographicallyVerifiedLaunch || hasStandaloneAccess)
  ) {
    const token = createInternalSessionToken()
    if (token) {
      response.cookie(internalSessionCookieName, token, {
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: isSecureRequest(request) ? 'none' : 'lax',
        maxAge: internalSessionMaxAgeMs,
        path: '/',
      })
    }
  }

  if (hasStandaloneAccess) {
    const redirectUrl = new URL(request.originalUrl, getRequestOrigin(request))
    redirectUrl.searchParams.delete(standaloneInternalAccessQueryParam)
    const sanitizedPath = `${redirectUrl.pathname}${redirectUrl.search}`
    if (sanitizedPath !== request.originalUrl) {
      response.redirect(302, sanitizedPath)
      return
    }
  }

  next()
}

function isHtmlNavigationRequest(request) {
  if (request.method !== 'GET') return false

  const destination = cleanString(request.get('sec-fetch-dest')).toLowerCase()
  if (destination === 'document' || destination === 'iframe') return true

  const mode = cleanString(request.get('sec-fetch-mode')).toLowerCase()
  if (mode === 'navigate') return true

  const accept = cleanString(request.get('accept')).toLowerCase()
  return accept.includes('text/html')
}

async function requireInternalAccess(request, response, next) {
  if (getSalesPortalSessionPayload(request)) {
    try {
      const session = await getValidatedSalesPortalSession(request)
      if (session?.isAdmin) {
        request.salesPortalSession = session
        next()
        return
      }

      response.status(403).json({
        ok: false,
        message: 'This action is limited to Trinity administrators.',
      })
      return
    } catch (error) {
      response.status(503).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not validate internal access.',
      })
      return
    }
  }

  if (hasVerifiedInternalAccess(request)) {
    next()
    return
  }

  if (shouldRetryShopifySessionRequest(request.get('authorization'))) {
    setShopifySessionRetryHeader(response)
  }
  response.status(401).json({
    ok: false,
    message: 'Internal inventory access requires a verified Shopify session.',
  })
}

function hasVerifiedInternalAccess(request) {
  return (
    isLocalRequest(request) ||
    hasValidInternalSession(request) ||
    hasValidBearerSession(request) ||
    hasValidShopifyLaunch(request)
  )
}

function hasValidShopifyLaunch(request) {
  return hasValidShopifyHmac(request) || hasValidShopifySessionToken(getQueryParam(request, 'id_token'))
}

function hasValidStandaloneInternalAccess(request) {
  const providedToken = cleanString(getQueryParam(request, standaloneInternalAccessQueryParam))
  if (!providedToken) return false

  const expectedToken = createStandaloneInternalAccessToken()
  if (!expectedToken) return false

  return safeEqual(expectedToken, providedToken, 'utf8')
}

function hasValidShopifyHmac(request) {
  if (!shopifyApiSecret) return false

  const hmac = getQueryParam(request, 'hmac')
  if (!hmac) return false

  const url = new URL(request.originalUrl, 'https://trinity.local')
  const messageParts = []
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'hmac' || key === 'signature') continue
    messageParts.push(`${key}=${value}`)
  }
  messageParts.sort()

  const digest = crypto
    .createHmac('sha256', shopifyApiSecret)
    .update(messageParts.join('&'))
    .digest('hex')

  if (!safeEqual(digest, hmac, 'hex')) return false

  if (!isFreshShopifyLaunchTimestamp(getQueryParam(request, 'timestamp'))) return false

  const requestShop = getQueryParam(request, 'shop')
  return !shopDomain || !requestShop || requestShop === shopDomain
}

function hasValidBearerSession(request) {
  const authorization = request.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return Boolean(match?.[1] && hasValidShopifySessionToken(match[1]))
}

function hasValidShopifySessionToken(token) {
  return verifyShopifySessionToken(token, {
    apiSecret: shopifyApiSecret,
    apiKey: shopifyApiKey,
    shopDomain,
  })
}

function createInternalSessionToken() {
  if (!internalSessionSecret) return ''

  const payload = Buffer.from(
    JSON.stringify({
      shop: shopDomain ?? '',
      exp: Date.now() + internalSessionMaxAgeMs,
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
}

function createStandaloneInternalAccessToken() {
  if (!internalSessionSecret) return ''

  return crypto
    .createHmac('sha256', internalSessionSecret)
    .update(`standalone-internal-access:${shopDomain ?? 'trinity'}`)
    .digest('base64url')
}

function hasValidInternalSession(request) {
  if (!internalSessionSecret) return false

  const token = getCookie(request, internalSessionCookieName)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false

  const expectedSignature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(payload)
    .digest('base64url')
  if (!safeEqual(expectedSignature, signature, 'utf8')) return false

  try {
    const session = JSON.parse(decodeBase64Url(payload))
    if (typeof session.exp !== 'number' || session.exp < Date.now()) return false
    return !shopDomain || !session.shop || session.shop === shopDomain
  } catch {
    return false
  }
}

function getQueryParam(request, name) {
  const value = request.query?.[name]
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}

function getRequestOrigin(request) {
  const protocol = cleanString(request.get('x-forwarded-proto')) || request.protocol || 'https'
  const host = cleanString(request.get('x-forwarded-host')) || cleanString(request.get('host'))
  return `${protocol}://${host || 'trinity.local'}`
}

function getCookie(request, name) {
  const cookies = String(request.get('cookie') ?? '').split(';')
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=')
    if (rawName === name) return decodeURIComponent(rawValueParts.join('='))
  }
  return ''
}

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function safeEqual(left, right, encoding) {
  try {
    const leftBuffer = Buffer.from(left, encoding)
    const rightBuffer = Buffer.from(right, encoding)
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

function isSecureRequest(request) {
  return request.secure || request.get('x-forwarded-proto') === 'https'
}

function isLocalRequest(request) {
  if (!allowsLocalInternalAccess(process.env.NODE_ENV)) return false

  const remoteAddress = cleanString(request.socket?.remoteAddress).replace(/^::ffff:/, '')
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1'
}

function normalizeSalesPortalEmail(value) {
  const email = normalizeEmail(value)
  return email.endsWith('@trinitybats.com') ? email : ''
}

function getSalesPortalOwnerForEmail(email) {
  const normalizedEmail = normalizeSalesPortalEmail(email)
  if (!normalizedEmail) return null

  return salesPortalTeamByEmail.get(normalizedEmail) ?? null
}

function getTeamToolMemberForEmail(email) {
  const normalizedEmail = normalizeSalesPortalEmail(email)
  if (!normalizedEmail) return null

  return teamToolTeamByEmail.get(normalizedEmail) ?? null
}

function normalizeSalesPortalOwnerName(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getSalesPortalOwnerAliases(owner) {
  return [owner.name, owner.label, ...(owner.aliases ?? [])]
    .map((value) => normalizeSalesPortalOwnerName(value))
    .filter(Boolean)
}

function getSalesPortalOwnerForName(name) {
  const normalizedName = normalizeSalesPortalOwnerName(name)
  if (!normalizedName) return null

  return (
    salesPortalTeamMembers.find((owner) =>
      getSalesPortalOwnerAliases(owner).includes(normalizedName),
    ) ?? null
  )
}

function getSalesPortalOwnerKey(name, email) {
  const normalizedEmail = normalizeSalesPortalEmail(email)
  const emailOwner = normalizedEmail ? getSalesPortalOwnerForEmail(normalizedEmail) : null
  if (emailOwner) return emailOwner.key

  const nameOwner = getSalesPortalOwnerForName(name)
  if (nameOwner) return nameOwner.key

  if (normalizedEmail) return normalizedEmail

  const normalizedName = normalizeSalesPortalOwnerName(name)

  return normalizedName || 'unassigned'
}

function buildSalesPortalSession(email, loggedInAt = new Date().toISOString()) {
  const owner = getTeamToolMemberForEmail(email)
  if (!owner) return null

  return {
    email: owner.email,
    name: owner.name,
    label: owner.label,
    role: owner.role,
    isAdmin: salesPortalAdminEmails.has(owner.email),
    loggedInAt,
  }
}

function createSalesPortalSessionToken(email) {
  const owner = getTeamToolMemberForEmail(email)
  if (!owner) return ''

  const issuedAt = Date.now()
  return createSalesPortalSignedPayload({
    purpose: 'sales_portal_session',
    email: owner.email,
    iat: issuedAt,
    exp: issuedAt + salesPortalSessionMaxAgeMs,
  })
}

function getSalesPortalSessionPayload(request) {
  const candidates = getTeamSessionTokenCandidates({
    headerToken: request.get(teamAccessSessionHeaderName),
    cookieToken: getCookie(request, salesPortalSessionCookieName),
  })

  for (const candidate of candidates) {
    const payload = verifySalesPortalSignedPayload(candidate)
    if (payload?.purpose !== 'sales_portal_session') continue
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) continue
    if (typeof payload.iat !== 'number' || payload.iat <= 0) continue
    return payload
  }

  return null
}

async function getValidatedSalesPortalSession(request) {
  const payload = getSalesPortalSessionPayload(request)
  if (!payload) return null

  const owner = getTeamToolMemberForEmail(payload.email)
  if (!owner) return null

  await ensureDefinitions()
  const user = await getRecordByHandle(resourceConfigs.salesPortalUsers, owner.email)
  if (!isSalesPortalSessionCurrent(payload, user)) return null

  const loggedInAt =
    new Date(payload.iat).toISOString()
  return buildSalesPortalSession(payload.email, loggedInAt)
}

function getSalesPortalCookieOptions(request) {
  return {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: isSecureRequest(request) ? 'none' : 'lax',
    maxAge: salesPortalSessionMaxAgeMs,
    path: '/',
  }
}

async function requireSalesPortalAccess(request, response, next) {
  try {
    const session = await getValidatedSalesPortalSession(request)
    if (session) {
      request.salesPortalSession = session
      next()
      return
    }

    response.status(401).json({
      ok: false,
      message: 'Sales portal sign-in required.',
    })
  } catch (error) {
    response.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not validate sales portal access.',
    })
  }
}

async function requireSalesDashboardAccess(request, response, next) {
  try {
    if (hasVerifiedInternalAccess(request)) {
      next()
      return
    }

    const session = await getValidatedSalesPortalSession(request)
    if (session) {
      request.salesPortalSession = session
      next()
      return
    }

    if (shouldRetryShopifySessionRequest(request.get('authorization'))) {
      setShopifySessionRetryHeader(response)
    }
    response.status(401).json({
      ok: false,
      message: 'Trinity tool sign-in required.',
    })
  } catch (error) {
    response.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not validate Trinity tool access.',
    })
  }
}

async function requireSalesPortalAdminOrInternalAccess(request, response, next) {
  if (getSalesPortalSessionPayload(request)) {
    try {
      const session = await getValidatedSalesPortalSession(request)
      if (session?.isAdmin) {
        request.salesPortalSession = session
        next()
        return
      }

      response.status(403).json({
        ok: false,
        message: 'Admin access is required for this action.',
      })
      return
    } catch (error) {
      response.status(503).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not validate admin access.',
      })
      return
    }
  }

  if (hasVerifiedInternalAccess(request)) {
    next()
    return
  }

  try {
    const session = await getValidatedSalesPortalSession(request)
    if (session?.isAdmin) {
      request.salesPortalSession = session
      next()
      return
    }

    if (shouldRetryShopifySessionRequest(request.get('authorization'))) {
      setShopifySessionRetryHeader(response)
    }
    response.status(401).json({
      ok: false,
      message: 'Admin access is required to issue team PINs.',
    })
  } catch (error) {
    response.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not validate admin access.',
    })
  }
}

async function hasAuthenticatedSalesOrderAccess(request) {
  if (getSalesPortalSessionPayload(request)) {
    const session = await getValidatedSalesPortalSession(request)
    if (!session) return false
    request.salesPortalSession = session
    return true
  }

  if (hasVerifiedInternalAccess(request)) return true

  const session = await getValidatedSalesPortalSession(request)
  if (!session) return false
  request.salesPortalSession = session
  return true
}

function applyRateLimit(rateLimiter, request, response) {
  let allowed = false
  rateLimiter(request, response, () => {
    allowed = true
  })
  return allowed
}

function createSalesPortalLoginCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function createSalesPortalLoginCodeEntry(email) {
  const code = createSalesPortalLoginCode()
  const expiresAt = Date.now() + salesPortalLoginCodeMaxAgeMs
  salesPortalLoginCodes.set(email, {
    codeHash: hashSalesPortalLoginCode(email, code),
    expiresAt,
    attempts: 0,
  })

  return { code, expiresAt }
}

function createSalesPortalAccessCode() {
  return createTeamAccessPin()
}

function normalizeSalesPortalAccessCode(value) {
  return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function hashSalesPortalAccessCode(email, code) {
  return crypto
    .createHmac('sha256', getSalesPortalSigningSecret())
    .update(`${normalizeSalesPortalEmail(email)}:${normalizeSalesPortalAccessCode(code)}`)
    .digest('base64url')
}

async function issueSalesPortalAccessCode(email) {
  const owner = getTeamToolMemberForEmail(email)
  if (!owner) throw new Error('Choose an approved Trinity team member.')

  await ensureDefinitions()
  const now = new Date().toISOString()
  const users = await listRecords(resourceConfigs.salesPortalUsers)
  let accessCode = ''
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = createSalesPortalAccessCode()
    const alreadyAssigned = users.some((user) => {
      const savedEmail = normalizeSalesPortalEmail(user.email)
      const savedHash = cleanString(user.accessCodeHash)
      if (!savedEmail || !savedHash || savedEmail === owner.email) return false
      return safeEqual(savedHash, hashSalesPortalAccessCode(savedEmail, candidate), 'utf8')
    })
    if (!alreadyAssigned) {
      accessCode = candidate
      break
    }
  }
  if (!accessCode) throw new Error('Could not create a unique team PIN. Try again.')

  const existing = (await getRecordByHandle(resourceConfigs.salesPortalUsers, owner.email)) ?? {}
  const user = {
    ...existing,
    id: owner.email,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    status: 'active',
    accessCodeHash: hashSalesPortalAccessCode(owner.email, accessCode),
    accessCodeRotatedAt: now,
    createdAt: cleanString(existing.createdAt) || now,
    updatedAt: now,
  }

  await upsertRecord(resourceConfigs.salesPortalUsers, user)
  return { accessCode, user }
}

async function verifySalesPortalAccessCode(email, code) {
  const owner = getTeamToolMemberForEmail(email)
  if (!owner) return null

  await ensureDefinitions()
  const user = await getRecordByHandle(resourceConfigs.salesPortalUsers, owner.email)
  const status = cleanString(user?.status).toLowerCase()
  const codeHash = cleanString(user?.accessCodeHash)
  if (status !== 'active' || !codeHash) return null

  return safeEqual(codeHash, hashSalesPortalAccessCode(owner.email, code), 'utf8') ? user : null
}

async function verifySalesPortalPin(pin) {
  if (!isValidTeamAccessPin(pin)) return null

  await ensureDefinitions()
  const users = await listRecords(resourceConfigs.salesPortalUsers)
  let verifiedUser = null
  let matchCount = 0
  for (const user of users) {
    const email = normalizeSalesPortalEmail(user.email)
    const owner = getTeamToolMemberForEmail(email)
    const status = cleanString(user.status).toLowerCase()
    const codeHash = cleanString(user.accessCodeHash)
    if (!owner || status !== 'active' || !codeHash) continue
    if (safeEqual(codeHash, hashSalesPortalAccessCode(email, pin), 'utf8')) {
      verifiedUser = user
      matchCount += 1
    }
  }

  return matchCount === 1 ? verifiedUser : null
}

async function getOrCreateActiveSalesPortalUser(email) {
  const owner = getTeamToolMemberForEmail(email)
  if (!owner) return null

  await ensureDefinitions()
  const existing = await getRecordByHandle(resourceConfigs.salesPortalUsers, owner.email)
  if (existing) {
    return cleanString(existing.status).toLowerCase() === 'active' ? existing : null
  }

  const now = new Date().toISOString()
  const user = {
    id: owner.email,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    status: 'active',
    accessCodeHash: '',
    accessCodeRotatedAt: '',
    createdAt: now,
    updatedAt: now,
  }
  await upsertRecord(resourceConfigs.salesPortalUsers, user)
  return user
}

async function recordSalesPortalLogin(email) {
  try {
    if (!shopDomain || !adminToken) return
    const owner = getTeamToolMemberForEmail(email)
    if (!owner) return

    await ensureDefinitions()
    const existing = await getRecordByHandle(resourceConfigs.salesPortalUsers, owner.email)
    if (!existing || cleanString(existing.status).toLowerCase() !== 'active') return

    const now = new Date().toISOString()
    await upsertRecord(resourceConfigs.salesPortalUsers, {
      ...existing,
      id: owner.email,
      email: owner.email,
      name: owner.name,
      role: owner.role,
      status: cleanString(existing.status) || 'active',
      lastLoginAt: now,
      updatedAt: now,
    })
  } catch (error) {
    console.warn(
      `Unable to record sales portal login: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

function publicSalesPortalUser(user) {
  if (!user) return null
  return {
    email: normalizeSalesPortalEmail(user.email),
    name: cleanString(user.name),
    role: cleanString(user.role),
    status: cleanString(user.status),
    accessCodeRotatedAt: cleanString(user.accessCodeRotatedAt),
    lastLoginAt: cleanString(user.lastLoginAt),
  }
}

function hashSalesPortalLoginCode(email, code) {
  return crypto
    .createHmac('sha256', getSalesPortalSigningSecret())
    .update(`${normalizeSalesPortalEmail(email)}:${cleanString(code)}`)
    .digest('base64url')
}

function getSalesPortalSigningSecret() {
  return internalSessionSecret || 'trinity-sales-portal-local-preview'
}

function createSalesPortalSignedPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getSalesPortalSigningSecret())
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

function verifySalesPortalSignedPayload(token) {
  if (!token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = crypto
    .createHmac('sha256', getSalesPortalSigningSecret())
    .update(encodedPayload)
    .digest('base64url')
  if (!safeEqual(expectedSignature, signature, 'utf8')) return null

  try {
    return JSON.parse(decodeBase64Url(encodedPayload))
  } catch {
    return null
  }
}

async function sendSalesPortalLoginCodeEmail(email, code) {
  await sendInternalEmail({
    to: [email],
    subject: 'Your Trinity sales portal sign-in code',
    text: [
      `Your Trinity sales portal sign-in code is ${code}.`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request it, you can ignore this email.',
    ].join('\n'),
  })
}

function isSalesPortalContactOwnedBy(contact, owner) {
  if (!owner) return false
  return getSalesPortalOwnerKey(contact?.salesOwner, contact?.ownerEmail) === owner.key
}

function isSalesPortalOrderJobOwnedBy(job, owner) {
  if (!owner) return false
  return getSalesPortalOwnerKey(job?.salesRep, job?.salesRepEmail) === owner.key
}

function getCrmContactTags(contact) {
  return arrayFromPayload(contact?.tags).map((tag) => cleanString(tag)).filter(Boolean)
}

function getManualCrmContactRecords(contacts) {
  return arrayFromPayload(contacts).filter(isManualCrmContactRecord)
}

function filterSalesPortalStateForSession(state, session) {
  const allOrderJobs = arrayFromPayload(state?.orderJobs)
  const internalOrderJobs = allOrderJobs.filter(
    (job) => job?.origin === 'internal_sales',
  )
  const teamReportingOrderJobs = internalOrderJobs.map((job) =>
    sanitizeOrderJobForTeamReporting(job),
  )
  const crmContacts = getManualCrmContactRecords(state?.crmContacts)
  const players = arrayFromPayload(state?.players)
    .filter((player) => player?.profileKind !== 'Trainer' && arrayFromPayload(player?.bats).length > 0)
    .map((player) => ({
      ...hydrateKnownProPlayerAffiliation(player),
      bats: [],
    }))

  if (session?.isAdmin) {
    return {
      ok: true,
      session,
      crmContacts,
      orderJobs: allOrderJobs,
      teamReportingOrderJobs,
      players,
      teamMembers: salesPortalTeamMembers,
    }
  }

  const owner = getSalesPortalOwnerForEmail(session?.email)
  const ownedContacts = crmContacts.filter((contact) =>
    isSalesPortalContactOwnedBy(contact, owner),
  )
  return {
    ok: true,
    session,
    crmContacts: ownedContacts,
    orderJobs: allOrderJobs.filter(
      (job) =>
        (job?.origin === 'internal_sales' && isSalesPortalOrderJobOwnedBy(job, owner)) ||
        isOrderJobLinkedToCrmContacts(job, ownedContacts),
    ),
    teamReportingOrderJobs,
    players,
    teamMembers: salesPortalTeamMembers,
  }
}

function filterFullToolStateForSession(state, session) {
  const salesPortalState = filterSalesPortalStateForSession(state, session)
  const teamLeaderboardRows = buildTrailingSalesLeaderboard(
    state?.orderJobs,
    salesPortalTeamMembers,
  )

  if (session?.isAdmin) {
    return {
      ...state,
      ok: true,
      session,
      teamLeaderboardRows,
      teamMembers: salesPortalTeamMembers,
    }
  }

  if (session?.role === 'production') {
    return {
      ...state,
      ok: true,
      session,
      billingContacts: [],
      crmContacts: [],
      teamLeaderboardRows: [],
      teamMembers: teamToolTeamMembers,
    }
  }

  return {
    ...state,
    ok: true,
    session,
    crmContacts: salesPortalState.crmContacts,
    orderJobs: salesPortalState.orderJobs,
    teamLeaderboardRows,
    teamMembers: salesPortalTeamMembers,
  }
}

function filterSalesPaymentsForSession(payments, session) {
  const rows = arrayFromPayload(payments)
  if (!session || session.isAdmin) return rows

  const owner = getSalesPortalOwnerForEmail(session.email)
  if (!owner || session.role === 'production') return []

  return rows.filter(
    (payment) => getSalesPortalOwnerKey(payment?.salesRep, payment?.salesRepEmail) === owner.key,
  )
}

function filterWebsiteOrdersForSession(orders, session) {
  return filterAdminOnlySalesRows(arrayFromPayload(orders), !session || Boolean(session.isAdmin))
}

async function prepareFullToolStatePatchForSession(payload, session) {
  if (session?.isAdmin) return { patch: payload, error: '' }

  if (session?.role === 'production') {
    return {
      error: '',
      patch: {
        billets: arrayFromPayload(payload?.billets),
        players: arrayFromPayload(payload?.players),
        producedBats: arrayFromPayload(payload?.producedBats),
        customBatModels: arrayFromPayload(payload?.customBatModels),
        orderJobs: arrayFromPayload(payload?.orderJobs),
        deletes: {
          producedBats: arrayFromPayload(payload?.deletes?.producedBats),
        },
      },
    }
  }

  const sessionOwner = getSalesPortalOwnerForEmail(session?.email)
  if (!sessionOwner) {
    return { patch: {}, error: 'An active Trinity sales account is required.' }
  }

  const requestedContacts = arrayFromPayload(payload?.crmContacts)
  const existingContacts = await listRecords(resourceConfigs.crmContacts)
  const existingContactsById = new Map(
    existingContacts
      .map((contact) => [cleanString(contact?.id), contact])
      .filter(([id]) => Boolean(id)),
  )
  const unauthorizedContact = requestedContacts.find((contact) => {
    const existingContact = existingContactsById.get(cleanString(contact?.id))
    return (
      existingContact &&
      (!isManualCrmContactRecord(existingContact) ||
        !canUpdateOwnedRecord({
          isAdmin: false,
          existingOwnerKey: getSalesPortalOwnerKey(
            existingContact?.salesOwner,
            existingContact?.ownerEmail,
          ),
          sessionOwnerKey: sessionOwner.key,
        }))
    )
  })
  if (unauthorizedContact) {
    return {
      patch: {},
      error: 'Sales team members can only update CRM contacts assigned to them.',
    }
  }

  const crmContacts = requestedContacts
    .map((contact) =>
      prepareSalesPortalCrmContactForSession(
        contact,
        session,
        existingContactsById.get(cleanString(contact?.id)),
      ),
    )
    .filter(Boolean)

  return {
    error: '',
    patch: {
      billets: arrayFromPayload(payload?.billets),
      players: arrayFromPayload(payload?.players),
      producedBats: arrayFromPayload(payload?.producedBats),
      customBatModels: arrayFromPayload(payload?.customBatModels),
      billingContacts: arrayFromPayload(payload?.billingContacts),
      crmContacts,
      deletes: {
        producedBats: arrayFromPayload(payload?.deletes?.producedBats),
      },
    },
  }
}

function prepareSalesPortalCrmContactForSession(contact, session, existingContact = null) {
  if (!contact || typeof contact !== 'object') return null
  const sessionOwner = getSalesPortalOwnerForEmail(session?.email)
  if (!sessionOwner) return null
  const mergedContact = existingContact ? { ...existingContact, ...contact } : contact
  const requestedOwner =
    getSalesPortalOwnerForEmail(mergedContact.ownerEmail) ??
    getSalesPortalOwnerForName(mergedContact.salesOwner)
  const canAssignRequestedOwner = canAssignCrmContactOwner({
    isAdmin: session?.isAdmin,
    hasExistingContact: Boolean(existingContact),
  })
  const owner = (canAssignRequestedOwner ? requestedOwner : null) || sessionOwner
  const now = new Date().toISOString()
  const touchpoints = arrayFromPayload(mergedContact.touchpoints).map((touchpoint) => {
    const touchpointOwner = getSalesPortalOwnerForName(touchpoint?.salesRep)
    return {
      ...touchpoint,
      salesRep: canAssignRequestedOwner
        ? touchpointOwner?.name || cleanString(touchpoint?.salesRep) || owner.name
        : owner.name,
    }
  })
  const tags = Array.from(new Set([...getCrmContactTags(mergedContact), 'Manual entry']))

  return {
    ...mergedContact,
    id: cleanString(mergedContact.id) || createPlainId('crm-contact'),
    salesOwner: owner.name,
    ownerEmail: owner.email,
    source: 'Manual CRM entry',
    tags,
    touchpoints,
    sandboxOnly: false,
    updatedAt: now,
    createdAt: cleanString(existingContact?.createdAt) || cleanString(mergedContact.createdAt) || now,
  }
}

function createDraftInvoiceSendToken(draftOrder, intakeId) {
  if (!internalSessionSecret || !draftOrder?.id || !intakeId) return ''

  return createSignedPayload({
    purpose: 'draft_invoice_send',
    draftOrderId: draftOrder.id,
    intakeId,
    exp: Date.now() + invoiceSendTokenMaxAgeMs,
  })
}

function verifyDraftInvoiceSendToken(token) {
  const payload = verifySignedPayload(token)
  if (payload?.purpose !== 'draft_invoice_send') return null
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
  return payload
}

function createOrderAttachmentUploadToken(attachment) {
  const normalized = normalizeOrderAttachment(attachment)
  if (!normalized) return ''

  return createSignedPayload({
    purpose: 'order_attachment_upload',
    id: normalized.id,
    shopifyFileId: normalized.shopifyFileId,
    filename: normalized.filename,
    downloadUrl: normalized.downloadUrl,
    contentType: normalized.contentType,
    bytes: normalized.bytes,
    exp: Date.now() + orderAttachmentUploadTokenMaxAgeMs,
  })
}

function validateOrderAttachmentUploadReceipt(attachment) {
  if (!attachment) return ''

  const normalized = normalizeOrderAttachment(attachment)
  const payload = verifySignedPayload(cleanString(attachment?.uploadToken))
  if (
    !normalized ||
    payload?.purpose !== 'order_attachment_upload' ||
    typeof payload.exp !== 'number' ||
    payload.exp < Date.now()
  ) {
    return 'Attachment upload could not be verified. Upload the file again.'
  }

  const matchesReceipt =
    cleanString(payload.id) === normalized.id &&
    cleanString(payload.shopifyFileId) === normalized.shopifyFileId &&
    cleanString(payload.filename) === normalized.filename &&
    cleanString(payload.downloadUrl) === normalized.downloadUrl &&
    cleanString(payload.contentType) === normalized.contentType &&
    Number(payload.bytes) === normalized.bytes

  return matchesReceipt ? '' : 'Attachment details changed after upload. Upload the file again.'
}

function createSignedPayload(payload) {
  if (!internalSessionSecret) return ''

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

function verifySignedPayload(token) {
  if (!internalSessionSecret || !token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = crypto
    .createHmac('sha256', internalSessionSecret)
    .update(encodedPayload)
    .digest('base64url')
  if (!safeEqual(expectedSignature, signature, 'utf8')) return null

  try {
    return JSON.parse(decodeBase64Url(encodedPayload))
  } catch {
    return null
  }
}

async function markDraftInvoiceSent({ draftOrderId, intakeId = '', sendInvoice = false }) {
  const normalizedDraftOrderId = cleanString(draftOrderId)
  if (!normalizedDraftOrderId) throw new Error('draftOrderId is required.')

  const existingJobs = await listRecords(resourceConfigs.orderJobs)
  const matchingJobs = existingJobs
    .filter(
      (job) =>
        cleanString(job.shopifyDraftOrderId) === normalizedDraftOrderId &&
        (!intakeId || cleanString(job.intakeId) === intakeId),
    )
    .map((job) => ({
      ...job,
      shopifyDraftInvoiceUrl: normalizeDraftInvoiceUrl(job.shopifyDraftInvoiceUrl),
    }))

  if (matchingJobs.length === 0) {
    throw new Error('Could not find the submitted draft invoice in the production queue.')
  }

  const alreadySent = matchingJobs.every((job) => cleanString(job.invoiceStatus) === 'sent')
  if (sendInvoice && !alreadySent) {
    await sendDraftOrderInvoice(
      normalizedDraftOrderId,
      buildDraftOrderInvoiceEmailInput(matchingJobs),
    )
  }

  const now = new Date().toISOString()
  const updatedJobs = matchingJobs.map((job) => ({
    ...job,
    invoiceStatus: 'sent',
    updatedAt: now,
  }))

  await Promise.all(updatedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))
  await syncOrderJobMetafields(updatedJobs)

  return updatedJobs
}

async function trySendDraftOrderPayerInvoice(draftOrder, payload) {
  const emailInput = buildDraftOrderInvoiceEmailInputFromPayload(payload, draftOrder)
  if (!emailInput.to) return { sentAt: '', recipients: [], recipient: '', error: '' }

  try {
    await sendDraftOrderInvoice(draftOrder.id, emailInput)
    return {
      sentAt: new Date().toISOString(),
      recipients: [emailInput.to],
      recipient: emailInput.to,
      error: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown payer invoice error.'
    console.error(`Draft payer invoice error: ${message}`)
    return {
      sentAt: '',
      recipients: [],
      recipient: emailInput.to,
      error: message,
    }
  }
}

async function trySendInternalOrderCopyNotification({
  payload,
  draftOrder = null,
  order = null,
  orderSubmittedAt = new Date().toISOString(),
  invoiceSent = false,
  invoiceRecipient = '',
  invoiceError = '',
}) {
  const recipients = buildInternalOrderCopyRecipients(payload)
  if (recipients.length === 0) {
    return {
      sentAt: '',
      recipients: [],
      deliveryMethod: '',
      pdfAttached: false,
      uploadedAttachmentAttached: false,
      attachmentLinkIncluded: false,
      error: '',
    }
  }

  try {
    const subject = buildInternalOrderCopySubject({ draftOrder, order })
    const orderPrinterPdfUrl = buildOrderPrinterProDraftPdfUrl(
      draftOrder,
      orderPrinterProDraftPdfConfig,
    )
    const text = buildInternalOrderCopyMessage({
      payload,
      draftOrder,
      order,
      orderSubmittedAt,
      invoiceSent,
      invoiceRecipient,
      invoiceError,
      orderPrinterPdfUrl,
    })
    const delivery = await sendInternalOrderCopyEmail({
      draftOrder,
      order,
      recipients,
      subject,
      text,
      orderPrinterPdfUrl,
      uploadedAttachment: normalizeOrderAttachment(payload.attachment),
    })

    return {
      sentAt: new Date().toISOString(),
      recipients,
      deliveryMethod: delivery.method,
      pdfAttached: delivery.pdfAttached,
      uploadedAttachmentAttached: delivery.uploadedAttachmentAttached,
      attachmentLinkIncluded: Boolean(normalizeOrderAttachment(payload.attachment)?.downloadUrl),
      error: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown internal email error.'
    console.error(`Internal order copy email error: ${message}`)
    return {
      sentAt: '',
      recipients,
      deliveryMethod: '',
      pdfAttached: false,
      uploadedAttachmentAttached: false,
      attachmentLinkIncluded: false,
      error: message,
    }
  }
}

async function tryRecordSubmittedAttachmentNotification({
  jobs,
  payload,
  internalOrderNotification,
  draftOrder = null,
  order = null,
}) {
  const attachment = normalizeOrderAttachment(payload?.attachment)
  const jeremyReceivedCopy = internalOrderNotification?.recipients?.some(
    (recipient) => normalizeEmail(recipient) === defaultPaidOrderAttachmentRecipient,
  )
  if (!attachment || !internalOrderNotification?.sentAt || !jeremyReceivedCopy) {
    return { jobs, tracked: false, error: '' }
  }

  const tracking = createInternalAttachmentNotification({
    event: 'submission',
    recipient: defaultPaidOrderAttachmentRecipient,
    sentAt: internalOrderNotification.sentAt,
    method: internalOrderNotification.deliveryMethod,
    shopifyOrderId: order?.id,
    shopifyOrderName: order?.name,
    shopifyDraftOrderId: draftOrder?.id,
    shopifyDraftOrderName: draftOrder?.name,
    attachment,
  })
  const trackedJobs = recordInternalAttachmentNotification(jobs, tracking)

  try {
    await Promise.all(trackedJobs.map((job) => upsertRecord(resourceConfigs.orderJobs, job)))
    await syncOrderJobMetafields(trackedJobs)
    return { jobs: trackedJobs, tracked: true, error: '' }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown attachment notification tracking error.'
    console.error(`Attachment notification tracking error: ${message}`)
    return { jobs, tracked: false, error: message }
  }
}

function buildInternalOrderCopyRecipients(payload) {
  return uniqueEmails(internalOrderNotificationEmails.concat(normalizeEmail(payload?.salesRepEmail)))
}

function buildInternalOrderCopySubject({ draftOrder = null, order = null }) {
  const orderName = cleanString(draftOrder?.name || order?.name) || 'Trinity manual order'
  return `${orderName} submitted from Trinity order form`
}

function buildInternalOrderCopyMessage({
  payload,
  draftOrder = null,
  order = null,
  orderSubmittedAt = '',
  invoiceSent = false,
  invoiceRecipient = '',
  invoiceError = '',
  orderPrinterPdfUrl = '',
}) {
  const payer = resolvePayer(payload)
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const playerName = cleanString(payload.playerName || payload.customerName)
  const purchaseOrder = cleanString(payload.purchaseOrder)
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const internalAttachment = normalizeOrderAttachment(payload.attachment)
  const shippingOption = resolveShippingOption(payload, requiresShippingForOrder(payload))
  const orderName = cleanString(draftOrder?.name || order?.name)
  const invoiceUrl = normalizeDraftInvoiceUrl(draftOrder?.invoiceUrl)
  const orderLines = lines.map(formatInternalOrderLine).filter(Boolean)
  const salesRepLine =
    salesRep && salesRepEmail
      ? `Sales rep: ${salesRep} <${salesRepEmail}>`
      : salesRep || salesRepEmail
        ? `Sales rep: ${salesRep || salesRepEmail}`
        : ''

  return [
    'A Trinity manual order was submitted.',
    orderName ? `Order: ${orderName}` : '',
    orderSubmittedAt ? `Submitted: ${orderSubmittedAt}` : '',
    invoiceSent ? `Customer invoice sent to: ${invoiceRecipient || payer.email}` : '',
    !invoiceSent && invoiceError ? `Customer invoice error: ${invoiceError}` : '',
    !invoiceSent && !invoiceError ? 'Customer invoice was not sent automatically.' : '',
    invoiceUrl ? `Draft invoice link: ${invoiceUrl}` : '',
    orderPrinterPdfUrl ? `Order PDF: ${orderPrinterPdfUrl}` : '',
    salesRepLine,
    playerName ? `Player: ${playerName}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    cleanString(payload.playerEmail) ? `Player email: ${cleanString(payload.playerEmail)}` : '',
    cleanString(payload.playerPhone || payload.customerPhone)
      ? `Player phone: ${cleanString(payload.playerPhone || payload.customerPhone)}`
      : '',
    payer.name ? `Payer: ${payer.name}` : '',
    payer.email ? `Payer email: ${payer.email}` : '',
    payer.phone ? `Payer phone: ${payer.phone}` : '',
    payer.company ? `Team/agency: ${payer.company}` : '',
    payer.relationship ? `Relationship: ${payer.relationship}` : '',
    internalAttachment
      ? `ORDER ATTACHMENT — DOWNLOAD FILE: ${formatAttachmentLine(internalAttachment)}`
      : '',
    shippingOption
      ? `Shipping: ${formatSalesOrderShippingCharge(shippingOption)}`
      : 'Shipping: Local delivery / no shipping required',
    normalizeProductionTimeline(payload.productionTimeline) === 'rush'
      ? `Production timeline: Rush (${rushProductionSurchargeAmount} per bat)`
      : 'Production timeline: Normal',
    cleanString(payload.notes) ? `Internal notes: ${cleanString(payload.notes)}` : '',
    orderLines.length > 0 ? `Order lines:\n${orderLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatInternalOrderLine(line, index) {
  const quantity = Number(line?.quantity || 1)
  const details = [
    cleanString(line?.length) ? `${cleanString(line.length)} in` : '',
    cleanString(line?.targetWeight) ? `${cleanString(line.targetWeight)} oz` : '',
    cleanString(line?.wood),
    cleanString(line?.handleColor) ? `handle ${cleanString(line.handleColor)}` : '',
    cleanString(line?.barrelColor) ? `barrel ${cleanString(line.barrelColor)}` : '',
    cleanString(line?.logoColor) ? `logo ${cleanString(line.logoColor)}` : '',
    cleanString(line?.engraving) ? `engraving ${cleanString(line.engraving)}` : '',
    cleanString(line?.cupped),
    cleanString(line?.notes) ? `notes: ${cleanString(line.notes)}` : '',
  ].filter(Boolean)
  const title = cleanString(line?.title || line?.model) || 'Custom Trinity bat'
  const price = cleanString(line?.unitPrice) ? ` @ ${cleanString(line.unitPrice)}` : ''
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : ''
  return `${Number.isFinite(index) ? `${index + 1}. ` : '- '}${quantity} x ${title}${price}${suffix}`
}

async function sendInternalEmail({ to, subject, text, attachments = [] }) {
  const recipients = uniqueEmails(to)
  if (recipients.length === 0) return
  if (!internalEmailProviderApiKey) {
    throw new Error('Internal email provider is not configured. Set RESEND_API_KEY.')
  }
  if (!internalEmailFrom) {
    throw new Error('Internal email sender is not configured. Set TRINITY_INTERNAL_EMAIL_FROM.')
  }

  const body = {
    from: internalEmailFrom,
    to: recipients,
    subject,
    text,
    ...(internalEmailReplyTo ? { reply_to: internalEmailReplyTo } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  }

  const response = await fetch(internalEmailProviderUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalEmailProviderApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Internal email send failed (${response.status}): ${errorBody.slice(0, 500)}`,
    )
  }
}

async function sendInternalOrderCopyEmail({
  draftOrder = null,
  order = null,
  recipients,
  subject,
  text,
  orderPrinterPdfUrl = '',
  uploadedAttachment = null,
}) {
  if (internalEmailProviderApiKey && internalEmailFrom) {
    const pdfAttachment = await tryDownloadOrderPrinterProPdfAttachment({
      draftOrder,
      orderPrinterPdfUrl,
    })
    const uploadedEmailAttachment = await tryDownloadUploadedOrderEmailAttachment(uploadedAttachment)
    const attachments = [pdfAttachment, uploadedEmailAttachment].filter(Boolean)
    await sendInternalEmail({
      to: recipients,
      subject,
      text,
      attachments,
    })
    return {
      method: 'internal_email_provider',
      pdfAttached: Boolean(pdfAttachment),
      uploadedAttachmentAttached: Boolean(uploadedEmailAttachment),
    }
  }

  if (draftOrder?.id) {
    await sendShopifyInternalOrderCopies({
      sendInvoice: (emailInput) => sendDraftOrderInvoice(draftOrder.id, emailInput),
      recipients,
      subject,
      text,
    })
    return {
      method: 'shopify_draft_order_email',
      pdfAttached: false,
      uploadedAttachmentAttached: false,
    }
  }

  if (order?.id) {
    await sendShopifyInternalOrderCopies({
      sendInvoice: (emailInput) => sendOrderInvoice(order.id, emailInput),
      recipients,
      subject,
      text,
    })
    return {
      method: 'shopify_order_email',
      pdfAttached: false,
      uploadedAttachmentAttached: false,
    }
  }

  throw new Error('No order was available for internal order-copy email.')
}

async function tryDownloadOrderPrinterProPdfAttachment({ draftOrder, orderPrinterPdfUrl }) {
  if (!draftOrder?.id || !orderPrinterPdfUrl) return null

  try {
    return await downloadOrderPrinterProPdfAttachment({
      url: orderPrinterPdfUrl,
      filename: buildOrderPrinterProPdfFilename(draftOrder),
      maxBytes: orderPrinterProPdfMaxBytes,
      timeoutMs: orderPrinterProPdfTimeoutMs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PDF download error.'
    console.warn(`Order Printer Pro attachment skipped: ${message}`)
    return null
  }
}

async function tryDownloadUploadedOrderEmailAttachment(attachment) {
  if (!attachment?.downloadUrl) return null

  try {
    return await downloadUploadedOrderEmailAttachment({
      attachment,
      maxBytes: maxOrderAttachmentBytes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown attachment download error.'
    console.warn(`Uploaded order attachment skipped: ${message}`)
    return null
  }
}

async function sendShopifyInternalOrderCopies({ sendInvoice, recipients, subject, text }) {
  const uniqueRecipients = uniqueEmails(recipients)
  const failures = []

  for (const recipient of uniqueRecipients) {
    try {
      await sendInvoice({
        to: recipient,
        subject,
        customMessage: text,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Shopify email error.'
      failures.push(`${recipient}: ${message}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Internal Shopify copy email failures: ${failures.join('; ')}`)
  }
}

async function uploadOrderAttachmentToShopifyFiles({ filename, contentType, buffer }) {
  const cleanFilename = sanitizeAttachmentFilename(filename)
  const cleanContentType = cleanString(contentType) || 'application/octet-stream'
  const stagedTarget = await createShopifyStagedUploadTarget({
    filename: cleanFilename,
    contentType: cleanContentType,
    bytes: buffer.length,
  })
  await uploadBufferToShopifyStagedTarget({
    target: stagedTarget,
    filename: cleanFilename,
    contentType: cleanContentType,
    buffer,
  })
  const shopifyFile = await createShopifyGenericFile({
    filename: cleanFilename,
    originalSource: stagedTarget.resourceUrl,
  })

  return normalizeOrderAttachment({
    id: createPlainId('attachment'),
    shopifyFileId: shopifyFile.id,
    filename: cleanFilename,
    downloadUrl: shopifyFile.url,
    contentType: cleanContentType,
    bytes: buffer.length,
    uploadedAt: shopifyFile.createdAt || new Date().toISOString(),
    fileStatus: shopifyFile.fileStatus,
  })
}

async function createShopifyStagedUploadTarget({ filename, contentType, bytes }) {
  const result = await shopifyGraphQL(
    `
      mutation CreateAttachmentUploadTarget($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: [
        {
          filename,
          mimeType: contentType,
          httpMethod: 'POST',
          resource: 'FILE',
          fileSize: String(bytes),
        },
      ],
    },
  )

  const errors = result?.data?.stagedUploadsCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Attachment upload target error: ${errors.map((item) => item.message).join(', ')}`)
  }

  const target = result?.data?.stagedUploadsCreate?.stagedTargets?.[0]
  if (!target?.url || !target?.resourceUrl) {
    throw new Error('Shopify did not return an attachment upload target.')
  }

  return target
}

async function uploadBufferToShopifyStagedTarget({ target, filename, contentType, buffer }) {
  const formData = new FormData()
  for (const parameter of target.parameters ?? []) {
    formData.append(parameter.name, parameter.value)
  }
  formData.append('file', new Blob([buffer], { type: contentType }), filename)

  const response = await fetch(target.url, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Attachment upload failed (${response.status}): ${body.slice(0, 500)}`)
  }
}

async function createShopifyGenericFile({ filename, originalSource }) {
  const result = await shopifyGraphQL(
    `
      mutation CreateAttachmentFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
            ... on GenericFile {
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      files: [
        {
          alt: `Trinity manual order attachment: ${filename}`,
          contentType: 'FILE',
          originalSource,
          filename,
        },
      ],
    },
  )

  const errors = result?.data?.fileCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Attachment file create error: ${errors.map((item) => item.message).join(', ')}`)
  }

  const file = result?.data?.fileCreate?.files?.[0]
  if (!file?.id) {
    throw new Error('Shopify did not return an attachment file.')
  }

  const readyFile = file.url ? file : await waitForShopifyGenericFileUrl(file)
  if (!readyFile?.url) {
    throw new Error('Shopify did not return an attachment file URL.')
  }

  return readyFile
}

async function waitForShopifyGenericFileUrl(file) {
  let currentFile = file
  for (let attempt = 1; attempt < orderAttachmentFileUrlMaxAttempts; attempt += 1) {
    if (currentFile?.url) return currentFile
    if (cleanString(currentFile?.fileStatus).toUpperCase() === 'FAILED') {
      throw new Error('Shopify attachment file processing failed.')
    }

    await sleep(orderAttachmentFileUrlPollMs)
    currentFile = await getShopifyGenericFile(file.id)
  }

  return currentFile
}

async function getShopifyGenericFile(fileId) {
  const result = await shopifyGraphQL(
    `
      query GetAttachmentFile($id: ID!) {
        node(id: $id) {
          ... on GenericFile {
            id
            fileStatus
            alt
            createdAt
            url
          }
        }
      }
    `,
    { id: fileId },
  )

  return result?.data?.node ?? null
}

function normalizeOrderAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return null

  const filename = sanitizeAttachmentFilename(attachment.filename)
  const downloadUrl = cleanString(attachment.downloadUrl || attachment.url)
  const shopifyFileId = cleanString(attachment.shopifyFileId || attachment.fileId)
  if (!filename || !downloadUrl) return null

  return {
    id: cleanString(attachment.id) || createPlainId('attachment'),
    shopifyFileId,
    filename,
    downloadUrl,
    contentType: cleanString(attachment.contentType),
    bytes: Number(attachment.bytes) || 0,
    uploadedAt: cleanString(attachment.uploadedAt),
    fileStatus: cleanString(attachment.fileStatus),
  }
}

function normalizeOrderAttachmentFromAttributes(attributes) {
  return normalizeOrderAttachment({
    id: attributes.trinity_internal_attachment_id,
    shopifyFileId: attributes.trinity_internal_attachment_file_id,
    filename: attributes.trinity_internal_attachment_name,
    downloadUrl: attributes.trinity_internal_attachment_url,
    contentType: attributes.trinity_internal_attachment_type,
    bytes: attributes.trinity_internal_attachment_bytes,
  })
}

function formatAttachmentLine(attachment) {
  const normalized = normalizeOrderAttachment(attachment)
  if (!normalized) return ''
  return `${normalized.filename}: ${normalized.downloadUrl}`
}

function sanitizeAttachmentFilename(filename) {
  const parsed = path.parse(cleanString(filename) || 'attachment')
  const basename = parsed.name.replace(/[^a-z0-9._ -]+/gi, ' ').replace(/\s+/g, ' ').trim()
  const extension = parsed.ext.replace(/[^a-z0-9.]+/gi, '').slice(0, 16)
  return `${basename || 'attachment'}${extension}`.slice(0, 140)
}

function decodeAttachmentHeader(value) {
  const rawValue = cleanString(value)
  if (!rawValue) return ''

  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

function isMissingDraftInvoiceError(error) {
  return (
    error instanceof Error &&
    error.message === 'Could not find the submitted draft invoice in the production queue.'
  )
}

async function ensureDefinitions() {
  if (!definitionPromise) {
    definitionPromise = ensureDefinitionsInternal().catch((error) => {
      definitionPromise = null
      throw error
    })
  }

  return definitionPromise
}

function invalidateStateCache() {
  stateCacheValue = null
  stateCacheExpiresAt = 0
  stateCachePromise = null
}

function primeStateCache(value) {
  stateCacheValue = value
  stateCacheExpiresAt = Date.now() + stateCacheTtlMs
  stateCachePromise = null
  writeStateCacheFile(value)
}

async function getSharedState() {
  const now = Date.now()
  if (stateCacheValue && stateCacheExpiresAt > now) {
    return stateCacheValue
  }

  if (!stateCachePromise) {
    stateCachePromise = loadSharedState()
      .then((value) => {
        primeStateCache(value)
        return value
      })
      .finally(() => {
        stateCachePromise = null
      })
  }

  try {
    return await stateCachePromise
  } catch (error) {
    const fallback = getStateCacheFallback()
    if (fallback) return fallback
    throw error
  }
}

function arrayFromPayload(value) {
  return Array.isArray(value) ? value : []
}

function sanitizeBilletWorkflowRecord(record) {
  if (!record || typeof record !== 'object') return record
  const { location, ...billet } = record
  void location
  const status = ['production', 'in_production', 'consumed'].includes(
    cleanString(billet.status).toLowerCase(),
  )
    ? 'production'
    : 'storage'
  return { ...billet, status }
}

function sanitizeBatModelDataPoint(record) {
  if (!record || typeof record !== 'object') return record
  const { billetIds, sourceBilletStatuses, ...modelData } = record
  void billetIds
  void sourceBilletStatuses
  return {
    ...modelData,
    billetWeightMin: cleanString(modelData.billetWeightMin),
    billetWeightMax: cleanString(modelData.billetWeightMax),
  }
}

function normalizeStateSnapshot(value) {
  if (!value || typeof value !== 'object') return null

  return {
    ok: true,
    billets: arrayFromPayload(value.billets).map(sanitizeBilletWorkflowRecord),
    players: arrayFromPayload(value.players),
    producedBats: arrayFromPayload(value.producedBats).map(sanitizeBatModelDataPoint),
    customBatModels: arrayFromPayload(value.customBatModels),
    orderJobs: arrayFromPayload(value.orderJobs),
    billingContacts: arrayFromPayload(value.billingContacts),
    crmContacts: getManualCrmContactRecords(value.crmContacts),
  }
}

function writeStateCacheFile(value) {
  try {
    fs.mkdirSync(path.dirname(stateCacheFilePath), { recursive: true })
    fs.writeFileSync(
      stateCacheFilePath,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        value: normalizeStateSnapshot(value),
      }),
      'utf8',
    )
  } catch (error) {
    console.warn(
      `Unable to write Trinity state cache file: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
}

function readStateCacheFile() {
  try {
    if (!fs.existsSync(stateCacheFilePath)) return null
    const payload = JSON.parse(fs.readFileSync(stateCacheFilePath, 'utf8'))
    const savedAtMs = Date.parse(payload?.savedAt)
    if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > stateCacheStaleMaxAgeMs) {
      return null
    }

    return normalizeStateSnapshot(payload?.value)
  } catch (error) {
    console.warn(
      `Unable to read Trinity state cache file: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
    return null
  }
}

function getStateCacheFallback() {
  if (
    stateCacheValue &&
    stateCacheExpiresAt > 0 &&
    Date.now() - stateCacheExpiresAt <= stateCacheStaleMaxAgeMs
  ) {
    return normalizeStateSnapshot(stateCacheValue)
  }

  return readStateCacheFile()
}

function enqueueStateWrite(operation) {
  const queued = stateWriteQueue.catch(() => undefined).then(operation)
  stateWriteQueue = queued.catch(() => undefined)
  return queued
}

function getStateResourcePatchConfigs() {
  return [
    {
      key: 'billets',
      config: resourceConfigs.billets,
      getKey: (item) => item.barcode || item.id,
    },
    {
      key: 'players',
      config: resourceConfigs.players,
      getKey: (item) => item.id || `${item.profileKind}:${item.playerName}`,
    },
    {
      key: 'producedBats',
      config: resourceConfigs.producedBats,
      getKey: (item) => item.id || item.createdAt,
    },
    {
      key: 'customBatModels',
      config: resourceConfigs.customBatModels,
      getKey: (item) => item.id,
    },
    {
      key: 'orderJobs',
      config: resourceConfigs.orderJobs,
      getKey: (item) => item.id,
    },
    {
      key: 'billingContacts',
      config: resourceConfigs.billingContacts,
      getKey: (item) => item.id,
    },
    {
      key: 'crmContacts',
      config: resourceConfigs.crmContacts,
      getKey: (item) => item.id,
    },
  ]
}

function normalizeStatePatch(payload) {
  const patch = Object.fromEntries(
    getStateResourcePatchConfigs().map((entry) => [
      entry.key,
      arrayFromPayload(payload?.[entry.key]).filter(Boolean),
    ]),
  )
  patch.billets = patch.billets.map(sanitizeBilletWorkflowRecord)
  patch.producedBats = patch.producedBats.map(sanitizeBatModelDataPoint)
  patch.crmContacts = getManualCrmContactRecords(patch.crmContacts)
  patch.deletes = Object.fromEntries(
    getStateResourcePatchConfigs().map((entry) => [
      entry.key,
      arrayFromPayload(payload?.deletes?.[entry.key])
        .map((id) => cleanString(id))
        .filter(Boolean),
    ]),
  )
  patch.deletes.crmContacts = Array.from(
    new Set([
      ...arrayFromPayload(patch.deletes.crmContacts).map((id) => cleanString(id)).filter(Boolean),
      ...getDerivedCrmContactDeleteIds(payload?.crmContacts),
    ]),
  )

  return patch
}

function getChangedRecords(base, next, getKey) {
  const baseRecords = new Map()
  for (const item of arrayFromPayload(base)) {
    const key = cleanString(getKey(item))
    if (key) baseRecords.set(key, JSON.stringify(item))
  }

  return arrayFromPayload(next).filter((item) => {
    const key = cleanString(getKey(item))
    if (!key) return false
    return baseRecords.get(key) !== JSON.stringify(item)
  })
}

function buildStatePatchFromStates(baseState, nextState) {
  const patch = {}
  for (const entry of getStateResourcePatchConfigs()) {
    const changedRecords = getChangedRecords(
      baseState?.[entry.key],
      nextState?.[entry.key],
      entry.getKey,
    )
    if (changedRecords.length > 0) {
      patch[entry.key] = changedRecords
    }
  }
  const deletedCrmContactIds = getDerivedCrmContactDeleteIds(baseState?.crmContacts)
  if (deletedCrmContactIds.length > 0) {
    patch.deletes = {
      ...(patch.deletes ?? {}),
      crmContacts: deletedCrmContactIds,
    }
  }

  return patch
}

function applyStatePatchToCachedState(state, patch) {
  if (!state) return null

  const nextState = {
    ok: true,
    billets: arrayFromPayload(state.billets),
    players: arrayFromPayload(state.players),
    producedBats: arrayFromPayload(state.producedBats),
    customBatModels: arrayFromPayload(state.customBatModels),
    orderJobs: arrayFromPayload(state.orderJobs),
    billingContacts: arrayFromPayload(state.billingContacts),
    crmContacts: arrayFromPayload(state.crmContacts),
  }

  for (const entry of getStateResourcePatchConfigs()) {
    const items = arrayFromPayload(patch?.[entry.key])
    const deletedIds = new Set(arrayFromPayload(patch?.deletes?.[entry.key]).map((id) => cleanString(id)))
    if (deletedIds.size > 0) {
      nextState[entry.key] = nextState[entry.key].filter((item) => {
        const id = cleanString(item?.id)
        const key = cleanString(entry.getKey(item))
        return !deletedIds.has(id) && !deletedIds.has(key)
      })
    }
    if (items.length === 0) continue
    nextState[entry.key] = mergeRecordsByKey(nextState[entry.key], items, entry.getKey)
  }
  nextState.crmContacts = getManualCrmContactRecords(nextState.crmContacts)

  return nextState
}

async function applyStatePatch(payload, options = {}) {
  if (options.ensureDefinitions !== false) {
    await ensureDefinitions()
  }

  const patch = normalizeStatePatch(payload)
  if (patch.crmContacts.length > 0 || patch.deletes.crmContacts.length > 0) {
    const staleCrmContactIds = getDerivedCrmContactDeleteIds(
      await listRecords(resourceConfigs.crmContacts),
    )
    patch.deletes.crmContacts = Array.from(
      new Set([...patch.deletes.crmContacts, ...staleCrmContactIds]),
    )
  }
  const cachedStateBeforeWrite = stateCacheValue
  const applied = {}

  for (const entry of getStateResourcePatchConfigs()) {
    const items = patch[entry.key]
    const deletedIds = patch.deletes[entry.key]
    applied[entry.key] = items.length
    applied[`${entry.key}Deleted`] = deletedIds.length

    for (const id of deletedIds) {
      await deleteRecord(entry.config, id)
    }

    for (const item of items) {
      await upsertRecord(entry.config, item)
    }
  }

  if (patch.orderJobs.length > 0) {
    await syncOrderJobMetafields(patch.orderJobs)
  }

  const patchedCache = applyStatePatchToCachedState(cachedStateBeforeWrite, patch)
  const payloadSnapshot = normalizeStateSnapshot(payload?.stateSnapshot)
  if (patchedCache) {
    primeStateCache(patchedCache)
  } else if (payloadSnapshot) {
    primeStateCache(payloadSnapshot)
  } else {
    invalidateStateCache()
  }

  return { applied }
}

function mergeRecordsByKey(base, overrides, getKey) {
  const merged = new Map()

  for (const item of base) {
    const key = cleanString(getKey(item))
    if (key) merged.set(key, item)
  }

  for (const item of overrides) {
    const key = cleanString(getKey(item))
    if (key) merged.set(key, item)
  }

  return Array.from(merged.values())
}

function getGameModelBilletMatches(billets, { source, species, idealBilletWeight }) {
  const normalizedSource = cleanString(source)
  const normalizedSpecies = cleanString(species)
  const targetWeight = Number(idealBilletWeight)
  if (
    !billetSourceOptions.has(normalizedSource) ||
    !billetSpeciesOptions.has(normalizedSpecies) ||
    !Number.isFinite(targetWeight)
  ) {
    return []
  }

  return arrayFromPayload(billets)
    .map((billet) => {
      const billetWeight = Number(billet?.weight)
      const adjustedTargetWeight = getAdjustedTargetBilletWeight(
        normalizedSource,
        targetWeight,
        cleanString(billet?.source),
      )

      return { billet, billetWeight, adjustedTargetWeight }
    })
    .filter(({ billet, billetWeight, adjustedTargetWeight }) => (
      cleanString(billet?.status) === 'storage' &&
      isTruthy(billet?.mlbEligible) &&
      cleanString(billet?.hasBarrelKnot) !== 'Yes' &&
      cleanString(billet?.species) === normalizedSpecies &&
      Number.isFinite(billetWeight) &&
      Math.abs(billetWeight - adjustedTargetWeight) <= 0.5
    ))
    .sort((a, b) => {
      const aDifference = Math.abs(a.billetWeight - a.adjustedTargetWeight)
      const bDifference = Math.abs(b.billetWeight - b.adjustedTargetWeight)
      if (aDifference !== bDifference) return aDifference - bDifference
      return cleanString(a.billet?.source).localeCompare(cleanString(b.billet?.source))
    })
    .map(({ billet }) => billet)
}

function getAdjustedTargetBilletWeight(referenceSource, idealWeight, candidateSource) {
  const referenceIsOversized = isOversizedBilletSource(referenceSource)
  const candidateIsOversized = isOversizedBilletSource(candidateSource)

  if (referenceIsOversized === candidateIsOversized) return idealWeight
  return referenceIsOversized
    ? idealWeight - billetDiameterWeightCorrectionOz
    : idealWeight + billetDiameterWeightCorrectionOz
}

function primeCatalogCache(products) {
  catalogCacheValue = products
  catalogCacheExpiresAt = Date.now() + catalogCacheTtlMs
  catalogCachePromise = null
}

async function getCatalogSourceProducts() {
  const now = Date.now()
  if (catalogCacheValue && catalogCacheExpiresAt > now) {
    return { products: catalogCacheValue, cacheStatus: 'hit' }
  }

  if (!catalogCachePromise) {
    catalogCachePromise = listCatalogProducts()
      .then((products) => {
        primeCatalogCache(products)
        return { products, cacheStatus: 'refreshed' }
      })
      .finally(() => {
        catalogCachePromise = null
      })
  }

  try {
    return await catalogCachePromise
  } catch (error) {
    if (catalogCacheValue) {
      return { products: catalogCacheValue, cacheStatus: 'stale-fallback' }
    }

    throw error
  }
}

async function getCatalogProducts() {
  const { products, cacheStatus } = await getCatalogSourceProducts()
  return { products: products.filter(isBatProductLike), cacheStatus }
}

async function getSalesOrderCatalogProducts() {
  const { products, cacheStatus } = await getCatalogSourceProducts()
  return { products: products.filter(isSalesOrderCatalogProduct), cacheStatus }
}

async function loadSharedState() {
  await ensureDefinitions()
  const billets = (await listRecords(resourceConfigs.billets)).map(sanitizeBilletWorkflowRecord)
  const players = (await listRecords(resourceConfigs.players)).map((player) =>
    hydrateKnownProPlayerAffiliation(player),
  )
  const producedBats = (await listRecords(resourceConfigs.producedBats)).map(
    sanitizeBatModelDataPoint,
  )
  const customBatModels = await listRecords(resourceConfigs.customBatModels)
  const orderJobs = await listRecords(resourceConfigs.orderJobs)
  const billingContacts = await listRecords(resourceConfigs.billingContacts)
  const crmContacts = getManualCrmContactRecords(await listRecords(resourceConfigs.crmContacts))

  return {
    ok: true,
    billets,
    players,
    producedBats,
    customBatModels,
    orderJobs,
    billingContacts,
    crmContacts,
  }
}

async function getShoplyBatKnowledge() {
  const [state, catalog] = await Promise.all([loadShoplyKnowledgeState(), getCatalogProducts()])

  return {
    generatedAt: new Date().toISOString(),
    source: {
      shop: shopDomain,
      access: 'private-internal-export',
      purpose: 'Sanitized Trinity bat-selection knowledge export for an approved AI agent.',
    },
    usageRules: [
      'Use this private export as fit and product-selection guidance, not as a public inventory promise.',
      'Recommend only Trinity products, models, collections, or pages present in this export or the crawled Trinity storefront.',
      'Ask concise qualifying questions before recommending a bat when player size, level, current bat, or intended use is missing.',
      'Give one primary recommendation and one alternate when enough information is available.',
      'Do not quote internal counts as guaranteed live stock, and route final custom-build decisions to a Trinity team member.',
      'Do not mention customer names, orders, billet barcodes, billing contacts, or internal sales details.',
      'Do not publish this export to a public page or any unauthenticated crawler URL.',
    ],
    products: sanitizeShoplyProducts(catalog.products),
    customModelGuidance: buildCustomModelGuidance(state.customBatModels),
    producedBatGuidance: buildProducedBatGuidance(
      state.producedBats,
      state.customBatModels,
      catalog.products,
    ),
    savedFitPatterns: buildSavedFitPatterns(state.players),
    materialCapacity: buildMaterialCapacitySummary(state.billets),
  }
}

async function loadShoplyKnowledgeState() {
  await ensureDefinitions()
  const [billets, players, producedBats, customBatModels] = await Promise.all([
    listRecords(resourceConfigs.billets).then((records) =>
      records.map(sanitizeBilletWorkflowRecord),
    ),
    listRecords(resourceConfigs.players),
    listRecords(resourceConfigs.producedBats).then((records) =>
      records.map(sanitizeBatModelDataPoint),
    ),
    listRecords(resourceConfigs.customBatModels),
  ])

  return {
    billets,
    players,
    producedBats,
    customBatModels,
  }
}

function sanitizeShoplyProducts(products) {
  return arrayFromPayload(products)
    .filter((product) => cleanString(product.status).toUpperCase() !== 'DRAFT')
    .map((product) => ({
      name: cleanString(product.name),
      category: cleanString(product.category) || 'Uncategorized',
      url: cleanString(product.url),
      tags: arrayFromPayload(product.tags).map(cleanString).filter(Boolean).slice(0, 12),
      variants: arrayFromPayload(product.variants)
        .map((variant) => ({
          title: cleanString(variant.title),
          price: cleanString(variant.price),
          sku: cleanString(variant.sku),
        }))
        .filter((variant) => variant.title || variant.price || variant.sku)
        .slice(0, 12),
    }))
    .filter((product) => product.name)
    .sort((left, right) => left.name.localeCompare(right.name))
}

function buildCustomModelGuidance(customBatModels) {
  return arrayFromPayload(customBatModels)
    .map((model) => ({
      name: cleanString(model.name),
      category: cleanString(model.category),
      url: cleanString(model.url),
      compatibility: formatModelCompatibilityForKnowledge(model.compatibility),
    }))
    .filter((model) => model.name)
    .sort((left, right) => left.name.localeCompare(right.name))
}

function buildProducedBatGuidance(producedBats, customBatModels, products) {
  const productsById = new Map(arrayFromPayload(products).map((product) => [product.id, product]))
  const modelsById = new Map(arrayFromPayload(customBatModels).map((model) => [model.id, model]))
  const guidanceByKey = new Map()

  for (const record of arrayFromPayload(producedBats)) {
    const batType = cleanString(record.batType)
    if (!batType || batType === 'Trophy') continue

    const modelName = resolveKnowledgeModelName(record, modelsById, productsById)
    const length = cleanString(record.length)
    const finishedWeight = cleanString(record.weight)
    const billetWeight = cleanString(record.billetWeight)
    const billetWeightMin = cleanString(record.billetWeightMin)
    const billetWeightMax = cleanString(record.billetWeightMax)
    const billetGrade = cleanString(record.billetGrade)
    const cupped = cleanString(record.cupped)

    if (
      !modelName ||
      (!length &&
        !finishedWeight &&
        !billetWeight &&
        !billetWeightMin &&
        !billetWeightMax &&
        !billetGrade)
    ) {
      continue
    }

    const key = [
      modelName,
      batType,
      length,
      finishedWeight,
      billetWeight,
      billetWeightMin,
      billetWeightMax,
      billetGrade,
      cupped,
    ].join('|')
    const existing = guidanceByKey.get(key)
    guidanceByKey.set(key, {
      model: modelName,
      batType,
      length,
      finishedWeight,
      billetWeight,
      billetWeightMin,
      billetWeightMax,
      billetGrade,
      cupped,
      examples: (existing?.examples ?? 0) + 1,
    })
  }

  return Array.from(guidanceByKey.values()).sort((left, right) =>
    `${left.model} ${left.length}`.localeCompare(`${right.model} ${right.length}`),
  )
}

function resolveKnowledgeModelName(record, modelsById, productsById) {
  const shopifyProduct = productsById.get(cleanString(record.shopifyProductId))
  if (shopifyProduct?.name) return cleanString(shopifyProduct.name)

  const model =
    modelsById.get(cleanString(record.modelId)) || modelsById.get(cleanString(record.sourceModelId))
  if (model?.name) return cleanString(model.name)

  if (cleanString(record.modelId)) return cleanString(record.modelId)
  if (cleanString(record.sourceModelId)) return cleanString(record.sourceModelId)
  if (cleanString(record.customModelName)) return 'Internal custom model'
  return ''
}

function buildSavedFitPatterns(players) {
  const patternsByKey = new Map()

  for (const profile of arrayFromPayload(players)) {
    for (const bat of arrayFromPayload(profile.bats)) {
      const model = cleanString(bat.modelNumber)
      const length = cleanString(bat.length)
      const finishedWeight = cleanString(bat.weight)
      const woodTier = cleanString(bat.woodTier)
      const idealBilletWeight = cleanString(
        bat.idealBilletWeight ?? bat.optimalBilletWeight ?? bat.billetWeight,
      )

      if (!model && !length && !finishedWeight && !woodTier && !idealBilletWeight) continue

      const key = [model, length, finishedWeight, woodTier, idealBilletWeight].join('|')
      const existing = patternsByKey.get(key)
      patternsByKey.set(key, {
        model,
        length,
        finishedWeight,
        woodTier,
        idealBilletWeight,
        examples: (existing?.examples ?? 0) + 1,
      })
    }
  }

  return Array.from(patternsByKey.values()).sort((left, right) =>
    `${left.model} ${left.length}`.localeCompare(`${right.model} ${right.length}`),
  )
}

function buildMaterialCapacitySummary(billets) {
  const groups = new Map()

  for (const billet of arrayFromPayload(billets)) {
    const status = cleanString(billet.status)
    if (status && status !== 'storage') continue

    const species = cleanString(billet.species) || 'Unknown species'
    const grade = cleanString(billet.grade) || 'Unknown grade'
    const suitabilityCategories = arrayFromPayload(billet.suitabilityCategories)
      .map(cleanString)
      .filter(Boolean)
    const suitability =
      suitabilityCategories.length > 0
        ? suitabilityCategories.join(', ')
        : billet.trophyEligible
          ? 'Trophy'
          : billet.mlbEligible
            ? 'MLB capable'
            : 'Suitability not graded'
    const weight = Number(billet.weight)
    const weightBucket = getBilletWeightBucket(weight)
    const key = [species, grade, suitability, weightBucket].join('|')
    const existing = groups.get(key) ?? {
      species,
      grade,
      suitability,
      weightBucket,
      count: 0,
      minWeight: null,
      maxWeight: null,
    }

    existing.count += 1
    if (Number.isFinite(weight)) {
      existing.minWeight =
        existing.minWeight === null ? weight : Math.min(existing.minWeight, weight)
      existing.maxWeight =
        existing.maxWeight === null ? weight : Math.max(existing.maxWeight, weight)
    }
    groups.set(key, existing)
  }

  return Array.from(groups.values()).sort((left, right) =>
    `${left.species} ${left.grade} ${left.weightBucket}`.localeCompare(
      `${right.species} ${right.grade} ${right.weightBucket}`,
    ),
  )
}

function getBilletWeightBucket(weight) {
  if (!Number.isFinite(weight)) return 'weight unknown'
  if (weight < 85) return 'under 85 oz'
  if (weight < 90) return '85-89 oz'
  if (weight < 95) return '90-94 oz'
  if (weight < 100) return '95-99 oz'
  return '100+ oz'
}

function formatModelCompatibilityForKnowledge(compatibility = {}) {
  if (!compatibility || typeof compatibility !== 'object') return ''

  const weightRange = compatibility.billetWeightRange ?? {}
  const min = Number(weightRange.minOz)
  const max = Number(weightRange.maxOz)
  const rangeParts = []
  if (Number.isFinite(min)) rangeParts.push(`minimum billet weight ${min} oz`)
  if (Number.isFinite(max)) rangeParts.push(`maximum billet weight ${max} oz`)

  const species = Array.isArray(compatibility.species)
    ? compatibility.species.map(cleanString).filter(Boolean).join(', ')
    : cleanString(compatibility.species)
  const speciesText = species ? `species ${species}` : ''
  const dependencyText =
    typeof compatibility.speciesDependent === 'boolean'
      ? compatibility.speciesDependent
        ? 'species-specific fit'
        : 'species-flexible fit'
      : ''

  return [rangeParts.join(', '), speciesText, dependencyText].filter(Boolean).join('; ')
}

function renderShoplyBatKnowledgeMarkdown(knowledge) {
  const lines = [
    '# Trinity Bat Selector Private Knowledge Export',
    '',
    `Generated: ${knowledge.generatedAt}`,
    `Shop: ${knowledge.source.shop}`,
    `Access: ${knowledge.source.access}`,
    '',
    'This is a private sanitized export from the Trinity Billet Inventory system for an approved AI agent.',
    'It intentionally excludes customer records, billing contacts, order details, billet barcodes, and raw internal notes.',
    'Do not publish this export to a public web page, storefront page, or unauthenticated crawler URL.',
    '',
    '## How The Agent Should Use This',
    '',
    ...knowledge.usageRules.map((rule) => `- ${singleLine(rule)}`),
    '',
    '## Bat Selection Baseline',
    '',
    '- Start by identifying intended use: game bat, training bat, trophy/display bat, team order, or gift.',
    '- For game or training bats, ask for player age/level, height/weight, current bat length and weight, wood bat experience, preferred swing feel, and the biggest priority: durability, barrel size, control, power, or training use.',
    '- Treat billet material as production-fit guidance. Finished bat weight is not the same as billet input weight.',
    '- If a final build depends on inventory, model availability, or production judgment, ask the customer to confirm with Trinity.',
    '',
    '## Shopify Catalog Products',
    '',
    ...renderShoplyProducts(knowledge.products),
    '',
    '## Internal Model Compatibility Guidance',
    '',
    ...renderCustomModelGuidance(knowledge.customModelGuidance),
    '',
    '## Internal Produced-Bat Fit Examples',
    '',
    ...renderProducedBatGuidance(knowledge.producedBatGuidance),
    '',
    '## Anonymous Saved Fit Patterns',
    '',
    ...renderSavedFitPatterns(knowledge.savedFitPatterns),
    '',
    '## Sanitized Material Capacity Summary',
    '',
    'Use this only as internal fit context. Do not tell shoppers these are guaranteed live inventory counts.',
    '',
    ...renderMaterialCapacity(knowledge.materialCapacity),
    '',
  ]

  return `${lines.join('\n')}\n`
}

function renderShoplyProducts(products) {
  if (products.length === 0) return ['No catalog products are available in the feed.']

  return products.flatMap((product) => {
    const lines = [
      `### ${singleLine(product.name)}`,
      `- Category: ${singleLine(product.category)}`,
    ]
    if (product.url) lines.push(`- URL: ${singleLine(product.url)}`)
    if (product.tags.length > 0) lines.push(`- Tags: ${product.tags.map(singleLine).join(', ')}`)
    if (product.variants.length > 0) {
      lines.push(
        `- Variants: ${product.variants
          .map((variant) =>
            [variant.title, variant.price ? `$${variant.price}` : '', variant.sku]
              .filter(Boolean)
              .map(singleLine)
              .join(' / '),
          )
          .filter(Boolean)
          .join('; ')}`,
      )
    }
    return [...lines, '']
  })
}

function renderCustomModelGuidance(models) {
  if (models.length === 0) return ['No custom model compatibility records are available.']

  return models.flatMap((model) => {
    const lines = [`- ${singleLine(model.name)}`]
    if (model.category) lines.push(`  - Category: ${singleLine(model.category)}`)
    if (model.url) lines.push(`  - URL: ${singleLine(model.url)}`)
    if (model.compatibility) lines.push(`  - Compatibility: ${singleLine(model.compatibility)}`)
    return lines
  })
}

function renderProducedBatGuidance(records) {
  if (records.length === 0) return ['No model fit data points are available.']

  return records.map((record) => {
    const details = [
      record.batType,
      record.length ? `${record.length} in` : '',
      record.finishedWeight ? `${record.finishedWeight} oz finished` : '',
      record.billetWeight ? `${record.billetWeight} oz observed billet` : '',
      record.billetWeightMin && record.billetWeightMax
        ? `${record.billetWeightMin}-${record.billetWeightMax} oz workable billet range`
        : '',
      record.billetGrade ? `${record.billetGrade} billet grade` : '',
      record.cupped ? `cupped: ${record.cupped}` : '',
      record.examples > 1 ? `${record.examples} examples` : '',
    ]
      .filter(Boolean)
      .map(singleLine)
      .join('; ')

    return `- ${singleLine(record.model)}: ${details}`
  })
}

function renderSavedFitPatterns(patterns) {
  if (patterns.length === 0) return ['No anonymous saved fit patterns are available.']

  return patterns.map((pattern) => {
    const details = [
      pattern.length ? `${pattern.length} in` : '',
      pattern.finishedWeight ? `${pattern.finishedWeight} oz finished` : '',
      pattern.woodTier ? `${pattern.woodTier} wood tier` : '',
      pattern.idealBilletWeight ? `${pattern.idealBilletWeight} oz ideal billet` : '',
      pattern.examples > 1 ? `${pattern.examples} examples` : '',
    ]
      .filter(Boolean)
      .map(singleLine)
      .join('; ')

    return `- ${singleLine(pattern.model || 'Saved fit pattern')}: ${details}`
  })
}

function renderMaterialCapacity(capacity) {
  if (capacity.length === 0) return ['No storage billet material summary is available.']

  return capacity.map((item) => {
    const range =
      item.minWeight === null
        ? item.weightBucket
        : `${item.weightBucket}; observed ${item.minWeight}-${item.maxWeight} oz`

    return `- ${singleLine(item.species)} / ${singleLine(item.grade)} / ${singleLine(
      item.suitability,
    )} / ${singleLine(range)}: ${item.count} available material record${item.count === 1 ? '' : 's'}`
  })
}

function singleLine(value) {
  return cleanString(value).replace(/\s+/g, ' ')
}

async function ensureDefinitionsInternal() {
  for (const config of Object.values(resourceConfigs)) {
    await runWithShopifyRetry(async () => {
      const result = await shopifyGraphQL(
        `
            mutation CreateDefinition($definition: MetaobjectDefinitionCreateInput!) {
              metaobjectDefinitionCreate(definition: $definition) {
                metaobjectDefinition {
                  id
                  type
                }
                userErrors {
                  field
                  message
                  code
                }
              }
            }
        `,
        {
          definition: {
            name: config.name,
            type: config.type,
            access: {
              admin: 'MERCHANT_READ_WRITE',
              storefront: 'NONE',
            },
            displayNameKey: 'label',
            fieldDefinitions: [
              definitionField('label', 'Label', 'single_line_text_field'),
              definitionField('payload', 'Payload', 'json'),
              ...config.fieldDefinitions,
            ],
          },
        },
      )

      const errors = result?.data?.metaobjectDefinitionCreate?.userErrors ?? []
      throwIfRetryableShopifyUserErrors(errors, `Definition error for ${config.type}`)
      const meaningfulErrors = errors.filter((item) => {
        const message = String(item?.message ?? '').toLowerCase()
        return !message.includes('already exists') && !message.includes('already been taken')
      })

      if (meaningfulErrors.length > 0) {
        throw new Error(
          `Definition error for ${config.type}: ${meaningfulErrors
            .map((item) => item.message)
            .join(', ')}`,
        )
      }

      const definitionId =
        result?.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id ??
        (await getDefinitionByType(config.type))?.id

      if (!definitionId) {
        throw new Error(`Could not resolve definition id for ${config.type}`)
      }

      await ensureDefinitionFields(definitionId, config)
    })
  }
}

async function listRecords(config) {
  const nodes = await listMetaobjectNodes(config.type)
  return nodes
    .map((node) => node?.payload?.jsonValue)
    .filter(Boolean)
}

async function listMetaobjectNodes(type) {
  const nodes = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query ListMetaobjects($type: String!, $after: String) {
          metaobjects(type: $type, first: ${metaobjectsPageSize}, after: $after, sortKey: "updated_at", reverse: true) {
            nodes {
              id
              handle
              updatedAt
              payload: field(key: "payload") {
                jsonValue
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { type, after: cursor },
    )

    const connection = result?.data?.metaobjects
    nodes.push(...(connection?.nodes ?? []))
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return nodes
}

async function upsertRecords(config, items, options = {}) {
  const deleteMissing = options.deleteMissing ?? config.deleteMissing ?? true
  const desiredHandles = new Set()

  await mapWithConcurrency(items, 4, async (item) => {
    const handle = await upsertRecord(config, item)
    desiredHandles.add(handle)
  })

  if (!deleteMissing) return

  const existingNodes = await listMetaobjectNodes(config.type)
  const nodesToDelete = existingNodes.filter((node) => !desiredHandles.has(node.handle))

  await mapWithConcurrency(nodesToDelete, 4, async (node) => {
    const result = await shopifyGraphQL(
      `
        mutation DeleteMetaobject($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { id: node.id },
    )

    const errors = result?.data?.metaobjectDelete?.userErrors ?? []
    if (errors.length > 0) {
      throw new Error(
        `Metaobject delete error for ${config.type}/${node.handle}: ${errors
          .map((item) => item.message)
          .join(', ')}`,
      )
    }

    invalidateStateCache()
  })
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}

async function upsertRecord(config, item) {
  const handle = sanitizeHandle(item.id ?? config.labelFor(item))
  const result = await shopifyGraphQL(
    `
      mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      handle: {
        type: config.type,
        handle,
      },
      metaobject: {
        fields: [
          {
            key: 'label',
            value: config.labelFor(item),
          },
          {
            key: 'payload',
            value: JSON.stringify(item),
          },
          ...config.fieldsFor(item),
        ],
      },
    },
  )

  const errors = result?.data?.metaobjectUpsert?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Metaobject sync error for ${config.type}/${handle}: ${errors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  invalidateStateCache()
  return handle
}

async function deleteRecord(config, id) {
  const handle = sanitizeHandle(id)
  if (!handle) return false

  const existing = await shopifyGraphQL(
    `
      query MetaobjectIdByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
        }
      }
    `,
    {
      handle: {
        type: config.type,
        handle,
      },
    },
  )
  const metaobjectId = existing?.data?.metaobjectByHandle?.id
  if (!metaobjectId) return false

  const result = await shopifyGraphQL(
    `
      mutation DeleteMetaobject($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { id: metaobjectId },
  )
  const errors = result?.data?.metaobjectDelete?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Metaobject delete error for ${config.type}/${handle}: ${errors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  invalidateStateCache()
  return true
}

async function getDefinitionByType(type) {
  const result = await shopifyGraphQL(
    `
      query MetaobjectDefinitions {
        metaobjectDefinitions(first: 100) {
          nodes {
            id
            type
            fieldDefinitions {
              key
            }
          }
        }
      }
    `,
  )

  const nodes = result?.data?.metaobjectDefinitions?.nodes ?? []
  return nodes.find((node) => typeMatches(node.type, type)) ?? null
}

async function ensureDefinitionFields(definitionId, config) {
  const existing = await getDefinitionByType(config.type)
  const existingKeys = new Set(existing?.fieldDefinitions?.map((item) => item.key) ?? [])
  const missingFields = config.fieldDefinitions.filter((field) => !existingKeys.has(field.key))

  if (missingFields.length === 0) return

  const result = await shopifyGraphQL(
    `
      mutation UpdateDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition {
            id
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: definitionId,
      definition: {
        fieldDefinitions: missingFields.map((field) => ({
          create: field,
        })),
      },
    },
  )

  const errors = result?.data?.metaobjectDefinitionUpdate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(
      `Definition update error for ${config.type}: ${errors.map((item) => item.message).join(', ')}`,
    )
  }
}

async function shopifyGraphQL(query, variables = {}, attempt = 0) {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const body = await response.text()
    if (
      [429, 500, 502, 503, 504].includes(response.status) &&
      attempt < shopifyGraphqlMaxAttempts - 1
    ) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'))
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0
      await sleep(Math.max(retryAfterMs, getRetryDelayMs(attempt)))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    const shouldRetry = payload.errors.some((item) => isRetryableShopifyError(item))
    if (shouldRetry && attempt < shopifyGraphqlMaxAttempts - 1) {
      await sleep(getShopifyGraphQLRetryDelayMs(payload, attempt))
      return shopifyGraphQL(query, variables, attempt + 1)
    }
    throw new Error(payload.errors.map((item) => item.message).join(', '))
  }

  await maybePauseForShopifyThrottleBudget(payload)
  return payload
}

async function runWithShopifyRetry(operation, attempt = 0) {
  try {
    return await operation()
  } catch (error) {
    if (isRetryableShopifyError(error) && attempt < shopifyGraphqlMaxAttempts - 1) {
      await sleep(getRetryDelayMs(attempt))
      return runWithShopifyRetry(operation, attempt + 1)
    }

    throw error
  }
}

class RetryableShopifyError extends Error {}

function throwIfRetryableShopifyUserErrors(errors, context) {
  if (!errors.some((item) => isRetryableShopifyError(item))) return

  throw new RetryableShopifyError(
    `${context}: ${errors.map((item) => item?.message ?? 'Shopify is throttling').join(', ')}`,
  )
}

function isRetryableShopifyError(item) {
  if (item instanceof RetryableShopifyError) return true
  const code = item?.extensions?.code ?? item?.code
  return code === 'THROTTLED' || /throttled|temporarily unavailable|try again/i.test(item?.message ?? '')
}

function getShopifyGraphQLRetryDelayMs(payload, attempt) {
  const cost = payload?.extensions?.cost
  const throttleStatus = cost?.throttleStatus
  const requestedCost = Number(cost?.requestedQueryCost)
  const available = Number(throttleStatus?.currentlyAvailable)
  const restoreRate = Number(throttleStatus?.restoreRate)

  if (
    Number.isFinite(requestedCost) &&
    Number.isFinite(available) &&
    Number.isFinite(restoreRate) &&
    restoreRate > 0
  ) {
    const deficit = Math.max(0, requestedCost - available)
    return Math.max(1500, Math.ceil((deficit / restoreRate) * 1000) + 750)
  }

  return getRetryDelayMs(attempt)
}

async function maybePauseForShopifyThrottleBudget(payload) {
  const cost = payload?.extensions?.cost
  const throttleStatus = cost?.throttleStatus
  const requestedCost = Number(cost?.requestedQueryCost)
  const available = Number(throttleStatus?.currentlyAvailable)
  const restoreRate = Number(throttleStatus?.restoreRate)

  if (
    !Number.isFinite(requestedCost) ||
    !Number.isFinite(available) ||
    !Number.isFinite(restoreRate) ||
    restoreRate <= 0
  ) {
    return
  }

  const targetAvailable = Math.max(requestedCost * 2, 150)
  if (available >= targetAvailable) return

  const deficit = targetAvailable - available
  const waitMs = Math.ceil((deficit / restoreRate) * 1000) + 250
  await sleep(Math.max(waitMs, 250))
}

function getRetryDelayMs(attempt) {
  return Math.min(1000 * 2 ** attempt, 10000)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function listCatalogProducts() {
  const allProducts = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage && allProducts.length < 250) {
    const result = await shopifyGraphQL(
      `
        query CatalogProducts($cursor: String) {
          products(first: 100, after: $cursor, sortKey: TITLE) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
              status
              productType
              tags
              onlineStoreUrl
              featuredImage {
                url
              }
              variants(first: 50) {
                nodes {
                  id
                  title
                  price
                  inventoryQuantity
                  sku
                }
              }
            }
          }
        }
      `,
      { cursor },
    )

    const connection = result?.data?.products
    const nodes = connection?.nodes ?? []
    allProducts.push(
      ...nodes.map((product) => ({
          id: product.id,
          name: product.title,
          category: product.productType || 'Uncategorized',
          handle: product.handle,
          url: product.onlineStoreUrl || `https://${shopDomain}/products/${product.handle}`,
          status: product.status,
          tags: product.tags ?? [],
          imageUrl: product.featuredImage?.url ?? '',
          orderItemType: isShirtProductLike(product) ? 'shirt' : 'bat',
          variants: (product.variants?.nodes ?? []).map((variant) => ({
            id: variant.id,
            title: variant.title,
            price: cleanString(variant.price),
            inventoryQuantity: variant.inventoryQuantity ?? 0,
            sku: variant.sku ?? '',
          })),
        })),
    )

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return allProducts
}

async function createDraftOrder(input) {
  const result = await shopifyGraphQL(
    `
      mutation CreateSalesDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            poNumber
            invoiceUrl
            email
            createdAt
            updatedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingLine {
              title
              originalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            customer {
              id
              displayName
              email
            }
            shippingAddress {
              name
            }
            lineItems(first: 50) {
              nodes {
                id
                name
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                product {
                  id
                  title
                  productType
                }
                variant {
                  id
                  title
                  sku
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input },
  )

  const errors = result?.data?.draftOrderCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Draft order error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return normalizeDraftOrderInvoiceUrl(result?.data?.draftOrderCreate?.draftOrder)
}

async function createPendingOrder(order, options = {}) {
  const result = await shopifyGraphQL(
    `
      mutation CreatePendingSalesOrder(
        $order: OrderCreateOrderInput!
        $options: OrderCreateOptionsInput
      ) {
        orderCreate(order: $order, options: $options) {
          order {
            id
            name
            poNumber
            email
            createdAt
            updatedAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
            customAttributes {
              key
              value
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              displayName
              email
            }
            shippingAddress {
              name
            }
            lineItems(first: 50) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  title
                  sku
                  product {
                    id
                    title
                    productType
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      order,
      options: {
        inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
        sendReceipt: Boolean(options.sendReceipt),
        sendFulfillmentReceipt: false,
      },
    },
  )

  const errors = result?.data?.orderCreate?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Shopify order error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return result?.data?.orderCreate?.order
}

async function completeDraftOrderAsPending(draftOrderId) {
  const result = await shopifyGraphQL(
    `
      mutation CompleteSalesDraftOrder($id: ID!) {
        draftOrderComplete(id: $id) {
          draftOrder {
            id
            name
            poNumber
            status
            order {
              id
              name
              email
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              tags
              note
              customAttributes {
                key
                value
              }
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                displayName
                email
              }
              lineItems(first: 50) {
                nodes {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  originalTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    title
                    sku
                    product {
                      id
                      title
                      productType
                    }
                  }
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: draftOrderId },
  )

  const errors = result?.data?.draftOrderComplete?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Draft order completion error: ${errors.map((item) => item.message).join(', ')}`)
  }

  return result?.data?.draftOrderComplete?.draftOrder
}

async function sendDraftOrderInvoice(draftOrderId, emailInput) {
  const result = await shopifyGraphQL(
    `
      mutation SendDraftOrderInvoice($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: draftOrderId, email: emailInput },
  )

  const errors = result?.data?.draftOrderInvoiceSend?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Invoice send error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

async function sendOrderInvoice(orderId, emailInput) {
  const result = await shopifyGraphQL(
    `
      mutation SendOrderInvoice($orderId: ID!, $email: EmailInput) {
        orderInvoiceSend(id: $orderId, email: $email) {
          order {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { orderId, email: emailInput },
  )

  const errors = result?.data?.orderInvoiceSend?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Order invoice send error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

async function listOrdersUpdatedSince(sinceDate) {
  const rows = []
  let cursor = null
  let hasNextPage = true
  const query = sinceDate ? `updated_at:>=${sinceDate.toISOString().slice(0, 10)}` : null

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query SalesPaymentReconciliation($after: String, $query: String) {
          orders(
            first: 100
            after: $after
            query: $query
            sortKey: UPDATED_AT
            reverse: true
          ) {
            nodes {
              id
              name
              email
              createdAt
              updatedAt
              sourceName
              displayFinancialStatus
              tags
              customAttributes {
                key
                value
              }
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                displayName
                email
              }
              billingAddress {
                name
                company
              }
              transactions(first: 100) {
                id
                kind
                status
                processedAt
                amountSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after: cursor, query },
    )

    const connection = result?.data?.orders
    rows.push(...(connection?.nodes ?? []))
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return rows
}

async function listCompletedDraftOrdersUpdatedSince(sinceDate) {
  const rows = []
  let cursor = null
  let hasNextPage = true
  const query = sinceDate
    ? `status:completed updated_at:>=${sinceDate.toISOString().slice(0, 10)}`
    : 'status:completed'

  try {
    while (hasNextPage) {
      const result = await shopifyGraphQL(
        `
          query SalesPaymentDraftOrders($after: String, $query: String!) {
            draftOrders(
              first: 100
              after: $after
              query: $query
              sortKey: UPDATED_AT
              reverse: true
            ) {
              nodes {
                id
                name
                createdAt
                completedAt
                order {
                  id
                  name
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        { after: cursor, query },
      )

      const connection = result?.data?.draftOrders
      rows.push(...(connection?.nodes ?? []))
      hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
      cursor = connection?.pageInfo?.endCursor ?? null
    }
  } catch (error) {
    console.warn(
      `Completed draft history could not be added to sales reconciliation: ${
        error instanceof Error ? error.message : 'Unknown Shopify error'
      }`,
    )
  }

  return rows
}

async function listDraftOrdersSubmittedInsideWindow(requestedWindow) {
  const rows = []
  let cursor = null
  let hasNextPage = true
  const throughDate = new Date(requestedWindow.through)
  throughDate.setUTCDate(throughDate.getUTCDate() + 1)
  const queryParts = [`created_at:<=${throughDate.toISOString().slice(0, 10)}`]
  if (requestedWindow.since) {
    const sinceDate = new Date(requestedWindow.since)
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 1)
    queryParts.unshift(`created_at:>=${sinceDate.toISOString().slice(0, 10)}`)
  }
  const query = queryParts.join(' ')

  while (hasNextPage) {
    const result = await shopifyGraphQL(
      `
        query SalesSubmissionDraftOrders($after: String, $query: String!) {
          draftOrders(
            first: 100
            after: $after
            query: $query
            sortKey: UPDATED_AT
            reverse: true
          ) {
            nodes {
              id
              name
              status
              createdAt
              completedAt
              tags
              note2
              customAttributes {
                key
                value
              }
              customer {
                displayName
                email
              }
              billingAddress {
                name
                company
              }
              order {
                id
                name
                displayFinancialStatus
                tags
                note
                customAttributes {
                  key
                  value
                }
              }
              lineItems(first: 250) {
                nodes {
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after: cursor, query },
    )

    const connection = result?.data?.draftOrders
    rows.push(...(connection?.nodes ?? []))
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage)
    cursor = connection?.pageInfo?.endCursor ?? null
  }

  return rows
}

function getSalesPaymentOrderJobs(order, orderJobs, orderAttributes) {
  const orderId = extractNumericId(order?.id)
  const orderName = cleanString(order?.name)
  const intakeId = cleanString(orderAttributes?.trinity_intake_id)

  return arrayFromPayload(orderJobs).filter((job) => {
    if (job?.origin !== 'internal_sales') return false

    const matchesOrderId = orderId && extractNumericId(job?.shopifyOrderId) === orderId
    const matchesOrderName = orderName && cleanString(job?.shopifyOrderName) === orderName
    const matchesIntake = intakeId && cleanString(job?.intakeId) === intakeId
    return Boolean(matchesOrderId || matchesOrderName || matchesIntake)
  })
}

function hasInventorySalesPaymentMarker(order, orderAttributes, matchingJobs) {
  if (orderAttributes?.trinity_origin === 'internal_sales') return true
  if (matchingJobs.length > 0) return true

  return arrayFromPayload(order?.tags).some((tag) =>
    ['internal sales', 'trinity intake'].includes(cleanString(tag).toLowerCase()),
  )
}

function mapOrderToSalesPayment(order, orderJobs, completedDraftOrder) {
  const orderAttributes = attributesToRecord(order?.customAttributes)
  const matchingJobs = getSalesPaymentOrderJobs(order, orderJobs, orderAttributes)
  const hasInventoryMarker = hasInventorySalesPaymentMarker(
    order,
    orderAttributes,
    matchingJobs,
  )
  const paymentSource = classifyPaidInvoiceSource(order?.sourceName, hasInventoryMarker)
  if (!paymentSource) return null

  const money =
    order?.currentTotalPriceSet?.shopMoney ?? order?.totalPriceSet?.shopMoney ?? {}
  const total = Number(money.amount)
  const paidAt = getSuccessfulPaymentTimestamp(order?.transactions, total)
  if (!paidAt) return null

  const firstJob = matchingJobs[0] ?? {}
  const submittedAt = getEarlierOrderTimestamp(
    orderAttributes.trinity_order_submitted_at,
    ...matchingJobs.flatMap((job) => [job?.orderSubmittedAt, job?.createdAt]),
    completedDraftOrder?.createdAt,
    order?.createdAt,
  )

  return {
    orderId: cleanString(order?.id),
    orderName: cleanString(order?.name),
    draftOrderId:
      cleanString(firstJob?.shopifyDraftOrderId) ||
      cleanString(orderAttributes.trinity_draft_order_id) ||
      cleanString(completedDraftOrder?.id),
    draftOrderName:
      cleanString(firstJob?.shopifyDraftOrderName) || cleanString(completedDraftOrder?.name),
    intakeId: cleanString(firstJob?.intakeId) || cleanString(orderAttributes.trinity_intake_id),
    salesRep: cleanString(orderAttributes.trinity_sales_rep) || cleanString(firstJob?.salesRep),
    salesRepEmail:
      normalizeEmail(orderAttributes.trinity_sales_rep_email) ||
      normalizeEmail(firstJob?.salesRepEmail),
    customerName:
      cleanString(firstJob?.playerName) ||
      cleanString(firstJob?.customerName) ||
      cleanString(order?.customer?.displayName),
    payerName:
      cleanString(firstJob?.billingName) ||
      cleanString(order?.billingAddress?.name) ||
      cleanString(order?.billingAddress?.company) ||
      cleanString(order?.customer?.displayName),
    submittedAt,
    paidAt,
    total: Number.isFinite(total) ? total : 0,
    currency: cleanString(money.currencyCode) || shopCurrencyCode,
    financialStatus: cleanString(order?.displayFinancialStatus),
    paymentSource,
  }
}

function mapOrderToWebsiteOrder(order) {
  if (!isWebsiteOrderSource(order?.sourceName)) return null

  const money =
    order?.currentTotalPriceSet?.shopMoney ?? order?.totalPriceSet?.shopMoney ?? {}
  const total = Number(money.amount)

  return {
    orderId: cleanString(order?.id),
    orderName: cleanString(order?.name),
    sourceName: cleanString(order?.sourceName),
    customerName:
      cleanString(order?.customer?.displayName) ||
      cleanString(order?.billingAddress?.name) ||
      cleanString(order?.email),
    orderedAt: cleanString(order?.createdAt),
    paidAt: getSuccessfulPaymentTimestamp(order?.transactions, total),
    total: Number.isFinite(total) ? total : 0,
    currency: cleanString(money.currencyCode) || shopCurrencyCode,
    financialStatus: cleanString(order?.displayFinancialStatus),
  }
}

async function getSalesPaymentReconciliation(
  requestedWindow = resolveSalesDashboardWindow({ range: '30' }),
) {
  const now = Date.now()
  const cacheKey = requestedWindow.cacheKey
  const cached = salesPaymentReconciliationCache.get(cacheKey)
  if (cached?.expiresAt > now) return cached.report
  if (salesPaymentReconciliationPromises.has(cacheKey)) {
    return salesPaymentReconciliationPromises.get(cacheKey)
  }

  for (const [key, entry] of salesPaymentReconciliationCache) {
    if (entry.expiresAt <= now) salesPaymentReconciliationCache.delete(key)
  }

  const reportPromise = (async () => {
    const through = new Date(requestedWindow.through)
    const since = requestedWindow.since ? new Date(requestedWindow.since) : null
    const [orders, state, completedDraftOrders, submittedDraftOrders] = await Promise.all([
      listOrdersUpdatedSince(since),
      getSharedState(),
      listCompletedDraftOrdersUpdatedSince(since),
      listDraftOrdersSubmittedInsideWindow(requestedWindow),
    ])
    const completedDraftsByOrderId = new Map(
      completedDraftOrders
        .filter((draftOrder) => cleanString(draftOrder?.order?.id))
        .map((draftOrder) => [cleanString(draftOrder.order.id), draftOrder]),
    )
    const payments = orders
      .map((order) =>
        mapOrderToSalesPayment(
          order,
          state.orderJobs,
          completedDraftsByOrderId.get(cleanString(order?.id)),
        ),
      )
      .filter((payment) =>
        isTimestampInsideSalesDashboardWindow(payment?.paidAt, requestedWindow),
      )
      .sort((first, second) => Date.parse(second.paidAt) - Date.parse(first.paidAt))
    const websiteOrders = orders
      .map((order) => mapOrderToWebsiteOrder(order))
      .filter((order) =>
        isTimestampInsideSalesDashboardWindow(order?.orderedAt, requestedWindow),
      )
      .sort((first, second) => Date.parse(second.orderedAt) - Date.parse(first.orderedAt))
    const submissions = buildUnifiedSalesSubmissions(
      state.orderJobs,
      submittedDraftOrders,
      salesPortalTeamMembers,
    ).filter((submission) =>
      isTimestampInsideSalesDashboardWindow(submission?.submittedAt, requestedWindow),
    )
    const teamLeaderboardRows = buildSalesLeaderboardFromSubmissions(
      submissions,
      salesPortalTeamMembers,
      {
        sinceMs: since ? since.getTime() : Number.NEGATIVE_INFINITY,
        throughMs: through.getTime(),
      },
    )

    const report = {
      ok: true,
      range: requestedWindow.range,
      windowKey: cacheKey,
      windowDays: requestedWindow.windowDays,
      since: since?.toISOString() ?? '',
      through: through.toISOString(),
      refreshedAt: new Date().toISOString(),
      source: 'shopify_successful_sale_capture_transactions',
      submissions,
      orders: payments,
      websiteOrders,
      teamLeaderboardRows,
    }
    salesPaymentReconciliationCache.set(cacheKey, {
      report,
      expiresAt: Date.now() + salesPaymentReconciliationCacheTtlMs,
    })
    return report
  })()
  salesPaymentReconciliationPromises.set(cacheKey, reportPromise)

  try {
    return await reportPromise
  } finally {
    if (salesPaymentReconciliationPromises.get(cacheKey) === reportPromise) {
      salesPaymentReconciliationPromises.delete(cacheKey)
    }
  }
}

function invalidateSalesPaymentReconciliationCache() {
  salesPaymentReconciliationCache.clear()
  salesPaymentReconciliationPromises.clear()
}

async function listRecentOrders(first) {
  const result = await shopifyGraphQL(
    `
      query RecentOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            email
            createdAt
            updatedAt
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
            customAttributes {
              key
              value
            }
            internalAttachment: metafield(namespace: "trinity", key: "internal_attachment") {
              jsonValue
            }
            internalAttachmentNotifications: metafield(
              namespace: "trinity"
              key: "internal_attachment_notifications"
            ) {
              jsonValue
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              displayName
              email
            }
            shippingAddress {
              name
            }
            lineItems(first: 50) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  title
                  sku
                  product {
                    id
                    title
                    productType
                  }
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `,
    { first },
  )

  return result?.data?.orders?.nodes ?? []
}

async function listRecentCompletedDraftOrders(first) {
  try {
    const result = await shopifyGraphQL(
      `
        query RecentCompletedDraftOrders($first: Int!) {
          draftOrders(
            first: $first
            sortKey: UPDATED_AT
            reverse: true
            query: "status:completed"
          ) {
            nodes {
              id
              name
              createdAt
              completedAt
              order {
                id
                name
              }
            }
          }
        }
      `,
      { first },
    )

    return result?.data?.draftOrders?.nodes ?? []
  } catch (error) {
    console.warn(
      `Completed draft order history could not be loaded: ${
        error instanceof Error ? error.message : 'Unknown Shopify error'
      }`,
    )
    return []
  }
}

function linkCompletedDraftMetadataToOrderJobs(jobs, draftOrders) {
  const draftsByOrderId = new Map(
    arrayFromPayload(draftOrders)
      .filter((draftOrder) => cleanString(draftOrder?.order?.id))
      .map((draftOrder) => [cleanString(draftOrder.order.id), draftOrder]),
  )

  return arrayFromPayload(jobs).map((job) => {
    const draftOrder = draftsByOrderId.get(cleanString(job?.shopifyOrderId))
    if (!draftOrder) return job
    return {
      ...job,
      shopifyDraftOrderId: cleanString(job.shopifyDraftOrderId) || cleanString(draftOrder.id),
      shopifyDraftOrderName:
        cleanString(job.shopifyDraftOrderName) || cleanString(draftOrder.name),
      orderSubmittedAt:
        cleanString(job.orderSubmittedAt) === cleanString(job.createdAt)
          ? cleanString(draftOrder.createdAt) || cleanString(job.orderSubmittedAt)
          : cleanString(job.orderSubmittedAt) || cleanString(draftOrder.createdAt),
    }
  })
}

async function registerWebhook(topic, uri) {
  const result = await shopifyGraphQL(
    `
      mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
            topic
            uri
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      topic,
      webhookSubscription: {
        uri,
      },
    },
  )

  const errors = result?.data?.webhookSubscriptionCreate?.userErrors ?? []
  const meaningfulErrors = errors.filter((item) => {
    const message = String(item?.message ?? '').toLowerCase()
    return !message.includes('already') && !message.includes('taken')
  })

  if (meaningfulErrors.length > 0) {
    throw new Error(
      `Webhook subscription error for ${topic}: ${meaningfulErrors
        .map((item) => item.message)
        .join(', ')}`,
    )
  }

  return (
    result?.data?.webhookSubscriptionCreate?.webhookSubscription ?? {
      topic,
      uri,
      alreadyRegistered: errors.length > 0,
    }
  )
}

async function syncOrderJobMetafields(orderJobs) {
  const jobsWithOrders = orderJobs.filter((job) => job.shopifyOrderId)
  for (const job of jobsWithOrders) {
    const ownerId = toShopifyGid('Order', job.shopifyOrderId)
    const metafields = [
      orderMetafield(ownerId, 'production_job_id', job.id),
      orderMetafield(ownerId, 'production_status', job.productionStatus),
      orderMetafield(ownerId, 'assigned_billet', job.assignedBilletId),
      orderMetafield(ownerId, 'order_submitted_at', job.orderSubmittedAt),
      orderMetafield(ownerId, 'sales_rep', job.salesRep),
      orderMetafield(ownerId, 'sales_rep_email', job.salesRepEmail),
      orderMetafield(
        ownerId,
        'sales_rep_submission_notification_sent_at',
        job.salesRepSubmissionNotificationSentAt,
      ),
      orderMetafield(
        ownerId,
        'sales_rep_paid_notification_sent_at',
        job.salesRepPaidNotificationSentAt,
      ),
      orderMetafield(ownerId, 'player_name', job.playerName),
      orderMetafield(ownerId, 'player_profile_id', job.playerProfileId),
      orderMetafield(ownerId, 'player_email', job.playerEmail),
      orderMetafield(ownerId, 'billing_name', job.billingName),
      orderMetafield(ownerId, 'billing_email', job.billingEmail),
      orderMetafield(ownerId, 'billing_phone', job.billingPhone),
      orderMetafield(ownerId, 'billing_company', job.billingCompany),
      orderMetafield(ownerId, 'billing_relationship', job.billingRelationship),
      job.internalAttachment
        ? {
            namespace: 'trinity',
            key: 'internal_attachment',
            ownerId,
            type: 'json',
            value: JSON.stringify(job.internalAttachment),
          }
        : null,
      job.internalAttachment?.downloadUrl
        ? {
            namespace: 'trinity',
            key: 'internal_attachment_url',
            ownerId,
            type: 'single_line_text_field',
            value: job.internalAttachment.downloadUrl,
          }
        : null,
      normalizeInternalAttachmentNotifications(job.internalAttachmentNotifications).length > 0
        ? {
            namespace: 'trinity',
            key: 'internal_attachment_notifications',
            ownerId,
            type: 'json',
            value: JSON.stringify(
              normalizeInternalAttachmentNotifications(job.internalAttachmentNotifications),
            ),
          }
        : null,
      {
        namespace: 'trinity',
        key: 'specs',
        ownerId,
        type: 'json',
        value: JSON.stringify(job.specs ?? {}),
      },
    ].filter((field) => field && field.value !== undefined && field.value !== null && field.value !== '')

    if (metafields.length === 0) continue

    const result = await shopifyGraphQL(
      `
        mutation SetOrderMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              namespace
              value
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { metafields },
    )

    const errors = result?.data?.metafieldsSet?.userErrors ?? []
    if (errors.length > 0) {
      throw new Error(`Order metafield sync error: ${errors.map((item) => item.message).join(', ')}`)
    }
  }
}

function setAnalyticsCorsHeaders(response) {
  response.set('Access-Control-Allow-Origin', '*')
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Content-Type')
  response.set('Access-Control-Max-Age', '86400')
}

function normalizeAnalyticsEvent(rawEvent, request) {
  if (!rawEvent || typeof rawEvent !== 'object') return null

  const name = cleanString(rawEvent.name || rawEvent.eventName).slice(0, 96)
  if (!name) return null

  const attribution = normalizeAttribution(rawEvent.attribution ?? {})
  const context = normalizeAnalyticsContext(rawEvent.context ?? {}, request)
  const visitorId = cleanString(rawEvent.visitorId || attribution.visitorId || rawEvent.clientId)
    .slice(0, 128)
  const sessionId =
    cleanString(rawEvent.sessionId || attribution.sessionId || context.sessionId).slice(0, 128) ||
    createPlainId('session')
  const eventId =
    cleanString(rawEvent.id || rawEvent.eventId).slice(0, 128) ||
    crypto
      .createHash('sha256')
      .update(`${sessionId}:${name}:${rawEvent.timestamp || Date.now()}`)
      .digest('hex')
      .slice(0, 32)
  const timestamp = normalizeIsoDate(rawEvent.timestamp) || new Date().toISOString()

  return {
    id: eventId,
    name,
    timestamp,
    receivedAt: new Date().toISOString(),
    clientId: cleanString(rawEvent.clientId).slice(0, 128),
    sessionId,
    visitorId: visitorId || sessionId,
    attribution,
    context,
    data: rawEvent.data && typeof rawEvent.data === 'object' ? rawEvent.data : {},
    customerEmailHash: hashEmail(extractEmailFromAnalyticsEvent(rawEvent)),
  }
}

function normalizeAttribution(value) {
  const attribution = value && typeof value === 'object' ? value : {}
  const first = attribution.first && typeof attribution.first === 'object' ? attribution.first : {}
  const last = attribution.last && typeof attribution.last === 'object' ? attribution.last : {}

  return {
    sessionId: cleanString(attribution.sessionId).slice(0, 128),
    visitorId: cleanString(attribution.visitorId).slice(0, 128),
    device: cleanString(attribution.device).slice(0, 64),
    first: normalizeTouchpoint(first),
    last: normalizeTouchpoint(last),
    path: Array.isArray(attribution.path)
      ? attribution.path.map(normalizePathEntry).filter(Boolean).slice(-50)
      : [],
  }
}

function normalizeTouchpoint(value) {
  return {
    source: normalizeTrafficSource(value.source).slice(0, 128),
    medium: cleanString(value.medium).slice(0, 128),
    campaign: cleanString(value.campaign).slice(0, 128),
    content: cleanString(value.content).slice(0, 128),
    term: cleanString(value.term).slice(0, 128),
    landingPage: cleanString(value.landingPage).slice(0, 512),
    referrer: cleanString(value.referrer).slice(0, 512),
    capturedAt: normalizeIsoDate(value.capturedAt) || '',
  }
}

function normalizePathEntry(value) {
  if (!value || typeof value !== 'object') return null
  const path = cleanString(value.path).slice(0, 512)
  const url = cleanString(value.url).slice(0, 512)
  if (!path && !url) return null
  return {
    path,
    url,
    title: cleanString(value.title).slice(0, 256),
    at: normalizeIsoDate(value.at) || '',
  }
}

function normalizeAnalyticsContext(value, request) {
  const context = value && typeof value === 'object' ? value : {}
  const document = context.document && typeof context.document === 'object' ? context.document : {}
  const navigator = context.navigator && typeof context.navigator === 'object' ? context.navigator : {}
  const windowContext = context.window && typeof context.window === 'object' ? context.window : {}
  const url = cleanString(document.location || document.url || context.url).slice(0, 512)
  const userAgent = cleanString(navigator.userAgent || request.get('user-agent')).slice(0, 512)

  return {
    sessionId: cleanString(context.sessionId).slice(0, 128),
    pageTitle: cleanString(document.title || context.pageTitle).slice(0, 256),
    pageLocation: url,
    pagePath: pathFromUrl(url),
    referrer: cleanString(document.referrer || context.referrer).slice(0, 512),
    userAgent,
    device: inferDevice(userAgent),
    viewport: cleanString(windowContext.innerWidth && windowContext.innerHeight
      ? `${windowContext.innerWidth}x${windowContext.innerHeight}`
      : context.viewport).slice(0, 64),
  }
}

async function upsertCustomerSessionFromEvent(event, cachedSessions) {
  const existing =
    cachedSessions.get(event.sessionId) ?? (await getRecordByHandle(resourceConfigs.customerSessions, event.sessionId))
  const now = new Date().toISOString()
  const firstTouch = firstPopulatedTouchpoint(existing, event.attribution.first, event.attribution.last, {
    landingPage: event.context.pageLocation || event.context.pagePath,
    referrer: event.context.referrer,
  })
  const lastTouch = lastPopulatedTouchpoint(event.attribution.last, event.attribution.first, {
    landingPage: event.context.pageLocation || event.context.pagePath,
    referrer: event.context.referrer,
  })
  const eventSummary = summarizeAnalyticsEvent(event)
  const existingEvents = Array.isArray(existing?.events) ? existing.events : []
  const events = existingEvents
    .filter((item) => item?.id !== eventSummary.id)
    .concat(eventSummary)
    .slice(-200)
  const orderId = resolveOrderIdFromAnalyticsEvent(event) || cleanString(existing?.orderId)
  const orderName = resolveOrderNameFromAnalyticsEvent(event) || cleanString(existing?.orderName)

  const session = {
    id: event.sessionId,
    sessionId: event.sessionId,
    visitorId: event.visitorId || existing?.visitorId || event.sessionId,
    firstSource: firstTouch.source,
    firstMedium: firstTouch.medium,
    firstCampaign: firstTouch.campaign,
    firstContent: firstTouch.content,
    firstTerm: firstTouch.term,
    firstLandingPage: firstTouch.landingPage,
    firstReferrer: firstTouch.referrer,
    lastSource: lastTouch.source,
    lastMedium: lastTouch.medium,
    lastCampaign: lastTouch.campaign,
    lastContent: lastTouch.content,
    lastTerm: lastTouch.term,
    lastLandingPage: lastTouch.landingPage,
    lastReferrer: lastTouch.referrer,
    device: event.attribution.device || existing?.device || event.context.device,
    lastEventName: event.name,
    lastEventAt: event.timestamp,
    orderId,
    orderName,
    customerEmailHash: event.customerEmailHash || existing?.customerEmailHash || '',
    events,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  await upsertRecord(resourceConfigs.customerSessions, session)
  return session
}

async function getRecordByHandle(config, id) {
  const handle = sanitizeHandle(id)
  if (!handle) return null

  const result = await shopifyGraphQL(
    `
      query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          handle
          payload: field(key: "payload") {
            jsonValue
          }
        }
      }
    `,
    {
      handle: {
        type: config.type,
        handle,
      },
    },
  )

  return result?.data?.metaobjectByHandle?.payload?.jsonValue ?? null
}

function firstPopulatedTouchpoint(existing, primary, secondary, fallback) {
  return {
    source:
      normalizeTrafficSource(existing?.firstSource) ||
      normalizeTrafficSource(primary?.source) ||
      normalizeTrafficSource(secondary?.source) ||
      inferSourceFromReferrer(fallback?.referrer),
    medium:
      cleanString(existing?.firstMedium) ||
      cleanString(primary?.medium) ||
      cleanString(secondary?.medium) ||
      inferMediumFromReferrer(fallback?.referrer),
    campaign:
      cleanString(existing?.firstCampaign) ||
      cleanString(primary?.campaign) ||
      cleanString(secondary?.campaign),
    content:
      cleanString(existing?.firstContent) ||
      cleanString(primary?.content) ||
      cleanString(secondary?.content),
    term:
      cleanString(existing?.firstTerm) ||
      cleanString(primary?.term) ||
      cleanString(secondary?.term),
    landingPage:
      cleanString(existing?.firstLandingPage) ||
      cleanString(primary?.landingPage) ||
      cleanString(secondary?.landingPage) ||
      cleanString(fallback?.landingPage),
    referrer:
      cleanString(existing?.firstReferrer) ||
      cleanString(primary?.referrer) ||
      cleanString(secondary?.referrer) ||
      cleanString(fallback?.referrer),
  }
}

function lastPopulatedTouchpoint(primary, secondary, fallback) {
  return {
    source:
      normalizeTrafficSource(primary?.source) ||
      normalizeTrafficSource(secondary?.source) ||
      inferSourceFromReferrer(fallback?.referrer),
    medium:
      cleanString(primary?.medium) ||
      cleanString(secondary?.medium) ||
      inferMediumFromReferrer(fallback?.referrer),
    campaign: cleanString(primary?.campaign) || cleanString(secondary?.campaign),
    content: cleanString(primary?.content) || cleanString(secondary?.content),
    term: cleanString(primary?.term) || cleanString(secondary?.term),
    landingPage:
      cleanString(primary?.landingPage) ||
      cleanString(secondary?.landingPage) ||
      cleanString(fallback?.landingPage),
    referrer:
      cleanString(primary?.referrer) ||
      cleanString(secondary?.referrer) ||
      cleanString(fallback?.referrer),
  }
}

function summarizeAnalyticsEvent(event) {
  const items = extractAnalyticsItems(event.data)
  const productVariant = event.data?.productVariant ?? event.data?.product ?? {}
  const collection = event.data?.collection ?? {}
  const searchResult = event.data?.searchResult ?? event.data?.search ?? {}

  return {
    id: event.id,
    name: event.name,
    at: event.timestamp,
    source: event.attribution.last.source || event.attribution.first.source || '',
    medium: event.attribution.last.medium || event.attribution.first.medium || '',
    campaign: event.attribution.last.campaign || event.attribution.first.campaign || '',
    path: event.context.pagePath,
    url: event.context.pageLocation,
    referrer: event.context.referrer,
    title:
      cleanString(productVariant.product?.title) ||
      cleanString(productVariant.title) ||
      cleanString(collection.title) ||
      cleanString(event.context.pageTitle),
    searchQuery:
      cleanString(searchResult.query) ||
      cleanString(event.data?.searchQuery) ||
      cleanString(event.data?.query),
    value: extractAnalyticsValue(event.data),
    currency: extractAnalyticsCurrency(event.data),
    orderId: resolveOrderIdFromAnalyticsEvent(event),
    orderName: resolveOrderNameFromAnalyticsEvent(event),
    items,
  }
}

async function syncOrderAttributionMetafields(orderId, session, event) {
  const ownerId = toShopifyGid('Order', orderId)
  if (!ownerId) return

  const attribution = buildOrderAttributionPayload(session, event)
  const metafields = [
    {
      namespace: 'trinity',
      key: 'attribution',
      ownerId,
      type: 'json',
      value: JSON.stringify(attribution),
    },
    orderMetafield(ownerId, 'first_source', attribution.first.source),
    orderMetafield(ownerId, 'first_medium', attribution.first.medium),
    orderMetafield(ownerId, 'first_campaign', attribution.first.campaign),
    orderMetafield(ownerId, 'first_landing_page', attribution.first.landingPage),
    orderMetafield(ownerId, 'last_source', attribution.last.source),
    orderMetafield(ownerId, 'last_medium', attribution.last.medium),
    orderMetafield(ownerId, 'last_campaign', attribution.last.campaign),
    orderMetafield(ownerId, 'last_landing_page', attribution.last.landingPage),
    orderMetafield(ownerId, 'customer_session_id', session.sessionId),
  ].filter((field) => field.value !== undefined && field.value !== null && field.value !== '')

  const result = await shopifyGraphQL(
    `
      mutation SetOrderAttributionMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    { metafields },
  )

  const errors = result?.data?.metafieldsSet?.userErrors ?? []
  if (errors.length > 0) {
    throw new Error(`Order attribution sync error: ${errors.map((item) => item.message).join(', ')}`)
  }
}

function buildOrderAttributionPayload(session, event) {
  return {
    capturedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    device: session.device,
    first: {
      source: session.firstSource,
      medium: session.firstMedium,
      campaign: session.firstCampaign,
      content: session.firstContent,
      term: session.firstTerm,
      landingPage: session.firstLandingPage,
      referrer: session.firstReferrer,
    },
    last: {
      source: session.lastSource,
      medium: session.lastMedium,
      campaign: session.lastCampaign,
      content: session.lastContent,
      term: session.lastTerm,
      landingPage: session.lastLandingPage,
      referrer: session.lastReferrer,
    },
    order: {
      id: resolveOrderIdFromAnalyticsEvent(event),
      name: resolveOrderNameFromAnalyticsEvent(event),
      value: extractAnalyticsValue(event.data),
      currency: extractAnalyticsCurrency(event.data),
    },
    journey: (session.events ?? []).map((item) => ({
      name: item.name,
      at: item.at,
      path: item.path,
      title: item.title,
      searchQuery: item.searchQuery,
      value: item.value,
      orderName: item.orderName,
      items: item.items,
    })),
    customerEmailHash: session.customerEmailHash,
  }
}

async function forwardAnalyticsEventToGa4(event, session) {
  if (!ga4MeasurementId || !ga4ApiSecret) return { skipped: true }

  const ga4Event = mapAnalyticsEventToGa4(event, session)
  if (!ga4Event) return { skipped: true }

  const url = new URL('https://www.google-analytics.com/mp/collect')
  url.searchParams.set('measurement_id', ga4MeasurementId)
  url.searchParams.set('api_secret', ga4ApiSecret)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: normalizeGa4ClientId(event.clientId || session.visitorId || session.sessionId),
      timestamp_micros: String(new Date(event.timestamp).getTime() * 1000),
      non_personalized_ads: false,
      events: [ga4Event],
    }),
  })

  if (!response.ok) {
    throw new Error(`GA4 forwarding failed: ${response.status} ${await response.text()}`)
  }

  return { ok: true }
}

function mapAnalyticsEventToGa4(event, session) {
  const eventNameMap = {
    page_viewed: 'page_view',
    collection_viewed: 'view_item_list',
    product_viewed: 'view_item',
    product_added_to_cart: 'add_to_cart',
    cart_viewed: 'view_cart',
    checkout_started: 'begin_checkout',
    checkout_address_info_submitted: 'add_shipping_info',
    checkout_shipping_info_submitted: 'add_shipping_info',
    payment_info_submitted: 'add_payment_info',
    checkout_completed: 'purchase',
    search_submitted: 'search',
    trinity_customizer_started: 'trinity_customizer_started',
    trinity_customizer_option_changed: 'trinity_customizer_option_changed',
    trinity_product_cta_clicked: 'trinity_product_cta_clicked',
    trinity_product_form_submitted: 'trinity_product_form_submitted',
    trinity_product_option_changed: 'trinity_product_option_changed',
  }
  const name = eventNameMap[event.name] ?? event.name.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 40)
  if (!name) return null

  const params = {
    page_location: event.context.pageLocation,
    page_path: event.context.pagePath,
    page_title: event.context.pageTitle,
    source: session.lastSource,
    medium: session.lastMedium,
    campaign: session.lastCampaign,
    content: session.lastContent,
    term: session.lastTerm,
    trinity_session_id: session.sessionId,
    trinity_first_source: session.firstSource,
    trinity_first_medium: session.firstMedium,
    trinity_first_campaign: session.firstCampaign,
    trinity_first_landing_page: session.firstLandingPage,
    search_term: summarizeAnalyticsEvent(event).searchQuery,
    currency: extractAnalyticsCurrency(event.data),
    value: extractAnalyticsValue(event.data),
    transaction_id: resolveOrderNameFromAnalyticsEvent(event) || resolveOrderIdFromAnalyticsEvent(event),
    items: extractAnalyticsItems(event.data),
  }

  return {
    name,
    params: compactGa4Params(params),
  }
}

function compactGa4Params(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false
      if (Array.isArray(value) && value.length === 0) return false
      return true
    }),
  )
}

function extractAnalyticsItems(data = {}) {
  const checkoutLines = data.checkout?.lineItems ?? data.checkout?.lineItems?.nodes
  const cartLines = data.cart?.lines ?? data.cart?.lines?.nodes
  const singleLine = data.cartLine ? [data.cartLine] : []
  const productVariant = data.productVariant ? [data.productVariant] : []
  const sourceLines = Array.isArray(checkoutLines)
    ? checkoutLines
    : Array.isArray(cartLines)
      ? cartLines
      : singleLine.length > 0
        ? singleLine
        : productVariant

  return sourceLines.slice(0, 100).map((line, index) => {
    const merchandise = line.merchandise ?? line.variant ?? line
    const product = merchandise.product ?? line.product ?? {}
    const price = line.cost?.totalAmount ?? line.cost?.amountPerQuantity ?? merchandise.price ?? {}
    return compactGa4Params({
      item_id: cleanString(merchandise.sku || merchandise.id || product.id || line.id),
      item_name: cleanString(product.title || merchandise.product?.title || merchandise.title || line.title),
      item_variant: cleanString(merchandise.title || line.variantTitle || line.variant?.title),
      item_category: cleanString(product.type || product.productType || data.collection?.title),
      price: toFiniteNumber(price.amount ?? line.price ?? merchandise.price),
      quantity: toFiniteNumber(line.quantity) || 1,
      index,
    })
  })
}

function extractAnalyticsValue(data = {}) {
  return (
    toFiniteNumber(data.checkout?.totalPrice?.amount) ??
    toFiniteNumber(data.checkout?.subtotalPrice?.amount) ??
    toFiniteNumber(data.cart?.cost?.totalAmount?.amount) ??
    toFiniteNumber(data.cartLine?.cost?.totalAmount?.amount) ??
    null
  )
}

function extractAnalyticsCurrency(data = {}) {
  return (
    cleanString(data.checkout?.currencyCode) ||
    cleanString(data.checkout?.totalPrice?.currencyCode) ||
    cleanString(data.cart?.cost?.totalAmount?.currencyCode) ||
    cleanString(data.cartLine?.cost?.totalAmount?.currencyCode) ||
    shopCurrencyCode
  )
}

function resolveOrderIdFromAnalyticsEvent(event) {
  return (
    cleanString(event.data?.checkout?.order?.id) ||
    cleanString(event.data?.checkout?.orderId) ||
    cleanString(event.data?.order?.id)
  )
}

function resolveOrderNameFromAnalyticsEvent(event) {
  return (
    cleanString(event.data?.checkout?.order?.name) ||
    cleanString(event.data?.checkout?.order?.orderNumber) ||
    cleanString(event.data?.order?.name)
  )
}

function extractEmailFromAnalyticsEvent(event) {
  return (
    cleanString(event.customer?.email) ||
    cleanString(event.data?.checkout?.email) ||
    cleanString(event.data?.checkout?.customer?.email) ||
    ''
  )
}

function hashEmail(email) {
  const normalized = cleanString(email).toLowerCase()
  if (!normalized) return ''
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

function normalizeIsoDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function pathFromUrl(value) {
  try {
    if (!value) return ''
    return new URL(value).pathname
  } catch {
    return cleanString(value).split('?')[0]
  }
}

function inferSourceFromReferrer(referrer) {
  const host = hostnameFromUrl(referrer)
  if (!host) return 'direct'
  if (host.includes('instagram')) return 'instagram'
  if (host.includes('facebook')) return 'facebook'
  if (host.includes('google')) return 'google'
  if (host.includes('bing')) return 'bing'
  if (host.includes('duckduckgo')) return 'duckduckgo'
  if (host.includes('yahoo')) return 'yahoo'
  return host.replace(/^www\./, '')
}

function normalizeTrafficSource(value) {
  const source = cleanString(value).toLowerCase()
  if (!source) return ''
  if (['ig', 'instagram.com', 'l.instagram.com'].includes(source)) return 'instagram'
  if (['fb', 'facebook.com', 'm.facebook.com', 'l.facebook.com'].includes(source)) return 'facebook'
  if (['x', 'twitter', 'twitter.com', 't.co'].includes(source)) return 'x'
  return source
}

function inferMediumFromReferrer(referrer) {
  const host = hostnameFromUrl(referrer)
  if (!host) return 'direct'
  if (/(instagram|facebook|tiktok|pinterest|x\.com|twitter)/i.test(host)) return 'social'
  if (/(google|bing|duckduckgo|yahoo)/i.test(host)) return 'organic'
  return 'referral'
}

function hostnameFromUrl(value) {
  try {
    if (!value) return ''
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function inferDevice(userAgent) {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet'
  if (/mobile|iphone|android/i.test(userAgent)) return 'mobile'
  return userAgent ? 'desktop' : ''
}

function normalizeGa4ClientId(value) {
  const cleaned = cleanString(value)
  if (!cleaned) return createPlainId('ga4')
  return cleaned.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 128) || createPlainId('ga4')
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function resolvePayer(payload) {
  const billingDifferent = isTruthy(payload.billingDifferent)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const directPayerEmail = cleanString(
    payload.payerEmail || payload.playerEmail || payload.customerEmail,
  )
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)

  if (!billingDifferent) {
    return {
      name: playerName,
      email: directPayerEmail,
      phone: playerPhone,
      company: '',
      relationship: '',
    }
  }

  return {
    name: cleanString(payload.billingName || payload.customerName),
    email: cleanString(payload.billingEmail || payload.customerEmail),
    phone: cleanString(payload.billingPhone),
    company: cleanString(payload.billingCompany),
    relationship: cleanString(payload.billingRelationship),
  }
}

function buildDirectOrderAddresses(payload) {
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const shippingAddress = buildMailingAddressInput(payload, 'shipping', playerName, playerPhone)

  return {
    shippingAddress,
  }
}

function buildMailingAddressInput(payload, prefix, fullName, phone) {
  const address1 = cleanString(payload[`${prefix}Address1`])
  const address2 = cleanString(payload[`${prefix}Address2`])
  const city = cleanString(payload[`${prefix}City`])
  const provinceCode = cleanString(payload[`${prefix}ProvinceCode`]).toUpperCase()
  const zip = cleanString(payload[`${prefix}Zip`])
  const countryCode = cleanString(payload[`${prefix}CountryCode`] || 'US').toUpperCase()

  if (!address1 && !city && !provinceCode && !zip) return null

  const { firstName, lastName } = splitName(fullName)
  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(address1 ? { address1 } : {}),
    ...(address2 ? { address2 } : {}),
    ...(city ? { city } : {}),
    ...(provinceCode ? { provinceCode } : {}),
    ...(zip ? { zip } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(phone ? { phone } : {}),
  }
}

function splitName(fullName) {
  const parts = cleanString(fullName).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function formatMailingAddress(address) {
  if (!address) return ''

  return [
    address.address1,
    address.address2,
    [address.city, address.provinceCode, address.zip].filter(Boolean).join(', '),
    address.countryCode,
  ]
    .filter(Boolean)
    .join(' | ')
}

function prepareSalesOrderPayloadForRequest(payload, options = {}) {
  const nextPayload = {
    ...enforcePublicDraftOrderPolicy(payload, options.isAuthenticatedOperator),
    lines: arrayFromPayload(payload?.lines).map((line) => ({ ...line })),
  }
  const portalOwner = getSalesPortalOwnerForEmail(options.salesPortalSession?.email)

  if (portalOwner) {
    nextPayload.salesRep = portalOwner.name
    nextPayload.salesRepEmail = portalOwner.email
  } else {
    const submittedRepName = cleanString(nextPayload.salesRep)
    const submittedRepEmail = normalizeSalesPortalEmail(nextPayload.salesRepEmail)
    const emailOwner = submittedRepEmail ? getSalesPortalOwnerForEmail(submittedRepEmail) : null
    const nameOwner = submittedRepName ? getSalesPortalOwnerForName(submittedRepName) : null

    if ((submittedRepName || cleanString(nextPayload.salesRepEmail)) && !emailOwner && !nameOwner) {
      return { error: 'Choose an approved Trinity sales team member.', payload: null }
    }
    if (emailOwner && nameOwner && emailOwner.key !== nameOwner.key) {
      return { error: 'Sales rep name and email must identify the same team member.', payload: null }
    }

    const submittedOwner = emailOwner || nameOwner
    if (submittedOwner) {
      nextPayload.salesRep = submittedOwner.name
      nextPayload.salesRepEmail = submittedOwner.email
    }
  }

  return { error: '', payload: nextPayload }
}

function validateSalesOrderPayload(payload) {
  const boundsError = getSalesOrderBoundsError(payload)
  if (boundsError) return boundsError

  const playerName = cleanString(payload?.playerName || payload?.customerName)
  const salesRepEmail = normalizeEmail(payload?.salesRepEmail)
  const payer = resolvePayer(payload ?? {})
  const requiresShipping = requiresShippingForOrder(payload ?? {})
  const lines = Array.isArray(payload?.lines) ? payload.lines : []

  if (!playerName) return 'Player name is required.'
  if (payer.email && !isPlausibleEmail(payer.email)) {
    return 'Payer email must be a valid email address.'
  }
  if (cleanString(payload?.salesRepEmail) && !salesRepEmail) {
    return 'Sales rep email must be a valid email address.'
  }

  if (!payer.phone) return 'Payer phone is required.'

  if (requiresShipping) {
    const missingShippingAddress =
      !cleanString(payload?.shippingAddress1) ||
      !cleanString(payload?.shippingCity) ||
      !cleanString(payload?.shippingProvinceCode) ||
      !cleanString(payload?.shippingZip) ||
      !cleanString(payload?.shippingCountryCode)
    if (missingShippingAddress) return 'Shipping address is required for shipped orders.'
  }

  if (lines.length === 0) return 'At least one order line is required.'

  for (const [index, line] of lines.entries()) {
    const title = cleanString(line?.title || line?.model)
    const itemType = normalizeSalesOrderItemType(line?.itemType)
    const unitPrice = Number(cleanString(line?.unitPrice))
    const quantity = Number(line?.quantity)

    if (!title) {
      return itemType === 'misc'
        ? `Line ${index + 1} needs a description.`
        : `Line ${index + 1} needs a product.`
    }
    if (itemType === 'shirt' && !cleanString(line?.variantId)) {
      return `Line ${index + 1} needs a shirt size.`
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return `Line ${index + 1} needs a valid unit price.`
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return `Line ${index + 1} needs a quantity of at least 1.`
    }
  }

  return ''
}

function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value))
}

function isZeroDollarSalesOrder(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : []
  if (lines.length === 0) return false

  let total = 0
  for (const line of lines) {
    const priceText = cleanString(line?.unitPrice)
    const quantity = Number(line?.quantity || 1)
    const unitPrice = Number(priceText)
    if (
      priceText === '' ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isFinite(quantity) ||
      quantity < 1
    ) {
      return false
    }
    total += unitPrice * quantity
  }

  return Math.abs(total) < 0.005
}

function normalizePersonKey(value) {
  return cleanString(value).toLowerCase().replace(/\s+/g, ' ')
}

function normalizeEmailKey(value) {
  return cleanString(value).toLowerCase()
}

function normalizePhoneKey(value) {
  return cleanString(value).replace(/\D/g, '')
}

function hydrateKnownProPlayerAffiliation(player = {}) {
  const known = getKnownProPlayerAffiliation(player?.playerName)
  return {
    ...player,
    levelOfPlay: cleanString(player?.levelOfPlay) || known?.levelOfPlay || '',
    currentClub: cleanString(player?.currentClub) || known?.currentClub || '',
    mlbOrganization: cleanString(player?.mlbOrganization) || known?.mlbOrganization || '',
    affiliationVerifiedAt:
      cleanString(player?.affiliationVerifiedAt) || known?.affiliationVerifiedAt || '',
    affiliationNote: cleanString(player?.affiliationNote) || known?.note || '',
  }
}

function hasCurrentKnownPlayerAffiliation(storedPlayer, hydratedPlayer) {
  return [
    'levelOfPlay',
    'currentClub',
    'mlbOrganization',
    'affiliationVerifiedAt',
    'affiliationNote',
  ].every((field) => cleanString(storedPlayer?.[field]) === cleanString(hydratedPlayer?.[field]))
}

async function backfillKnownProPlayerAffiliations() {
  const storedPlayers = await listRecords(resourceConfigs.players)
  const players = storedPlayers.map((player) => hydrateKnownProPlayerAffiliation(player))
  const changedPlayers = players.filter((player, index) => {
    if (!getKnownProPlayerAffiliation(player?.playerName)) return false
    return !hasCurrentKnownPlayerAffiliation(storedPlayers[index], player)
  })

  for (let index = 0; index < changedPlayers.length; index += 5) {
    await Promise.all(
      changedPlayers
        .slice(index, index + 5)
        .map((player) => upsertRecord(resourceConfigs.players, player)),
    )
  }

  return { players, updatedCount: changedPlayers.length }
}

function findPlayerProfileForOrderJob(job, players) {
  const playerList = arrayFromPayload(players).filter((player) => cleanString(player?.playerName))
  const requestedId = cleanString(job?.playerProfileId)
  if (requestedId) {
    const idMatch = playerList.find((player) => cleanString(player?.id) === requestedId)
    if (idMatch) return idMatch
  }

  const requestedName = normalizePlayerNameKey(job?.playerName)
  if (requestedName) {
    const nameMatch = playerList.find(
      (player) => normalizePlayerNameKey(player?.playerName) === requestedName,
    )
    if (nameMatch) return nameMatch
  }

  const orderContext = normalizePlayerNameKey([job?.notes, job?.internalNotes].filter(Boolean).join(' '))
  if (!orderContext) return null

  return (
    [...playerList]
      .sort((first, second) => cleanString(second?.playerName).length - cleanString(first?.playerName).length)
      .find((player) => {
        const playerKey = normalizePlayerNameKey(player?.playerName)
        return playerKey && ` ${orderContext} `.includes(` ${playerKey} `)
      }) ?? null
  )
}

async function attachOrderJobsToPlayerProfiles(jobs, playerRecords = null) {
  const jobList = arrayFromPayload(jobs)
  if (jobList.length === 0) return []

  const storedPlayers = Array.isArray(playerRecords)
    ? playerRecords
    : await listRecords(resourceConfigs.players)
  const players = storedPlayers.map((player) => hydrateKnownProPlayerAffiliation(player))
  return jobList.map((job) => {
    const player = findPlayerProfileForOrderJob(job, players)
    if (!player) return job
    return {
      ...job,
      playerProfileId: cleanString(player.id),
      playerName: cleanString(player.playerName) || cleanString(job.playerName),
    }
  })
}

function createStablePeopleRecordId(prefix, ...parts) {
  const slug = sanitizeHandle(parts.map((part) => cleanString(part)).filter(Boolean).join('-'))
  return slug ? `${prefix}-${slug}` : createPlainId(prefix)
}

function buildRememberedPlayerFromJob(job) {
  if (job?.origin !== 'internal_sales') return null

  const playerName = cleanString(job?.playerName || job?.customerName)
  if (!playerName) return null

  return hydrateKnownProPlayerAffiliation({
    id: createStablePeopleRecordId('player', playerName),
    profileKind: 'Player',
    playerName,
    bats: [],
  })
}

function buildRememberedBillingContactFromJob(job) {
  const billingDifferent = isTruthy(job?.billingDifferent)
  const name = cleanString(job?.billingName || job?.customerName || job?.playerName || job?.billingEmail)
  const email = cleanString(job?.billingEmail || job?.customerEmail || job?.playerEmail)
  const phone = cleanString(job?.billingPhone)
  const company = cleanString(job?.billingCompany)
  const relationship =
    cleanString(job?.billingRelationship) || (billingDifferent ? '' : 'Direct customer')

  if (!name && !email && !phone && !company) return null

  const playerName = cleanString(job?.playerName)
  const orderName = cleanString(job?.shopifyOrderName || job?.shopifyDraftOrderName)
  const orderSubmittedAt = cleanString(job?.orderSubmittedAt || job?.createdAt)
  const notes = [
    orderSubmittedAt ? `Last invoice/order: ${orderSubmittedAt}` : '',
    orderName ? `Shopify order: ${orderName}` : '',
    playerName && normalizePersonKey(playerName) !== normalizePersonKey(name)
      ? `Player: ${playerName}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: createStablePeopleRecordId('billing-contact', email || phone || name, company),
    name: name || email || phone,
    email,
    phone,
    company,
    relationship,
    notes,
  }
}

function getBillingContactDedupeKey(contact) {
  const email = normalizeEmailKey(contact?.email)
  if (email) return `email:${email}`

  const phone = normalizePhoneKey(contact?.phone)
  if (phone) return `phone:${phone}`

  const name = normalizePersonKey(contact?.name)
  const company = normalizePersonKey(contact?.company)
  return [name, company].filter(Boolean).join('|')
}

function findExistingPlayerProfile(existingPlayers, incomingPlayer) {
  const playerKey = normalizePersonKey(incomingPlayer?.playerName)
  if (!playerKey) return null

  return existingPlayers.find((player) => normalizePersonKey(player?.playerName) === playerKey) ?? null
}

function findExistingBillingContact(existingContacts, incomingContact) {
  const incomingEmail = normalizeEmailKey(incomingContact?.email)
  if (incomingEmail) {
    const match = existingContacts.find((contact) => normalizeEmailKey(contact?.email) === incomingEmail)
    if (match) return match
  }

  const incomingPhone = normalizePhoneKey(incomingContact?.phone)
  if (incomingPhone) {
    const match = existingContacts.find((contact) => normalizePhoneKey(contact?.phone) === incomingPhone)
    if (match) return match
  }

  const incomingName = normalizePersonKey(incomingContact?.name)
  const incomingCompany = normalizePersonKey(incomingContact?.company)
  if (!incomingName && !incomingCompany) return null

  return (
    existingContacts.find((contact) => {
      const contactName = normalizePersonKey(contact?.name)
      const contactCompany = normalizePersonKey(contact?.company)
      return contactName === incomingName && contactCompany === incomingCompany
    }) ?? null
  )
}

function mergeRememberedPlayer(existingPlayer, incomingPlayer) {
  return hydrateKnownProPlayerAffiliation({
    id: cleanString(existingPlayer?.id) || incomingPlayer.id,
    profileKind: cleanString(existingPlayer?.profileKind) || incomingPlayer.profileKind,
    playerName: cleanString(existingPlayer?.playerName) || incomingPlayer.playerName,
    levelOfPlay: cleanString(existingPlayer?.levelOfPlay) || incomingPlayer.levelOfPlay,
    currentClub: cleanString(existingPlayer?.currentClub) || incomingPlayer.currentClub,
    mlbOrganization:
      cleanString(existingPlayer?.mlbOrganization) || incomingPlayer.mlbOrganization,
    affiliationVerifiedAt:
      cleanString(existingPlayer?.affiliationVerifiedAt) || incomingPlayer.affiliationVerifiedAt,
    affiliationNote:
      cleanString(existingPlayer?.affiliationNote) || incomingPlayer.affiliationNote,
    bats: Array.isArray(existingPlayer?.bats) ? existingPlayer.bats : incomingPlayer.bats,
  })
}

function mergeRememberedBillingContact(existingContact, incomingContact) {
  return {
    id: cleanString(existingContact?.id) || incomingContact.id,
    name: cleanString(existingContact?.name) || incomingContact.name,
    email: cleanString(existingContact?.email) || incomingContact.email,
    phone: cleanString(existingContact?.phone) || incomingContact.phone,
    company: cleanString(existingContact?.company) || incomingContact.company,
    relationship: cleanString(existingContact?.relationship) || incomingContact.relationship,
    notes: cleanString(existingContact?.notes) || incomingContact.notes,
  }
}

async function rememberOrderJobContacts(jobs) {
  const jobList = Array.isArray(jobs) ? jobs : []
  const playerDrafts = mergeRecordsByKey(
    [],
    jobList.map((job) => buildRememberedPlayerFromJob(job)).filter(Boolean),
    (player) => normalizePersonKey(player.playerName),
  )
  const billingContactDrafts = mergeRecordsByKey(
    [],
    jobList.map((job) => buildRememberedBillingContactFromJob(job)).filter(Boolean),
    (contact) => getBillingContactDedupeKey(contact),
  )

  if (playerDrafts.length === 0 && billingContactDrafts.length === 0) {
    return { players: [], billingContacts: [] }
  }

  const [existingPlayers, existingBillingContacts] = await Promise.all([
    playerDrafts.length > 0 ? listRecords(resourceConfigs.players) : Promise.resolve([]),
    billingContactDrafts.length > 0
      ? listRecords(resourceConfigs.billingContacts)
      : Promise.resolve([]),
  ])

  const players = playerDrafts.map((player) =>
    mergeRememberedPlayer(findExistingPlayerProfile(existingPlayers, player), player),
  )
  const billingContacts = billingContactDrafts.map((contact) =>
    mergeRememberedBillingContact(findExistingBillingContact(existingBillingContacts, contact), contact),
  )

  await Promise.all([
    Promise.all(players.map((player) => upsertRecord(resourceConfigs.players, player))),
    Promise.all(
      billingContacts.map((contact) => upsertRecord(resourceConfigs.billingContacts, contact)),
    ),
  ])

  return { players, billingContacts }
}

function formatSalesLineShopifyTitle(line, isProOrder) {
  const itemType = normalizeSalesOrderItemType(line?.itemType)
  const title =
    cleanString(line?.title || line?.model) ||
    (itemType === 'shirt'
      ? 'Trinity shirt'
      : itemType === 'misc'
        ? 'Miscellaneous product'
        : 'Custom Trinity bat')
  if (!isProOrder) return title

  return /^pro order\b/i.test(title) ? title : `Pro Order - ${title}`
}

function buildProOrderNotificationLabel(payload, payer) {
  const playerName = cleanString(payload?.playerName || payload?.customerName)
  const teamOrAgency = cleanString(payload?.billingCompany || payer?.company)
  const payerName = cleanString(payload?.billingName || payer?.name)
  const displayName = isTruthy(payload?.billingDifferent)
    ? teamOrAgency || payerName || playerName
    : playerName || teamOrAgency || payerName

  return ['Pro Order', displayName].filter(Boolean).join(' - ').slice(0, 255)
}

function buildOrderInvoiceEmailInput(payload, order) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const hasProOrder = lines.some(
    (line) => normalizeSalesOrderItemType(line.itemType) === 'bat' && isTruthy(line.isProOrder),
  )
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const purchaseOrder = cleanString(payload.purchaseOrder)
  const billingCompany = cleanString(payload.billingCompany)
  const shippingOption = resolveShippingOption(payload, requiresShippingForOrder(payload))
  const customMessage = [
    'A Trinity Sports Group invoice has been created from an internal sales order.',
    hasProOrder ? 'Order type: Pro Order' : '',
    isZeroDollarOrder ? '$0 sample order: no payment is due; invoice sent for documentation.' : '',
    playerName ? `Player: ${playerName}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    billingCompany ? `Team/agency: ${billingCompany}` : '',
    shippingOption ? `Shipping: ${formatSalesOrderShippingCharge(shippingOption)}` : '',
    cleanString(payload.notes) ? `Notes: ${cleanString(payload.notes)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const emailInput = {
    to: payer.email,
    subject: isZeroDollarOrder
            ? `${order?.name ?? 'Shopify order'} $0 sample documentation from Trinity Sports Group`
          : `${order?.name ?? 'Shopify order'} invoice from Trinity Sports Group`,
    customMessage,
  }

  return emailInput
}

function buildDraftOrderInvoiceEmailInputFromPayload(payload, draftOrder) {
  const payer = resolvePayer(payload)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const purchaseOrder = cleanString(payload.purchaseOrder)
  const billingCompany = cleanString(payload.billingCompany)
  const lineSummary = summarizeSalesOrderLines(payload.lines)
  const invoiceUrl = normalizeDraftInvoiceUrl(draftOrder?.invoiceUrl)
  const shippingOption = resolveShippingOption(payload, requiresShippingForOrder(payload))
  const customMessage = [
    'A Trinity Bat Company invoice has been created for your order.',
    invoiceUrl
      ? `If the payment button does not open correctly, use this secure invoice link: ${invoiceUrl}`
      : '',
    playerName ? `Player: ${playerName}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    billingCompany ? `Team/agency: ${billingCompany}` : '',
    lineSummary ? `Order lines: ${lineSummary}` : '',
    shippingOption ? `Shipping: ${formatSalesOrderShippingCharge(shippingOption)}` : '',
    cleanString(payload.notes) ? `Notes: ${cleanString(payload.notes)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    to: payer.email,
    subject: `${draftOrder?.name ?? 'Shopify order'} Draft Order Submitted`,
    customMessage,
  }
}

function buildDraftOrderInvoiceEmailInput(jobs) {
  const primaryJob = Array.isArray(jobs) ? (jobs[0] ?? {}) : {}
  const invoiceUrl = normalizeDraftInvoiceUrl(primaryJob.shopifyDraftInvoiceUrl)
  const draftOrderName = cleanString(primaryJob.shopifyDraftOrderName) || 'Trinity order'
  const recipientEmail = cleanString(primaryJob.billingEmail || primaryJob.customerEmail)
  const playerName = cleanString(primaryJob.playerName)
  const purchaseOrder = cleanString(primaryJob.purchaseOrder)
  const billingCompany = cleanString(primaryJob.billingCompany)
  const notes = cleanString(primaryJob.internalNotes || primaryJob.notes)
  const customMessage = [
    'A Trinity Sports Group invoice has been created from an internal sales order.',
    invoiceUrl
      ? `If the payment button does not open correctly, use this secure invoice link: ${invoiceUrl}`
      : '',
    playerName ? `Player: ${playerName}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    billingCompany ? `Team/agency: ${billingCompany}` : '',
    notes ? `Notes: ${notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const emailInput = {
    subject: `${draftOrderName} invoice from Trinity Sports Group`,
    customMessage,
  }

  if (recipientEmail) {
    emailInput.to = recipientEmail
  }

  return emailInput
}

function summarizeSalesOrderLines(lines) {
  return lines
    .map((line) => {
      const itemType = normalizeSalesOrderItemType(line?.itemType)
      const title =
        cleanString(line?.title || line?.model) ||
        (itemType === 'shirt'
          ? 'Trinity shirt'
          : itemType === 'misc'
            ? 'Miscellaneous product'
            : 'Custom Trinity bat')
      const variantTitle = cleanString(line?.variantTitle)
      const quantity = Number(line?.quantity || 1)
      return `${quantity} x ${title}${variantTitle ? ` / ${variantTitle}` : ''}`
    })
    .filter(Boolean)
    .join(', ')
}

function buildOrderCreateInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const hasInternalAttachment = Boolean(normalizeOrderAttachment(payload.attachment)?.downloadUrl)
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const purchaseOrder = cleanString(payload.purchaseOrder)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
  const shippingOption = resolveShippingOption(payload, requiresShipping)
  const shippingLine = buildOrderCreateShippingLine(shippingOption)
  const productionTimeline = normalizeProductionTimeline(payload.productionTimeline)
  const rushSurchargeLine = buildOrderRushProductionSurchargeLine(payload)
  const hasProOrder = lines.some(
    (line) => normalizeSalesOrderItemType(line.itemType) === 'bat' && isTruthy(line.isProOrder),
  )
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const proOrderNotificationLabel = hasProOrder
    ? buildProOrderNotificationLabel(payload, payer)
    : ''
  const directAddresses = buildDirectOrderAddresses(payload)
  const shippingAddress = requiresShipping ? directAddresses.shippingAddress : null
  const formattedShippingAddress = formatMailingAddress(shippingAddress)
  const note = [
    cleanString(payload.notes),
    hasProOrder ? 'Order type: Pro Order' : '',
    requiresShipping ? '' : 'Fulfillment: Local delivery / no shipping required',
    shippingOption ? `Shipping: ${formatSalesOrderShippingCharge(shippingOption)}` : '',
    productionTimeline === 'rush'
      ? `Production timeline: Rush (${rushProductionSurchargeAmount} per bat)`
      : 'Production timeline: Normal',
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    playerPhone ? `Player phone: ${playerPhone}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    formattedShippingAddress ? `Shipping address: ${formattedShippingAddress}` : '',
    billingDifferent ? `Bill to: ${payer.name || payer.email}` : '',
    billingDifferent && payer.phone ? `Payer phone: ${payer.phone}` : '',
    payer.company ? `Team/agency: ${payer.company}` : '',
    payer.relationship ? `Billing relationship: ${payer.relationship}` : '',
    salesRep ? `Sales rep: ${salesRep}` : '',
    salesRepEmail ? `Sales rep email: ${salesRepEmail}` : '',
    orderSubmittedAt ? `Order submitted: ${orderSubmittedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    currency: shopCurrencyCode,
    financialStatus: 'PENDING',
    ...(purchaseOrder ? { poNumber: purchaseOrder } : {}),
    ...(proOrderNotificationLabel
      ? {
          sourceName: proOrderNotificationLabel,
          sourceIdentifier: intakeId,
        }
      : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(shippingLine ? { shippingLines: [shippingLine] } : {}),
    note,
    tags: ['Trinity Intake', 'Internal Sales'].concat(
      hasInternalAttachment ? ['Trinity Attachment'] : [],
      salesRep ? [`Sales Rep: ${salesRep}`] : [],
      playerName ? [`Player: ${playerName}`] : [],
      hasProOrder ? ['Pro Order'] : [],
    ),
    customAttributes: compactAttributes({
      trinity_origin: 'internal_sales',
      trinity_intake_id: intakeId,
      trinity_has_pro_order: hasProOrder ? 'true' : '',
      trinity_order_type: hasProOrder ? 'Pro Order' : '',
      trinity_notification_label: proOrderNotificationLabel,
      trinity_zero_dollar_sample: isZeroDollarOrder ? 'true' : '',
      trinity_requires_shipping: requiresShipping ? 'true' : 'false',
      trinity_shipping_speed: shippingOption?.key ?? '',
      trinity_shipping_title: shippingOption?.title ?? '',
      trinity_shipping_amount: shippingOption?.amount ?? '',
      trinity_shipping_bat_quantity: shippingOption?.batQuantity ?? '',
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_production_timeline: productionTimeline,
      trinity_rush_production_surcharge: rushSurchargeLine
        ? `${rushProductionSurchargeAmount} ${shopCurrencyCode} per bat`
        : '',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_sales_rep_email: salesRepEmail,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: playerPhone,
      trinity_purchase_order: purchaseOrder,
      trinity_shipping_address: formattedShippingAddress,
      trinity_billing_different: billingDifferent ? 'true' : '',
      trinity_billing_name: payer.name,
      trinity_billing_email: payer.email,
      trinity_billing_phone: payer.phone,
      trinity_billing_company: payer.company,
      trinity_billing_relationship: payer.relationship,
      trinity_staff_notification_recipients: internalOrderNotificationEmails.join(', '),
    }),
    lineItems: lines
      .map((line) => {
        const unitPrice = toMoneyBagInput(line.unitPrice)
        const itemType = normalizeSalesOrderItemType(line.itemType)
        const isProOrder = itemType === 'bat' && isTruthy(line.isProOrder)
        const variantId = isProOrder || itemType === 'misc' ? '' : cleanString(line.variantId)
        const title = formatSalesLineShopifyTitle(line, isProOrder)
        const properties = compactLineItemProperties({
          'Order type': isProOrder ? 'Pro Order' : '',
          trinity_player_name: playerName,
          trinity_item_type: itemType,
          trinity_shirt_size: itemType === 'shirt' ? line.variantTitle : '',
          trinity_pro_order: isProOrder ? 'true' : '',
          trinity_model: cleanString(line.title || line.model),
          trinity_length: itemType === 'bat' ? line.length : '',
          trinity_weight: itemType === 'bat' ? line.targetWeight : '',
          trinity_wood: itemType === 'bat' ? line.wood : '',
          trinity_handle_color: itemType === 'bat' ? line.handleColor : '',
          trinity_barrel_color: itemType === 'bat' ? line.barrelColor : '',
          trinity_band_color: itemType === 'bat' ? line.bandColor : '',
          trinity_logo_color: itemType === 'bat' ? line.logoColor : '',
          trinity_engraving: itemType === 'bat' ? line.engraving : '',
          trinity_cupped: itemType === 'bat' ? line.cupped : '',
          trinity_notes: itemType === 'bat' ? line.notes : '',
          trinity_product_title: line.title,
          trinity_requires_shipping: requiresShipping ? 'true' : 'false',
        })

        return {
          ...(variantId ? { variantId } : {}),
          title,
          quantity: Number(line.quantity || 1),
          requiresShipping,
          taxable: false,
          ...(unitPrice ? { priceSet: unitPrice } : {}),
          properties,
        }
      })
      .concat(rushSurchargeLine ? [rushSurchargeLine] : []),
  }
}

function buildDraftOrderInput(payload, intakeId, orderSubmittedAt = new Date().toISOString()) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const hasInternalAttachment = Boolean(normalizeOrderAttachment(payload.attachment)?.downloadUrl)
  const salesRep = cleanString(payload.salesRep)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const playerPhone = cleanString(payload.playerPhone || payload.customerPhone)
  const purchaseOrder = cleanString(payload.purchaseOrder)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const requiresShipping = requiresShippingForOrder(payload)
  const shippingOption = resolveShippingOption(payload, requiresShipping)
  const shippingLine = buildDraftOrderShippingLine(shippingOption)
  const productionTimeline = normalizeProductionTimeline(payload.productionTimeline)
  const rushSurchargeLine = buildDraftRushProductionSurchargeLine(payload)
  const hasProOrder = lines.some(
    (line) => normalizeSalesOrderItemType(line.itemType) === 'bat' && isTruthy(line.isProOrder),
  )
  const isZeroDollarOrder = isZeroDollarSalesOrder(payload)
  const payer = resolvePayer(payload)
  const directAddresses = buildDirectOrderAddresses(payload)
  const shippingAddress = requiresShipping ? directAddresses.shippingAddress : null
  const formattedShippingAddress = formatMailingAddress(shippingAddress)
  const note = [
    cleanString(payload.notes),
    hasProOrder ? 'Order type: Pro Order' : '',
    requiresShipping ? '' : 'Fulfillment: Local delivery / no shipping required',
    shippingOption ? `Shipping: ${formatSalesOrderShippingCharge(shippingOption)}` : '',
    productionTimeline === 'rush'
      ? `Production timeline: Rush (${rushProductionSurchargeAmount} per bat)`
      : 'Production timeline: Normal',
    isZeroDollarOrder ? '$0 sample order - invoice sent for documentation' : '',
    playerName ? `Player: ${playerName}` : '',
    playerEmail ? `Player email: ${playerEmail}` : '',
    playerPhone ? `Player phone: ${playerPhone}` : '',
    purchaseOrder ? `Purchase order: ${purchaseOrder}` : '',
    formattedShippingAddress ? `Shipping address: ${formattedShippingAddress}` : '',
    billingDifferent ? `Bill to: ${payer.name || payer.email}` : '',
    billingDifferent && payer.phone ? `Payer phone: ${payer.phone}` : '',
    payer.company ? `Team/agency: ${payer.company}` : '',
    payer.relationship ? `Billing relationship: ${payer.relationship}` : '',
    salesRep ? `Sales rep: ${salesRep}` : '',
    salesRepEmail ? `Sales rep email: ${salesRepEmail}` : '',
    orderSubmittedAt ? `Order submitted: ${orderSubmittedAt}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    email: payer.email || undefined,
    phone: payer.phone || undefined,
    ...(purchaseOrder ? { poNumber: purchaseOrder } : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(shippingLine ? { shippingLine } : {}),
    note,
    tags: ['Trinity Intake', 'Internal Sales'].concat(
      hasInternalAttachment ? ['Trinity Attachment'] : [],
      salesRep ? [`Sales Rep: ${salesRep}`] : [],
      playerName ? [`Player: ${playerName}`] : [],
      hasProOrder ? ['Pro Order'] : [],
    ),
    customAttributes: compactAttributes({
      trinity_origin: 'internal_sales',
      trinity_intake_id: intakeId,
      trinity_has_pro_order: hasProOrder ? 'true' : '',
      trinity_order_type: hasProOrder ? 'Pro Order' : '',
      trinity_zero_dollar_sample: isZeroDollarOrder ? 'true' : '',
      trinity_requires_shipping: requiresShipping ? 'true' : 'false',
      trinity_shipping_charge: shippingLine
        ? `${shippingLine.title} ${shippingLine.priceWithCurrency.amount} ${shippingLine.priceWithCurrency.currencyCode}`
        : '',
      trinity_shipping_speed: shippingOption?.key ?? '',
      trinity_shipping_title: shippingOption?.title ?? '',
      trinity_shipping_amount: shippingOption?.amount ?? '',
      trinity_shipping_bat_quantity: shippingOption?.batQuantity ?? '',
      trinity_fulfillment_method: requiresShipping ? '' : 'Local delivery',
      trinity_production_timeline: productionTimeline,
      trinity_rush_production_surcharge: rushSurchargeLine
        ? `${rushProductionSurchargeAmount} ${shopCurrencyCode} per bat`
        : '',
      trinity_order_submitted_at: orderSubmittedAt,
      trinity_sales_rep: salesRep,
      trinity_sales_rep_email: salesRepEmail,
      trinity_player_name: playerName,
      trinity_player_email: playerEmail,
      trinity_player_phone: playerPhone,
      trinity_purchase_order: purchaseOrder,
      trinity_shipping_address: formattedShippingAddress,
      trinity_billing_different: billingDifferent ? 'true' : '',
      trinity_billing_name: payer.name,
      trinity_billing_email: payer.email,
      trinity_billing_phone: payer.phone,
      trinity_billing_company: payer.company,
      trinity_billing_relationship: payer.relationship,
      trinity_staff_notification_recipients: internalOrderNotificationEmails.join(', '),
    }),
    lineItems: lines
      .map((line) => {
        const unitPrice = toMoneyInput(line.unitPrice)
        const itemType = normalizeSalesOrderItemType(line.itemType)
        const isProOrder = itemType === 'bat' && isTruthy(line.isProOrder)
        const variantId = isProOrder || itemType === 'misc' ? '' : cleanString(line.variantId)
        const title = formatSalesLineShopifyTitle(line, isProOrder)
        const customAttributes = compactAttributes({
          order_type: isProOrder ? 'Pro Order' : '',
          trinity_player_name: playerName,
          trinity_item_type: itemType,
          trinity_shirt_size: itemType === 'shirt' ? line.variantTitle : '',
          trinity_pro_order: isProOrder ? 'true' : '',
          trinity_model: cleanString(line.title || line.model),
          trinity_length: itemType === 'bat' ? line.length : '',
          trinity_weight: itemType === 'bat' ? line.targetWeight : '',
          trinity_wood: itemType === 'bat' ? line.wood : '',
          trinity_handle_color: itemType === 'bat' ? line.handleColor : '',
          trinity_barrel_color: itemType === 'bat' ? line.barrelColor : '',
          trinity_band_color: itemType === 'bat' ? line.bandColor : '',
          trinity_logo_color: itemType === 'bat' ? line.logoColor : '',
          trinity_engraving: itemType === 'bat' ? line.engraving : '',
          trinity_cupped: itemType === 'bat' ? line.cupped : '',
          trinity_notes: itemType === 'bat' ? line.notes : '',
          trinity_product_title: line.title,
          trinity_requires_shipping: requiresShipping ? 'true' : 'false',
        })

        if (variantId) {
          return {
            variantId,
            quantity: Number(line.quantity || 1),
            ...(unitPrice ? { priceOverride: unitPrice } : {}),
            requiresShipping,
            taxable: false,
            customAttributes,
          }
        }

        return {
          title,
          originalUnitPriceWithCurrency: unitPrice ?? {
            amount: '0',
            currencyCode: shopCurrencyCode,
          },
          quantity: Number(line.quantity || 1),
          requiresShipping,
          taxable: false,
          customAttributes,
        }
      })
      .concat(rushSurchargeLine ? [rushSurchargeLine] : []),
  }
}

function buildDraftOrderShippingLine(shippingOption) {
  if (!shippingOption?.amount) return null

  return {
    title: shippingOption.title,
    priceWithCurrency: {
      amount: shippingOption.amount,
      currencyCode: shopCurrencyCode,
    },
  }
}

function buildOrderCreateShippingLine(shippingOption) {
  if (!shippingOption?.amount) return null

  const priceSet = toMoneyBagInput(shippingOption.amount)
  if (!priceSet) return null

  return {
    title: shippingOption.title,
    code: shippingOption.key,
    source: 'trinity_order_form',
    priceSet,
  }
}

function resolveShippingOption(payload = {}, requiresShipping = true) {
  if (!requiresShipping) return null

  const shippingSpeed = normalizeShippingSpeed(payload.shippingSpeed)
  const option =
    draftOrderShippingOptions[shippingSpeed] ?? draftOrderShippingOptions[defaultShippingSpeed]
  const quote = getSalesOrderShippingQuote(
    shippingSpeed,
    getSalesOrderProductionQuantity(payload),
  )

  if (!option) return null

  return {
    ...option,
    ...quote,
    title: `${option.title} (${formatSalesOrderBatCount(quote.batQuantity)})`,
  }
}

function normalizeShippingSpeed(value) {
  return normalizeSalesOrderShippingSpeed(value)
}

function formatSalesOrderShippingCharge(shippingOption) {
  if (!shippingOption) return ''
  return `${shippingOption.title} — $${shippingOption.amount} ${shopCurrencyCode}`
}

function normalizeProductionTimeline(value) {
  return cleanString(value).toLowerCase() === 'rush' ? 'rush' : 'normal'
}

function buildDraftRushProductionSurchargeLine(payload = {}) {
  const quantity = getSalesOrderProductionQuantity(payload)
  if (
    normalizeProductionTimeline(payload.productionTimeline) !== 'rush' ||
    !rushProductionSurchargeAmount ||
    quantity < 1
  ) {
    return null
  }

  return {
    title: rushProductionSurchargeTitle,
    originalUnitPriceWithCurrency: {
      amount: rushProductionSurchargeAmount,
      currencyCode: shopCurrencyCode,
    },
    quantity,
    requiresShipping: false,
    taxable: false,
    customAttributes: compactAttributes({
      trinity_surcharge_type: 'rush_production',
      trinity_production_timeline: 'rush',
      trinity_surcharge_unit_amount: rushProductionSurchargeAmount,
    }),
  }
}

function buildOrderRushProductionSurchargeLine(payload = {}) {
  const quantity = getSalesOrderProductionQuantity(payload)
  const priceSet = toMoneyBagInput(rushProductionSurchargeAmount)
  if (
    normalizeProductionTimeline(payload.productionTimeline) !== 'rush' ||
    !priceSet ||
    quantity < 1
  ) {
    return null
  }

  return {
    title: rushProductionSurchargeTitle,
    quantity,
    requiresShipping: false,
    taxable: false,
    priceSet,
    properties: compactLineItemProperties({
      trinity_surcharge_type: 'rush_production',
      trinity_production_timeline: 'rush',
      trinity_surcharge_unit_amount: rushProductionSurchargeAmount,
    }),
  }
}

function specsFromSalesLine(line = {}) {
  return {
    model: cleanString(line.title || line.model),
    length: cleanString(line.length),
    targetWeight: cleanString(line.targetWeight),
    wood: cleanString(line.wood),
    handleColor: cleanString(line.handleColor),
    barrelColor: cleanString(line.barrelColor),
    bandColor: cleanString(line.bandColor),
    logoColor: cleanString(line.logoColor),
    engraving: cleanString(line.engraving),
    cupped: cleanString(line.cupped),
    notes: cleanString(line.notes),
  }
}

function mergeSpecs(primary = {}, fallback = {}) {
  return {
    model: cleanString(primary.model) || cleanString(fallback.model),
    length: cleanString(primary.length) || cleanString(fallback.length),
    targetWeight: cleanString(primary.targetWeight) || cleanString(fallback.targetWeight),
    wood: cleanString(primary.wood) || cleanString(fallback.wood),
    handleColor: cleanString(primary.handleColor) || cleanString(fallback.handleColor),
    barrelColor: cleanString(primary.barrelColor) || cleanString(fallback.barrelColor),
    bandColor: cleanString(primary.bandColor) || cleanString(fallback.bandColor),
    logoColor: cleanString(primary.logoColor) || cleanString(fallback.logoColor),
    engraving: cleanString(primary.engraving) || cleanString(fallback.engraving),
    cupped: cleanString(primary.cupped) || cleanString(fallback.cupped),
    notes: cleanString(primary.notes) || cleanString(fallback.notes),
  }
}

function mapDraftOrderToJobs(
  draftOrder,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = draftOrder?.createdAt ?? new Date().toISOString(),
) {
  const now = new Date().toISOString()
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  const draftLines = (draftOrder?.lineItems?.nodes ?? []).filter(
    (line) => !isGraphQLSurchargeLine(line),
  )
  const playerName = cleanString(payload.playerName || payload.customerName)
  const playerEmail = cleanString(payload.playerEmail)
  const billingDifferent = isTruthy(payload.billingDifferent)
  const payer = resolvePayer(payload)
  const draftInvoiceUrl = normalizeDraftInvoiceUrl(draftOrder?.invoiceUrl)
  const internalAttachment = normalizeOrderAttachment(payload.attachment)
  const purchaseOrder = cleanString(payload.purchaseOrder)

  return lines.map((line, index) => {
    const draftLine = draftLines[index] ?? {}
    const variant = draftLine.variant ?? null
    const product = draftLine.product ?? null
    const specs = specsFromSalesLine(line)

    return {
      id: `draft-${extractNumericId(draftOrder.id)}-line-${index + 1}`,
      itemType: normalizeSalesOrderItemType(line.itemType),
      origin: 'internal_sales',
      intakeId,
      playerProfileId: '',
      shopifyOrderId: '',
      shopifyOrderName: '',
      shopifyDraftOrderId: draftOrder.id,
      shopifyDraftOrderName: draftOrder.name ?? '',
      shopifyDraftInvoiceUrl: draftInvoiceUrl,
      lineItemId: draftLine.id ?? '',
      orderSubmittedAt,
      customerName: payer.name || playerName,
      customerEmail: payer.email || draftOrder.email || playerEmail,
      playerName,
      playerEmail,
      billingDifferent,
      billingName: payer.name,
      billingEmail: payer.email,
      billingPhone: payer.phone,
      billingCompany: payer.company,
      billingRelationship: payer.relationship,
      purchaseOrder,
      productTitle: draftLine.name || cleanString(line.title) || product?.title || 'Custom Trinity bat',
      variantTitle: variant?.title ?? '',
      shopifyProductId: product?.id ?? '',
      shopifyVariantId: variant?.id ?? cleanString(line.variantId),
      quantity: Number(line.quantity || draftLine.quantity || 1),
      financialStatus: 'draft',
      fulfillmentStatus: 'unfulfilled',
      invoiceStatus: invoiceSent ? 'sent' : 'draft',
      productionStatus: 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: cleanString(payload.salesRep),
      salesRepEmail: normalizeEmail(payload.salesRepEmail),
      totalPrice: cleanString(line.unitPrice),
      currency: draftOrder?.totalPriceSet?.shopMoney?.currencyCode ?? '',
      specs,
      lineItems: [
        {
          title: draftLine.name || cleanString(line.title),
          quantity: Number(line.quantity || 1),
          variantId: variant?.id ?? cleanString(line.variantId),
          productId: product?.id ?? '',
        },
      ],
      internalAttachment,
      internalAttachmentNotifications: [],
      notes: cleanString(line.notes),
      internalNotes: cleanString(payload.notes),
      createdAt: draftOrder.createdAt ?? now,
      updatedAt: now,
    }
  })
}

function mapCompletedDraftOrderToJobs(
  order,
  draftOrder,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = draftOrder?.createdAt ?? order?.createdAt ?? new Date().toISOString(),
) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return mapGraphQLOrderToJobs(order).map((job, index) => {
    const line = lines[index] ?? {}
    const fallbackSpecs = specsFromSalesLine(line)

    return {
      ...job,
      origin: 'internal_sales',
      intakeId,
      shopifyDraftOrderId: draftOrder.id,
      shopifyDraftOrderName: draftOrder.name ?? '',
      shopifyDraftInvoiceUrl: normalizeDraftInvoiceUrl(draftOrder.invoiceUrl),
      orderSubmittedAt: orderSubmittedAt || job.orderSubmittedAt,
      invoiceStatus: invoiceSent ? 'sent' : job.invoiceStatus,
      salesRep: job.salesRep || cleanString(payload.salesRep),
      salesRepEmail: job.salesRepEmail || normalizeEmail(payload.salesRepEmail),
      purchaseOrder: job.purchaseOrder || cleanString(payload.purchaseOrder),
      specs: mergeSpecs(job.specs, fallbackSpecs),
      internalAttachment: job.internalAttachment || normalizeOrderAttachment(payload.attachment),
      internalAttachmentNotifications: normalizeInternalAttachmentNotifications(
        job.internalAttachmentNotifications,
      ),
      internalNotes: cleanString(payload.notes),
      notes: job.notes || cleanString(line.notes),
      totalPrice: cleanString(line.unitPrice) || job.totalPrice,
    }
  })
}

function mapCreatedOrderToJobs(
  order,
  payload,
  intakeId,
  invoiceSent,
  orderSubmittedAt = order?.createdAt ?? new Date().toISOString(),
) {
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return mapGraphQLOrderToJobs(order).map((job, index) => {
    const line = lines[index] ?? {}
    const fallbackSpecs = specsFromSalesLine(line)

    return {
      ...job,
      origin: 'internal_sales',
      intakeId,
      orderSubmittedAt: job.orderSubmittedAt || orderSubmittedAt,
      invoiceStatus: invoiceSent ? 'sent' : job.invoiceStatus,
      salesRep: job.salesRep || cleanString(payload.salesRep),
      salesRepEmail: job.salesRepEmail || normalizeEmail(payload.salesRepEmail),
      purchaseOrder: job.purchaseOrder || cleanString(payload.purchaseOrder),
      specs: mergeSpecs(job.specs, fallbackSpecs),
      internalAttachment: job.internalAttachment || normalizeOrderAttachment(payload.attachment),
      internalAttachmentNotifications: normalizeInternalAttachmentNotifications(
        job.internalAttachmentNotifications,
      ),
      internalNotes: cleanString(payload.notes),
      notes: job.notes || cleanString(line.notes),
      totalPrice: cleanString(line.unitPrice) || job.totalPrice,
    }
  })
}

function mapGraphQLOrderToJobs(order) {
  const orderAttributes = attributesToRecord(order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const rawLines = order.lineItems?.nodes ?? []
  const lines =
    origin === 'internal_sales'
      ? rawLines.filter((line) => !isGraphQLSurchargeLine(line))
      : rawLines.filter((line) => isBatProductLike(line.variant?.product ?? { title: line.title }))
  const money = order.currentTotalPriceSet?.shopMoney ?? {}

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.customAttributes)
    const variant = line.variant ?? null
    const product = variant?.product ?? null
    const specs = extractSpecs(orderAttributes, lineAttributes)
    const itemType = normalizeSalesOrderItemType(
      lineAttributes.trinity_item_type || (isShirtProductLike(product) ? 'shirt' : 'bat'),
    )
    const identity = extractOrderIdentity(
      orderAttributes,
      lineAttributes,
      order.shippingAddress?.name ?? order.customer?.displayName ?? '',
      order.customer?.displayName ?? '',
      order.email ?? order.customer?.email ?? '',
    )
    const internalAttachment =
      normalizeOrderAttachment(order.internalAttachment?.jsonValue) ||
      normalizeOrderAttachmentFromAttributes(orderAttributes)
    const internalAttachmentNotifications = normalizeInternalAttachmentNotifications(
      order.internalAttachmentNotifications?.jsonValue,
    )

    return {
      id: `order-${extractNumericId(order.id)}-line-${extractNumericId(line.id)}`,
      itemType,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      playerProfileId: '',
      shopifyOrderId: order.id,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: '',
      shopifyDraftOrderName: '',
      lineItemId: line.id,
      orderSubmittedAt: orderAttributes.trinity_order_submitted_at ?? order.createdAt,
      customerName: order.customer?.displayName ?? '',
      customerEmail: order.email ?? order.customer?.email ?? '',
      playerName: identity.playerName,
      playerEmail: identity.playerEmail,
      billingDifferent: identity.billingDifferent,
      billingName: identity.billingName,
      billingEmail: identity.billingEmail,
      billingPhone: identity.billingPhone,
      billingCompany: identity.billingCompany,
      billingRelationship: identity.billingRelationship,
      purchaseOrder: orderAttributes.trinity_purchase_order ?? cleanString(order.poNumber),
      productTitle: line.title ?? product?.title ?? '',
      variantTitle: variant?.title ?? '',
      shopifyProductId: product?.id ?? '',
      shopifyVariantId: variant?.id ?? '',
      quantity: Number(line.quantity || 1),
      financialStatus: order.displayFinancialStatus ?? '',
      fulfillmentStatus: order.displayFulfillmentStatus ?? '',
      invoiceStatus: String(order.displayFinancialStatus ?? '').toLowerCase().includes('paid')
        ? 'paid'
        : origin === 'website'
          ? 'not_required'
          : 'sent',
      productionStatus: 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: orderAttributes.trinity_sales_rep ?? '',
      salesRepEmail: normalizeEmail(orderAttributes.trinity_sales_rep_email),
      totalPrice: getGraphQLLineUnitPrice(line, money.amount),
      currency: money.currencyCode ?? '',
      specs,
      lineItems: [
        {
          title: line.title,
          quantity: Number(line.quantity || 1),
          variantId: variant?.id ?? '',
          productId: product?.id ?? '',
        },
      ],
      internalAttachment,
      internalAttachmentNotifications,
      notes: lineAttributes.trinity_notes ?? order.note ?? '',
      internalNotes: '',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? new Date().toISOString(),
    }
  })
}

function getGraphQLLineUnitPrice(line, fallbackAmount = '') {
  const unitAmount =
    getGraphQLMoneyAmount(line?.discountedUnitPriceSet) ||
    getGraphQLMoneyAmount(line?.originalUnitPriceSet)
  if (unitAmount) return unitAmount

  const quantity = Number(line?.quantity || 1)
  const totalAmount =
    getGraphQLMoneyAmount(line?.discountedTotalSet) ||
    getGraphQLMoneyAmount(line?.originalTotalSet)
  const total = Number(totalAmount)
  if (Number.isFinite(total) && Number.isFinite(quantity) && quantity > 0) {
    return String(total / quantity)
  }

  return cleanString(fallbackAmount)
}

function getGraphQLMoneyAmount(moneySet) {
  return cleanString(moneySet?.shopMoney?.amount)
}

function mapOrderWebhookToJobs(order, topic) {
  const orderAttributes = attributesToRecord(order.note_attributes ?? order.customAttributes)
  const origin = orderAttributes.trinity_origin === 'internal_sales' ? 'internal_sales' : 'website'
  const rawLines = order.line_items ?? []
  const lines =
    origin === 'internal_sales'
      ? rawLines.filter((line) => !isWebhookSurchargeLine(line))
      : rawLines.filter((line) =>
          isBatProductLike({
            title: line.title ?? line.name,
            productType: line.product_type,
            tags: line.tags,
          }),
        )
  const orderId = order.admin_graphql_api_id ?? toShopifyGid('Order', order.id)
  const isCancelled = Boolean(order.cancelled_at) || topic === 'orders/cancelled'

  return lines.map((line) => {
    const lineAttributes = attributesToRecord(line.properties)
    const lineItemId = line.admin_graphql_api_id ?? toShopifyGid('LineItem', line.id)
    const specs = extractSpecs(orderAttributes, lineAttributes)
    const itemType = normalizeSalesOrderItemType(
      lineAttributes.trinity_item_type ||
        (isShirtProductLike({
          title: line.title ?? line.name,
          productType: line.product_type,
          tags: line.tags,
        })
          ? 'shirt'
          : 'bat'),
    )
    const identity = extractOrderIdentity(
      orderAttributes,
      lineAttributes,
      cleanString(
        order.shipping_address?.name ||
          [order.shipping_address?.first_name, order.shipping_address?.last_name]
            .filter(Boolean)
            .join(' '),
      ) || customerNameFromWebhook(order.customer),
      customerNameFromWebhook(order.customer),
      order.email ?? order.customer?.email ?? '',
    )

    return {
      id: `order-${extractNumericId(orderId)}-line-${extractNumericId(lineItemId)}`,
      itemType,
      origin,
      intakeId: orderAttributes.trinity_intake_id ?? '',
      playerProfileId: '',
      shopifyOrderId: orderId,
      shopifyOrderName: order.name ?? '',
      shopifyDraftOrderId: orderAttributes.trinity_draft_order_id ?? '',
      shopifyDraftOrderName: '',
      lineItemId,
      orderSubmittedAt: orderAttributes.trinity_order_submitted_at ?? order.created_at,
      customerName: customerNameFromWebhook(order.customer),
      customerEmail: order.email ?? order.customer?.email ?? '',
      playerName: identity.playerName,
      playerEmail: identity.playerEmail,
      billingDifferent: identity.billingDifferent,
      billingName: identity.billingName,
      billingEmail: identity.billingEmail,
      billingPhone: identity.billingPhone,
      billingCompany: identity.billingCompany,
      billingRelationship: identity.billingRelationship,
      purchaseOrder:
        orderAttributes.trinity_purchase_order ?? cleanString(order.po_number || order.poNumber),
      productTitle: line.title ?? line.name ?? '',
      variantTitle: line.variant_title ?? '',
      shopifyProductId: line.product_id ? toShopifyGid('Product', line.product_id) : '',
      shopifyVariantId: line.variant_id ? toShopifyGid('ProductVariant', line.variant_id) : '',
      quantity: Number(line.quantity || 1),
      financialStatus: order.financial_status ?? '',
      fulfillmentStatus: order.fulfillment_status ?? 'unfulfilled',
      invoiceStatus:
        String(order.financial_status ?? '').toLowerCase() === 'paid'
          ? 'paid'
          : origin === 'website'
            ? 'not_required'
            : 'sent',
      productionStatus: isCancelled ? 'cancelled' : 'new',
      assignedBilletId: '',
      linkedProducedBatId: '',
      salesRep: orderAttributes.trinity_sales_rep ?? '',
      salesRepEmail: normalizeEmail(orderAttributes.trinity_sales_rep_email),
      totalPrice: cleanString(line.price),
      currency: order.currency ?? '',
      specs,
      lineItems: [
        {
          title: line.title ?? '',
          quantity: Number(line.quantity || 1),
          variantId: line.variant_id ? toShopifyGid('ProductVariant', line.variant_id) : '',
          productId: line.product_id ? toShopifyGid('Product', line.product_id) : '',
        },
      ],
      internalAttachment: null,
      internalAttachmentNotifications: [],
      notes: lineAttributes.trinity_notes ?? order.note ?? '',
      internalNotes: '',
      createdAt: order.created_at,
      updatedAt: order.updated_at ?? new Date().toISOString(),
    }
  })
}

function getEarlierOrderTimestamp(...values) {
  const candidates = values.map((value) => cleanString(value)).filter(Boolean)
  return candidates.sort()[0] ?? ''
}

function mergeOrderJob(existing, incoming) {
  if (!existing) return incoming

  return {
    ...existing,
    ...incoming,
    productionStatus:
      incoming.productionStatus === 'cancelled'
        ? 'cancelled'
        : existing.productionStatus || incoming.productionStatus,
    shopifyDraftOrderId: existing.shopifyDraftOrderId || incoming.shopifyDraftOrderId,
    shopifyDraftOrderName: existing.shopifyDraftOrderName || incoming.shopifyDraftOrderName,
    shopifyDraftInvoiceUrl: existing.shopifyDraftInvoiceUrl || incoming.shopifyDraftInvoiceUrl,
    assignedBilletId: existing.assignedBilletId || incoming.assignedBilletId,
    linkedProducedBatId: existing.linkedProducedBatId || incoming.linkedProducedBatId,
    orderSubmittedAt: getEarlierOrderTimestamp(
      existing.orderSubmittedAt,
      incoming.orderSubmittedAt,
      existing.createdAt,
      incoming.createdAt,
    ),
    salesRep: existing.salesRep || incoming.salesRep,
    salesRepEmail: existing.salesRepEmail || incoming.salesRepEmail,
    salesRepSubmissionNotificationSentAt:
      existing.salesRepSubmissionNotificationSentAt ||
      incoming.salesRepSubmissionNotificationSentAt,
    salesRepPaidNotificationSentAt:
      existing.salesRepPaidNotificationSentAt || incoming.salesRepPaidNotificationSentAt,
    playerProfileId: existing.playerProfileId || incoming.playerProfileId,
    playerName: existing.playerName || incoming.playerName,
    playerEmail: existing.playerEmail || incoming.playerEmail,
    billingDifferent: existing.billingDifferent || incoming.billingDifferent,
    billingName: existing.billingName || incoming.billingName,
    billingEmail: existing.billingEmail || incoming.billingEmail,
    billingPhone: existing.billingPhone || incoming.billingPhone,
    billingCompany: existing.billingCompany || incoming.billingCompany,
    billingRelationship: existing.billingRelationship || incoming.billingRelationship,
    purchaseOrder: existing.purchaseOrder || incoming.purchaseOrder,
    specs: mergeSpecs(existing.specs, incoming.specs),
    internalAttachment: existing.internalAttachment || incoming.internalAttachment || null,
    internalAttachmentNotifications: normalizeInternalAttachmentNotifications([
      ...(existing.internalAttachmentNotifications ?? []),
      ...(incoming.internalAttachmentNotifications ?? []),
    ]),
    internalNotes: existing.internalNotes || incoming.internalNotes,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  }
}

function mergeIncomingOrderJobs(existingJobs, incomingJobs) {
  const matchIndex = createOrderJobMatchIndex(existingJobs)
  return incomingJobs.map((job) => mergeOrderJob(findMatchingOrderJob(matchIndex, job), job))
}

function createOrderJobMatchIndex(existingJobs) {
  const byId = new Map()
  const byLineItemId = new Map()
  const byIntakeProduct = new Map()

  for (const job of existingJobs) {
    rememberFirstOrderJob(byId, cleanString(job.id), job)
    rememberFirstOrderJob(byLineItemId, cleanString(job.lineItemId), job)
    rememberFirstOrderJob(byIntakeProduct, orderJobIntakeProductKey(job), job)
  }

  return { byId, byLineItemId, byIntakeProduct }
}

function rememberFirstOrderJob(index, key, job) {
  if (key && !index.has(key)) index.set(key, job)
}

function findMatchingOrderJob(matchIndex, incomingJob) {
  const id = cleanString(incomingJob.id)
  if (id && matchIndex.byId.has(id)) return matchIndex.byId.get(id)

  const lineItemId = cleanString(incomingJob.lineItemId)
  if (lineItemId && matchIndex.byLineItemId.has(lineItemId)) {
    return matchIndex.byLineItemId.get(lineItemId)
  }

  const intakeProductKey = orderJobIntakeProductKey(incomingJob)
  if (intakeProductKey && matchIndex.byIntakeProduct.has(intakeProductKey)) {
    return matchIndex.byIntakeProduct.get(intakeProductKey)
  }

  return null
}

function orderJobIntakeProductKey(job) {
  const intakeId = cleanString(job.intakeId)
  const productTitle = cleanString(job.productTitle)
  return intakeId && productTitle ? `${intakeId}::${productTitle}` : ''
}

function extractSpecs(orderAttributes, lineAttributes) {
  return {
    model: lineAttributes.trinity_model ?? orderAttributes.trinity_model ?? '',
    length: lineAttributes.trinity_length ?? orderAttributes.trinity_length ?? '',
    targetWeight: lineAttributes.trinity_weight ?? orderAttributes.trinity_weight ?? '',
    wood: lineAttributes.trinity_wood ?? orderAttributes.trinity_wood ?? '',
    handleColor: lineAttributes.trinity_handle_color ?? orderAttributes.trinity_handle_color ?? '',
    barrelColor: lineAttributes.trinity_barrel_color ?? orderAttributes.trinity_barrel_color ?? '',
    bandColor: lineAttributes.trinity_band_color ?? orderAttributes.trinity_band_color ?? '',
    logoColor: lineAttributes.trinity_logo_color ?? orderAttributes.trinity_logo_color ?? '',
    engraving: lineAttributes.trinity_engraving ?? orderAttributes.trinity_engraving ?? '',
    cupped: lineAttributes.trinity_cupped ?? orderAttributes.trinity_cupped ?? '',
    notes: lineAttributes.trinity_notes ?? orderAttributes.trinity_notes ?? '',
  }
}

function extractOrderIdentity(
  orderAttributes,
  lineAttributes,
  fallbackPlayerName,
  fallbackBillingName,
  fallbackEmail,
) {
  const playerName =
    attributeValue([lineAttributes, orderAttributes], [
      'trinity_player_name',
      'player_name',
      'player',
      'player name',
      'name on bat',
    ]) || cleanString(fallbackPlayerName)
  const playerEmail =
    attributeValue([lineAttributes, orderAttributes], [
      'trinity_player_email',
      'player_email',
      'player email',
    ]) || ''
  const billingName =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_name',
      'billing_name',
      'bill_to_name',
      'bill to',
      'payer_name',
      'team',
      'agent',
    ]) || cleanString(fallbackBillingName)
  const billingEmail =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_email',
      'billing_email',
      'bill_to_email',
      'payer_email',
    ]) || cleanString(fallbackEmail)
  const billingPhone =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_phone',
      'billing_phone',
      'bill_to_phone',
      'payer_phone',
      'phone',
    ]) || ''
  const billingCompany =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_company',
      'billing_company',
      'team',
      'agency',
    ]) || ''
  const billingRelationship =
    attributeValue([orderAttributes, lineAttributes], [
      'trinity_billing_relationship',
      'billing_relationship',
      'payer_relationship',
      'relationship',
    ]) || ''
  const explicitDifferent = attributeValue([orderAttributes, lineAttributes], [
    'trinity_billing_different',
    'billing_different',
  ])

  return {
    playerName,
    playerEmail,
    billingDifferent:
      isTruthy(explicitDifferent) ||
      Boolean(playerName && billingName && playerName.toLowerCase() !== billingName.toLowerCase()),
    billingName,
    billingEmail,
    billingPhone,
    billingCompany,
    billingRelationship,
  }
}

function attributeValue(records, keys) {
  const normalizedKeys = keys.map(normalizeAttributeKey)

  for (const record of records) {
    for (const [key, value] of Object.entries(record ?? {})) {
      if (normalizedKeys.includes(normalizeAttributeKey(key))) {
        return cleanString(value)
      }
    }
  }

  return ''
}

function normalizeAttributeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function isTruthy(value) {
  return ['true', 'yes', '1', 'on'].includes(cleanString(value).toLowerCase())
}

function requiresShippingForOrder(payload = {}) {
  const value = payload.requiresShipping
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined || cleanString(value) === '') return true
  return !['false', 'no', '0', 'off'].includes(cleanString(value).toLowerCase())
}

function normalizePositiveMoneyAmount(value) {
  const amount = Number(cleanString(value))
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return amount.toFixed(2)
}

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function isGraphQLSurchargeLine(line) {
  return isRushProductionSurchargeAttributes(attributesToRecord(line?.customAttributes))
}

function isWebhookSurchargeLine(line) {
  return isRushProductionSurchargeAttributes(attributesToRecord(line?.properties))
}

function isRushProductionSurchargeAttributes(attributes = {}) {
  for (const [key, value] of Object.entries(attributes)) {
    if (
      normalizeAttributeKey(key) === 'trinity_surcharge_type' &&
      cleanString(value).toLowerCase() === 'rush_production'
    ) {
      return true
    }
  }

  return false
}

function attributesToRecord(attributes) {
  const record = {}
  if (!Array.isArray(attributes)) return record

  for (const attribute of attributes) {
    const key = attribute?.key ?? attribute?.name
    if (!key) continue
    record[key] = attribute?.value ?? ''
  }

  return record
}

function compactAttributes(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => ({ key, value: String(value) }))
}

function compactLineItemProperties(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([name, value]) => ({ name, value: String(value) }))
}

function verifyShopifyWebhook(request) {
  if (!webhookSecret) return true

  const hmac = request.get('x-shopify-hmac-sha256') ?? ''
  const digest = crypto.createHmac('sha256', webhookSecret).update(request.body).digest('base64')
  const received = Buffer.from(hmac)
  const expected = Buffer.from(digest)

  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

function resolvePublicBaseUrl(request, explicitBaseUrl) {
  if (explicitBaseUrl) return String(explicitBaseUrl)
  if (process.env.SHOPIFY_APP_URL) return process.env.SHOPIFY_APP_URL
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL

  const host = request.get('x-forwarded-host') ?? request.get('host')
  if (!host || host.includes('127.0.0.1') || host.includes('localhost')) return ''

  const protocol = request.get('x-forwarded-proto') ?? request.protocol ?? 'https'
  return `${protocol}://${host}`
}

function orderMetafield(ownerId, key, value) {
  return {
    namespace: 'trinity',
    key,
    ownerId,
    type: 'single_line_text_field',
    value: value === undefined || value === null ? '' : String(value),
  }
}

function toShopifyGid(type, value) {
  if (!value) return ''
  const stringValue = String(value)
  if (stringValue.startsWith('gid://')) return stringValue
  return `gid://shopify/${type}/${extractNumericId(stringValue)}`
}

function extractNumericId(value) {
  const match = String(value ?? '').match(/(\d+)$/)
  return match?.[1] ?? String(value ?? '')
}

function normalizeHostname(value) {
  const host = cleanString(value)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim()
    .toLowerCase()

  return host
}

function normalizeDraftInvoiceUrl(invoiceUrl) {
  const rawUrl = cleanString(invoiceUrl)
  if (!rawUrl || !draftInvoiceHost) return rawUrl

  try {
    const url = new URL(rawUrl)
    const knownInvoiceHosts = new Set(
      [shopDomain, draftInvoiceHost, 'trinitybatco.com', 'www.trinitybatco.com']
        .map(normalizeHostname)
        .filter(Boolean),
    )

    if (!knownInvoiceHosts.has(normalizeHostname(url.hostname))) return rawUrl

    url.protocol = 'https:'
    url.hostname = draftInvoiceHost
    url.port = ''
    return url.toString()
  } catch {
    return rawUrl
  }
}

function normalizeDraftOrderInvoiceUrl(draftOrder) {
  if (!draftOrder) return draftOrder

  return {
    ...draftOrder,
    invoiceUrl: normalizeDraftInvoiceUrl(draftOrder.invoiceUrl),
  }
}

function createPlainId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseEmailList(value, fallback = [], required = []) {
  const configuredEmails = cleanString(value)
    .split(/[\s,;]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
  const emails = (configuredEmails.length > 0 ? configuredEmails : fallback).concat(required)

  return uniqueEmails(emails)
}

function uniqueEmails(emails) {
  return Array.from(new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean)))
}

function normalizeEmail(email) {
  const normalized = cleanString(email).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

function toMoneyInput(value) {
  const amount = cleanString(value)
  if (!amount) return null

  const normalizedAmount = Number(amount)
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) return null

  return {
    amount,
    currencyCode: shopCurrencyCode,
  }
}

function toMoneyBagInput(value) {
  const money = toMoneyInput(value)
  if (!money) return null

  return {
    shopMoney: money,
    presentmentMoney: money,
  }
}

function cleanString(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function customerNameFromWebhook(customer) {
  if (!customer) return ''
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
  return name || customer.email || ''
}

function sanitizeHandle(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64)
}

function typeMatches(actualType, configuredType) {
  if (actualType === configuredType) return true
  if (!configuredType.startsWith('$app:')) return false
  const suffix = configuredType.replace('$app:', '')
  return actualType.endsWith(`--${suffix}`)
}

function definitionField(key, name, type) {
  return { key, name, type }
}

function fieldValue(key, value) {
  if (value === undefined || value === null || value === '') return null
  return { key, value: String(value) }
}

function toBooleanValue(value) {
  return value ? 'true' : 'false'
}

function toLegacyBarrelKnotValue(value) {
  if (value === 'N/A' || value === undefined || value === null || value === '') return null
  if (value === 'Yes' || value === true) return 'true'
  return 'false'
}

function toNumericValue(value) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}
