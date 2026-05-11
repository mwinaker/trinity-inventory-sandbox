// Trinity Bat Co. Customer Events custom pixel
// Paste this in Shopify Admin > Settings > Customer events > Add custom pixel.
// It forwards Shopify's customer event stream to the Trinity inventory backend.

const TRINITY_COLLECTOR_URL =
  'https://trinity-billet-inventory.onrender.com/api/analytics/events';
const TRINITY_ATTRIBUTION_KEY = 'trinity_attribution_v1';
const TRINITY_SESSION_KEY = 'trinity_session_v1';
const TRINITY_VISITOR_KEY = 'trinity_visitor_v1';
const TRINITY_PATH_LIMIT = 50;
const TRINITY_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

analytics.subscribe('all_standard_events', (event) => {
  trackTrinityEvent(event);
});

analytics.subscribe('all_custom_events', (event) => {
  trackTrinityEvent(event);
});

async function trackTrinityEvent(event) {
  try {
    const attribution = await buildTrinityAttribution(event);
    const payload = {
      id: event.id,
      name: event.name,
      timestamp: event.timestamp,
      clientId: event.clientId,
      sessionId: attribution.sessionId,
      visitorId: attribution.visitorId,
      attribution,
      context: safeContext(event.context),
      data: safeEventData(event),
    };

    await fetch(TRINITY_COLLECTOR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn('Trinity analytics pixel failed', error);
  }
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
  const source = params.utm_source || sourceFromReferrer(referrer) || 'direct';
  const medium = params.utm_medium || mediumFromReferrer(referrer) || 'direct';
  return {
    source,
    medium,
    campaign: params.utm_campaign || '',
    content: params.utm_content || '',
    term: params.utm_term || '',
    landingPage: href,
    referrer,
    capturedAt,
  };
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
    return {
      utm_source: asString(searchParams.get('utm_source')),
      utm_medium: asString(searchParams.get('utm_medium')),
      utm_campaign: asString(searchParams.get('utm_campaign')),
      utm_content: asString(searchParams.get('utm_content')),
      utm_term: asString(searchParams.get('utm_term')),
    };
  } catch {
    return {};
  }
}

function sourceFromReferrer(referrer) {
  const host = hostFromUrl(referrer);
  if (!host || host.includes('trinitybatco.com')) return '';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('facebook')) return 'facebook';
  if (host.includes('google')) return 'google';
  if (host.includes('bing')) return 'bing';
  if (host.includes('duckduckgo')) return 'duckduckgo';
  if (host.includes('yahoo')) return 'yahoo';
  return host.replace(/^www\./, '');
}

function mediumFromReferrer(referrer) {
  const host = hostFromUrl(referrer);
  if (!host || host.includes('trinitybatco.com')) return '';
  if (/(instagram|facebook|tiktok|pinterest|x\.com|twitter)/i.test(host)) return 'social';
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
  const documentContext = context?.document || {};
  const navigatorContext = context?.navigator || {};
  const windowContext = context?.window || {};
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
    return {
      checkout: {
        token: data.checkout?.token,
        order: {
          id: data.checkout?.order?.id,
          name: data.checkout?.order?.name || data.checkout?.order?.orderNumber,
        },
        currencyCode: data.checkout?.currencyCode,
        totalPrice: data.checkout?.totalPrice,
        subtotalPrice: data.checkout?.subtotalPrice,
        totalTax: data.checkout?.totalTax,
        shippingLine: data.checkout?.shippingLine
          ? {
              price: data.checkout.shippingLine.price,
              title: data.checkout.shippingLine.title,
            }
          : undefined,
        lineItems: safeLineItems(data.checkout?.lineItems),
      },
    };
  }

  if (event.name === 'product_viewed') {
    return {
      productVariant: safeVariant(data.productVariant),
    };
  }

  if (event.name === 'product_added_to_cart') {
    return {
      cartLine: safeCartLine(data.cartLine),
    };
  }

  if (event.name === 'cart_viewed') {
    return {
      cart: {
        id: data.cart?.id,
        cost: data.cart?.cost,
        lines: safeLineItems(data.cart?.lines),
      },
    };
  }

  if (event.name === 'collection_viewed') {
    return {
      collection: {
        id: data.collection?.id,
        title: data.collection?.title,
        handle: data.collection?.handle,
      },
    };
  }

  if (event.name === 'search_submitted') {
    return {
      searchResult: {
        query: data.searchResult?.query || data.query || '',
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
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
    price: variant.price,
    product: variant.product
      ? {
          id: variant.product.id,
          title: variant.product.title,
          handle: variant.product.handle,
          type: variant.product.type,
          vendor: variant.product.vendor,
        }
      : undefined,
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
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}
