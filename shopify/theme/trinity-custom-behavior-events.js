// Trinity Bat Co. storefront behavior publisher
// Add this to the live theme when we want customizer-specific events in Shopify Customer Events.
// The custom pixel in shopify/customer-events/trinity-attribution-pixel.js subscribes to these.

(function () {
  const CUSTOMIZER_SELECTOR =
    '[data-trinity-customizer], .customizer, [class*="customizer"], [id*="customizer"]';
  const PRODUCT_FORM_SELECTOR =
    'form[action*="/cart/add"], product-form form, .product-form form';
  let customizerStarted = false;

  function publish(name, payload) {
    if (!window.Shopify || !Shopify.analytics || !Shopify.analytics.publish) return;
    Shopify.analytics.publish(name, {
      ...payload,
      path: window.location.pathname,
      url: window.location.href,
      title: document.title,
      publishedAt: new Date().toISOString(),
    });
  }

  function closestLabelText(element) {
    const label = element.closest('label') || document.querySelector(`label[for="${element.id}"]`);
    return (label ? label.textContent : element.name || element.id || '').trim().slice(0, 120);
  }

  function productContext() {
    const productTitle =
      document.querySelector('[data-product-title], .product__title, h1')?.textContent?.trim() || '';
    const productHandle = window.location.pathname.split('/products/')[1]?.split('/')[0] || '';
    return {
      productTitle,
      productHandle,
    };
  }

  function markCustomizerStarted(reason) {
    if (customizerStarted) return;
    customizerStarted = true;
    publish('trinity_customizer_started', {
      reason,
      ...productContext(),
    });
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const customizerElement = target.closest(CUSTOMIZER_SELECTOR);
      const customizerLink = target.closest('a[href*="custom"], a[href*="build"]');
      const customizerButton = target.closest('button, [role="button"], input[type="button"]');
      const buttonText = customizerButton?.textContent?.trim().toLowerCase() || '';

      if (
        customizerElement ||
        customizerLink ||
        buttonText.includes('custom') ||
        buttonText.includes('build your bat') ||
        buttonText.includes('build')
      ) {
        markCustomizerStarted('click');
      }
    },
    true,
  );

  document.addEventListener(
    'change',
    (event) => {
      const target = event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
        ? event.target
        : null;
      if (!target) return;

      const inProductForm = target.closest(PRODUCT_FORM_SELECTOR);
      const inCustomizer = target.closest(CUSTOMIZER_SELECTOR);
      if (!inProductForm && !inCustomizer) return;

      markCustomizerStarted('option_change');
      publish('trinity_customizer_option_changed', {
        optionName: closestLabelText(target),
        optionValue: target.type === 'checkbox' ? String(target.checked) : String(target.value || ''),
        inputName: target.name || '',
        inputType: target.type || target.tagName.toLowerCase(),
        ...productContext(),
      });
    },
    true,
  );
})();
