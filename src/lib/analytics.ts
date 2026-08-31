// Facebook Pixel & Marketing Tracking Helper for Qrieta

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    dataLayer?: any[];
  }
}

let initializedPixelId: string | null = null;

export function initMetaPixel(pixelId?: string) {
  if (!pixelId || typeof window === 'undefined') return;
  if (initializedPixelId === pixelId) return;

  try {
    /* eslint-disable */
    (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */

    if (window.fbq) {
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      initializedPixelId = pixelId;
      console.log(`[Qrieta Pixel] Meta Pixel initialized successfully for ID: ${pixelId}`);
    }
  } catch (err) {
    console.warn('[Qrieta Pixel] Meta Pixel initialization failed:', err);
  }
}

export function trackMetaEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq('track', eventName, params);
      console.log(`[Qrieta Pixel] Event: ${eventName}`, params);
    } catch (e) {
      console.warn(`[Qrieta Pixel] Error tracking ${eventName}:`, e);
    }
  }
}

export function trackViewContent(product: { id: string; name_ar: string; name_en?: string; price: number; category?: string }) {
  trackMetaEvent('ViewContent', {
    content_name: product.name_ar || product.name_en,
    content_ids: [product.id],
    content_type: 'product',
    value: product.price,
    currency: 'EGP',
  });
}

export function trackAddToCart(item: { name: string; id: string; price: number; quantity: number }) {
  trackMetaEvent('AddToCart', {
    content_name: item.name,
    content_ids: [item.id],
    content_type: 'product',
    value: item.price * item.quantity,
    currency: 'EGP',
    num_items: item.quantity,
  });
}

export function trackPurchase(order: { id: number | string; total: number; itemsCount: number; restaurantName?: string }) {
  trackMetaEvent('Purchase', {
    content_type: 'restaurant_order',
    value: order.total,
    currency: 'EGP',
    num_items: order.itemsCount,
    order_id: String(order.id),
  });
}

export function trackCallWaiter(tableNumber?: string) {
  trackMetaEvent('Contact', {
    content_name: 'Call Waiter',
    table_number: tableNumber,
  });
}
