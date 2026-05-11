# Customer Behavior Tracking Setup

This setup covers the first three conversion-visibility items:

1. Capture first source, last source, landing page, campaign, device, session ID, and path behavior.
2. Attach attribution back to Shopify orders.
3. Forward ecommerce events to GA4 when GA4 credentials are configured.

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

## Customizer Events

Shopify standard events do not know when a visitor starts interacting with a custom bat builder. For that, add this storefront script to the live theme:

```text
shopify/theme/trinity-custom-behavior-events.js
```

It publishes:

- `trinity_customizer_started`
- `trinity_customizer_option_changed`

Those custom events are then picked up by the Customer Events pixel and forwarded to the analytics collector and GA4.

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

## What still requires admin access

These cannot be fully activated from the existing private app token:

- Creating/enabling the Shopify custom pixel.
- Adding the customizer publisher script to the live theme.
- Creating the separate `trinity-analytics-collector` Render service if the Render blueprint does not create it automatically.
- Adding GA4 Measurement Protocol credentials to the analytics collector Render service.

The current app token has order/product/metaobject access but does not have theme write or report scopes.
