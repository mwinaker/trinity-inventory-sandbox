// Trinity Bat Co. storefront behavior publisher
// Add this to the live theme when we want customizer-specific events in Shopify Customer Events.
// The custom pixel in shopify/customer-events/trinity-attribution-pixel.js subscribes to these.

(function () {
  const CUSTOMIZER_SELECTOR =
    '[data-trinity-customizer], .customizer, [class*="customizer"], [id*="customizer"], [class*="builder"], [id*="builder"]';
  const PRODUCT_FORM_SELECTOR =
    'form[action*="/cart/add"], product-form form, .product-form form, form[data-type="add-to-cart-form"]';
  const PRODUCT_AREA_SELECTOR =
    '[data-product], product-info, .product, .product__info-container, .product-form, main';
  const CTA_SELECTOR =
    'a[href], button, [role="button"], input[type="button"], input[type="submit"]';
  let customizerStarted = false;
  const publishedOptionKeys = new Map();

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
    const label =
      element.closest('label') ||
      (element.id ? document.querySelector(`label[for="${cssEscape(element.id)}"]`) : null) ||
      element.closest('fieldset')?.querySelector('legend');
    return cleanText(label ? label.textContent : element.name || element.id || '').slice(0, 120);
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

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function buttonText(element) {
    if (!element) return '';
    return cleanText(
      element.textContent ||
        element.getAttribute('aria-label') ||
        element.getAttribute('value') ||
        element.getAttribute('title') ||
        '',
    );
  }

  function isProductPage() {
    return window.location.pathname.includes('/products/');
  }

  function isCustomizerTrigger(element) {
    const text = buttonText(element).toLowerCase();
    const href = element?.getAttribute?.('href') || '';
    return (
      Boolean(element?.closest?.(CUSTOMIZER_SELECTOR)) ||
      /custom|customize|build|builder/.test(text) ||
      /custom|customize|build|builder/.test(href)
    );
  }

  function shouldTrackProductCta(element) {
    if (!element) return false;
    const text = buttonText(element).toLowerCase();
    const href = element.getAttribute?.('href') || '';
    if (isCustomizerTrigger(element)) return true;
    if (element.closest(PRODUCT_FORM_SELECTOR)) return true;
    if (text.includes('add to cart') || text.includes('buy now') || text.includes('shop pay')) return true;
    if (href.includes('/products/') || href.includes('/collections/')) return true;
    return false;
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
      const cta = target.closest(CTA_SELECTOR);
      if (!cta || !shouldTrackProductCta(cta)) return;

      publish('trinity_product_cta_clicked', {
        ctaText: buttonText(cta).slice(0, 120),
        ctaHref: cta.getAttribute('href') || '',
        isProductPage: isProductPage(),
        ...productContext(),
      });

      if (isCustomizerTrigger(cta)) {
        markCustomizerStarted('click');
      }
    },
    true,
  );

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !form.closest(PRODUCT_FORM_SELECTOR)) return;
      publish('trinity_product_form_submitted', {
        formAction: form.getAttribute('action') || '',
        ...productContext(),
      });
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
      const inProductArea = target.closest(PRODUCT_AREA_SELECTOR);
      if (!inProductForm && !inCustomizer && !inProductArea) return;
      if (!shouldTrackControl(target)) return;

      const payload = {
        optionName: closestLabelText(target),
        optionValue: safeControlValue(target),
        inputName: target.name || '',
        inputType: target.type || target.tagName.toLowerCase(),
        ...productContext(),
      };
      const eventName = inCustomizer || isCustomizerTrigger(target)
        ? 'trinity_customizer_option_changed'
        : 'trinity_product_option_changed';
      const dedupeKey = `${eventName}:${payload.optionName}:${payload.optionValue}:${payload.inputName}`;
      const lastPublished = publishedOptionKeys.get(dedupeKey) || 0;
      if (Date.now() - lastPublished < 1000) return;

      publishedOptionKeys.set(dedupeKey, Date.now());
      if (eventName === 'trinity_customizer_option_changed') markCustomizerStarted('option_change');
      publish(eventName, payload);
    },
    true,
  );

  function shouldTrackControl(element) {
    if (element.disabled) return false;
    const type = String(element.type || '').toLowerCase();
    if (['hidden', 'password', 'email', 'tel', 'file'].includes(type)) return false;
    if (element.name && /^utf8$|^form_type$|^id$/i.test(element.name)) return false;
    return true;
  }

  function safeControlValue(element) {
    const type = String(element.type || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return String(element.checked);
    if (element instanceof HTMLSelectElement) {
      return cleanText(element.options[element.selectedIndex]?.text || element.value).slice(0, 120);
    }
    if (['text', 'search', 'textarea'].includes(type) || element instanceof HTMLTextAreaElement) {
      return element.value ? `[text:${String(element.value).length}]` : '';
    }
    return cleanText(element.value).slice(0, 120);
  }
})();
