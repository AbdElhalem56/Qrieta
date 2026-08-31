import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale: 'ar-EG' | 'en-US' = 'ar-EG') {
  if (locale === 'ar-EG') {
    return `${amount.toLocaleString('ar-EG')} جـ`;
  }
  return `${amount.toLocaleString('en-US')} LE`;
}

export interface DeliveryInfo {
  isDelivery: boolean;
  customerName?: string;
  phone?: string;
  address?: string;
  deliveryZone?: string;
  deliveryFee?: number;
  deliveryNotes?: string;
  locationUrl?: string;
  coordinates?: { lat: number; lng: number };
}

export function parseOrderDeliveryInfo(order: any): DeliveryInfo {
  // If no table_id or tables is null/empty, or any item note contains delivery tag
  let isDelivery = !order?.table_id && (!order?.tables || !order?.tables?.table_number);
  let customerName = '';
  let phone = '';
  let address = '';
  let deliveryZone = '';
  let deliveryFee = 0;
  let deliveryNotes = '';
  let locationUrl = '';
  let coordinates: { lat: number; lng: number } | undefined = undefined;

  const items = order?.order_items || [];
  for (const item of items) {
    const note = item?.notes || '';
    if (note.includes('دليفري') || note.includes('توصيل') || note.includes('delivery')) {
      isDelivery = true;
    }
    
    // Parse regex patterns: [🛵 دليفري | المنطقة: X (+Y LE) | الاسم: X | هاتف: Y | العنوان: Z | لوكيشن: URL | ملاحظات: W]
    const zoneMatch = note.match(/(?:المنطقة|Zone|Area):\s*([^|\]\+]+)(?:\s*\(\+?([0-9.]+)[^)]*\))?/i);
    if (zoneMatch && !deliveryZone) {
      deliveryZone = zoneMatch[1].trim();
      if (zoneMatch[2]) {
        deliveryFee = parseFloat(zoneMatch[2]) || 0;
      }
    }

    const feeMatch = note.match(/(?:رسوم التوصيل|سعر التوصيل|Delivery Fee):\s*([0-9.]+)/i);
    if (feeMatch && !deliveryFee) {
      deliveryFee = parseFloat(feeMatch[1]) || 0;
    }

    const nameMatch = note.match(/الاسم:\s*([^|\]]+)/);
    if (nameMatch && !customerName) customerName = nameMatch[1].trim();

    const phoneMatch = note.match(/(?:هاتف|تليفون|موبايل|واتساب|Phone):\s*([^|\]]+)/i);
    if (phoneMatch && !phone) phone = phoneMatch[1].trim();

    const addressMatch = note.match(/(?:العنوان|Address):\s*([^|\]]+)/i);
    if (addressMatch && !address) address = addressMatch[1].trim();

    // Match location / GPS URLs or raw coordinates
    const mapUrlMatch = note.match(/(?:لوكيشن|الموقع|اللوكيشن|GPS|Maps|Location):\s*(https?:\/\/[^\s|\]]+)/i);
    if (mapUrlMatch && !locationUrl) {
      locationUrl = mapUrlMatch[1].trim();
    }

    const coordsMatch = note.match(/(?:إحداثيات|Coords|Coordinates):\s*([0-9.-]+)\s*,\s*([0-9.-]+)/i);
    if (coordsMatch && !coordinates) {
      const lat = parseFloat(coordsMatch[1]);
      const lng = parseFloat(coordsMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates = { lat, lng };
        if (!locationUrl) {
          locationUrl = `https://maps.google.com/?q=${lat},${lng}`;
        }
      }
    }

    const notesMatch = note.match(/(?:ملاحظات التوصيل|ملاحظات|Notes):\s*([^|\]]+)/i);
    if (notesMatch && !deliveryNotes) deliveryNotes = notesMatch[1].trim();
  }

  return {
    isDelivery,
    customerName: customerName || undefined,
    phone: phone || undefined,
    address: address || undefined,
    deliveryZone: deliveryZone || undefined,
    deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
    deliveryNotes: deliveryNotes || undefined,
    locationUrl: locationUrl || undefined,
    coordinates
  };
}

export function cleanItemNotes(note?: string | null): string {
  if (!note) return '';
  // Remove delivery header if present e.g. "[🛵 دليفري | ...]"
  return note.replace(/\[🛵?\s*دليفري[^\]]*\]\s*[-–—]?\s*/g, '').trim();
}
