// Egyptian Tax Authority (ETA) & Electronic Receipt Helper
// منظومة الإيصال والفاتورة الضريبية الإلكترونية - مصلحة الضرائب المصرية

export interface TaxReceiptData {
  restaurantName: string;
  restaurantLogo?: string;
  taxNumber?: string; // الرقم الضريبي (9 أرقام)
  commercialRegistration?: string; // السجل التجاري
  branchAddress?: string;
  branchPhone?: string;
  invoiceNumber: string; // رقم الفاتورة / الإيصال
  dailyOrderNumber?: number | string; // رقم الأوردر اليومي
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber?: string | number | null;
  cashierName?: string;
  dateTime: Date | string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
    options?: Array<{ name: string; price: number }>;
  }>;
  subtotal: number; // المبلغ قبل الضريبة
  taxRate: number; // نسبة ضريبة القيمة المضافة (14% افتراضياً)
  taxAmount: number; // قيمة ضريبة القيمة المضافة
  serviceFeeRate?: number; // نسبة رسم الخدمة إن وجدت
  serviceFeeAmount?: number; // قيمة رسم الخدمة
  deliveryFee?: number; // رسوم التوصيل
  discountAmount?: number; // قيمة الخصم
  finalTotal: number; // الإجمالي الشامل للضريبة
  paymentMethod: 'cash' | 'card' | 'wallet' | 'unpaid';
  amountPaid?: number;
  changeDue?: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
}

// Generate TLV (Tag-Length-Value) Base64 String for Egyptian Tax & E-Receipt Standard
function toTlvTag(tagNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const tagBytes = new Uint8Array(2 + valueBytes.length);
  tagBytes[0] = tagNumber;
  tagBytes[1] = valueBytes.length;
  tagBytes.set(valueBytes, 2);
  return tagBytes;
}

export function generateEtaTaxQrCode(data: {
  sellerName: string;
  taxNumber: string;
  invoiceDateTime: string;
  totalWithVat: number;
  vatTotal: number;
  invoiceUuidOrNumber: string;
}): string {
  try {
    const sellerTag = toTlvTag(1, data.sellerName || 'Qrieta Restaurant');
    const taxNumberTag = toTlvTag(2, data.taxNumber || '000-000-000');
    const timestampTag = toTlvTag(3, data.invoiceDateTime || new Date().toISOString());
    const totalTag = toTlvTag(4, data.totalWithVat.toFixed(2));
    const vatTag = toTlvTag(5, data.vatTotal.toFixed(2));

    const totalLength = sellerTag.length + taxNumberTag.length + timestampTag.length + totalTag.length + vatTag.length;
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    [sellerTag, taxNumberTag, timestampTag, totalTag, vatTag].forEach(tag => {
      combined.set(tag, offset);
      offset += tag.length;
    });

    // Convert to binary string then btoa
    let binary = '';
    const bytes = new Uint8Array(combined);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    // Fallback JSON-encoded string for maximum device compatibility
    return JSON.stringify({
      eta_compliance: "ETA-E-RECEIPT-EGY",
      seller: data.sellerName,
      tax_id: data.taxNumber,
      date: data.invoiceDateTime,
      total: data.totalWithVat.toFixed(2) + " EGP",
      vat: data.vatTotal.toFixed(2) + " EGP",
      inv_ref: data.invoiceUuidOrNumber
    });
  }
}

// Generate formatted sequential invoice number
export function generateInvoiceNumber(prefix: string = 'INV', sequenceNum: number = 1): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const cleanPrefix = (prefix || 'INV').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanPrefix}-${year}${month}${day}-${String(sequenceNum).padStart(4, '0')}`;
}
