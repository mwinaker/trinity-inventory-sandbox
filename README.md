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

## Build Check

```sh
npm run build
```

## Stable Hosting

This repo is prepared for stable hosting on a Docker-friendly platform such as Render or Railway. The app serves the React build and Express Shopify API from one container, which avoids the flaky temporary tunnel issue inside Shopify admin.

Required environment variables:

- `SHOPIFY_SHOP`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_API_VERSION` (optional, defaults to `2026-01`)

Render:

1. Create a new web service from this GitHub repo.
2. Let Render use the included `render.yaml` and `Dockerfile`.
3. Add the Shopify environment variables in the service dashboard.
4. Deploy and copy the public `onrender.com` URL.
5. Update the Shopify app URLs in Dev Dashboard to the new stable host.

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

## Shopify Connection Status

- Embedded Shopify app creation is complete.
- The current blocker is replacing the temporary Cloudflare quick tunnel with a stable public host so writes inside the embedded admin app are reliable.
- Once the hosted URL is live, update the embedded app URL and redirect URLs in Shopify Dev Dashboard and redeploy the app version.
