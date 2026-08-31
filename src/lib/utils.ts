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
  deliveryNotes?: string;
}

export function parseOrderDeliveryInfo(order: any): DeliveryInfo {
  // If no table_id or tables is null/empty, or any item note contains delivery tag
  let isDelivery = !order?.table_id && (!order?.tables || !order?.tables?.table_number);
  let customerName = '';
  let phone = '';
  let address = '';
  let deliveryNotes = '';

  const items = order?.order_items || [];
  for (const item of items) {
    const note = item?.notes || '';
    if (note.includes('دليفري') || note.includes('توصيل') || note.includes('delivery')) {
      isDelivery = true;
    }
    
    // Parse regex patterns: [🛵 دليفري | الاسم: X | هاتف: Y | العنوان: Z | ملاحظات: W]
    const nameMatch = note.match(/الاسم:\s*([^|\]]+)/);
    if (nameMatch && !customerName) customerName = nameMatch[1].trim();

    const phoneMatch = note.match(/(?:هاتف|تليفون|موبايل|واتساب|Phone):\s*([^|\]]+)/i);
    if (phoneMatch && !phone) phone = phoneMatch[1].trim();

    const addressMatch = note.match(/(?:العنوان|Address):\s*([^|\]]+)/i);
    if (addressMatch && !address) address = addressMatch[1].trim();

    const notesMatch = note.match(/(?:ملاحظات التوصيل|ملاحظات|Notes):\s*([^|\]]+)/i);
    if (notesMatch && !deliveryNotes) deliveryNotes = notesMatch[1].trim();
  }

  return {
    isDelivery,
    customerName: customerName || undefined,
    phone: phone || undefined,
    address: address || undefined,
    deliveryNotes: deliveryNotes || undefined
  };
}

export function cleanItemNotes(note?: string | null): string {
  if (!note) return '';
  // Remove delivery header if present e.g. "[🛵 دليفري | ...]"
  return note.replace(/\[🛵?\s*دليفري[^\]]*\]\s*[-–—]?\s*/g, '').trim();
}
