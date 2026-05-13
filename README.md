# Trinity Inventory Sandbox

Internal Trinity Bat Company billet inventory, player profile, and produced-bat workflow app.

The current build already syncs internal records into Shopify admin metaobjects through a private app connection. It is not customer-facing and does not touch the storefront theme.

## Run Locally

```sh
npm ci
npm run build
npm run serve
```

Then open `http://127.0.0.1:4177`.

Export captured Shopify customer behavior sessions:

```sh
npm run analytics:report
```

## Build Check

```sh
npm run build
```

## Stable Hosting

This repo is prepared for stable hosting on a Docker-friendly platform such as Render or Railway. The inventory app serves the React build and Express Shopify API from one container, which avoids the flaky temporary tunnel issue inside Shopify admin.

The customer behavior collector is intentionally isolated as a second Render service from the same repo. It uses `Dockerfile.analytics`, runs `server/analytics-collector.mjs`, and receives Shopify Customer Events separately from the inventory UI/API.

Required environment variables:

- `SHOPIFY_SHOP`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_API_VERSION` (optional, defaults to `2026-01`)
- `TRINITY_ORDER_NOTIFICATION_EMAILS` (optional, comma-separated staff invoice BCC list; defaults to Matt, Jeremy, Stefan, and Keith at `trinitybats.com`; Matt is always included)
- `SHOPIFY_CURRENCY_CODE` (optional, defaults to `USD` for manual order unit-price overrides)
- `TRINITY_DRAFT_SHIPPING_TITLE` (optional, defaults to `Standard Shipping` for draft invoices)
- `TRINITY_DRAFT_SHIPPING_AMOUNT` (optional, defaults to `15.00`; set to `0` to let Shopify checkout rates handle shipping instead)
- `GA4_MEASUREMENT_ID` (analytics collector only; optional, enables server-side GA4 ecommerce forwarding)
- `GA4_API_SECRET` (analytics collector only; optional, required with `GA4_MEASUREMENT_ID`)
- `TRINITY_ANALYTICS_ALLOWED_ORIGINS` (analytics collector only; optional, defaults to `*` so Shopify's pixel sandbox can deliver events reliably)

Render:

1. Create a new web service from this GitHub repo.
2. Let Render use the included `render.yaml`.
3. Add the Shopify environment variables to `trinity-billet-inventory`.
4. Add the Shopify and optional GA4 environment variables to `trinity-analytics-collector`.
5. Deploy and copy the public `onrender.com` URLs.
6. Update the Shopify app URLs in Dev Dashboard to the inventory host.

Railway:

1. Create a new project from this GitHub repo.
2. Railway will detect the `Dockerfile`.
3. Add the Shopify environment variables.
4. Deploy and copy the public Railway URL.
5. Update the Shopify app URLs in Dev Dashboard to the stable host.

## Current Workflow

- Billet intake with barcode scanning, voice-assisted parsing, species, grade, MLB-capable flag, source, knot flag, location, and notes.
- Player and trainer profiles with multiple stored bat variations.
- Produced-bat repository with model, size, billet linkage, and modifications.
- Billet cost reference data for RJ's, Great Lakes Veneer, and Champeau.
- Shopify product catalog sync for matching internal bat records to live store products.
- Separate Shopify Customer Events collector for anonymous source/session attribution, order attribution metafields, and optional GA4 ecommerce forwarding.
- Customer session export tooling for source, campaign, landing page, device, product behavior, checkout, and purchase journey reporting.

## Shopify Connection Status

- Embedded Shopify app creation is complete.
- The current blocker is replacing the temporary Cloudflare quick tunnel with a stable public host so writes inside the embedded admin app are reliable.
- Once the hosted URL is live, update the embedded app URL and redirect URLs in Shopify Dev Dashboard and redeploy the app version.
