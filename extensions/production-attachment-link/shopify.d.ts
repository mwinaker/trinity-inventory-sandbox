import '@shopify/ui-extensions';

// @ts-expect-error: Shopify generates this module augmentation for the extension entry point.
declare module './src/BlockExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.order-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
