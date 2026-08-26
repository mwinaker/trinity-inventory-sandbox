# Production attachment

This Shopify Admin block appears on Order details pages. It retrieves the open
order's internal production attachment through the Trinity app backend and
renders a direct **View / print attachment** link in a new tab.

The backend requires a signed Shopify staff session and returns only trusted
Shopify CDN file URLs. It does not add attachment links to customer-facing
order data or storefront pages.
