import '@shopify/ui-extensions';

// @ts-expect-error: Shopify generates this module augmentation for the extension entry point.
declare module './src/PrintActionExtension.jsx' {
  const shopify: import('@shopify/ui-extensions/admin.order-details.print-action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
