# Customer Behavior Tracking Setup

This setup covers the first three conversion-visibility items:

1. Capture first source, last source, landing page, campaign, device, session ID, and path behavior.
2. Attach attribution back to Shopify orders.
3. Forward ecommerce events to GA4 when GA4 credentials are configured.
4. Preserve the new Facebook/Instagram by Meta integration signals now connected through Shopify.

## What is built

The isolated analytics collector service exposes:

```text
POST /api/analytics/events
```

The endpoint receives Shopify Customer Events, stores session journeys in Shopify Admin metaobjects, and writes checkout attribution back to completed Shopify orders as `trinity` metafields. It is deployed separately from the inventory tool on Render as `trinity-analytics-collector`.

It also forwards mapped ecommerce events to GA4 via Measurement Protocol when these environment variables are present:

```text
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your_ga4_measurement_protocol_secret
```

Expected production collector URL:

```text
https://trinity-analytics-collector.onrender.com/api/analytics/events
```

## Shopify Customer Events Pixel

Paste this file into Shopify Admin:

```text
shopify/customer-events/trinity-attribution-pixel.js
```

Admin path:

```text
Shopify Admin > Settings > Customer events > Add custom pixel
```

The pixel subscribes to Shopify standard events including:

- `page_viewed`
- `collection_viewed`
- `product_viewed`
- `product_added_to_cart`
- `cart_viewed`
- `checkout_started`
- `checkout_address_info_submitted`
- `checkout_shipping_info_submitted`
- `payment_info_submitted`
- `checkout_completed`
- `search_submitted`

It also subscribes to custom Trinity events.

The current live Shopify pixel is `Trinity Attribution` (`149749999`). It forwards to the
Render-hosted collector only; it does not fire a second Meta Pixel event. The official
Facebook & Instagram by Meta channel is responsible for Meta Pixel, Advanced Matching,
and Conversions API delivery.

## Facebook, Instagram, and Meta Signals

The pixel now attaches the connected Meta/Shopify integration metadata to each collector
event:

- Meta dataset: `Trinity Bat Co. Website` / `1374607114874716`
- Meta business portfolio ID: `146456319986758`
- Facebook Page: `Trinity Bat Co.` / `108347050647653`
- Instagram account: `@trinitybatco`
- Shopify data sharing level: `Enhanced`
- Official channel capabilities: Meta Pixel, Advanced Matching, and Conversions API

The pixel also captures attribution identifiers that Shopify and Meta expose in the
browser event context:

- UTMs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`
- Meta click IDs: `fbclid` and `igshid`
- Other paid-channel click IDs: `gclid`, `gbraid`, `wbraid`, `msclkid`, `ttclid`, `twclid`, `li_fat_id`
- Meta cookies: `_fbp` and `_fbc`
- Shopify attribution cookies: `_shopify_y`, `_shopify_s`, `_shopify_sa_p`, `_shopify_sa_t`, `_landing_page`, `_orig_referrer`
- Shopify event IDs/client IDs and the Shopify consent snapshot when available

The backend stores these on the customer session metaobject payload, the compact event
journey, and completed-order `trinity.attribution` metafield. Contact fields are still
trimmed from the pixel payload; checkout email is only stored as a SHA-256 hash on the
collector.

## Customizer Events

Shopify standard events do not know when a visitor starts interacting with a custom bat builder. For that, add this storefront script to the live theme:

```text
shopify/theme/trinity-custom-behavior-events.js
```

It publishes:

- `trinity_product_cta_clicked`
- `trinity_product_form_submitted`
- `trinity_product_option_changed`
- `trinity_customizer_started`
- `trinity_customizer_option_changed`

Those custom events are then picked up by the Customer Events pixel and forwarded to the analytics collector and GA4.

The publisher avoids sending obvious contact fields and reports typed custom text as a length marker instead of the raw value.

## Shopify Order Metafields

When `checkout_completed` fires and Shopify provides the order ID, the backend writes:

- `trinity.attribution` as JSON
- `trinity.first_source`
- `trinity.first_medium`
- `trinity.first_campaign`
- `trinity.first_landing_page`
- `trinity.last_source`
- `trinity.last_medium`
- `trinity.last_campaign`
- `trinity.last_landing_page`
- `trinity.customer_session_id`

This lets us inspect a Shopify order and see where the shopper came from and what happened before purchase.

## Stored Session Journeys

The backend stores anonymous sessions as Shopify metaobjects:

```text
$app:trinity_customer_session
```

Each record includes:

- session ID
- visitor ID
- first touch source/campaign/landing page/referrer
- last touch source/campaign/landing page/referrer
- device
- last event
- order ID/name when purchase happens
- Meta dataset/business/page/Instagram connection metadata
- first and last Meta click ID, latest Meta browser/click cookies, Shopify client ID
- a sanitized tracking-ID map and consent snapshot
- a capped event journey

## GA4 Event Mapping

The backend maps Shopify events to GA4 ecommerce events:

| Shopify event | GA4 event |
| --- | --- |
| `page_viewed` | `page_view` |
| `collection_viewed` | `view_item_list` |
| `product_viewed` | `view_item` |
| `product_added_to_cart` | `add_to_cart` |
| `cart_viewed` | `view_cart` |
| `checkout_started` | `begin_checkout` |
| `checkout_address_info_submitted` | `add_shipping_info` |
| `checkout_shipping_info_submitted` | `add_shipping_info` |
| `payment_info_submitted` | `add_payment_info` |
| `checkout_completed` | `purchase` |
| `search_submitted` | `search` |
| `trinity_customizer_started` | `trinity_customizer_started` |
| `trinity_customizer_option_changed` | `trinity_customizer_option_changed` |
| `trinity_product_cta_clicked` | `trinity_product_cta_clicked` |
| `trinity_product_form_submitted` | `trinity_product_form_submitted` |
| `trinity_product_option_changed` | `trinity_product_option_changed` |

## Session Report Export

Run this from the repo to export captured session journeys from Shopify metaobjects:

```sh
npm run analytics:report
```

Outputs are written to:

```text
reports/analytics/
```

The export includes JSON, CSV, and Markdown files with source, campaign, landing page, device, event counts, product views, customizer activity, checkout starts, purchases, and a compact journey string per session.

The export also includes Meta/Facebook/Instagram tracking columns for dataset ID,
business ID, Facebook Page ID, Instagram handle, data-sharing preference, first/last
Meta click IDs, `_fbp`, `_fbc`, Shopify client ID, tracking IDs, browser cookies, and
consent state.

## UTM Link Discipline

Use this playbook for campaign links:

```text
docs/TRINITY_UTM_PLAYBOOK.md
```

Every social bio, story, post, email, QR code, partner link, and paid placement should use consistent `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` values so a visitor's journey can be tied back to the exact placement that drove the click.

## What still requires admin access

These cannot be fully activated from the existing private app token:

- Creating/enabling the Shopify custom pixel.
- Adding the customizer publisher script to the live theme.
- Pasting updates to `shopify/customer-events/trinity-attribution-pixel.js` into the existing `Trinity Attribution` custom pixel.
- Creating the separate `trinity-analytics-collector` Render service if the Render blueprint does not create it automatically.
- Adding `TRINITY_ANALYTICS_SHOPIFY_ADMIN_ACCESS_TOKEN` from a separate Shopify custom app or app installation. Do not reuse the inventory app's `SHOPIFY_ADMIN_ACCESS_TOKEN`, because both services would keep sharing the same Shopify Admin API throttle bucket.
- Adding GA4 Measurement Protocol credentials to the analytics collector Render service.

The current app token has order/product/metaobject access but does not have theme write or report scopes.
