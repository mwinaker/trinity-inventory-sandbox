// Trinity Bat Co. Customer Events custom pixel
// Paste this in Shopify Admin > Settings > Customer events > Add custom pixel.
// It forwards Shopify's customer event stream to the Trinity analytics collector.

const TRINITY_COLLECTOR_URL =
  'https://trinity-analytics-collector.onrender.com/api/analytics/events';
const TRINITY_PIXEL_VERSION = '5';
const TRINITY_ATTRIBUTION_KEY = 'trinity_attribution_v1';
const TRINITY_SESSION_KEY = 'trinity_session_v1';
const TRINITY_VISITOR_KEY = 'trinity_visitor_v1';
const TRINITY_TRACKING_IDS_KEY = 'trinity_tracking_ids_v1';
const TRINITY_EVENT_QUEUE_KEY = 'trinity_event_queue_v1';
const TRINITY_PATH_LIMIT = 50;
const TRINITY_EVENT_QUEUE_LIMIT = 20;
const TRINITY_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const TRINITY_EVENT_RETRY_DELAYS_MS = [300, 1000, 2500];
const TRINITY_TRACKING_PARAM_NAMES = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'igshid',
];
const TRINITY_TRACKING_COOKIE_NAMES = [
  '_fbp',
  '_fbc',
  '_shopify_y',
  '_shopify_s',
  '_shopify_sa_p',
  '_shopify_sa_t',
  '_landing_page',
  '_orig_referrer',
];
const TRINITY_META_INTEGRATION = {
  shopifyPixelName: 'Trinity Attribution',
  shopifyPixelId: '149749999',
  shopifyPixelVersion: TRINITY_PIXEL_VERSION,
  collector: 'trinity-analytics-collector',
  collectorHost: 'trinity-analytics-collector.onrender.com',
  officialMetaChannel: 'Facebook & Instagram by Meta',
  dataSharingPreference: 'Enhanced',
  dataSharingIncludes: ['Meta Pixel', 'Advanced Matching', 'Conversions API'],
  metaDatasetId: '1374607114874716',
  metaDatasetName: 'Trinity Bat Co. Website',
  metaBusinessId: '146456319986758',
  facebookPageId: '108347050647653',
  facebookPageName: 'Trinity Bat Co.',
  instagramHandle: 'trinitybatco',
  fallbackPixelId: '151912687',
  fallbackPixelName: 'Meta Pixel Fallback',
  fallbackPixelStatus: 'duplicate_risk_after_official_channel_connection',
};

analytics.subscribe('all_standard_events', (event) => {
  trackTrinityEvent(event);
});

analytics.subscribe('all_custom_events', (event) => {
  trackTrinityEvent(event);
});

async function trackTrinityEvent(event) {
  try {
    const attribution = await buildTrinityAttribution(event);
    const browserSignals = await buildBrowserSignals(event, attribution);
    const payload = {
      id: event.id,
      name: event.name,
      timestamp: event.timestamp,
      clientId: event.clientId,
      sessionId: attribution.sessionId,
      visitorId: attribution.visitorId,
      sourcePixel: {
        id: TRINITY_META_INTEGRATION.shopifyPixelId,
        name: TRINITY_META_INTEGRATION.shopifyPixelName,
        version: TRINITY_PIXEL_VERSION,
      },
      integration: TRINITY_META_INTEGRATION,
      browserSignals,
      attribution,
      context: safeContext(event.context),
      data: safeEventData(event),
    };

    await flushQueuedEvents();
    const delivered = await postPayloadWithRetry(payload);
    if (!delivered) await queuePayload(payload);
  } catch (error) {
    console.warn('Trinity analytics pixel failed', error);
  }
}

async function postPayloadWithRetry(payload) {
  for (let attempt = 0; attempt <= TRINITY_EVENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(TRINITY_COLLECTOR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (response && response.ok) return true;

      const status = response ? Number(response.status) : 0;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
    } catch {
      // Retry below. The pixel sandbox intentionally avoids noisy logging for transient network loss.
    }

    const delay = TRINITY_EVENT_RETRY_DELAYS_MS[attempt];
    if (delay) await sleep(delay);
  }

  return false;
}

async function flushQueuedEvents() {
  const queued = await readQueuedPayloads();
  if (queued.length === 0) return;

  const remaining = [];
  for (const payload of queued.slice(-TRINITY_EVENT_QUEUE_LIMIT)) {
    const delivered = await postPayloadWithRetry(payload);
    if (!delivered) remaining.push(payload);
  }

  await browser.localStorage.setItem(
    TRINITY_EVENT_QUEUE_KEY,
    JSON.stringify(remaining.slice(-TRINITY_EVENT_QUEUE_LIMIT)),
  );
}

async function queuePayload(payload) {
  const queued = await readQueuedPayloads();
  queued.push(payload);
  await browser.localStorage.setItem(
    TRINITY_EVENT_QUEUE_KEY,
    JSON.stringify(queued.slice(-TRINITY_EVENT_QUEUE_LIMIT)),
  );
}

async function readQueuedPayloads() {
  const queued = await readJson(TRINITY_EVENT_QUEUE_KEY, []);
  return Array.isArray(queued) ? queued.filter((item) => item && typeof item === 'object') : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildTrinityAttribution(event) {
  const context = event.context || {};
  const documentContext = context.document || {};
  const navigatorContext = context.navigator || {};
  const location = documentContext.location || {};
  const href = asString(location.href || documentContext.URL || documentContext.url);
  const pathname = asString(location.pathname) || pathFromUrl(href);
  const referrer = asString(documentContext.referrer);
  const title = asString(documentContext.title);
  const now = new Date().toISOString();
  const visitorId = await getOrCreateStoredId(TRINITY_VISITOR_KEY, 'visitor');
  const sessionId = await getOrCreateSessionId();
  const stored = await readJson(TRINITY_ATTRIBUTION_KEY, {});
  const trackingIds = await getTrackingIds(href, now);
  const currentTouchpoint = buildTouchpoint(href, referrer, now);
  const existingFirst = stored.first || {};
  const existingLast = stored.last || {};
  const first = hasTouchpoint(existingFirst) ? existingFirst : currentTouchpoint;
  const last = hasRealTouchpoint(currentTouchpoint) ? currentTouchpoint : existingLast;
  const path = Array.isArray(stored.path) ? stored.path : [];
  const nextPath = path
    .concat([
      {
        path: pathname,
        url: href,
        title,
        at: now,
      },
    ])
    .slice(-TRINITY_PATH_LIMIT);

  const next = {
    visitorId,
    sessionId,
    metaIntegration: TRINITY_META_INTEGRATION,
    trackingIds,
    consent: safePrivacyState(),
    first,
    last: hasTouchpoint(last) ? last : first,
    device: inferDevice(asString(navigatorContext.userAgent)),
    path: nextPath,
    updatedAt: now,
  };

  await browser.localStorage.setItem(TRINITY_ATTRIBUTION_KEY, JSON.stringify(next));
  return next;
}

async function getOrCreateStoredId(key, prefix) {
  const stored = asString(await browser.localStorage.getItem(key));
  if (stored) return stored;
  const id = makeId(prefix);
  await browser.localStorage.setItem(key, id);
  return id;
}

async function getOrCreateSessionId() {
  const now = Date.now();
  const stored = await readJson(TRINITY_SESSION_KEY, {});
  if (
    stored.id &&
    Number.isFinite(Number(stored.updatedAtMs)) &&
    now - Number(stored.updatedAtMs) < TRINITY_SESSION_TIMEOUT_MS
  ) {
    const next = { id: stored.id, updatedAtMs: now };
    await browser.sessionStorage.setItem(TRINITY_SESSION_KEY, JSON.stringify(next));
    return stored.id;
  }

  const id = makeId('session');
  await browser.sessionStorage.setItem(
    TRINITY_SESSION_KEY,
    JSON.stringify({ id, updatedAtMs: now }),
  );
  return id;
}

async function readJson(key, fallback) {
  const rawLocal = asString(await browser.localStorage.getItem(key));
  const rawSession = asString(await browser.sessionStorage.getItem(key));
  const raw = rawSession || rawLocal;
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function buildTouchpoint(href, referrer, capturedAt) {
  const params = paramsFromUrl(href);
  const source = normalizeSource(
    params.utm_source || sourceFromTrackingParams(params) || sourceFromReferrer(referrer) || 'direct',
  );
  const medium =
    params.utm_medium || mediumFromTrackingParams(params) || mediumFromReferrer(referrer) || 'direct';
  return {
    source,
    medium,
    campaign: params.utm_campaign || '',
    content: params.utm_content || '',
    term: params.utm_term || '',
    campaignId: params.utm_id || '',
    fbclid: params.fbclid || '',
    gclid: params.gclid || '',
    msclkid: params.msclkid || '',
    ttclid: params.ttclid || '',
    igshid: params.igshid || '',
    landingPage: href,
    referrer,
    capturedAt,
  };
}

function normalizeSource(value) {
  const source = asString(value).trim().toLowerCase();
  if (!source) return '';
  if (
    ['ig', 'instagram', 'instagram.com', 'l.instagram.com', 'lm.instagram.com'].includes(source) ||
    source.includes('instagram')
  ) {
    return 'instagram';
  }
  if (
    ['fb', 'facebook', 'facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com'].includes(source) ||
    source.includes('facebook')
  ) {
    return 'facebook';
  }
  if (
    ['meta', 'facebook-instagram', 'fbig', 'metaads', 'meta-ads'].includes(source) ||
    source.includes('threads.net')
  ) {
    return 'meta';
  }
  if (['x', 'twitter', 'twitter.com', 't.co'].includes(source)) return 'x';
  return source;
}

function hasTouchpoint(touchpoint) {
  return Boolean(touchpoint && (touchpoint.source || touchpoint.landingPage || touchpoint.referrer));
}

function hasRealTouchpoint(touchpoint) {
  if (!hasTouchpoint(touchpoint)) return false;
  return touchpoint.source !== 'direct' || touchpoint.medium !== 'direct';
}

function paramsFromUrl(href) {
  try {
    const searchParams = new URL(href).searchParams;
    const params = {};
    for (const key of TRINITY_TRACKING_PARAM_NAMES) {
      params[key] = asString(searchParams.get(key));
    }
    return params;
  } catch {
    return {};
  }
}

function sourceFromTrackingParams(params) {
  if (params.fbclid || params.igshid) return 'meta';
  if (params.gclid || params.gbraid || params.wbraid) return 'google';
  if (params.msclkid) return 'bing';
  if (params.ttclid) return 'tiktok';
  if (params.twclid) return 'x';
  if (params.li_fat_id) return 'linkedin';
  return '';
}

function mediumFromTrackingParams(params) {
  if (params.fbclid || params.igshid) return 'paid_social';
  if (params.gclid || params.gbraid || params.wbraid || params.msclkid) return 'paid_search';
  if (params.ttclid || params.twclid || params.li_fat_id) return 'paid_social';
  return '';
}

async function getTrackingIds(href, capturedAt) {
  const params = paramsFromUrl(href);
  const stored = await readJson(TRINITY_TRACKING_IDS_KEY, {});
  const next = stored && typeof stored === 'object' ? stored : {};

  for (const key of TRINITY_TRACKING_PARAM_NAMES) {
    const value = asString(params[key]).slice(0, 256);
    if (!value) continue;

    const previous = next[key] && typeof next[key] === 'object' ? next[key] : {};
    next[key] = {
      first: previous.first || value,
      firstCapturedAt: previous.firstCapturedAt || capturedAt,
      last: value,
      lastCapturedAt: capturedAt,
    };
  }

  await browser.localStorage.setItem(TRINITY_TRACKING_IDS_KEY, JSON.stringify(next));
  return next;
}

async function buildBrowserSignals(event, attribution) {
  const context = event.context || {};
  const documentContext = context.document || {};
  const location = documentContext.location || {};
  const href = asString(location.href || documentContext.URL || documentContext.url);

  return {
    integration: TRINITY_META_INTEGRATION,
    trackingParams: paramsFromUrl(href),
    persistedTrackingIds: attribution.trackingIds || {},
    cookies: await readTrackingCookies(),
    consent: safePrivacyState(),
    init: safeInitData(),
  };
}

async function readTrackingCookies() {
  const cookies = {};
  for (const name of TRINITY_TRACKING_COOKIE_NAMES) {
    const value = await safeCookieGet(name);
    if (value) cookies[name] = value.slice(0, 512);
  }
  return cookies;
}

async function safeCookieGet(name) {
  try {
    if (typeof browser === 'undefined' || !browser.cookie || !browser.cookie.get) return '';
    return asString(await browser.cookie.get(name));
  } catch {
    return '';
  }
}

function safePrivacyState() {
  const api = typeof customerPrivacy !== 'undefined' ? customerPrivacy : undefined;
  if (!api) return {};

  return {
    analyticsProcessingAllowed: safePrivacyCall(api, 'analyticsProcessingAllowed'),
    marketingAllowed: safePrivacyCall(api, 'marketingAllowed'),
    preferencesProcessingAllowed: safePrivacyCall(api, 'preferencesProcessingAllowed'),
    saleOfDataAllowed: safePrivacyCall(api, 'saleOfDataAllowed'),
  };
}

function safePrivacyCall(api, key) {
  try {
    return typeof api[key] === 'function' ? api[key]() : undefined;
  } catch {
    return undefined;
  }
}

function safeInitData() {
  const initData = typeof init !== 'undefined' && init ? init.data || init : {};
  const shop = initData.shop || {};
  return {
    shop: {
      name: asString(shop.name),
      myshopifyDomain: asString(shop.myshopifyDomain),
      storefrontUrl: asString(shop.storefrontUrl),
      countryCode: asString(shop.countryCode),
      currencyCode: asString(shop.paymentSettings && shop.paymentSettings.currencyCode),
    },
    hasCustomer: Boolean(initData.customer),
    hasCart: Boolean(initData.cart),
    hasCheckout: Boolean(initData.checkout),
    productVariantCount: Array.isArray(initData.productVariants) ? initData.productVariants.length : 0,
  };
}

function sourceFromReferrer(referrer) {
  const host = hostFromUrl(referrer);
  if (!host || host.includes('trinitybatco.com')) return '';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('facebook')) return 'facebook';
  if (host.includes('threads.net')) return 'meta';
  if (host.includes('google')) return 'google';
  if (host.includes('bing')) return 'bing';
  if (host.includes('duckduckgo')) return 'duckduckgo';
  if (host.includes('yahoo')) return 'yahoo';
  return host.replace(/^www\./, '');
}

function mediumFromReferrer(referrer) {
  const host = hostFromUrl(referrer);
  if (!host || host.includes('trinitybatco.com')) return '';
  if (/(instagram|facebook|threads\.net|tiktok|pinterest|x\.com|twitter)/i.test(host)) return 'social';
  if (/(google|bing|duckduckgo|yahoo)/i.test(host)) return 'organic';
  return 'referral';
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathFromUrl(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return '';
  }
}

function safeContext(context) {
  const safeContextSource = context || {};
  const documentContext = safeContextSource.document || {};
  const navigatorContext = safeContextSource.navigator || {};
  const windowContext = safeContextSource.window || {};
  const location = documentContext.location || {};
  return {
    document: {
      title: asString(documentContext.title),
      location: asString(location.href || documentContext.URL || documentContext.url),
      referrer: asString(documentContext.referrer),
    },
    navigator: {
      userAgent: asString(navigatorContext.userAgent),
      language: asString(navigatorContext.language),
    },
    window: {
      innerWidth: windowContext.innerWidth,
      innerHeight: windowContext.innerHeight,
    },
  };
}

function safeEventData(event) {
  const data = event.data || event.customData || {};
  if (event.name === 'checkout_completed' || event.name.startsWith('checkout_')) {
    const checkout = data.checkout || {};
    const order = checkout.order || {};
    const shippingLine = checkout.shippingLine;
    let safeShippingLine;
    if (shippingLine) {
      safeShippingLine = {
        price: shippingLine.price,
        title: shippingLine.title,
      };
    }
    return {
      checkout: {
        token: checkout.token,
        order: {
          id: order.id,
          name: order.name || order.orderNumber,
        },
        currencyCode: checkout.currencyCode,
        totalPrice: checkout.totalPrice,
        subtotalPrice: checkout.subtotalPrice,
        totalTax: checkout.totalTax,
        shippingLine: safeShippingLine,
        lineItems: safeLineItems(checkout.lineItems),
      },
    };
  }

  if (event.name === 'product_viewed') {
    return {
      productVariant: safeVariant(data.productVariant),
    };
  }

  if (event.name === 'product_added_to_cart' || event.name === 'product_removed_from_cart') {
    return {
      cartLine: safeCartLine(data.cartLine),
    };
  }

  if (event.name === 'cart_viewed') {
    const cart = data.cart || {};
    return {
      cart: {
        id: cart.id,
        cost: cart.cost,
        lines: safeLineItems(cart.lines),
      },
    };
  }

  if (event.name === 'collection_viewed') {
    const collection = data.collection || {};
    return {
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
      },
    };
  }

  if (event.name === 'search_submitted') {
    const searchResult = data.searchResult || {};
    return {
      searchResult: {
        query: searchResult.query || data.query || '',
      },
    };
  }

  return safeCustomData(data);
}

function safeLineItems(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 100).map((line) => ({
    id: line.id,
    title: line.title,
    quantity: line.quantity,
    cost: line.cost,
    merchandise: safeVariant(line.merchandise || line.variant),
  }));
}

function safeCartLine(line) {
  if (!line) return undefined;
  return {
    id: line.id,
    title: line.title,
    quantity: line.quantity,
    cost: line.cost,
    merchandise: safeVariant(line.merchandise || line.variant),
  };
}

function safeVariant(variant) {
  if (!variant) return undefined;
  let safeProduct;
  if (variant.product) {
    safeProduct = {
      id: variant.product.id,
      title: variant.product.title,
      handle: variant.product.handle,
      type: variant.product.type,
      vendor: variant.product.vendor,
    };
  }
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
    price: variant.price,
    product: safeProduct,
  };
}

function safeCustomData(data) {
  if (!data || typeof data !== 'object') return {};
  const copy = {};
  for (const [key, value] of Object.entries(data).slice(0, 30)) {
    if (/email|phone|address|firstName|lastName/i.test(key)) continue;
    copy[key] = typeof value === 'object' ? safeJsonCopy(value) : value;
  }
  return copy;
}

function safeJsonCopy(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function inferDevice(userAgent) {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|android/i.test(userAgent)) return 'mobile';
  return userAgent ? 'desktop' : '';
}

function makeId(prefix) {
  let random = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    random = crypto.randomUUID();
  }
  return `${prefix}-${random}`;
}

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}
