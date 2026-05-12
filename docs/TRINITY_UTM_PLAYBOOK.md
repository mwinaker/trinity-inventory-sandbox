# Trinity Traffic Attribution Playbook

This gives every public link a consistent fingerprint so Shopify, Trinity session metaobjects, and GA4 can agree on where a shopper came from and what happened next.

## Required UTM Fields

Use these five fields on every intentional campaign link:

| Field | Use | Examples |
| --- | --- | --- |
| `utm_source` | Where the click originated | `instagram`, `google`, `email`, `qr`, `partner` |
| `utm_medium` | The type of placement | `bio`, `story`, `post`, `reel`, `email`, `organic`, `paid`, `qr` |
| `utm_campaign` | The business push | `2026-05_custom_bats`, `2026-05_training_bats`, `2026_summer_showcase` |
| `utm_content` | The exact creative/link slot | `bio_primary`, `cs271_reel`, `homepage_story`, `booth_sign` |
| `utm_term` | Optional audience or keyword | `travel_ball`, `pro_model`, `training_center` |

Rules:

- Keep values lowercase.
- Use underscores instead of spaces.
- Do not reuse `utm_content` for different posts or placements.
- Every QR code, email button, creator link, player link, and social bio link should have UTMs.
- Product-specific links should land on the product page, not the homepage.

## Core Link Examples

Instagram bio to the main product decision page:

```text
https://trinitybatco.com/collections/game-bats?utm_source=instagram&utm_medium=bio&utm_campaign=2026-05_game_bats&utm_content=bio_primary
```

Instagram story straight to CS271:

```text
https://trinitybatco.com/products/cs271?utm_source=instagram&utm_medium=story&utm_campaign=2026-05_cs271&utm_content=story_cs271_demo
```

Email campaign to training bats:

```text
https://trinitybatco.com/collections/training-bats?utm_source=email&utm_medium=email&utm_campaign=2026-05_training_bats&utm_content=main_cta
```

QR code at an event:

```text
https://trinitybatco.com/collections/game-bats?utm_source=qr&utm_medium=event&utm_campaign=2026_summer_showcase&utm_content=booth_sign
```

## Reading Results

Run this locally from the repo to export the current session journey data:

```sh
npm run analytics:report
```

The exporter writes JSON, CSV, and Markdown reports under:

```text
reports/analytics/
```

Use the CSV for filtering individual sessions. Use the Markdown report for a quick funnel snapshot.

## What We Can Track Now

The Shopify Customer Events pixel captures:

- source, medium, campaign, content, term
- first landing page and last touch page
- device type
- page, collection, product, cart, checkout, purchase, and search events
- custom Trinity storefront events once the theme publisher is installed
- order attribution metafields when Shopify exposes the completed order ID

The theme publisher adds:

- product CTA clicks
- customizer starts
- product/customizer option changes
- product form submissions

## What Still Needs Platform Access Later

These are deliberately outside this non-Meta pass:

- Meta pixel setup
- Instagram bio/profile link updates
- Meta ad account conversion API setup
- Meta audiences or retargeting

Once those credentials are available, use the same UTM naming convention so Meta traffic joins the existing Shopify and GA4 reporting cleanly.
